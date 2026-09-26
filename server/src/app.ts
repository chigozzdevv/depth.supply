import Fastify, { type FastifyInstance } from "fastify";
import { appRoute } from "@/app/app.route";
import { AppService } from "@/app/app.service";
import type { ChainClient } from "@/chain/chain.client";
import { marketRoute } from "@/market/market.route";
import { MarketService } from "@/market/market.service";
import { operationRoute } from "@/operation/operation.route";
import { OperationService } from "@/operation/operation.service";
import { quoteRoute } from "@/quote/quote.route";
import { QuoteService } from "@/quote/quote.service";
import { recoveryRoute } from "@/recovery/recovery.route";
import { RecoveryService } from "@/recovery/recovery.service";

export function buildApp(chain: ChainClient, logger = true): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: 1_024 });

  app.addHook("onRequest", async (request, reply) => {
    if (request.headers.origin) {
      reply.header("access-control-allow-origin", "*");
      reply.header("access-control-allow-methods", "GET, HEAD, OPTIONS");
    }
    reply.header("cache-control", "no-store");
  });

  app.setErrorHandler((error, request, reply) => {
    if (
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 400
    ) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    request.log.error(error);
    return reply.code(503).send({ error: "rpc_unavailable" });
  });

  app.options("/*", async (_request, reply) => reply.code(204).send());
  app.get("/health", async () => ({ ok: true }));
  marketRoute(app, new MarketService(chain));
  recoveryRoute(app, new RecoveryService(chain));
  quoteRoute(app, new QuoteService(chain));
  operationRoute(app, new OperationService(chain));
  appRoute(app, new AppService(chain));

  return app;
}
