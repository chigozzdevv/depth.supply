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

export function submissionError(operationId: string, cause: unknown): never {
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
