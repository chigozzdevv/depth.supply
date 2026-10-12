import type { FastifyInstance } from "fastify";
import type { RpcTransport } from "@/shared/chain/transport";

export function rpcRoute(app: FastifyInstance, transport: RpcTransport) {
  app.post("/rpc", { bodyLimit: 100_000 }, async (request, reply) => {
    try {
      return await transport.request(request.body);
    } catch (error) {
      const invalid =
        error instanceof Error && error.message === "Invalid RPC request";
      return reply
        .code(invalid ? 400 : 503)
        .send({ error: invalid ? "invalid_rpc_request" : "rpc_unavailable" });
    }
  });
}
