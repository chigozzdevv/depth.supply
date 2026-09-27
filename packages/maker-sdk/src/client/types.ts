import type { DeploymentPolicy } from "@depth/sdk";
import type * as anchor from "@anchor-lang/core";
import type { Connection, PublicKey } from "@solana/web3.js";
import { SOL_USD_MARKET_ID } from "@depth/bindings";

export type MakerOptions = {
  deployment: DeploymentPolicy;
  wallet: anchor.Wallet;
  maker: PublicKey;
  connection: Connection;
};

export type QuoteTier = { size: bigint; bidE8: bigint; askE8: bigint };

export type QuoteInput = {
  tiers: QuoteTier[];
  maxCapacity: bigint;
  expiresAt: number;
  clientNonce: bigint;
};

export type FlatQuoteInput = {
  marketId: typeof SOL_USD_MARKET_ID;
  bidE8: bigint;
  askE8: bigint;
  maxCapacity: bigint;
  validForSeconds: number;
  clientNonce?: bigint;
};

export type QuoteRequest = QuoteInput | FlatQuoteInput;

export type QuoteState = {
  status: Record<string, unknown>;
  maker: PublicKey;
  operator: PublicKey;
  operatorVersion: anchor.BN;
  market: PublicKey;
  capacity: anchor.BN;
  remainingCapacity: anchor.BN;
  expiry: anchor.BN;
  attachedOrders: number;
};

export type MarketState = {
  revision: anchor.BN;
  status: Record<string, unknown>;
  settlementMint: PublicKey;
  vault: PublicKey;
  oracleTimestamp: anchor.BN;
  activeQuoteCount: number;
  activeQuotes: PublicKey[];
  quotedNotional: anchor.BN;
  config: {
    quoteTiers: anchor.BN[];
    initialMarginBps: number;
    maxAccountNotional: anchor.BN;
    maxMarketNotional: anchor.BN;
    maxQuoteLifetimeSeconds: number;
    maxOracleAgeSeconds: number;
  };
};

export type GrantState = {
  active: boolean;
  canView: boolean;
  maker: PublicKey;
  operator: PublicKey;
  market: PublicKey;
  maxCapacity: anchor.BN;
  expiresAt: anchor.BN;
  version: anchor.BN;
};
