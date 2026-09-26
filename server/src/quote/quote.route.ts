import type { FastifyInstance } from "fastify";
import { quoteController } from "@/quote/quote.controller";
import { quoteGetSchema } from "@/quote/quote.schema";
import type { QuoteService } from "@/quote/quote.service";

export function quoteRoute(app: FastifyInstance, service: QuoteService): void {
  const controller = quoteController(service);
  app.get<{ Params: { address: string } }>(
    "/v1/quotes/:address",
    { schema: quoteGetSchema },
    controller.get,
  );
}
