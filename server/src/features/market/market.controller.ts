import type { FastifyReply, FastifyRequest } from "fastify";
import { SOL_USD_MARKET_ID } from "@depthhq/bindings";
import { found } from "@/shared/http/http.response";
import type { MarketService } from "@/features/market/market.service";

export function marketController(service: MarketService) {
  return {
    async list() {
      const market = await service.get();
      return { markets: market ? [market] : [] };
    },
    async get(
      request: FastifyRequest<{ Params: { marketId: string } }>,
      reply: FastifyReply,
    ) {
      if (request.params.marketId !== SOL_USD_MARKET_ID) {
        return reply.code(404).send({ error: "not_found" });
      }
      return found(reply, await service.get());
    },
  };
}
