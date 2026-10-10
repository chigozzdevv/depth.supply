import assert from "node:assert/strict";
import { test } from "node:test";
import * as anchor from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import { DEPTH_IDL, DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import { settlementOrder, settlementTransaction } from "@/chain/settlement";

const program = new anchor.Program(
  DEPTH_IDL,
  new anchor.AnchorProvider(
    new Connection("http://127.0.0.1:8899"),
    new anchor.Wallet(Keypair.generate()),
    {},
  ),
);
const definition = program.idl.instructions.find(
  (ix) => ix.name === "sealClearingCallback",
)!;
const orderId = PublicKey.unique();

function transaction(
  options: {
    wrongProgram?: boolean;
    wrongInstruction?: boolean;
    failed?: boolean;
    inner?: boolean;
  } = {},
): VersionedTransactionResponse {
  const keys = definition.accounts.map((account) => ({
    pubkey: account.name === "order" ? orderId : PublicKey.unique(),
    isSigner: false,
    isWritable: true,
  }));
  const message = new TransactionMessage({
    payerKey: PublicKey.unique(),
    recentBlockhash: PublicKey.unique().toBase58(),
    instructions: [
      new TransactionInstruction({
        programId: options.wrongProgram ? PublicKey.unique() : DEPTH_PROGRAM_ID,
        keys,
        data: Buffer.from(
          options.wrongInstruction
            ? Array(8).fill(0)
            : definition.discriminator,
        ),
      }),
    ],
  }).compileToV0Message();
  const ix = message.compiledInstructions[0];
  const innerInstructions = options.inner
    ? [
        {
          index: 0,
          instructions: [
            {
              programIdIndex: ix.programIdIndex,
              accounts: ix.accountKeyIndexes,
              data: anchor.utils.bytes.bs58.encode(ix.data),
            },
          ],
        },
      ]
    : [];
  if (options.inner) message.compiledInstructions.splice(0);
  return {
    slot: 20,
    transaction: { message, signatures: [] },
    meta: {
      err: options.failed ? { InstructionError: [0, "InvalidArgument"] } : null,
      fee: 1,
      preBalances: [],
      postBalances: [],
      innerInstructions,
    },
  } as VersionedTransactionResponse;
}

test("settlement hashes must match the Depth callback, including inner instructions", () => {
  assert.equal(
    settlementOrder(transaction(), program)?.toBase58(),
    orderId.toBase58(),
  );
  assert.equal(
    settlementOrder(transaction({ inner: true }), program)?.toBase58(),
    orderId.toBase58(),
  );
  assert.equal(
    settlementOrder(transaction({ wrongProgram: true }), program),
    undefined,
  );
  assert.equal(
    settlementOrder(transaction({ wrongInstruction: true }), program),
    undefined,
  );
  assert.equal(
    settlementOrder(transaction({ failed: true }), program),
    undefined,
  );
});

test("signature discovery ignores view transactions and returns the matching settlement", async () => {
  const connection = {
    getSignaturesForAddress: async () => [
      { signature: "view", slot: 22, err: null },
      { signature: "failed", slot: 21, err: {} },
      { signature: "settlement", slot: 20, err: null },
    ],
    getTransaction: async (signature: string) =>
      signature === "view"
        ? transaction({ wrongInstruction: true })
        : transaction(),
  } as unknown as Connection;
  const found = await settlementTransaction(connection, program, orderId, {
    orderId,
  });
  assert.equal(found.signature, "settlement");
  assert.equal(found.slot, 20);
  await assert.rejects(
    settlementTransaction(connection, program, orderId, {
      orderId: PublicKey.unique(),
    }),
    /not found/,
  );
});

test("missing archival transactions are reported instead of using an account address as a hash", async () => {
  const connection = {
    getSignaturesForAddress: async () => [
      { signature: "missing", slot: 20, err: null },
    ],
    getTransaction: async () => null,
  } as unknown as Connection;
  await assert.rejects(
    settlementTransaction(connection, program, orderId, { orderId }),
    /archival RPC/,
  );
});
