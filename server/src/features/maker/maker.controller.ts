import type { FastifyReply, FastifyRequest } from "fastify";
import { MakerService, MakerProxy } from "@/features/maker/maker.service";

export function makerController(service: MakerService | MakerProxy) {
  return {
    async challenge(
      request: FastifyRequest<{ Querystring: { wallet: string } }>,
      reply: FastifyReply,
    ) {
      if (service instanceof MakerProxy) {
        const result = await service.request(
          `challenge?wallet=${request.query.wallet}`,
        );
        return reply.code(result.status).send(result.body);
      }
      const value = service.access.challenge(request.query.wallet);
      return value ?? reply.code(403).send({ error: "maker_access_denied" });
    },
    async session(
      request: FastifyRequest<{ Body: { nonce: string; signature: string } }>,
      reply: FastifyReply,
    ) {
      if (service instanceof MakerProxy) {
        const result = await service.request(
          "session",
          undefined,
          request.body,
        );
        return reply.code(result.status).send(result.body);
      }
      const value = service.access.session(
        request.body.nonce,
        request.body.signature,
      );
      return value ?? reply.code(401).send({ error: "maker_access_denied" });
    },
    async hedges(request: FastifyRequest, reply: FastifyReply) {
      if (service instanceof MakerProxy) {
        const result = await service.request(
          "hedges",
          request.headers.authorization,
        );
        return reply.code(result.status).send(result.body);
      }
      if (!service.access.authorized(request.headers.authorization))
        return reply.code(401).send({ error: "maker_access_denied" });
      return service.read();
    },
  };
}
