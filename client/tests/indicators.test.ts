import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "@depthhq/sdk";
import {
  bollingerBands,
  ema,
  macd,
  rsi,
  sma,
} from "@/components/chart/indicators";

const candles: Candle[] = Array.from({ length: 40 }, (_, index) => ({
  close: index + 1,
  high: index + 2,
  low: index,
  open: index + 0.5,
  time: (index + 1) * 60,
}));

test("moving averages use a complete window and seed EMA from SMA", () => {
  assert.deepEqual(
    sma(candles, 3)
      .slice(0, 2)
      .map((point) => point.value),
    [2, 3],
  );
  assert.deepEqual(
    ema(candles, 3)
      .slice(0, 3)
      .map((point) => point.value),
    [2, 3, 4],
  );
  assert.deepEqual(sma(candles.slice(0, 2), 3), []);
  assert.deepEqual(ema(candles.slice(0, 2), 3), []);
});

test("Bollinger bands use population variance and two standard deviations", () => {
  const bands = bollingerBands(candles, 3, 2);
  assert.equal(bands.middle[0].value, 2);
  assert.ok(
    Math.abs(bands.upper[0].value - (2 + Math.sqrt(2 / 3) * 2)) < 1e-10,
  );
  assert.ok(
    Math.abs(bands.lower[0].value - (2 - Math.sqrt(2 / 3) * 2)) < 1e-10,
  );
});

test("RSI uses Wilder smoothing across mixed gains and losses and handles flat prices", () => {
  const mixed = [1, 2, 1, 2, 1].map((close, i) => ({ ...candles[i], close }));
  assert.deepEqual(
    rsi(mixed, 2).map((point) => point.value),
    [50, 75, 37.5],
  );
  assert.equal(rsi(candles, 14)[0].value, 100);
  assert.equal(
    rsi(
      candles.map((candle) => ({ ...candle, close: 10 })),
      14,
    )[0].value,
    50,
  );
});

test("MACD aligns its seeded fast and slow averages and the signal histogram", () => {
  const result = macd(candles);
  assert.equal(result.macd[0].time, candles[25].time);
  assert.equal(result.signal[0].time, candles[33].time);
  assert.ok(Math.abs(result.histogram[0].value) < 1e-10);
  for (const point of result.histogram) {
    const main = result.macd.find((value) => value.time === point.time)!.value;
    const signal = result.signal.find(
      (value) => value.time === point.time,
    )!.value;
    assert.ok(Math.abs(point.value - (main - signal)) < 1e-10);
  }
});
