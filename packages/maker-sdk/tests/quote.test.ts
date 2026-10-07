import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID, marketAccountAddress } from "@depth/bindings";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { MakerClient } from "@/client/client";
import { QuoteHandle } from "@/quote/quote";

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
        "hex"
      ),
    ],
    DEPTH_PROGRAM_ID
  )[0];
  const id = PublicKey.findProgramAddressSync(
    [
      Buffer.from("quote"),
      market.toBuffer(),
      wallet.publicKey.toBuffer(),
      nonce.toArrayLike(Buffer, "le", 8),
    ],
    DEPTH_PROGRAM_ID
  )[0];
  let requestedFilters: unknown;
  const connection = new Connection("http://127.0.0.1:8899");
  connection.getProgramAccounts = (async (
    _program: PublicKey,
    config: Parameters<Connection["getProgramAccounts"]>[1]
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
    }),
    requestQuoteView: async () => ({
      wait: async () => ({ status: "ready", remainingCapacity: 750n }),
      close: async () => "close-signature",
    }),
    read: async (name: string) =>
      name === "MarketAccount"
        ? { status: { [makerReady ? "ready" : "trading"]: {} } }
        : name === "Market"
        ? {
            activeQuoteCount: 0,
            pendingOrders: 0,
            quotedNotional: new anchor.BN(0),
            config: { maxMarketNotional: new anchor.BN(10_000) },
          }
        : { market: marketAddress, count: 0, entries: [] },
    queue: async () => ({}),
    program: {
      methods: {
        reserveQuote: () => ({
          accountsPartial: () => ({
            remainingAccounts: () => ({
              rpc: async () => {
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
  const reserved = await handle.activate({ timeoutMs: 0 });
  assert.equal(reserved.status, "reserving");
  assert.equal(handle.reserveSignature, "reserve-signature");
  assert.equal(submitted, 1);
  status = "active";
  assert.equal((await handle.wait({ timeoutMs: 0 })).status, "active");
  assert.equal(
    (await handle.confirm({ timeoutMs: 0 })).quoteId.toBase58(),
    id.toBase58()
  );
  assert.equal(await handle.capacity(), 750n);
});

test("flat quotes use published tiers within capacity", () => {
  const client = Object.create(MakerClient.prototype) as {
    flatQuote: (
      input: Record<string, unknown>,
      market: Record<string, unknown>,
      nonce: bigint
    ) => {
      tiers: Array<{ size: bigint; bidE8: bigint; askE8: bigint }>;
      expiresAt: number;
    };
  };
  const market = {
    config: {
      quoteTiers: [1_000, 10_000, 100_000, 1_000_000].map(
        (value) => new anchor.BN(value)
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
  const quote = client.flatQuote(input, market, 9n);
  assert.deepEqual(
    quote.tiers.map((tier) => tier.size),
    [1_000n, 10_000n, 100_000n]
  );
  assert.ok(quote.tiers.every((tier) => tier.bidE8 === input.bidE8));
  assert.ok(quote.expiresAt > Math.floor(Date.now() / 1_000));
  assert.throws(
    () => client.flatQuote({ ...input, maxCapacity: 999n }, market, 9n),
    /below the first quote tier/
  );
  assert.throws(
    () => client.flatQuote({ ...input, validForSeconds: 121 }, market, 9n),
    /outside market policy/
  );
});

test("draft market accepts the initial quote required for activation", () => {
  const client = Object.create(MakerClient.prototype) as {
    validateQuote: (
      input: Record<string, unknown>,
      market: Record<string, unknown>
    ) => void;
  };
  const now = Math.floor(Date.now() / 1_000);
  const quote = {
    tiers: [{ size: 100_000_000n, bidE8: 19_900_000_000n, askE8: 20_100_000_000n }],
    maxCapacity: 100_000_000n,
    expiresAt: now + 60,
  };
  const market = {
    status: { draft: {} },
    oracleTimestamp: new anchor.BN(now),
    config: {
      quoteTiers: [new anchor.BN(100_000_000)],
      maxAccountNotional: new anchor.BN(1_000_000_000),
      maxMarketNotional: new anchor.BN(10_000_000_000),
      maxQuoteLifetimeSeconds: 3_600,
      maxOracleAgeSeconds: 300,
    },
  };
  assert.doesNotThrow(() => client.validateQuote(quote, market));
  assert.doesNotThrow(() =>
    client.validateQuote(quote, { ...market, status: { active: {} } })
  );
  assert.throws(
    () => client.validateQuote(quote, { ...market, status: { paused: {} } }),
    /does not accept quotes/
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
      attachedOrders: 0,
    }),
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
