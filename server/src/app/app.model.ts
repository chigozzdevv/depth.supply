import type { PublicKey } from "@solana/web3.js";
import type { IntegerValue } from "@/chain/chain.format";

export type AppAccount = {
  app: PublicKey;
  feeBps: number;
  version: IntegerValue;
  active: boolean;
};
