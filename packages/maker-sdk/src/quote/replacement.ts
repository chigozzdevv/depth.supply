import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import type { MakerClient } from "@/client/client";
import type { QuoteRequest } from "@/client/types";
import type { MarketState } from "@/client/types";
import type { QuoteHandle, QuoteSnapshot } from "@/quote/quote";
import { randomBytes } from "@/chain/random";
import { quoteBounds } from "@depthhq/bindings";

export type ReplacementSnapshot = {
  prior?: QuoteSnapshot;
  next?: QuoteSnapshot;
  nextId: PublicKey;
  phase: "stopping" | "ready" | "publishing" | "active" | "failed";
};

export class QuoteReplacement {
  readonly nextId: PublicKey;

  constructor(
    readonly client: MakerClient,
    readonly priorId: PublicKey,
    readonly nonce: bigint,
  ) {
    if (nonce < 0n || nonce > (1n << 64n) - 1n) {
      throw new RangeError("clientNonce must be an unsigned 64-bit bigint");
    }
    const bytes = new anchor.BN(nonce.toString()).toArrayLike(Buffer, "le", 8);
    this.nextId = PublicKey.findProgramAddressSync(
      [
        Buffer.from("quote"),
        client.marketAddress.toBuffer(),
        client.options.maker.toBuffer(),
        bytes,
      ],
      DEPTH_PROGRAM_ID,
    )[0];
    if (this.nextId.equals(priorId)) {
      throw new Error("Replacement quote must use a new nonce");
    }
  }

  async status(): Promise<ReplacementSnapshot> {
    const priorAccount = await this.client.options.connection.getAccountInfo(
      this.priorId,
      "confirmed",
    );
    const prior = priorAccount
      ? await this.client.quote.get(this.priorId).status()
      : undefined;
    if (
      prior?.replacementNonce !== undefined &&
      prior.replacementNonce !== this.nonce
    ) {
      throw new Error("Prior quote is linked to a different successor");
    }
    const account = await this.client.options.connection.getAccountInfo(
      this.nextId,
      "confirmed",
    );
    const next = account
      ? await this.client.quote.get(this.nextId).status()
      : undefined;
    if (!prior && !next) throw new Error("Replacement quotes are unavailable");
    const stopped =
      !prior || ["cancelled", "filled", "rejected"].includes(prior.status);
    return {
      prior,
      next,
      nextId: this.nextId,
      phase:
        next?.status === "active" || next?.status === "filled"
          ? "active"
          : next?.status === "rejected"
            ? "failed"
            : next
              ? "publishing"
              : stopped
                ? "ready"
                : "stopping",
    };
  }

  async prepare(input: QuoteRequest): Promise<QuoteHandle> {
    if (input.clientNonce !== undefined && input.clientNonce !== this.nonce)
      throw new Error("Replacement terms use a different client nonce");
    await this.begin();
    const handle = await this.client.quote.publish({
      ...input,
      clientNonce: this.nonce,
    } as QuoteRequest);
    handle.priorId = this.priorId;
    return handle;
  }

  async begin(): Promise<void> {
    if (
      !(await this.client.options.connection.getAccountInfo(
        this.priorId,
        "confirmed",
      ))
    ) {
      if (
        await this.client.options.connection.getAccountInfo(
          this.nextId,
          "confirmed",
        )
      )
        return;
      throw new Error("Replacement quotes are unavailable");
    }
    const prior = await this.client.quoteState(this.priorId);
    const recorded =
      prior.replacementNonce == null
        ? undefined
        : BigInt(prior.replacementNonce.toString());
    if (recorded !== undefined && recorded !== this.nonce) {
      throw new Error("Prior quote is linked to a different successor");
    }
    if (recorded === undefined) {
      const actor = this.client.options.wallet.publicKey;
      await this.client.program.methods
        .beginQuoteReplacement(new anchor.BN(this.nonce.toString()))
        .accountsPartial({
          actor,
          grant: actor.equals(this.client.options.maker)
            ? this.client.program.programId
            : this.client.grantAddress(),
          quote: this.priorId,
        })
        .rpc({ commitment: "confirmed" });
    }
  }

  async rotate(
    handle = this.client.quote.get(this.nextId),
  ): Promise<QuoteSnapshot> {
    const snapshot = await handle.status();
    if (
      ["reserving", "active", "filled", "cancelled", "rejected"].includes(
        snapshot.status,
      )
    )
      return snapshot;
    if (snapshot.status !== "validated") return snapshot;
    const [prior, quote, market, account] = await Promise.all([
      this.client.quote.get(this.priorId).status(),
      this.client.quoteState(this.nextId),
      this.client.read<MarketState>("Market", this.client.marketAddress),
      this.client.read<{ status: Record<string, unknown> }>(
        "MarketAccount",
        this.client.marketAccount(),
      ),
    ]);
    if (prior.status !== "active") return handle.activate({ timeoutMs: 0 });
    const reference = BigInt(quote.oracleReferenceE8.toString());
    const price = BigInt(market.oraclePriceE8.toString());
    const drift = price > reference ? price - reference : reference - price;
    if (
      !quote.marketRevision.eq(market.revision) ||
      market.oracleTimestamp.lt(quote.oracleTimestamp) ||
      reference <= 0n ||
      drift * 10_000n >
        reference *
          BigInt(quoteBounds(market.config.maxQuoteDeviationBps).driftBps) ||
      quote.expiry.toNumber() <= Math.floor(Date.now() / 1000)
    )
      return handle.cancel();
    if (
      market.pendingOrders > 0 ||
      !("ready" in account.status) ||
      prior.attachedOrders > 0
    )
      return snapshot;
    const age =
      Math.floor(Date.now() / 1000) - market.oracleTimestamp.toNumber();
    if (
      age >
      market.config.maxOracleAgeSeconds -
        Math.min(60, Math.floor(market.config.maxOracleAgeSeconds / 2))
    )
      return snapshot;
    const offset = new anchor.BN(randomBytes(8), "le");
    const actor = this.client.options.wallet.publicKey;
    try {
      handle.reserveSignature = await this.client.program.methods
        .rotateQuote(offset)
        .accountsPartial({
          ...(await this.client.queue("rotate_quote", offset)),
          payer: actor,
          market: this.client.marketAddress,
          marketAccount: this.client.marketAccount(),
          quote: this.nextId,
          prior: this.priorId,
          grant: actor.equals(this.client.options.maker)
            ? this.client.program.programId
            : this.client.grantAddress(),
        })
        .rpc({ commitment: "confirmed" });
    } catch (error) {
      const receipt = await handle.status();
      if (["reserving", "active"].includes(receipt.status)) return receipt;
      const code = (error as { error?: { errorCode?: { code?: string } } })
        .error?.errorCode?.code;
      if (["WrongMarketAccountStatus", "WrongOrderStatus"].includes(code ?? ""))
        return receipt;
      throw error;
    }
    return handle.status();
  }

  async discard(): Promise<void> {
    const next = this.client.quote.get(this.nextId);
    const snapshot = await next.cancel();
    if (!["cancelled", "rejected"].includes(snapshot.status))
      throw new Error("Successor cancellation is still pending");
    const prior = await this.client.quoteState(this.priorId);
    if (prior.replacementNonce == null) return;
    const actor = this.client.options.wallet.publicKey;
    try {
      await this.client.program.methods
        .resetQuoteReplacement()
        .accountsPartial({
          actor,
          quote: this.priorId,
          successor: this.nextId,
          grant: actor.equals(this.client.options.maker)
            ? this.client.program.programId
            : this.client.grantAddress(),
        })
        .rpc({ commitment: "confirmed" });
    } catch (error) {
      if ((await this.client.quoteState(this.priorId)).replacementNonce != null)
        throw error;
    }
  }

  async resume(
    input: QuoteRequest,
    options: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<QuoteHandle> {
    if (input.clientNonce !== undefined && input.clientNonce !== this.nonce)
      throw new Error("Replacement terms use a different client nonce");
    const timeoutMs = options.timeoutMs ?? 60_000;
    const pollMs = options.pollMs ?? 1_000;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 0 ||
      !Number.isSafeInteger(pollMs) ||
      pollMs < 100
    )
      throw new RangeError(
        "Replacement timeout or polling interval is invalid",
      );
    const deadline = Date.now() + timeoutMs;
    const previous = this.client.quote.get(this.priorId);
    const next = await this.prepare(input);
    next.priorId = this.priorId;
    for (;;) {
      const snapshot = await next.status();
      if (
        ["validated", "waiting", "reserving", "active", "filled"].includes(
          snapshot.status,
        )
      )
        break;
      if (["rejected", "cancelled"].includes(snapshot.status))
        throw new Error(
          "Successor quote was rejected; prior quote remains available",
        );
      if (Date.now() >= deadline)
        throw new Error(
          `Successor quote ${this.nextId.toBase58()} is still validating`,
        );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollMs, deadline - Date.now())),
      );
    }
    if (
      !(await this.client.options.connection.getAccountInfo(
        this.priorId,
        "confirmed",
      ))
    )
      return next;
    for (;;) {
      const snapshot = await previous.status();
      if (["cancelled", "filled", "rejected"].includes(snapshot.status)) break;
      if (snapshot.status === "active") {
        await this.rotate(next);
        return next;
      }
      if (["active", "closing"].includes(snapshot.status)) {
        if (snapshot.status === "active" || snapshot.attachedOrders === 0)
          await previous.cancel();
      } else if (!["releasing"].includes(snapshot.status)) {
        throw new Error("Prior quote cannot be replaced in its current state");
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Prior quote ${this.priorId.toBase58()} still reserves capital`,
        );
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollMs, deadline - Date.now())),
      );
    }
    if (!next.id.equals(this.nextId))
      throw new Error("Replacement quote address changed");
    return next;
  }
}
