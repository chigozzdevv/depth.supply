import * as anchor from "@anchor-lang/core";
import {
  getArciumProgram,
  getClusterAccAddress,
  getMXEAccAddress,
} from "@arcium-hq/client";
import { Connection, PublicKey } from "@solana/web3.js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readCircuits, verifyRemote } from "./circuits.mjs";
import { resolvePath } from "../../scripts/paths.mjs";
import {
  createSigner,
  loadSigner,
  signerPath as rolePath,
} from "../../scripts/signers.mjs";
import { resolveArcium } from "../../scripts/toolchain.mjs";

const genesisHash = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const clusterOffset = 456;
const programPath = resolvePath("contracts/target/deploy/depth.so");
const programSize = statSync(programPath).size;
const maxLength = programSize;
let extension = 0;
const programKeypairPath = rolePath("program");
const bufferKeypairPath = rolePath("buffer");
const signerPath = rolePath("deployer");
const idl = JSON.parse(
  readFileSync(resolvePath("contracts/target/idl/depth.json"), "utf8"),
);
const programId = new PublicKey(idl.address);
const resume = process.argv.includes("--resume");
const checkOnly = process.argv.includes("--check");
const upgrade = process.argv.includes("--upgrade");
if (
  (resume && upgrade) ||
  process.argv
    .slice(2)
    .some((arg) => !["--resume", "--check", "--upgrade"].includes(arg))
) {
  throw new Error("Usage: deploy.mjs [--check] [--resume | --upgrade]");
}
const arciumCli = upgrade ? undefined : resolveArcium("deploy");

const rpc = process.env.SOLANA_RPC_URL;
const circuitBase = process.env.DEPTH_CIRCUIT_BASE_URL?.replace(/\/+$/, "");
if (!rpc) throw new Error("SOLANA_RPC_URL is required");
const rpcUrl = new URL(rpc);
if (
  rpcUrl.protocol !== "https:" &&
  !(
    rpcUrl.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(rpcUrl.hostname)
  )
) {
  throw new Error("SOLANA_RPC_URL must use HTTPS or a loopback proxy");
}
if (!circuitBase || new URL(circuitBase).protocol !== "https:") {
  throw new Error("DEPTH_CIRCUIT_BASE_URL must be an HTTPS URL");
}

const connection = new Connection(rpc, "confirmed");
if ((await connection.getGenesisHash()) !== genesisHash) {
  throw new Error("The configured RPC does not point to Solana devnet");
}
const signer = loadSigner("deployer");
loadSigner("program", { expectedPublicKey: programId });
const bufferKeypairExists = existsSync(bufferKeypairPath);
const bufferKeypair = bufferKeypairExists ? loadSigner("buffer") : undefined;
if (!readFileSync(programPath).includes(Buffer.from(circuitBase))) {
  throw new Error(
    "The program binary does not contain the configured circuit URL",
  );
}

const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(signer),
  { commitment: "confirmed" },
);
const arcium = getArciumProgram(provider);
const [
  balance,
  bufferRent,
  programRent,
  programAccountRent,
  existing,
  cluster,
  bufferAccount,
] = await Promise.all([
  connection.getBalance(signer.publicKey),
  connection.getMinimumBalanceForRentExemption(programSize + 37),
  connection.getMinimumBalanceForRentExemption(maxLength + 45),
  connection.getMinimumBalanceForRentExemption(36),
  connection.getAccountInfo(programId),
  connection.getAccountInfo(getClusterAccAddress(clusterOffset)),
  bufferKeypairExists
    ? connection.getAccountInfo(bufferKeypair.publicKey, {
        dataSlice: { offset: 0, length: 0 },
      })
    : null,
]);
if (!cluster?.owner.equals(arcium.programId)) {
  throw new Error("Arcium devnet cluster 456 is unavailable");
}
// The loader returns the buffer balance to the payer before funding ProgramData.
let required =
  Math.max(
    0,
    Math.max(bufferRent, programRent) - (bufferAccount?.lamports ?? 0),
  ) +
  programAccountRent +
  1_000_000_000;
console.log(`Network: devnet, Arcium cluster: ${clusterOffset}`);
console.log(`Program: ${programId.toBase58()} (${programSize} bytes)`);
console.log(`Signer: ${signer.publicKey.toBase58()}`);
console.log(`Wallet: ${(balance / 1_000_000_000).toFixed(3)} SOL`);
console.log(
  `Peak deployment estimate: ${(required / 1_000_000_000).toFixed(3)} SOL`,
);
if (upgrade) {
  const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  if (
    !existing?.executable ||
    !existing.owner.equals(loader) ||
    existing.data.length !== 36 ||
    existing.data.readUInt32LE(0) !== 2
  )
    throw new Error("Upgrade requires an existing upgradeable Depth program");
  const programData = await connection.getAccountInfo(
    new PublicKey(existing.data.subarray(4)),
    { commitment: "confirmed", dataSlice: { offset: 0, length: 45 } },
  );
  if (
    !programData?.owner.equals(loader) ||
    programData.data.readUInt32LE(0) !== 3 ||
    programData.data[12] !== 1 ||
    !new PublicKey(programData.data.subarray(13, 45)).equals(signer.publicKey)
  )
    throw new Error("Deployment signer is not the program upgrade authority");
  if (
    programData.data.length !== 45 ||
    !Number.isSafeInteger(programData.space) ||
    programData.space < 45
  )
    throw new Error("ProgramData allocation size is unavailable");
  const allocated = programData.space - 45;
  if (allocated < programSize) {
    extension = Math.max(10_240, programSize - allocated);
    required += Math.max(
      0,
      (await connection.getMinimumBalanceForRentExemption(
        allocated + extension + 45,
      )) - programData.lamports,
    );
    console.log(
      `ProgramData growth: ${extension} bytes; revised peak: ${(
        required / 1_000_000_000
      ).toFixed(3)} SOL`,
    );
  }
  const depth = new anchor.Program(idl, provider);
  const [protocols, markets, accounts, clearing] = await Promise.all([
    depth.account.protocol.all(),
    depth.account.market.all(),
    depth.account.marketAccount.all(),
    depth.account.clearingAccount.all(),
  ]);
  if (
    protocols.some(({ account }) => account.tradingEnabled) ||
    markets.some(({ account }) => account.pendingOrders !== 0) ||
    [...accounts, ...clearing].some(
      ({ account }) =>
        !("ready" in account.status) ||
        !account.pendingComputation.equals(PublicKey.default),
    )
  )
    throw new Error(
      "Pause trading and finish pending computations before upgrading",
    );
}
if (existing && !resume && !upgrade) {
  throw new Error(
    "The program already exists; use --resume only after inspecting it",
  );
}
if (balance < required && (!existing || upgrade)) {
  throw new Error("The deployment wallet needs more devnet SOL");
}
if (checkOnly) process.exit(0);

const circuits = await readCircuits();
await verifyRemote(circuitBase, circuits);
console.log(`Verified ${circuits.length} hosted circuits`);

createSigner("buffer");

async function run(command, args) {
  const child = spawn(command, args, {
    stdio: ["inherit", "pipe", "pipe"],
    cwd: resolvePath("contracts"),
    env: { ...process.env, ARCIUM_NO_UPDATE_CHECK: "1" },
  });
  function forward(source) {
    let pending = "";
    source.on("data", (chunk) => {
      const lines = (pending + chunk.toString()).split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines)
        console.log(line.replaceAll(rpc, "[devnet RPC]"));
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
  });
  if (exitCode !== 0) process.exit(exitCode);
}

if (!existing || upgrade) {
  if (extension)
    await run("solana", [
      "program",
      "extend",
      programId.toBase58(),
      String(extension),
      "--keypair",
      signerPath,
      "--url",
      rpc,
    ]);
  console.log("Uploading program through the configured RPC...");
  await run("solana", [
    "program",
    "deploy",
    programPath,
    "--program-id",
    programKeypairPath,
    "--buffer",
    bufferKeypairPath,
    "--max-len",
    String(maxLength),
    "--use-rpc",
    "--max-sign-attempts",
    "10",
    "--keypair",
    signerPath,
    "--url",
    rpc,
  ]);
}

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
  "--skip-deploy",
];
if (resume) args.push("--resume");
if (!upgrade) await run(arciumCli, args);

const program = await connection.getAccountInfo(programId);
if (!program?.executable) throw new Error("Depth program is not executable");
const mxe = await arcium.account.mxeAccount.fetch(getMXEAccAddress(programId));
if (mxe.cluster !== clusterOffset || !mxe.mxeProgramId.equals(programId)) {
  throw new Error("The MXE is not bound to Depth on devnet cluster 456");
}
console.log("Depth program and MXE verified on devnet");
