import type { PublicKey } from "@solana/web3.js";
import type { IntegerValue, Variant } from "@/chain/chain.format";

export type MarketAccount = {
  status: Variant;
  revision: IntegerValue;
  settlementMint: PublicKey;
  oraclePriceE8: IntegerValue;
  oracleTimestamp: IntegerValue;
  fundingIndex: IntegerValue;
  pendingOrder: PublicKey;
  config: {
    tradeFeeBps: number;
    insuranceFeeBps: number;
    initialMarginBps: number;
    maintenanceMarginBps: number;
  };
};
