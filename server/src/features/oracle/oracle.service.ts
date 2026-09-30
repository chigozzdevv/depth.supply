import { PublicKey } from "@solana/web3.js";
import { priceTimestamp } from "@/features/oracle/oracle.price";
import type { ChainSigner } from "@/shared/chain/chain.signer";

export type OracleMarket = {
  pendingOrders: number;
  status: Record<string, unknown>;
  oracleAccount: PublicKey;
  oracleTimestamp: { toString(): string };
};

export class OracleService {
  constructor(
    private readonly chain: ChainSigner,
    private readonly address: PublicKey,
  ) {}

  async advance(): Promise<string | undefined> {
    const market = await this.chain.read<OracleMarket>(
      "Market",
      this.chain.market,
    );
    if (!market.oracleAccount.equals(this.address)) {
      throw new Error("Configured Pyth account does not match the market oracle");
    }
    if (market.pendingOrders !== 0 || "settling" in market.status) return;
    const info = await this.chain.connection.getAccountInfo(
      this.address,
      "confirmed",
    );
    if (!info) throw new Error("Configured Pyth price account is missing");
    if (BigInt(priceTimestamp(info)) <= BigInt(market.oracleTimestamp.toString())) return;
    return this.chain.program.methods
      .refreshOracle()
      .accountsPartial({
        protocol: this.chain.protocol,
        market: this.chain.market,
        priceUpdate: this.address,
      })
      .rpc({ commitment: "confirmed" });
  }
}
