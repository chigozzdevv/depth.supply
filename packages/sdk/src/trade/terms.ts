import type { TradeTerms } from "@/client/types";

export function tradeDeadline(
  input: TradeTerms,
  now: number,
  maxSeconds: number
): number {
  if ((input.expiresAt === undefined) === (input.validForSeconds === undefined))
    throw new RangeError("Choose exactly one order duration or expiry");
  const expiry =
    input.validForSeconds === undefined
      ? input.expiresAt!
      : now + input.validForSeconds;
  if (
    !Number.isSafeInteger(expiry) ||
    expiry <= now ||
    expiry - now > maxSeconds
  )
    throw new RangeError("Order deadline is outside market policy");
  return expiry;
}

export function tradeLimit(
  input: TradeTerms,
  direction: "long" | "short",
  oraclePriceE8: bigint
): bigint {
  if ((input.worstPriceE8 === undefined) === (input.slippageBps === undefined))
    throw new RangeError("Choose exactly one price bound or slippage limit");
  if (input.worstPriceE8 !== undefined) {
    if (input.worstPriceE8 <= 0n || input.worstPriceE8 > (1n << 64n) - 1n)
      throw new RangeError("worstPriceE8 must be a positive u64");
    return input.worstPriceE8;
  }
  const bps = input.slippageBps!;
  if (!Number.isInteger(bps) || bps < 0 || bps > 1_000)
    throw new RangeError("slippageBps must be between 0 and 1000");
  if (oraclePriceE8 <= 0n) throw new RangeError("Oracle price is unavailable");
  const numerator =
    oraclePriceE8 * BigInt(direction === "long" ? 10_000 + bps : 10_000 - bps);
  const price =
    direction === "long" ? (numerator + 9_999n) / 10_000n : numerator / 10_000n;
  if (price <= 0n || price > (1n << 64n) - 1n)
    throw new RangeError("Derived price bound is invalid");
  return price;
}
