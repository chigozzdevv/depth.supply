export function errorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (
    /rpc_unavailable|rate_limited|\b(?:429|502|503|504)\b|fetch failed|Failed to fetch|timed? ?out/i.test(
      message,
    )
  )
    return "Connection interrupted. Please try again.";
  if (/Submission was not confirmed/.test(message))
    return "Confirmation interrupted. Check the pending operation before retrying.";
  if (/user rejected|user denied|approval rejected/i.test(message))
    return "Wallet approval declined.";
  return message.replace(/(?:https?|wss?):\/\/[^\s]+/g, "[endpoint]");
}
