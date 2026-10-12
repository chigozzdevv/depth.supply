import assert from "node:assert/strict";
import { test } from "node:test";
import { pnlAmount, short, transactionUrl } from "@/shared/depth/format";

test("small nonzero PnL remains visible down to one micro-USDC", () => {
  for (const [value, expected] of [
    [1n, "0.000001"],
    [99n, "0.000099"],
    [100n, "0.0001"],
    [1_110n, "0.00111"],
    [9_999n, "0.009999"],
    [10_000n, "0.01"],
    [20_000_000n, "20.00"],
  ] as const) {
    assert.equal(pnlAmount(value), `+${expected}`);
    assert.equal(pnlAmount(-value), `-${expected}`);
  }
  assert.equal(pnlAmount(0n), "0.00");
  assert.equal(pnlAmount(undefined), "—");
});

test("PnL signatures link to transactions on their actual cluster", () => {
  assert.equal(short("123456789abcdefgh"), "12345…efgh");
  assert.equal(
    transactionUrl("signature", "devnet"),
    "https://explorer.solana.com/tx/signature?cluster=devnet",
  );
  assert.equal(
    transactionUrl("signature", "mainnet"),
    "https://explorer.solana.com/tx/signature",
  );
  assert.equal(
    transactionUrl("signature", "mainnet-beta"),
    "https://explorer.solana.com/tx/signature",
  );
});
