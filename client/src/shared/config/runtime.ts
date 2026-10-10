import "server-only";
import type { DepthEnvironment } from "@depthhq/sdk";

export type DemoConfig = { environment: DepthEnvironment; appId: string };

export function demoConfig(): DemoConfig {
  const environment = process.env.DEPTH_ENVIRONMENT ?? "devnet";
  if (!["localnet", "devnet", "mainnet-beta"].includes(environment))
    throw new Error("Invalid DEPTH_ENVIRONMENT");
  if (environment === "mainnet-beta")
    throw new Error("The demo supports devnet and localnet only");
  const app =
    process.env.DEPTH_APP_ID ||
    (environment === "devnet"
      ? "Fh4tbnEk7oH2kxXp1AED2ZYEPetL5jKFM9Lq9mE58KTG"
      : undefined);
  if (typeof app !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(app))
    throw new Error("A registered DEPTH_APP_ID is required");
  return { environment: environment as DepthEnvironment, appId: app };
}

export function serviceUrl(): string {
  return process.env.DEPTH_SERVICE_URL ?? "http://127.0.0.1:8787";
}
