import { test } from "node:test";
import assert from "node:assert/strict";
import { create_depth_data } from "@/catalog/data";

test("public data needs no wallet, labels reference candles and rejects invalid OHLC", async () => {
  const previous = globalThis.fetch;
  const page = {
    marketId: "SOL-USD",
    interval: "1m",
    source: "hyperliquid",
    kind: "reference",
    fetchedAt: Date.now(),
    stale: false,
    nextCursor: null,
    items: [{ time: 60, open: 100, high: 102, low: 99, close: 101 }],
  };
  globalThis.fetch = async () => Response.json(page);
  try {
    const data = create_depth_data({
      environment: "devnet",
      serviceUrl: "http://localhost:8787",
    });
    assert.equal((await data.candles()).kind, "reference");
    page.items[0].low = 103;
    await assert.rejects(data.candles(), /Invalid reference candle/);
    assert.throws(
      () =>
        create_depth_data({
          environment: "devnet",
          serviceUrl: "http://untrusted.example",
        }),
      /HTTPS/,
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("market stream handles split frames, ignores older snapshots and stops on unsubscribe", async () => {
  const previous = globalThis.fetch;
  const encoder = new TextEncoder();
  const updated: number[] = [];
  let cancelled = false;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          const page = {
            marketId: "SOL-USD",
            interval: "1m",
            source: "hyperliquid",
            kind: "reference",
            fetchedAt: 100,
            stale: false,
            nextCursor: null,
            items: [{ time: 60, open: 100, high: 102, low: 99, close: 101 }],
          };
          const first = `event: candles\r\ndata: ${JSON.stringify(page)}\r\n\r\n`;
          controller.enqueue(encoder.encode(first.slice(0, 17)));
          controller.enqueue(encoder.encode(first.slice(17)));
          controller.enqueue(
            encoder.encode(
              `event: candles\ndata: ${JSON.stringify({ ...page, fetchedAt: 99 })}\n\n`,
            ),
          );
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  const data = create_depth_data({
    environment: "devnet",
    serviceUrl: "http://localhost:8787",
  });
  const errors: unknown[] = [];
  const stop = data.subscribe({
    interval: "1m",
    onUpdate: (page) => updated.push(page.fetchedAt),
    onError: (error) => errors.push(error),
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(updated, [100]);
    stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(cancelled, true);
    assert.deepEqual(errors, []);
  } finally {
    stop();
    globalThis.fetch = previous;
  }
});
