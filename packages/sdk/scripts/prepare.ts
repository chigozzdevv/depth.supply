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
  getMXEPublicKey,
} from "@arcium-hq/client";
import {
  DEPTH_IDL,
  DEPTH_PROGRAM_ID,
  marketAddress,
  protocolAddress,
  recoveryConfigAddress,
  SOL_USD_PUSH_ACCOUNT,
  solUsdPublishTime,
} from "@depth/bindings";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DepthProvider } from "@/chain/provider";

const rpc = process.env.SOLANA_RPC_URL;
if (!rpc || new URL(rpc).protocol !== "https:") {
  throw new Error("SOLANA_RPC_URL must be an HTTPS devnet endpoint");
}
const signerPath =
  process.env.DEPTH_DEPLOYER_KEYPAIR_PATH ||
  "contracts/target/test-wallet.json";
const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(await readFile(signerPath, "utf8"))),
);
const connection = new Connection(rpc, "confirmed");
if (
  (await connection.getGenesisHash()) !==
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
) {
  throw new Error("The configured RPC does not point to Solana devnet");
}
const provider = new DepthProvider(connection, new anchor.Wallet(signer), {
  commitment: "confirmed",
  preflightCommitment: "confirmed",
});
const program = new anchor.Program(DEPTH_IDL, provider);
type ClearingState = { status: Record<string, unknown> };
const accounts = program.account as unknown as {
  protocol: { fetch(address: PublicKey): Promise<{ authority: PublicKey }> };
  market: {
    fetch(address: PublicKey): Promise<{
      status: Record<string, unknown>;
      oracleAccount: PublicKey;
      oracleTimestamp: anchor.BN;
      config: { maxOracleAgeSeconds: number };
    }>;
  };
  recoveryConfig: {
    fetch(address: PublicKey): Promise<{ recoveryKey: number[] }>;
  };
  clearingAccount: {
    fetchNullable(address: PublicKey): Promise<ClearingState | null>;
  };
};
const marketId = marketAddress();
const protocolId = protocolAddress();
const recoveryId = recoveryConfigAddress();
const clearingId = PublicKey.findProgramAddressSync(
  [Buffer.from("clearing"), marketId.toBuffer()],
  DEPTH_PROGRAM_ID,
)[0];
const protocol = await accounts.protocol.fetch(protocolId);
if (!protocol.authority.equals(signer.publicKey)) {
  throw new Error("The signer is not the protocol authority");
}
const market = await accounts.market.fetch(marketId);
if (!("draft" in market.status)) {
  throw new Error("Market preparation requires a draft market");
}
const recovery = await accounts.recoveryConfig.fetch(recoveryId);
const mxeId = getMXEAccAddress(DEPTH_PROGRAM_ID);
const arcium = getArciumProgram(provider);
const mxe = await arcium.account.mxeAccount.fetch(mxeId);
if (!mxe.mxeProgramId.equals(DEPTH_PROGRAM_ID)) {
  throw new Error("MXE belongs to another program");
}
if (!(await getMXEPublicKey(provider, DEPTH_PROGRAM_ID))) {
  throw new Error("MXE public key is not available");
}

const oracleInfo = await connection.getAccountInfo(SOL_USD_PUSH_ACCOUNT);
if (!oracleInfo || !market.oracleAccount.equals(SOL_USD_PUSH_ACCOUNT)) {
  throw new Error("The pinned sponsored oracle account is unavailable");
}
const publishTime = solUsdPublishTime(oracleInfo);
const age = Math.floor(Date.now() / 1_000) - publishTime;
if (age < 0 || age > market.config.maxOracleAgeSeconds) {
  throw new Error(`Sponsored oracle is stale by ${age} seconds`);
}
if (publishTime > market.oracleTimestamp.toNumber()) {
  const signature = await program.methods
    .refreshOracle()
    .accountsPartial({
      protocol: protocolId,
      market: marketId,
      priceUpdate: SOL_USD_PUSH_ACCOUNT,
    })
    .rpc({ commitment: "confirmed" });
  console.log(`oracle ${signature}`);
}

let clearing = await accounts.clearingAccount.fetchNullable(clearingId);
if (!clearing) {
  const definition = getCompDefAccAddress(
    DEPTH_PROGRAM_ID,
    Buffer.from(getCompDefAccOffset("open_clearing")).readUInt32LE(),
  );
  if (!(await connection.getAccountInfo(definition))) {
    throw new Error("open_clearing computation is not deployed");
  }
  const offset = new anchor.BN(randomBytes(8), "le");
  const signature = await program.methods
    .openClearing(offset, recovery.recoveryKey)
    .accountsPartial({
      authority: signer.publicKey,
      protocol: protocolId,
      market: marketId,
      recoveryConfig: recoveryId,
      clearing: clearingId,
      computationAccount: getComputationAccAddress(mxe.cluster, offset),
      clusterAccount: getClusterAccAddress(mxe.cluster),
      mxeAccount: mxeId,
      mempoolAccount: getMempoolAccAddress(mxe.cluster),
      executingPool: getExecutingPoolAccAddress(mxe.cluster),
      compDefAccount: definition,
    })
    .rpc({ commitment: "confirmed" });
  console.log(`open_clearing ${signature}`);
}

const deadline = Date.now() + 180_000;
let ready = false;
while (Date.now() < deadline) {
  clearing = await accounts.clearingAccount.fetchNullable(clearingId);
  if (clearing && "ready" in clearing.status) {
    console.log(`clearing ready ${clearingId.toBase58()}`);
    ready = true;
    break;
  }
  if (clearing && !("opening" in clearing.status)) {
    throw new Error(`Clearing status: ${Object.keys(clearing.status)[0]}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 3_000));
}
if (!ready) {
  throw new Error(`Clearing did not become ready: ${clearingId.toBase58()}`);
}
