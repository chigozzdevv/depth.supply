import type { QuoteInput, MarketState } from "@/client/types";
import type { PositionSnapshot } from "@depthhq/sdk";
import { positionPnl } from "@depthhq/sdk";
import { executionPrice, validateBook } from "@/hedge/policy";
import { abs, notional, type HedgeBook } from "@/hedge/types";

export type BotPolicy = {
  maxCapacity: bigint;
  maxInventoryNotional: bigint;
  spreadBps: number;
  repriceBps: number;
  lifetimeSeconds: number;
  refreshSeconds: number;
  gasReserveLamports?: bigint;
  inventorySkewBps?: number;
  executionCostBps?: number;
  fundingHours?: number;
};
export type BotPricing = {
  book: HedgeBook;
  externalPosition: bigint;
  maxPriceAgeMs: number;
  takerFeeBps: number;
  hourlyFundingBps: number;
};
export type BotMarket = MarketState & {
  oraclePriceE8: { toString(): string };
  fundingIndex: { toString(): string };
  incident: Record<string, unknown>;
  lastFundingTimestamp: { toNumber(): number };
  config: MarketState["config"] & {
    maxQuoteDeviationBps: number;
    fundingIntervalSeconds: number;
  };
};

export function validateBotPolicy(policy: BotPolicy) {
  if (
    policy.maxCapacity <= 0n ||
    policy.maxInventoryNotional <= 0n ||
    policy.maxCapacity > policy.maxInventoryNotional
  )
    throw new RangeError("Maker capacity must fit a positive inventory limit");
  for (const [name, value] of Object.entries(policy))
    if (
      typeof value === "number" &&
      (!Number.isSafeInteger(value) || value <= 0) &&
      !(["inventorySkewBps", "executionCostBps"].includes(name) && value === 0)
    )
      throw new RangeError(`${name} must be a positive integer`);
  if (policy.refreshSeconds >= policy.lifetimeSeconds)
    throw new RangeError("Refresh must precede quote expiry");
  if (policy.spreadBps >= 20_000 || policy.repriceBps > 10_000)
    throw new RangeError("Maker price bounds are invalid");
  if (
    (policy.inventorySkewBps ?? 0) > 100 ||
    (policy.executionCostBps ?? 0) > 100
  )
    throw new RangeError("Maker pricing adjustments must be 0 to 100 bps");
  if ((policy.fundingHours ?? 1) > 168)
    throw new RangeError("Maker funding horizon must be at most 168 hours");
  const reserve = policy.gasReserveLamports ?? 50_000_000n;
  if (reserve < 10_000_000n || reserve > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError(
      "Maker SOL reserve must be at least 10000000 lamports",
    );
}

export function quoteHealth(
  market: BotMarket,
  now: number,
): string | undefined {
  if (!("active" in market.status) || !("none" in market.incident))
    return "market paused";
  const age = now - market.oracleTimestamp.toNumber();
  if (age < 0 || age > market.config.maxOracleAgeSeconds) return "oracle stale";
  if (
    now >
    market.lastFundingTimestamp.toNumber() +
      market.config.fundingIntervalSeconds
  )
    return "funding overdue";
  if (BigInt(market.oraclePriceE8.toString()) < 100_000_000n)
    return "oracle price invalid";
}

export function botQuote(
  policy: BotPolicy,
  market: BotMarket,
  position: PositionSnapshot,
  nonce: bigint,
  now: number,
  pricing?: BotPricing,
): QuoteInput | undefined {
  validateBotPolicy(policy);
  const reason = quoteHealth(market, now);
  if (reason) throw new Error(reason);
  if (
    position.status !== "ready" ||
    position.position === undefined ||
    position.collateral === undefined ||
    position.reserved === undefined
  )
    throw new Error("Maker private position is not ready");
  const price = BigInt(market.oraclePriceE8.toString());
  const exposure =
    ((position.position < 0n ? -position.position : position.position) *
      price) /
    100_000_000_000n;
  const marginBps = BigInt(market.config.initialMarginBps);
  if (marginBps <= 0n) throw new Error("Maker margin policy is invalid");
  const pnl =
    position.position === 0n
      ? 0n
      : positionPnl(position, price, BigInt(market.fundingIndex.toString()))
          .net;
  const free =
    position.collateral +
    pnl -
    position.reserved -
    (exposure * marginBps + 9_999n) / 10_000n;
  const limits = [
    policy.maxCapacity,
    policy.maxInventoryNotional - exposure,
    free > 0n ? (free * 10_000n) / marginBps : 0n,
    BigInt(market.config.maxAccountNotional.toString()) - exposure,
    BigInt(market.config.maxMarketNotional.toString()),
  ];
  const capacity = limits.reduce((minimum, value) =>
    value < minimum ? value : minimum,
  );
  const tiers = market.config.quoteTiers
    .map((value) => BigInt(value.toString()))
    .filter((size) => size > 0n && size <= capacity);
  if (!tiers.length) return;
  const half = Math.ceil(policy.spreadBps / 2);
  if (half > market.config.maxQuoteDeviationBps)
    throw new Error("Maker spread exceeds oracle deviation policy");
  if (pricing) validateBook(pricing.book, now * 1000, pricing.maxPriceAgeMs);
  if (
    pricing &&
    (!Number.isFinite(pricing.takerFeeBps) ||
      pricing.takerFeeBps < 0 ||
      !Number.isFinite(pricing.hourlyFundingBps))
  )
    throw new Error("External execution costs are invalid");
  const netPosition = position.position + (pricing?.externalPosition ?? 0n);
  const netExposure = notional(netPosition, price);
  const skewBps =
    (netExposure * BigInt(policy.inventorySkewBps ?? 0)) /
    policy.maxInventoryNotional;
  const boundedSkew =
    skewBps < BigInt(policy.inventorySkewBps ?? 0)
      ? skewBps
      : BigInt(policy.inventorySkewBps ?? 0);
  const skew = (price * boundedSkew * (netPosition > 0n ? -1n : 1n)) / 10_000n;
  const costs = BigInt(half + (policy.executionCostBps ?? 0));
  const horizon = policy.fundingHours ?? 1;
  const bidCosts =
    costs +
    BigInt(
      Math.ceil(
        (pricing?.takerFeeBps ?? 0) +
          Math.max(0, -(pricing?.hourlyFundingBps ?? 0)) * horizon,
      ),
    );
  const askCosts =
    costs +
    BigInt(
      Math.ceil(
        (pricing?.takerFeeBps ?? 0) +
          Math.max(0, pricing?.hourlyFundingBps ?? 0) * horizon,
      ),
    );
  const quotes = tiers.map((size) => {
    const units = (size * 100_000_000_000n + price - 1n) / price;
    const sell = pricing ? executionPrice(pricing.book.bids, units) : price;
    const buy = pricing ? executionPrice(pricing.book.asks, units) : price;
    const bidE8 = (sell * (10_000n - bidCosts)) / 10_000n + skew;
    const askE8 = (buy * (10_000n + askCosts) + 9_999n) / 10_000n + skew;
    const bound = price * BigInt(market.config.maxQuoteDeviationBps);
    if (
      bidE8 < 100_000_000n ||
      bidE8 >= askE8 ||
      abs(bidE8 - price) * 10_000n > bound ||
      abs(askE8 - price) * 10_000n > bound
    )
      throw new Error("Executable maker prices exceed oracle deviation bounds");
    return { size, bidE8, askE8 };
  });
  const duration = Math.min(
    policy.lifetimeSeconds,
    market.config.maxQuoteLifetimeSeconds,
  );
  return {
    tiers: quotes,
    maxCapacity: capacity,
    expiresAt: now + duration,
    clientNonce: nonce,
  };
}
