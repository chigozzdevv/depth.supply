import * as anchor from "@anchor-lang/core";
import { DEPTH_IDL, DEPTH_PROGRAM_ID, circuits } from "@depth/bindings";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { FundingClient } from "@/account/funding";
import { applyDepthComputeBudget } from "@/chain/provider";

function program() {
  const wallet = new anchor.Wallet(Keypair.generate());
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  return new anchor.Program(
    DEPTH_IDL,
    new anchor.AnchorProvider(connection, wallet, {}),
  );
}

test("the largest four-quote order fits a signed Solana transaction", async () => {
  const client = program();
  const definition = client.idl.instructions.find(
    (ix) => ix.name === "submitOrder",
  )!;
  const accounts: Record<string, PublicKey> = {};
  for (const account of definition.accounts) {
    if ("accounts" in account) throw new Error("Unexpected nested account");
    accounts[account.name] = account.address
      ? new PublicKey(account.address)
      : PublicKey.unique();
  }
  const packed = circuits.OrderInput.pack({
    side: -1n,
    size: 5_000_000n,
    margin: 200_000n,
    limit_price: 19_900_000_000n,
    max_fee: 1000n,
    intent: 2n,
    version: 10n,
  });
  assert.equal(packed.length, 2);
  assert.equal(circuits.OrderInput.unpack(packed).side, -1n);
  const ix = await client.methods
    .submitOrder(
      new anchor.BN(1),
      new anchor.BN(2),
      PublicKey.unique(),
      2,
      new anchor.BN(1),
      new anchor.BN(100),
      new anchor.BN(1),
      new anchor.BN(1),
      [Array(32).fill(1), Array(32).fill(2)],
      Array(32).fill(3),
      new anchor.BN(4),
    )
    .accountsStrict(accounts)
    .remainingAccounts(
      Array.from({ length: 7 }, (_, index) => ({
        pubkey: PublicKey.unique(),
        isSigner: false,
        isWritable: index === 6,
      })),
    )
    .instruction();
  const transaction = new Transaction({
    feePayer: accounts.trader,
    recentBlockhash: PublicKey.unique().toBase58(),
  }).add(ix);
  applyDepthComputeBudget(transaction);
  const bytes = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  assert.ok(bytes.length <= 1232, `order requires ${bytes.length} bytes`);
});

test("SDK receipt reads use the real Anchor coder's normalized account names", async () => {
  const client = program();
  const owner = (client.provider as anchor.AnchorProvider).wallet.publicKey;
  const connection = (client.provider as anchor.AnchorProvider).connection;
  const funding = new FundingClient(
    client,
    connection,
    owner,
    async () => ({}),
  );
  const data = await client.coder.accounts.encode("withdrawalReceipt", {
    owner,
    balance: funding.balance,
    destination: PublicKey.unique(),
    computation: PublicKey.unique(),
    nonce: new anchor.BN(1),
    amount: new anchor.BN(100),
    version: new anchor.BN(0),
    status: { paid: {} },
    bump: 1,
  });
  connection.getAccountInfo = async () => ({
    owner: DEPTH_PROGRAM_ID,
    data,
    executable: false,
    lamports: 1,
  });
  assert.equal(await funding.withdrawalHandle(1n).status(), "paid");
});
