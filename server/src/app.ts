import Fastify, { LogController, type FastifyInstance } from "fastify";
import { appRoute } from "@/features/app/app.route";
import { AppService } from "@/features/app/app.service";
import { deploymentRoute } from "@/features/deployment/deployment.route";
import { DeploymentService } from "@/features/deployment/deployment.service";
import { marketRoute } from "@/features/market/market.route";
import { MarketService } from "@/features/market/market.service";
import { CandleService } from "@/features/market/candle.service";
import { candleRoute } from "@/features/market/candle.route";
import { operationRoute } from "@/features/operation/operation.route";
import { OperationService } from "@/features/operation/operation.service";
import { quoteRoute } from "@/features/quote/quote.route";
import { QuoteService } from "@/features/quote/quote.service";
import { recoveryRoute } from "@/features/recovery/recovery.route";
import { RecoveryService } from "@/features/recovery/recovery.service";
import type { ChainClient } from "@/shared/chain/chain.client";
import { deploymentPaths, makerWorkerUrl } from "@/shared/config/env";
import { makerRoute } from "@/features/maker/maker.route";
import { MakerProxy } from "@/features/maker/maker.service";
import { automationRoute } from "@/features/automation/automation.route";
import { registerHttp } from "@/shared/http/http.plugin";

import { viewRoute } from "@/features/view/view.route";
import type { ViewService } from "@/features/view/view.service";
import type { RpcTransport } from "@/shared/chain/transport";
import { rpcRoute } from "@/shared/http/rpc";

export function buildApp(
  chain: ChainClient,
  logger = true,
  views?: ViewService,
  transport?: RpcTransport,
): FastifyInstance {
  const app = Fastify({
    logger,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1_024,
  });
  registerHttp(app);
  if (transport) rpcRoute(app, transport);
  app.get("/ready", async (_request, reply) => {
    const market = await new MarketService(chain).health();
    const ports = [
      process.env.DEPTH_KEEPER_HEALTH_PORT ?? "8786",
      process.env.DEPTH_MAKER_HEALTH_PORT ?? "8789",
    ];
    if (process.env.PYTH_ORACLE_MODE === "hermes")
      ports.push(process.env.DEPTH_PUBLISH_HEALTH_PORT ?? "8788");
    const workers = await Promise.all(
      ports.map(async (port) => {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
            signal: AbortSignal.timeout(5000),
          });
          const value = (await response.json()) as { healthy?: boolean };
          return Boolean(response.ok && value.healthy);
        } catch {
          return false;
        }
      }),
    );
    const now = Math.floor(Date.now() / 1000);
    const liveQuotes = market?.liveQuotes ?? 0;
    const oracleFresh = Boolean(
      market &&
      now >= market.oracleTimestamp &&
      now - market.oracleTimestamp <= market.maxOracleAgeSeconds,
    );
    const fundingFresh = Boolean(
      market &&
      now <= market.lastFundingTimestamp + market.fundingIntervalSeconds,
    );
    const ready = Boolean(
      market &&
      market.status === "active" &&
      market.incident === "none" &&
      oracleFresh &&
      fundingFresh &&
      liveQuotes &&
      workers.every(Boolean),
    );
    reply.code(ready ? 200 : 503);
    return {
      ready,
      oracleFresh,
      fundingFresh,
      liveQuotes,
      keeper: workers[0],
      maker: workers[1],
      ...(ports.length > 2 ? { publisher: workers[2] } : {}),
    };
  });
  viewRoute(app, views);
  deploymentRoute(app, new DeploymentService(deploymentPaths()));
  marketRoute(app, new MarketService(chain));
  candleRoute(app, new CandleService());
  recoveryRoute(app, new RecoveryService(chain));
  quoteRoute(app, new QuoteService(chain));
  operationRoute(app, new OperationService(chain));
  appRoute(app, new AppService(chain));
  makerRoute(app, new MakerProxy(makerWorkerUrl()));
  automationRoute(app, new MakerProxy(makerWorkerUrl()));

  return app;
}
