import { test } from "node:test";
import assert from "node:assert/strict";
import { tradeFeeBps, tradeMargin } from "@/shared/depth/terms";

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

test("additional margin must fit the known free balance with exact micro-USDC precision", () => {
  assert.equal(tradeMargin(125_000_000n, 125_000_000n), 125_000_000n);
  assert.equal(tradeMargin(1n, 1n), 1n);
  assert.throws(() => tradeMargin(125_000_001n, 125_000_000n), /exceeds/);
  assert.throws(() => tradeMargin(1n, 0n), /exceeds/);
  assert.throws(() => tradeMargin(0n, 125_000_000n), /positive/);
  assert.throws(() => tradeMargin(1n, undefined), /account balance/);
});

test("an idle market allocation can fund a trade without allocating the same margin twice", async () => {
  const { idleCollateral } = await import("@/shared/depth/terms");
  const position = {
    status: "ready" as const,
    id: "account",
    slot: 1,
    version: 1n,
    collateral: 20_000_000n,
    reserved: 3_000_000n,
    position: 0n,
  };
  assert.equal(idleCollateral(position), 17_000_000n);
  assert.equal(idleCollateral({ ...position, position: 1n }), 0n);
  assert.equal(idleCollateral({ ...position, status: "stale" }), 0n);
  assert.equal(idleCollateral({ ...position, reserved: 21_000_000n }), 0n);
  assert.equal(idleCollateral(undefined), 0n);
});
