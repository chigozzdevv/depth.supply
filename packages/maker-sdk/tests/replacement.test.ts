import { PublicKey } from "@solana/web3.js";
import * as anchor from "@anchor-lang/core";
import assert from "node:assert/strict";
import { test } from "node:test";
import { QuoteReplacement } from "@/quote/replacement";
import type { MakerClient } from "@/client/client";

test("quote replacement resumes a closing quote and preserves the successor nonce", async () => {
  const priorId = PublicKey.unique();
  const maker = PublicKey.unique();
  let priorStatus = "closing";
  let cancellations = 0;
  let replacementNonce: bigint | undefined;
  const published: Array<{ clientNonce?: bigint }> = [];
  let successor: PublicKey | undefined;
  const client = {
    marketAddress: PublicKey.unique(),
    program: {
      programId: PublicKey.unique(),
      methods: {
        beginQuoteReplacement: (nonce: anchor.BN) => ({
          accountsPartial: () => ({
            rpc: async () => {
              replacementNonce = BigInt(nonce.toString());
            },
          }),
        }),
      },
    },
    options: {
      maker,
      wallet: { publicKey: maker },
      connection: {
        getAccountInfo: async (id: PublicKey) =>
          id.equals(priorId) || successor?.equals(id) ? {} : null,
      },
    },
    quote: {
      get: (id: PublicKey) => ({
        id,
        status: async () => ({
          id: id.toBase58(),
          status: id.equals(priorId) ? priorStatus : "validated",
          maxCapacity: 1n,
          attachedOrders: 0,
          replacementNonce,
        }),
        cancel: async () => {
          cancellations++;
          priorStatus = "cancelled";
        },
      }),
      publish: async (input: { clientNonce?: bigint }) => {
        published.push(input);
        return client.quote.get(successor!);
      },
    },
    quoteState: async () => ({
      replacementNonce:
        replacementNonce === undefined
          ? null
          : new anchor.BN(replacementNonce.toString()),
    }),
  } as unknown as MakerClient;
  const flow = new QuoteReplacement(client, priorId, 77n);
  successor = flow.nextId;
  assert.equal((await flow.status()).phase, "publishing");
  successor = undefined;
  assert.equal((await flow.status()).phase, "stopping");
  successor = flow.nextId;
  const quote = await flow.resume(
    {
      tiers: [{ size: 1n, bidE8: 1n, askE8: 2n }],
      maxCapacity: 1n,
      expiresAt: 2_000_000_000,
      clientNonce: 77n,
    },
    { timeoutMs: 1_000, pollMs: 100 },
  );
  assert.equal(quote.id.toBase58(), flow.nextId.toBase58());
  assert.equal(cancellations, 1);
  assert.equal(replacementNonce, 77n);
  assert.equal(published.length, 1);
  await assert.rejects(
    flow.resume({
      tiers: [],
      maxCapacity: 1n,
      expiresAt: 2_000_000_000,
      clientNonce: 78n,
    }),
    /different client nonce/,
  );
});
