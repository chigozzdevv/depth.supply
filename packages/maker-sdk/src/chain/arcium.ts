import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import {
  getArciumProgram,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
} from "@arcium-hq/client";
import { computationName, DEPTH_PROGRAM_ID } from "@depth/bindings";
import type { Connection, PublicKey } from "@solana/web3.js";

type MxeState = { cluster: number; mxeProgramId: PublicKey };

export function mxeAccount(provider: anchor.AnchorProvider): {
  fetch(address: PublicKey): Promise<MxeState>;
} {
  const arcium = getArciumProgram(provider) as unknown as {
    account: { mxeAccount: { fetch(address: PublicKey): Promise<MxeState> } };
  };
  return arcium.account.mxeAccount;
}

export async function queueAccounts(
  provider: anchor.AnchorProvider,
  connection: Connection,
  name: string,
  offset: anchor.BN,
) {
  const mxeAddress = getMXEAccAddress(DEPTH_PROGRAM_ID);
  const mxe = await mxeAccount(provider).fetch(mxeAddress);
  if (!mxe.mxeProgramId.equals(DEPTH_PROGRAM_ID)) {
    throw new Error("MXE is registered for another program");
  }
  const definition = getCompDefAccAddress(
    DEPTH_PROGRAM_ID,
    Buffer.from(getCompDefAccOffset(computationName(name))).readUInt32LE(),
  );
  if (!(await connection.getAccountInfo(definition, "confirmed"))) {
    throw new Error(`${name} computation is not deployed`);
  }
  return {
    computationAccount: getComputationAccAddress(mxe.cluster, offset),
    clusterAccount: getClusterAccAddress(mxe.cluster),
    mxeAccount: mxeAddress,
    mempoolAccount: getMempoolAccAddress(mxe.cluster),
    executingPool: getExecutingPoolAccAddress(mxe.cluster),
    compDefAccount: definition,
  };
}
