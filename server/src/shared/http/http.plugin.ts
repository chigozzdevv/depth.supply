import type { FastifyInstance } from "fastify";

export function registerHttp(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    if (request.headers.origin) {
      reply.header("access-control-allow-origin", "*");
      reply.header("access-control-allow-methods", "GET, HEAD, POST, OPTIONS");
      reply.header(
        "access-control-allow-headers",
        "Content-Type, Authorization",
      );
    }
    reply.header("cache-control", "no-store");
  });

  app.setErrorHandler((error, request, reply) => {
    if (
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 400
    ) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    request.log.error(error);
    return reply.code(503).send({ error: "rpc_unavailable" });
  });

  app.options("/*", async (_request, reply) => reply.code(204).send());
  app.get("/health", async () => ({ ok: true }));
}
