import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { RpcTransport } from "@/shared/chain/transport";
import { rpcRoute } from "@/shared/http/rpc";

test("shared RPC coalesces reads with independent request IDs and never caches transaction submissions", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body.method);
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: { value: calls.length },
    });
  };
  try {
    const relay = new RpcTransport("https://rpc.example.test", 100);
    const request = {
      jsonrpc: "2.0",
      method: "getAccountInfo",
      params: ["account", { commitment: "finalized" }],
    };
    const responses = await Promise.all([
      relay.request({ ...request, id: 1 }),
      relay.request({ ...request, id: 2 }),
    ]);
    assert.deepEqual(
      responses.map((value) => value.id),
      [1, 2],
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(responses[0].result, responses[1].result);
    await relay.request({
      ...request,
      params: ["account", { commitment: "confirmed" }],
      id: 3,
    });
    await relay.request({
      jsonrpc: "2.0",
      method: "sendTransaction",
      params: ["signed-bytes"],
      id: 4,
    });
    await relay.request({
      jsonrpc: "2.0",
      method: "sendTransaction",
      params: ["signed-bytes"],
      id: 5,
    });
    assert.equal(calls.length, 4);
    await assert.rejects(
      relay.request({ ...request, method: "requestAirdrop", id: 6 }),
      /Invalid RPC/,
    );
    const app = Fastify();
    rpcRoute(app, relay);
    const invalid = await app.inject({
      method: "POST",
      url: "/rpc",
      payload: [],
    });
    assert.equal(invalid.statusCode, 400);
    await app.close();
  } finally {
    globalThis.fetch = original;
  }
});

test("RPC rate failures retry within a bound and errors are never reused as cached reads", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () =>
    ++count === 1
      ? new Response("limited", { status: 429 })
      : Response.json({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000, message: "Unavailable account" },
        });
  try {
    const relay = new RpcTransport("https://rpc.example.test", 100);
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: ["missing"],
    };
    assert.ok((await relay.request(request)).error);
    assert.ok((await relay.request(request)).error);
    assert.equal(count, 3);
  } finally {
    globalThis.fetch = original;
  }
});
