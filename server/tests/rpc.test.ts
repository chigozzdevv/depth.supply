import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { RpcTransport } from "@/shared/chain/transport";
import { rpcRoute } from "@/shared/http/rpc";
import { setTimeout as sleep } from "node:timers/promises";

test("RPC relays preserve u64 account metadata and decimal tokens through cached HTTP replies", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    const { id } = JSON.parse(String(init?.body));
    calls++;
    return new Response(
      `{"jsonrpc":"2.0","id":${id},"result":{"rentEpoch":18446744073709551615,"lamports":9007199254740993,"uiAmount":0.1234567890123456789,"text":"18446744073709551615"}}`,
    );
  };
  const app = Fastify();
  rpcRoute(app, new RpcTransport("https://rpc.example.test", 100));
  try {
    for (const id of [1, 2]) {
      const response = await app.inject({
        method: "POST",
        url: "/rpc",
        payload: {
          jsonrpc: "2.0",
          id,
          method: "getAccountInfo",
          params: ["account"],
        },
      });
      assert.equal(response.statusCode, 200);
      assert.match(response.body, /"rentEpoch":18446744073709551615/);
      assert.match(response.body, /"lamports":9007199254740993/);
      assert.match(response.body, /"uiAmount":0.1234567890123456789/);
      assert.match(response.body, /"text":"18446744073709551615"/);
      assert.equal(JSON.parse(response.body).id, id);
    }
    assert.equal(calls, 1);
  } finally {
    await app.close();
    globalThis.fetch = original;
  }
});

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

test("confirmation bypasses queued scans while scans remain rate bounded", async () => {
  const original = globalThis.fetch;
  const calls: Array<{ method: string; at: number }> = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ method: body.method, at: Date.now() });
    return Response.json({ jsonrpc: "2.0", id: body.id, result: null });
  };
  try {
    const relay = new RpcTransport("https://rpc.example.test", 100);
    const requests = [1, 2, 3].map((id) =>
      relay.request({
        jsonrpc: "2.0",
        id,
        method: "getProgramAccounts",
        params: [String(id)],
      }),
    );
    await sleep(1);
    requests.push(
      relay.request({
        jsonrpc: "2.0",
        id: 4,
        method: "getSignatureStatuses",
        params: [["signature"]],
      }),
    );
    await Promise.all(requests);
    assert.deepEqual(
      calls.map((call) => call.method),
      [
        "getProgramAccounts",
        "getSignatureStatuses",
        "getProgramAccounts",
        "getProgramAccounts",
      ],
    );
    const scans = calls.filter((call) => call.method === "getProgramAccounts");
    assert.ok(scans[1].at - scans[0].at >= 490);
    assert.ok(scans[2].at - scans[1].at >= 490);
  } finally {
    globalThis.fetch = original;
  }
});

test("aborted readers do not cancel shared reads and abandoned queued work never reaches the provider", async () => {
  const original = globalThis.fetch;
  const calls: number[] = [];
  let finish!: () => void;
  const blocked = new Promise<void>((resolve) => {
    finish = resolve;
  });
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body.id);
    if (body.id === 1) await blocked;
    return Response.json({ jsonrpc: "2.0", id: body.id, result: "ok" });
  };
  try {
    const relay = new RpcTransport("https://rpc.example.test", 10);
    const first = new AbortController();
    const request = {
      jsonrpc: "2.0",
      method: "getAccountInfo",
      params: ["shared"],
    };
    const a = relay.request({ ...request, id: 1 }, first.signal);
    const rejected = assert.rejects(a, /abort/i);
    const b = relay.request({ ...request, id: 2 });
    first.abort();
    await rejected;
    const abandoned = new AbortController();
    const c = relay.request(
      { ...request, id: 3, params: ["abandoned"] },
      abandoned.signal,
    );
    const cancelled = assert.rejects(c, /abort/i);
    abandoned.abort();
    await cancelled;
    finish();
    assert.equal((await b).id, 2);
    await sleep(120);
    assert.deepEqual(calls, [1]);
    assert.equal(
      (await relay.request({ ...request, id: 4, params: ["abandoned"] }))
        .result,
      "ok",
    );
    assert.deepEqual(calls, [1, 4]);
  } finally {
    finish();
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

test("connection failures retry the same signed payload and submissions invalidate account snapshots", async () => {
  const original = globalThis.fetch;
  const bodies: Array<{ id: number; method: string; params: unknown[] }> = [];
  let failed = false;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (body.method === "sendTransaction" && !failed) {
      failed = true;
      throw new TypeError("fetch failed");
    }
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: bodies.length,
    });
  };
  try {
    const relay = new RpcTransport("https://rpc.example.test", 100);
    const read = {
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: ["account"],
    };
    const before = await relay.request(read);
    await relay.request({
      jsonrpc: "2.0",
      id: 2,
      method: "sendTransaction",
      params: ["signed-bytes"],
    });
    assert.deepEqual(bodies[1], bodies[2]);
    assert.notEqual((await relay.request(read)).result, before.result);
    assert.equal(bodies.length, 4);
  } finally {
    globalThis.fetch = original;
  }
});

test("RPC failover verifies the network, preserves signed bytes and avoids retrying a failing primary during cooldown", async () => {
  const original = globalThis.fetch;
  const primary: unknown[] = [];
  const backup: Array<{
    id: number | string;
    method: string;
    params?: unknown[];
  }> = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).includes("primary")) {
      primary.push(body);
      throw Object.assign(new Error("Connection refused"), {
        code: "ConnectionRefused",
      });
    }
    backup.push(body);
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: body.method === "getGenesisHash" ? "devnet" : "signature",
    });
  };
  try {
    const relay = new RpcTransport("https://primary.example", 100, {
      url: "https://backup.example",
      genesis: "devnet",
    });
    const send = {
      jsonrpc: "2.0",
      id: 7,
      method: "sendTransaction",
      params: ["signed-bytes", { skipPreflight: false }],
    };
    assert.equal((await relay.request(send)).result, "signature");
    assert.equal(primary.length, 2);
    assert.deepEqual(primary[0], primary[1]);
    assert.deepEqual(backup[1], send);
    assert.equal((await relay.request({ ...send, id: 8 })).id, 8);
    assert.equal(primary.length, 2);
    assert.deepEqual(backup[2], { ...send, id: 8 });
  } finally {
    globalThis.fetch = original;
  }
});

test("a fallback on the wrong network never receives a transaction", async () => {
  const original = globalThis.fetch;
  const backup: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("primary"))
      return new Response("unavailable", { status: 503 });
    const body = JSON.parse(String(init?.body));
    backup.push(body.method);
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: "wrong-network",
    });
  };
  try {
    const relay = new RpcTransport("https://primary.example", 100, {
      url: "https://backup.example",
      genesis: "devnet",
    });
    await assert.rejects(
      relay.request({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: ["signed-bytes"],
      }),
      /genesis does not match/,
    );
    assert.deepEqual(backup, ["getGenesisHash"]);
  } finally {
    globalThis.fetch = original;
  }
});
