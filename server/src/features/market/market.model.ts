import type { PublicKey } from "@solana/web3.js";
import type { IntegerValue, Variant } from "@/shared/chain/chain.format";

export type MarketAccount = {
  status: Variant;
  incident: Variant;
  revision: IntegerValue;
  settlementMint: PublicKey;
  oracleAccount: PublicKey;
  oraclePriceE8: IntegerValue;
  oracleEmaE8: IntegerValue;
  oracleConfidenceE8: IntegerValue;
  oracleTimestamp: IntegerValue;
  oracleSlot: IntegerValue;
  fundingIndex: IntegerValue;
  lastFundingTimestamp: IntegerValue;
  pendingOrder: PublicKey;
  activeQuoteCount: number;
  activeQuotes: PublicKey[];
  config: {
    tradeFeeBps: number;
    insuranceFeeBps: number;
    initialMarginBps: number;
    maintenanceMarginBps: number;
    liquidationFeeBps: number;
    maxAccountNotional: IntegerValue;
    maxMarketNotional: IntegerValue;
    maxOracleAgeSeconds: number;
    maxConfidenceBps: number;
    maxQuoteDeviationBps: number;
    maxQuoteLifetimeSeconds: number;
    maxOrderQueueSeconds: number;
    fundingIntervalSeconds: number;
    fundingRateCapBps: number;
    quoteTiers: IntegerValue[];
    backstopMinCollateral: IntegerValue;
  };
};

export type QuoteQueueAccount = {
  market: PublicKey;
  count: number;
  entries: PublicKey[];
};
