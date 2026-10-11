import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
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

test("private balances authorize once per version and defer receipt cleanup", async () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const Constructor = DepthClient as unknown as new (
    options: DepthClient["options"],
  ) => DepthClient;
  const client = new Constructor({
    wallet,
    connection: new Connection("http://localhost:8899"),
    deployment: { localnet: true },
  });
  client.options.connection.getAccountInfo = async () => null;
  let version = 2n;
  client.account().state = async () => ({
    id: balanceAddress(wallet.publicKey).toBase58(),
    slot: 90,
    version,
    status: "ready",
  });
  const calls: string[] = [];
  client.requestBalanceView = async () => {
    calls.push("authorize");
    return {
      deferClose: async () => {},
      wait: async () => ({
        id: PublicKey.unique().toBase58(),
        slot: 91,
        version,
        status: "ready",
        amount: 500n,
      }),
      close: async () => {
        calls.push("close");
      },
    } as unknown as DepthView;
  };
  assert.equal((await client.account.summary()).amount, 500n);
  assert.equal((await client.account.summary()).amount, 500n);
  assert.deepEqual(calls, ["authorize"]);
  version = 3n;
  await Promise.all([client.account.summary(), client.account.summary()]);
  assert.deepEqual(calls, ["authorize", "authorize"]);
});

test("a new client after refresh reuses the same wallet's current encrypted view without signing", async () => {
  globalThis.indexedDB = fakeIndexedDB;
  const wallet = new anchor.Wallet(Keypair.generate());
  const Constructor = DepthClient as unknown as new (
    options: DepthClient["options"],
  ) => DepthClient;
  const options = {
    wallet,
    connection: new Connection("http://localhost:8899"),
    privateViews: "device" as const,
    deployment: {
      manifest: { payload: { genesisHash: "reload-test" } },
      trustedSigner: wallet.publicKey,
    } as DepthClient["options"]["deployment"],
  };
  options.connection.getAccountInfo = async () => null;
  let version = 2n;
  let approvals = 0;
  const create = () => {
    const client = new Constructor(options);
    client.account().state = async () => ({
      id: balanceAddress(wallet.publicKey).toBase58(),
      status: "ready",
      version,
      slot: 90,
    });
    client.requestBalanceView = async () => {
      approvals++;
      return {
        deferClose: async () => {},
        wait: async () => ({
          status: "ready",
          id: PublicKey.unique().toBase58(),
          version,
          slot: 91,
          amount: 500n,
        }),
      } as unknown as DepthView;
    };
    return client;
  };
  assert.equal((await create().account.summary()).amount, 500n);
  assert.equal((await create().account.summary()).amount, 500n);
  assert.equal(approvals, 1);
  version = 3n;
  assert.equal((await create().account.summary()).amount, 500n);
  assert.equal(approvals, 2);
});

test("cached sponsored receipts never become owner-signed cleanup instructions", async () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const Constructor = DepthClient as unknown as new (
    options: DepthClient["options"],
  ) => DepthClient;
  for (const payer of [wallet.publicKey, PublicKey.unique()]) {
    const connection = new Connection("http://localhost:8899");
    connection.getAccountInfo = async () => ({
      owner: DEPTH_PROGRAM_ID,
      data: Buffer.alloc(8),
      executable: false,
      lamports: 1,
    });
    const client = new Constructor({
      wallet,
      connection,
      deployment: { localnet: true },
    });
    client.program.coder.accounts.decode = (() => ({
      owner: payer,
      status: { ready: {} },
    })) as typeof client.program.coder.accounts.decode;
    client.account().state = async () => ({
      id: balanceAddress(wallet.publicKey).toBase58(),
      slot: 90,
      version: 2n,
      status: "ready",
    });
    client.requestBalanceView = async () =>
      ({
        deferClose: async () => {},
        wait: async () => ({
          id: PublicKey.unique().toBase58(),
          slot: 91,
          version: 2n,
          status: "ready",
          amount: 500n,
        }),
      }) as unknown as DepthView;
    let cleanup = 0;
    client.provider.deferClose = () => {
      cleanup++;
    };
    await client.account().summary();
    await client.account().summary();
    assert.equal(cleanup, payer.equals(wallet.publicKey) ? 1 : 0);
  }
});
