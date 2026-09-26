import * as anchor from "@anchor-lang/core";
import { getArciumProgram } from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";

type MxeState = { cluster: number; mxeProgramId: PublicKey };

export function arciumAccount(provider: anchor.AnchorProvider): {
  fetch(address: PublicKey): Promise<MxeState>;
} {
  const arcium = getArciumProgram(provider) as unknown as {
    account: { mxeAccount: { fetch(address: PublicKey): Promise<MxeState> } };
  };
  return arcium.account.mxeAccount;
}
