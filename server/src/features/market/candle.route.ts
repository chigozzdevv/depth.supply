import type { FastifyInstance } from "fastify";
import type { CandleQuery } from "@/features/market/candle.model";
import type { CandleService } from "@/features/market/candle.service";
import {
  candleGetSchema,
  candleQuerySchema,
} from "@/features/market/candle.schema";
import { marketParam } from "@/shared/http/http.schema";
import { candleController } from "@/features/market/candle.controller";

export function candleRoute(
  app: FastifyInstance,
  service: CandleService,
): void {
  const controller = candleController(service);
  app.addHook("preClose", async () => controller.close());
  app.get<{ Params: { marketId: string }; Querystring: CandleQuery }>(
    "/v1/markets/:marketId/candles",
    { schema: candleGetSchema },
    controller.get,
  );
  app.get<{ Params: { marketId: string }; Querystring: CandleQuery }>(
    "/v1/markets/:marketId/stream",
    {
      schema: { params: marketParam, querystring: candleQuerySchema },
    },
    controller.stream,
  );
}
