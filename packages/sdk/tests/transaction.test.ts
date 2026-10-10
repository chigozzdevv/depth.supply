import assert from "node:assert/strict";
import { test } from "node:test";
import * as anchor from "@anchor-lang/core";
import { DEPTH_IDL, DEPTH_PROGRAM_ID, depositAddress } from "@depthhq/bindings";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import { depthInstructions, receiptTransaction } from "@/chain/transaction";
import { FundingDiscovery } from "@/account/discovery";

const program = new anchor.Program(
  DEPTH_IDL,
  new anchor.AnchorProvider(
    new Connection("http://127.0.0.1:8899"),
    new anchor.Wallet(Keypair.generate()),
    {},
  ),
);
const receipt = PublicKey.unique();

function response(name: string, failed = false): VersionedTransactionResponse {
  const definition = program.idl.instructions.find((ix) => ix.name === name)!;
  const message = new TransactionMessage({
    payerKey: PublicKey.unique(),
    recentBlockhash: PublicKey.unique().toBase58(),
    instructions: [
      new TransactionInstruction({
        programId: DEPTH_PROGRAM_ID,
        keys: definition.accounts.map((account) => ({
          pubkey:
            account.name === "order" || account.name === "transfer"
              ? receipt
              : PublicKey.unique(),
          isSigner: false,
          isWritable: "writable" in account && Boolean(account.writable),
        })),
        data: Buffer.from(definition.discriminator),
      }),
    ],
  }).compileToV0Message();
  return {
    slot: 1,
    transaction: { message, signatures: [] },
    meta: {
      err: failed ? { InstructionError: [0, "InvalidArgument"] } : null,
      fee: 1,
      preBalances: [],
      postBalances: [],
    },
  } as VersionedTransactionResponse;
}

test("receipt hashes exclude read-only private views and failed mutations", async () => {
  const connection = {
    getSignaturesForAddress: async () => [
      { signature: "view", slot: 3, err: null },
      { signature: "failed", slot: 2, err: {} },
      { signature: "submission", slot: 1, err: null },
    ],
    getTransaction: async (signature: string) =>
      response(signature === "view" ? "requestFillView" : "submitOrder"),
  } as unknown as Connection;
  assert.equal(
    (await receiptTransaction(connection, program, receipt)).signature,
    "submission",
  );
  assert.deepEqual(await receiptTransaction(connection, program, receipt), {
    signature: "submission",
    slot: 1,
  });
});

test("historical margin releases retain the prior deployed callback layout and actual block time", async () => {
  const transaction = response("debitMarketV2Callback");
  transaction.transaction.message.compiledInstructions[0].data = Buffer.from(
    "057da1a57b4b7ec6",
    "hex",
  );
  transaction.blockTime = 1_791_412_345;
  assert.equal(
    depthInstructions(transaction, program)[0].definition.name,
    "debitMarketCallback",
  );
  const connection = {
    getSignaturesForAddress: async () => [
      { signature: "legacy-release", slot: 11, err: null },
    ],
    getTransaction: async () => transaction,
  } as unknown as Connection;
  assert.deepEqual(
    await receiptTransaction(connection, program, receipt, [
      "debitMarketV2Callback",
      "debitMarketCallback",
    ]),
    { signature: "legacy-release", slot: 11, timestamp: 1_791_412_345 },
  );
  await assert.rejects(
    receiptTransaction(connection, program, receipt, ["creditMarketCallback"]),
    /not found/,
  );
});

test("transaction lookup rejects a foreign owner, noncanonical address, or mismatched nonce before scanning hashes", async () => {
  const owner = PublicKey.unique();
  const state = { owner, nonce: new anchor.BN(91), status: { credited: {} } };
  const fakeProgram = {
    programId: DEPTH_PROGRAM_ID,
    coder: { accounts: { decode: () => state } },
  } as unknown as anchor.Program;
  const connection = {
    getAccountInfo: async () => ({
      owner: DEPTH_PROGRAM_ID,
      data: Buffer.alloc(1),
    }),
    getSignaturesForAddress: async () => {
      throw new Error("Should not scan invalid receipts");
    },
  } as unknown as Connection;
  const discovery = new FundingDiscovery(fakeProgram, connection, owner);
  await assert.rejects(
    discovery.transaction({
      id: PublicKey.unique(),
      kind: "deposit",
      status: "credited",
      nonce: 91n,
    }),
    /canonical/,
  );
  await assert.rejects(
    discovery.transaction({
      id: depositAddress(owner, 91n),
      kind: "deposit",
      status: "credited",
      nonce: 92n,
    }),
    /does not match/,
  );
  state.owner = PublicKey.unique();
  await assert.rejects(
    discovery.transaction({
      id: depositAddress(owner, 91n),
      kind: "deposit",
      status: "credited",
      nonce: 91n,
    }),
    /owner/,
  );
});
