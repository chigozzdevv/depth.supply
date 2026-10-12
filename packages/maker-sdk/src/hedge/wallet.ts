import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";

export type EthereumProvider = {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
};
export async function connect_hyperliquid(
  provider: EthereumProvider,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<AbstractViemJsonRpcAccount> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000)
    throw new RangeError("Wallet timeout must be 1 to 300000 milliseconds");
  const request = (input: Parameters<EthereumProvider["request"]>[0]) =>
    new Promise<unknown>((resolve, reject) => {
      const signal = options.signal;
      if (signal?.aborted) {
        reject(new Error("Wallet connection cancelled"));
        return;
      }
      let settled = false;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        action();
      };
      const abort = () =>
        finish(() => reject(new Error("Wallet connection cancelled")));
      const timer = setTimeout(
        () =>
          finish(() =>
            reject(
              new Error(
                "Wallet did not respond. Open the extension and resolve its pending request.",
              ),
            ),
          ),
        timeoutMs,
      );
      signal?.addEventListener("abort", abort, { once: true });
      try {
        provider.request(input).then(
          (value) => finish(() => resolve(value)),
          (cause) => finish(() => reject(cause)),
        );
      } catch (cause) {
        finish(() => reject(cause));
      }
    });
  const accounts = await request({ method: "eth_requestAccounts" });
  if (
    !Array.isArray(accounts) ||
    typeof accounts[0] !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(accounts[0])
  )
    throw new Error("The Ethereum wallet did not provide an account");
  const address = accounts[0] as `0x${string}`;
  const check = async () => {
    const current = await request({ method: "eth_accounts" });
    if (
      !Array.isArray(current) ||
      typeof current[0] !== "string" ||
      current[0].toLowerCase() !== address.toLowerCase()
    )
      throw new Error("The Ethereum wallet account changed; connect it again");
  };
  return {
    async getAddresses() {
      await check();
      return [address];
    },
    async getChainId() {
      const chain = await request({ method: "eth_chainId" });
      if (
        typeof chain !== "string" ||
        !/^0x[0-9a-fA-F]+$/.test(chain) ||
        !Number.isSafeInteger(Number(chain))
      )
        throw new Error("Ethereum wallet chain is invalid");
      return Number(chain);
    },
    async signTypedData(params) {
      await check();
      const signature = await request({
        method: "eth_signTypedData_v4",
        params: [
          address,
          JSON.stringify({
            ...params,
            types: {
              EIP712Domain: [
                { name: "name", type: "string" },
                { name: "version", type: "string" },
                { name: "chainId", type: "uint256" },
                { name: "verifyingContract", type: "address" },
              ],
              ...params.types,
            },
          }),
        ],
      });
      if (
        typeof signature !== "string" ||
        !/^0x[0-9a-fA-F]{130}$/.test(signature)
      )
        throw new Error("Ethereum wallet returned an invalid signature");
      return signature as `0x${string}`;
    },
  };
}
