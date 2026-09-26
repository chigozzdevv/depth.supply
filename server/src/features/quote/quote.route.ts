import type { FastifyInstance } from "fastify";
import { quoteController } from "@/features/quote/quote.controller";
import { quoteGetSchema } from "@/features/quote/quote.schema";
import type { QuoteService } from "@/features/quote/quote.service";

export function quoteRoute(app: FastifyInstance, service: QuoteService): void {
  const controller = quoteController(service);
  app.get<{ Params: { address: string } }>(
    "/v1/quotes/:address",
    { schema: quoteGetSchema },
    controller.get,
  );
}
