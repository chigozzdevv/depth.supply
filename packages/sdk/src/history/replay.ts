import type { FillSnapshot, PositionSnapshot } from "@/view/view";
import { positionPnl, type PositionPnl } from "@/position/pnl";

export type ReplayState = {
  position: bigint;
  entryPriceE8: bigint;
  fundingCheckpoint: bigint;
  collateral?: bigint;
};

export function replayFill(
  state: ReplayState,
  fill: FillSnapshot,
  fundingIndex: bigint,
  maker = false,
): {
  state: ReplayState;
  pnl?: PositionPnl;
} {
  if (
    fill.status !== "ready" ||
    (fill.side !== 1n && fill.side !== -1n) ||
    fill.size === undefined ||
    fill.size <= 0n ||
    fill.executionPriceE8 === undefined ||
    fill.executionPriceE8 <= 0n ||
    fill.fee === undefined ||
    fill.fee < 0n ||
    (maker && (fill.makerRebate === undefined || fill.makerRebate < 0n))
  )
    throw new Error("A complete private execution is required for history");
  const side = maker ? -fill.side : fill.side;
  const delta = side * fill.size;
  const old = state.position;
  const next = old + delta;
  const absolute = (value: bigint) => (value < 0n ? -value : value);
  const closing = old !== 0n && old > 0n !== delta > 0n;
  const size = closing
    ? fill.size < absolute(old)
      ? fill.size
      : absolute(old)
    : 0n;
  const gross =
    ((old > 0n ? 1n : -1n) *
      size *
      (fill.executionPriceE8 - state.entryPriceE8)) /
    100_000_000_000n;
  const funding =
    (old * (fundingIndex - state.fundingCheckpoint)) / 100_000_000_000n;
  const fee = maker ? -fill.makerRebate! : fill.fee;
  const cash = gross - funding - fee;
  const collateral =
    state.collateral === undefined ? undefined : state.collateral + cash;
  if (collateral !== undefined && collateral < 0n)
    throw new Error("Execution history does not conserve collateral");
  const entryPriceE8 =
    next === 0n
      ? 0n
      : old === 0n || old > 0n !== next > 0n
        ? fill.executionPriceE8
        : closing
          ? state.entryPriceE8
          : (absolute(old) * state.entryPriceE8 +
              fill.size * fill.executionPriceE8) /
            absolute(next);
  let pnl: PositionPnl | undefined;
  if (closing) {
    const position: PositionSnapshot = {
      id: "history",
      status: "ready",
      slot: fill.slot,
      version: 0n,
      ...state,
    };
    pnl = positionPnl(position, fill.executionPriceE8, fundingIndex, {
      ...fill,
      side,
      fee: maker ? 0n : fee,
    });
    if (maker) {
      pnl = {
        ...pnl,
        fee,
        net: cash,
        returnBps:
          state.collateral !== undefined && state.collateral > 0n
            ? (cash * 10_000n) / state.collateral
            : null,
      };
    }
  }
  return {
    state: {
      position: next,
      entryPriceE8,
      fundingCheckpoint: fundingIndex,
      collateral,
    },
    pnl,
  };
}

export function replayMargin(
  state: ReplayState,
  amount: bigint,
  toMarket: boolean,
): ReplayState {
  if (amount < 0n) throw new Error("Margin history contains a negative amount");
  const collateral =
    state.collateral === undefined
      ? undefined
      : state.collateral + (toMarket ? amount : -amount);
  if (collateral !== undefined && collateral < 0n)
    throw new Error("Margin history does not conserve collateral");
  return { ...state, collateral };
}
