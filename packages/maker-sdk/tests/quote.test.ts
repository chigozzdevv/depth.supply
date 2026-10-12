import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID, marketAccountAddress } from "@depthhq/bindings";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { MakerClient, retryQuote } from "@/client/client";
import { QuoteHandle } from "@/quote/quote";

test("quote admission retries only a rejected maker-state race within its deadline", async () => {
  const race = anchor.AnchorError.parse([
    "Program log: AnchorError thrown in programs/depth/src/instructions/quote.rs:188. Error Code: WrongMarketAccountStatus. Error Number: 6038. Error Message: The market account is in the wrong state.",
  ])!;
  assert.ok(race);
  let attempts = 0;
  const result = await retryQuote(async () => {
    if (++attempts === 1) throw race;
    return "quote";
  }, Date.now() + 10_000);
  assert.equal(result, "quote");
  assert.equal(attempts, 2);
  attempts = 0;
  const unknown = new Error("Unknown transaction outcome");
  await assert.rejects(
    retryQuote(async () => {
      attempts++;
      throw unknown;
    }, Date.now() + 10_000),
    (error) => error === unknown,
  );
  assert.equal(attempts, 1);
  await assert.rejects(
    retryQuote(async () => {
      throw race;
    }, Date.now() - 1),
    (error) => error === race,
  );
});

test("maker position handle initializes for the owner", () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const constructor = MakerClient as unknown as new (options: {
    wallet: anchor.Wallet;
    maker: PublicKey;
    connection: Connection;
    deployment: { localnet: true };
  }) => MakerClient;
  const client = new constructor({
    wallet,
    maker: wallet.publicKey,
    connection: new Connection("http://127.0.0.1:8899"),
    deployment: { localnet: true },
  });
  assert.ok(client.position.id.equals(marketAccountAddress(wallet.publicKey)));
});

test("maker discovers an interrupted quote from its canonical onchain record", async () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const nonce = new anchor.BN(17);
  const market = PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      Buffer.from(
        "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
        "hex",
      ),
    ],
    DEPTH_PROGRAM_ID,
  )[0];
  const id = PublicKey.findProgramAddressSync(
    [
      Buffer.from("quote"),
      market.toBuffer(),
      wallet.publicKey.toBuffer(),
      nonce.toArrayLike(Buffer, "le", 8),
    ],
    DEPTH_PROGRAM_ID,
  )[0];
  let requestedFilters: unknown;
  const connection = new Connection("http://127.0.0.1:8899");
  connection.getProgramAccounts = (async (
    _program: PublicKey,
    config: Parameters<Connection["getProgramAccounts"]>[1],
  ) => {
    requestedFilters = typeof config === "object" ? config.filters : undefined;
    return [{ pubkey: id, account: { data: Buffer.alloc(0) } }];
  }) as unknown as Connection["getProgramAccounts"];
  connection.getMultipleAccountsInfo = (async () => [
    {
      owner: DEPTH_PROGRAM_ID,
      data: Buffer.alloc(1),
      executable: false,
      lamports: 1,
      rentEpoch: 0,
    },
  ]) as unknown as Connection["getMultipleAccountsInfo"];
  const constructor = MakerClient as unknown as new (options: {
    wallet: anchor.Wallet;
    maker: PublicKey;
    connection: Connection;
    deployment: { localnet: true };
  }) => MakerClient;
  const client = new constructor({
    wallet,
    maker: wallet.publicKey,
    connection,
    deployment: { localnet: true },
  });
  client.program.coder.accounts.decode = (() => ({
    maker: wallet.publicKey,
    market,
    nonce,
    status: { validating: {} },
  })) as typeof client.program.coder.accounts.decode;
  const page = await client.quote.list();
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].nonce, 17n);
  assert.equal(page.items[0].status, "validating");
  assert.ok(page.items[0].handle.id.equals(id));
  assert.equal((requestedFilters as unknown[]).length, 3);
});

test("quote activation waits for private validation and stays pending until reserve callback", async () => {
  const maker = PublicKey.unique();
  const id = PublicKey.unique();
  const marketAddress = PublicKey.unique();
  let status = "validating";
  let makerReady = false;
  let submitted = 0;
  let raced = false;
  const now = Math.floor(Date.now() / 1000);
  const client = {
    options: { maker, wallet: { publicKey: maker } },
    marketAddress,
    quoteQueueAddress: PublicKey.unique(),
    protocolAddress: PublicKey.unique(),
    marketAccount: () => PublicKey.unique(),
    quoteState: async () => ({
      status: { [status]: {} },
      capacity: new anchor.BN(1_000),
      attachedOrders: 0,
      marketRevision: new anchor.BN(1),
      oracleTimestamp: new anchor.BN(now),
      oracleReferenceE8: new anchor.BN(10_000),
      expiry: new anchor.BN(now + 120),
    }),
    requestQuoteView: async () => ({
      wait: async () => ({ status: "ready", remainingCapacity: 750n }),
      deferClose: async () => {},
    }),
    read: async (name: string) =>
      name === "MarketAccount"
        ? { status: { [makerReady ? "ready" : "trading"]: {} } }
        : name === "Market"
          ? {
              revision: new anchor.BN(1),
              oracleTimestamp: new anchor.BN(now + 1),
              oraclePriceE8: new anchor.BN(10_010),
              activeQuoteCount: 0,
              pendingOrders: 0,
              quotedNotional: new anchor.BN(0),
              config: {
                maxMarketNotional: new anchor.BN(10_000),
                maxQuoteDeviationBps: 200,
              },
            }
          : { market: marketAddress, count: 0, entries: [] },
    queue: async () => ({}),
    program: {
      methods: {
        reserveQuote: () => ({
          accountsPartial: () => ({
            remainingAccounts: () => ({
              rpc: async () => {
                if (raced)
                  throw { error: { errorCode: { code: "WrongOrderStatus" } } };
                submitted += 1;
                status = "reserving";
                return "reserve-signature";
              },
            }),
          }),
        }),
      },
    },
  } as unknown as MakerClient;
  const handle = new QuoteHandle(id, "prepare-signature", client);
  const pending = await handle.activate({ timeoutMs: 0 });
  assert.equal(pending.status, "validating");
  assert.equal(submitted, 0);
  status = "validated";
  assert.equal((await handle.activate({ timeoutMs: 0 })).status, "validated");
  assert.equal(submitted, 0);
  makerReady = true;
  raced = true;
  assert.equal((await handle.activate({ timeoutMs: 0 })).status, "validated");
  assert.equal(submitted, 0);
  raced = false;
  const reserved = await handle.activate({ timeoutMs: 0 });
  assert.equal(reserved.status, "reserving");
  assert.equal(handle.reserveSignature, "reserve-signature");
  assert.equal(submitted, 1);
  status = "active";
  assert.equal((await handle.wait({ timeoutMs: 0 })).status, "active");
  assert.equal(
    (await handle.confirm({ timeoutMs: 0 })).quoteId.toBase58(),
    id.toBase58(),
  );
  assert.equal(await handle.capacity(), 750n);
});

test("flat quotes use published tiers within capacity", () => {
  const client = Object.create(MakerClient.prototype) as {
    flatQuote: (
      input: Record<string, unknown>,
      market: Record<string, unknown>,
      nonce: bigint,
      now: number,
    ) => {
      tiers: Array<{ size: bigint; bidE8: bigint; askE8: bigint }>;
      expiresAt: number;
    };
  };
  const market = {
    config: {
      quoteTiers: [1_000, 10_000, 100_000, 1_000_000].map(
        (value) => new anchor.BN(value),
      ),
      maxQuoteLifetimeSeconds: 120,
    },
  };
  const input = {
    marketId: "SOL-USD",
    bidE8: 19_900_000_000n,
    askE8: 20_100_000_000n,
    maxCapacity: 100_000n,
    validForSeconds: 30,
  };
  const quote = client.flatQuote(input, market, 9n, 1000);
  assert.equal(quote.expiresAt, 1030);
  assert.deepEqual(
    quote.tiers.map((tier) => tier.size),
    [1_000n, 10_000n, 100_000n],
  );
  assert.deepEqual(
    client
      .flatQuote({ ...input, maxCapacity: 99_000n }, market, 10n, 1000)
      .tiers.map((tier) => tier.size),
    [1_000n, 10_000n, 100_000n],
  );
  assert.ok(quote.tiers.every((tier) => tier.bidE8 === input.bidE8));
  assert.throws(
    () => client.flatQuote({ ...input, maxCapacity: 999n }, market, 9n, 1000),
    /below the first quote tier/,
  );
  assert.throws(
    () =>
      client.flatQuote({ ...input, validForSeconds: 121 }, market, 9n, 1000),
    /outside market policy/,
  );
});

test("renewal respects the chain lifetime ceiling when the local clock is ahead", async () => {
  const maker = PublicKey.unique();
  const time = Math.floor(Date.now() / 1000) - 5;
  const data = Buffer.alloc(40);
  data.writeBigInt64LE(BigInt(time), 32);
  let expiry = time + 50;
  let owner = new PublicKey("Sysvar1111111111111111111111111111111111111");
  const client = {
    options: {
      maker,
      wallet: { publicKey: maker },
      connection: {
        getAccountInfo: async (address: PublicKey) => {
          assert.ok(address.equals(SYSVAR_CLOCK_PUBKEY));
          return { owner, data };
        },
      },
    },
    read: async () => ({ config: { maxQuoteLifetimeSeconds: 120 } }),
    quoteState: async () => ({
      status: { active: {} },
      capacity: new anchor.BN(1),
      attachedOrders: 0,
      expiry: new anchor.BN(expiry),
      replacementNonce: null,
    }),
    program: {
      programId: DEPTH_PROGRAM_ID,
      methods: {
        renewQuote: (value: anchor.BN) => ({
          accountsPartial: () => ({
            rpc: async () => {
              assert.ok(value.toNumber() - time <= 120);
              expiry = value.toNumber();
              return "renew-signature";
            },
          }),
        }),
      },
    },
  } as unknown as MakerClient;
  const handle = new QuoteHandle(PublicKey.unique(), undefined, client);
  assert.equal(
    (await handle.renew({ validForSeconds: 120 })).expiresAt,
    time + 120,
  );
  owner = DEPTH_PROGRAM_ID;
  await assert.rejects(
    handle.renew({ validForSeconds: 120 }),
    /clock sysvar is unavailable/,
  );
});

test("draft market accepts the initial quote required for activation", () => {
  const client = Object.create(MakerClient.prototype) as {
    validateQuote: (
      input: Record<string, unknown>,
      market: Record<string, unknown>,
      now: number,
    ) => void;
  };
  const now = Math.floor(Date.now() / 1_000);
  const quote = {
    tiers: [
      { size: 100_000_000n, bidE8: 19_900_000_000n, askE8: 20_100_000_000n },
    ],
    maxCapacity: 100_000_000n,
    expiresAt: now + 60,
  };
  const market = {
    status: { draft: {} },
    oracleTimestamp: new anchor.BN(now),
    oraclePriceE8: new anchor.BN(20_000_000_000),
    config: {
      quoteTiers: [new anchor.BN(100_000_000)],
      maxAccountNotional: new anchor.BN(1_000_000_000),
      maxMarketNotional: new anchor.BN(10_000_000_000),
      maxQuoteLifetimeSeconds: 3_600,
      maxOracleAgeSeconds: 300,
      maxQuoteDeviationBps: 200,
    },
  };
  assert.doesNotThrow(() => client.validateQuote(quote, market, now));
  assert.doesNotThrow(() =>
    client.validateQuote(quote, { ...market, status: { active: {} } }, now),
  );
  assert.throws(
    () =>
      client.validateQuote(quote, { ...market, status: { paused: {} } }, now),
    /does not accept quotes/,
  );
});

test("cancellation stops selection before releasing reserved margin", async () => {
  const maker = PublicKey.unique();
  const id = PublicKey.unique();
  let status = "active";
  const calls: string[] = [];
  const client = {
    options: { maker, wallet: { publicKey: maker } },
    marketAddress: PublicKey.unique(),
    protocolAddress: PublicKey.unique(),
    marketAccount: () => PublicKey.unique(),
    quoteState: async () => ({
      status: { [status]: {} },
      capacity: new anchor.BN(1_000),
      expiry: new anchor.BN(2_000_000_000),
      attachedOrders: 0,
    }),
    read: async (name: string) =>
      name === "Market" ? { pendingOrders: 0 } : { status: { ready: {} } },
    queue: async () => ({}),
    program: {
      methods: {
        stopQuote: () => ({
          accountsPartial: () => ({
            rpc: async () => {
              calls.push("stop");
              status = "closing";
              return "stop-signature";
            },
          }),
        }),
        releaseQuote: () => ({
          accountsPartial: () => ({
            rpc: async () => {
              calls.push("release");
              status = "releasing";
              return "release-signature";
            },
          }),
        }),
      },
    },
  } as unknown as MakerClient;
  const handle = new QuoteHandle(id, undefined, client);
  const pending = await handle.cancel();
  assert.deepEqual(calls, ["stop", "release"]);
  assert.equal(pending.status, "releasing");
  assert.equal(handle.releaseSignature, "release-signature");
});

test("cancellation reconciles a keeper release and repeated calls", async () => {
  const maker = PublicKey.unique();
  let status = "closing";
  let releases = 0;
  const client = {
    options: { maker, wallet: { publicKey: maker } },
    marketAddress: PublicKey.unique(),
    protocolAddress: PublicKey.unique(),
    marketAccount: () => PublicKey.unique(),
    quoteState: async () => ({
      status: { [status]: {} },
      capacity: new anchor.BN(1_000),
      expiry: new anchor.BN(2_000_000_000),
      attachedOrders: 0,
    }),
    read: async (name: string) =>
      name === "Market" ? { pendingOrders: 0 } : { status: { ready: {} } },
    queue: async () => ({}),
    program: {
      methods: {
        releaseQuote: () => ({
          accountsPartial: () => ({
            rpc: async () => {
              releases += 1;
              status = "releasing";
              throw new Error("The quote is in the wrong state");
            },
          }),
        }),
      },
    },
  } as unknown as MakerClient;
  const handle = new QuoteHandle(PublicKey.unique(), undefined, client);
  assert.equal((await handle.cancel()).status, "releasing");
  assert.equal((await handle.cancel()).status, "releasing");
  status = "cancelled";
  assert.equal((await handle.cancel()).status, "cancelled");
  assert.equal(releases, 1);
});

test("only the owner or original payer can reclaim a terminal quote without attached orders", async () => {
  const maker = PublicKey.unique();
  const operator = PublicKey.unique();
  let actor = PublicKey.unique();
  let status = "cancelled";
  let attachedOrders = 0;
  let closes = 0;
  const client = {
    options: {
      maker,
      wallet: {
        get publicKey() {
          return actor;
        },
      },
    },
    quoteState: async () => ({
      operator,
      status: { [status]: {} },
      capacity: new anchor.BN(1_000),
      expiry: new anchor.BN(2_000_000_000),
      attachedOrders,
    }),
    program: {
      methods: {
        closeOperatorQuote: () => ({
          accountsPartial: (accounts: { operator: PublicKey }) => ({
            rpc: async () => {
              assert.ok(accounts.operator.equals(operator));
              closes += 1;
              return "operator-close-signature";
            },
          }),
        }),
        closeQuote: () => ({
          accountsPartial: () => ({
            rpc: async () => {
              closes += 1;
              return "close-signature";
            },
          }),
        }),
      },
    },
  } as unknown as MakerClient;
  const handle = new QuoteHandle(PublicKey.unique(), undefined, client);
  await assert.rejects(
    () => handle.close(),
    /Only the maker or original payer/,
  );
  actor = maker;
  status = "active";
  await assert.rejects(() => handle.close(), /settle its orders/);
  status = "cancelled";
  attachedOrders = 1;
  await assert.rejects(() => handle.close(), /settle its orders/);
  attachedOrders = 0;
  assert.equal(await handle.close(), "close-signature");
  assert.equal(closes, 1);
  actor = operator;
  assert.equal(await handle.close(), "operator-close-signature");
  assert.equal(closes, 2);
});

test("delegated nonblocking inventory reads reuse their pending request and close completed views", async () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const constructor = MakerClient as unknown as new (
    options: unknown,
  ) => MakerClient;
  const client = new constructor({
    wallet,
    maker: PublicKey.unique(),
    connection: new Connection("http://127.0.0.1:8899"),
    deployment: { localnet: true },
  });
  let requests = 0;
  let reads = 0;
  let closes = 0;
  client.requestMarketView = async () => {
    requests++;
    return {
      wait: async () => ({
        status: ++reads === 1 ? "pending" : "ready",
        version: 1n,
      }),
      deferClose: async () => {
        closes++;
      },
    } as unknown as Awaited<ReturnType<MakerClient["requestMarketView"]>>;
  };
  assert.equal(
    (await client.position.summary({ timeoutMs: 0 })).status,
    "pending",
  );
  assert.equal(
    (await client.position.summary({ timeoutMs: 0 })).status,
    "ready",
  );
  assert.equal(requests, 1);
  assert.equal(closes, 1);
});
