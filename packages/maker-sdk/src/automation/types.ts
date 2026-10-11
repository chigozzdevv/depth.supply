import { PublicKey } from "@solana/web3.js";
import { validateBotPolicy, type BotPolicy } from "@/bot/policy";
import { validateHedgePolicy } from "@/hedge/policy";
import type { HedgePolicy } from "@/hedge/types";
import { hedgeView } from "@/hedge/schema";
import type { MakerHedgeView } from "@/hedge/access";

export type AutomationConfig = {
  quote: BotPolicy;
  hedge?: { account: `0x${string}`; policy: HedgePolicy };
};
export type Wire<T> = T extends bigint
  ? string
  : T extends object
    ? { [K in keyof T]: Wire<T[K]> }
    : T;
export type AutomationView = {
  owner: string;
  environment: "devnet" | "mainnet-beta";
  revision: number;
  operator: string;
  agent: `0x${string}`;
  config: Wire<AutomationConfig>;
  desired: "running" | "paused";
  phase:
    "configured" | "starting" | "running" | "pausing" | "paused" | "blocked";
  updatedAt: number;
  reason?: string;
  bot?: {
    phase: "active" | "pending" | "idle" | "stopped";
    reason?: string;
    quoteId?: string;
    fillCount: number;
  };
  hedge: MakerHedgeView;
  funding?: {
    signature: string;
    lamports: string;
    status: "pending" | "confirmed" | "expired" | "failed";
  };
};
const amount = (value: unknown, name: string) => {
  if (
    typeof value !== "string" ||
    !/^\d{1,20}$/.test(value) ||
    BigInt(value) > (1n << 64n) - 1n
  )
    throw new Error(`${name} must be an unsigned integer amount`);
  return BigInt(value);
};
const object = (value: unknown, names: string[]) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !names.includes(key))
  )
    throw new Error("Automation configuration is invalid");
  return value as Record<string, unknown>;
};
const integer = (value: unknown, fallback?: number) => {
  const result = value ?? fallback;
  if (typeof result !== "number" || !Number.isSafeInteger(result))
    throw new Error("Automation limits must be integers");
  return result;
};
export function automationConfig(value: unknown): AutomationConfig {
  const input = object(value, ["quote", "hedge"]);
  const quote = object(input.quote, [
    "maxCapacity",
    "maxInventoryNotional",
    "spreadBps",
    "repriceBps",
    "lifetimeSeconds",
    "refreshSeconds",
    "gasReserveLamports",
    "inventorySkewBps",
    "executionCostBps",
    "fundingHours",
  ]);
  const policy: BotPolicy = {
    maxCapacity: amount(quote.maxCapacity, "Capacity"),
    maxInventoryNotional: amount(quote.maxInventoryNotional, "Inventory limit"),
    spreadBps: integer(quote.spreadBps),
    repriceBps: integer(quote.repriceBps),
    lifetimeSeconds: integer(quote.lifetimeSeconds),
    refreshSeconds: integer(quote.refreshSeconds),
    gasReserveLamports: amount(
      quote.gasReserveLamports ?? "50000000",
      "SOL reserve",
    ),
    inventorySkewBps: integer(quote.inventorySkewBps, 15),
    executionCostBps: integer(quote.executionCostBps, 5),
    fundingHours: integer(quote.fundingHours, 1),
  };
  validateBotPolicy(policy);
  if (policy.lifetimeSeconds > 86400 || policy.refreshSeconds > 86400)
    throw new Error("Quote lifetime must be at most one day");
  if (input.hedge === undefined) return { quote: policy };
  const hedge = object(input.hedge, ["account", "policy"]);
  if (
    typeof hedge.account !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(hedge.account)
  )
    throw new Error("Hyperliquid account address is invalid");
  const risk = object(hedge.policy, [
    "ratioBps",
    "thresholdNotional",
    "maxUnhedgedNotional",
    "maxOrderNotional",
    "batchMs",
    "maxUnhedgedMs",
    "maxSlippageBps",
    "maxPriceAgeMs",
    "orderTtlMs",
    "maxLeverage",
  ]);
  const hedgePolicy: HedgePolicy = {
    ratioBps: integer(risk.ratioBps),
    thresholdNotional: amount(risk.thresholdNotional, "Hedge threshold"),
    maxUnhedgedNotional: amount(risk.maxUnhedgedNotional, "Exposure limit"),
    maxOrderNotional: amount(risk.maxOrderNotional, "Order limit"),
    batchMs: integer(risk.batchMs),
    maxUnhedgedMs: integer(risk.maxUnhedgedMs),
    maxSlippageBps: integer(risk.maxSlippageBps),
    maxPriceAgeMs: integer(risk.maxPriceAgeMs),
    orderTtlMs: integer(risk.orderTtlMs),
    maxLeverage: integer(risk.maxLeverage),
  };
  validateHedgePolicy(hedgePolicy);
  return {
    quote: policy,
    hedge: {
      account: hedge.account.toLowerCase() as `0x${string}`,
      policy: hedgePolicy,
    },
  };
}
export const automationWire = (
  config: AutomationConfig,
): Wire<AutomationConfig> =>
  JSON.parse(
    JSON.stringify(config, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );

export function automationView(
  value: unknown,
  owner: string,
  environment: string,
): AutomationView | null {
  if (value === null) return null;
  const view = object(value, [
    "owner",
    "environment",
    "revision",
    "operator",
    "agent",
    "config",
    "desired",
    "phase",
    "updatedAt",
    "reason",
    "bot",
    "hedge",
    "funding",
  ]);
  if (view.owner !== owner || view.environment !== environment)
    throw new Error("Automation belongs to another wallet or network");
  if (
    typeof view.operator !== "string" ||
    new PublicKey(view.operator).toBase58() !== view.operator ||
    typeof view.agent !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(view.agent) ||
    integer(view.revision) < 1 ||
    integer(view.updatedAt) < 1 ||
    !["running", "paused"].includes(String(view.desired)) ||
    ![
      "configured",
      "starting",
      "running",
      "pausing",
      "paused",
      "blocked",
    ].includes(String(view.phase)) ||
    (view.reason !== undefined && typeof view.reason !== "string")
  )
    throw new Error("Automation response is invalid");
  automationConfig(view.config);
  if (view.bot !== undefined) {
    const bot = object(view.bot, ["phase", "reason", "quoteId", "fillCount"]);
    if (
      !["active", "pending", "idle", "stopped"].includes(String(bot.phase)) ||
      integer(bot.fillCount) < 0 ||
      (bot.reason !== undefined && typeof bot.reason !== "string") ||
      (bot.quoteId !== undefined &&
        (typeof bot.quoteId !== "string" ||
          new PublicKey(bot.quoteId).toBase58() !== bot.quoteId))
    )
      throw new Error("Automation status is invalid");
  }
  hedgeView(view.hedge, owner);
  if (view.funding !== undefined) {
    const funding = object(view.funding, ["signature", "lamports", "status"]);
    if (
      typeof funding.signature !== "string" ||
      !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(funding.signature) ||
      !["pending", "confirmed", "expired", "failed"].includes(
        String(funding.status),
      )
    )
      throw new Error("Operator funding receipt is invalid");
    amount(funding.lamports, "Operator funding");
  }
  return view as AutomationView;
}
