import { DepthError, type DepthClient } from "@depthhq/sdk";

export async function reconcileTrade(
  sdk: DepthClient,
  nonce: bigint,
  cause?: unknown,
) {
  const status = await sdk.trade.flow(nonce).status();
  const declined =
    cause instanceof DepthError &&
    ["WALLET_REJECTED", "SUBMISSION_REJECTED"].includes(cause.code);
  const resolved =
    status.phase === "failed" ||
    status.order?.status === "finalized" ||
    (status.phase === "unstarted" && declined);
  const message = status.order
    ? `Trade ${status.order.outcome ?? status.order.status}`
    : status.phase === "failed"
      ? "Margin allocation failed"
      : status.phase === "unstarted"
        ? "No trade confirmed"
        : "Continue the original trade";
  return { status, resolved, message };
}
