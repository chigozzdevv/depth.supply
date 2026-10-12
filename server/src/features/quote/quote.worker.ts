import * as anchor from "@anchor-lang/core";
import {
  DEPTH_PROGRAM_ID,
  accountOffsets,
  quoteQueueAddress,
  quoteBounds,
} from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { ChainSigner } from "@/shared/chain/chain.signer";

type MarketState = {
  status: Record<string, unknown>;
  pendingOrders: number;
  activeQuoteCount: number;
  activeQuotes: PublicKey[];
  quotedNotional: anchor.BN;
  revision: anchor.BN;
  oracleTimestamp: anchor.BN;
  oraclePriceE8: anchor.BN;
  config: {
    maxMarketNotional: anchor.BN;
    maxQuoteDeviationBps: number;
    maxOracleAgeSeconds: number;
  };
};

type QueueState = {
  market: PublicKey;
  count: number;
  entries: PublicKey[];
};

type QuoteState = {
  market: PublicKey;
  maker: PublicKey;
  operator: PublicKey;
  status: Record<string, unknown>;
  capacity: anchor.BN;
  expiry: anchor.BN;
  marketRevision: anchor.BN;
  oracleTimestamp: anchor.BN;
  oracleReferenceE8: anchor.BN;
  attachedOrders: number;
};

export type QuoteProgress = {
  stage: "stop_quote" | "release_quote" | "reserve_quote";
  signature: string;
};

function status(value: Record<string, unknown>): string {
  return Object.keys(value)[0] ?? "unknown";
}

export class QuoteWorker {
  constructor(private readonly chain: ChainSigner) {}

  async advance(): Promise<QuoteProgress | undefined> {
    const [market, waiting] = await Promise.all([
      this.chain.read<MarketState>("Market", this.chain.market),
      this.chain.read<QueueState>("QuoteQueue", quoteQueueAddress()),
    ]);
    if (!waiting.market.equals(this.chain.market)) {
      throw new Error("Quote queue belongs to another market");
    }
    if (market.pendingOrders !== 0 || status(market.status) === "settling") {
      return undefined;
    }
    const now = Math.floor(Date.now() / 1_000);
    const active = await Promise.all(
      market.activeQuotes.slice(0, market.activeQuoteCount).map(async (id) => ({
        id,
        quote: await this.chain.read<QuoteState>("QuoteRecord", id),
      })),
    );
    let activeCapacity = 0n;
    for (const { quote } of active) {
      if (
        !quote.market.equals(this.chain.market) ||
        status(quote.status) !== "active"
      ) {
        return undefined;
      }
      activeCapacity += BigInt(quote.capacity.toString());
    }
    const closing =
      BigInt(market.quotedNotional.toString()) > activeCapacity
        ? await this.closingQuote()
        : undefined;
    if (closing) {
      const offset = new anchor.BN(randomBytes(8), "le");
      const quote = closing.account;
      const marketAccount = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market-account"),
          this.chain.market.toBuffer(),
          quote.maker.toBuffer(),
        ],
        DEPTH_PROGRAM_ID,
      )[0];
      const signature = await this.chain.program.methods
        .releaseQuote(offset)
        .accountsPartial({
          ...(await this.chain.queue("release_quote", offset)),
          payer: this.chain.wallet.publicKey,
          protocol: this.chain.protocol,
          market: this.chain.market,
          marketAccount,
          grant: DEPTH_PROGRAM_ID,
          quote: closing.id,
        })
        .rpc({ commitment: "confirmed" });
      return { stage: "release_quote", signature };
    }
    for (const { id, quote } of active) {
      if (quote.expiry.toNumber() <= now && this.owns(quote)) {
        const signature = await this.chain.program.methods
          .stopQuote()
          .accountsPartial({
            actor: this.chain.wallet.publicKey,
            market: this.chain.market,
            quoteQueue: quoteQueueAddress(),
            grant: DEPTH_PROGRAM_ID,
            quote: id,
          })
          .rpc({ commitment: "confirmed" });
        return { stage: "stop_quote", signature };
      }
    }
    if (waiting.count === 0 || status(market.status) === "paused")
      return undefined;
    const id = waiting.entries[0];
    const quote = await this.chain.read<QuoteState>("QuoteRecord", id);
    if (
      !quote.market.equals(this.chain.market) ||
      status(quote.status) !== "waiting"
    ) {
      throw new Error("Waiting quote pointer is inconsistent");
    }
    if (!this.owns(quote)) return undefined;
    const reference = BigInt(quote.oracleReferenceE8.toString());
    const price = BigInt(market.oraclePriceE8.toString());
    const drift = price > reference ? price - reference : reference - price;
    if (
      quote.expiry.toNumber() <= now ||
      !quote.marketRevision.eq(market.revision) ||
      quote.oracleTimestamp.gt(market.oracleTimestamp) ||
      reference <= 0n ||
      drift * 10_000n >
        reference *
          BigInt(quoteBounds(market.config.maxQuoteDeviationBps).driftBps)
    ) {
      const signature = await this.chain.program.methods
        .stopQuote()
        .accountsPartial({
          actor: this.chain.wallet.publicKey,
          market: this.chain.market,
          quoteQueue: quoteQueueAddress(),
          grant: DEPTH_PROGRAM_ID,
          quote: id,
        })
        .rpc({ commitment: "confirmed" });
      return { stage: "stop_quote", signature };
    }
    if (
      now - market.oracleTimestamp.toNumber() >
        market.config.maxOracleAgeSeconds -
          Math.min(60, Math.floor(market.config.maxOracleAgeSeconds / 2)) ||
      market.activeQuoteCount >= 4 ||
      BigInt(market.quotedNotional.toString()) +
        BigInt(quote.capacity.toString()) >
        BigInt(market.config.maxMarketNotional.toString())
    )
      return undefined;
    const offset = new anchor.BN(randomBytes(8), "le");
    const grant = quote.operator.equals(quote.maker)
      ? null
      : PublicKey.findProgramAddressSync(
          [
            Buffer.from("operator"),
            this.chain.market.toBuffer(),
            quote.maker.toBuffer(),
            quote.operator.toBuffer(),
          ],
          DEPTH_PROGRAM_ID,
        )[0];
    const marketAccount = PublicKey.findProgramAddressSync(
      [
        Buffer.from("market-account"),
        this.chain.market.toBuffer(),
        quote.maker.toBuffer(),
      ],
      DEPTH_PROGRAM_ID,
    )[0];
    const signature = await this.chain.program.methods
      .reserveQuote(offset)
      .accountsPartial({
        ...(await this.chain.queue("reserve_quote", offset)),
        payer: this.chain.wallet.publicKey,
        protocol: this.chain.protocol,
        market: this.chain.market,
        marketAccount,
        grant: grant ?? DEPTH_PROGRAM_ID,
        quote: id,
      })
      .remainingAccounts([
        {
          pubkey: quoteQueueAddress(),
          isSigner: false,
          isWritable: true,
        },
      ])
      .rpc({ commitment: "confirmed" });
    return { stage: "reserve_quote", signature };
  }

  private async closingQuote(): Promise<
    { id: PublicKey; account: QuoteState } | undefined
  > {
    const accounts = await this.chain.connection.getProgramAccounts(
      DEPTH_PROGRAM_ID,
      {
        commitment: "confirmed",
        filters: [
          { memcmp: this.chain.program.coder.accounts.memcmp("quoteRecord") },
          {
            memcmp: {
              offset: accountOffsets.QuoteRecord.market,
              bytes: this.chain.market.toBase58(),
            },
          },
        ],
      },
    );
    for (const entry of [...accounts].sort((a, b) =>
      a.pubkey.toBase58().localeCompare(b.pubkey.toBase58()),
    )) {
      const account = this.chain.program.coder.accounts.decode<QuoteState>(
        "quoteRecord",
        entry.account.data,
      );
      if (
        status(account.status) === "closing" &&
        this.owns(account) &&
        account.attachedOrders === 0
      ) {
        return { id: entry.pubkey, account };
      }
    }
    return undefined;
  }
  private owns(quote: QuoteState) {
    return (
      quote.maker.equals(this.chain.wallet.publicKey) ||
      quote.operator.equals(this.chain.wallet.publicKey)
    );
  }
}
