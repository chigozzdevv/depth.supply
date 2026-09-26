import { BorshAccountsCoder, type Idl } from "@anchor-lang/core";
import { DEPTH_IDL, DEPTH_PROGRAM_ID, marketAddress } from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";
import { ChainReader } from "@/chain";
import { createServer } from "@/http";

test("public quote projection cannot expose encrypted prices", async () => {
  const reader = new ChainReader({} as Connection);
  Object.assign(reader, {
    account: async () => ({
      slot: 42,
      value: {
        maker: PublicKey.unique(),
        operator: PublicKey.unique(),
        market: marketAddress(),
        status: { active: {} },
        capacity: { toString: () => "1000" },
        remainingCapacity: { toString: () => "500" },
        tierCount: 1,
        expiry: { toString: () => "200" },
        ciphertexts: [[1, 2, 3]],
        bid: "private",
        ask: "private",
      },
    }),
  });
  const quote = await reader.quote(PublicKey.unique());
  assert.equal(quote?.capacity, "1000");
  assert.equal(quote?.slot, 42);
  assert.doesNotMatch(JSON.stringify(quote), /ciphertexts|private|bid|ask/);
});

test("market projection identifies the pending onchain workflow", async () => {
  const order = PublicKey.unique();
  const reader = new ChainReader({} as Connection);
  Object.assign(reader, {
    account: async () => ({
      slot: 82,
      value: {
        status: { active: {} },
        revision: { toString: () => "3" },
        settlementMint: PublicKey.unique(),
        oraclePriceE8: { toString: () => "20000000000" },
        oracleTimestamp: { toString: () => "100" },
        fundingIndex: { toString: () => "0" },
        pendingOrder: order,
        config: {
          tradeFeeBps: 5,
          insuranceFeeBps: 1,
          initialMarginBps: 1_000,
          maintenanceMarginBps: 500,
        },
      },
    }),
  });
  const market = await reader.market();
  assert.equal(market?.pending_order, order.toBase58());
  assert.equal(market?.slot, 82);
});

test("operation status is read from the program account", async () => {
  const coder = new BorshAccountsCoder(DEPTH_IDL as Idl);
  const discriminator = coder.accountDiscriminator("OrderRecord");
  const connection = {
    getAccountInfoAndContext: async () => ({
      context: { slot: 77 },
      value: {
        owner: DEPTH_PROGRAM_ID,
        data: Buffer.concat([discriminator, Buffer.alloc(16)]),
      },
    }),
  } as unknown as Connection;
  const reader = new ChainReader(connection);
  Object.assign(reader, {
    coder: {
      accountDiscriminator: (name: string) => coder.accountDiscriminator(name),
      decode: () => ({
        kind: { trade: {} },
        status: { filled: {} },
        trader: PublicKey.unique(),
        planCiphertexts: [[1, 2, 3]],
      }),
    },
  });
  const operation = await reader.operation(PublicKey.unique());
  assert.equal(operation?.status, "finalized");
  assert.equal(operation?.outcome, "filled");
  assert.equal(operation?.slot, 77);
  assert.doesNotMatch(JSON.stringify(operation), /planCiphertexts/);
});

test("HTTP routes return public chain snapshots and reject invalid identifiers", async () => {
  const reader = {
    market: async () => undefined,
    quote: async () => undefined,
    app: async () => undefined,
    operation: async () => undefined,
  } as unknown as ChainReader;
  const server = createServer(reader);
  const request = (method: string, url: string) =>
    new Promise<{ status: number; body: unknown }>((resolve) => {
      let status = 0;
      server.emit(
        "request",
        { method, url } as IncomingMessage,
        {
          writeHead(code: number) {
            status = code;
          },
          end(body: string) {
            resolve({ status, body: JSON.parse(body) });
          },
        } as ServerResponse
      );
    });
  assert.deepEqual(await request("GET", "/v1/markets"), {
    status: 200,
    body: { markets: [] },
  });
  assert.equal((await request("GET", "/v1/quotes/invalid")).status, 400);
  assert.equal((await request("GET", "/v1/markets/BTC-USD")).status, 404);
  assert.equal((await request("POST", "/v1/markets")).status, 405);
});
