import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { DEPTH_PROGRAM_ID, marketAddress } from "@depthhq/bindings";
import { MakerBot } from "@/bot/bot";
import { BotStore } from "@/bot/store";
import {
  botQuote,
  executionCosts,
  quoteHealth,
  validateBotPolicy,
  type BotMarket,
  type BotPolicy,
} from "@/bot/policy";
import type { MakerClient } from "@/client/client";
import type { QuoteInput } from "@/client/types";
import { HedgeEngine } from "@/hedge/engine";
import type { HedgeAdapter, HedgeOrder, HedgePolicy } from "@/hedge/types";

const policy: BotPolicy = {
  maxCapacity: 100_000_000n,
  maxInventoryNotional: 200_000_000n,
  spreadBps: 21,
  repriceBps: 10,
  lifetimeSeconds: 120,
  refreshSeconds: 60,
};
function market(): BotMarket {
  const now = Math.floor(Date.now() / 1000);
  return {
    revision: new anchor.BN(1),
    status: { active: {} },
    incident: { none: {} },
    oracleTimestamp: new anchor.BN(now),
    oraclePriceE8: new anchor.BN("10000000000"),
    fundingIndex: new anchor.BN(0),
    lastFundingTimestamp: new anchor.BN(now),
    pendingOrders: 0,
    activeQuoteCount: 1,
    quotedNotional: new anchor.BN(100_000_000),
    config: {
      quoteTiers: [10_000_000, 100_000_000, 1_000_000_000].map(
        (value) => new anchor.BN(value),
      ),
      initialMarginBps: 1000,
      maxAccountNotional: new anchor.BN("1000000000"),
      maxMarketNotional: new anchor.BN("10000000000"),
      maxQuoteLifetimeSeconds: 120,
      maxQuoteDeviationBps: 200,
      maxOracleAgeSeconds: 300,
      fundingIntervalSeconds: 3600,
    },
  } as unknown as BotMarket;
}
const position = {
  id: "position",
  status: "ready" as const,
  slot: 1,
  version: 0n,
  position: 0n,
  collateral: 10_000_000n,
  reserved: 0n,
  entryPriceE8: 0n,
  fundingCheckpoint: 0n,
};

test("maker quotes fit equity and inventory limits and round prices away from the midpoint", () => {
  const current = market();
  const quote = botQuote(
    policy,
    current,
    position,
    9n,
    Math.floor(Date.now() / 1000),
  )!;
  assert.equal(quote.maxCapacity, 100_000_000n);
  assert.deepEqual(
    quote.tiers.map((tier) => tier.size),
    [10_000_000n, 100_000_000n],
  );
  assert.equal(quote.tiers[0].bidE8, 9_989_000_000n);
  assert.equal(quote.tiers[0].askE8, 10_011_000_000n);
  const exposure = {
    ...position,
    position: 1_900_000_000n,
    entryPriceE8: 10_000_000_000n,
    collateral: 100_000_000n,
  };
  assert.equal(
    botQuote(policy, current, exposure, 10n, Math.floor(Date.now() / 1000))!
      .maxCapacity,
    10_000_000n,
  );
  assert.equal(
    botQuote(
      policy,
      current,
      { ...position, reserved: 10_000_000n },
      11n,
      Math.floor(Date.now() / 1000),
    ),
    undefined,
  );
  assert.throws(
    () =>
      botQuote(
        { ...policy, spreadBps: 20_000 },
        current,
        position,
        11n,
        Math.floor(Date.now() / 1000),
      ),
    /price bounds/,
  );
});

test("stale oracle, missed funding and market incidents stop new maker quotes", () => {
  const current = market();
  const now = Math.floor(Date.now() / 1000);
  assert.equal(quoteHealth(current, now + 301), "oracle stale");
  current.oracleTimestamp = new anchor.BN(now + 3601);
  assert.equal(quoteHealth(current, now + 3601), undefined);
  current.oracleTimestamp = new anchor.BN(now + 7199);
  assert.equal(quoteHealth(current, now + 7199), undefined);
  current.oracleTimestamp = new anchor.BN(now + 7200);
  assert.equal(quoteHealth(current, now + 7200), "funding overdue");
  current.incident = { makerDefault: {} };
  assert.equal(quoteHealth(current, now), "market paused");
});

test("maker checkpoint protects the writer lease, preserves bigint nonces and recovers a dead process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-bot-"));
  const identity = [
    PublicKey.unique(),
    PublicKey.unique(),
    PublicKey.unique(),
  ].map((key) => key.toBase58());
  const store = new BotStore(identity[0], identity[1], identity[2], directory);
  const second = new BotStore(identity[0], identity[1], identity[2], directory);
  try {
    await store.acquire();
    await assert.rejects(second.acquire(), /Another maker bot/);
    const state = await store.load();
    state.request = botQuote(
      policy,
      market(),
      position,
      (1n << 63n) + 19n,
      Math.floor(Date.now() / 1000),
    );
    state.referencePrice = 10_000_000_000n;
    state.fills.test = { signature: "signature", slot: 19 };
    await store.save(state);
    await store.release();
    await writeFile(
      `${store.path}.lock`,
      JSON.stringify({ host: hostname(), pid: 2_000_000_000, token: "dead" }),
    );
    await second.acquire();
    assert.equal((await second.load()).request!.clientNonce, (1n << 63n) + 19n);
    assert.equal((await second.load()).fills.test.slot, 19);
    await writeFile(
      `${store.path}.lock`,
      JSON.stringify({ host: hostname(), pid: process.pid, token: "other" }),
    );
    await assert.rejects(second.save(state), /lease was lost/);
  } finally {
    await store.release();
    await second.release();
    await rm(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const maker = PublicKey.unique();
  const current = market();
  const quotes = new Map<
    string,
    { input: QuoteInput; status: string; replacementNonce?: bigint }
  >();
  let ambiguous = false;
  let failedWithoutReceipt = false;
  let lamports = 1_000_000_000;
  const published: bigint[] = [];
  let publicFills: Array<{ id: string; signature: string; slot: number }> = [];
  let privatePosition = { ...position };
  let finalizedVersion = 0;
  let accountStatus = "ready";
  let writes = false;
  let viewCount = 0;
  const computation = PublicKey.unique();
  const accountAddress = PublicKey.unique();
  const id = (nonce: bigint) => {
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64LE(nonce);
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("quote"),
        marketAddress().toBuffer(),
        maker.toBuffer(),
        bytes,
      ],
      DEPTH_PROGRAM_ID,
    )[0];
  };
  const get = (address: PublicKey) => {
    let reserveSignature: string | undefined;
    return {
      id: address,
      get reserveSignature() {
        return reserveSignature;
      },
      status: async () => ({
        id: address.toBase58(),
        status: quotes.get(address.toBase58())!.status,
        expiresAt: quotes.get(address.toBase58())!.input.expiresAt,
        attachedOrders: 0,
        maxCapacity: quotes.get(address.toBase58())!.input.maxCapacity,
      }),
      reservation: async () => 0n,
      renew: async ({ validForSeconds }: { validForSeconds: number }) => {
        quotes.get(address.toBase58())!.input.expiresAt =
          Math.floor(Date.now() / 1000) + validForSeconds;
        return get(address).status();
      },
      activate: async () => {
        if (writes) {
          const quote = quotes.get(address.toBase58())!;
          if (quote.status === "validated") {
            quote.status = "reserving";
            accountStatus = "reserving";
            reserveSignature = "reserve-signature";
          }
          return get(address).status();
        }
        quotes.get(address.toBase58())!.status = "active";
        return get(address).status();
      },
      cancel: async () => {
        quotes.get(address.toBase58())!.status = "cancelled";
        return get(address).status();
      },
    };
  };
  const client = {
    options: {
      maker,
      wallet: { publicKey: maker },
      connection: {
        getGenesisHash: async () => PublicKey.default.toBase58(),
        getBalance: async () => lamports,
        getAccountInfo: async (address: PublicKey) =>
          quotes.has(address.toBase58()) ? {} : null,
      },
    },
    marketAddress: marketAddress(),
    marketAccount: () => accountAddress,
    read: async (name: string, _key: PublicKey, commitment?: string) =>
      name === "Market"
        ? current
        : {
            status: { [accountStatus]: {} },
            pendingComputation: computation,
            version: new anchor.BN(
              commitment === "finalized"
                ? finalizedVersion
                : privatePosition.version.toString(),
            ),
          },
    position: {
      summary: async () => {
        viewCount++;
        return privatePosition;
      },
    },
    quoteState: async (address: PublicKey) => {
      const quote = quotes.get(address.toBase58())!;
      return {
        operator: maker,
        status: { [quote.status]: {} },
        pendingComputation: computation,
        balanceNonce: Array.from(
          Buffer.alloc(16, Number(privatePosition.version % 256n)),
        ),
        expiry: new anchor.BN(quote.input.expiresAt),
        marketRevision: new anchor.BN(1),
        oracleReferenceE8: new anchor.BN(
          quote.input.tiers[0].bidE8.toString(),
        ).add(new anchor.BN(11_000_000)),
        replacementNonce:
          quote.replacementNonce == null
            ? null
            : new anchor.BN(quote.replacementNonce.toString()),
      };
    },
    quote: {
      cleanup: async () => ({ closed: 0, reclaimedLamports: 0n }),
      list: async () => ({
        items: [...quotes.keys()].map((key) => ({ id: new PublicKey(key) })),
      }),
      get,
      publish: async (input: QuoteInput) => {
        published.push(input.clientNonce);
        if (failedWithoutReceipt) {
          failedWithoutReceipt = false;
          throw new Error("Transport failed before confirmation");
        }
        const address = id(input.clientNonce);
        quotes.set(address.toBase58(), { input, status: "validating" });
        if (ambiguous) {
          ambiguous = false;
          throw new Error("Transport timed out after submission");
        }
        return get(address);
      },
      replacement: (prior: PublicKey, nonce: bigint) => ({
        nextId: id(nonce),
        begin: async () => {
          quotes.get(prior.toBase58())!.replacementNonce = nonce;
        },
        rotate: async () => {
          const priorQuote = quotes.get(prior.toBase58())!;
          const nextQuote = quotes.get(id(nonce).toBase58())!;
          if (nextQuote.status === "validated") {
            priorQuote.status = "cancelled";
            nextQuote.status = "active";
          }
          return get(id(nonce)).status();
        },
        discard: async () => {
          quotes.get(id(nonce).toBase58())!.status = "cancelled";
          quotes.get(prior.toBase58())!.replacementNonce = undefined;
        },
        resume: async (input: QuoteInput) => {
          assert.equal(input.clientNonce, nonce);
          assert.equal(quotes.get(prior.toBase58())!.status, "cancelled");
          return client.quote.publish(input);
        },
      }),
    },
    fills: {
      list: async () => ({
        fills: publicFills,
        head: publicFills.length ? "head" : undefined,
      }),
    },
  };
  return {
    client: client as unknown as MakerClient,
    current,
    quotes,
    published,
    views: () => viewCount,
    quoteWrites: () => {
      writes = true;
    },
    finishWrite: (success: boolean) => {
      for (const quote of quotes.values()) {
        if (quote.status === "reserving")
          quote.status = success ? "active" : "rejected";
      }
      accountStatus = "ready";
      if (success)
        privatePosition = {
          ...privatePosition,
          version: privatePosition.version + 1n,
        };
    },
    gas: (value: number) => {
      lamports = value;
    },
    fail: (receipt: boolean) => {
      if (receipt) ambiguous = true;
      else failedWithoutReceipt = true;
    },
    fill: () => {
      publicFills = [{ id: "fill", signature: "settlement", slot: 51 }];
    },
    reserve: (reserved: bigint) => {
      privatePosition = {
        ...privatePosition,
        reserved,
        version: privatePosition.version + 1n,
      };
      finalizedVersion = Number(privatePosition.version);
    },
    inventory: (size: bigint, final = true) => {
      privatePosition = {
        ...privatePosition,
        position: size,
        collateral: 100_000_000n,
        entryPriceE8: 10_000_000_000n,
        version: privatePosition.version + 1n,
      };
      if (final) finalizedVersion = Number(privatePosition.version);
    },
    finalize: () => {
      finalizedVersion = Number(privatePosition.version);
    },
  };
}

test("inventory-aware quotes use tier execution costs, funding and private inventory without relaxing Depth margin", () => {
  const current = market();
  const now = current.oracleTimestamp.toNumber();
  const pricing = {
    book: {
      timestamp: now * 1000,
      bids: [
        { priceE8: 9_998_000_000n, size: 200_000_000n },
        { priceE8: 9_997_000_000n, size: 10_000_000_000n },
      ],
      asks: [
        { priceE8: 10_002_000_000n, size: 200_000_000n },
        { priceE8: 10_003_000_000n, size: 10_000_000_000n },
      ],
    },
    externalPosition: 0n,
    maxPriceAgeMs: 5000,
    takerFeeBps: 4.5,
    hourlyFundingBps: 1,
  };
  const rules = { ...policy, inventorySkewBps: 20, executionCostBps: 5 };
  const flat = botQuote(rules, current, position, 1n, now, pricing)!;
  assert.ok(flat.tiers[1].askE8 > flat.tiers[0].askE8);
  assert.ok(flat.tiers[1].bidE8 < flat.tiers[0].bidE8);
  const long = {
    ...position,
    collateral: 100_000_000n,
    position: 1_000_000_000n,
    entryPriceE8: 10_000_000_000n,
  };
  const skewed = botQuote(rules, current, long, 2n, now, pricing)!;
  assert.ok(skewed.tiers[0].askE8 < flat.tiers[0].askE8);
  assert.ok(skewed.tiers[0].bidE8 < flat.tiers[0].bidE8);
  const covered = botQuote(rules, current, long, 3n, now, {
    ...pricing,
    externalPosition: -1_000_000_000n,
  })!;
  assert.equal(covered.maxCapacity, skewed.maxCapacity);
  assert.equal(covered.tiers[0].askE8, flat.tiers[0].askE8);
  assert.throws(
    () => botQuote(rules, current, position, 4n, now + 6, pricing),
    /stale/,
  );
  assert.throws(
    () =>
      botQuote(rules, current, position, 5n, now, {
        ...pricing,
        takerFeeBps: 1000,
      }),
    /deviation/,
  );
});

test("the bot waits for finalized inventory, pauses quotes for uncertain hedges and preserves its hedge journal on restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-hedged-bot-"));
  const setup = fixture();
  let externalPosition = 0n;
  let uncertain = false;
  const submitted: HedgeOrder[] = [];
  const adapter: HedgeAdapter = {
    identity: "hyperliquid:testnet:maker:SOL",
    address: "maker",
    network: "testnet",
    sizeStep: 1000n,
    minNotional: 10_000_000n,
    account: async () => ({
      timestamp: Date.now(),
      position: externalPosition,
      availableMargin: 100_000_000n,
      leverage: 1,
      openOrders: [],
    }),
    book: async () => ({
      timestamp: Date.now(),
      bids: [{ priceE8: 9_999_000_000n, size: 10_000_000_000n }],
      asks: [{ priceE8: 10_001_000_000n, size: 10_000_000_000n }],
    }),
    costs: async () => ({ takerFeeBps: 4, hourlyFundingBps: 0 }),
    price: (value) => value,
    submit: async (order) => {
      submitted.push(order);
      if (uncertain) return { status: "unknown", filledSize: 0n };
      externalPosition += order.buy ? order.size : -order.size;
      return { status: "filled", filledSize: order.size };
    },
    receipt: async (order) =>
      uncertain
        ? { status: "unknown", filledSize: 0n }
        : { status: "filled", filledSize: order.size },
    cancel: async () => {},
  };
  const hedgePolicy: HedgePolicy = {
    ratioBps: 10000,
    thresholdNotional: 1_000_000n,
    maxUnhedgedNotional: 20_000_000n,
    maxOrderNotional: 100_000_000n,
    batchMs: 1,
    maxUnhedgedMs: 10000,
    maxSlippageBps: 10,
    maxPriceAgeMs: 5000,
    orderTtlMs: 3000,
    maxLeverage: 1,
  };
  const create = () =>
    MakerBot.create({
      maker: setup.client,
      policy,
      stateDirectory: directory,
      hedge: new HedgeEngine(adapter, hedgePolicy),
    });
  let bot = await create();
  try {
    const realNow = Date.now;
    let clock = realNow();
    let reads = 0;
    const summary = setup.client.position.summary;
    setup.client.position.summary = async (options) => {
      clock += 2000;
      const snapshot = await summary(options);
      return ++reads === 1
        ? { ...snapshot, status: "pending", position: undefined }
        : snapshot;
    };
    Date.now = () => clock;
    try {
      await bot.tick();
      assert.equal(setup.published.length, 0);
      await bot.tick();
      assert.equal(reads, 2);
      assert.equal(setup.published.length, 1);
    } finally {
      Date.now = realNow;
      setup.client.position.summary = summary;
    }
    await bot.tick();
    assert.equal((await bot.tick()).phase, "active");
    setup.reserve(1_000_000n);
    assert.equal((await bot.tick()).phase, "active");
    assert.equal(setup.published.length, 1);
    setup.inventory(-1_000_000_000n, false);
    assert.match((await bot.tick()).reason!, /finalized/);
    const observedViews = setup.views();
    await bot.tick();
    assert.equal(setup.views(), observedViews);

    assert.equal(submitted.length, 0);
    setup.finalize();
    uncertain = true;
    await bot.tick();
    assert.ok((await bot.store.load()).hedge!.pending);
    for (const quote of setup.quotes.values())
      assert.notEqual(quote.status, "active");
    const order = submitted[0];
    const successor = {
      ...setup.client,
      options: {
        ...setup.client.options,
        wallet: { publicKey: PublicKey.unique() },
      },
    } as MakerClient;
    await assert.rejects(
      MakerBot.create({
        maker: successor,
        policy,
        stateDirectory: directory,
        hedge: new HedgeEngine(adapter, hedgePolicy),
      }),
      /Another maker bot/,
    );
    await bot.close();
    bot = await MakerBot.create({
      maker: successor,
      policy,
      stateDirectory: directory,
      hedge: new HedgeEngine(adapter, hedgePolicy),
    });
    await bot.tick();
    assert.deepEqual(submitted[1], order);
    uncertain = false;
    externalPosition = 1_000_000_000n;
    await bot.tick();
    assert.equal((await bot.store.load()).hedge!.history[0].cloid, order.cloid);
    await bot.close();
    await assert.rejects(
      MakerBot.create({
        maker: setup.client,
        policy,
        stateDirectory: directory,
      }),
      /Restore.*hedge/,
    );
  } finally {
    await bot.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("maker retains gas for cancellation and stops publishing below its reserve", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-bot-"));
  const setup = fixture();
  const bot = await MakerBot.create({
    maker: setup.client,
    policy,
    stateDirectory: directory,
  });
  try {
    await bot.tick();
    await bot.tick();
    assert.equal((await bot.tick()).phase, "active");
    setup.gas(49_000_000);
    assert.equal((await bot.tick()).reason, "operator SOL reserve");
    assert.equal((await bot.tick()).phase, "stopped");
    assert.equal(setup.published.length, 1);
    setup.gas(100_000_000);
    await bot.tick();
    await bot.tick();
    assert.equal(setup.published.length, 2);
    assert.throws(
      () => validateBotPolicy({ ...policy, gasReserveLamports: 1n }),
      /SOL reserve/,
    );
  } finally {
    await bot.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("own quote reservations preserve cached inventory, while a failed reservation cannot mask a fill", async () => {
  for (const success of [true, false]) {
    const directory = await mkdtemp(join(tmpdir(), "depth-reserve-bot-"));
    const setup = fixture();
    setup.quoteWrites();
    const observed: Array<bigint | undefined> = [];
    const book = () => ({
      timestamp: Date.now(),
      bids: [{ priceE8: 9_999_000_000n, size: 10_000_000_000n }],
      asks: [{ priceE8: 10_001_000_000n, size: 10_000_000_000n }],
    });
    const hedge = {
      adapter: {
        identity: `test:reserve:${success}`,
        book: async () => book(),
        costs: async () => ({ takerFeeBps: 4, hourlyFundingBps: 0 }),
      },
      policy: {
        maxPriceAgeMs: 5000,
        maxUnhedgedNotional: 1_000_000_000n,
        maxUnhedgedMs: 15_000,
      },
      tick: async (_state: unknown, _save: unknown, inventory?: bigint) => {
        observed.push(inventory);
        return {
          phase: "balanced",
          externalPosition: -(inventory ?? 0n),
          history: [],
        };
      },
    } as unknown as HedgeEngine;
    const bot = await MakerBot.create({
      maker: setup.client,
      policy,
      stateDirectory: directory,
      hedge,
    });
    try {
      await bot.tick();
      for (const quote of setup.quotes.values()) quote.status = "validated";
      await bot.tick();
      assert.ok((await bot.store.load()).quoteWrite);
      const reads = setup.views();
      assert.equal((await bot.tick()).reason, "updating quote margin");
      assert.ok(
        [...setup.quotes.values()].some(
          (quote) => quote.status === "reserving",
        ),
      );
      setup.finishWrite(success);
      if (!success) setup.inventory(-1_000_000_000n);
      await bot.tick();
      if (success) {
        assert.equal(setup.views(), reads);
        assert.equal(observed.at(-1), 0n);
        setup.finalize();
        await bot.tick();
        assert.equal((await bot.store.load()).quoteWrite, undefined);
      } else {
        assert.ok(setup.views() > reads);
        assert.equal(observed.at(-1), -1_000_000_000n);
      }
    } finally {
      await bot.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("unconfirmed publish retries the persisted nonce and a restart reconciles receipts and finalized fills", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-bot-"));
  const setup = fixture();
  let bot = await MakerBot.create({
    maker: setup.client,
    policy,
    stateDirectory: directory,
  });
  try {
    await bot.tick();
    setup.fail(false);
    await assert.rejects(bot.tick(), /Transport failed/);
    const checkpoint = JSON.parse(await readFile(bot.store.path, "utf8"));
    const original = BigInt(checkpoint.request.clientNonce.$bigint);
    await bot.close();
    bot = await MakerBot.create({
      maker: setup.client,
      policy,
      stateDirectory: directory,
    });
    await bot.tick();
    await bot.tick();
    assert.deepEqual(setup.published, [original, original]);
    assert.equal((await bot.tick()).phase, "active");
    setup.fill();
    const clock = Date.now;
    Date.now = () => clock() + 10_001;
    assert.equal((await bot.tick()).fillCount, 1);
    Date.now = clock;
    await bot.close();
    bot = await MakerBot.create({
      maker: setup.client,
      policy,
      stateDirectory: directory,
    });
    assert.equal((await bot.tick()).fillCount, 1);
    const state = await bot.store.load();
    assert.equal(state.cursor, "head");
    assert.deepEqual(state.fills.fill, { signature: "settlement", slot: 51 });
  } finally {
    await bot.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("maker validates a durable successor before stopping the old quote and cancels both on stale prices", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-bot-"));
  const setup = fixture();
  const bot = await MakerBot.create({
    maker: setup.client,
    policy,
    stateDirectory: directory,
  });
  try {
    await bot.tick();
    await bot.tick();
    assert.equal((await bot.tick()).phase, "active");
    const prior = [...setup.quotes.values()][0];
    setup.current.oraclePriceE8 = new anchor.BN("10100000000");
    assert.equal((await bot.tick()).reason, "repricing quote");
    assert.ok(prior.replacementNonce !== undefined);
    assert.equal(prior.status, "active");
    const next = [...setup.quotes.values()][1];
    assert.equal(next.status, "validating");
    await bot.tick();
    assert.equal(prior.status, "active");
    next.status = "validated";
    await bot.tick();
    assert.equal(prior.status, "cancelled");
    assert.equal(next.status, "active");
    await bot.tick();
    assert.equal(prior.status, "cancelled");
    await bot.tick();
    assert.equal(setup.published[1], prior.replacementNonce);
    assert.equal((await bot.tick()).phase, "active");
    setup.current.oracleTimestamp = new anchor.BN(
      Math.floor(Date.now() / 1000) - 301,
    );
    assert.equal((await bot.tick()).reason, "oracle stale");
    assert.equal((await bot.tick()).phase, "stopped");
    assert.equal(setup.quotes.size, 2);
  } finally {
    await bot.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("atomic rotation keeps liquidity within the maker's inventory allowance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-overlap-bot-"));
  const setup = fixture();
  const bot = await MakerBot.create({
    maker: setup.client,
    policy: { ...policy, maxInventoryNotional: 100_000_000n },
    stateDirectory: directory,
  });
  try {
    await bot.tick();
    await bot.tick();
    setup.current.oraclePriceE8 = new anchor.BN("10100000000");
    await bot.tick();
    const [prior, next] = [...setup.quotes.values()];
    next.status = "validated";
    await bot.tick();
    assert.equal(prior.status, "cancelled");
    assert.equal(next.status, "active");
    await bot.tick();
    assert.equal(next.status, "active");
  } finally {
    await bot.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("unchanged quotes renew their existing receipt and survive restart without consuming capacity twice", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-renew-bot-"));
  const setup = fixture();
  let bot = await MakerBot.create({
    maker: setup.client,
    policy,
    stateDirectory: directory,
  });
  const realNow = Date.now;
  try {
    await bot.tick();
    await bot.tick();
    const before = await bot.store.load();
    const quoted = setup.quotes.get(before.quote!)!;
    const expiry = quoted.input.expiresAt;
    const clock = realNow() + 70_000;
    Date.now = () => clock;
    assert.equal((await bot.tick()).phase, "active");
    assert.equal(setup.published.length, 1);
    assert.ok(quoted.input.expiresAt > expiry);
    assert.equal((await bot.store.load()).quote, before.quote);
    await bot.close();
    bot = await MakerBot.create({
      maker: setup.client,
      policy,
      stateDirectory: directory,
    });
    assert.equal((await bot.tick()).phase, "active");
    assert.equal(setup.published.length, 1);
    assert.equal(
      (await bot.store.load()).request!.expiresAt,
      quoted.input.expiresAt,
    );
  } finally {
    Date.now = realNow;
    await bot.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("partial capacity retains its ceiling price tier and replacement credits only the remaining private margin", () => {
  const current = market();
  const now = Math.floor(Date.now() / 1000);
  const partial = {
    ...position,
    position: 100_000_000n,
    entryPriceE8: 10_000_000_000n,
    reserved: 9_000_000n,
  };
  const result = botQuote(
    { ...policy, maxInventoryNotional: 100_000_000n },
    current,
    partial,
    1n,
    now,
    undefined,
    9_000_000n,
  )!;
  assert.equal(result.maxCapacity, 90_000_000n);
  assert.deepEqual(
    result.tiers.map((tier) => tier.size),
    [10_000_000n, 100_000_000n],
  );
  assert.throws(
    () => botQuote(policy, current, partial, 2n, now, undefined, 9_000_001n),
    /private reservation/,
  );
});

test("bounded funded quotes survive own-fill finality while unrelated external inventory stops them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-finality-bot-"));
  const setup = fixture();
  setup.quoteWrites();
  let external = 0n;
  const hedge = {
    adapter: {
      identity: "test:continuity:SOL",
      book: async () => ({
        timestamp: Date.now(),
        bids: [{ priceE8: 9_999_000_000n, size: 10_000_000_000n }],
        asks: [{ priceE8: 10_001_000_000n, size: 10_000_000_000n }],
      }),
      account: async () => ({
        timestamp: Date.now(),
        position: external,
        availableMargin: 100_000_000n,
        leverage: 1,
        openOrders: [],
      }),
      costs: async () => ({ takerFeeBps: 4, hourlyFundingBps: 0 }),
    },
    policy: {
      ratioBps: 10000,
      maxPriceAgeMs: 5000,
      maxLeverage: 1,
      maxUnhedgedNotional: 200_000_000n,
      maxUnhedgedMs: 10000,
    },
    tick: async (_state: unknown, _save: unknown, inventory?: bigint) => ({
      phase: inventory === undefined ? "pending" : "balanced",
      reason:
        inventory === undefined
          ? "Waiting for finalized Depth inventory"
          : undefined,
      externalPosition: 0n,
      history: [],
    }),
  } as unknown as HedgeEngine;
  const bot = await MakerBot.create({
    maker: setup.client,
    policy,
    stateDirectory: directory,
    hedge,
  });
  try {
    await bot.tick();
    for (const quote of setup.quotes.values()) quote.status = "validated";
    await bot.tick();
    setup.finishWrite(true);
    await bot.tick();
    setup.finalize();
    const active = [...setup.quotes.values()][0];
    assert.equal(active.status, "active");
    setup.inventory(-100_000_000n, false);
    await bot.tick();
    assert.equal(active.status, "active");
    const views = setup.views();
    await bot.tick();
    assert.equal(setup.views(), views);
    assert.equal(active.status, "active");
    external = 10_000_000n;
    await bot.tick();
    assert.equal(active.status, "cancelled");
  } finally {
    await bot.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("funding reprices only when it changes the rounded execution cost", () => {
  const before = executionCosts(policy, {
    takerFeeBps: 4.5,
    hourlyFundingBps: 0.001,
  });
  const after = executionCosts(policy, {
    takerFeeBps: 4.5,
    hourlyFundingBps: 0.002,
  });
  assert.deepEqual(before, after);
  assert.notDeepEqual(
    before,
    executionCosts(policy, { takerFeeBps: 4.5, hourlyFundingBps: 0.6 }),
  );
});

test("a confirmed Hyperliquid receipt retains funded liquidity while its account reconciles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-confirmed-bot-"));
  const setup = fixture();
  setup.quoteWrites();
  let external = 0n;
  const adapter: HedgeAdapter = {
    identity: "hyperliquid:testnet:confirmed:SOL",
    address: "maker",
    network: "testnet",
    sizeStep: 1000n,
    minNotional: 10_000_000n,
    account: async () => ({
      timestamp: Date.now(),
      position: external,
      availableMargin: 100_000_000n,
      leverage: 1,
      openOrders: [],
    }),
    book: async () => ({
      timestamp: Date.now(),
      bids: [{ priceE8: 9_999_000_000n, size: 10_000_000_000n }],
      asks: [{ priceE8: 10_001_000_000n, size: 10_000_000_000n }],
    }),
    costs: async () => ({ takerFeeBps: 4, hourlyFundingBps: 0 }),
    price: (value) => value,
    submit: async (order) => {
      external += order.buy ? order.size : -order.size;
      return {
        status: "filled",
        filledSize: order.size,
        filledAt: Date.now(),
        reason: "filled",
      };
    },
    receipt: async () => {
      throw new Error("A confirmed hedge must not be resubmitted");
    },
    cancel: async () => {},
  };
  const bot = await MakerBot.create({
    maker: setup.client,
    policy,
    stateDirectory: directory,
    hedge: new HedgeEngine(adapter, {
      ratioBps: 10000,
      thresholdNotional: 1_000_000n,
      maxUnhedgedNotional: 200_000_000n,
      maxOrderNotional: 100_000_000n,
      batchMs: 1,
      maxUnhedgedMs: 90000,
      maxSlippageBps: 10,
      maxPriceAgeMs: 5000,
      orderTtlMs: 3000,
      maxLeverage: 1,
    }),
  });
  try {
    await bot.tick();
    for (const quote of setup.quotes.values()) quote.status = "validated";
    await bot.tick();
    setup.finishWrite(true);
    await bot.tick();
    setup.finalize();
    const active = [...setup.quotes.values()][0];
    setup.inventory(-200_000_000n, false);
    await bot.tick();
    setup.finalize();
    await bot.tick();
    await new Promise((resolve) => setTimeout(resolve, 2));
    await bot.tick();
    assert.equal(
      bot.hedge!.snapshot!.reason,
      "Hedge submitted; reconciling confirmed exposure",
    );
    assert.equal(active.status, "active");
    assert.equal((await bot.store.load()).hedge!.history.length, 1);
    await bot.tick();
    assert.equal(bot.hedge!.snapshot!.phase, "balanced");
    assert.equal(active.status, "active");
    assert.equal((await bot.store.load()).inventoryPendingSince, undefined);
  } finally {
    await bot.close();
    await rm(directory, { recursive: true, force: true });
  }
});
