import { Keypair, PublicKey } from "@solana/web3.js";
import { SOL_USD_PUSH_ACCOUNT } from "@depthhq/bindings";
import { settingPath } from "@/shared/config/path";
import { loadSigner } from "@/workspace/signers";
import {
  validateBotPolicy,
  validateHedgePolicy,
  type BotPolicy,
  type HedgePolicy,
} from "@depthhq/maker-sdk/node";

export type ServerConfig = { rpcUrl: string; host: string; port: number };
export type OracleMode = "sponsored" | "hermes";
export type KeeperConfig = {
  rpcUrl: string;
  keypair: Keypair;
  priceAccount: PublicKey;
  oracleMode: OracleMode;
  oracleIntervalMs: number;
  keeperIntervalMs?: number;
};
export type PublisherConfig = KeeperConfig & {
  apiKey: string;
  hermesUrl: string;
  shardId: number;
  publishAfterSeconds: number;
  intervalMs: number;
  healthPort: number;
};

export type MakerConfig = {
  rpcUrl: string;
  environment: "devnet" | "mainnet-beta";
  serviceUrl: string;
  keypair: Keypair;
  owner: PublicKey;
  policy: BotPolicy;
  stateDirectory: string;
  intervalMs: number;
  healthPort: number;
  hedge?: {
    account: `0x${string}`;
    agentKey: `0x${string}`;
    network: "testnet" | "mainnet";
    policy: HedgePolicy;
  };
};

export function makerConfig(env: NodeJS.ProcessEnv = process.env): MakerConfig {
  const environment = env.DEPTH_ENVIRONMENT ?? "devnet";
  if (environment !== "devnet" && environment !== "mainnet-beta")
    throw new Error("Maker bot needs a public Solana environment");
  if (!env.DEPTH_MAKER_OWNER) throw new Error("DEPTH_MAKER_OWNER is required");
  const amount = (name: string, fallback: string, unit = "micro-USDC") => {
    const value = env[name] ?? fallback;
    if (!/^\d+$/.test(value))
      throw new Error(`${name} must be an integer in ${unit}`);
    return BigInt(value);
  };
  const policy: BotPolicy = {
    maxCapacity: amount("DEPTH_MAKER_CAPACITY", "100000000"),
    maxInventoryNotional: amount("DEPTH_MAKER_INVENTORY_LIMIT", "1000000000"),
    spreadBps: Number(env.DEPTH_MAKER_SPREAD_BPS ?? "20"),
    repriceBps: Number(env.DEPTH_MAKER_REPRICE_BPS ?? "10"),
    lifetimeSeconds: Number(env.DEPTH_MAKER_LIFETIME_SECONDS ?? "120"),
    refreshSeconds: Number(env.DEPTH_MAKER_REFRESH_SECONDS ?? "60"),
    gasReserveLamports: amount(
      "DEPTH_MAKER_GAS_RESERVE_LAMPORTS",
      "50000000",
      "lamports",
    ),
    inventorySkewBps: Number(env.DEPTH_MAKER_SKEW_BPS ?? "15"),
    executionCostBps: Number(env.DEPTH_MAKER_COST_BPS ?? "5"),
    fundingHours: Number(env.DEPTH_MAKER_FUNDING_HOURS ?? "1"),
  };
  validateBotPolicy(policy);
  const intervalMs = Number(env.DEPTH_MAKER_INTERVAL_MS ?? "2000");
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 1000 ||
    intervalMs > 60000
  )
    throw new Error("DEPTH_MAKER_INTERVAL_MS must be 1000 to 60000");
  const healthPort = Number(env.DEPTH_MAKER_HEALTH_PORT ?? "8789");
  if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65535)
    throw new Error("DEPTH_MAKER_HEALTH_PORT must be a valid TCP port");
  return {
    environment,
    rpcUrl: rpcUrl(env.SOLANA_RPC_URL, "SOLANA_RPC_URL"),
    serviceUrl: rpcUrl(
      env.DEPTH_SERVICE_URL ?? "http://127.0.0.1:8787",
      "DEPTH_SERVICE_URL",
    ),
    keypair: loadSigner("maker", { env }),
    owner: new PublicKey(env.DEPTH_MAKER_OWNER),
    policy,
    stateDirectory: settingPath("DEPTH_MAKER_STATE_PATH", "data/maker", env),
    intervalMs,
    healthPort,
    hedge: hedgeConfig(env),
  };
}

export function makerWorkerUrl(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.DEPTH_MAKER_HEALTH_PORT ?? "8789");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid maker worker port");
  return `http://127.0.0.1:${port}`;
}

export function hedgeConfig(
  env: NodeJS.ProcessEnv = process.env,
): MakerConfig["hedge"] {
  const mode = env.DEPTH_MAKER_HEDGE ?? "none";
  if (mode === "none") return;
  if (mode !== "hyperliquid")
    throw new Error("DEPTH_MAKER_HEDGE must be none or hyperliquid");
  const network = env.HYPERLIQUID_NETWORK ?? "testnet";
  if (network !== "testnet" && network !== "mainnet")
    throw new Error("Invalid Hyperliquid network");
  if ((env.DEPTH_ENVIRONMENT === "mainnet-beta") !== (network === "mainnet"))
    throw new Error("Solana and Hyperliquid networks must match");
  const account = env.HYPERLIQUID_ACCOUNT_ADDRESS;
  const agentKey = env.HYPERLIQUID_AGENT_PRIVATE_KEY;
  if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account))
    throw new Error("HYPERLIQUID_ACCOUNT_ADDRESS is required");
  if (!agentKey || !/^0x[0-9a-fA-F]{64}$/.test(agentKey))
    throw new Error("HYPERLIQUID_AGENT_PRIVATE_KEY is required");
  const amount = (name: string, fallback: string) => {
    const value = env[name] ?? fallback;
    if (!/^\d+$/.test(value))
      throw new Error(`${name} must be integer micro-USDC`);
    return BigInt(value);
  };
  const policy: HedgePolicy = {
    ratioBps: Number(env.DEPTH_HEDGE_RATIO_BPS ?? "10000"),
    thresholdNotional: amount("DEPTH_HEDGE_THRESHOLD", "10000000"),
    maxUnhedgedNotional: amount("DEPTH_HEDGE_EXPOSURE_LIMIT", "100000000"),
    maxOrderNotional: amount("DEPTH_HEDGE_ORDER_LIMIT", "100000000"),
    batchMs: Number(env.DEPTH_HEDGE_BATCH_MS ?? "5000"),
    maxUnhedgedMs: Number(env.DEPTH_HEDGE_WAIT_MS ?? "15000"),
    maxSlippageBps: Number(env.DEPTH_HEDGE_SLIPPAGE_BPS ?? "10"),
    maxPriceAgeMs: Number(env.DEPTH_HEDGE_PRICE_AGE_MS ?? "5000"),
    orderTtlMs: Number(env.DEPTH_HEDGE_ORDER_TTL_MS ?? "10000"),
    maxLeverage: Number(env.DEPTH_HEDGE_LEVERAGE_LIMIT ?? "3"),
  };
  validateHedgePolicy(policy);
  return {
    account: account as `0x${string}`,
    agentKey: agentKey as `0x${string}`,
    network,
    policy,
  };
}

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
  const keeperIntervalMs = Number(env.DEPTH_KEEPER_INTERVAL_MS ?? "2000");
  if (
    !Number.isSafeInteger(keeperIntervalMs) ||
    keeperIntervalMs < 1000 ||
    keeperIntervalMs > 30000
  )
    throw new Error("DEPTH_KEEPER_INTERVAL_MS must be 1000 to 30000");
  return {
    priceAccount: env.DEPTH_PRICE_ACCOUNT
      ? new PublicKey(env.DEPTH_PRICE_ACCOUNT)
      : SOL_USD_PUSH_ACCOUNT,
    oracleMode: mode,
    oracleIntervalMs: interval,
    keeperIntervalMs,
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
