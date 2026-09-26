import type { FastifyInstance } from "fastify";
import { marketController } from "@/market/market.controller";
import { marketGetSchema, marketListSchema } from "@/market/market.schema";
import type { MarketService } from "@/market/market.service";

export function marketRoute(
  app: FastifyInstance,
  service: MarketService,
): void {
  const controller = marketController(service);
  app.get("/v1/markets", { schema: marketListSchema }, controller.list);
  app.get<{ Params: { marketId: string } }>(
    "/v1/markets/:marketId",
    { schema: marketGetSchema },
    controller.get,
  );
}
