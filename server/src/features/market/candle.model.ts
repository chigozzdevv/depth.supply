import type { CandleInterval } from "@depthhq/schema";

export type CandleQuery = {
  interval?: CandleInterval;
  before?: number;
  limit?: number;
};
export const intervalSeconds: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};
