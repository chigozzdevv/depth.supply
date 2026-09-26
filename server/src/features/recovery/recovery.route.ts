import type { FastifyInstance } from "fastify";
import { recoveryController } from "@/features/recovery/recovery.controller";
import {
  recoveryGetSchema,
  winddownGetSchema,
} from "@/features/recovery/recovery.schema";
import type { RecoveryService } from "@/features/recovery/recovery.service";

export function recoveryRoute(
  app: FastifyInstance,
  service: RecoveryService,
): void {
  const controller = recoveryController(service);
  app.get<{ Params: { marketId: string } }>(
    "/v1/markets/:marketId/recovery",
    { schema: recoveryGetSchema },
    controller.config,
  );
  app.get<{ Params: { marketId: string } }>(
    "/v1/markets/:marketId/winddown",
    { schema: winddownGetSchema },
    controller.winddown,
  );
}
