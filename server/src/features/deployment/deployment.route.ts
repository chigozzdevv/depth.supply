import type { FastifyInstance } from "fastify";
import type {
  DeploymentService,
  PublicEnvironment,
} from "@/features/deployment/deployment.service";

export function deploymentRoute(
  app: FastifyInstance,
  service: DeploymentService
): void {
  for (const environment of ["devnet", "mainnet-beta"] as PublicEnvironment[]) {
    app.get(
      `/.well-known/depth/${environment}.json`,
      async (_request, reply) => {
        reply.header("Cache-Control", "no-store");
        const manifest = await service.manifest(environment);
        if (!manifest)
          return reply.code(503).send({ error: "Deployment unavailable" });
        return reply.send(manifest);
      }
    );
  }
}
