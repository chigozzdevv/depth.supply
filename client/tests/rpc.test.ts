import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "@/app/api/rpc/route";
import { relayRpc } from "@/shared/rpc/relay";

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

test("RPC retries temporary read failures and forwards application errors unchanged", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls < 3)
      return new Response("busy", { status: calls === 1 ? 429 : 503 });
    return Response.json({ jsonrpc: "2.0", id: 4, result: { value: null } });
  };
  try {
    const result = await relayRpc(
      "https://rpc.example.test",
      "{}",
      "getAccountInfo",
      AbortSignal.timeout(5000),
    );
    assert.equal(result.status, 200);
    assert.equal(calls, 3);
    assert.equal((await result.json()).id, 4);
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({
        jsonrpc: "2.0",
        id: 4,
        error: { code: -32002, message: "Simulation failed" },
      });
    };
    const simulation = await relayRpc(
      "https://rpc.example.test",
      "{}",
      "simulateTransaction",
      AbortSignal.timeout(5000),
    );
    assert.equal((await simulation.json()).error.code, -32002);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});

test("RPC never repeats an uncertain transaction submission", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("network interrupted");
  };
  try {
    const response = await relayRpc(
      "https://rpc.example.test",
      "{}",
      "sendTransaction",
      AbortSignal.timeout(5000),
    );
    assert.equal(response.status, 503);
    assert.equal(calls, 1);
    assert.deepEqual(await response.json(), { error: "rpc_unavailable" });
  } finally {
    globalThis.fetch = previous;
  }
});

test("invalid RPC JSON is a caller error rather than an upstream outage", async () => {
  const response = await POST(
    new Request("http://localhost:3100/api/rpc", {
      method: "POST",
      body: "null",
    }),
  );
  assert.equal(response.status, 400);
});
