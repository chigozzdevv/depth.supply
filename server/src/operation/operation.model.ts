import type { PublicKey } from "@solana/web3.js";
import type { Variant } from "@/chain/chain.format";

export const operationAccounts = [
  "OrderRecord",
  "DepositReceipt",
  "QuoteRecord",
  "MarginTransfer",
] as const;

export type OrderAccount = {
  kind: Variant;
  status: Variant;
  trader: PublicKey;
  market: PublicKey;
};
export type DepositAccount = { status: Variant; owner: PublicKey };
export type QuoteAccount = {
  status: Variant;
  maker: PublicKey;
  market: PublicKey;
};
export type MarginAccount = {
  status: Variant;
  owner: PublicKey;
  market: PublicKey;
};
