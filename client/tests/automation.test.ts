import assert from "node:assert/strict";
import { test } from "node:test";
import { automationDefaults, automationInput } from "@/shared/depth/automation";

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
});
