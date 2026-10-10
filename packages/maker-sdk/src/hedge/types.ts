export type HedgePolicy = {
  ratioBps: number;
  thresholdNotional: bigint;
  maxUnhedgedNotional: bigint;
  maxOrderNotional: bigint;
  batchMs: number;
  maxUnhedgedMs: number;
  maxSlippageBps: number;
  maxPriceAgeMs: number;
  orderTtlMs: number;
  maxLeverage: number;
};

export type HedgeLevel = { priceE8: bigint; size: bigint };
export type HedgeBook = {
  timestamp: number;
  bids: HedgeLevel[];
  asks: HedgeLevel[];
};
export type HedgeAccount = {
  timestamp: number;
  position: bigint;
  availableMargin: bigint;
  leverage: number;
  openOrders: string[];
};
export type HedgeOrder = {
  cloid: string;
  nonce: number;
  expiresAt: number;
  buy: boolean;
  size: bigint;
  limitPriceE8: bigint;
  reduceOnly: boolean;
};
export type HedgeReceipt = {
  status: "filled" | "cancelled" | "rejected" | "open" | "unknown";
  orderId?: number;
  filledSize: bigint;
  averagePriceE8?: bigint;
  fee?: bigint;
  hashes?: string[];
  reason?: string;
};
export type HedgeRecord = HedgeOrder & HedgeReceipt & { completedAt: number };
export type HedgeState = {
  identity: string;
  depthAccount?: string;
  nonce: number;
  unhedgedSince?: number;
  pending?: HedgeOrder;
  history: HedgeRecord[];
};
export type HedgeSnapshot = {
  venue: "hyperliquid";
  network: "testnet" | "mainnet";
  account: string;
  updatedAt: number;
  phase: "balanced" | "waiting" | "pending" | "blocked";
  reason?: string;
  depthPosition?: bigint;
  externalPosition?: bigint;
  unhedgedPosition?: bigint;
  pending?: HedgeOrder;
  history: HedgeRecord[];
};
export interface HedgeAdapter {
  readonly identity: string;
  readonly network: "testnet" | "mainnet";
  readonly address: string;
  readonly sizeStep: bigint;
  readonly minNotional: bigint;
  book(): Promise<HedgeBook>;
  costs(): Promise<{ takerFeeBps: number; hourlyFundingBps: number }>;
  account(): Promise<HedgeAccount>;
  price(value: bigint, buy: boolean): bigint;
  submit(order: HedgeOrder): Promise<HedgeReceipt>;
  receipt(order: HedgeOrder): Promise<HedgeReceipt>;
  cancel(order: HedgeOrder, nonce: number): Promise<void>;
}

export const abs = (value: bigint) => (value < 0n ? -value : value);
export const notional = (size: bigint, priceE8: bigint) =>
  (abs(size) * priceE8 + 99_999_999_999n) / 100_000_000_000n;
