import type { FastifyReply, FastifyRequest } from "fastify";
import { address, found } from "@/http/http.response";
import type { OperationService } from "@/operation/operation.service";

export function operationController(service: OperationService) {
  return {
    async get(
      request: FastifyRequest<{ Params: { address: string } }>,
      reply: FastifyReply,
    ) {
      const key = address(request.params.address);
      if (!key) return reply.code(400).send({ error: "invalid_address" });
      return found(reply, await service.get(key));
    },
  };
}
