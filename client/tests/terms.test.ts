import { test } from "node:test";
import assert from "node:assert/strict";
import { tradeFeeBps } from "@/shared/depth/terms";

test("the trader pays the base fee plus app fee with insurance already included", () => {
  const market = { fee_bps: 5, insurance_fee_bps: 1 };
  assert.equal(tradeFeeBps(market, { fee_bps: 0 }), 5);
  assert.equal(tradeFeeBps(market, { fee_bps: 1 }), 6);
  assert.equal(tradeFeeBps(market, { fee_bps: 2 }), 7);
  assert.throws(() => tradeFeeBps(market, { fee_bps: 3 }), /Invalid/);
  assert.throws(
    () => tradeFeeBps({ fee_bps: 5, insurance_fee_bps: 6 }, { fee_bps: 1 }),
    /Invalid/,
  );
});
