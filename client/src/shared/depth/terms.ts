import type { PublicMarket, PublicApp, PositionSnapshot } from "@depthhq/sdk";

export function tradeMargin(
  amount: bigint,
  available: bigint | undefined,
): bigint {
  if (amount <= 0n) throw new Error("Enter a positive USDC margin");
  if (available === undefined)
    throw new Error("Wait for your account balance or retry the account read");
  if (amount > available) throw new Error("Margin exceeds your available USDC");
  return amount;
}

export function tradeFeeBps(
  market: Pick<PublicMarket, "fee_bps" | "insurance_fee_bps">,
  app: Pick<PublicApp, "fee_bps">,
): number {
  if (
    !Number.isSafeInteger(market.fee_bps) ||
    market.fee_bps < 0 ||
    !Number.isSafeInteger(market.insurance_fee_bps) ||
    market.insurance_fee_bps < 0 ||
    market.insurance_fee_bps > market.fee_bps ||
    !Number.isSafeInteger(app.fee_bps) ||
    app.fee_bps < 0 ||
    app.fee_bps > 2
  )
    throw new Error("Invalid trading fee policy");
  return market.fee_bps + app.fee_bps;
}

export function idleCollateral(position: PositionSnapshot | undefined): bigint {
  if (
    position?.status !== "ready" ||
    position.position !== 0n ||
    position.collateral === undefined ||
    position.reserved === undefined
  )
    return 0n;
  return position.collateral > position.reserved
    ? position.collateral - position.reserved
    : 0n;
}
