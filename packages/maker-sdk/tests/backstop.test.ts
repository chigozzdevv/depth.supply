import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID } from "@depth/bindings";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { BackstopHandle } from "@/backstop/backstop";
import type { MakerClient } from "@/client/client";

function fixture(operator = false) {
  const maker = PublicKey.unique();
  const marketAddress = PublicKey.unique();
  const accountAddress = PublicKey.unique();
  const protocolAddress = PublicKey.unique();
  let state = "reserving";
  const calls: Array<{ name: string; accounts: Record<string, PublicKey> }> = [];
  let offerId: PublicKey;
  const nonce = 41n;
  const client = {
    options: {
      maker,
      wallet: { publicKey: operator ? PublicKey.unique() : maker },
      connection: { getAccountInfo: async () => null },
    },
    marketAddress,
    protocolAddress,
    marketAccount: () => accountAddress,
    read: async (name: string) => {
      if (name === "Market")
        return {
          status: { active: {} },
          backstopOffer: PublicKey.default,
          pendingOrders: 0,
          oracleTimestamp: new anchor.BN(Math.floor(Date.now() / 1_000)),
          config: {
            initialMarginBps: 1_000,
            maxAccountNotional: new anchor.BN(10_000_000),
            backstopMinCollateral: new anchor.BN(100_000),
            maxOracleAgeSeconds: 60,
          },
        };
      if (name === "MarketAccount")
        return { owner: maker, market: marketAddress, status: { ready: {} } };
      if (name === "BackstopOffer")
        return {
          maker,
          market: marketAddress,
          nonce: new anchor.BN(nonce.toString()),
          capacity: new anchor.BN(2_000_000),
          margin: new anchor.BN(200_000),
          expiry: new anchor.BN(Math.floor(Date.now() / 1_000) + 300),
          status: { [state]: {} },
        };
      throw new Error(`Unexpected account ${name}`);
    },
    queue: async () => ({}),
    program: {
      methods: {
        offerBackstop: () => ({
          accountsPartial: (accounts: Record<string, PublicKey>) => ({
            rpc: async () => {
              calls.push({ name: "offer", accounts });
              offerId = accounts.offer;
              return "offer-signature";
            },
          }),
        }),
        releaseBackstop: () => ({
          accountsPartial: (accounts: Record<string, PublicKey>) => ({
            rpc: async () => {
              calls.push({ name: "release", accounts });
              state = "releasing";
              return "release-signature";
            },
          }),
        }),
        closeBackstop: () => ({
          accountsPartial: (accounts: Record<string, PublicKey>) => ({
            rpc: async () => {
              calls.push({ name: "close", accounts });
              return "close-signature";
            },
          }),
        }),
      },
    },
  } as unknown as MakerClient;
  return {
    client,
    calls,
    nonce,
    maker,
    marketAddress,
    get offerId() {
      return offerId;
    },
    setState(value: string) {
      state = value;
    },
  };
}

test("owner offer uses the canonical nonce address and resumes through callback states", async () => {
  const run = fixture();
  const handle = await BackstopHandle.offer(run.client, {
    marketId: "SOL-USD",
    maxCapacity: 2_000_000n,
    validForSeconds: 300,
    clientNonce: run.nonce,
  });
  const expected = PublicKey.findProgramAddressSync(
    [
      Buffer.from("backstop"),
      run.marketAddress.toBuffer(),
      run.maker.toBuffer(),
      new anchor.BN(run.nonce.toString()).toArrayLike(Buffer, "le", 8),
    ],
    DEPTH_PROGRAM_ID,
  )[0];
  assert.equal(handle.id.toBase58(), expected.toBase58());
  assert.equal(run.offerId.toBase58(), expected.toBase58());
  assert.equal(run.calls[0]?.name, "offer");
  await assert.rejects(handle.confirm({ timeoutMs: 0 }), /reserving/);
  run.setState("active");
  assert.equal((await handle.confirm({ timeoutMs: 0 })).snapshot.margin, 200_000n);
  run.setState("consumed");
  assert.equal((await handle.confirm({ timeoutMs: 0 })).snapshot.status, "consumed");
});

test("release confirms only after the private callback and closes terminal records", async () => {
  const run = fixture();
  const handle = new BackstopHandle(
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("backstop"),
        run.marketAddress.toBuffer(),
        run.maker.toBuffer(),
        new anchor.BN(run.nonce.toString()).toArrayLike(Buffer, "le", 8),
      ],
      DEPTH_PROGRAM_ID,
    )[0],
    run.client,
  );
  run.setState("active");
  const release = await handle.release();
  assert.equal(release.signature, "release-signature");
  assert.equal(run.calls[0]?.accounts.actor.toBase58(), run.maker.toBase58());
  await assert.rejects(release.confirm({ timeoutMs: 0 }), /releasing/);
  run.setState("cancelled");
  assert.equal((await release.confirm({ timeoutMs: 0 })).status, "cancelled");
  assert.equal(await handle.close(), "close-signature");
  assert.equal(run.calls[1]?.name, "close");
});

test("offer rejects inadequate capacity and operator signing before queueing", async () => {
  const run = fixture();
  await assert.rejects(
    BackstopHandle.offer(run.client, {
      marketId: "SOL-USD",
      maxCapacity: 900_000n,
      validForSeconds: 300,
      clientNonce: run.nonce,
    }),
    /outside the current market policy/,
  );
  const operatorRun = fixture(true);
  await assert.rejects(
    BackstopHandle.offer(operatorRun.client, {
      marketId: "SOL-USD",
      maxCapacity: 2_000_000n,
      validForSeconds: 300,
      clientNonce: run.nonce,
    }),
    /Only the maker owner/,
  );
  assert.equal(run.calls.length, 0);
});
