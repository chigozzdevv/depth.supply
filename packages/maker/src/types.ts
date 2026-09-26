import type * as anchor from "@anchor-lang/core";
import type { Connection, PublicKey } from "@solana/web3.js";

export type MakerOptions = {
  wallet: anchor.Wallet;
  maker: PublicKey;
  connection: Connection;
};

export type QuoteTier = { size: bigint; bidE8: bigint; askE8: bigint };

export type QuoteInput = {
  tiers: QuoteTier[];
  maxCapacity: bigint;
  expiresAt: number;
  clientNonce?: bigint;
};

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
  oracleTimestamp: anchor.BN;
  activeQuoteCount: number;
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
};
