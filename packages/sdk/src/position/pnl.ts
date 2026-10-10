import type { FillSnapshot, PositionSnapshot } from "@/view/view";

export type PositionPnl = {
  side: "long" | "short";
  state: "open" | "closed" | "reduced" | "reversed";
  entryPriceE8: bigint;
  priceE8: bigint;
  collateral: bigint | null;
  gross: bigint;
  funding: bigint;
  fee: bigint;
  net: bigint;
  returnBps: bigint | null;
};

const scale = 100_000_000_000n;

export function positionPnl(
  position: PositionSnapshot,
  priceE8: bigint,
  fundingIndex: bigint,
  fill?: FillSnapshot,
): PositionPnl {
  if (
    position.status !== "ready" ||
    position.position === undefined ||
    position.position === 0n ||
    position.entryPriceE8 === undefined ||
    position.fundingCheckpoint === undefined ||
    (position.collateral !== undefined && position.collateral < 0n) ||
    priceE8 <= 0n
  )
    throw new Error("A ready open position and a positive price are required");
  const size = position.position < 0n ? -position.position : position.position;
  const sign = position.position > 0n ? 1n : -1n;
  let closing = size;
  let fee = 0n;
  let state: PositionPnl["state"] = "open";
  if (fill) {
    if (
      fill.status !== "ready" ||
      fill.side !== -sign ||
      fill.size === undefined ||
      fill.size <= 0n ||
      fill.executionPriceE8 !== priceE8 ||
      fill.fee === undefined ||
      fill.fee < 0n
    )
      throw new Error("A ready opposite-side execution is required");
    closing = fill.size < size ? fill.size : size;
    fee = fill.fee;
    state =
      fill.size === size ? "closed" : fill.size < size ? "reduced" : "reversed";
  }
  const gross = (sign * closing * (priceE8 - position.entryPriceE8)) / scale;
  const funding =
    (position.position * (fundingIndex - position.fundingCheckpoint)) / scale;
  const net = gross - funding - fee;
  return {
    side: sign > 0n ? "long" : "short",
    state,
    entryPriceE8: position.entryPriceE8,
    priceE8,
    collateral: position.collateral ?? null,
    gross,
    funding,
    fee,
    net,
    returnBps:
      position.collateral !== undefined && position.collateral > 0n
        ? (net * 10_000n) / position.collateral
        : null,
  };
}
