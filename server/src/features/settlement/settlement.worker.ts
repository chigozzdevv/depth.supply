import * as anchor from "@anchor-lang/core";
import { Connection } from "@solana/web3.js";
import { Keeper } from "@/features/settlement/settlement.keeper";
import { keeperConfig } from "@/shared/config/env";

const config = keeperConfig();
const wallet = new anchor.Wallet(config.keypair);
const keeper = new Keeper(new Connection(config.rpcUrl, "confirmed"), wallet);
let delayMs = 1_000;
let lastError = "";

for (;;) {
  try {
    const progress = await keeper.advance();
    delayMs = 1_000;
    lastError = "";
    if (progress) {
      process.stdout.write(
        `${progress.stage} ${progress.order} ${progress.signature}\n`,
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
