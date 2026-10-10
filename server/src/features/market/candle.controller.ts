import type { FastifyReply, FastifyRequest } from "fastify";
import { SOL_USD_MARKET_ID } from "@depthhq/bindings";
import type { CandleQuery } from "@/features/market/candle.model";
import type { CandleService } from "@/features/market/candle.service";

type Request = FastifyRequest<{
  Params: { marketId: string };
  Querystring: CandleQuery;
}>;

export function candleController(service: CandleService) {
  const clients = new Set<() => void>();
  return {
    close() {
      for (const close of clients) close();
    },
    async get(request: Request, reply: FastifyReply) {
      if (request.params.marketId !== SOL_USD_MARKET_ID)
        return reply.code(404).send({ error: "not_found" });
      return service.get(request.query);
    },
    async stream(request: Request, reply: FastifyReply) {
      if (request.params.marketId !== SOL_USD_MARKET_ID)
        return reply.code(404).send({ error: "not_found" });
      const query = { interval: request.query.interval, limit: 2 };
      const first = await service.get(query);
      if (reply.raw.destroyed) return reply;
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
        "x-accel-buffering": "no",
      });
      const send = (page: typeof first) => {
        if (!reply.raw.destroyed)
          reply.raw.write(`event: candles\ndata: ${JSON.stringify(page)}\n\n`);
      };
      send(first);
      let running = false;
      const timer = setInterval(async () => {
        if (running || reply.raw.destroyed) return;
        running = true;
        try {
          send(await service.get(query));
        } catch {
          if (!reply.raw.destroyed)
            reply.raw.write("event: unavailable\ndata: {}\n\n");
        } finally {
          running = false;
        }
      }, 5000);
      timer.unref();
      const close = () => {
        clearInterval(timer);
        reply.raw.end();
      };
      clients.add(close);
      reply.raw.on("close", () => {
        clearInterval(timer);
        clients.delete(close);
      });
    },
  };
}
