import assert from "node:assert/strict";
import { test } from "node:test";
import { short, transactionUrl } from "@/shared/depth/format";

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
