import { candleIntervals, type Candle, type CandlePage } from "@depthhq/schema";
import {
  intervalSeconds,
  type CandleQuery,
} from "@/features/market/candle.model";

export class CandleService {
  private readonly cache = new Map<
    string,
    { page: CandlePage; expires: number }
  >();
  private readonly inflight = new Map<string, Promise<CandlePage>>();

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {}

  async get(query: CandleQuery = {}): Promise<CandlePage> {
    const interval = query.interval ?? "15m";
    const limit = query.limit ?? 200;
    if (
      !candleIntervals.includes(interval) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500 ||
      (query.before !== undefined &&
        (!Number.isSafeInteger(query.before) || query.before < 0))
    ) {
      throw new RangeError("Invalid candle query");
    }
    const bucket = Math.floor(this.now() / 5000);
    const key = `${interval}:${query.before === undefined ? `live:${bucket}` : `history:${query.before}`}:${limit}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.page;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const task = this.load(interval, limit, query.before)
      .then((page) => {
        this.cache.delete(key);
        this.cache.set(key, { page, expires: this.now() + 5000 });
        while (this.cache.size > 64)
          this.cache.delete(this.cache.keys().next().value!);
        return page;
      })
      .catch((error) => {
        const fallback =
          cached ??
          (query.before === undefined
            ? [...this.cache.entries()]
                .reverse()
                .find(
                  ([entry]) =>
                    entry.startsWith(`${interval}:live:`) &&
                    entry.endsWith(`:${limit}`),
                )?.[1]
            : undefined);
        if (fallback && this.now() - fallback.page.fetchedAt < 300_000)
          return { ...fallback.page, stale: true };
        throw error;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return task;
  }

  private async load(
    interval: NonNullable<CandleQuery["interval"]>,
    limit: number,
    before?: number,
  ): Promise<CandlePage> {
    const step = intervalSeconds[interval];
    const end = Math.min(
      before ?? Math.floor(this.now() / 1000),
      Math.floor(this.now() / 1000),
    );
    const start = Math.max(0, Math.floor(end / step) * step - step * limit);
    const response = await this.fetcher("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: {
          coin: "SOL",
          interval,
          startTime: start * 1000,
          endTime: end * 1000,
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error(`Reference candle provider returned ${response.status}`);
    const raw: unknown = await response.json();
    if (!Array.isArray(raw))
      throw new Error("Reference candle response is invalid");
    const candles = new Map<number, Candle>();
    for (const item of raw) {
      if (!item || item.s !== "SOL" || item.i !== interval) continue;
      const candle = {
        time: Number(item.t) / 1000,
        open: Number(item.o),
        high: Number(item.h),
        low: Number(item.l),
        close: Number(item.c),
      };
      if (
        !Number.isSafeInteger(candle.time) ||
        candle.time % step !== 0 ||
        candle.time < start ||
        candle.time > end ||
        Object.values(candle).some((value) => !Number.isFinite(value)) ||
        Math.min(candle.open, candle.high, candle.low, candle.close) <= 0 ||
        candle.high < Math.max(candle.open, candle.close, candle.low) ||
        candle.low > Math.min(candle.open, candle.close)
      )
        continue;
      candles.set(candle.time, candle);
    }
    const items = [...candles.values()]
      .sort((a, b) => a.time - b.time)
      .slice(-limit);
    if (raw.length > 0 && items.length === 0)
      throw new Error("Reference provider returned no valid SOL candles");
    return {
      marketId: "SOL-USD",
      interval,
      source: "hyperliquid",
      kind: "reference",
      fetchedAt: this.now(),
      stale: false,
      items,
      nextCursor: items.length === limit ? items[0].time - 1 : null,
    };
  }
}
