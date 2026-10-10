export const candleIntervals = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type CandleInterval = (typeof candleIntervals)[number];
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};
export type CandlePage = {
  marketId: "SOL-USD";
  interval: CandleInterval;
  source: "hyperliquid";
  kind: "reference";
  fetchedAt: number;
  stale: boolean;
  items: Candle[];
  nextCursor: number | null;
};
export const candlePageSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "marketId",
    "interval",
    "source",
    "kind",
    "fetchedAt",
    "stale",
    "items",
    "nextCursor",
  ],
  properties: {
    marketId: { type: "string", const: "SOL-USD" },
    interval: { type: "string", enum: candleIntervals },
    source: { type: "string", const: "hyperliquid" },
    kind: { type: "string", const: "reference" },
    fetchedAt: { type: "integer", minimum: 0 },
    stale: { type: "boolean" },
    nextCursor: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
    items: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["time", "open", "high", "low", "close"],
        properties: {
          time: { type: "integer", minimum: 0 },
          open: { type: "number", exclusiveMinimum: 0 },
          high: { type: "number", exclusiveMinimum: 0 },
          low: { type: "number", exclusiveMinimum: 0 },
          close: { type: "number", exclusiveMinimum: 0 },
        },
      },
    },
  },
} as const;
