import * as anchor from "@anchor-lang/core";
import {
  DEPTH_PROGRAM_ID,
  marketAddress,
  transferAddress,
} from "@depth/bindings";
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
    owner
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
    owner
  ).unpairedAllocations();
  assert.deepEqual(paired.items, []);
});
