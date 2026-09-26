import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import type { MakerClient } from "@/client";

export type QuoteSnapshot = {
  id: string;
  status: string;
  capacity: bigint;
  remainingCapacity: bigint;
  attachedOrders: number;
};

function name(value: Record<string, unknown>): string {
  return Object.keys(value)[0] ?? "unknown";
}

export class QuoteHandle {
  reserveSignature?: string;
  releaseSignature?: string;

  constructor(
    readonly id: PublicKey,
    readonly prepareSignature: string | undefined,
    private readonly client: MakerClient
  ) {}

  async status(): Promise<QuoteSnapshot> {
    const state = await this.client.quoteState(this.id);
    return {
      id: this.id.toBase58(),
      status: name(state.status),
      capacity: BigInt(state.capacity.toString()),
      remainingCapacity: BigInt(state.remainingCapacity.toString()),
      attachedOrders: state.attachedOrders,
    };
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
      const snapshot = await this.status();
      if (
        ["active", "filled", "cancelled", "rejected"].includes(
          snapshot.status
        ) ||
        Date.now() >= deadline
      ) {
        return snapshot;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollMs, deadline - Date.now()))
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
      if (snapshot.status === "validated") {
        const grant = this.client.options.wallet.publicKey.equals(
          this.client.options.maker
        )
          ? undefined
          : this.client.grantAddress();
        const offset = new anchor.BN(randomBytes(8), "le");
        const queue = await this.client.queue("reserve_quote", offset);
        this.reserveSignature = await this.client.program.methods
          .reserveQuote(offset)
          .accountsPartial({
            ...queue,
            payer: this.client.options.wallet.publicKey,
            protocol: this.client.protocolAddress,
            market: this.client.marketAddress,
            marketAccount: this.client.marketAccount(),
            ...(grant ? { grant } : {}),
            quote: this.id,
          })
          .rpc({ commitment: "confirmed" });
        return this.status();
      }
      if (snapshot.status !== "validating" || Date.now() >= deadline) {
        return snapshot;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollMs, deadline - Date.now()))
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
          ...(grant ? { grant } : {}),
          quote: this.id,
        })
        .rpc({ commitment: "confirmed" });
      return this.status();
    }
    if (snapshot.status === "active") {
      await this.client.program.methods
        .stopQuote()
        .accountsPartial({
          actor,
          market: this.client.marketAddress,
          ...(grant ? { grant } : {}),
          quote: this.id,
        })
        .rpc({ commitment: "confirmed" });
    } else if (snapshot.status !== "closing") {
      throw new Error("Quote cannot be cancelled in its current state");
    }
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
        ...(grant ? { grant } : {}),
        quote: this.id,
      })
      .rpc({ commitment: "confirmed" });
    return this.status();
  }
}
