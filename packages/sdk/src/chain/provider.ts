import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import { DEPTH_IDL, DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import {
  ComputeBudgetProgram,
  SendTransactionError,
  Transaction,
} from "@solana/web3.js";

const queuedInstructions = new Set([
  "open_balance",
  "credit_deposit",
  "request_withdrawal",
  "request_balance_view",
  "open_market_account",
  "begin_allocation",
  "begin_release",
  "settle_allocation",
  "settle_release",
  "submit_quote",
  "reserve_quote",
  "release_quote",
  "offer_backstop",
  "release_backstop",
  "submit_order",
  "open_clearing",
  "credit_insurance",
  "settle_trade",
  "liquidate",
  "seal_market",
  "seal_clearing",
  "request_market_view",
  "request_quote_view",
  "request_fill_view",
  "claim_trade_fees",
  "seal_trade_fees",
]);

const queuedDiscriminators = new Set(
  DEPTH_IDL.instructions
    .filter((instruction) => queuedInstructions.has(instruction.name))
    .map((instruction) =>
      Buffer.from(instruction.discriminator).toString("hex"),
    ),
);
if (queuedDiscriminators.size !== queuedInstructions.size)
  throw new Error("Depth IDL is missing a queued instruction discriminator");

export function applyDepthComputeBudget(transaction: Transaction): void {
  if (
    transaction.instructions.some(
      (instruction) =>
        instruction.programId.equals(ComputeBudgetProgram.programId) &&
        instruction.data[0] === 2,
    )
  )
    return;
  if (
    !transaction.instructions.some(
      (instruction) =>
        instruction.programId.equals(DEPTH_PROGRAM_ID) &&
        queuedDiscriminators.has(
          Buffer.from(instruction.data.subarray(0, 8)).toString("hex"),
        ),
    )
  )
    return;
  transaction.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
  );
}

export class DepthProvider extends anchor.AnchorProvider {
  override async sendAndConfirm(
    transaction: Parameters<anchor.AnchorProvider["sendAndConfirm"]>[0],
    signers?: Parameters<anchor.AnchorProvider["sendAndConfirm"]>[1],
    options?: Parameters<anchor.AnchorProvider["sendAndConfirm"]>[2],
  ): Promise<string> {
    if (transaction instanceof Transaction)
      applyDepthComputeBudget(transaction);
    try {
      return await super.sendAndConfirm(transaction, signers, options);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Unknown action 'undefined'")
      )
        throw error;
      const first = transaction.signatures[0] as
        Uint8Array | { signature: Uint8Array | null } | undefined;
      const bytes =
        transaction instanceof Transaction
          ? transaction.signature
          : first instanceof Uint8Array
            ? first
            : first?.signature;
      if (!bytes || bytes.every((byte) => byte === 0)) throw error;
      const signature = anchor.utils.bytes.bs58.encode(bytes);
      const failed = await this.connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!failed?.meta?.err) throw error;
      throw new SendTransactionError({
        action: "send",
        signature,
        transactionMessage: JSON.stringify(failed.meta.err),
        logs: failed.meta.logMessages ?? undefined,
      });
    }
  }
}
