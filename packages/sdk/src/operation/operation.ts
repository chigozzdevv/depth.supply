import * as anchor from "@anchor-lang/core";
import { SOL_USD_MARKET_ID } from "@depth/bindings";
import type { OperationSnapshot } from "@depth/schema";
import { Connection, PublicKey } from "@solana/web3.js";
import type { OrderState } from "@/client/types";

function enumName(value: Record<string, unknown>): string {
  return Object.keys(value)[0] ?? "unknown";
}

export class DepthOperation {
  constructor(
    readonly id: PublicKey,
    readonly signature: string | undefined,
    private readonly program: anchor.Program,
    private readonly connection: Connection,
  ) {}

  async status(): Promise<OperationSnapshot> {
    const response = await this.connection.getAccountInfoAndContext(
      this.id,
      "confirmed",
    );
    if (
      !response.value ||
      !response.value.owner.equals(this.program.programId)
    ) {
      throw new Error("Order record is unavailable on the confirmed chain");
    }
    const order = this.program.coder.accounts.decode<OrderState>(
      "OrderRecord",
      response.value.data,
    );
    const state = enumName(order.status);
    return {
      id: this.id.toBase58(),
      kind: enumName(order.kind) === "liquidation" ? "risk" : "trade",
      owner: order.trader.toBase58(),
      market_id: SOL_USD_MARKET_ID,
      status:
        state === "filled" || state === "cancelled"
          ? "finalized"
          : state === "rejected"
            ? "rejected"
            : "queued",
      ...(state === "filled" ? { outcome: "filled" as const } : {}),
      ...(state === "cancelled" ? { outcome: "cancelled" as const } : {}),
      ...(this.signature ? { tx_signature: this.signature } : {}),
      slot: response.context.slot,
    };
  }

  async wait(options: {
    timeoutMs: number;
    pollMs?: number;
    signal?: AbortSignal;
  }): Promise<OperationSnapshot> {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0) {
      throw new RangeError("timeoutMs must be a nonnegative integer");
    }
    const pollMs = options.pollMs ?? 1_000;
    if (!Number.isSafeInteger(pollMs) || pollMs < 100) {
      throw new RangeError("pollMs must be at least 100");
    }
    const deadline = Date.now() + options.timeoutMs;
    for (;;) {
      options.signal?.throwIfAborted();
      const snapshot = await this.status();
      if (
        snapshot.status === "finalized" ||
        snapshot.status === "rejected" ||
        Date.now() >= deadline
      ) {
        return snapshot;
      }
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(options.signal?.reason);
        };
        const timer = setTimeout(
          () => {
            options.signal?.removeEventListener("abort", onAbort);
            resolve();
          },
          Math.min(pollMs, deadline - Date.now()),
        );
        options.signal?.addEventListener("abort", onAbort, { once: true });
        if (options.signal?.aborted) onAbort();
      });
    }
  }
}
