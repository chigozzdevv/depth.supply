import * as anchor from "@anchor-lang/core";
import { DEPTH_IDL, DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { FillHistory } from "@/fill/history";
import type { MakerClient } from "@/client/client";

test("fill pagination verifies finalized callback receipts and preserves its RPC cursor", async () => {
  const maker = PublicKey.unique();
  const market = PublicKey.unique();
  const order = PublicKey.unique();
  const connection = new Connection("http://127.0.0.1:8899");
  const program = new anchor.Program(
    DEPTH_IDL,
    new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(Keypair.generate()),
      {},
    ),
  );
  const definition = program.idl.instructions.find(
    (ix) => ix.name === "sealClearingCallback",
  )!;
  const keys = definition.accounts.map((account) => ({
    pubkey: account.name === "order" ? order : PublicKey.unique(),
    isSigner: false,
    isWritable: false,
  }));
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey: maker,
      recentBlockhash: PublicKey.unique().toBase58(),
      instructions: [
        new TransactionInstruction({
          programId: DEPTH_PROGRAM_ID,
          keys,
          data: Buffer.from(definition.discriminator),
        }),
      ],
    }).compileToV0Message(),
  );
  connection.getSignaturesForAddress = async (
    _address,
    options,
    commitment,
  ) => {
    assert.equal(commitment, "finalized");
    assert.equal(options?.before, "prior-page");
    return [{ signature: "final-signature", slot: 100, err: null, memo: null }];
  };
  connection.getTransaction = async () =>
    ({ transaction, slot: 100, meta: { err: null } } as never);
  connection.getMultipleAccountsInfo = async (ids) => {
    assert.equal(ids[0].toBase58(), order.toBase58());
    return [
      {
        owner: DEPTH_PROGRAM_ID,
        data: Buffer.alloc(8),
        lamports: 1,
        executable: false,
      },
    ];
  };
  program.coder.accounts.decode = () =>
    ({ maker, market, kind: { trade: {} }, status: { filled: {} } } as never);
  const client = {
    program,
    options: { maker, connection },
    marketAddress: market,
    marketAccount: () => maker,
  } as unknown as MakerClient;
  const page = await new FillHistory(client).list({
    before: "prior-page",
    limit: 1,
  });
  assert.deepEqual(page.fills, [
    { id: order.toBase58(), signature: "final-signature", slot: 100 },
  ]);
  assert.equal(page.cursor, "final-signature");
});

test("a failed fill consumer does not advance the durable checkpoint", async () => {
  const history = new FillHistory({} as MakerClient);
  history.list = async () => ({
    fills: [{ id: "fill", signature: "signature", slot: 1 }],
    head: "signature",
  });
  let saved = false;
  let unsubscribe = () => {};
  await new Promise<void>((resolve) => {
    unsubscribe = history.subscribe(
      async () => {
        throw new Error("hedge ledger unavailable");
      },
      {
        saveCursor: async () => {
          saved = true;
        },
        onError: () => {
          unsubscribe();
          resolve();
        },
      },
    );
  });
  assert.equal(saved, false);
});
