import { DepthError } from "@depthhq/sdk";

export function errorMessage(cause: unknown): string {
  if (cause instanceof DepthError && cause.code === "SUBMISSION_UNCONFIRMED")
    return "Submission interrupted. Check the pending operation before retrying.";
  const message = cause instanceof Error ? cause.message : String(cause);
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
