import type { FastifyInstance } from "fastify";
import type { ViewRequest } from "@depthhq/schema";
import { ViewController } from "@/features/view/view.controller";
import { viewRequestSchema } from "@/features/view/view.schema";
import type { ViewService } from "@/features/view/view.service";

export function viewRoute(app: FastifyInstance, service?: ViewService): void {
  const controller = new ViewController(service);
  app.get("/v1/views", async () => ({ enabled: !!service }));
  app.post<{ Body: ViewRequest }>(
    "/v1/views",
    { schema: { body: viewRequestSchema } },
    (request, reply) => controller.handle(request, reply),
  );
  app.post<{ Body: ViewRequest }>(
    "/v1/views/close",
    { schema: { body: viewRequestSchema } },
    (request, reply) => controller.handle(request, reply, true),
  );
  if (service) {
    service.start();
    app.addHook("onClose", async () => service.stop());
  }
}
