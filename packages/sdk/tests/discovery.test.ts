import * as anchor from "@anchor-lang/core";
import {
  DEPTH_PROGRAM_ID,
  marketAddress,
  transferAddress,
  depositAddress,
} from "@depthhq/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { FundingDiscovery } from "@/account/discovery";

test("settled allocation without an order is discoverable after a restart", async () => {
  const owner = PublicKey.unique();
  const nonce = 91n;
  const id = transferAddress(owner, nonce);
  const program = {
    programId: DEPTH_PROGRAM_ID,
    coder: {
      accounts: {
        memcmp: () => ({ offset: 0, bytes: "discriminator" }),
        decode: () => ({
          owner,
          market: marketAddress(),
          nonce: new anchor.BN(nonce.toString()),
          amount: new anchor.BN(250_000),
          status: { settled: {} },
          toMarket: true,
        }),
      },
    },
  } as unknown as anchor.Program;
  let orderId: PublicKey | undefined;
  let orderPresent = false;
  const connection = {
    getProgramAccounts: async () => [{ pubkey: id, account: {} }],
    getMultipleAccountsInfo: async (keys: PublicKey[]) => {
      if (keys[0].equals(id))
        return [{ owner: DEPTH_PROGRAM_ID, data: Buffer.alloc(1) }];
      orderId = keys[0];
      return orderPresent
        ? [{ owner: DEPTH_PROGRAM_ID, data: Buffer.alloc(1) }]
        : [null];
    },
  } as unknown as Connection;
  const page = await new FundingDiscovery(
    program,
    connection,
    owner,
  ).unpairedAllocations();
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].nonce, nonce);
  assert.equal(page.items[0].amount, 250_000n);
  assert.ok(page.items[0].id.equals(id));
  assert.ok(orderId && page.items[0].orderId.equals(orderId));
  assert.equal(page.nextCursor, null);
  orderPresent = true;
  const paired = await new FundingDiscovery(
    program,
    connection,
    owner,
  ).unpairedAllocations();
  assert.deepEqual(paired.items, []);
});

test("history pagination retains every canonical receipt while pending scans past terminal receipts", async () => {
  const owner = PublicKey.unique();
  const states = Array.from({ length: 30 }, (_, index) => ({
    owner,
    nonce: new anchor.BN(index + 1),
    status: index === 29 ? { crediting: {} } : { credited: {} },
  }));
  const keys = states.map((state) =>
    depositAddress(owner, BigInt(state.nonce.toString())),
  );
  const program = {
    programId: DEPTH_PROGRAM_ID,
    coder: {
      accounts: {
        memcmp: (name: string) => ({ offset: 0, bytes: name }),
        decode: (_name: string, data: Buffer) => states[data[0]],
      },
    },
  } as unknown as anchor.Program;
  const connection = {
    getProgramAccounts: async (
      _id: PublicKey,
      options: { filters: Array<{ memcmp: { bytes: string } }> },
    ) =>
      options.filters[0].memcmp.bytes === "depositReceipt"
        ? keys.map((pubkey) => ({ pubkey }))
        : [],
    getMultipleAccountsInfo: async (ids: PublicKey[]) =>
      ids.map((id) => ({
        owner: DEPTH_PROGRAM_ID,
        data: Buffer.from([keys.findIndex((key) => key.equals(id))]),
      })),
  } as unknown as Connection;
  const discovery = new FundingDiscovery(program, connection, owner);
  const found: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await discovery.history({ limit: 3, cursor });
    found.push(...page.items.map((item) => item.id.toBase58()));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(found, keys.map((key) => key.toBase58()).sort());
  assert.equal(new Set(found).size, 30);
  const pending = await discovery.pending({ limit: 1 });
  assert.equal(pending.items[0].nonce, 30n);
  assert.equal(pending.items[0].status, "crediting");
  states[0].owner = PublicKey.unique();
  await assert.rejects(discovery.history({ limit: 100 }), /owner changed/);
});
