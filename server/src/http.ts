import { SOL_USD_MARKET_ID } from "@depth/bindings";
import { PublicKey } from "@solana/web3.js";
import { createServer as createNodeServer, type Server } from "node:http";
import type { ChainReader } from "@/chain";

function key(value: string): PublicKey | undefined {
  try {
    return new PublicKey(value);
  } catch {
    return undefined;
  }
}

export function createServer(reader: ChainReader): Server {
  return createNodeServer(async (request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(JSON.stringify(body));
    };
    if (request.method !== "GET") {
      send(405, { error: "method_not_allowed" });
      return;
    }
    let parts: string[];
    try {
      parts = new URL(request.url ?? "/", "http://localhost").pathname
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);
    } catch {
      send(400, { error: "invalid_path" });
      return;
    }
    try {
      if (parts.length === 2 && parts[0] === "v1" && parts[1] === "markets") {
        const market = await reader.market();
        send(200, { markets: market ? [market] : [] });
        return;
      }
      if (parts.length === 3 && parts[0] === "v1" && parts[1] === "markets") {
        if (parts[2] !== SOL_USD_MARKET_ID) {
          send(404, { error: "not_found" });
          return;
        }
        const market = await reader.market();
        send(market ? 200 : 404, market ?? { error: "not_found" });
        return;
      }
      if (parts.length === 3 && parts[0] === "v1" && parts[1] === "quotes") {
        const address = key(parts[2]);
        if (!address) return send(400, { error: "invalid_address" });
        const quote = await reader.quote(address);
        send(quote ? 200 : 404, quote ?? { error: "not_found" });
        return;
      }
      if (
        parts.length === 3 &&
        parts[0] === "v1" &&
        parts[1] === "operations"
      ) {
        const address = key(parts[2]);
        if (!address) return send(400, { error: "invalid_address" });
        const operation = await reader.operation(address);
        send(operation ? 200 : 404, operation ?? { error: "not_found" });
        return;
      }
      if (parts.length === 3 && parts[0] === "v1" && parts[1] === "apps") {
        const address = key(parts[2]);
        if (!address) return send(400, { error: "invalid_address" });
        const app = await reader.app(address);
        send(app ? 200 : 404, app ?? { error: "not_found" });
        return;
      }
      send(404, { error: "not_found" });
    } catch {
      send(503, { error: "rpc_unavailable" });
    }
  });
}
