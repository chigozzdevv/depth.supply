import * as anchor from "@anchor-lang/core";
import { createServer } from "node:http";
import { chainConnection } from "@/shared/chain/connection";
import { OraclePublisher } from "@/features/oracle/oracle.publisher";
import { priceTimestamp } from "@/features/oracle/oracle.price";
import { publisherConfig } from "@/shared/config/env";

const config = publisherConfig();
const connection = chainConnection(`${config.serviceUrl}/rpc`);
const publisher = new OraclePublisher(
  connection,
  new anchor.Wallet(config.keypair),
  config,
);
let running = true;
let delayMs = config.intervalMs;

const server = createServer(async (request, response) => {
  if (request.url !== "/healthz") {
    response.writeHead(404).end();
    return;
  }
  try {
    const publishTime = priceTimestamp(
      await connection.getAccountInfo(config.priceAccount, "confirmed"),
    );
    const ageSeconds = Math.floor(Date.now() / 1_000) - publishTime;
    const healthy =
      publishTime > 0 &&
      ageSeconds >= 0 &&
      ageSeconds <= Math.min(config.publishAfterSeconds + 60, 240);
    response
      .writeHead(healthy ? 200 : 503, { "content-type": "application/json" })
      .end(JSON.stringify({ healthy, publishTime, ageSeconds }));
  } catch {
    response
      .writeHead(503, { "content-type": "application/json" })
      .end(JSON.stringify({ healthy: false }));
  }
});

process.once("SIGINT", () => {
  running = false;
});
process.once("SIGTERM", () => {
  running = false;
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(config.healthPort, "127.0.0.1", resolve);
});

while (running) {
  try {
    const published = await publisher.advance();
    if (published) {
      process.stdout.write(
        `pyth_sol_usd ${published.publishTime} ${published.signatures.join(
          ",",
        )}\n`,
      );
    }
    delayMs = config.intervalMs;
  } catch (error) {
    process.stderr.write(
      `${String(error).replace(/(?:https?|wss?):\/\/[^\s]+/g, "[RPC endpoint]")}\n`,
    );
    delayMs = Math.min(delayMs * 2, 60_000);
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

server.close();
