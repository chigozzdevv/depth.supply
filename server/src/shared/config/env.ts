import { Keypair } from "@solana/web3.js";

export type ServerConfig = { rpcUrl: string; host: string; port: number };
export type KeeperConfig = { rpcUrl: string; keypair: Keypair };

function rpcUrl(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  return value;
}

export function serverConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const url = rpcUrl(env.SOLANA_RPC_URL, "SOLANA_RPC_URL");
  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port");
  }
  return { rpcUrl: url, host: env.HOST ?? "127.0.0.1", port };
}

export function keeperConfig(
  env: NodeJS.ProcessEnv = process.env,
): KeeperConfig {
  const url = rpcUrl(env.DEPTH_RPC_URL, "DEPTH_RPC_URL");
  if (!env.DEPTH_KEEPER_KEYPAIR) {
    throw new Error("DEPTH_KEEPER_KEYPAIR is required");
  }
  const bytes: unknown = JSON.parse(env.DEPTH_KEEPER_KEYPAIR);
  if (
    !Array.isArray(bytes) ||
    bytes.length !== 64 ||
    !bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    throw new Error("DEPTH_KEEPER_KEYPAIR must be a 64-byte JSON array");
  }
  return {
    rpcUrl: url,
    keypair: Keypair.fromSecretKey(Uint8Array.from(bytes)),
  };
}
