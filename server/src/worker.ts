import * as anchor from "@anchor-lang/core";
import { Connection, Keypair } from "@solana/web3.js";
import { Keeper } from "@/keeper";

const rpcUrl = process.env.DEPTH_RPC_URL;
const secret = process.env.DEPTH_KEEPER_KEYPAIR;
if (!rpcUrl || !secret) {
  throw new Error("DEPTH_RPC_URL and DEPTH_KEEPER_KEYPAIR are required");
}

const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(secret) as number[])
);
const wallet = new anchor.Wallet(keypair);
const keeper = new Keeper(new Connection(rpcUrl, "confirmed"), wallet);
let delayMs = 1_000;
let lastError = "";

for (;;) {
  try {
    const progress = await keeper.advance();
    delayMs = 1_000;
    lastError = "";
    if (progress) {
      process.stdout.write(
        `${progress.stage} ${progress.order} ${progress.signature}\n`
      );
    }
  } catch (error) {
    const message = String(error);
    if (message !== lastError) {
      process.stderr.write(`${message}\n`);
      lastError = message;
    }
    delayMs = Math.min(delayMs * 2, 30_000);
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
