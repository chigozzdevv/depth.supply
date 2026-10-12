import type {
  ConnectionOptions,
  ResolvedConnection,
  DepthWallet,
} from "@depthhq/sdk";
import type * as anchor from "@anchor-lang/core";
import type { PublicKey } from "@solana/web3.js";
import { SOL_USD_MARKET_ID } from "@depthhq/bindings";

export type MakerOptions = ConnectionOptions & {
  wallet: DepthWallet & {
    signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  };
  maker?: PublicKey;
  makerOwner?: PublicKey;
  appId?: PublicKey | string;
  cursorDirectory?: string;
  privateViews?: "memory" | "device";
  viewAuthorization?: "session" | "wallet";
  settlement?: "keeper" | "wallet";
};

export type ResolvedMakerOptions = ResolvedConnection &
  Omit<MakerOptions, keyof ConnectionOptions | "maker" | "appId"> & {
    maker: PublicKey;
    appId?: PublicKey;
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
  nonce: anchor.BN;
  capacity: anchor.BN;
  expiry: anchor.BN;
  attachedOrders: number;
  pendingComputation?: PublicKey;
  marketRevision: anchor.BN;
  oracleTimestamp: anchor.BN;
  oracleReferenceE8: anchor.BN;
  replacementNonce: anchor.BN | null;
};

export type MarketState = {
  revision: anchor.BN;
  status: Record<string, unknown>;
  settlementMint: PublicKey;
  vault: PublicKey;
  oracleTimestamp: anchor.BN;
  oraclePriceE8: anchor.BN;
  pendingOrders: number;
  backstopOffer: PublicKey;
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
    maxQuoteDeviationBps: number;
    backstopMinCollateral: anchor.BN;
  };
};

export type QuoteQueueState = {
  market: PublicKey;
  count: number;
  entries: PublicKey[];
};

export type BackstopInput = {
  marketId: typeof SOL_USD_MARKET_ID;
  maxCapacity: bigint;
  validForSeconds: number;
  clientNonce?: bigint;
};

export type BackstopState = {
  maker: PublicKey;
  market: PublicKey;
  nonce: anchor.BN;
  capacity: anchor.BN;
  margin: anchor.BN;
  expiry: anchor.BN;
  status: Record<string, unknown>;
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
