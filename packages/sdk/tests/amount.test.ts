import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAmount } from "@/trade/amount";

test("amount selectors resolve against the private basis with integer rounding", () => {
  assert.equal(resolveAmount("all", 1_000_001n, "reduction"), 1_000_001n);
  assert.equal(resolveAmount("25%", 1_000_001n, "reduction"), 250_000n);
  assert.equal(resolveAmount("12.3456%", 1_000_001n, "reduction"), 123_456n);
  assert.equal(resolveAmount(7n, 10n, "reduction"), 7n);
  for (const selector of ["0%", "100.0001%", "1.00001%", "-1%", "1e2%"])
    assert.throws(() =>
      resolveAmount(selector as `${number}%`, 100n, "reduction")
    );
  assert.throws(() => resolveAmount("1%", 1n, "reduction"));
  assert.throws(() => resolveAmount(11n, 10n, "reduction"));
});
