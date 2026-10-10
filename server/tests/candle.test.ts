import { test } from "node:test";
import assert from "node:assert/strict";
import { CandleService } from "@/features/market/candle.service";

const start = 1_800_000_000;
const candle = (time: number) => ({
  s: "SOL",
  i: "1m",
  t: time * 1000,
  o: "100",
  h: "102",
  l: "99",
  c: "101",
});
test("reference candles validate their market, OHLC and time, sort and deduplicate", async () => {
  let calls = 0;
  const service = new CandleService(
    async () => {
      calls++;
      return Response.json([
        candle(start - 60),
        candle(start - 120),
        candle(start - 60),
        { ...candle(start), s: "BTC" },
        { ...candle(start), l: "103" },
        candle(start + 60),
      ]);
    },
    () => start * 1000,
  );
  const [one, two] = await Promise.all([
    service.get({ interval: "1m", limit: 2 }),
    service.get({ interval: "1m", limit: 2 }),
  ]);
  assert.deepEqual(
    one.items.map((item) => item.time),
    [start - 120, start - 60],
  );
  assert.equal(one.kind, "reference");
  assert.equal(one.source, "hyperliquid");
  assert.equal(one.nextCursor, start - 121);
  assert.deepEqual(one, two);
  assert.equal(calls, 1);
});
test("provider failure marks bounded cached data stale and never fabricates history", async () => {
  let now = start * 1000;
  let fail = false;
  const service = new CandleService(
    async () => {
      if (fail) throw new Error("unavailable");
      return Response.json([candle(start)]);
    },
    () => now,
  );
  await service.get({ interval: "1m" });
  fail = true;
  now += 6000;
  assert.equal((await service.get({ interval: "1m" })).stale, true);
  await assert.rejects(
    service.get({ interval: "1m", before: start - 600 }),
    /unavailable/,
  );
  now += 300_000;
  await assert.rejects(service.get({ interval: "1m" }), /unavailable/);
});
test("invalid queries and wholly malformed provider rows fail explicitly", async () => {
  const service = new CandleService(
    async () => Response.json([{ ...candle(start), h: "NaN" }]),
    () => start * 1000,
  );
  await assert.rejects(service.get({ limit: 501 }), /Invalid/);
  await assert.rejects(service.get({ interval: "1m" }), /no valid/);
});
