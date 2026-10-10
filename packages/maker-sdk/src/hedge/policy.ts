import type { HedgeBook, HedgePolicy } from "@/hedge/types";

export function validateHedgePolicy(policy: HedgePolicy) {
  if (
    !Number.isInteger(policy.maxLeverage) ||
    policy.maxLeverage < 1 ||
    policy.maxLeverage > 10
  )
    throw new RangeError("Maximum hedge leverage must be 1 to 10");
  if (
    !Number.isInteger(policy.ratioBps) ||
    policy.ratioBps < 1 ||
    policy.ratioBps > 10_000
  )
    throw new RangeError("Hedge ratio must be 1 to 10000 bps");
  if (
    policy.thresholdNotional <= 0n ||
    policy.maxOrderNotional <= 0n ||
    policy.maxUnhedgedNotional <= policy.thresholdNotional
  )
    throw new RangeError("Hedge notional limits are invalid");
  for (const value of [
    policy.batchMs,
    policy.maxUnhedgedMs,
    policy.maxPriceAgeMs,
    policy.orderTtlMs,
  ])
    if (!Number.isSafeInteger(value) || value < 1 || value > 300_000)
      throw new RangeError("Hedge time limits must be 1 to 300000 ms");
  if (
    policy.batchMs >= policy.maxUnhedgedMs ||
    policy.orderTtlMs > policy.maxUnhedgedMs
  )
    throw new RangeError(
      "Hedge batching and order expiry must fit the exposure time limit",
    );
  if (
    !Number.isInteger(policy.maxSlippageBps) ||
    policy.maxSlippageBps < 1 ||
    policy.maxSlippageBps > 100
  )
    throw new RangeError("Hedge slippage must be 1 to 100 bps");
}

export function validateBook(book: HedgeBook, now: number, maxAge: number) {
  if (
    !Number.isSafeInteger(book.timestamp) ||
    book.timestamp > now + 1000 ||
    now - book.timestamp > maxAge
  )
    throw new Error("External order book is stale");
  for (const [side, levels] of [
    ["bid", book.bids],
    ["ask", book.asks],
  ] as const) {
    if (!levels.length) throw new Error("External order book is empty");
    for (let index = 0; index < levels.length; index++) {
      const level = levels[index];
      if (
        level.priceE8 <= 0n ||
        level.size <= 0n ||
        (index > 0 &&
          (side === "bid"
            ? level.priceE8 > levels[index - 1].priceE8
            : level.priceE8 < levels[index - 1].priceE8))
      )
        throw new Error("External order book is invalid");
    }
  }
  if (book.bids[0].priceE8 >= book.asks[0].priceE8)
    throw new Error("External order book is crossed");
}

export function executionPrice(
  levels: HedgeBook["bids"],
  size: bigint,
): bigint {
  if (size <= 0n) throw new RangeError("Hedge execution size must be positive");
  let remaining = size;
  let cost = 0n;
  for (const level of levels) {
    const fill = remaining < level.size ? remaining : level.size;
    cost += fill * level.priceE8;
    remaining -= fill;
    if (remaining === 0n) return (cost + size - 1n) / size;
  }
  throw new Error("External order book cannot cover the quote tier");
}
