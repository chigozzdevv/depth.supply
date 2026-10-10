import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpConnection } from "@/chain/connection";

test("HTTP confirmation respects finality without opening a websocket", async () => {
  const connection = new HttpConnection(
    "https://api.devnet.solana.com",
    "confirmed",
  );
  let calls = 0;
  connection.getSignatureStatuses = async () => ({
    context: { slot: 10 },
    value: [
      {
        slot: 10,
        confirmations: null,
        err: null,
        confirmationStatus: ++calls === 1 ? "confirmed" : "finalized",
      },
    ],
  });
  connection.getBlockHeight = async () => {
    throw new Error(
      "An included transaction cannot expire while waiting for finality",
    );
  };
  const result = await connection.confirmTransaction(
    { signature: "test", blockhash: "test", lastValidBlockHeight: 1 },
    "finalized",
  );
  assert.equal(result.value.err, null);
  assert.equal(calls, 2);
});
test("an absent expired transaction requires reconciliation and abort is honored", async () => {
  const connection = new HttpConnection(
    "https://api.devnet.solana.com",
    "confirmed",
  );
  connection.getSignatureStatuses = async () => ({
    context: { slot: 10 },
    value: [null],
  });
  connection.getBlockHeight = async () => 11;
  await assert.rejects(
    connection.confirmTransaction({
      signature: "test",
      blockhash: "test",
      lastValidBlockHeight: 10,
    }),
    /reconcile/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    connection.confirmTransaction({
      signature: "test",
      blockhash: "test",
      lastValidBlockHeight: 10,
      abortSignal: controller.signal,
    }),
  );
});
