import type { FastifyReply, FastifyRequest } from "fastify";
import { AutomationService } from "@/features/automation/automation.service";
import {
  AutomationError,
  automationError,
} from "@/features/automation/automation.model";
import { MakerProxy } from "@/features/maker/maker.service";
import type { FundingInput } from "@/features/automation/funding.service";

export function automationController(service: AutomationService | MakerProxy) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.routeOptions
      .url!.split("/automation")[1]
      .replace(/^\//, "");
    reply.header("cache-control", "no-store");
    if (service instanceof MakerProxy) {
      const query =
        path === "challenge"
          ? `?wallet=${encodeURIComponent((request.query as { wallet: string }).wallet)}`
          : "";
      const result = await service.request(
        `automation${path ? `/${path}` : ""}${query}`,
        request.headers.authorization,
        request.method === "POST" ? request.body : undefined,
      );
      return reply.code(result.status).send(result.body);
    }
    try {
      if (path === "challenge")
        return (
          service.access.challenge(
            (request.query as { wallet: string }).wallet,
          ) ?? reply.code(403).send({ error: "maker_access_denied" })
        );
      if (path === "session") {
        const { nonce, signature } = request.body as {
          nonce: string;
          signature: string;
        };
        return (
          service.access.session(nonce, signature) ??
          reply.code(401).send({ error: "maker_access_denied" })
        );
      }
      const owner = service.access.wallet(request.headers.authorization);
      if (!owner) return reply.code(401).send({ error: "maker_access_denied" });
      if (!path) return service.summary(owner);
      if (path === "fund") {
        if (!service.funding)
          throw new AutomationError(
            "Operator funding service is unavailable",
            503,
          );
        return await service.funding.request(
          owner,
          request.body as FundingInput,
        );
      }
      const body = request.body as { revision: number; config?: unknown };
      return path === "configure"
        ? await service.configure(owner, body.revision, body.config)
        : await service.command(
            owner,
            body.revision,
            path as "start" | "pause",
          );
    } catch (error) {
      return reply
        .code(error instanceof AutomationError ? error.status : 503)
        .send({
          error: "automation_unavailable",
          message: automationError(error),
        });
    }
  };
}
