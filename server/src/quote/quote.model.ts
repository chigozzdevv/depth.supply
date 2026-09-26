import type { PublicKey } from "@solana/web3.js";
import type { IntegerValue, Variant } from "@/chain/chain.format";

export type QuoteAccount = {
  maker: PublicKey;
  operator: PublicKey;
  market: PublicKey;
  status: Variant;
  capacity: IntegerValue;
  remainingCapacity: IntegerValue;
  tierCount: number;
  expiry: IntegerValue;
};
