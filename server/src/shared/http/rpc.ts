import type { FastifyInstance } from "fastify";
import type { RpcTransport } from "@/shared/chain/transport";

export function rpcRoute(app: FastifyInstance, transport: RpcTransport) {
  app.post("/rpc", { bodyLimit: 100_000 }, async (request, reply) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => {
      if (!reply.raw.writableEnded) abort();
    };
    request.raw.once("aborted", abort);
    reply.raw.once("close", close);
    try {
      return await transport.request(request.body, controller.signal);
    } catch (error) {
      const invalid =
        error instanceof Error && error.message === "Invalid RPC request";
      return reply
        .code(invalid ? 400 : 503)
        .send({ error: invalid ? "invalid_rpc_request" : "rpc_unavailable" });
    } finally {
      request.raw.removeListener("aborted", abort);
      reply.raw.removeListener("close", close);
    }
  });
}
