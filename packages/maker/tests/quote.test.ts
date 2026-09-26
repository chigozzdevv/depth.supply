import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MakerClient } from "@/client";
import { QuoteHandle } from "@/quote";

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
