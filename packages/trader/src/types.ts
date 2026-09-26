import * as anchor from "@anchor-lang/core";
import { SOL_USD_MARKET_ID } from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";

export type DepthWallet = anchor.Wallet;

export type DepthOptions = {
  appId: PublicKey;
  wallet: DepthWallet;
  connection: Connection;
};

export type TradeInput = {
  marketId: typeof SOL_USD_MARKET_ID;
  direction: "long" | "short";
  notional: bigint;
  margin: bigint;
  worstPriceE8: bigint;
  maxFee: bigint;
  expiresAt: number;
};

export type MarketState = {
  settlementMint: PublicKey;
  vault: PublicKey;
  status: Record<string, unknown>;
  pendingOrders: number;
  activeQuoteCount: number;
  activeQuotes: PublicKey[];
  backstopOffer: PublicKey;
  oracleTimestamp: anchor.BN;
  config: { maxOracleAgeSeconds: number; maxOrderQueueSeconds: number };
};

export type AccountState = {
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
};
