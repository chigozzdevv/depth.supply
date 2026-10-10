import Fastify, { type FastifyInstance } from "fastify";
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
import { deploymentPaths } from "@/shared/config/env";
import { registerHttp } from "@/shared/http/http.plugin";

export function buildApp(chain: ChainClient, logger = true): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: 1_024 });
  registerHttp(app);
  deploymentRoute(app, new DeploymentService(deploymentPaths()));
  marketRoute(app, new MarketService(chain));
  candleRoute(app, new CandleService());
  recoveryRoute(app, new RecoveryService(chain));
  quoteRoute(app, new QuoteService(chain));
  operationRoute(app, new OperationService(chain));
  appRoute(app, new AppService(chain));

  return app;
}
