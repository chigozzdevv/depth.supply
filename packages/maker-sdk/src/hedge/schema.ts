import type { MakerHedgeView } from "@/hedge/access";

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const amount = (value: unknown): value is string =>
  typeof value === "string" && /^-?\d{1,40}$/.test(value);
const optional = (value: unknown, check: (value: unknown) => boolean) =>
  value === undefined || check(value);
const text = (value: unknown) =>
  typeof value === "string" && value.length <= 1024;

function order(value: unknown, receipt = false): boolean {
  if (
    !object(value) ||
    typeof value.cloid !== "string" ||
    !/^0x[0-9a-f]{32}$/.test(value.cloid) ||
    !integer(value.nonce) ||
    !integer(value.expiresAt) ||
    value.expiresAt <= value.nonce ||
    typeof value.buy !== "boolean" ||
    typeof value.reduceOnly !== "boolean" ||
    !amount(value.size) ||
    BigInt(value.size) <= 0n ||
    !amount(value.limitPriceE8) ||
    BigInt(value.limitPriceE8) <= 0n
  )
    return false;
  if (!receipt) return true;
  return (
    ["filled", "cancelled", "rejected"].includes(String(value.status)) &&
    integer(value.completedAt) &&
    value.completedAt >= value.nonce &&
    amount(value.filledSize) &&
    BigInt(value.filledSize) >= 0n &&
    BigInt(value.filledSize) <= BigInt(value.size) &&
    optional(value.orderId, integer) &&
    optional(value.averagePriceE8, amount) &&
    optional(value.fee, amount) &&
    optional(value.reason, text) &&
    optional(
      value.hashes,
      (hashes) =>
        Array.isArray(hashes) &&
        hashes.length <= 2000 &&
        hashes.every(
          (hash) =>
            typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash),
        ),
    )
  );
}

export function hedgeView(value: unknown, owner: string): MakerHedgeView {
  if (
    !object(value) ||
    value.maker !== owner ||
    typeof value.enabled !== "boolean"
  )
    throw new Error(
      "Maker hedge response belongs to another wallet or is invalid",
    );
  const snapshot = value.snapshot;
  if (
    snapshot !== null &&
    (!value.enabled ||
      !object(snapshot) ||
      snapshot.venue !== "hyperliquid" ||
      !["testnet", "mainnet"].includes(String(snapshot.network)) ||
      typeof snapshot.account !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(snapshot.account) ||
      !integer(snapshot.updatedAt) ||
      !["balanced", "waiting", "pending", "blocked"].includes(
        String(snapshot.phase),
      ) ||
      !optional(snapshot.reason, text) ||
      !optional(snapshot.depthPosition, amount) ||
      !optional(snapshot.externalPosition, amount) ||
      !optional(snapshot.unhedgedPosition, amount) ||
      !optional(snapshot.pending, order) ||
      !Array.isArray(snapshot.history) ||
      snapshot.history.length > 50 ||
      !snapshot.history.every((record) => order(record, true)))
  )
    throw new Error("Maker hedge response is invalid");
  return value as MakerHedgeView;
}
