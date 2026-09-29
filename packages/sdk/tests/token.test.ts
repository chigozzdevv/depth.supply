import * as anchor from "@anchor-lang/core";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  associatedTokenAddress,
  destinationTokenAccount,
  sourceTokenAccount,
} from "@/account/token";

test("deposit source selection prefers a funded associated token account", async () => {
  const owner = PublicKey.unique();
  const mint = PublicKey.unique();
  const associated = associatedTokenAddress(owner, mint);
  const alternate = PublicKey.unique();
  const tokenProgram = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );
  const account = (amount: bigint) => {
    const data = Buffer.alloc(165);
    mint.toBuffer().copy(data, 0);
    owner.toBuffer().copy(data, 32);
    data.writeBigUInt64LE(amount, 64);
    data[108] = 1;
    return { owner: tokenProgram, data };
  };
  const connection = {
    getTokenAccountsByOwner: async () => ({
      value: [
        { pubkey: alternate, account: account(100n) },
        { pubkey: associated, account: account(50n) },
      ],
    }),
  } as unknown as Connection;
  assert.ok(
    (await sourceTokenAccount(connection, owner, mint, 40n)).equals(associated)
  );
  assert.ok(
    (await sourceTokenAccount(connection, owner, mint, 75n)).equals(alternate)
  );
  await assert.rejects(
    sourceTokenAccount(connection, owner, mint, 101n),
    /covers the deposit/
  );
});

test("withdrawal destination creates and verifies the owner's associated account", async () => {
  const owner = PublicKey.unique();
  const mint = PublicKey.unique();
  const tokenProgram = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );
  const address = associatedTokenAddress(owner, mint);
  const data = Buffer.alloc(165);
  mint.toBuffer().copy(data, 0);
  owner.toBuffer().copy(data, 32);
  data[108] = 1;
  let created = false;
  const provider = {
    wallet: { publicKey: owner },
    connection: {
      getAccountInfo: async () =>
        created ? { owner: tokenProgram, data } : null,
    },
    sendAndConfirm: async (transaction: Transaction) => {
      assert.equal(transaction.instructions.length, 1);
      assert.equal(transaction.instructions[0].data[0], 1);
      assert.ok(transaction.instructions[0].keys[1].pubkey.equals(address));
      created = true;
      return "created";
    },
  } as unknown as anchor.AnchorProvider;
  assert.ok(
    (await destinationTokenAccount(provider, owner, mint)).equals(address)
  );
  assert.equal(created, true);
});
