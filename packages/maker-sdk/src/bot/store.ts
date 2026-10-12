import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import type { QuoteInput } from "@/client/types";
import type { HedgeState } from "@/hedge/types";

export type QuoteRisk = {
  quote: string;
  notional: bigint;
  price: bigint;
  version: bigint;
  balanceNonce?: string;
  externalPosition: bigint;
  hedgeNonce: number;
};

export type BotState = {
  genesis: string;
  maker: string;
  operator: string;
  cursor?: string;
  quote?: string;
  request?: QuoteInput;
  referencePrice?: bigint;
  quoteWrite?: { quote: string; version: bigint; release: boolean };
  inventoryPendingSince?: number;
  quoteRisk?: QuoteRisk;
  replacement?: {
    prior: string;
    nonce: bigint;
    request?: QuoteInput;
    referencePrice?: bigint;
    risk?: QuoteRisk;
  };
  fills: Record<string, { signature: string; slot: number }>;
  hedge?: HedgeState;
};

export class BotStore {
  readonly path: string;
  private lock?: { token: string; close: () => Promise<void> };
  constructor(
    readonly genesis: string,
    readonly maker: string,
    readonly operator: string,
    directory: string,
  ) {
    for (const value of [genesis, maker, operator])
      if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(value))
        throw new Error("Maker bot identity is invalid");
    this.path = join(directory, `${genesis}-${maker}-${operator}.json`);
  }
  async acquire() {
    if (this.lock) throw new Error("Maker bot already holds its lease");
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const path = `${this.path}.lock`;
    const token = randomBytes(16).toString("hex");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(path, "wx", 0o600);
        try {
          await handle.writeFile(
            JSON.stringify({ host: hostname(), pid: process.pid, token }),
          );
        } catch (error) {
          await handle.close();
          await unlink(path);
          throw error;
        }
        this.lock = { token, close: () => handle.close() };
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const contents = await readFile(path, "utf8");
        const lock = JSON.parse(contents);
        if (
          lock.host !== hostname() ||
          !Number.isSafeInteger(lock.pid) ||
          lock.pid <= 0
        )
          throw new Error("Maker bot lease belongs to another host");
        try {
          process.kill(lock.pid, 0);
          throw new Error("Another maker bot is running for this wallet");
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== "ESRCH") throw cause;
        }
        if ((await readFile(path, "utf8")) !== contents)
          throw new Error("Maker bot lease changed during recovery");
        await unlink(path);
      }
    }
    throw new Error("Maker bot lease could not be acquired");
  }
  async release() {
    const lock = this.lock;
    if (!lock) return;
    this.lock = undefined;
    await lock.close();
    let contents: string;
    try {
      contents = await readFile(`${this.path}.lock`, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const value = JSON.parse(contents);
    if (value.token === lock.token) await unlink(`${this.path}.lock`);
  }
  async load(): Promise<BotState> {
    let source: string;
    try {
      source = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return {
          genesis: this.genesis,
          maker: this.maker,
          operator: this.operator,
          fills: {},
        };
      throw error;
    }
    const state = JSON.parse(source, (_key, value) =>
      value &&
      typeof value === "object" &&
      Object.keys(value).length === 1 &&
      typeof value.$bigint === "string"
        ? BigInt(value.$bigint)
        : value,
    ) as BotState;
    if (
      state.genesis !== this.genesis ||
      state.maker !== this.maker ||
      state.operator !== this.operator ||
      !state.fills ||
      typeof state.fills !== "object"
    )
      throw new Error(
        "Maker bot checkpoint belongs to another wallet or network",
      );
    if (
      state.referencePrice !== undefined &&
      (typeof state.referencePrice !== "bigint" || state.referencePrice <= 0n)
    )
      throw new Error("Maker bot checkpoint price is invalid");
    for (const value of [
      state.request?.clientNonce,
      state.replacement?.nonce,
      state.replacement?.request?.clientNonce,
    ])
      if (
        value !== undefined &&
        (typeof value !== "bigint" || value < 0n || value >= 1n << 64n)
      )
        throw new Error("Maker bot checkpoint nonce is invalid");
    for (const value of [state.quote, state.replacement?.prior])
      if (value !== undefined && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))
        throw new Error("Maker bot checkpoint quote is invalid");
    if (
      state.inventoryPendingSince !== undefined &&
      (!Number.isSafeInteger(state.inventoryPendingSince) ||
        state.inventoryPendingSince <= 0)
    )
      throw new Error("Inventory checkpoint time is invalid");
    for (const risk of [state.quoteRisk, state.replacement?.risk])
      if (
        risk &&
        (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(risk.quote) ||
          typeof risk.notional !== "bigint" ||
          risk.notional < 0n ||
          typeof risk.price !== "bigint" ||
          risk.price <= 0n ||
          typeof risk.version !== "bigint" ||
          risk.version < 0n ||
          typeof risk.externalPosition !== "bigint" ||
          !Number.isSafeInteger(risk.hedgeNonce) ||
          risk.hedgeNonce < 0 ||
          (risk.balanceNonce !== undefined &&
            !/^[0-9a-f]{32}$/.test(risk.balanceNonce)))
      )
        throw new Error("Quote risk checkpoint is invalid");
    if (
      state.quoteWrite &&
      (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(state.quoteWrite.quote) ||
        typeof state.quoteWrite.version !== "bigint" ||
        typeof state.quoteWrite.release !== "boolean" ||
        state.quoteWrite.version < 0n)
    )
      throw new Error("Quote write checkpoint is invalid");
    for (const request of [state.request, state.replacement?.request])
      if (
        request &&
        (!Number.isSafeInteger(request.expiresAt) ||
          typeof request.maxCapacity !== "bigint" ||
          request.maxCapacity <= 0n ||
          !Array.isArray(request.tiers) ||
          !request.tiers.length)
      )
        throw new Error("Maker bot checkpoint request is invalid");
    if (
      state.replacement?.request &&
      state.replacement.request.clientNonce !== state.replacement.nonce
    )
      throw new Error("Replacement checkpoint nonce is invalid");
    for (const fill of Object.values(state.fills))
      if (
        typeof fill.signature !== "string" ||
        !Number.isSafeInteger(fill.slot) ||
        fill.slot < 0
      )
        throw new Error("Maker bot checkpoint fill is invalid");
    if (state.hedge) {
      const hedge = state.hedge;
      if (
        typeof hedge.identity !== "string" ||
        !Number.isSafeInteger(hedge.nonce) ||
        hedge.nonce < 0 ||
        !Array.isArray(hedge.history) ||
        hedge.history.length > 100 ||
        (hedge.unhedgedSince !== undefined &&
          !Number.isSafeInteger(hedge.unhedgedSince))
      )
        throw new Error("Hedge checkpoint is invalid");
      for (const order of [
        ...hedge.history,
        ...(hedge.pending ? [hedge.pending] : []),
      ])
        if (
          !/^0x[0-9a-f]{32}$/.test(order.cloid) ||
          !Number.isSafeInteger(order.nonce) ||
          order.nonce < 0 ||
          !Number.isSafeInteger(order.expiresAt) ||
          order.expiresAt <= order.nonce ||
          typeof order.buy !== "boolean" ||
          typeof order.reduceOnly !== "boolean" ||
          typeof order.size !== "bigint" ||
          order.size <= 0n ||
          typeof order.limitPriceE8 !== "bigint" ||
          order.limitPriceE8 <= 0n
        )
          throw new Error("Hedge checkpoint order is invalid");
      for (const record of hedge.history)
        if (
          !["filled", "cancelled", "rejected"].includes(record.status) ||
          typeof record.filledSize !== "bigint" ||
          record.filledSize < 0n ||
          record.filledSize > record.size ||
          !Number.isSafeInteger(record.completedAt) ||
          record.completedAt < record.nonce ||
          (record.orderId !== undefined &&
            (!Number.isSafeInteger(record.orderId) || record.orderId < 0))
        )
          throw new Error("Hedge checkpoint receipt is invalid");
    }
    return state;
  }
  async save(state: BotState) {
    if (!this.lock)
      throw new Error("Acquire the maker bot lease before saving");
    const lease = JSON.parse(await readFile(`${this.path}.lock`, "utf8"));
    if (
      lease.token !== this.lock.token ||
      lease.pid !== process.pid ||
      lease.host !== hostname()
    )
      throw new Error("Maker bot lease was lost");
    const path = `${this.path}.${process.pid}.${randomBytes(8).toString("hex")}`;
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(
        JSON.stringify(state, (_key, value) =>
          typeof value === "bigint" ? { $bigint: value.toString() } : value,
        ),
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(path, this.path);
    const directory = await open(dirname(this.path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}
