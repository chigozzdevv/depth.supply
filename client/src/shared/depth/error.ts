import { DepthError } from "@depthhq/sdk";

export function errorMessage(cause: unknown): string {
  for (let depth = 0; depth < 4; depth++) {
    if (
      !(cause instanceof Error) ||
      !/Failed to (sign the typed data|get an address|get the chain ID) .*wallet/.test(
        cause.message,
      ) ||
      !cause.cause
    )
      break;
    cause = cause.cause;
  }
  if (cause instanceof DepthError && cause.code === "SUBMISSION_UNCONFIRMED")
    return "Submission interrupted. Check the pending operation before retrying.";
  const value =
    cause && typeof cause === "object"
      ? (cause as { code?: unknown; message?: unknown })
      : undefined;
  if (value?.code === 4001) return "Wallet approval declined.";
  if (value?.code === -32002)
    return "A wallet request is already pending. Open your wallet to resolve it.";
  const message =
    typeof value?.message === "string" ? value.message : String(cause);
  if (
    /blockhash not found|block height exceeded|blockhash.*expired/i.test(
      message,
    )
  )
    return "Wallet request expired. Please try again.";
  if (
    /rpc_unavailable|rate_limited|\b(?:429|502|503|504)\b|fetch failed|Failed to fetch|timed? ?out/i.test(
      message,
    )
  )
    return "Connection interrupted. Please try again.";
  if (/Submission was not confirmed/.test(message))
    return "Submission interrupted. Check the pending operation before retrying.";
  if (/user rejected|user denied|approval rejected/i.test(message))
    return "Wallet approval declined.";
  return message.replace(/(?:https?|wss?):\/\/[^\s]+/g, "[endpoint]");
}
