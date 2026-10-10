import type { FastifyInstance } from "fastify";
import { makerController } from "@/features/maker/maker.controller";
import { challengeSchema, sessionSchema } from "@/features/maker/maker.schema";
import type { MakerService, MakerProxy } from "@/features/maker/maker.service";

export function makerRoute(
  app: FastifyInstance,
  service: MakerService | MakerProxy,
) {
  const controller = makerController(service);
  app.get<{ Querystring: { wallet: string } }>(
    "/v1/maker/challenge",
    { schema: challengeSchema },
    controller.challenge,
  );
  app.post<{ Body: { nonce: string; signature: string } }>(
    "/v1/maker/session",
    { schema: sessionSchema },
    controller.session,
  );
  app.get("/v1/maker/hedges", controller.hedges);
}
