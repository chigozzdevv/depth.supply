import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID, balanceAddress } from "@depthhq/bindings";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DepthClient } from "@/client/client";
import { balanceState } from "@/account/state";
import type { DepthView } from "@/view/view";

test("a new wallet has an uninitialized zero balance without opening an account or signing", async () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const address = balanceAddress(wallet.publicKey);
  const connection = new Connection("http://localhost:8899");
  connection.getAccountInfoAndContext = async (key) => {
    assert.ok(key.equals(address));
    return { context: { slot: 82 }, value: null };
  };
  const Constructor = DepthClient as unknown as new (
    options: DepthClient["options"],
  ) => DepthClient;
  const client = new Constructor({
    wallet,
    connection,
    deployment: { localnet: true },
  });
  client.requestBalanceView = async () => {
    throw new Error("Unexpected private view");
  };
  assert.equal((await client.account().state()).status, "uninitialized");
  assert.deepEqual(await client.account().summary(), {
    id: address.toBase58(),
    status: "uninitialized",
    amount: 0n,
    version: 0n,
    slot: 82,
  });
  connection.getAccountInfoAndContext = async () => {
    throw new Error("RPC unavailable");
  };
  await assert.rejects(client.account().summary(), /RPC unavailable/);
});

test("balance discovery checks account ownership, wallet identity, and lifecycle status", async () => {
  const owner = PublicKey.unique();
  let accountOwner = DEPTH_PROGRAM_ID;
  let wallet = owner;
  let status = "ready";
  const program = {
    programId: DEPTH_PROGRAM_ID,
    coder: {
      accounts: {
        decode: () => ({
          owner: wallet,
          status: { [status]: {} },
          version: new anchor.BN(7),
        }),
      },
    },
  } as unknown as anchor.Program;
  const connection = {
    getAccountInfoAndContext: async () => ({
      context: { slot: 83 },
      value: { owner: accountOwner, data: Buffer.alloc(8) },
    }),
  } as unknown as Connection;
  const read = () =>
    balanceState(program, connection, owner, balanceAddress(owner));
  assert.equal((await read()).version, 7n);
  status = "moving";
  assert.equal((await read()).status, "moving");
  status = "invalid";
  await assert.rejects(read(), /invalid status/);
  wallet = PublicKey.unique();
  await assert.rejects(read(), /does not belong/);
  accountOwner = PublicKey.unique();
  await assert.rejects(read(), /not owned/);
});

test("initialized balances still use an authenticated private view and close its receipt", async () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const Constructor = DepthClient as unknown as new (
    options: DepthClient["options"],
  ) => DepthClient;
  const client = new Constructor({
    wallet,
    connection: new Connection("http://localhost:8899"),
    deployment: { localnet: true },
  });
  client.account().state = async () => ({
    id: balanceAddress(wallet.publicKey).toBase58(),
    slot: 90,
    version: 2n,
    status: "ready",
  });
  const calls: string[] = [];
  client.requestBalanceView = async () => {
    calls.push("authorize");
    return {
      wait: async () => ({
        id: PublicKey.unique().toBase58(),
        slot: 91,
        version: 2n,
        status: "ready",
        amount: 500n,
      }),
      close: async () => {
        calls.push("close");
      },
    } as unknown as DepthView;
  };
  assert.equal((await client.account.summary()).amount, 500n);
  assert.deepEqual(calls, ["authorize", "close"]);
});
