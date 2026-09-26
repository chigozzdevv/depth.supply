import { Connection } from "@solana/web3.js";
import { ChainReader } from "@/chain";
import { createServer } from "@/http";

const endpoint = process.env.SOLANA_RPC_URL;
if (!endpoint) throw new Error("SOLANA_RPC_URL is required");
const port = Number(process.env.PORT ?? "8787");
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port");
}
const host = process.env.HOST ?? "127.0.0.1";
const reader = new ChainReader(new Connection(endpoint, "confirmed"));
createServer(reader).listen(port, host);
