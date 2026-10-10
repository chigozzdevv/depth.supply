import { Keypair, PublicKey } from "@solana/web3.js";
import { SOL_USD_PUSH_ACCOUNT } from "@depthhq/bindings";
import { settingPath } from "@/shared/config/path";
import { loadSigner } from "@/workspace/signers";

export type ServerConfig = { rpcUrl: string; host: string; port: number };
export type OracleMode = "sponsored" | "hermes";
export type KeeperConfig = {
  rpcUrl: string;
  keypair: Keypair;
  priceAccount: PublicKey;
  oracleMode: OracleMode;
  oracleIntervalMs: number;
};
export type PublisherConfig = KeeperConfig & {
  apiKey: string;
  hermesUrl: string;
  shardId: number;
  publishAfterSeconds: number;
  intervalMs: number;
  healthPort: number;
};

export function deploymentPaths(env: NodeJS.ProcessEnv = process.env) {
  return {
    devnet: settingPath("DEPTH_DEVNET_MANIFEST_PATH", undefined, env),
    "mainnet-beta": settingPath("DEPTH_MAINNET_MANIFEST_PATH", undefined, env),
  };
}

function rpcUrl(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  return value;
}

export function oracleMode(env: NodeJS.ProcessEnv = process.env): OracleMode {
  const value = env.PYTH_ORACLE_MODE ?? "sponsored";
  if (value !== "sponsored" && value !== "hermes") {
    throw new Error("PYTH_ORACLE_MODE must be sponsored or hermes");
  }
  return value;
}

export function serverConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const url = rpcUrl(env.SOLANA_RPC_URL, "SOLANA_RPC_URL");
  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port");
  }
  return { rpcUrl: url, host: env.HOST ?? "127.0.0.1", port };
}

export function keeperConfig(
  env: NodeJS.ProcessEnv = process.env,
): KeeperConfig {
  const url = rpcUrl(env.SOLANA_RPC_URL, "SOLANA_RPC_URL");
  const mode = oracleMode(env);
  const interval = Number(env.DEPTH_ORACLE_INTERVAL_MS ?? "10000");
  if (!Number.isSafeInteger(interval) || interval < 1000 || interval > 60000) {
    throw new Error("DEPTH_ORACLE_INTERVAL_MS must be between 1000 and 60000");
  }
  return {
    priceAccount: env.DEPTH_PRICE_ACCOUNT
      ? new PublicKey(env.DEPTH_PRICE_ACCOUNT)
      : SOL_USD_PUSH_ACCOUNT,
    oracleMode: mode,
    oracleIntervalMs: interval,
    rpcUrl: url,
    keypair: loadSigner("keeper", { env }),
  };
}

export function publisherConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublisherConfig {
  if (oracleMode(env) !== "hermes") {
    throw new Error("PYTH_ORACLE_MODE=hermes is required to run the publisher");
  }
  if (!env.PYTH_API_KEY) throw new Error("PYTH_API_KEY is required");
  const keeper = keeperConfig(env);
  const hermesUrl = env.PYTH_HERMES_URL ?? "https://pyth.dourolabs.app/hermes";
  if (new URL(hermesUrl).protocol !== "https:") {
    throw new Error("PYTH_HERMES_URL must use HTTPS");
  }
  const shardId = Number(env.DEPTH_PYTH_SHARD_ID ?? "0");
  if (!Number.isInteger(shardId) || shardId < 0 || shardId > 65_535) {
    throw new Error("DEPTH_PYTH_SHARD_ID must be a 16-bit integer");
  }
  const publishAfterSeconds = Number(env.DEPTH_PUBLISH_AFTER_SECONDS ?? "75");
  if (
    !Number.isInteger(publishAfterSeconds) ||
    publishAfterSeconds < 15 ||
    publishAfterSeconds > 240
  ) {
    throw new Error("DEPTH_PUBLISH_AFTER_SECONDS must be 15 to 240");
  }
  const intervalMs = Number(env.DEPTH_PUBLISH_INTERVAL_MS ?? "10000");
  if (
    !Number.isInteger(intervalMs) ||
    intervalMs < 1_000 ||
    intervalMs > 60_000
  ) {
    throw new Error("DEPTH_PUBLISH_INTERVAL_MS must be 1000 to 60000");
  }
  const healthPort = Number(env.DEPTH_PUBLISH_HEALTH_PORT ?? "8788");
  if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65_535) {
    throw new Error("DEPTH_PUBLISH_HEALTH_PORT must be a valid TCP port");
  }
  return {
    ...keeper,
    apiKey: env.PYTH_API_KEY,
    hermesUrl,
    shardId,
    publishAfterSeconds,
    intervalMs,
    healthPort,
  };
}
