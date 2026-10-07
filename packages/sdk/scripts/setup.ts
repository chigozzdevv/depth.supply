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
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createDepth, type DepthClient } from "@/client/client";
import type { SignedManifest } from "@/chain/manifest";
import { settingPath } from "@/workspace";

const rpc = process.env.SOLANA_RPC_URL;
if (!rpc || new URL(rpc).protocol !== "https:") {
  throw new Error("SOLANA_RPC_URL must be an HTTPS devnet endpoint");
}
const signerPath = settingPath(
  "DEPTH_DEPLOYER_KEYPAIR_PATH",
  "keys/devnet/deployer.json",
);
const manifestPath = settingPath(
  "DEPTH_DEVNET_MANIFEST_PATH",
  "deployments/devnet/manifest.json",
);
const traderPath = settingPath(
  "DEPTH_DEMO_TRADER_PATH",
  "keys/devnet/trader.json",
);
const appPath = settingPath("DEPTH_DEMO_APP_PATH", "keys/devnet/app.json");

async function signer(path: string): Promise<Keypair> {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(await readFile(path, "utf8"))),
  );
}

async function demoSigner(path: string): Promise<Keypair> {
  try {
    return await signer(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const keypair = Keypair.generate();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(Array.from(keypair.secretKey)), {
    flag: "wx",
    mode: 0o600,
  });
  return keypair;
}

async function fundSigner(
  connection: Connection,
  owner: Keypair,
  recipient: PublicKey,
  role: string,
): Promise<void> {
  const balance = await connection.getBalance(recipient, "confirmed");
  if (balance >= 200_000_000) return;
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: recipient,
      lamports: 500_000_000 - balance,
    }),
  );
  const signature = await sendAndConfirmTransaction(connection, transaction, [
    owner,
  ]);
  console.log(`fund_${role}_sol ${signature}`);
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
const trader = await demoSigner(traderPath);
const appOwner = await demoSigner(appPath);
if (trader.publicKey.equals(appOwner.publicKey)) {
  throw new Error("Demo app and trader must use distinct signers");
}
await fundSigner(connection, owner, trader.publicKey, "trader");
await fundSigner(connection, owner, appOwner.publicKey, "app");

const app = await createDepth({
  environment: "devnet",
  connection,
  deployment,
  wallet: new anchor.Wallet(appOwner),
});
const registration = await app.app.register({ feeBps: 1 });
await registration.confirm({ timeoutMs: 180_000 });
console.log(`app ready ${appOwner.publicKey.toBase58()}`);

const traderClient = await createDepth({
  environment: "devnet",
  connection,
  deployment,
  appId: appOwner.publicKey,
  wallet: new anchor.Wallet(trader),
});
const traderBalance = balanceAddress(trader.publicKey);
if (!(await ready(traderClient, "BalanceAccount", traderBalance, true))) {
  const opened = await traderClient.account.open();
  console.log(`open_trader_balance ${opened.signature}`);
  await ready(traderClient, "BalanceAccount", traderBalance);
}

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
if (!(await ready(traderClient, "MarketAccount", traderMarket, true))) {
  const opened = await traderClient.position.open();
  console.log(`open_trader_market ${opened.signature}`);
  await ready(traderClient, "MarketAccount", traderMarket);
}
console.log(
  JSON.stringify({
    maker: owner.publicKey.toBase58(),
    appId: appOwner.publicKey.toBase58(),
    trader: trader.publicKey.toBase58(),
    traderBalance: traderBalance.toBase58(),
    makerBalance: makerBalance.toBase58(),
    makerMarket: makerMarket.toBase58(),
    traderMarket: traderMarket.toBase58(),
  }),
);
