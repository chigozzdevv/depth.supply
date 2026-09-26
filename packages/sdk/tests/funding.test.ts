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
  client.read = async (name) => {
    if (name === "Protocol") return { settlementMint: mint, vault } as never;
    if (name === "BalanceAccount")
      return { owner, status: { ready: {} } } as never;
    return {
      owner,
      status: { [receiptState]: {} },
      amount: new anchor.BN(50),
    } as never;
  };

  await assert.rejects(
    client.deposit(PublicKey.unique(), 1n << 64n),
    /unsigned 64-bit/,
  );
  assert.deepEqual(calls, []);
  const handle = await client.deposit(PublicKey.unique(), 50n);
  assert.equal(handle.signature, "deposit-signature");
  assert.equal(await handle.status(), "pending");
  assert.equal(await handle.credit(), "credit-signature");
  receiptState = "credited";
  await assert.rejects(handle.refund(PublicKey.unique()), /not refundable/);
  assert.deepEqual(calls, ["deposit", "credit"]);

  const other = funding(PublicKey.unique(), []);
  other.read = client.read;
  await assert.rejects(
    new DepositHandle(other, handle.nonce).status(),
    /unavailable/,
  );
});

test("withdrawal status never treats an unrelated balance update as payment proof", async () => {
  const owner = PublicKey.unique();
  const destination = PublicKey.unique();
  const calls: string[] = [];
  const client = funding(owner, calls);
  let version = 7n;
  let state = "withdrawing";
  client.read = async () =>
    ({
      owner,
      version: new anchor.BN(version.toString()),
      status: { [state]: {} },
      pendingAmount: new anchor.BN(25),
      pendingDestination: destination,
    }) as never;
  const handle = new WithdrawalHandle(
    client,
    7n,
    25n,
    destination,
    "request-signature",
  );
  assert.equal(await handle.status(), "queued");
  assert.equal(await handle.cancel(), "cancel-signature");
  state = "ready";
  assert.equal(await handle.status(), "rejected");
  await assert.rejects(handle.cancel(), /not queued/);
  version = 8n;
  assert.equal(await handle.status(), "balance_advanced");
  assert.deepEqual(calls, ["cancel"]);
});
