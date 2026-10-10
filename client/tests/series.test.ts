import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "@depthhq/sdk";
import type { LogicalRange } from "lightweight-charts";
import { CandleSeries } from "@/components/trade/series";

function candles(start: number, count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: (start + index) * 60,
    open: 100,
    high: 105,
    low: 95,
    close: 101,
  }));
}

function harness(initialRange = { from: 8.25, to: 77.125 }) {
  const writes: Candle[][] = [];
  const updates: { item: Candle; historical: boolean }[] = [];
  const scrolls: number[] = [];
  const ranges: { from: number; to: number }[] = [];
  let range = initialRange;
  const plot = new CandleSeries(
    {
      setData: (items) => {
        writes.push(items as Candle[]);
      },
      update: (item, historical = false) => {
        updates.push({ item: item as Candle, historical });
      },
    },
    {
      getVisibleLogicalRange: () => range as LogicalRange,
      setVisibleLogicalRange: (next) => {
        range = next;
        ranges.push(next);
      },
      scrollToPosition: (position) => {
        scrolls.push(position);
      },
    },
  );
  return { plot, writes, updates, scrolls, ranges, range: () => range };
}

test("stream updates and new bars preserve a user's historical viewport and zoom", () => {
  const chart = harness();
  const initial = candles(0, 200);
  chart.plot.sync(initial, "15m");
  const current = initial.map((item, index) =>
    index === 198
      ? { ...item, close: 103 }
      : index === 199
        ? { ...item, close: 104 }
        : item,
  );
  chart.plot.sync([...current, ...candles(200, 1)], "15m");
  assert.equal(chart.writes.length, 1);
  assert.deepEqual(chart.ranges, []);
  assert.deepEqual(chart.scrolls, [4]);
  assert.deepEqual(chart.range(), { from: 8.25, to: 77.125 });
  assert.deepEqual(
    chart.updates.map(({ historical }) => historical),
    [true, false, false],
  );
});

test("prepending history preserves the exact fractional range and visible candles", () => {
  const chart = harness();
  const initial = candles(200, 200);
  chart.plot.sync(initial, "15m");
  chart.plot.sync([...candles(0, 200), ...initial], "15m");
  assert.deepEqual(chart.range(), { from: 208.25, to: 277.125 });
  assert.equal(chart.range().to - chart.range().from, 77.125 - 8.25);
  assert.equal(
    chart.writes.at(-1)?.[Math.floor(chart.range().from)].time,
    initial[8].time,
  );
  assert.deepEqual(chart.scrolls, [4]);
});

test("panning beyond the oldest candle retains whitespace and candle width after history arrives", () => {
  const chart = harness({ from: -10.125, to: 58.75 });
  const initial = candles(200, 200);
  chart.plot.sync(initial, "15m");
  chart.plot.sync([...candles(0, 200), ...initial], "15m");
  assert.deepEqual(chart.range(), { from: 189.875, to: 258.75 });
  assert.equal(chart.range().to - chart.range().from, 58.75 + 10.125);
});

test("duplicate feed frames do not redraw candles or reset the viewport", () => {
  const chart = harness();
  chart.plot.sync(candles(0, 200), "15m");
  chart.plot.sync(candles(0, 200), "15m");
  assert.equal(chart.writes.length, 1);
  assert.deepEqual(chart.updates, []);
  assert.deepEqual(chart.ranges, []);
});

test("switching intervals clears the old series and initializes the new interval once", () => {
  const chart = harness();
  chart.plot.sync(candles(0, 200), "15m");
  chart.plot.sync([], "1m");
  chart.plot.sync(candles(300, 200), "1m");
  assert.deepEqual(
    chart.writes.map((items) => items.length),
    [200, 0, 200],
  );
  assert.deepEqual(chart.scrolls, [4, 4]);
  assert.deepEqual(chart.ranges, []);
});
