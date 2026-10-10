import type {
  CandleInterval,
  CandlePage,
  PublicMarket,
  PublicApp,
} from "@depthhq/schema";
import { candleIntervals } from "@depthhq/schema";
export type {
  Candle,
  CandleInterval,
  CandlePage,
  PublicMarket,
  PublicApp,
} from "@depthhq/schema";
import { endpoint, environments, type DepthEnvironment } from "@/chain/network";

export type DataOptions = {
  environment: DepthEnvironment;
  serviceUrl?: string;
};
export type CandleQuery = {
  interval?: CandleInterval;
  before?: number;
  limit?: number;
};

function parseCandles(value: unknown): CandlePage {
  const page = value as CandlePage;
  if (
    !page ||
    page.marketId !== "SOL-USD" ||
    page.kind !== "reference" ||
    page.source !== "hyperliquid" ||
    !candleIntervals.includes(page.interval) ||
    !Number.isSafeInteger(page.fetchedAt) ||
    typeof page.stale !== "boolean" ||
    (page.nextCursor !== null && !Number.isSafeInteger(page.nextCursor)) ||
    !Array.isArray(page.items) ||
    page.items.length > 500
  ) {
    throw new Error("Invalid reference candle response");
  }
  let previous = -1;
  for (const candle of page.items) {
    if (
      !Number.isSafeInteger(candle.time) ||
      candle.time <= previous ||
      [candle.open, candle.high, candle.low, candle.close].some(
        (price) => !Number.isFinite(price) || price <= 0,
      ) ||
      candle.high < Math.max(candle.open, candle.close, candle.low) ||
      candle.low > Math.min(candle.open, candle.close)
    )
      throw new Error("Invalid reference candle");
    previous = candle.time;
  }
  return page;
}

export class MarketData {
  readonly serviceUrl: string;
  constructor(options: DataOptions) {
    this.serviceUrl = endpoint(
      options.serviceUrl ?? environments[options.environment].service,
      options.environment,
      "serviceUrl",
    );
  }
  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.serviceUrl}${path}`, {
      signal: signal ?? AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Depth public service returned HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
  async markets(): Promise<{ items: PublicMarket[] }> {
    const page = await this.get<{ markets: PublicMarket[] }>("/v1/markets");
    if (!Array.isArray(page.markets))
      throw new Error("Market discovery is unavailable");
    return { items: page.markets };
  }
  async market(marketId = "SOL-USD"): Promise<PublicMarket> {
    const market = await this.get<PublicMarket>(
      `/v1/markets/${encodeURIComponent(marketId)}`,
    );
    if (market.id !== marketId)
      throw new Error("Market response identity mismatch");
    return market;
  }
  async app(appId: string): Promise<PublicApp> {
    const app = await this.get<PublicApp>(
      `/v1/apps/${encodeURIComponent(appId)}`,
    );
    if (app.id !== appId || !Number.isSafeInteger(app.fee_bps))
      throw new Error("App response identity mismatch");
    return app;
  }
  async candles(
    marketId = "SOL-USD",
    query: CandleQuery = {},
    signal?: AbortSignal,
  ): Promise<CandlePage> {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query))
      if (value !== undefined) params.set(name, String(value));
    return parseCandles(
      await this.get(
        `/v1/markets/${encodeURIComponent(marketId)}/candles?${params}`,
        signal,
      ),
    );
  }
  subscribe(input: {
    marketId?: string;
    interval?: CandleInterval;
    onUpdate: (page: CandlePage) => void;
    onError: (error: unknown) => void;
  }): () => void {
    const controller = new AbortController();
    const signal = controller.signal;
    const run = async () => {
      let last = 0;
      while (!signal.aborted) {
        try {
          const url = `${this.serviceUrl}/v1/markets/${encodeURIComponent(input.marketId ?? "SOL-USD")}/stream?interval=${input.interval ?? "15m"}`;
          const response = await fetch(url, {
            signal,
            headers: { accept: "text/event-stream" },
          });
          if (!response.ok || !response.body)
            throw new Error("Market stream is unavailable");
          const reader = response.body
            .pipeThrough(new TextDecoderStream())
            .getReader();
          const abort = () => {
            void reader.cancel().catch(() => undefined);
          };
          signal.addEventListener("abort", abort, { once: true });
          let buffer = "";
          try {
            for (;;) {
              const part = await reader.read();
              if (part.done) throw new Error("Market stream disconnected");
              buffer += part.value.replace(/\r/g, "");
              if (buffer.length > 1_000_000)
                throw new Error("Market stream frame is too large");
              let boundary: number;
              while ((boundary = buffer.indexOf("\n\n")) !== -1) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                if (frame.includes("event: unavailable"))
                  throw new Error("Reference source is unavailable");
                const line = frame
                  .split("\n")
                  .find((entry) => entry.startsWith("data: "));
                if (!line) continue;
                const page = parseCandles(JSON.parse(line.slice(6)));
                if (page.interval !== (input.interval ?? "15m"))
                  throw new Error("Market stream interval mismatch");
                if (page.fetchedAt >= last) {
                  last = page.fetchedAt;
                  input.onUpdate(page);
                }
              }
            }
          } finally {
            signal.removeEventListener("abort", abort);
            await reader.cancel().catch(() => undefined);
          }
        } catch (error) {
          if (!signal.aborted) input.onError(error);
        }
        if (!signal.aborted)
          await new Promise<void>((resolve) => {
            const abort = () => {
              clearTimeout(timer);
              resolve();
            };
            const timer = setTimeout(() => {
              signal.removeEventListener("abort", abort);
              resolve();
            }, 3000);
            signal.addEventListener("abort", abort, { once: true });
          });
      }
    };
    void run();
    return () => controller.abort();
  }
}

export function create_depth_data(options: DataOptions): MarketData {
  return new MarketData(options);
}
