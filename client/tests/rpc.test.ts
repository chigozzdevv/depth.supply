import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "@/app/api/rpc/route";

function request(origin: string, host: string, forwarded?: string): Request {
  return new Request("http://localhost:3100/api/rpc?cluster=devnet", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      host,
      ...(forwarded ? { "x-forwarded-host": forwarded } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash" }),
  });
}

test("RPC accepts the browser host when Next normalizes its internal URL", async () => {
  const previousFetch = globalThis.fetch;
  const previousRpc = process.env.SOLANA_RPC_URL;
  process.env.SOLANA_RPC_URL = "https://rpc.example.test";
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://rpc.example.test");
    assert.equal(JSON.parse(init!.body as string).method, "getGenesisHash");
    calls += 1;
    return Response.json({ jsonrpc: "2.0", id: 1, result: "devnet-genesis" });
  };
  try {
    for (const host of ["localhost:3100", "127.0.0.1:3100", "[::1]:3100"]) {
      const response = await POST(request(`http://${host}`, host));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).result, "devnet-genesis");
    }
    assert.equal(calls, 3);
    for (const rejected of [
      request("https://other.example", "127.0.0.1:3100"),
      request("http://127.0.0.1:3101", "127.0.0.1:3100"),
      request("http://localhost:3100", "127.0.0.1:3100"),
      request("https://other.example", "127.0.0.1:3100", "other.example"),
    ]) {
      const response = await POST(rejected);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, "origin_mismatch");
    }
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousRpc === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = previousRpc;
  }
});
