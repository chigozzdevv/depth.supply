import assert from "node:assert/strict";
import { test } from "node:test";
import { replayFill, replayMargin, type ReplayState } from "@/history/replay";
import type { FillSnapshot } from "@/view/view";

const initial: ReplayState = {
  position: 0n,
  entryPriceE8: 0n,
  fundingCheckpoint: 0n,
  collateral: 200_000_000n,
};
const fill = (
  side: bigint,
  size: bigint,
  price: bigint,
  fee = 100_000n,
): FillSnapshot => ({
  id: "fill",
  status: "ready",
  slot: 1,
  side,
  size,
  executionPriceE8: price,
  fee,
  makerRebate: 25_000n,
});

test("history reconstructs integer entry basis, realized reductions, funding and reversals after a fresh start", () => {
  let state = replayFill(
    initial,
    fill(1n, 1_000_000_000n, 10_000_000_000n),
    0n,
  ).state;
  state = replayMargin(state, 10_000_000n, true);
  state = replayFill(
    state,
    fill(1n, 1_000_000_000n, 12_000_000_000n),
    10_000_000n,
  ).state;
  assert.equal(state.entryPriceE8, 11_000_000_000n);
  const reduction = replayFill(
    state,
    fill(-1n, 500_000_000n, 13_000_000_000n),
    20_000_000n,
  );
  assert.equal(reduction.pnl?.gross, 10_000_000n);
  assert.equal(reduction.pnl?.funding, 200_000n);
  assert.equal(reduction.pnl?.net, 9_700_000n);
  const reversal = replayFill(
    reduction.state,
    fill(-1n, 2_000_000_000n, 12_000_000_000n),
    20_000_000n,
  );
  assert.equal(reversal.pnl?.state, "reversed");
  assert.equal(reversal.state.position, -500_000_000n);
  assert.equal(reversal.state.entryPriceE8, 12_000_000_000n);
  assert.equal(reversal.pnl?.net, 14_900_000n);
});

test("maker history reverses trader execution direction and credits its actual rebate", () => {
  const opening = replayFill(
    initial,
    fill(1n, 1_000_000_000n, 10_000_000_000n),
    0n,
    true,
  );
  assert.equal(opening.state.position, -1_000_000_000n);
  assert.equal(opening.state.collateral, 200_025_000n);
  const closing = replayFill(
    opening.state,
    fill(-1n, 1_000_000_000n, 9_000_000_000n),
    0n,
    true,
  );
  assert.equal(closing.pnl?.net, 10_025_000n);
  assert.equal(closing.pnl?.fee, -25_000n);
});

test("history does not invent a collateral return after an unavailable liquidation balance", () => {
  const opening = replayFill(
    { ...initial, collateral: undefined },
    fill(1n, 1_000_000_000n, 10_000_000_000n),
    0n,
  );
  const close = replayFill(
    opening.state,
    fill(-1n, 1_000_000_000n, 11_000_000_000n),
    0n,
  );
  assert.equal(close.pnl?.net, 9_900_000n);
  assert.equal(close.pnl?.collateral, null);
  assert.equal(close.pnl?.returnBps, null);
  assert.throws(() => replayMargin(initial, 300_000_000n, false), /conserve/);
  assert.throws(
    () => replayFill(initial, { ...fill(1n, 1n, 1n), status: "pending" }, 0n),
    /complete/,
  );
});
