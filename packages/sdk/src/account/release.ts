export type ReleasePosition = {
  collateral: bigint;
  reserved: bigint;
  position: bigint;
  entryPriceE8: bigint;
  fundingCheckpoint: bigint;
};

export function releasableMargin(
  state: ReleasePosition,
  oraclePriceE8: bigint,
  fundingIndex: bigint,
  initialMarginBps: number
): bigint {
  if (oraclePriceE8 <= 0n || initialMarginBps <= 0 || initialMarginBps > 10_000)
    throw new RangeError("Market risk policy is invalid");
  const absolute = state.position < 0n ? -state.position : state.position;
  const unrealised =
    (state.position * (oraclePriceE8 - state.entryPriceE8)) / 100_000_000_000n;
  const funding =
    (state.position * (fundingIndex - state.fundingCheckpoint)) /
    100_000_000_000n;
  const loss = unrealised < 0n ? unrealised : 0n;
  const required =
    (absolute * oraclePriceE8 * BigInt(initialMarginBps) +
      999_999_999_999_999n) /
      1_000_000_000_000_000n +
    state.reserved;
  const available = state.collateral + loss - funding - required;
  return available <= 0n
    ? 0n
    : available < state.collateral
    ? available
    : state.collateral;
}
