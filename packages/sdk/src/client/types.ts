import * as anchor from "@anchor-lang/core";
import { SOL_USD_MARKET_ID } from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import type { AmountSelector } from "@/trade/amount";
import type {
  ConnectionOptions,
  ResolvedConnection,
} from "@/chain/environment";

export type DepthWallet = anchor.Wallet;

export type DepthOptions = ConnectionOptions & {
  appId?: PublicKey;
  wallet: DepthWallet;
};

export type ResolvedDepthOptions = ResolvedConnection & {
  appId?: PublicKey;
  wallet: DepthWallet;
};

export type TradeTerms = {
  marketId: typeof SOL_USD_MARKET_ID;
  worstPriceE8?: bigint;
  slippageBps?: number;
  maxFee: bigint;
  expiresAt?: number;
  validForSeconds?: number;
  clientNonce?: bigint;
};

export type TradeInput = TradeTerms & {
  direction: "long" | "short";
  notional: bigint;
  margin: bigint;
};

export type ReductionInput = TradeTerms & {
  amount: AmountSelector;
  positionId?: PublicKey;
};

export type CloseInput = TradeTerms & { positionId?: PublicKey };

export type ReverseInput = TradeInput & { positionId?: PublicKey };

export type MarketState = {
  revision: anchor.BN;
  settlementMint: PublicKey;
  vault: PublicKey;
  status: Record<string, unknown>;
  incident: Record<string, unknown>;
  fundingIndex: anchor.BN;
  lastFundingTimestamp: anchor.BN;
  pendingOrders: number;
  activeQuoteCount: number;
  activeQuotes: PublicKey[];
  backstopOffer: PublicKey;
  oracleTimestamp: anchor.BN;
  oraclePriceE8: anchor.BN;
  oracleEmaE8: anchor.BN;
  oracleConfidenceE8: anchor.BN;
  oracleSlot: anchor.BN;
  config: {
    maxOracleAgeSeconds: number;
    maxOrderQueueSeconds: number;
    initialMarginBps: number;
    maintenanceMarginBps: number;
    liquidationFeeBps: number;
    tradeFeeBps: number;
    insuranceFeeBps: number;
    maxAccountNotional: anchor.BN;
    maxMarketNotional: anchor.BN;
    maxConfidenceBps: number;
    maxQuoteDeviationBps: number;
    maxQuoteLifetimeSeconds: number;
    fundingIntervalSeconds: number;
    fundingRateCapBps: number;
    quoteTiers: anchor.BN[];
    backstopMinCollateral: anchor.BN;
  };
};

export type TradeIntent = "increase" | "reduce" | "close" | "reverse";

export type AccountState = {
  version: anchor.BN;
  status: Record<string, unknown>;
  market: PublicKey;
  owner: PublicKey;
};

export type AppState = {
  app: PublicKey;
  active: boolean;
  feeBps: number;
  version: anchor.BN;
};

export type ProtocolState = {
  tradingEnabled: boolean;
  settlementMint: PublicKey;
  vault: PublicKey;
};

export type OrderState = {
  status: Record<string, unknown>;
  kind: Record<string, unknown>;
  trader: PublicKey;
  market: PublicKey;
};
