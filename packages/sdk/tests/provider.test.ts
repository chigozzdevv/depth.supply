import { DEPTH_IDL, DEPTH_PROGRAM_ID } from "@depth/bindings";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDepthComputeBudget } from "@/chain/provider";

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
    transaction.instructions[0].programId.equals(ComputeBudgetProgram.programId),
  );
  assert.equal(transaction.instructions[0].data.readUInt32LE(1), 400_000);
  applyDepthComputeBudget(transaction);
  assert.equal(transaction.instructions.length, 2);
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
