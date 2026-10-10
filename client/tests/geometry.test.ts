import { test } from "node:test";
import assert from "node:assert/strict";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { toScreenPoint } from "@/components/chart/geometry";

function surface() {
  const chart = {
    timeScale: () => ({
      timeToCoordinate: () => null,
      timeToIndex: () => 1,
      logicalToCoordinate: () => 80,
    }),
  } as unknown as IChartApi;
  const series = {
    data: () => [{ time: 60 }, { time: 120 }, { time: 180 }],
    priceToCoordinate: () => 90,
  } as unknown as ISeriesApi<"Candlestick">;
  return { chart, series };
}

test("annotations outside loaded history stay hidden until their time is available", () => {
  const { chart, series } = surface();
  assert.equal(toScreenPoint(chart, series, { time: 30, price: 100 }), null);
  assert.equal(toScreenPoint(chart, series, { time: 200, price: 100 }), null);
});

test("switching intervals maps annotations between available candle timestamps", () => {
  const { chart, series } = surface();
  assert.deepEqual(toScreenPoint(chart, series, { time: 90, price: 100 }), {
    x: 80,
    y: 90,
  });
});
