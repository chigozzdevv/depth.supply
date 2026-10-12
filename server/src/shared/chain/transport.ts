type RpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown[];
};
const methods = new Set([
  "getGenesisHash",
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

export class RpcTransport {
  private nextStart = 0;
  private waiting = 0;
  private readonly reads = new Map<
    string,
    { expiresAt: number; value: Promise<Record<string, unknown>> }
  >();
  constructor(
    private readonly url: string,
    private readonly rps = 3,
  ) {
    if (!Number.isSafeInteger(rps) || rps < 1 || rps > 100)
      throw new Error("SOLANA_RPC_RPS must be 1 to 100");
  }
  private async slot() {
    if (this.waiting >= 32) throw new Error("RPC request queue is full");
    this.waiting++;
    const delay = Math.max(0, this.nextStart - Date.now());
    this.nextStart =
      Math.max(Date.now(), this.nextStart) + Math.ceil(1000 / this.rps);
    try {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      this.waiting--;
    }
  }
  private async upstream(
    request: RpcRequest,
  ): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.slot();
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10_000),
      });
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        continue;
      }
      if (!response.ok)
        throw new Error(`RPC provider returned HTTP ${response.status}`);
      const result = (await response.json()) as Record<string, unknown>;
      if (
        result.jsonrpc !== "2.0" ||
        !("result" in result || "error" in result)
      )
        throw new Error("RPC provider returned an invalid response");
      if (
        (result.error as { code?: number } | undefined)?.code === -32005 &&
        attempt < 2
      ) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        continue;
      }
      return result;
    }
    throw new Error("RPC provider is unavailable");
  }
  async request(
    input: unknown,
  ): Promise<Record<string, unknown> & { id: string | number }> {
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
    const prior = cacheable ? this.reads.get(key) : undefined;
    if (prior && prior.expiresAt > Date.now())
      return { ...(await prior.value), id: request.id };
    const value = this.upstream(request)
      .then((result) => {
        if (result.error) this.reads.delete(key);
        else if (cacheable) {
          const entry = this.reads.get(key);
          if (entry?.value === value)
            entry.expiresAt =
              Date.now() +
              (request.method === "getGenesisHash" ? 86_400_000 : 500);
        }
        return result;
      })
      .catch((error) => {
        this.reads.delete(key);
        throw error;
      });
    if (cacheable) {
      if (this.reads.size >= 64)
        this.reads.delete(this.reads.keys().next().value!);
      this.reads.set(key, {
        expiresAt: Infinity,
        value,
      });
    }
    return { ...(await value), id: request.id };
  }
  fetch: typeof fetch = async (_input, init) => {
    const result = await this.request(JSON.parse(String(init?.body)));
    init?.signal?.throwIfAborted();
    return Response.json(result);
  };
}
