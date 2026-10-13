import { AnchorError, ProgramError } from "@anchor-lang/core";
import { SendTransactionError } from "@solana/web3.js";

export type ErrorStage = "validation" | "submission" | "confirmation";

export class DepthError extends Error {
  constructor(
    readonly code: string,
    readonly stage: ErrorStage,
    message: string,
    readonly retryable: boolean,
    readonly nextAction: string,
    readonly operationId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DepthError";
  }
}

export function admissionChanged(cause: unknown): boolean {
  const error =
    cause instanceof AnchorError
      ? cause
      : cause instanceof SendTransactionError && cause.logs
        ? AnchorError.parse(cause.logs)
        : undefined;
  return ["WrongQuoteSnapshot", "WrongOrderStatus"].includes(
    error?.error.errorCode.code ?? "",
  );
}

export function submissionError(operationId: string, cause: unknown): never {
  if (cause instanceof DepthError) throw cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  const code =
    cause && typeof cause === "object" && "code" in cause
      ? cause.code
      : undefined;
  if (
    (code === 4001 && !(cause instanceof ProgramError)) ||
    /user rejected|user denied|approval rejected|request rejected by the user/i.test(
      message,
    )
  ) {
    throw new DepthError(
      "WALLET_REJECTED",
      "submission",
      "Wallet approval declined",
      true,
      "Check the existing flow before retrying with the same client nonce",
      operationId,
      { cause },
    );
  }
  const rejection =
    cause instanceof AnchorError
      ? cause.error.errorMessage
      : cause instanceof ProgramError
        ? cause.msg
        : cause instanceof SendTransactionError
          ? cause.transactionError.message
          : undefined;
  if (rejection) {
    throw new DepthError(
      "SUBMISSION_REJECTED",
      "submission",
      `Transaction rejected: ${rejection}`,
      true,
      "Check the existing flow and resolve the rejection before retrying",
      operationId,
      { cause },
    );
  }
  throw new DepthError(
    "SUBMISSION_UNCONFIRMED",
    "submission",
    "Submission was not confirmed; reconcile the saved operation before retrying",
    true,
    "Read the operation using the saved client nonce; do not create a new nonce",
    operationId,
    { cause },
  );
}
