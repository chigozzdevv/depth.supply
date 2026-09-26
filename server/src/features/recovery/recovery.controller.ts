import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify";
import { SOL_USD_MARKET_ID } from "@depth/bindings";
import { found } from "@/shared/http/http.response";
import type { RecoveryService } from "@/features/recovery/recovery.service";

export function recoveryController(service: RecoveryService) {
  return {
    async config(
      request: FastifyRequest<{ Params: { marketId: string } }>,
      reply: FastifyReply,
    ) {
      if (request.params.marketId !== SOL_USD_MARKET_ID) {
        return reply.code(404).send({ error: "not_found" });
      }
      return found(reply, await service.config());
    },
    async winddown(
      request: FastifyRequest<{ Params: { marketId: string } }>,
      reply: FastifyReply,
    ) {
      if (request.params.marketId !== SOL_USD_MARKET_ID) {
        return reply.code(404).send({ error: "not_found" });
      }
      return found(reply, await service.winddown());
    },
  };
}
