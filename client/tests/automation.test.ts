import assert from "node:assert/strict";
import { test } from "node:test";
import { automationDefaults, automationInput } from "@/shared/depth/automation";
import { automationForm } from "@/shared/depth/automation";
import type { AutomationView, MakerClient } from "@depthhq/maker-sdk";
import { automationWire } from "@depthhq/maker-sdk";
import { manualQuoteAllowed, readAutomation } from "@/shared/depth/automation";

test("automation forms preserve exact USDC amounts and validate quote and hedge limits before saving", () => {
  const input = automationInput({
    ...automationDefaults,
    capacity: "100.000001",
  });
  assert.equal(input.quote.maxCapacity, 100_000_001n);
  assert.equal(input.hedge, undefined);
  assert.throws(
    () => automationInput({ ...automationDefaults, capacity: "1e9" }),
    /amount/,
  );
  assert.throws(
    () => automationInput({ ...automationDefaults, refresh: "120" }),
    /precede/,
  );
  assert.throws(
    () =>
      automationInput({ ...automationDefaults, hedge: true, account: "wrong" }),
    /address/,
  );
  const hedged = automationInput({
    ...automationDefaults,
    hedge: true,
    account: `0x${"1".repeat(40)}`,
  });
  assert.equal(hedged.hedge!.policy.ratioBps, 10000);
  assert.equal(hedged.hedge!.policy.maxOrderNotional, 100000000n);
  assert.equal(hedged.hedge!.policy.maxUnhedgedMs, 90000);
  hedged.hedge!.policy.maxUnhedgedMs = 120000;
  hedged.hedge!.policy.batchMs = 3000;
  const profile = { config: automationWire(hedged) } as AutomationView;
  const saved = automationInput(automationForm(profile), profile);
  assert.equal(saved.hedge!.policy.maxUnhedgedMs, 120000);
  assert.equal(saved.hedge!.policy.batchMs, 3000);
});

test("manual quoting waits for automation to stop and funding to finish", () => {
  assert.equal(manualQuoteAllowed(null), true);
  for (const phase of ["configured", "paused"] as const) {
    const profile = { desired: "paused", phase } as AutomationView;
    assert.equal(manualQuoteAllowed(profile), true);
    assert.equal(manualQuoteAllowed({ ...profile, desired: "running" }), false);
    assert.equal(
      manualQuoteAllowed({
        ...profile,
        funding: { signature: "signature", lamports: "1", status: "pending" },
      }),
      false,
    );
  }
  for (const phase of ["starting", "running", "pausing", "blocked"] as const)
    assert.equal(
      manualQuoteAllowed({ desired: "paused", phase } as AutomationView),
      false,
    );
});

test("automation checks reuse authorization and background polling never opens the wallet", async () => {
  let authorized = false;
  let approvals = 0;
  const maker = {
    automation: {
      summary: async () => {
        if (!authorized)
          throw new Error("Authorize automation with your maker wallet");
        return null;
      },
      authorize: async () => {
        authorized = true;
        approvals++;
      },
    },
  } as unknown as Pick<MakerClient, "automation">;
  await assert.rejects(readAutomation(maker), /Authorize automation/);
  assert.equal(approvals, 0);
  assert.equal(await readAutomation(maker, true), null);
  assert.equal(await readAutomation(maker, true), null);
  assert.equal(approvals, 1);
  const failure = new Error("Maker worker is unavailable");
  maker.automation.summary = async () => {
    throw failure;
  };
  await assert.rejects(
    readAutomation(maker, true),
    (error) => error === failure,
  );
  assert.equal(approvals, 1);
});
