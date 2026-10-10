import * as anchor from "@anchor-lang/core";
import { Connection } from "@solana/web3.js";
import { Keeper } from "@/features/settlement/settlement.keeper";
import { keeperConfig } from "@/shared/config/env";

import { OracleService } from "@/features/oracle/oracle.service";
import { RiskService } from "@/features/risk/risk.service";
import { FeeService } from "@/features/fee/fee.service";
import { FundingService } from "@/features/funding/funding.service";
import { QuoteWorker } from "@/features/quote/quote.worker";

const config = keeperConfig();
const wallet = new anchor.Wallet(config.keypair);
const keeper = new Keeper(new Connection(config.rpcUrl, "confirmed"), wallet);
const oracle = new OracleService(keeper, config.priceAccount);
const risk = new RiskService(keeper);
const fees = new FeeService(keeper);
const funding = new FundingService(keeper);
const quotes = new QuoteWorker(keeper);
const services = [
  { advance: () => funding.advance() },
  { advance: () => quotes.advance() },
  {
    advance: async () => {
      const signature = await risk.advance();
      return signature ? { stage: "liquidate", signature } : undefined;
    },
  },
  {
    advance: async () => {
      const signature = await fees.advance();
      return signature ? { stage: "claim_trade_fees", signature } : undefined;
    },
  },
];
let lastOracle = 0;
let serviceOffset = 0;
let running = true;
process.once("SIGINT", () => {
  running = false;
});
process.once("SIGTERM", () => {
  running = false;
});
let delayMs = config.keeperIntervalMs ?? 2000;
let lastError = "";

while (running) {
  try {
    const progress = await keeper.advance();
    if (!progress) {
      if (Date.now() - lastOracle >= config.oracleIntervalMs) {
        const signature = await oracle.advance();
        lastOracle = Date.now();
        if (signature) process.stdout.write(`refresh_oracle ${signature}\n`);
      }
      const service = services[serviceOffset];
      serviceOffset = (serviceOffset + 1) % services.length;
      const result = await service.advance();
      if (result) process.stdout.write(`${result.stage} ${result.signature}\n`);
    }
    delayMs = config.keeperIntervalMs ?? 2000;
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
