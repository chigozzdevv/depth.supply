import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID, SOL_USD_MARKET_ID } from "@depth/bindings";
import { DepthError } from "@depth/sdk";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "@/chain/random";
import type { MakerClient } from "@/client/client";
import type { BackstopInput, BackstopState, MarketState } from "@/client/types";

export type BackstopSnapshot = {
  offerId: PublicKey;
  status: string;
  capacity: bigint;
  margin: bigint;
  expiresAt: number;
};

type ConfirmOptions = { timeoutMs?: number; pollMs?: number };

function u64(value: bigint, name: string): anchor.BN {
  if (typeof value !== "bigint" || value < 0n || value > (1n << 64n) - 1n)
    throw new RangeError(`${name} must be an unsigned 64-bit bigint`);
  return new anchor.BN(value.toString());
}

function timing(options: ConfirmOptions): {
  timeoutMs: number;
  pollMs: number;
} {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollMs = options.pollMs ?? 1_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0)
    throw new RangeError("timeoutMs must be a nonnegative integer");
  if (!Number.isSafeInteger(pollMs) || pollMs < 100)
    throw new RangeError("pollMs must be at least 100");
  return { timeoutMs, pollMs };
}

function address(
  market: PublicKey,
  maker: PublicKey,
  nonce: bigint,
): PublicKey {
  const bytes = u64(nonce, "clientNonce").toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("backstop"), market.toBuffer(), maker.toBuffer(), bytes],
    DEPTH_PROGRAM_ID,
  )[0];
}

async function poll(
  read: () => Promise<BackstopSnapshot>,
  terminal: (status: string) => boolean,
  options: ConfirmOptions,
): Promise<BackstopSnapshot> {
  const { timeoutMs, pollMs } = timing(options);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snapshot = await read();
    if (terminal(snapshot.status) || Date.now() >= deadline) return snapshot;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(pollMs, deadline - Date.now())),
    );
  }
}

export class BackstopHandle {
  constructor(
    readonly id: PublicKey,
    private readonly client: MakerClient,
    readonly signature?: string,
  ) {}

  static async offer(
    client: MakerClient,
    input: BackstopInput,
  ): Promise<BackstopHandle> {
    if (!client.options.wallet.publicKey.equals(client.options.maker))
      throw new Error("Only the maker owner can offer backstop capacity");
    if (input.marketId !== SOL_USD_MARKET_ID)
      throw new Error("Only SOL-USD is supported");
    if (
      !Number.isSafeInteger(input.validForSeconds) ||
      input.validForSeconds < 1 ||
      input.validForSeconds > 86_400
    )
      throw new RangeError("Backstop duration must be from 1 to 86400 seconds");
    const capacity = u64(input.maxCapacity, "maxCapacity");
    if (input.maxCapacity === 0n)
      throw new RangeError("Backstop capacity must be positive");
    const nonce =
      input.clientNonce ??
      BigInt(new anchor.BN(randomBytes(8), "le").toString());
    const offerId = address(client.marketAddress, client.options.maker, nonce);
    if (await client.options.connection.getAccountInfo(offerId, "confirmed"))
      throw new Error(
        "Backstop nonce is already used; restore its offer by ID",
      );
    const [market, account] = await Promise.all([
      client.read<MarketState>("Market", client.marketAddress),
      client.read<{
        owner: PublicKey;
        market: PublicKey;
        status: Record<string, unknown>;
      }>("MarketAccount", client.marketAccount()),
    ]);
    const now = Math.floor(Date.now() / 1_000);
    const margin =
      (input.maxCapacity * BigInt(market.config.initialMarginBps) + 9_999n) /
      10_000n;
    if (
      !market.backstopOffer.equals(PublicKey.default) ||
      market.pendingOrders !== 0 ||
      Object.keys(market.status)[0] === "settling" ||
      input.maxCapacity > BigInt(market.config.maxAccountNotional.toString()) ||
      margin < BigInt(market.config.backstopMinCollateral.toString())
    )
      throw new Error("Backstop offer is outside the current market policy");
    if (
      !account.owner.equals(client.options.maker) ||
      !account.market.equals(client.marketAddress) ||
      !("ready" in account.status)
    )
      throw new Error("Maker market account is unavailable");
    const oracleAge = now - market.oracleTimestamp.toNumber();
    if (oracleAge < 0 || oracleAge > market.config.maxOracleAgeSeconds)
      throw new Error("Oracle update is stale");
    const offset = new anchor.BN(randomBytes(8), "le");
    const expiry = now + input.validForSeconds;
    const signature = await client.program.methods
      .offerBackstop(
        offset,
        u64(nonce, "clientNonce"),
        capacity,
        new anchor.BN(expiry),
      )
      .accountsPartial({
        ...(await client.queue("offer_backstop", offset)),
        maker: client.options.maker,
        market: client.marketAddress,
        marketAccount: client.marketAccount(),
        offer: offerId,
      })
      .rpc({ commitment: "confirmed" })
      .catch((cause: unknown) => {
        throw new DepthError(
          "BACKSTOP_SUBMISSION_UNCONFIRMED",
          "submission",
          "Backstop submission was not confirmed",
          true,
          "Restore the offer by ID before submitting another nonce",
          offerId.toBase58(),
          { cause },
        );
      });
    return new BackstopHandle(offerId, client, signature);
  }

  async status(): Promise<BackstopSnapshot> {
    const state = await this.client.read<BackstopState>(
      "BackstopOffer",
      this.id,
    );
    const nonce = BigInt(state.nonce.toString());
    if (
      !state.maker.equals(this.client.options.maker) ||
      !state.market.equals(this.client.marketAddress) ||
      !address(state.market, state.maker, nonce).equals(this.id)
    )
      throw new Error(
        "Backstop offer does not belong to this maker and market",
      );
    return {
      offerId: this.id,
      status: Object.keys(state.status)[0] ?? "unknown",
      capacity: BigInt(state.capacity.toString()),
      margin: BigInt(state.margin.toString()),
      expiresAt: state.expiry.toNumber(),
    };
  }

  async confirm(
    options: ConfirmOptions = {},
  ): Promise<{ offerId: PublicKey; snapshot: BackstopSnapshot }> {
    const snapshot = await poll(
      () => this.status(),
      (status) =>
        ["active", "locked", "consumed", "rejected", "cancelled"].includes(
          status,
        ),
      options,
    );
    if (["active", "locked", "consumed"].includes(snapshot.status))
      return { offerId: this.id, snapshot };
    throw new DepthError(
      snapshot.status === "reserving"
        ? "BACKSTOP_PENDING"
        : "BACKSTOP_REJECTED",
      "confirmation",
      `Backstop offer is ${snapshot.status}`,
      snapshot.status === "reserving",
      "Read the canonical offer status before making another offer",
      this.id.toBase58(),
    );
  }

  async release(): Promise<BackstopRelease> {
    if (!this.client.options.wallet.publicKey.equals(this.client.options.maker))
      throw new Error("Only the maker owner can release backstop capacity");
    const snapshot = await this.status();
    if (snapshot.status === "releasing" || snapshot.status === "cancelled")
      return new BackstopRelease(this);
    if (snapshot.status !== "active")
      throw new Error("Backstop offer cannot be released in its current state");
    const offset = new anchor.BN(randomBytes(8), "le");
    const signature = await this.client.program.methods
      .releaseBackstop(offset)
      .accountsPartial({
        ...(await this.client.queue("release_backstop", offset)),
        actor: this.client.options.maker,
        protocol: this.client.protocolAddress,
        market: this.client.marketAddress,
        marketAccount: this.client.marketAccount(),
        offer: this.id,
      })
      .rpc({ commitment: "confirmed" })
      .catch((cause: unknown) => {
        throw new DepthError(
          "BACKSTOP_RELEASE_UNCONFIRMED",
          "submission",
          "Backstop release was not confirmed",
          true,
          "Read this offer before requesting release again",
          this.id.toBase58(),
          { cause },
        );
      });
    return new BackstopRelease(this, signature);
  }

  async close(): Promise<string> {
    if (!this.client.options.wallet.publicKey.equals(this.client.options.maker))
      throw new Error("Only the maker owner can close its backstop record");
    const snapshot = await this.status();
    if (!["cancelled", "rejected", "consumed"].includes(snapshot.status))
      throw new Error("Backstop offer is not terminal");
    return this.client.program.methods
      .closeBackstop()
      .accountsPartial({ maker: this.client.options.maker, offer: this.id })
      .rpc({ commitment: "confirmed" });
  }
}

export class BackstopRelease {
  constructor(
    private readonly offer: BackstopHandle,
    readonly signature?: string,
  ) {}

  async confirm(options: ConfirmOptions = {}): Promise<BackstopSnapshot> {
    const snapshot = await poll(
      () => this.offer.status(),
      (status) => status === "cancelled",
      options,
    );
    if (snapshot.status === "cancelled") return snapshot;
    throw new DepthError(
      snapshot.status === "releasing"
        ? "BACKSTOP_RELEASE_PENDING"
        : "BACKSTOP_RELEASE_FAILED",
      "confirmation",
      `Backstop release is ${snapshot.status}`,
      snapshot.status === "releasing",
      "Read the offer and retry release only if it is active",
      this.offer.id.toBase58(),
    );
  }
}
