import * as anchor from "@anchor-lang/core";
import { accountOffsets, marketAccountAddress } from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { ChainScan } from "@/shared/chain/chain.scan";
import type { ChainSigner } from "@/shared/chain/chain.signer";

type Variant = Record<string, unknown>;
type Integer = { toNumber(): number; toString(): string };
type RiskMarket = {
  pendingOrders: number;
  status: Variant;
  backstopOffer: PublicKey;
  oracleTimestamp: Integer;
  config: { maxOracleAgeSeconds: number; maxOrderQueueSeconds: number };
};
type Account = {
  owner: PublicKey;
  market: PublicKey;
  status: Variant;
  lastLiquidationTimestamp: Integer;
};
type Offer = {
  maker: PublicKey;
  market: PublicKey;
  status: Variant;
  expiry: Integer;
};
const RISK_PROBE_INTERVAL_SECONDS = 300;

export class RiskService {
  private readonly scan: ChainScan;
  private pending: Array<{ address: PublicKey; state: Account }> = [];

  constructor(private readonly chain: ChainSigner) {
    this.scan = new ChainScan(chain, "MarketAccount", [
      {
        offset: accountOffsets.MarketAccount.market,
        bytes: chain.market.toBase58(),
      },
    ]);
  }

  async advance(): Promise<string | undefined> {
    const market = await this.chain.read<RiskMarket>(
      "Market",
      this.chain.market,
    );
    const now = Math.floor(Date.now() / 1000);
    if (
      market.pendingOrders ||
      !("active" in market.status || "paused" in market.status) ||
      market.backstopOffer.equals(PublicKey.default) ||
      now < market.oracleTimestamp.toNumber() ||
      now - market.oracleTimestamp.toNumber() >=
        market.config.maxOracleAgeSeconds
    )
      return;
    const offer = await this.chain.read<Offer>(
      "BackstopOffer",
      market.backstopOffer,
    );
    if (
      !("active" in offer.status) ||
      offer.expiry.toNumber() <= now ||
      !offer.market.equals(this.chain.market)
    )
      return;
    const backstop = marketAccountAddress(offer.maker);
    const counterparty = await this.chain.read<Account>(
      "MarketAccount",
      backstop,
    );
    const clearing = await this.chain.read<{ status: Variant }>(
      "ClearingAccount",
      this.chain.clearing,
    );
    if (!("ready" in counterparty.status) || !("ready" in clearing.status))
      return;
    if (!this.pending.length) this.pending = await this.scan.next<Account>();
    while (this.pending.length) {
      const candidate = this.pending.shift()!;
      const target = await this.chain.read<Account>(
        "MarketAccount",
        candidate.address,
      );
      if (
        !target.market.equals(this.chain.market) ||
        target.owner.equals(offer.maker) ||
        !("ready" in target.status) ||
        now - target.lastLiquidationTimestamp.toNumber() <
          RISK_PROBE_INTERVAL_SECONDS ||
        target.lastLiquidationTimestamp.toNumber() >=
          market.oracleTimestamp.toNumber()
      )
        continue;
      const nonce = new anchor.BN(randomBytes(8), "le");
      const order = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          this.chain.market.toBuffer(),
          target.owner.toBuffer(),
          nonce.toArrayLike(Buffer, "le", 8),
        ],
        this.chain.program.programId,
      )[0];
      const offset = new anchor.BN(randomBytes(8), "le");
      return this.chain.program.methods
        .liquidate(
          offset,
          target.owner,
          nonce,
          new anchor.BN(now + market.config.maxOrderQueueSeconds),
        )
        .accountsPartial({
          ...(await this.chain.queue("liquidate", offset)),
          payer: this.chain.wallet.publicKey,
          order,
          trade: {
            protocol: this.chain.protocol,
            market: this.chain.market,
            clearing: this.chain.clearing,
            targetAccount: candidate.address,
            backstopAccount: backstop,
            offer: market.backstopOffer,
          },
        })
        .rpc({ commitment: "confirmed" });
    }
  }
}
