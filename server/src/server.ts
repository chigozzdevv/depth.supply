import { chainConnection } from "@/shared/chain/connection";
import { RpcTransport } from "@/shared/chain/transport";
import { buildApp } from "@/app";
import { ChainClient } from "@/shared/chain/chain.client";
import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import { ChainSigner } from "@/shared/chain/chain.signer";
import { ViewService } from "@/features/view/view.service";
import { ViewStore } from "@/features/view/view.store";
import { serverConfig, viewConfig } from "@/shared/config/env";

async function main(): Promise<void> {
  const config = serverConfig();
  const transport = new RpcTransport(
    config.rpcUrl,
    Number(process.env.SOLANA_RPC_RPS ?? "3"),
  );
  const connection = chainConnection(config.rpcUrl, transport.fetch);
  const sponsor = viewConfig();
  const views = sponsor
    ? new ViewService(
        new ChainSigner(connection, new anchor.Wallet(sponsor.keypair)),
        await ViewStore.open(
          sponsor.directory,
          `${await connection.getGenesisHash()}:${DEPTH_PROGRAM_ID.toBase58()}:${sponsor.keypair.publicKey.toBase58()}`,
        ),
      )
    : undefined;
  const app = buildApp(new ChainClient(connection), true, views, transport);
  process.once("SIGTERM", () => {
    void app.close();
  });
  process.once("SIGINT", () => {
    void app.close();
  });
  await app.listen({ port: config.port, host: config.host });
}

void main().catch((error) => {
  process.stderr.write(
    `${String(error).replace(/(?:https?|wss?):\/\/[^\s]+/g, "[RPC endpoint]")}\n`,
  );
  process.exitCode = 1;
});
