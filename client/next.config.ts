import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config: NextConfig = {
  output: "standalone",
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingRoot: root,
  poweredByHeader: false,
  turbopack: { root },
};

export default config;
