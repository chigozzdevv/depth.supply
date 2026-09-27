import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { MakerClient } from "@/client/client";
import { QuoteHandle } from "@/quote/quote";

test("quote activation waits for private validation and stays pending until reserve callback", async () => {
  const maker = PublicKey.unique();
  const id = PublicKey.unique();
  let status = "validating";
  let submitted = 0;
  const client = {
    options: { maker, wallet: { publicKey: maker } },
    marketAddress: PublicKey.unique(),
    protocolAddress: PublicKey.unique(),
    marketAccount: () => PublicKey.unique(),
    quoteState: async () => ({
      status: { [status]: {} },
      capacity: new anchor.BN(1_000),
      remainingCapacity: new anchor.BN(1_000),
      attachedOrders: 0,
    }),
    queue: async () => ({}),
    program: {
      methods: {
        reserveQuote: () => ({
          accountsPartial: () => ({
            rpc: async () => {
              submitted += 1;
              status = "reserving";
              return "reserve-signature";
            },
          }),
        }),
      },
    },
  } as unknown as MakerClient;
  const handle = new QuoteHandle(id, "prepare-signature", client);
  const pending = await handle.activate({ timeoutMs: 0 });
  assert.equal(pending.status, "validating");
  assert.equal(submitted, 0);
  status = "validated";
  const reserved = await handle.activate({ timeoutMs: 0 });
  assert.equal(reserved.status, "reserving");
  assert.equal(handle.reserveSignature, "reserve-signature");
  assert.equal(submitted, 1);
  status = "active";
  assert.equal((await handle.wait({ timeoutMs: 0 })).status, "active");
  assert.equal((await handle.confirm({ timeoutMs: 0 })).quoteId.toBase58(), id.toBase58());
  assert.equal(await handle.capacity(), 1_000n);
});

test("flat quotes use published tiers within capacity", () => {
  const client = Object.create(MakerClient.prototype) as {
    flatQuote: (
      input: Record<string, unknown>,
      market: Record<string, unknown>,
      nonce: bigint,
    ) => {
      tiers: Array<{ size: bigint; bidE8: bigint; askE8: bigint }>;
      expiresAt: number;
    };
  };
  const market = {
    config: {
      quoteTiers: [1_000, 10_000, 100_000, 1_000_000].map(
        (value) => new anchor.BN(value),
      ),
      maxQuoteLifetimeSeconds: 120,
    },
  };
  const input = {
    marketId: "SOL-USD",
    bidE8: 19_900_000_000n,
    askE8: 20_100_000_000n,
    maxCapacity: 100_000n,
    validForSeconds: 30,
  };
  const quote = client.flatQuote(input, market, 9n);
  assert.deepEqual(
    quote.tiers.map((tier) => tier.size),
    [1_000n, 10_000n, 100_000n],
  );
  assert.ok(quote.tiers.every((tier) => tier.bidE8 === input.bidE8));
  assert.ok(quote.expiresAt > Math.floor(Date.now() / 1_000));
  assert.throws(
    () => client.flatQuote({ ...input, maxCapacity: 999n }, market, 9n),
    /below the first quote tier/,
  );
  assert.throws(
    () => client.flatQuote({ ...input, validForSeconds: 121 }, market, 9n),
    /outside market policy/,
  );
});

test("cancellation stops selection before releasing reserved margin", async () => {
  const maker = PublicKey.unique();
  const id = PublicKey.unique();
  let status = "active";
  const calls: string[] = [];
  const client = {
    options: { maker, wallet: { publicKey: maker } },
    marketAddress: PublicKey.unique(),
    protocolAddress: PublicKey.unique(),
    marketAccount: () => PublicKey.unique(),
    quoteState: async () => ({
      status: { [status]: {} },
      capacity: new anchor.BN(1_000),
      remainingCapacity: new anchor.BN(1_000),
      attachedOrders: 0,
    }),
    queue: async () => ({}),
    program: {
      methods: {
        stopQuote: () => ({
          accountsPartial: () => ({
            rpc: async () => {
              calls.push("stop");
              status = "closing";
              return "stop-signature";
            },
          }),
        }),
        releaseQuote: () => ({
          accountsPartial: () => ({
            rpc: async () => {
              calls.push("release");
              status = "releasing";
              return "release-signature";
            },
          }),
        }),
      },
    },
  } as unknown as MakerClient;
  const handle = new QuoteHandle(id, undefined, client);
  const pending = await handle.cancel();
  assert.deepEqual(calls, ["stop", "release"]);
  assert.equal(pending.status, "releasing");
  assert.equal(handle.releaseSignature, "release-signature");
});
