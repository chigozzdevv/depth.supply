import * as anchor from "@anchor-lang/core";
import Fastify from "fastify";
import { create_depth_maker } from "@depthhq/maker-sdk";
import {
  create_maker_bot,
  create_hyperliquid,
  HedgeEngine,
  type BotSnapshot,
} from "@depthhq/maker-sdk/node";
import { makerConfig } from "@/shared/config/env";
import { makerRoute } from "@/features/maker/maker.route";
import { MakerService } from "@/features/maker/maker.service";
import { makerView } from "@/features/maker/maker.model";

const config = makerConfig();
const maker = await create_depth_maker({
  environment: config.environment,
  serviceUrl: config.serviceUrl,
  rpcUrl: config.rpcUrl,
  wallet: new anchor.Wallet(config.keypair),
  makerOwner: config.owner,
});
const bot = await create_maker_bot({
  maker,
  policy: config.policy,
  stateDirectory: config.stateDirectory,
  hedge: config.hedge
    ? new HedgeEngine(
        await create_hyperliquid(config.hedge),
        config.hedge.policy,
      )
    : undefined,
});
const health = Fastify({ bodyLimit: 1024 });
health.addHook("onRequest", async (_request, reply) => {
  reply.header("cache-control", "no-store");
});
makerRoute(
  health,
  new MakerService(config.owner, () =>
    makerView(config.owner.toBase58(), Boolean(bot.hedge), bot.hedge?.snapshot),
  ),
);
let snapshot: BotSnapshot | undefined;
let updatedAt = 0;
let failing = false;
let running = true;
let wake: (() => void) | undefined;
health.get("/healthz", (_request, reply) => {
  const healthy =
    !failing && running && updatedAt > 0 && Date.now() - updatedAt < 240000;
  reply.code(healthy ? 200 : 503);
  return { healthy, updatedAt, ...snapshot };
});
const stop = () => {
  running = false;
  bot.stop();
  wake?.();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  await health.listen({ host: "127.0.0.1", port: config.healthPort });
  let last = "";
  let lastError = "";
  let delayMs = config.intervalMs;
  let shutdownDeadline: number | undefined;
  do {
    if (!running) shutdownDeadline ??= Date.now() + 300000;
    try {
      snapshot = await bot.tick();
      updatedAt = Date.now();
      failing = false;
      delayMs = config.intervalMs;
      lastError = "";
      const value = JSON.stringify(snapshot);
      if (last !== value) {
        console.info(value);
        last = value;
      }
      if (!running && snapshot.phase === "stopped") break;
    } catch (error) {
      failing = true;
      const message = String(error).replace(
        /(?:https?|wss?):\/\/[^\s]+/g,
        "[RPC endpoint]",
      );
      if (message !== lastError) console.error(message);
      lastError = message;
      delayMs = Math.min(delayMs * 2, 30000);
    }
    if (shutdownDeadline && Date.now() >= shutdownDeadline)
      throw new Error(
        "Shutdown could not confirm quote cancellation; checkpoint retained for restart",
      );
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wake = undefined;
        resolve();
      }, delayMs);
      wake = () => {
        clearTimeout(timer);
        wake = undefined;
        resolve();
      };
    });
  } while (true);
} finally {
  await health.close();
  await bot.close();
}
