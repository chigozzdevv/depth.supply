import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candle, CandlePage } from "@depthhq/sdk";
import { CandleHistory } from "@/shared/depth/history";

function candle(time: number, close = 100): Candle {
  return {
    time,
    open: 100,
    high: Math.max(100, close),
    low: Math.min(100, close),
    close,
  };
}
function page(
  items: Candle[],
  fetchedAt: number,
  nextCursor: number | null = null,
): CandlePage {
  return {
    marketId: "SOL-USD",
    interval: "1m",
    source: "hyperliquid",
    kind: "reference",
    stale: false,
    fetchedAt,
    items,
    nextCursor,
  };
}

test("the first stream frame stays buffered until history arrives without losing newer prices", () => {
  const history = new CandleHistory();
  history.live(page([candle(120), candle(180, 105)], 2000));
  assert.equal(history.view().ready, false);
  assert.deepEqual(history.view().items, []);
  history.initialize(
    page([candle(0), candle(60), candle(120), candle(180, 101)], 1000),
  );
  assert.equal(history.view().ready, true);
  assert.deepEqual(
    history.view().items.map((item) => item.time),
    [0, 60, 120, 180],
  );
  assert.equal(history.view().items.at(-1)?.close, 105);
  assert.equal(history.view().page?.fetchedAt, 2000);
});

test("prepending history does not replace the live price with an older candle", () => {
  const history = new CandleHistory();
  history.initialize(page([candle(180), candle(240, 104)], 1000, 179));
  history.live(page([candle(240, 106), candle(300, 107)], 2000));
  history.prepend(page([candle(60), candle(120)], 3000, 59));
  assert.deepEqual(
    history.view().items.map((item) => item.time),
    [60, 120, 180, 240, 300],
  );
  assert.equal(history.view().page?.items.at(-1)?.close, 107);
  assert.equal(history.view().cursor, 59);
});

test("unchanged and out-of-order frames retain the same plotted candles", () => {
  const history = new CandleHistory();
  history.initialize(page([candle(60, 104)], 2000));
  const items = history.view().items;
  history.live(page([candle(60, 104)], 3000));
  assert.equal(history.view().items, items);
  history.live(page([candle(60, 99)], 1000));
  assert.equal(history.view().items, items);
  assert.equal(history.view().page?.fetchedAt, 3000);
});

test("empty or non-advancing history ends pagination", () => {
  for (const nextCursor of [null, 59, 179, 200]) {
    const history = new CandleHistory();
    history.initialize(page([candle(180)], 1000, 179));
    history.prepend(page([], 2000, nextCursor));
    assert.equal(history.view().cursor, null);
  }
});
