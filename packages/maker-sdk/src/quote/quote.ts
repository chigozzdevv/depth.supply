import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "@/chain/random";
import type { MakerClient } from "@/client/client";
import type { MarketState, QuoteQueueState } from "@/client/types";
import { DepthError } from "@depth/sdk";

export type QuoteSnapshot = {
  id: string;
  status: string;
  maxCapacity: bigint;
  attachedOrders: number;
  replacementNonce?: bigint;
};

function name(value: Record<string, unknown>): string {
  return Object.keys(value)[0] ?? "unknown";
}

export class QuoteHandle {
  reserveSignature?: string;
  releaseSignature?: string;
  private balanceView?: Awaited<ReturnType<MakerClient["requestQuoteView"]>>;

  constructor(
    readonly id: PublicKey,
    readonly prepareSignature: string | undefined,
    private readonly client: MakerClient,
  ) {}

  async status(): Promise<QuoteSnapshot> {
    const state = await this.client.quoteState(this.id);
    return {
      id: this.id.toBase58(),
      status: name(state.status),
      maxCapacity: BigInt(state.capacity.toString()),
      attachedOrders: state.attachedOrders,
      ...(state.replacementNonce == null
        ? {}
        : { replacementNonce: BigInt(state.replacementNonce.toString()) }),
    };
  }

  async capacity(): Promise<bigint> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const view =
        this.balanceView ?? (await this.client.requestQuoteView(this.id));
      this.balanceView = view;
      const snapshot = await view.wait({ timeoutMs: 60_000 });
      if (snapshot.status === "pending")
        throw new Error(
          `Quote balance view ${view.id.toBase58()} is still pending`,
        );
      await view.close();
      this.balanceView = undefined;
      if (
        snapshot.status === "ready" &&
        "remainingCapacity" in snapshot &&
        snapshot.remainingCapacity !== undefined
      )
        return snapshot.remainingCapacity;
    }
    throw new Error("Quote balance changed while the private view was running");
  }

  async confirm(
    options: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<{ quoteId: PublicKey; snapshot: QuoteSnapshot }> {
    const timeoutMs = options.timeoutMs ?? 60_000;
    const started = Date.now();
    let snapshot = await this.activate({ timeoutMs, pollMs: options.pollMs });
    if (
      !["active", "filled", "cancelled", "rejected"].includes(snapshot.status)
    )
      snapshot = await this.wait({
        timeoutMs: Math.max(0, timeoutMs - (Date.now() - started)),
        pollMs: options.pollMs,
      });
    if (snapshot.status === "active" || snapshot.status === "filled")
      return { quoteId: this.id, snapshot };
    throw new DepthError(
      snapshot.status === "rejected"
        ? "QUOTE_REJECTED"
        : snapshot.status === "cancelled"
        ? "QUOTE_CANCELLED"
        : "QUOTE_PENDING",
      "confirmation",
      snapshot.status === "rejected"
        ? "Quote was rejected"
        : snapshot.status === "cancelled"
        ? "Quote was cancelled"
        : "Quote is not active yet",
      snapshot.status !== "rejected" && snapshot.status !== "cancelled",
      "Read the quote status and resume activation if it remains pending",
      this.id.toBase58(),
    );
  }

  async wait(options: {
    timeoutMs: number;
    pollMs?: number;
  }): Promise<QuoteSnapshot> {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0) {
      throw new RangeError("timeoutMs must be a nonnegative integer");
    }
    const pollMs = options.pollMs ?? 1_000;
    if (!Number.isSafeInteger(pollMs) || pollMs < 100) {
      throw new RangeError("pollMs must be at least 100");
    }
    const deadline = Date.now() + options.timeoutMs;
    for (;;) {
      let snapshot = await this.status();
      if (snapshot.status === "waiting" || snapshot.status === "validated") {
        snapshot = await this.activate({ timeoutMs: 0, pollMs });
      }
      if (
        ["active", "filled", "cancelled", "rejected"].includes(
          snapshot.status,
        ) ||
        Date.now() >= deadline
      ) {
        return snapshot;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollMs, deadline - Date.now())),
      );
    }
  }

  async activate(options: {
    timeoutMs: number;
    pollMs?: number;
  }): Promise<QuoteSnapshot> {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0) {
      throw new RangeError("timeoutMs must be a nonnegative integer");
    }
    const pollMs = options.pollMs ?? 1_000;
    if (!Number.isSafeInteger(pollMs) || pollMs < 100) {
      throw new RangeError("pollMs must be at least 100");
    }
    const deadline = Date.now() + options.timeoutMs;
    for (;;) {
      const snapshot = await this.status();
      if (snapshot.status === "active" || snapshot.status === "rejected") {
        return snapshot;
      }
      if (snapshot.status === "validated" || snapshot.status === "waiting") {
        const market = await this.client.read<MarketState>(
          "Market",
          this.client.marketAddress,
        );
        const queueState = await this.client.read<QuoteQueueState>(
          "QuoteQueue",
          this.client.quoteQueueAddress,
        );
        if (!queueState.market.equals(this.client.marketAddress)) {
          throw new Error("Quote queue belongs to another market");
        }
        const grant = this.client.options.wallet.publicKey.equals(
          this.client.options.maker,
        )
          ? undefined
          : this.client.grantAddress();
        if (
          snapshot.status === "validated" &&
          (market.activeQuoteCount >= 4 ||
            queueState.count > 0 ||
            BigInt(market.quotedNotional.toString()) + snapshot.maxCapacity >
              BigInt(market.config.maxMarketNotional.toString()))
        ) {
          await this.client.program.methods
            .enqueueQuote()
            .accountsPartial({
              actor: this.client.options.wallet.publicKey,
              market: this.client.marketAddress,
              quoteQueue: this.client.quoteQueueAddress,
              grant: grant ?? this.client.program.programId,
              quote: this.id,
            })
            .rpc({ commitment: "confirmed" });
          return this.status();
        }
        if (
          snapshot.status === "waiting" &&
          (market.activeQuoteCount >= 4 ||
            market.pendingOrders > 0 ||
            !queueState.entries[0]?.equals(this.id) ||
            BigInt(market.quotedNotional.toString()) + snapshot.maxCapacity >
              BigInt(market.config.maxMarketNotional.toString()))
        )
          return snapshot;
        const makerAccount = await this.client.read<{
          status: Record<string, unknown>;
        }>("MarketAccount", this.client.marketAccount());
        if (name(makerAccount.status) !== "ready" || market.pendingOrders > 0) {
          if (Date.now() >= deadline) return snapshot;
          await new Promise((resolve) => setTimeout(resolve, pollMs));
          continue;
        }
        const offset = new anchor.BN(randomBytes(8), "le");
        const queue = await this.client.queue("reserve_quote", offset);
        try {
          this.reserveSignature = await this.client.program.methods
            .reserveQuote(offset)
            .accountsPartial({
              ...queue,
              payer: this.client.options.wallet.publicKey,
              protocol: this.client.protocolAddress,
              market: this.client.marketAddress,
              marketAccount: this.client.marketAccount(),
              grant: grant ?? this.client.program.programId,
              quote: this.id,
            })
            .remainingAccounts([
              {
                pubkey: this.client.quoteQueueAddress,
                isSigner: false,
                isWritable: true,
              },
            ])
            .rpc({ commitment: "confirmed" });
        } catch (error) {
          const code = (error as {
            error?: { errorCode?: { code?: string } };
          }).error?.errorCode?.code;
          if (
            (code !== "WrongMarketAccountStatus" &&
              code !== "WrongOrderStatus") ||
            Date.now() >= deadline
          ) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, pollMs));
          continue;
        }
        return this.status();
      }
      if (snapshot.status !== "validating" || Date.now() >= deadline) {
        return snapshot;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollMs, deadline - Date.now())),
      );
    }
  }

  async cancel(): Promise<QuoteSnapshot> {
    const snapshot = await this.status();
    const actor = this.client.options.wallet.publicKey;
    const grant = actor.equals(this.client.options.maker)
      ? undefined
      : this.client.grantAddress();
    if (snapshot.status === "validating" || snapshot.status === "validated") {
      await this.client.program.methods
        .cancelPreparedQuote()
        .accountsPartial({
          actor,
          grant: grant ?? this.client.program.programId,
          quote: this.id,
        })
        .rpc({ commitment: "confirmed" });
      return this.status();
    }
    if (snapshot.status === "active" || snapshot.status === "waiting") {
      await this.client.program.methods
        .stopQuote()
        .accountsPartial({
          actor,
          market: this.client.marketAddress,
          quoteQueue: this.client.quoteQueueAddress,
          grant: grant ?? this.client.program.programId,
          quote: this.id,
        })
        .rpc({ commitment: "confirmed" });
    } else if (snapshot.status !== "closing") {
      throw new Error("Quote cannot be cancelled in its current state");
    }
    const current = await this.status();
    if (snapshot.status === "waiting") return current;
    if (current.attachedOrders > 0) return current;
    const offset = new anchor.BN(randomBytes(8), "le");
    const queue = await this.client.queue("release_quote", offset);
    this.releaseSignature = await this.client.program.methods
      .releaseQuote(offset)
      .accountsPartial({
        ...queue,
        payer: actor,
        protocol: this.client.protocolAddress,
        market: this.client.marketAddress,
        marketAccount: this.client.marketAccount(),
        grant: grant ?? this.client.program.programId,
        quote: this.id,
      })
      .rpc({ commitment: "confirmed" });
    return this.status();
  }
}
