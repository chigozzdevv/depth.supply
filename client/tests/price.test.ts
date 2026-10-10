import { test } from "node:test";
import assert from "node:assert/strict";
import type { CandlePage } from "@depthhq/sdk";
import { livePrice } from "@/shared/depth/price";

const now = Date.UTC(2026, 9, 10, 12, 0, 10);
const page: CandlePage = {
  marketId: "SOL-USD",
  interval: "15m",
  source: "hyperliquid",
  kind: "reference",
  fetchedAt: now - 5000,
  stale: false,
  items: [
    {
      time: Date.UTC(2026, 9, 10, 12) / 1000,
      open: 120,
      high: 123,
      low: 119,
      close: 122.5,
    },
  ],
  nextCursor: null,
};

test("the navbar price uses a current reference candle across chart intervals", () => {
  for (const interval of ["1m", "5m", "15m", "1h", "4h", "1d"] as const)
    assert.equal(livePrice({ ...page, interval }, now), 122.5);
});

test("delayed and interrupted feeds cannot supply a live navbar price", () => {
  assert.equal(livePrice({ ...page, stale: true }, now), undefined);
  assert.equal(livePrice(page, now + 10_001), undefined);
  assert.equal(livePrice(undefined, now), undefined);
  assert.equal(livePrice({ ...page, items: [] }, now), undefined);
});

test("a recent fetch cannot make an old or future candle live", () => {
  assert.equal(
    livePrice(
      { ...page, fetchedAt: now + 50_000, interval: "1m" },
      now + 50_000,
    ),
    undefined,
  );
  assert.equal(
    livePrice(
      {
        ...page,
        fetchedAt: now,
        items: [{ ...page.items[0], time: now / 1000 + 60 }],
      },
      now,
    ),
    undefined,
  );
  assert.equal(livePrice({ ...page, fetchedAt: now + 5001 }, now), undefined);
});
