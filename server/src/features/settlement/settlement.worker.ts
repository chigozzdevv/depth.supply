import * as anchor from "@anchor-lang/core";
import Fastify from "fastify";
import { chainConnection } from "@/shared/chain/connection";
import { Keeper } from "@/features/settlement/settlement.keeper";
import { keeperConfig } from "@/shared/config/env";

import { OracleService } from "@/features/oracle/oracle.service";
import { RiskService } from "@/features/risk/risk.service";
import { FeeService } from "@/features/fee/fee.service";
import { FundingService } from "@/features/funding/funding.service";
import { QuoteWorker } from "@/features/quote/quote.worker";
import { MaintenanceService } from "@/features/maintenance/maintenance.service";

const config = keeperConfig();
const wallet = new anchor.Wallet(config.keypair);
const keeper = new Keeper(chainConnection(`${config.serviceUrl}/rpc`), wallet);
const oracle = new OracleService(keeper, config.priceAccount);
const risk = new RiskService(keeper);
const fees = new FeeService(keeper);
const funding = new FundingService(keeper);
const quotes = new QuoteWorker(keeper);
const maintenance = new MaintenanceService(keeper, config.demoMaintenance);
const services = [
  { advance: () => maintenance.advance() },
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
let updatedAt = 0;
const app = Fastify();
app.get("/healthz", (_request, reply) => {
  const healthy =
    running && !lastError && updatedAt > 0 && Date.now() - updatedAt < 240_000;
  reply.code(healthy ? 200 : 503).header("cache-control", "no-store");
  return { healthy, updatedAt, error: lastError || undefined };
});
await app.listen({ host: "127.0.0.1", port: config.healthPort });

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
    updatedAt = Date.now();
    if (progress) {
      process.stdout.write(
        `${progress.stage} ${progress.order} ${progress.signature}\n`,
      );
    }
  } catch (error) {
    const message = String(error)
      .replace(/(?:https?|wss?):\/\/[^\s]+/g, "[RPC endpoint]")
      .slice(0, 400);
    if (message !== lastError) {
      process.stderr.write(`${message}\n`);
      lastError = message;
    }
    delayMs = Math.min(delayMs * 2, 30_000);
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
await app.close();
