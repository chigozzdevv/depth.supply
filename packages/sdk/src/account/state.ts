import * as anchor from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";

export type AccountState = {
  id: string;
  status:
    | "uninitialized"
    | "opening"
    | "ready"
    | "crediting"
    | "withdrawing"
    | "moving"
    | "claiming";
  version: bigint;
  slot: number;
};

export async function balanceState(
  program: anchor.Program,
  connection: Connection,
  owner: PublicKey,
  address: PublicKey,
): Promise<AccountState> {
  const { context, value } = await connection.getAccountInfoAndContext(
    address,
    "confirmed",
  );
  const base = { id: address.toBase58(), slot: context.slot };
  if (!value) return { ...base, status: "uninitialized", version: 0n };
  if (!value.owner.equals(program.programId))
    throw new Error("Balance account is not owned by Depth");
  const state = program.coder.accounts.decode<{
    owner: PublicKey;
    status: Record<string, unknown>;
    version: anchor.BN;
  }>("balanceAccount", value.data);
  if (!state.owner.equals(owner))
    throw new Error("Balance account does not belong to this wallet");
  const status = Object.keys(state.status)[0];
  if (
    ![
      "opening",
      "ready",
      "crediting",
      "withdrawing",
      "moving",
      "claiming",
    ].includes(status)
  )
    throw new Error("Balance account has an invalid status");
  return {
    ...base,
    status: status as AccountState["status"],
    version: BigInt(state.version.toString()),
  };
}
