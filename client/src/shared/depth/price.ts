import type { CandleInterval, CandlePage } from "@depthhq/sdk";

const intervalSeconds: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

export function livePrice(page: CandlePage | undefined, now: number) {
  if (
    !page ||
    page.stale ||
    now - page.fetchedAt > 15_000 ||
    page.fetchedAt - now > 5_000
  )
    return undefined;
  const last = page.items.at(-1);
  const seconds = Math.floor(now / 1000);
  if (
    !last ||
    last.time > seconds ||
    seconds - last.time >= intervalSeconds[page.interval]
  )
    return undefined;
  return last.close;
}
