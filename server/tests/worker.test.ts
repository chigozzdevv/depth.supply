import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { SOL_USD_FEED_ID } from "@depthhq/bindings";
import assert from "node:assert/strict";
import { test } from "node:test";
import { OracleService } from "@/features/oracle/oracle.service";
import { RiskService } from "@/features/risk/risk.service";
import { FeeService } from "@/features/fee/fee.service";
import { QuoteWorker } from "@/features/quote/quote.worker";
import type { ChainSigner } from "@/shared/chain/chain.signer";

const integer = (n: number) => ({
  toNumber: () => n,
  toString: () => String(n),
});

test("oracle updates respect the settlement lock and reject unverified feeds", async () => {
  const data = Buffer.alloc(134);
  Buffer.from("22f123639d7ef4cd", "hex").copy(data);
  data[40] = 1;
  SOL_USD_FEED_ID.copy(data, 41);
  data.writeBigInt64LE(100n, 93);
  let pendingOrders = 1;
  let timestamp = 99;
  let calls = 0;
  let blockedSnapshot: string | undefined;
  let expiredSnapshot = false;
  const priceAccount = PublicKey.unique();
  const marketAddress = PublicKey.unique();
  let marketOracle = priceAccount;
  const chain = {
    market: marketAddress,
    read: async () => ({
      pendingOrders,
      status: { active: {} },
      oracleAccount: marketOracle,
      oracleTimestamp: integer(timestamp),
    }),
    connection: {
      getAccountInfo: async () => ({
        owner: new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"),
        data,
      }),
      getProgramAccounts: async (
        _program: PublicKey,
        options: {
          filters: Array<{ memcmp: { bytes: string } }>;
        },
      ) => {
        const deadline = Buffer.alloc(8);
        deadline.writeBigInt64LE(
          BigInt(Math.floor(Date.now() / 1_000) + (expiredSnapshot ? -1 : 60)),
        );
        return options.filters[0].memcmp.bytes === blockedSnapshot
          ? [{ pubkey: PublicKey.unique(), account: { data: deadline } }]
          : [];
      },
    },
    program: {
      coder: {
        accounts: { memcmp: (name: string) => ({ offset: 0, bytes: name }) },
      },
      methods: {
        refreshOracle: () => ({
          accountsPartial: () => ({
            rpc: async () => {
              calls++;
              return "oracle-signature";
            },
          }),
        }),
      },
    },
  } as unknown as ChainSigner;
  const service = new OracleService(chain, priceAccount);
  assert.equal(await service.advance(), undefined);
  assert.equal(service.deferred, true);
  pendingOrders = 0;
  marketOracle = PublicKey.unique();
  await assert.rejects(service.advance(), /does not match the market oracle/);
  marketOracle = priceAccount;
  assert.equal(await service.advance(), "oracle-signature");
  assert.equal(service.deferred, false);
  timestamp = 100;
  assert.equal(await service.advance(), undefined);
  data.writeBigInt64LE(101n, 93);
  for (const name of ["quoteRecord", "marginTransfer", "backstopOffer"]) {
    blockedSnapshot = name;
    assert.equal(await service.advance(), undefined);
  }
  blockedSnapshot = "quoteRecord";
  expiredSnapshot = true;
  assert.equal(await service.advance(), "oracle-signature");
  data[40] = 0;
  await assert.rejects(service.advance(), /verified SOL/);
  assert.equal(calls, 2);
});

test("risk checks skip an already checked account and submit one eligible target", async () => {
  const market = PublicKey.unique();
  const target = PublicKey.unique();
  const maker = PublicKey.unique();
  const now = Math.floor(Date.now() / 1000);
  let lastCheck = now;
  let submissions = 0;
  const chain = {
    market,
    clearing: PublicKey.unique(),
    wallet: { publicKey: PublicKey.unique() },
    read: async (name: string, address: PublicKey) => {
      if (name === "Market")
        return {
          pendingOrders: 0,
          status: { active: {} },
          backstopOffer: maker,
          oracleTimestamp: integer(now),
          config: { maxOracleAgeSeconds: 100, maxOrderQueueSeconds: 30 },
        };
      if (name === "BackstopOffer")
        return {
          maker,
          market,
          status: { active: {} },
          expiry: integer(now + 60),
        };
      if (name === "ClearingAccount") return { status: { ready: {} } };
      return {
        owner: address.equals(target) ? target : maker,
        market,
        status: { ready: {} },
        lastLiquidationTimestamp: integer(lastCheck),
      };
    },
    queue: async () => ({}),
    program: {
      programId: PublicKey.unique(),
      methods: {
        liquidate: () => ({
          accountsPartial: (accounts: any) => ({
            rpc: async () => {
              assert.ok(accounts.trade.targetAccount.equals(target));
              submissions++;
              return "risk-signature";
            },
          }),
        }),
      },
    },
  } as unknown as ChainSigner;
  const service = new RiskService(chain);
  (service as any).scan = {
    next: async () => [{ address: target, state: {} }],
  };
  assert.equal(await service.advance(), undefined);
  lastCheck = now - 299;
  assert.equal(await service.advance(), undefined);
  lastCheck = now - 300;
  assert.equal(await service.advance(), "risk-signature");
  assert.equal(submissions, 1);
});

test("fee worker does not submit a claim until recipient balances exist", async () => {
  const market = PublicKey.unique();
  const chain = {
    market,
    read: async (name: string) =>
      name === "Market"
        ? { pendingOrders: 0, status: { active: {} } }
        : { authority: PublicKey.unique() },
    connection: { getAccountInfo: async () => null },
  } as unknown as ChainSigner;
  const service = new FeeService(chain);
  assert.equal(await service.advance(), undefined);
});

test("quote worker admits the waiting head only after market capacity is available", async () => {
  const market = PublicKey.unique();
  const active = PublicKey.unique();
  const waiting = PublicKey.unique();
  const maker = PublicKey.unique();
  const now = Math.floor(Date.now() / 1000);
  let pendingOrders = 1;
  let reserved = 0;
  const chain = {
    market,
    protocol: PublicKey.unique(),
    wallet: { publicKey: maker },
    read: async (name: string, id: PublicKey) => {
      if (name === "Market")
        return {
          pendingOrders,
          status: { active: {} },
          activeQuoteCount: 1,
          activeQuotes: [active],
          quotedNotional: new anchor.BN(1_000),
          revision: new anchor.BN(2),
          oracleTimestamp: new anchor.BN(now),
          oraclePriceE8: new anchor.BN(10000),
          config: {
            maxMarketNotional: new anchor.BN(2_000),
            maxQuoteDeviationBps: 200,
            maxOracleAgeSeconds: 300,
          },
        };
      if (name === "QuoteQueue")
        return {
          market,
          count: 1,
          entries: [waiting],
        };
      return {
        market,
        maker,
        operator: maker,
        status: { [id.equals(active) ? "active" : "waiting"]: {} },
        capacity: new anchor.BN(id.equals(active) ? 1_000 : 500),
        expiry: new anchor.BN(now + 60),
        marketRevision: new anchor.BN(2),
        oracleTimestamp: new anchor.BN(now),
        oracleReferenceE8: new anchor.BN(10000),
      };
    },
    queue: async () => ({}),
    program: {
      methods: {
        reserveQuote: () => ({
          accountsPartial: (accounts: { quote: PublicKey }) => ({
            remainingAccounts: (
              remaining: Array<{ pubkey: PublicKey; isWritable: boolean }>,
            ) => ({
              rpc: async () => {
                assert.ok(accounts.quote.equals(waiting));
                assert.equal(remaining.length, 1);
                assert.equal(remaining[0].isWritable, true);
                reserved++;
                return "reserve-signature";
              },
            }),
          }),
        }),
      },
    },
  } as unknown as ChainSigner;
  const worker = new QuoteWorker(chain);
  assert.equal(await worker.advance(), undefined);
  pendingOrders = 0;
  assert.deepEqual(await worker.advance(), {
    stage: "reserve_quote",
    signature: "reserve-signature",
  });
  assert.equal(reserved, 1);
});

test("quote worker releases closing collateral using the quote discriminator", async () => {
  const market = PublicKey.unique();
  const active = PublicKey.unique();
  const closing = PublicKey.unique();
  const maker = PublicKey.unique();
  let filters: unknown;
  const chain = {
    market,
    protocol: PublicKey.unique(),
    wallet: { publicKey: maker },
    read: async (name: string) =>
      name === "Market"
        ? {
            pendingOrders: 0,
            status: { active: {} },
            activeQuoteCount: 1,
            activeQuotes: [active],
            quotedNotional: new anchor.BN(1_000),
          }
        : name === "QuoteQueue"
          ? { market, count: 0, entries: [] }
          : {
              market,
              maker,
              status: { active: {} },
              capacity: new anchor.BN(500),
            },
    connection: {
      getProgramAccounts: async (
        _program: PublicKey,
        options: { filters: unknown },
      ) => {
        filters = options.filters;
        return [{ pubkey: closing, account: { data: Buffer.alloc(1) } }];
      },
    },
    queue: async () => ({}),
    program: {
      coder: {
        accounts: {
          memcmp: () => ({ offset: 0, bytes: "quote-discriminator" }),
          decode: () => ({
            market,
            maker,
            status: { closing: {} },
            attachedOrders: 0,
          }),
        },
      },
      methods: {
        releaseQuote: () => ({
          accountsPartial: (accounts: { quote: PublicKey }) => ({
            rpc: async () => {
              assert.ok(accounts.quote.equals(closing));
              return "release-signature";
            },
          }),
        }),
      },
    },
  } as unknown as ChainSigner;
  assert.deepEqual(await new QuoteWorker(chain).advance(), {
    stage: "release_quote",
    signature: "release-signature",
  });
  assert.equal(
    (filters as Array<{ memcmp: { bytes: string } }>)[0].memcmp.bytes,
    "quote-discriminator",
  );
  assert.equal(
    (filters as Array<{ memcmp: { bytes: string } }>)[1].memcmp.bytes,
    market.toBase58(),
  );
});
