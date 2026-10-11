import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";

export type EthereumProvider = {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
};
export async function connect_hyperliquid(
  provider: EthereumProvider,
): Promise<AbstractViemJsonRpcAccount> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (
    !Array.isArray(accounts) ||
    typeof accounts[0] !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(accounts[0])
  )
    throw new Error("The Ethereum wallet did not provide an account");
  const address = accounts[0] as `0x${string}`;
  const check = async () => {
    const current = await provider.request({ method: "eth_accounts" });
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
      const chain = await provider.request({ method: "eth_chainId" });
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
      const signature = await provider.request({
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
