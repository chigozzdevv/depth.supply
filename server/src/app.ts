import Fastify, { type FastifyInstance } from "fastify";
import { appRoute } from "@/features/app/app.route";
import { AppService } from "@/features/app/app.service";
import { deploymentRoute } from "@/features/deployment/deployment.route";
import { DeploymentService } from "@/features/deployment/deployment.service";
import { marketRoute } from "@/features/market/market.route";
import { MarketService } from "@/features/market/market.service";
import { operationRoute } from "@/features/operation/operation.route";
import { OperationService } from "@/features/operation/operation.service";
import { quoteRoute } from "@/features/quote/quote.route";
import { QuoteService } from "@/features/quote/quote.service";
import { recoveryRoute } from "@/features/recovery/recovery.route";
import { RecoveryService } from "@/features/recovery/recovery.service";
import type { ChainClient } from "@/shared/chain/chain.client";
import { registerHttp } from "@/shared/http/http.plugin";

export function buildApp(chain: ChainClient, logger = true): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: 1_024 });
  registerHttp(app);
  deploymentRoute(
    app,
    new DeploymentService({
      devnet: process.env.DEPTH_DEVNET_MANIFEST_PATH,
      "mainnet-beta": process.env.DEPTH_MAINNET_MANIFEST_PATH,
    })
  );
  marketRoute(app, new MarketService(chain));
  recoveryRoute(app, new RecoveryService(chain));
  quoteRoute(app, new QuoteService(chain));
  operationRoute(app, new OperationService(chain));
  appRoute(app, new AppService(chain));

  return app;
}
