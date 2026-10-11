import { DEPTH_IDL, DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import * as anchor from "@anchor-lang/core";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDepthComputeBudget, DepthProvider } from "@/chain/provider";

function depthInstruction(name: string, programId = DEPTH_PROGRAM_ID) {
  const instruction = DEPTH_IDL.instructions.find((item) => item.name === name);
  if (!instruction) throw new Error(`Missing ${name} instruction`);
  return new TransactionInstruction({
    keys: [],
    programId,
    data: Buffer.from(instruction.discriminator),
  });
}

test("encrypted Depth submissions receive compute headroom once", () => {
  const transaction = new Transaction().add(depthInstruction("submit_order"));
  applyDepthComputeBudget(transaction);
  assert.equal(transaction.instructions.length, 2);
  assert.ok(
    transaction.instructions[0].programId.equals(
      ComputeBudgetProgram.programId,
    ),
  );
  assert.equal(transaction.instructions[0].data.readUInt32LE(1), 400_000);
  applyDepthComputeBudget(transaction);
  assert.equal(transaction.instructions.length, 2);
});

test("receipt cleanup shares the next approval, survives a failed send and skips closed receipts", async () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const connection = new Connection("http://localhost:8899");
  let exists = true;
  connection.getMultipleAccountsInfo = async (keys) =>
    keys.map(() =>
      exists
        ? {
            owner: DEPTH_PROGRAM_ID,
            data: Buffer.alloc(8),
            lamports: 1,
            executable: false,
          }
        : null,
    );
  const provider = new DepthProvider(connection, wallet, {});
  const receipt = PublicKey.unique();
  const cleanup = depthInstruction("close_balance_view");
  provider.deferClose(receipt, cleanup);
  const original = anchor.AnchorProvider.prototype.sendAndConfirm;
  let fail = true;
  let sends = 0;
  anchor.AnchorProvider.prototype.sendAndConfirm = async (transaction) => {
    sends++;
    assert.equal(
      (transaction as Transaction).instructions.filter(
        (instruction) => instruction === cleanup,
      ).length,
      1,
    );
    if (fail) throw new Error("RPC failed");
    return "confirmed";
  };
  try {
    const transaction = new Transaction().add(depthInstruction("register_app"));
    await assert.rejects(provider.sendAndConfirm(transaction), /RPC failed/);
    fail = false;
    await provider.sendAndConfirm(transaction);
    assert.equal(sends, 2);
    assert.deepEqual(
      await provider.appendCleanup(
        new Transaction().add(depthInstruction("register_app")),
      ),
      [],
    );
    provider.deferClose(receipt, cleanup);
    exists = false;
    assert.deepEqual(
      await provider.appendCleanup(
        new Transaction().add(depthInstruction("register_app")),
      ),
      [],
    );
  } finally {
    anchor.AnchorProvider.prototype.sendAndConfirm = original;
  }
});

test("cleanup waits for a smaller transaction rather than exceeding Solana's packet limit", async () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const connection = new Connection("http://localhost:8899");
  connection.getMultipleAccountsInfo = async (keys) =>
    keys.map(() => ({
      owner: DEPTH_PROGRAM_ID,
      data: Buffer.alloc(8),
      lamports: 1,
      executable: false,
    }));
  const provider = new DepthProvider(connection, wallet, {});
  provider.deferClose(
    PublicKey.unique(),
    depthInstruction("close_balance_view"),
  );
  const full = new Transaction().add(
    new TransactionInstruction({
      programId: DEPTH_PROGRAM_ID,
      keys: [],
      data: Buffer.alloc(1060),
    }),
  );
  assert.deepEqual(await provider.appendCleanup(full), []);
  assert.equal(
    (
      await provider.appendCleanup(
        new Transaction().add(depthInstruction("register_app")),
      )
    ).length,
    1,
  );
});

test("caller budgets and ordinary transactions keep their exact instructions", () => {
  const explicit = ComputeBudgetProgram.setComputeUnitLimit({ units: 700_000 });
  const transaction = new Transaction().add(
    explicit,
    depthInstruction("offer_backstop"),
  );
  applyDepthComputeBudget(transaction);
  assert.equal(transaction.instructions.length, 2);
  assert.strictEqual(transaction.instructions[0], explicit);

  const ordinary = new Transaction().add(depthInstruction("register_app"));
  applyDepthComputeBudget(ordinary);
  assert.equal(ordinary.instructions.length, 1);

  const unrelated = new Transaction().add(
    depthInstruction("submit_order", PublicKey.unique()),
  );
  applyDepthComputeBudget(unrelated);
  assert.equal(unrelated.instructions.length, 1);
});
