import type { FastifyInstance } from "fastify";
import { challengeSchema, sessionSchema } from "@/features/maker/maker.schema";
import {
  configureSchema,
  commandSchema,
  fundingSchema,
} from "@/features/automation/automation.schema";
import { automationController } from "@/features/automation/automation.controller";
import type { AutomationService } from "@/features/automation/automation.service";
import type { MakerProxy } from "@/features/maker/maker.service";

export function automationRoute(
  app: FastifyInstance,
  service: AutomationService | MakerProxy,
) {
  const controller = automationController(service);
  const path = "/v1/maker/automation";
  app.get(`${path}/challenge`, { schema: challengeSchema }, controller);
  app.post(`${path}/session`, { schema: sessionSchema }, controller);
  app.get(path, controller);
  app.post(
    `${path}/fund`,
    { schema: fundingSchema, bodyLimit: 4096 },
    controller,
  );
  app.post(
    `${path}/configure`,
    { schema: configureSchema, bodyLimit: 4096 },
    controller,
  );
  for (const action of ["start", "pause"])
    app.post(`${path}/${action}`, { schema: commandSchema }, controller);
}
