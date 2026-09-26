import { marketAddress, SOL_USD_MARKET_ID } from "@depth/bindings";
import type { PublicMarket } from "@depth/schema";
import { PublicKey } from "@solana/web3.js";
import type { ChainClient } from "@/chain/chain.client";
import { integer, variant } from "@/chain/chain.format";
import type { MarketAccount } from "@/market/market.model";

export class MarketService {
  constructor(private readonly chain: ChainClient) {}

  async get(): Promise<PublicMarket | undefined> {
    const address = marketAddress(this.chain.programId);
    const account = await this.chain.read<MarketAccount>(address, "Market");
    if (!account) return undefined;
    const { value, slot } = account;
    return {
      id: SOL_USD_MARKET_ID,
      address: address.toBase58(),
      status: variant(value.status) as PublicMarket["status"],
      revision: integer(value.revision),
      settlement_mint: value.settlementMint.toBase58(),
      oracle_price_e8: integer(value.oraclePriceE8),
      oracle_timestamp: integer(value.oracleTimestamp),
      funding_index: integer(value.fundingIndex),
      fee_bps: value.config.tradeFeeBps,
      insurance_fee_bps: value.config.insuranceFeeBps,
      initial_margin_bps: value.config.initialMarginBps,
      maintenance_margin_bps: value.config.maintenanceMarginBps,
      ...(!value.pendingOrder.equals(PublicKey.default)
        ? { pending_order: value.pendingOrder.toBase58() }
        : {}),
      slot,
    };
  }
}
