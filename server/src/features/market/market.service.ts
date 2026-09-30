import {
  marketAddress,
  quoteQueueAddress,
  SOL_USD_MARKET_ID,
} from "@depth/bindings";
import type { PublicMarket } from "@depth/schema";
import { PublicKey } from "@solana/web3.js";
import type { ChainClient } from "@/shared/chain/chain.client";
import { integer, variant } from "@/shared/chain/chain.format";
import type {
  MarketAccount,
  QuoteQueueAccount,
} from "@/features/market/market.model";

export class MarketService {
  constructor(private readonly chain: ChainClient) {}

  async get(): Promise<PublicMarket | undefined> {
    const address = marketAddress(this.chain.programId);
    const [account, queue] = await Promise.all([
      this.chain.read<MarketAccount>(address, "Market"),
      this.chain.read<QuoteQueueAccount>(
        quoteQueueAddress(this.chain.programId),
        "QuoteQueue"
      ),
    ]);
    if (!account) return undefined;
    if (!queue || !queue.value.market.equals(address)) {
      throw new Error("Market quote queue is unavailable");
    }
    const { value, slot } = account;
    return {
      id: SOL_USD_MARKET_ID,
      address: address.toBase58(),
      status: variant(value.status) as PublicMarket["status"],
      incident: variant(value.incident) as PublicMarket["incident"],
      revision: integer(value.revision),
      settlement_mint: value.settlementMint.toBase58(),
      oracle_account: value.oracleAccount.toBase58(),
      oracle_price_e8: integer(value.oraclePriceE8),
      oracle_ema_e8: integer(value.oracleEmaE8),
      oracle_confidence_e8: integer(value.oracleConfidenceE8),
      oracle_timestamp: integer(value.oracleTimestamp),
      oracle_slot: integer(value.oracleSlot),
      funding_index: integer(value.fundingIndex),
      last_funding_timestamp: integer(value.lastFundingTimestamp),
      active_quote_ids: value.activeQuotes
        .slice(0, value.activeQuoteCount)
        .map((key) => key.toBase58()),
      waiting_quote_ids: queue.value.entries
        .slice(0, queue.value.count)
        .map((key) => key.toBase58()),
      fee_bps: value.config.tradeFeeBps,
      insurance_fee_bps: value.config.insuranceFeeBps,
      initial_margin_bps: value.config.initialMarginBps,
      maintenance_margin_bps: value.config.maintenanceMarginBps,
      liquidation_fee_bps: value.config.liquidationFeeBps,
      max_account_notional: integer(value.config.maxAccountNotional),
      max_market_notional: integer(value.config.maxMarketNotional),
      max_oracle_age_seconds: value.config.maxOracleAgeSeconds,
      max_confidence_bps: value.config.maxConfidenceBps,
      max_quote_deviation_bps: value.config.maxQuoteDeviationBps,
      max_quote_lifetime_seconds: value.config.maxQuoteLifetimeSeconds,
      max_order_queue_seconds: value.config.maxOrderQueueSeconds,
      funding_interval_seconds: value.config.fundingIntervalSeconds,
      funding_rate_cap_bps: value.config.fundingRateCapBps,
      quote_tiers: value.config.quoteTiers.map(integer),
      backstop_min_collateral: integer(value.config.backstopMinCollateral),
      ...(!value.pendingOrder.equals(PublicKey.default)
        ? { pending_order: value.pendingOrder.toBase58() }
        : {}),
      slot,
    };
  }
}
