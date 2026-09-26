import type { PublicKey } from "@solana/web3.js";
import type { IntegerValue } from "@/chain/chain.format";

export type RecoveryAccount = {
  market: PublicKey;
  recoveryKey: number[];
  signers: PublicKey[];
  accountCount: number;
};

export type WinddownAccount = {
  market: PublicKey;
  priceE8: IntegerValue;
  fundingIndex: IntegerValue;
  expectedAccounts: number;
  revealedAccounts: number;
  paidAccounts: number;
  grossPositive: IntegerValue;
  payoutPool: IntegerValue;
  remainingPool: IntegerValue;
  finalized: boolean;
};
