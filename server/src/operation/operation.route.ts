import type { FastifyInstance } from "fastify";
import { operationController } from "@/operation/operation.controller";
import { operationGetSchema } from "@/operation/operation.schema";
import type { OperationService } from "@/operation/operation.service";

export function operationRoute(
  app: FastifyInstance,
  service: OperationService,
): void {
  const controller = operationController(service);
  app.get<{ Params: { address: string } }>(
    "/v1/operations/:address",
    { schema: operationGetSchema },
    controller.get,
  );
}
