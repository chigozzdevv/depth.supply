import { SOL_USD_FEED_ID } from "@depth/bindings";
import { PublicKey } from "@solana/web3.js";
import type { ChainSigner } from "@/shared/chain/chain.signer";

export type OracleMarket = {
  pendingOrders: number;
  status: Record<string, unknown>;
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
    if (market.pendingOrders !== 0 || "settling" in market.status) return;
    const info = await this.chain.connection.getAccountInfo(
      this.address,
      "confirmed",
    );
    if (
      !info ||
      !info.owner.equals(
        new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"),
      ) ||
      info.data.length < 133 ||
      !info.data
        .subarray(0, 8)
        .equals(Buffer.from("22f123639d7ef4cd", "hex")) ||
      info.data[40] !== 1 ||
      !info.data.subarray(41, 73).equals(SOL_USD_FEED_ID)
    ) {
      throw new Error(
        "Configured price account is not a verified SOL/USD Pyth update",
      );
    }
    if (
      info.data.readBigInt64LE(93) <= BigInt(market.oracleTimestamp.toString())
    )
      return;
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
