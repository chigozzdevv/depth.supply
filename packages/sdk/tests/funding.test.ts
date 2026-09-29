import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID } from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DepositHandle,
  FundingClient,
  WithdrawalHandle,
} from "@/account/funding";

function funding(owner: PublicKey, calls: string[]): FundingClient {
  const method =
    (name: string) =>
    (..._args: unknown[]) => ({
      accountsPartial: (_accounts: Record<string, PublicKey>) => ({
        rpc: async () => {
          calls.push(name);
          return `${name}-signature`;
        },
      }),
    });
  const program = {
    programId: DEPTH_PROGRAM_ID,
    provider: { wallet: { publicKey: owner } },
    methods: {
      deposit: method("deposit"),
      creditDeposit: method("credit"),
      refundDeposit: method("refund"),
      cancelWithdrawal: method("cancel"),
    },
  } as unknown as anchor.Program;
  return new FundingClient(program, {} as Connection, owner, async () => ({}));
}

test("deposit lifecycle validates amount, owner, and receipt state before signing", async () => {
  const owner = PublicKey.unique();
  const calls: string[] = [];
  const client = funding(owner, calls);
  const mint = PublicKey.unique();
  const vault = PublicKey.unique();
  let receiptState = "pending";
  let exists = false;
  client.read = async (name) => {
    if (name === "Protocol") return { settlementMint: mint, vault } as never;
    if (name === "BalanceAccount")
      return { owner, status: { ready: {} } } as never;
    if (!exists) return undefined;
    return {
      owner,
      status: { [receiptState]: {} },
      amount: new anchor.BN(50),
    } as never;
  };

  await assert.rejects(
    client.deposit(PublicKey.unique(), 1n << 64n, 9n),
    /unsigned 64-bit/
  );
  assert.deepEqual(calls, []);
  const handle = await client.deposit(PublicKey.unique(), 50n, 9n);
  exists = true;
  assert.equal(handle.signature, "deposit-signature");
  assert.equal(
    (await client.deposit(PublicKey.unique(), 50n, 9n)).id.toBase58(),
    handle.id.toBase58()
  );
  await assert.rejects(
    client.deposit(PublicKey.unique(), 51n, 9n),
    /bound to another request/
  );
  assert.equal(await handle.status(), "pending");
  assert.equal(await handle.credit(), "credit-signature");
  receiptState = "credited";
  await assert.rejects(handle.refund(PublicKey.unique()), /not refundable/);
  assert.deepEqual(calls, ["deposit", "credit"]);

  const other = funding(PublicKey.unique(), []);
  other.read = client.read;
  await assert.rejects(
    new DepositHandle(other, handle.nonce).status(),
    /unavailable/
  );
});

test("withdrawal receipts preserve the exact payout outcome across later balance changes", async () => {
  const owner = PublicKey.unique();
  const calls: string[] = [];
  const client = funding(owner, calls);
  let state = "queued";
  let receiptOwner = owner;
  client.read = async (name) => {
    assert.equal(name, "WithdrawalReceipt");
    return {
      owner: receiptOwner,
      balance: client.balance,
      status: { [state]: {} },
    } as never;
  };
  const handle = client.withdrawalHandle(7n);
  assert.equal(await handle.status(), "queued");
  assert.equal(await handle.cancel(), "cancel-signature");
  for (const terminal of ["paid", "cancelled", "rejected"] as const) {
    state = terminal;
    assert.equal(await client.withdrawalHandle(7n).status(), terminal);
    await assert.rejects(handle.cancel(), /not queued/);
  }
  receiptOwner = PublicKey.unique();
  await assert.rejects(handle.status(), /unavailable/);
  assert.deepEqual(calls, ["cancel"]);
});

test("deposit confirmation reconciles a keeper credit race", async () => {
  const owner = PublicKey.unique();
  const client = funding(owner, []);
  let state = "pending";
  client.read = async (name) => {
    assert.equal(name, "DepositReceipt");
    return {
      owner,
      amount: new anchor.BN(50),
      status: { [state]: {} },
    } as never;
  };
  client.creditDeposit = async () => {
    state = "credited";
    throw new Error("Keeper submitted the credit first");
  };
  const handle = client.depositHandle(42n);
  assert.equal(
    await handle.confirm({ timeoutMs: 500, pollMs: 100 }),
    "credited"
  );
});
