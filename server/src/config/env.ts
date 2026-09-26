export type ServerConfig = { rpcUrl: string; host: string; port: number };

export function serverConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const rpcUrl = env.SOLANA_RPC_URL;
  if (!rpcUrl) throw new Error("SOLANA_RPC_URL is required");
  const url = new URL(rpcUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("SOLANA_RPC_URL must use HTTP or HTTPS");
  }
  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port");
  }
  return { rpcUrl, host: env.HOST ?? "127.0.0.1", port };
}
