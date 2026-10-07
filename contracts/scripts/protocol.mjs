import * as anchor from "@anchor-lang/core";
import { getAccount, getMint } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { submitTransaction } from "./tx.mjs";
import { resolvePath, settingPath } from "../../scripts/paths.mjs";

const genesisHash = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const settlementMint = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);
const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const rpc = process.env.SOLANA_RPC_URL;
const signerPath = settingPath(
  "DEPTH_DEPLOYER_KEYPAIR_PATH",
  "keys/devnet/deployer.json"
);
if (!rpc || new URL(rpc).protocol !== "https:") {
  throw new Error("SOLANA_RPC_URL must be an HTTPS devnet endpoint");
}

const connection = new Connection(rpc, "confirmed");
if ((await connection.getGenesisHash()) !== genesisHash) {
  throw new Error("The configured RPC does not point to Solana devnet");
}
const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(signerPath, "utf8")))
);
const idl = JSON.parse(
  readFileSync(resolvePath("contracts/target/idl/depth.json"), "utf8")
);
const programId = new PublicKey(idl.address);
const programAccount = await connection.getAccountInfo(programId);
if (!programAccount?.executable || !programAccount.owner.equals(loader)) {
  throw new Error("The upgradeable Depth program is not deployed");
}
const mint = await getMint(connection, settlementMint);
if (mint.decimals !== 6) {
  throw new Error("The devnet USDC mint does not have six decimals");
}

const [programData] = PublicKey.findProgramAddressSync(
  [programId.toBuffer()],
  loader
);
const [protocol] = PublicKey.findProgramAddressSync(
  [Buffer.from("protocol")],
  programId
);
const [vault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  programId
);
const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(signer),
  { commitment: "confirmed" }
);
const program = new anchor.Program(idl, provider);
if (!(await connection.getAccountInfo(protocol))) {
  if (await connection.getAccountInfo(vault)) {
    throw new Error("The vault exists without the protocol account");
  }
  const transaction = await program.methods
    .initializeProtocol()
    .accountsPartial({
      authority: signer.publicKey,
      program: programId,
      programData,
      settlementMint,
      protocol,
      vault,
    })
    .transaction();
  const signature = await submitTransaction(connection, signer, transaction);
  console.log(`Initialized Depth protocol: ${signature}`);
}

const state = await program.account.protocol.fetch(protocol);
const vaultState = await getAccount(connection, vault);
if (
  !state.authority.equals(signer.publicKey) ||
  !state.settlementMint.equals(settlementMint) ||
  !state.vault.equals(vault) ||
  !vaultState.mint.equals(settlementMint) ||
  !vaultState.owner.equals(protocol) ||
  !vaultState.isInitialized
) {
  throw new Error(
    "The protocol or vault configuration differs from devnet USDC"
  );
}
console.log(
  `Verified protocol ${protocol.toBase58()} and vault ${vault.toBase58()}`
);
