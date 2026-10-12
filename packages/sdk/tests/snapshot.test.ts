import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MarketState } from "@/client/types";
import { quoteSnapshot } from "@/trade/snapshot";

function fixture() {
  const address = PublicKey.unique();
  const backstop = PublicKey.unique();
  const first = PublicKey.unique();
  const next = PublicKey.unique();
  const market = (quote: PublicKey) =>
    ({
      backstopOffer: backstop,
      activeQuotes: [quote],
      activeQuoteCount: 1,
    }) as MarketState;
  const initial = market(first);
  const latest = market(next);
  const quote = {
    status: { active: {} },
    expiry: new anchor.BN(Math.floor(Date.now() / 1000) + 120),
    market: address,
  };
  const records: unknown[] = [initial, latest, quote];
  const account = (
    index: number,
    owner = DEPTH_PROGRAM_ID,
  ): AccountInfo<Buffer> => ({
    owner,
    executable: false,
    lamports: 1,
    rentEpoch: 0,
    data: Buffer.from([index]),
  });
  const program = {
    coder: {
      accounts: { decode: (_name: string, data: Buffer) => records[data[0]] },
    },
  } as unknown as anchor.Program;
  return {
    address,
    backstop,
    first,
    next,
    initial,
    latest,
    quote,
    account,
    program,
  };
}

test("retries an atomic quote rotation and returns one consistent bank snapshot", async () => {
  const state = fixture();
  const batches: PublicKey[][] = [];
  const connection = {
    getMultipleAccountsInfo: async (keys: PublicKey[]) => {
      batches.push(keys);
      return batches.length === 1
        ? [state.account(1), state.account(2), null]
        : [state.account(1), state.account(2), state.account(2)];
    },
  } as unknown as Connection;
  const snapshot = await quoteSnapshot(
    connection,
    state.program,
    state.address,
    state.initial,
  );
  assert.deepEqual(batches, [
    [state.address, state.backstop, state.first],
    [state.address, state.backstop, state.next],
  ]);
  assert.equal(snapshot.market, state.latest);
  assert.deepEqual(snapshot.keys, [state.backstop, state.next]);
});

test("does not admit a trade against expired or unrelated quotes", async () => {
  const state = fixture();
  const connection = {
    getMultipleAccountsInfo: async () => [
      state.account(0),
      state.account(2),
      state.account(2),
    ],
  } as unknown as Connection;
  state.quote.expiry = new anchor.BN(Math.floor(Date.now() / 1000) - 1);
  await assert.rejects(
    quoteSnapshot(connection, state.program, state.address, state.initial),
    /Waiting for maker liquidity/,
  );
  state.quote.expiry = new anchor.BN(Math.floor(Date.now() / 1000) + 120);
  state.quote.market = PublicKey.unique();
  await assert.rejects(
    quoteSnapshot(connection, state.program, state.address, state.initial),
    /Waiting for maker liquidity/,
  );
});

test("rejects quote accounts owned by another program", async () => {
  const state = fixture();
  const connection = {
    getMultipleAccountsInfo: async () => [
      state.account(0),
      state.account(2),
      state.account(2, PublicKey.unique()),
    ],
  } as unknown as Connection;
  await assert.rejects(
    quoteSnapshot(connection, state.program, state.address, state.initial),
    /Market quote snapshot missing account 1/,
  );
});
