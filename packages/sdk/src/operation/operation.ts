import * as anchor from "@anchor-lang/core";
import {
  marketAccountAddress,
  marketAddress,
  SOL_USD_MARKET_ID,
} from "@depthhq/bindings";
import type { OperationSnapshot } from "@depthhq/schema";
import { Connection, PublicKey } from "@solana/web3.js";
import { DepthError, submissionError } from "@/operation/error";
import type { OrderState } from "@/client/types";
import type { DepthView, FillSnapshot, PositionSnapshot } from "@/view/view";
import { positionPnl, type PositionPnl } from "@/position/pnl";
import {
  settlementTransaction,
  type SettlementTransaction,
} from "@/chain/settlement";

function enumName(value: Record<string, unknown>): string {
  return Object.keys(value)[0] ?? "unknown";
}

export class DepthOperation {
  private viewPromise?: Promise<DepthView>;
  private view?: DepthView;
  private fill?: FillSnapshot & { positionId: PublicKey };
  private settlement?: SettlementTransaction;

  constructor(
    readonly id: PublicKey,
    readonly signature: string | undefined,
    private readonly program: anchor.Program,
    private readonly connection: Connection,
    private readonly requestFillView?: (order: PublicKey) => Promise<DepthView>,
    private readonly priorPosition?: PositionSnapshot,
    private readonly historicalPnl?: () => Promise<PositionPnl>,
  ) {}

  async transaction(): Promise<SettlementTransaction> {
    if (this.settlement) return this.settlement;
    const snapshot = await this.status();
    if (snapshot.status !== "finalized" || snapshot.outcome !== "filled")
      throw new Error(
        "Confirm the trade before reading its settlement transaction",
      );
    this.settlement = await settlementTransaction(
      this.connection,
      this.program,
      this.id,
      { orderId: this.id },
    );
    return this.settlement;
  }

  async pnl() {
    if (!this.priorPosition && this.historicalPnl) return this.historicalPnl();
    const { order } = await this.readOrder();
    if (
      !this.priorPosition ||
      this.priorPosition.version !== BigInt(order.traderVersion.toString())
    )
      throw new Error(
        "The private position before this execution is unavailable",
      );
    const fill = await this.privateResult();
    if (fill.executionPriceE8 === undefined)
      throw new Error("Execution price is unavailable");
    return positionPnl(
      this.priorPosition,
      fill.executionPriceE8,
      BigInt(order.fundingIndex.toString()),
      fill,
    );
  }

  private async readOrder(): Promise<{ order: OrderState; slot: number }> {
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
    return { order, slot: response.context.slot };
  }

  async status(): Promise<OperationSnapshot> {
    const { order, slot } = await this.readOrder();
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
      slot,
    };
  }

  async cancel(): Promise<OperationSnapshot> {
    const { order } = await this.readOrder();
    const owner = (this.program.provider as anchor.AnchorProvider).wallet
      .publicKey;
    const state = enumName(order.status);
    if (
      enumName(order.kind) !== "trade" ||
      !order.trader.equals(owner) ||
      !order.market.equals(marketAddress(this.program.programId))
    )
      throw new DepthError(
        "ORDER_CANCEL_UNAVAILABLE",
        "validation",
        "Only the trader can cancel an order in this market",
        false,
        "Restore the order with its owner wallet and network",
        this.id.toBase58(),
      );
    if (state === "cancelled") return this.status();
    if (state !== "matching" && state !== "matched")
      throw new DepthError(
        "ORDER_CANCEL_UNAVAILABLE",
        "validation",
        "This order can no longer be cancelled",
        false,
        "Read the current operation status",
        this.id.toBase58(),
      );
    await this.program.methods
      .cancelOrder()
      .accountsPartial({
        actor: owner,
        market: order.market,
        marketAccount: marketAccountAddress(owner, this.program.programId),
        order: this.id,
      })
      .rpc({ commitment: "confirmed" })
      .catch((error: unknown) => submissionError(this.id.toBase58(), error));
    return this.status();
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

  async wait(
    options: {
      timeoutMs?: number;
      pollMs?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<OperationSnapshot> {
    const timeoutMs = options.timeoutMs ?? 60_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
      throw new RangeError("timeoutMs must be a nonnegative integer");
    }
    const pollMs = options.pollMs ?? 1_000;
    if (!Number.isSafeInteger(pollMs) || pollMs < 100) {
      throw new RangeError("pollMs must be at least 100");
    }
    const deadline = Date.now() + timeoutMs;
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

  async confirm(
    options: {
      timeoutMs?: number;
      pollMs?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<{ orderId: PublicKey; snapshot: OperationSnapshot }> {
    const snapshot = await this.wait(options);
    if (snapshot.status === "finalized" && snapshot.outcome === "filled")
      return { orderId: this.id, snapshot };
    const rejected = snapshot.status === "rejected";
    const cancelled = snapshot.outcome === "cancelled";
    throw new DepthError(
      rejected
        ? "ORDER_REJECTED"
        : cancelled
          ? "ORDER_CANCELLED"
          : "ORDER_PENDING",
      "confirmation",
      rejected
        ? "Trade was rejected"
        : cancelled
          ? "Trade was cancelled"
          : "Trade has not finalized yet",
      !rejected && !cancelled,
      rejected || cancelled
        ? "Read the final order record before submitting a new request"
        : "Read this operation again with the same order ID",
      this.id.toBase58(),
    );
  }

  async privateResult(
    options: {
      timeoutMs?: number;
      pollMs?: number;
    } = {},
  ): Promise<FillSnapshot & { positionId: PublicKey }> {
    if (this.fill && !this.view) return this.fill;
    const snapshot = await this.status();
    if (
      snapshot.kind !== "trade" ||
      snapshot.status !== "finalized" ||
      snapshot.outcome !== "filled"
    )
      throw new DepthError(
        "FILL_NOT_AVAILABLE",
        "confirmation",
        "This trade has no finalized private fill yet",
        snapshot.status === "queued",
        "Confirm the trade before requesting its private result",
        this.id.toBase58(),
      );
    if (!this.requestFillView)
      throw new DepthError(
        "PRIVATE_VIEW_UNAVAILABLE",
        "validation",
        "This operation has no wallet-authorized fill view",
        false,
        "Restore the operation through the Depth wallet client",
        this.id.toBase58(),
      );
    if (!this.viewPromise) this.viewPromise = this.requestFillView(this.id);
    try {
      this.view = await this.viewPromise;
    } catch (error) {
      this.viewPromise = undefined;
      throw error;
    }
    if (!this.fill) {
      const result = await this.view.wait({
        timeoutMs: options.timeoutMs ?? 60_000,
        pollMs: options.pollMs,
      });
      if (result.status !== "ready")
        throw new DepthError(
          result.status === "pending" ? "FILL_VIEW_PENDING" : "FILL_VIEW_STALE",
          "confirmation",
          result.status === "pending"
            ? "Private fill computation is still pending"
            : "Private fill view is stale",
          result.status === "pending",
          result.status === "pending"
            ? "Call privateResult again with the same operation"
            : "Restore this operation and request a fresh fill view",
          this.id.toBase58(),
        );
      this.fill = {
        ...(result as FillSnapshot),
        positionId: marketAccountAddress(
          new PublicKey(snapshot.owner),
          this.program.programId,
        ),
      };
    }
    try {
      await this.view.close();
    } catch (error) {
      let remaining;
      try {
        remaining = await this.connection.getAccountInfo(
          this.view.id,
          "confirmed",
        );
      } catch (readError) {
        throw this.cleanupError(readError);
      }
      if (remaining) throw this.cleanupError(error);
    }
    this.view = undefined;
    this.viewPromise = undefined;
    return this.fill;
  }

  private cleanupError(cause: unknown): DepthError {
    return new DepthError(
      "FILL_VIEW_CLEANUP_PENDING",
      "confirmation",
      "Private fill was read but its temporary view is still open",
      true,
      "Call privateResult again with the same operation to close the view",
      this.id.toBase58(),
      { cause },
    );
  }
}
