import * as anchor from "@anchor-lang/core";
import {
  getArciumProgram,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  getMXEAccAddress,
} from "@arcium-hq/client";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { readCircuits } from "./circuits.mjs";
import { submitTransaction } from "./tx.mjs";

const genesisHash = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const clusterOffset = 456;
const rpc = process.env.SOLANA_RPC_URL;
if (!rpc || new URL(rpc).protocol !== "https:") {
  throw new Error("SOLANA_RPC_URL must be an HTTPS devnet endpoint");
}
const connection = new Connection(rpc, "confirmed");
if ((await connection.getGenesisHash()) !== genesisHash) {
  throw new Error("The configured RPC does not point to Solana devnet");
}
const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync("target/test-wallet.json", "utf8")))
);
const idl = JSON.parse(readFileSync("target/idl/depth.json", "utf8"));
const programId = new PublicKey(idl.address);
const programAccount = await connection.getAccountInfo(programId);
if (!programAccount?.executable) throw new Error("Depth is not deployed");
const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(signer),
  { commitment: "confirmed" }
);
const program = new anchor.Program(idl, provider);
const arcium = getArciumProgram(provider);
const mxeAccount = getMXEAccAddress(programId);
const mxe = await arcium.account.mxeAccount.fetch(mxeAccount);
if (mxe.cluster !== clusterOffset || !mxe.mxeProgramId.equals(programId)) {
  throw new Error("Depth MXE is not active on devnet cluster 456");
}
const addressLookupTable = getLookupTableAddress(programId, mxe.lutOffsetSlot);
const circuits = await readCircuits();
const circuitBase = process.env.DEPTH_CIRCUIT_BASE_URL?.replace(/\/+$/, "");
if (!circuitBase || new URL(circuitBase).protocol !== "https:") {
  throw new Error("DEPTH_CIRCUIT_BASE_URL must be an HTTPS URL");
}

for (const { name, hash } of circuits) {
  const offset = Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
  const compDefAccount = getCompDefAccAddress(programId, offset);
  const existing = await connection.getAccountInfo(compDefAccount);
  if (existing) {
    if (!existing.owner.equals(arcium.programId)) {
      throw new Error(`Wrong owner for computation definition ${name}`);
    }
  } else {
    const methodName = `init${name
      .replace(/_v\d+$/, "")
      .split("_")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join("")}CompDef`;
    if (!program.methods[methodName]) {
      throw new Error(`Missing instruction ${methodName}`);
    }
    const transaction = await program.methods[methodName]()
      .accountsPartial({
        payer: signer.publicKey,
        mxeAccount,
        compDefAccount,
        addressLookupTable,
      })
      .transaction();
    const signature = await submitTransaction(connection, signer, transaction);
    console.log(`${name}: initialized ${signature}`);
  }
  const definition = await arcium.account.computationDefinitionAccount.fetch(
    compDefAccount
  );
  const source = definition.circuitSource.offChain?.[0];
  if (
    !source ||
    new URL(source.source).protocol !== "https:" ||
    !new URL(source.source).pathname.endsWith(`/${name}.arcis`) ||
    (!existing && source.source !== `${circuitBase}/${name}.arcis`) ||
    !Buffer.from(source.hash).equals(hash)
  ) {
    throw new Error(`Definition ${name} has the wrong circuit URL or hash`);
  }
  console.log(`${name}: verified`);
}
console.log(`Verified ${circuits.length} onchain computation definitions`);
