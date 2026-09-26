import type { FastifyInstance } from "fastify";
import { appController } from "@/app/app.controller";
import { appGetSchema } from "@/app/app.schema";
import type { AppService } from "@/app/app.service";

export function appRoute(app: FastifyInstance, service: AppService): void {
  const controller = appController(service);
  app.get<{ Params: { address: string } }>(
    "/v1/apps/:address",
    { schema: appGetSchema },
    controller.get,
  );
}
