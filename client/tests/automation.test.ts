import assert from "node:assert/strict";
import { test } from "node:test";
import { automationDefaults, automationInput } from "@/shared/depth/automation";
import { automationForm } from "@/shared/depth/automation";
import type { AutomationView } from "@depthhq/maker-sdk";
import { automationWire } from "@depthhq/maker-sdk";

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
