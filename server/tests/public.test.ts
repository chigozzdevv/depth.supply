import { DEPTH_PROGRAM_ID, marketAddress } from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "@/app";
import { ChainClient } from "@/shared/chain/chain.client";
import { MarketService } from "@/features/market/market.service";
import { OperationService } from "@/features/operation/operation.service";
import { QuoteService } from "@/features/quote/quote.service";
import { RecoveryService } from "@/features/recovery/recovery.service";

function chainWithRead(
  read: (address: PublicKey, name: string) => Promise<unknown>
): ChainClient {
  const chain = new ChainClient({} as Connection);
  return Object.assign(chain, { read });
}

test("chain reader rejects an account owned by another program", async () => {
  const connection = {
    getAccountInfoAndContext: async () => ({
      context: { slot: 8 },
      value: { owner: PublicKey.unique(), data: Buffer.alloc(8) },
    }),
  } as unknown as Connection;
  const chain = new ChainClient(connection);
  await assert.rejects(chain.read(PublicKey.unique(), "Market"), /not owned/);
});

test("public quote projection contains no encrypted price fields", async () => {
  const chain = chainWithRead(async () => ({
    slot: 42,
    value: {
      maker: PublicKey.unique(),
      operator: PublicKey.unique(),
      market: marketAddress(),
      status: { active: {} },
      capacity: 1_000n,
      tierCount: 1,
      expiry: 200n,
      ciphertexts: [[1, 2, 3]],
      bid: "private",
      ask: "private",
    },
  }));
  const quote = await new QuoteService(chain).get(PublicKey.unique());
  assert.equal(quote?.capacity, "1000");
  assert.equal(quote?.slot, 42);
  assert.doesNotMatch(JSON.stringify(quote), /ciphertexts|private|bid|ask/);
});

test("market and recovery projections expose only public state", async () => {
  const order = PublicKey.unique();
  const signer = PublicKey.unique();
  const chain = chainWithRead(async (_address, name) => ({
    slot: 91,
    value:
      name === "Market"
        ? {
            status: { active: {} },
            incident: { none: {} },
            revision: 3n,
            settlementMint: PublicKey.unique(),
            oracleAccount: PublicKey.unique(),
            oraclePriceE8: 20_000_000_000n,
            oracleEmaE8: 19_900_000_000n,
            oracleConfidenceE8: 100_000_000n,
            oracleTimestamp: 100n,
            oracleSlot: 80n,
            fundingIndex: 0n,
            lastFundingTimestamp: 90n,
            activeQuoteCount: 0,
            activeQuotes: [],
            pendingOrder: order,
            config: {
              tradeFeeBps: 5,
              insuranceFeeBps: 1,
              initialMarginBps: 1_000,
              maintenanceMarginBps: 500,
              liquidationFeeBps: 100,
              maxAccountNotional: 10_000n,
              maxMarketNotional: 100_000n,
              maxOracleAgeSeconds: 30,
              maxConfidenceBps: 100,
              maxQuoteDeviationBps: 500,
              maxQuoteLifetimeSeconds: 60,
              maxOrderQueueSeconds: 60,
              fundingIntervalSeconds: 3_600,
              fundingRateCapBps: 100,
              quoteTiers: [100n, 200n, 500n, 1_000n],
              backstopMinCollateral: 1_000n,
            },
          }
        : name === "QuoteQueue"
        ? { market: marketAddress(), count: 0, entries: [] }
        : name === "RecoveryConfig"
        ? {
            market: marketAddress(),
            recoveryKey: new Array(32).fill(7),
            signers: new Array(5).fill(signer),
            accountCount: 2,
          }
        : {
            market: marketAddress(),
            priceE8: 20_000_000_000n,
            fundingIndex: 3n,
            expectedAccounts: 2,
            revealedAccounts: 1,
            paidAccounts: 0,
            grossPositive: 1_000n,
            payoutPool: 900n,
            remainingPool: 900n,
            finalized: false,
            recoveryPrivateKey: "must-not-leak",
          },
  }));
  const market = await new MarketService(chain).get();
  assert.equal(market?.pending_order, order.toBase58());
  assert.equal(market?.incident, "none");
  assert.deepEqual(market?.quote_tiers, ["100", "200", "500", "1000"]);
  assert.equal(market?.funding_interval_seconds, 3_600);
  assert.equal(market?.max_quote_deviation_bps, 500);
  const app = buildApp(chain, false);
  try {
    const response = await app.inject("/v1/markets/SOL-USD");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().quote_tiers, [
      "100",
      "200",
      "500",
      "1000",
    ]);
    assert.equal(response.json().max_account_notional, "10000");
  } finally {
    await app.close();
  }
  const recovery = new RecoveryService(chain);
  assert.equal((await recovery.config())?.threshold, 3);
  const winddown = await recovery.winddown();
  assert.equal(winddown?.revealed_accounts, 1);
  assert.doesNotMatch(JSON.stringify(winddown), /recoveryPrivateKey/);
});

test("operation projection preserves terminal outcomes and checks market identity", async () => {
  const trader = PublicKey.unique();
  const order = PublicKey.unique();
  let currentMarket = marketAddress();
  const chain = Object.assign(new ChainClient({} as Connection), {
    identify: async () => ({
      name: "OrderRecord",
      slot: 77,
      value: {
        kind: { trade: {} },
        status: { filled: {} },
        trader,
        market: currentMarket,
        planCiphertexts: [[1, 2, 3]],
      },
    }),
  });
  const service = new OperationService(chain);
  const result = await service.get(order);
  assert.equal(result?.status, "finalized");
  assert.equal(result?.outcome, "filled");
  assert.doesNotMatch(JSON.stringify(result), /planCiphertexts/);
  currentMarket = PublicKey.unique();
  await assert.rejects(service.get(order), /another market/);
});

test("Fastify routes validate identifiers and return chain snapshots", async () => {
  const chain = chainWithRead(async () => undefined);
  const app = buildApp(chain, false);
  try {
    assert.deepEqual((await app.inject("/v1/markets")).json(), { markets: [] });
    assert.equal((await app.inject("/v1/markets")).statusCode, 200);
    assert.equal((await app.inject("/v1/quotes/invalid")).statusCode, 400);
    assert.equal((await app.inject("/v1/markets/BTC-USD")).statusCode, 404);
    assert.equal(
      (await app.inject("/v1/markets/SOL-USD/winddown")).statusCode,
      404
    );
    assert.equal((await app.inject("/v1/quotes/%2F")).statusCode, 400);
    assert.equal(
      (await app.inject({ method: "HEAD", url: "/v1/markets" })).statusCode,
      200
    );
    assert.equal(
      (await app.inject({ method: "OPTIONS", url: "/v1/markets" })).statusCode,
      204
    );
    assert.equal(
      (await app.inject({ method: "POST", url: "/v1/markets" })).statusCode,
      404
    );
  } finally {
    await app.close();
  }
});

test("Fastify sends only the quote's public projection and masks RPC errors", async () => {
  const id = PublicKey.unique();
  let failing = false;
  const chain = chainWithRead(async () => {
    if (failing) throw new Error("private RPC diagnostic");
    return {
      slot: 22,
      value: {
        maker: PublicKey.unique(),
        operator: PublicKey.unique(),
        market: marketAddress(),
        status: { active: {} },
        capacity: 1_000n,
        tierCount: 1,
        expiry: 999n,
        ciphertexts: "must-not-leak",
      },
    };
  });
  const app = buildApp(chain, false);
  try {
    const response = await app.inject(`/v1/quotes/${id.toBase58()}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().capacity, "1000");
    assert.doesNotMatch(response.body, /ciphertexts|must-not-leak/);

    failing = true;
    const error = await app.inject(`/v1/quotes/${id.toBase58()}`);
    assert.equal(error.statusCode, 503);
    assert.deepEqual(error.json(), { error: "rpc_unavailable" });
    assert.doesNotMatch(error.body, /private RPC diagnostic/);
  } finally {
    await app.close();
  }
});

test("chain reader identifies only Depth account discriminators", async () => {
  const connection = {
    getAccountInfoAndContext: async () => ({
      context: { slot: 9 },
      value: { owner: DEPTH_PROGRAM_ID, data: Buffer.alloc(16) },
    }),
  } as unknown as Connection;
  const result = await new ChainClient(connection).identify(
    PublicKey.unique(),
    ["OrderRecord"]
  );
  assert.equal(result, undefined);
});
