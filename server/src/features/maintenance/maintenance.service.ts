import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import type { ChainSigner } from "@/shared/chain/chain.signer";

type Integer = { toNumber(): number; toString(): string };
type Market = {
  status: Record<string, unknown>;
  incident: Record<string, unknown>;
  backstopOffer: PublicKey;
  pendingOrders: number;
  oracleTimestamp: Integer;
  config: { maxOracleAgeSeconds: number };
};

export class MaintenanceService {
  private lastCheck = 0;
  constructor(
    private readonly chain: ChainSigner,
    private readonly enabled: boolean,
  ) {}
  async advance(): Promise<{ stage: string; signature: string } | undefined> {
    if (!this.enabled || Date.now() - this.lastCheck < 60_000) return;
    this.lastCheck = Date.now();
    if (
      (await this.chain.connection.getGenesisHash()) !==
      "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
    )
      throw new Error("Demo maintenance is restricted to devnet");
    const [market, protocol] = await Promise.all([
      this.chain.read<Market>("Market", this.chain.market),
      this.chain.read<{ authority: PublicKey; vault: PublicKey }>(
        "Protocol",
        this.chain.protocol,
      ),
    ]);
    if (!protocol.authority.equals(this.chain.wallet.publicKey))
      throw new Error("Demo maintenance requires the protocol authority");
    if (market.pendingOrders || market.backstopOffer.equals(PublicKey.default))
      return;
    const offer = await this.chain.read<{
      maker: PublicKey;
      status: Record<string, unknown>;
      expiry: Integer;
    }>("BackstopOffer", market.backstopOffer);
    const now = Math.floor(Date.now() / 1000);
    if (
      !offer.maker.equals(this.chain.wallet.publicKey) ||
      !("active" in offer.status) ||
      offer.expiry.toNumber() <= now
    )
      return;
    if (offer.expiry.toNumber() - now < 21_600) {
      const signature = await this.chain.program.methods
        .renewBackstop(new anchor.BN(now + 86_400))
        .accountsPartial({
          maker: this.chain.wallet.publicKey,
          market: this.chain.market,
          offer: market.backstopOffer,
        })
        .rpc({ commitment: "confirmed" });
      return { stage: "renew_backstop", signature };
    }
    if (
      ("staleOracle" in market.incident ||
        "missedFunding" in market.incident) &&
      "paused" in market.status &&
      now >= market.oracleTimestamp.toNumber() &&
      now - market.oracleTimestamp.toNumber() <=
        market.config.maxOracleAgeSeconds
    ) {
      const signature = await this.chain.program.methods
        .resumeMarket()
        .accountsPartial({
          authority: this.chain.wallet.publicKey,
          protocol: this.chain.protocol,
          market: this.chain.market,
          clearing: this.chain.clearing,
          backstopOffer: market.backstopOffer,
          vault: protocol.vault,
        })
        .rpc({ commitment: "confirmed" });
      return { stage: "resume_demo_market", signature };
    }
  }
}
