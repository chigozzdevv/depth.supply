import * as anchor from "@anchor-lang/core";
import { SOL_USD_MARKET_ID } from "@depth/bindings";
import type { OperationSnapshot } from "@depth/schema";
import { Connection, PublicKey } from "@solana/web3.js";
import { DepthError } from "@/operation/error";
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
    if (!response.value) {
      throw new DepthError(
        "ORDER_NOT_VISIBLE",
        "confirmation",
        "Order is not visible on the confirmed chain yet",
        true,
        "Retry with the same operation ID and reconcile before submitting a new nonce",
        this.id.toBase58(),
      );
    }
    if (!response.value.owner.equals(this.program.programId)) {
      throw new DepthError(
        "WRONG_ACCOUNT_OWNER",
        "confirmation",
        "Order record is unavailable on the confirmed chain",
        false,
        "Verify the operation address and network",
        this.id.toBase58(),
      );
    }
    const order = this.program.coder.accounts.decode<OrderState>(
      "orderRecord",
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

  subscribe(
    listener: (snapshot: OperationSnapshot) => void | Promise<void>,
    options: {
      pollMs?: number;
      onError: (error: unknown) => void;
    },
  ): () => void {
    const pollMs = options.pollMs ?? 1000;
    if (!Number.isSafeInteger(pollMs) || pollMs < 100)
      throw new RangeError("pollMs must be at least 100");
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = "";
    const poll = async () => {
      try {
        const snapshot = await this.status();
        const key = `${snapshot.status}:${snapshot.outcome ?? ""}:${
          snapshot.state_version ?? ""
        }`;
        if (!stopped && key !== previous) {
          await listener(snapshot);
          previous = key;
        }
      } catch (error) {
        if (!stopped) options.onError(error);
      } finally {
        if (!stopped) timer = setTimeout(poll, pollMs);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
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
    let snapshot: OperationSnapshot | undefined;
    for (;;) {
      options.signal?.throwIfAborted();
      try {
        snapshot = await this.status();
      } catch (error) {
        if (error instanceof DepthError && !error.retryable) throw error;
        if (Date.now() >= deadline) {
          if (snapshot) return snapshot;
          throw new DepthError(
            "RPC_UNAVAILABLE",
            "confirmation",
            "Could not read operation before timeout",
            true,
            "Retry status with the same operation ID",
            this.id.toBase58(),
            { cause: error },
          );
        }
      }
      if (
        snapshot &&
        (snapshot.status === "finalized" ||
          snapshot.status === "rejected" ||
          Date.now() >= deadline)
      ) {
        return snapshot;
      }
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(options.signal?.reason);
        };
        const timer = setTimeout(() => {
          options.signal?.removeEventListener("abort", onAbort);
          resolve();
        }, Math.min(pollMs, deadline - Date.now()));
        options.signal?.addEventListener("abort", onAbort, { once: true });
        if (options.signal?.aborted) onAbort();
      });
    }
  }
}
