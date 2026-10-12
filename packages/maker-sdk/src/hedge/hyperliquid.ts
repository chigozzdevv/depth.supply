import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import {
  canonicalize,
  getWalletAddress,
  signL1Action,
  type AbstractWallet,
} from "@nktkas/hyperliquid/signing";
import {
  OrderRequest,
  CancelByCloidRequest,
} from "@nktkas/hyperliquid/api/exchange";
import { privateKeyToAccount } from "viem/accounts";
import type {
  HedgeAccount,
  HedgeAdapter,
  HedgeBook,
  HedgeOrder,
  HedgeReceipt,
} from "@/hedge/types";

import { units, decimal } from "@/hedge/amount";
export { units, decimal } from "@/hedge/amount";

export class HyperliquidAdapter implements HedgeAdapter {
  readonly minNotional = 10_000_000n;
  readonly identity: string;
  readonly sizeStep: bigint;
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: Promise<unknown> }
  >();
  private cached<T>(
    key: string,
    ttl: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const prior = this.cache.get(key);
    if (prior && prior.expiresAt > Date.now()) return prior.value as Promise<T>;
    const value = load().catch((error) => {
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, { expiresAt: Date.now() + ttl, value });
    return value;
  }
  private constructor(
    readonly network: "testnet" | "mainnet",
    readonly address: `0x${string}`,
    private readonly wallet: AbstractWallet,
    private readonly transport: HttpTransport,
    private readonly info: InfoClient,
    private readonly asset: number,
    private readonly sizeDecimals: number,
  ) {
    this.identity = `hyperliquid:${network}:${address.toLowerCase()}:SOL`;
    this.sizeStep = 10n ** BigInt(9 - sizeDecimals);
  }
  static async create(options: {
    wallet?: AbstractWallet;
    agentKey?: `0x${string}`;
    account: `0x${string}`;
    network?: "testnet" | "mainnet";
  }) {
    if (Boolean(options.wallet) === Boolean(options.agentKey))
      throw new Error("Provide one Hyperliquid agent signer source");
    const wallet = options.wallet ?? privateKeyToAccount(options.agentKey!);
    if (!/^0x[0-9a-fA-F]{40}$/.test(options.account))
      throw new Error("Hyperliquid account address is invalid");
    const network = options.network ?? "testnet";
    const transport = new HttpTransport({
      isTestnet: network === "testnet",
      timeout: 10_000,
    });
    const info = new InfoClient({ transport });
    const signer = await getWalletAddress(wallet);
    if (signer.toLowerCase() === options.account.toLowerCase())
      throw new Error("Use a dedicated approved Hyperliquid agent wallet");
    const [meta, agents] = await Promise.all([
      info.meta(),
      info.extraAgents({ user: options.account }),
    ]);
    if (
      !agents.some(
        (agent) =>
          agent.address.toLowerCase() === signer.toLowerCase() &&
          (agent.validUntil === null || agent.validUntil > Date.now()),
      )
    )
      throw new Error("Hyperliquid agent is not approved or has expired");
    const asset = meta.universe.findIndex(
      (item) => item.name === "SOL" && !item.isDelisted,
    );
    if (asset < 0) throw new Error("Hyperliquid SOL perpetual is unavailable");
    const sizeDecimals = meta.universe[asset].szDecimals;
    if (!Number.isInteger(sizeDecimals) || sizeDecimals < 0 || sizeDecimals > 6)
      throw new Error("Unsupported Hyperliquid SOL precision");
    return new HyperliquidAdapter(
      network,
      options.account,
      wallet,
      transport,
      info,
      asset,
      sizeDecimals,
    );
  }
  async book(): Promise<HedgeBook> {
    const book = await this.cached("book", 500, () =>
      this.info.l2Book({ coin: "SOL" }),
    );
    if (!book) throw new Error("Hyperliquid SOL order book is unavailable");
    const levels = (side: (typeof book.levels)[number]) =>
      side.map((level) => ({
        priceE8: units(level.px, 8),
        size: units(level.sz, 9),
      }));
    return {
      timestamp: book.time,
      bids: levels(book.levels[0]),
      asks: levels(book.levels[1]),
    };
  }
  async account(): Promise<HedgeAccount> {
    const [state, orders, data] = await Promise.all([
      this.info.clearinghouseState({ user: this.address }),
      this.cached("orders", 5000, () =>
        this.info.openOrders({ user: this.address }),
      ),
      this.cached("asset", 30000, () =>
        this.info.activeAssetData({ user: this.address, coin: "SOL" }),
      ),
    ]);
    if (
      state.assetPositions.some(
        (entry) =>
          entry.position.coin !== "SOL" && units(entry.position.szi, 9) !== 0n,
      )
    )
      throw new Error(
        "Use a dedicated SOL hedge account without unrelated positions",
      );
    const position = state.assetPositions.find(
      (entry) => entry.position.coin === "SOL",
    )?.position;
    if (data.leverage.type !== "cross")
      throw new Error(
        "The hedge adapter requires cross margin on its dedicated account",
      );
    const value = units(state.marginSummary.accountValue, 6, false);
    const used = units(state.marginSummary.totalMarginUsed, 6, false) + 1n;
    return {
      timestamp: state.time,
      position: position ? units(position.szi, 9) : 0n,
      availableMargin: value > used ? value - used : 0n,
      leverage: data.leverage.value,
      openOrders: orders.map((order) => String(order.oid)),
    };
  }
  async costs() {
    const [fees, data] = await Promise.all([
      this.cached("fees", 60000, () =>
        this.info.userFees({ user: this.address }),
      ),
      this.cached("funding", 10000, () => this.info.metaAndAssetCtxs()),
    ]);
    const index = data[0].universe.findIndex((item) => item.name === "SOL");
    if (index < 0) throw new Error("Hyperliquid SOL funding is unavailable");
    const bps = (value: string) => Number(units(value, 12)) / 100_000_000;
    return {
      takerFeeBps: bps(fees.userCrossRate),
      hourlyFundingBps: bps(data[1][index].funding),
    };
  }
  price(value: bigint, buy: boolean) {
    if (value <= 0n) throw new Error("Hedge price is invalid");
    const digits = (value / 100_000_000n).toString().length;
    const decimals = Math.min(6 - this.sizeDecimals, Math.max(0, 5 - digits));
    const tick = 10n ** BigInt(8 - decimals);
    return (buy ? value / tick : (value + tick - 1n) / tick) * tick;
  }
  async submit(order: HedgeOrder): Promise<HedgeReceipt> {
    const outstanding = await this.info.openOrders({ user: this.address });
    if (outstanding.some((entry) => entry.cloid !== order.cloid))
      throw new Error("Hedge account has unmanaged open orders");
    const action = canonicalize(OrderRequest.entries.action, {
      type: "order",
      orders: [
        {
          a: this.asset,
          b: order.buy,
          p: decimal(order.limitPriceE8, 8),
          s: decimal(order.size, 9),
          r: order.reduceOnly,
          t: { limit: { tif: "Ioc" } },
          c: order.cloid,
        },
      ],
      grouping: "na",
    });
    const payload = {
      action,
      nonce: order.nonce,
      expiresAfter: order.expiresAt,
    };
    const signature = await signL1Action({
      ...payload,
      wallet: this.wallet,
      isTestnet: this.network === "testnet",
    });
    const response = await this.transport.request<{
      status: string;
      response: unknown;
    }>("exchange", { ...payload, signature });
    if (response.status !== "ok") {
      const message =
        typeof response.response === "string"
          ? response.response
          : "Hyperliquid order rejected";
      if (/nonce|duplicate/i.test(message))
        return {
          status: "unknown",
          filledSize: 0n,
          reason: "Persisted hedge nonce already submitted; reconciling",
        };
      return { status: "rejected", filledSize: 0n, reason: message };
    }
    const result = response.response as {
      data?: {
        statuses?: Array<{
          error?: string;
          filled?: { oid: number };
          resting?: { oid: number };
        }>;
      };
    };
    const status = result.data?.statuses?.[0];
    if (status?.error)
      return { status: "rejected", filledSize: 0n, reason: status.error };
    return this.receipt(order);
  }
  async receipt(order: HedgeOrder): Promise<HedgeReceipt> {
    const status = await this.info.orderStatus({
      user: this.address,
      oid: order.cloid,
    });
    if (status.status !== "order") return { status: "unknown", filledSize: 0n };
    const detail = status.order;
    if (
      detail.order.coin !== "SOL" ||
      detail.order.cloid !== order.cloid ||
      (detail.order.side === "B") !== order.buy ||
      units(detail.order.origSz, 9) !== order.size ||
      units(detail.order.limitPx, 8) !== order.limitPriceE8 ||
      detail.order.reduceOnly !== order.reduceOnly
    )
      throw new Error("Hyperliquid order does not match the hedge checkpoint");
    if (detail.status === "open" || detail.status === "triggered")
      return { status: "open", orderId: detail.order.oid, filledSize: 0n };
    const fills = await this.info.userFillsByTime({
      user: this.address,
      startTime: order.nonce - 1000,
      endTime: Date.now(),
    });
    if (fills.length >= 2000)
      throw new Error(
        "Hyperliquid fill window exceeds the reconciliation limit",
      );
    const seen = new Set<number>();
    const matching = fills.filter((fill) => {
      if (
        fill.oid !== detail.order.oid ||
        fill.coin !== "SOL" ||
        seen.has(fill.tid)
      )
        return false;
      seen.add(fill.tid);
      return true;
    });
    const filledSize = matching.reduce(
      (sum, fill) => sum + units(fill.sz, 9),
      0n,
    );
    if (
      matching.some(
        (fill) =>
          (fill.side === "B") !== order.buy ||
          units(fill.sz, 9) <= 0n ||
          units(fill.px, 8) <= 0n ||
          !Number.isSafeInteger(fill.time) ||
          fill.time < order.nonce - 1000 ||
          fill.time > Date.now() + 1000 ||
          fill.feeToken !== "USDC" ||
          !/^0x[0-9a-fA-F]{64}$/.test(fill.hash),
      )
    )
      throw new Error("Hyperliquid fill does not match the hedge order");
    if (filledSize > order.size)
      throw new Error("Hyperliquid filled size exceeds the hedge order");
    if (detail.status === "filled" && filledSize !== order.size)
      return {
        status: "unknown",
        orderId: detail.order.oid,
        filledSize,
        reason: "Hedge fill indexing is incomplete",
      };
    const cost = matching.reduce(
      (sum, fill) => sum + units(fill.sz, 9) * units(fill.px, 8),
      0n,
    );
    return {
      status:
        detail.status === "filled"
          ? "filled"
          : /rejected/i.test(detail.status)
            ? "rejected"
            : "cancelled",
      orderId: detail.order.oid,
      filledSize,
      filledAt: matching.length
        ? Math.max(...matching.map((fill) => fill.time))
        : undefined,
      averagePriceE8: filledSize ? cost / filledSize : undefined,
      fee: matching.reduce((sum, fill) => sum + units(fill.fee, 6), 0n),
      hashes: [...new Set(matching.map((fill) => fill.hash))],
      reason: detail.status,
    };
  }
  async cancel(order: HedgeOrder, nonce = order.nonce + 1) {
    const action = canonicalize(CancelByCloidRequest.entries.action, {
      type: "cancelByCloid",
      cancels: [{ asset: this.asset, cloid: order.cloid }],
    });
    const signature = await signL1Action({
      wallet: this.wallet,
      action,
      nonce,
      isTestnet: this.network === "testnet",
    });
    await this.transport.request("exchange", { action, nonce, signature });
  }
}

export const create_hyperliquid = HyperliquidAdapter.create;
