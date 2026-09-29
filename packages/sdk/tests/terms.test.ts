import assert from "node:assert/strict";
import { test } from "node:test";
import { tradeDeadline, tradeLimit } from "@/trade/terms";

const terms = { marketId: "SOL-USD" as const, maxFee: 10_000n };

test("trade duration resolves within market policy", () => {
  assert.equal(
    tradeDeadline({ ...terms, validForSeconds: 30 }, 1_000, 300),
    1_030
  );
  assert.throws(() =>
    tradeDeadline({ ...terms, validForSeconds: 301 }, 1_000, 300)
  );
  assert.throws(() =>
    tradeDeadline(
      { ...terms, expiresAt: 1_100, validForSeconds: 30 },
      1_000,
      300
    )
  );
});

test("trade slippage rounds the adverse oracle price limit", () => {
  assert.equal(
    tradeLimit({ ...terms, slippageBps: 50 }, "long", 20_000_000_001n),
    20_100_000_002n
  );
  assert.equal(
    tradeLimit({ ...terms, slippageBps: 50 }, "short", 20_000_000_001n),
    19_900_000_000n
  );
  assert.throws(() =>
    tradeLimit({ ...terms, slippageBps: 1_001 }, "long", 20_000_000_000n)
  );
  assert.throws(() =>
    tradeLimit(
      { ...terms, worstPriceE8: 1n, slippageBps: 50 },
      "long",
      20_000_000_000n
    )
  );
});
