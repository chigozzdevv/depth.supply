export type DepthEnvironment = "localnet" | "devnet" | "mainnet-beta";

export const environments = {
  localnet: {
    rpc: "http://127.0.0.1:8899",
    service: "http://127.0.0.1:8787",
  },
  devnet: {
    rpc: "https://api.devnet.solana.com",
    service: "https://api.trydepth.xyz",
    genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  },
  "mainnet-beta": {
    rpc: "https://api.mainnet.solana.com",
    service: "https://depth.supply",
    genesis: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  },
} as const;

export function endpoint(
  value: string,
  environment: DepthEnvironment,
  name: string,
): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new RangeError(
      `${name} must use HTTPS, or loopback HTTP for local development`,
    );
  }
  return url.toString().replace(/\/$/, "");
}
