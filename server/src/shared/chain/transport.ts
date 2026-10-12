import { setTimeout as sleep } from "node:timers/promises";
import { rpcJson } from "@/shared/chain/json";

type RpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown[];
};
const methods = new Set([
  "getGenesisHash",
  "getVersion",
  "getEpochInfo",
  "getEpochSchedule",
  "getAccountInfo",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getLatestBlockhash",
  "getBlockHeight",
  "getSignatureStatuses",
  "getTransaction",
  "getSignaturesForAddress",
  "getBalance",
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getMinimumBalanceForRentExemption",
  "getSlot",
  "getFeeForMessage",
  "getRecentPrioritizationFees",
  "simulateTransaction",
  "sendTransaction",
  "isBlockhashValid",
]);
const cached = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getBalance",
  "getSlot",
  "getGenesisHash",
]);
class RpcUnavailable extends Error {
  constructor(cause?: unknown) {
    super("RPC provider is unavailable", { cause });
  }
}

type Read = {
  method: string;
  expiresAt: number;
  value: Promise<Record<string, unknown>>;
  controller: AbortController;
  pending: boolean;
  users: number;
};
type Job = {
  method: string;
  enqueuedAt: number;
  start: () => void;
};
const priority = (method: string) =>
  [
    "sendTransaction",
    "getSignatureStatuses",
    "getLatestBlockhash",
    "getBlockHeight",
    "simulateTransaction",
  ].includes(method)
    ? 0
    : [
          "getProgramAccounts",
          "getSignaturesForAddress",
          "getTransaction",
          "getTokenAccountsByOwner",
        ].includes(method)
      ? 2
      : 1;

export class RpcTransport {
  private nextStart = 0;
  private nextScan = 0;
  private active = 0;
  private readonly jobs: Job[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private readonly reads = new Map<string, Read>();
  private readonly backup?: RpcTransport;
  private unavailableUntil = 0;
  private invalidate() {
    for (const [key, read] of this.reads)
      if (read.method !== "getGenesisHash") this.reads.delete(key);
  }
  constructor(
    private readonly url: string,
    private readonly rps = 3,
    private readonly fallback?: { url: string; genesis: string },
  ) {
    if (!Number.isSafeInteger(rps) || rps < 1 || rps > 100)
      throw new Error("SOLANA_RPC_RPS must be 1 to 100");
    if (fallback) {
      if (fallback.url === url)
        throw new Error("Fallback RPC must be a different endpoint");
      this.backup = new RpcTransport(fallback.url, 3);
    }
  }
  private pump() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.jobs.length || this.active >= 8) return;
    const now = Date.now();
    const eligible = this.jobs.filter(
      (job) => job.method !== "getProgramAccounts" || now >= this.nextScan,
    );
    if (now < this.nextStart || !eligible.length) {
      const next = Math.max(
        this.nextStart,
        eligible.length ? now : this.nextScan,
      );
      this.timer = setTimeout(() => this.pump(), Math.max(1, next - now));
      return;
    }
    const score = (job: Job) =>
      priority(job.method) * 1000 - (now - job.enqueuedAt);
    const job = eligible.reduce((best, candidate) =>
      score(candidate) < score(best) ? candidate : best,
    );
    this.jobs.splice(this.jobs.indexOf(job), 1);
    this.nextStart = now + Math.ceil(1000 / this.rps);
    if (job.method === "getProgramAccounts") this.nextScan = now + 500;
    this.active++;
    job.start();
    this.pump();
  }
  private slot(method: string, signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.jobs.length >= (priority(method) === 0 ? 32 : 24))
      throw new Error("RPC request queue is full");
    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        const index = this.jobs.indexOf(job);
        if (index >= 0) this.jobs.splice(index, 1);
        reject(signal.reason);
        this.pump();
      };
      const job: Job = {
        method,
        enqueuedAt: Date.now(),
        start: () => {
          signal.removeEventListener("abort", abort);
          resolve();
        },
      };
      signal.addEventListener("abort", abort, { once: true });
      this.jobs.push(job);
      this.pump();
    });
  }
  private async upstream(
    request: RpcRequest,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const attempts = this.backup ? 2 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      await this.slot(request.method, signal);
      let retry = false;
      try {
        signal.throwIfAborted();
        const response = await fetch(this.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(this.backup ? 5000 : 10_000),
          ]),
        });
        if ([429, 500, 502, 503, 504].includes(response.status)) {
          await response.body?.cancel();
          if (attempt === attempts - 1) throw new RpcUnavailable();
          retry = true;
        } else {
          if (!response.ok)
            throw new Error(`RPC provider returned HTTP ${response.status}`);
          const result = rpcJson(await response.text());
          if (
            !result ||
            typeof result !== "object" ||
            result.jsonrpc !== "2.0" ||
            result.id !== request.id ||
            !("result" in result || "error" in result)
          )
            throw new Error("RPC provider returned an invalid response");
          if (
            (result.error as { code?: number } | undefined)?.code === -32005
          ) {
            if (attempt === attempts - 1) throw new RpcUnavailable();
            retry = true;
          } else return result;
        }
      } catch (error) {
        signal.throwIfAborted();
        const transient =
          error instanceof RpcUnavailable ||
          error instanceof TypeError ||
          (error instanceof Error &&
            (error.name === "TimeoutError" ||
              [
                "ConnectionRefused",
                "FailedToOpenSocket",
                "ECONNREFUSED",
                "ECONNRESET",
                "ENOTFOUND",
                "EAI_AGAIN",
                "EPIPE",
                "ETIMEDOUT",
              ].includes(String((error as Error & { code?: string }).code))));
        if (transient && attempt < attempts - 1) retry = true;
        else throw transient ? new RpcUnavailable(error) : error;
      } finally {
        if (request.method === "sendTransaction") this.invalidate();
        this.active--;
        this.pump();
      }
      if (retry) await sleep(500 * 2 ** attempt, undefined, { signal });
    }
    throw new Error("RPC provider is unavailable");
  }
  private async provider(request: RpcRequest, signal: AbortSignal) {
    if (!this.backup || Date.now() >= this.unavailableUntil) {
      try {
        return await this.upstream(request, signal);
      } catch (error) {
        signal.throwIfAborted();
        if (!this.backup || !(error instanceof RpcUnavailable)) throw error;
        this.unavailableUntil = Date.now() + 30_000;
      }
    }
    const network = await this.backup!.request(
      { jsonrpc: "2.0", id: "depth:network", method: "getGenesisHash" },
      signal,
    );
    if (network.result !== this.fallback!.genesis)
      throw new Error(
        "Fallback RPC genesis does not match the selected environment",
      );
    try {
      return await this.backup!.request(request, signal);
    } finally {
      if (request.method === "sendTransaction") this.invalidate();
    }
  }
  async request(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown> & { id: string | number }> {
    signal?.throwIfAborted();
    const request = input as RpcRequest;
    if (
      !request ||
      Array.isArray(request) ||
      request.jsonrpc !== "2.0" ||
      !methods.has(request.method) ||
      !["string", "number"].includes(typeof request.id) ||
      (request.params !== undefined && !Array.isArray(request.params))
    )
      throw new Error("Invalid RPC request");
    const key = JSON.stringify([request.method, request.params]);
    const cacheable = cached.has(request.method);
    let entry = cacheable ? this.reads.get(key) : undefined;
    if (
      !entry ||
      entry.expiresAt <= Date.now() ||
      entry.controller.signal.aborted
    ) {
      const controller = new AbortController();
      const read: Read = {
        method: request.method,
        controller,
        expiresAt: Infinity,
        pending: true,
        users: 0,
        value: this.provider(request, controller.signal)
          .then((result) => {
            if (this.reads.get(key) === read) {
              if (result.error) this.reads.delete(key);
              else
                read.expiresAt =
                  Date.now() +
                  (request.method === "getGenesisHash" ? 86_400_000 : 500);
            }
            return result;
          })
          .catch((error) => {
            if (this.reads.get(key) === read) this.reads.delete(key);
            throw error;
          })
          .finally(() => {
            read.pending = false;
          }),
      };
      entry = read;
      if (cacheable) {
        if (this.reads.size >= 64)
          this.reads.delete(this.reads.keys().next().value!);
        this.reads.set(key, read);
      }
    }
    const read = entry;
    read.users++;
    let abort: (() => void) | undefined;
    try {
      const value = signal
        ? new Promise<Record<string, unknown>>((resolve, reject) => {
            abort = () => reject(signal.reason);
            signal.addEventListener("abort", abort, { once: true });
            read.value.then(resolve, reject);
            if (signal.aborted) abort();
          })
        : read.value;
      return { ...(await value), id: request.id };
    } finally {
      if (abort) signal?.removeEventListener("abort", abort);
      read.users--;
      if (!read.users && read.pending) read.controller.abort();
    }
  }
  fetch: typeof fetch = async (_input, init) =>
    Response.json(
      await this.request(
        JSON.parse(String(init?.body)),
        init?.signal ?? undefined,
      ),
    );
}
