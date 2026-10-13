import { AnchorError, ProgramError } from "@anchor-lang/core";
import { SendTransactionError } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DepthError,
  admissionChanged,
  submissionError,
} from "@/operation/error";

function failure(cause: unknown): DepthError {
  try {
    submissionError("saved-receipt", cause);
  } catch (error) {
    assert.ok(error instanceof DepthError);
    return error;
  }
}

test("wallet refusals are distinct from an uncertain broadcast", () => {
  for (const cause of [
    new Error("User rejected the request"),
    new Error("User denied transaction signature"),
    { code: 4001, message: "Rejected" },
  ]) {
    const error = failure(cause);
    assert.equal(error.code, "WALLET_REJECTED");
    assert.equal(error.operationId, "saved-receipt");
    assert.equal(error.cause, cause);
  }
});

test("preflight and confirmed execution failures preserve their actual reason", () => {
  for (const action of ["simulate", "send"] as const) {
    const cause = new SendTransactionError({
      action,
      signature: action === "send" ? "failed-signature" : "",
      transactionMessage: "Insufficient funds for rent",
    });
    const error = failure(cause);
    assert.equal(error.code, "SUBMISSION_REJECTED");
    assert.equal(
      error.message,
      "Transaction rejected: Insufficient funds for rent",
    );
    assert.equal(error.cause, cause);
  }
  const anchor = AnchorError.parse([
    "Program log: AnchorError occurred. Error Code: WrongBalanceStatus. Error Number: 6037. Error Message: The balance is in the wrong state.",
  ])!;
  assert.equal(
    failure(anchor).message,
    "Transaction rejected: The balance is in the wrong state",
  );
  const program = new ProgramError(4001, "Program rejected the instruction");
  assert.equal(failure(program).code, "SUBMISSION_REJECTED");
});

test("transport failures and expiry retain the operation ID for reconciliation", () => {
  for (const cause of [
    new Error("503 rpc_unavailable"),
    new Error("Failed to fetch"),
    new Error("Transaction failed to confirm in 60s"),
    new Error("Block height exceeded"),
  ]) {
    const error = failure(cause);
    assert.equal(error.code, "SUBMISSION_UNCONFIRMED");
    assert.equal(error.operationId, "saved-receipt");
    assert.equal(error.cause, cause);
    assert.match(error.nextAction, /do not create a new nonce/);
  }
});

test("an existing Depth error keeps its classification", () => {
  const cause = new DepthError(
    "ORDER_PENDING",
    "confirmation",
    "Trade pending",
    true,
    "Check the order",
    "order-id",
  );
  assert.equal(failure(cause), cause);
});

test("only proven quote rotation or market contention permits fresh admission", () => {
  const logs = [
    "Program log: AnchorError occurred. Error Code: WrongQuoteSnapshot. Error Number: 6026. Error Message: The supplied quotes differ from the complete market snapshot.",
  ];
  assert.equal(admissionChanged(AnchorError.parse(logs)), true);
  assert.equal(
    admissionChanged(
      new SendTransactionError({
        action: "simulate",
        signature: "",
        transactionMessage: "Preflight failure",
        logs,
      }),
    ),
    true,
  );
  assert.equal(
    admissionChanged(
      AnchorError.parse([
        "Program log: AnchorError occurred. Error Code: WrongOrderStatus. Error Number: 6020. Error Message: The order is in the wrong state.",
      ]),
    ),
    true,
  );
  for (const error of [
    new Error("WrongQuoteSnapshot"),
    new Error("Failed to fetch"),
    { code: 4001, message: "User denied transaction signature" },
    AnchorError.parse([
      "Program log: AnchorError occurred. Error Code: WrongQuoteStatus. Error Number: 6015. Error Message: The quote is in the wrong state.",
    ]),
  ])
    assert.equal(admissionChanged(error), false);
});
