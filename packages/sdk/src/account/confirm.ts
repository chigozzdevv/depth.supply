import { DepthError } from "@/operation/error";

export type ConfirmOptions = { timeoutMs?: number; pollMs?: number };

export async function confirmReceipt<T>(
  id: string,
  status: () => Promise<T>,
  advance: (current: T) => Promise<boolean>,
  options: ConfirmOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollMs = options.pollMs ?? 1_000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 0 ||
    !Number.isSafeInteger(pollMs) ||
    pollMs < 100
  )
    throw new RangeError("Invalid confirmation timing");
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const current = await status();
    if (await advance(current)) return current;
    if (Date.now() >= deadline)
      throw new DepthError(
        "RECEIPT_PENDING",
        "confirmation",
        "The operation is still pending",
        true,
        "Restore this receipt with its nonce and continue confirmation",
        id
      );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(pollMs, deadline - Date.now()))
    );
  }
}
