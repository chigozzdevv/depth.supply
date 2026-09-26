import { Connection } from "@solana/web3.js";
import { buildApp } from "@/app";
import { ChainClient } from "@/shared/chain/chain.client";
import { serverConfig } from "@/shared/config/env";

async function main(): Promise<void> {
  const config = serverConfig();
  const app = buildApp(
    new ChainClient(new Connection(config.rpcUrl, "confirmed")),
  );
  await app.listen({ port: config.port, host: config.host });
}

void main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
