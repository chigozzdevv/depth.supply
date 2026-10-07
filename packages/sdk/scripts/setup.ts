import * as anchor from "@anchor-lang/core";
import { balanceAddress, marketAccountAddress } from "@depth/bindings";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { readFile, writeFile } from "node:fs/promises";
import { createDepth, type DepthClient } from "@/client/client";
import type { SignedManifest } from "@/chain/manifest";

const rpc = process.env.SOLANA_RPC_URL;
if (!rpc || new URL(rpc).protocol !== "https:") {
  throw new Error("SOLANA_RPC_URL must be an HTTPS devnet endpoint");
}
const signerPath =
  process.env.DEPTH_DEPLOYER_KEYPAIR_PATH ||
  "contracts/target/test-wallet.json";
const manifestPath =
  process.env.DEPTH_DEVNET_MANIFEST_PATH ||
  ".env.recovery/devnet/manifest.json";
const traderPath =
  process.env.DEPTH_DEMO_TRADER_PATH ||
  ".env.recovery/devnet/trader.solana.json";

async function signer(path: string): Promise<Keypair> {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(await readFile(path, "utf8"))),
  );
}

async function demoTrader(): Promise<Keypair> {
  try {
    return await signer(traderPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const keypair = Keypair.generate();
  await writeFile(traderPath, JSON.stringify(Array.from(keypair.secretKey)), {
    flag: "wx",
    mode: 0o600,
  });
  return keypair;
}

async function ready(
  client: DepthClient,
  name: "BalanceAccount" | "MarketAccount",
  address: PublicKey,
  allowMissing = false,
): Promise<boolean> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const account = await client.funding.read<{
      status: Record<string, unknown>;
    }>(name, address);
    if (!account && allowMissing) return false;
    if (account) {
      if ("ready" in account.status) return true;
      if (!("opening" in account.status)) {
        throw new Error(`${name} status: ${Object.keys(account.status)[0]}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`${name} did not become ready: ${address.toBase58()}`);
}

const connection = new Connection(rpc, "confirmed");
if (
  (await connection.getGenesisHash()) !==
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
) {
  throw new Error("The configured RPC does not point to Solana devnet");
}
const manifest = JSON.parse(
  await readFile(manifestPath, "utf8"),
) as SignedManifest;
const deployment = {
  manifest,
  trustedSigner: new PublicKey(manifest.signer),
};
const owner = await signer(signerPath);
const trader = await demoTrader();
const traderSol = await connection.getBalance(trader.publicKey, "confirmed");
if (traderSol < 200_000_000) {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: trader.publicKey,
      lamports: 500_000_000 - traderSol,
    }),
  );
  const signature = await sendAndConfirmTransaction(connection, transaction, [
    owner,
  ]);
  console.log(`fund_trader_sol ${signature}`);
}

const app = await createDepth({
  environment: "devnet",
  connection,
  deployment,
  wallet: new anchor.Wallet(trader),
});
const registration = await app.app.register({ feeBps: 1 });
await registration.confirm({ timeoutMs: 180_000 });
console.log(`app ready ${trader.publicKey.toBase58()}`);

const maker = await createDepth({
  environment: "devnet",
  connection,
  deployment,
  wallet: new anchor.Wallet(owner),
});
const makerBalance = balanceAddress(owner.publicKey);
if (!(await ready(maker, "BalanceAccount", makerBalance, true))) {
  const opened = await maker.account.open();
  console.log(`open_maker_balance ${opened.signature}`);
  await ready(maker, "BalanceAccount", makerBalance);
}
const makerMarket = marketAccountAddress(owner.publicKey);
if (!(await ready(maker, "MarketAccount", makerMarket, true))) {
  const opened = await maker.position.open();
  console.log(`open_maker_market ${opened.signature}`);
  await ready(maker, "MarketAccount", makerMarket);
}
const traderMarket = marketAccountAddress(trader.publicKey);
if (!(await ready(app, "MarketAccount", traderMarket, true))) {
  const opened = await app.position.open();
  console.log(`open_trader_market ${opened.signature}`);
  await ready(app, "MarketAccount", traderMarket);
}
console.log(
  JSON.stringify({
    maker: owner.publicKey.toBase58(),
    appId: trader.publicKey.toBase58(),
    trader: trader.publicKey.toBase58(),
    makerBalance: makerBalance.toBase58(),
    makerMarket: makerMarket.toBase58(),
    traderMarket: traderMarket.toBase58(),
  }),
);
