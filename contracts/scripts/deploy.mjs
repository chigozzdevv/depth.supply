import * as anchor from "@anchor-lang/core";
import {
  getArciumProgram,
  getClusterAccAddress,
  getMXEAccAddress,
} from "@arcium-hq/client";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { readCircuits, verifyRemote } from "./circuits.mjs";

const genesisHash = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const clusterOffset = 456;
const programPath = "target/deploy/depth.so";
const programSize = statSync(programPath).size;
const maxLength = programSize;
const programKeypairPath = "target/deploy/depth-keypair.json";
const signerPath = "target/test-wallet.json";
const programId = new PublicKey(
  JSON.parse(readFileSync("target/idl/depth.json", "utf8")).address
);
const resume = process.argv.includes("--resume");
const checkOnly = process.argv.includes("--check");
if (
  process.argv.slice(2).some((arg) => !["--resume", "--check"].includes(arg))
) {
  throw new Error("Usage: deploy.mjs [--check] [--resume]");
}

const rpc = process.env.SOLANA_RPC_URL;
const circuitBase = process.env.DEPTH_CIRCUIT_BASE_URL?.replace(/\/+$/, "");
if (!rpc || new URL(rpc).protocol !== "https:") {
  throw new Error("SOLANA_RPC_URL must be an HTTPS devnet endpoint");
}
if (!circuitBase || new URL(circuitBase).protocol !== "https:") {
  throw new Error("DEPTH_CIRCUIT_BASE_URL must be an HTTPS URL");
}

const connection = new Connection(rpc, "confirmed");
if ((await connection.getGenesisHash()) !== genesisHash) {
  throw new Error("The configured RPC does not point to Solana devnet");
}
const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(signerPath, "utf8")))
);
const programKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(programKeypairPath, "utf8")))
);
if (!programKeypair.publicKey.equals(programId)) {
  throw new Error("The program keypair does not match the Depth IDL");
}
if (!readFileSync(programPath).includes(Buffer.from(circuitBase))) {
  throw new Error(
    "The program binary does not contain the configured circuit URL"
  );
}

const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(signer),
  { commitment: "confirmed" }
);
const arcium = getArciumProgram(provider);
const [
  balance,
  bufferRent,
  programRent,
  programAccountRent,
  existing,
  cluster,
] = await Promise.all([
  connection.getBalance(signer.publicKey),
  connection.getMinimumBalanceForRentExemption(programSize + 37),
  connection.getMinimumBalanceForRentExemption(maxLength + 45),
  connection.getMinimumBalanceForRentExemption(36),
  connection.getAccountInfo(programId),
  connection.getAccountInfo(getClusterAccAddress(clusterOffset)),
]);
if (!cluster?.owner.equals(arcium.programId)) {
  throw new Error("Arcium devnet cluster 456 is unavailable");
}
const clusterState = await arcium.account.cluster.fetch(
  getClusterAccAddress(clusterOffset)
);
if (BigInt(clusterState.maxCapacity.toString()) === 0n) {
  throw new Error("Arcium devnet cluster 456 reports zero capacity");
}
// The loader returns the buffer balance to the payer before funding ProgramData.
const required =
  Math.max(bufferRent, programRent) + programAccountRent + 1_000_000_000;
console.log(`Network: devnet, Arcium cluster: ${clusterOffset}`);
console.log(`Program: ${programId.toBase58()} (${programSize} bytes)`);
console.log(`Signer: ${signer.publicKey.toBase58()}`);
console.log(`Wallet: ${(balance / 1_000_000_000).toFixed(3)} SOL`);
console.log(
  `Peak deployment estimate: ${(required / 1_000_000_000).toFixed(3)} SOL`
);
if (existing && !resume) {
  throw new Error(
    "The program already exists; use --resume only after inspecting it"
  );
}
if (balance < required && !existing) {
  throw new Error("The deployment wallet needs more devnet SOL");
}
if (checkOnly) process.exit(0);

const circuits = await readCircuits();
await verifyRemote(circuitBase, circuits);
console.log(`Verified ${circuits.length} hosted circuits`);

const pinnedAnchor = join(homedir(), ".avm", "bin", "anchor-1.0.2");
statSync(pinnedAnchor);
const directory = mkdtempSync(join(tmpdir(), "depth-anchor-deploy-"));
const shim = `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "program" && args[1] === "deploy") {
  args.push("--provider.cluster", process.env.DEPTH_DEPLOY_RPC);
  args.push("--max-len", "${maxLength}");
  args.push("--no-idl");
}
const result = spawnSync(${JSON.stringify(
  pinnedAnchor
)}, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
`;
writeFileSync(join(directory, "anchor"), shim, { mode: 0o700 });
const args = [
  "deploy",
  "--cluster-offset",
  String(clusterOffset),
  "--recovery-set-size",
  "4",
  "--keypair-path",
  signerPath,
  "--program-keypair",
  programKeypairPath,
  "--program-name",
  "depth",
  "--rpc-url",
  rpc,
];
if (resume) args.push("--resume");
const child = spawn("arcium", args, {
  env: {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    DEPTH_DEPLOY_RPC: rpc,
  },
  stdio: ["inherit", "pipe", "pipe"],
});

function forward(source) {
  let pending = "";
  source.on("data", (chunk) => {
    const lines = (pending + chunk.toString()).split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines) console.log(line.replaceAll(rpc, "[devnet RPC]"));
  });
  source.on("end", () => {
    if (pending) console.log(pending.replaceAll(rpc, "[devnet RPC]"));
  });
}
forward(child.stdout);
forward(child.stderr);
const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", (code) => resolve(code ?? 1));
}).finally(() => rmSync(directory, { recursive: true, force: true }));
if (exitCode !== 0) process.exit(exitCode);

const program = await connection.getAccountInfo(programId);
if (!program?.executable) throw new Error("Depth program is not executable");
const mxe = await arcium.account.mxeAccount.fetch(getMXEAccAddress(programId));
if (mxe.cluster !== clusterOffset || !mxe.mxeProgramId.equals(programId)) {
  throw new Error("The MXE is not bound to Depth on devnet cluster 456");
}
console.log("Depth program and MXE verified on devnet");
