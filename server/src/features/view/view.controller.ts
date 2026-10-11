import type { FastifyReply, FastifyRequest } from "fastify";
import type { ViewRequest } from "@depthhq/schema";
import { ViewError } from "@/features/view/view.model";
import type { ViewService } from "@/features/view/view.service";

export class ViewController {
  constructor(private readonly service?: ViewService) {}
  async handle(
    request: FastifyRequest<{ Body: ViewRequest }>,
    reply: FastifyReply,
    close = false,
  ) {
    if (!this.service)
      return reply.code(503).send({ error: "view_sponsor_unavailable" });
    try {
      if (close) {
        await this.service.close(request.body);
        return reply.code(204).send();
      }
      return await this.service.read(request.body);
    } catch (error) {
      if (error instanceof ViewError)
        return reply.code(error.status).send({ error: error.code });
      request.log.error({ err: error }, "Private read submission failed");
      return reply.code(503).send({ error: "view_submission_pending" });
    }
  }
}
