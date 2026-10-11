import assert from "node:assert/strict";
import { test } from "node:test";
import { HedgeEngine } from "@/hedge/engine";
import { validateHedgePolicy } from "@/hedge/policy";
import { units, decimal, HyperliquidAdapter } from "@/hedge/hyperliquid";
import type {
  HedgeAdapter,
  HedgePolicy,
  HedgeState,
  HedgeOrder,
  HedgeReceipt,
} from "@/hedge/types";
import { privateKeyToAccount } from "viem/accounts";
import { setup_hyperliquid } from "@/hedge/setup";
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";

const policy: HedgePolicy = {
  ratioBps: 10000,
  thresholdNotional: 10_000_000n,
  maxUnhedgedNotional: 100_000_000n,
  maxOrderNotional: 500_000_000n,
  batchMs: 1000,
  maxUnhedgedMs: 10000,
  maxSlippageBps: 10,
  maxPriceAgeMs: 5000,
  orderTtlMs: 3000,
  maxLeverage: 3,
};
function fixture() {
  let now = 100000;
  let position = 0n;
  let margin = 1_000_000_000n;
  let stale = false;
  let ambiguous = false;
  let partial = false;
  let open = false;
  let snapshots = 0;
  const orders: HedgeOrder[] = [];
  const receipts = new Map<string, HedgeReceipt>();
  const adapter: HedgeAdapter = {
    identity: "hyperliquid:testnet:account:SOL",
    address: "account",
    network: "testnet",
    sizeStep: 1_000_000n,
    minNotional: 10_000_000n,
    book: async () => ({
      timestamp: stale ? 1 : now,
      bids: [{ priceE8: 9_999_000_000n, size: 100_000_000_000n }],
      asks: [{ priceE8: 10_001_000_000n, size: 100_000_000_000n }],
    }),
    costs: async () => ({ takerFeeBps: 4, hourlyFundingBps: 1 }),
    account: async () => ({
      timestamp: now,
      position,
      availableMargin: margin,
      leverage: 1,
      openOrders: open ? ["unmanaged"] : [],
    }),
    price: (value) => value,
    submit: async (order) => {
      orders.push({ ...order });
      if (receipts.has(order.cloid)) return receipts.get(order.cloid)!;
      const filledSize = partial ? order.size / 2n : order.size;
      position += order.buy ? filledSize : -filledSize;
      const receipt: HedgeReceipt = {
        status: partial ? "cancelled" : "filled",
        filledSize,
        orderId: orders.length,
        averagePriceE8: order.limitPriceE8,
      };
      receipts.set(order.cloid, receipt);
      if (ambiguous) {
        ambiguous = false;
        throw new Error("Timeout after venue acceptance");
      }
      return receipt;
    },
    receipt: async (order) =>
      receipts.get(order.cloid) ?? { status: "unknown", filledSize: 0n },
    cancel: async () => {},
  };
  const state: HedgeState = {
    identity: adapter.identity,
    nonce: 0,
    history: [],
  };
  const tick = (engine: HedgeEngine, size: bigint | undefined) =>
    engine.tick(
      state,
      async () => {
        snapshots++;
      },
      size,
      now,
    );
  return {
    adapter,
    state,
    orders,
    tick,
    receipts,
    clock: (value: number) => {
      now = value;
    },
    margin: (value: bigint) => {
      margin = value;
    },
    stale: () => {
      stale = true;
    },
    partial: () => {
      partial = true;
    },
    ambiguous: () => {
      ambiguous = true;
    },
    open: () => {
      open = true;
    },
    saves: () => snapshots,
  };
}

test("pause reconciles existing receipts without resubmitting an unknown hedge or flattening exposure", async () => {
  const f = fixture();
  const engine = new HedgeEngine(f.adapter, policy);
  f.state.pending = {
    cloid: `0x${"a".repeat(32)}`,
    nonce: 99999,
    expiresAt: 103000,
    buy: true,
    size: 100000000n,
    limitPriceE8: 10000000000n,
    reduceOnly: false,
  };
  const pending = f.state.pending;
  const paused = await engine.tick(
    f.state,
    async () => {},
    undefined,
    100000,
    true,
  );
  assert.equal(paused.phase, "blocked");
  assert.equal(f.orders.length, 0);
  assert.equal(f.state.pending, pending);
  f.receipts.set(pending.cloid, {
    status: "filled",
    filledSize: pending.size,
    orderId: 7,
    averagePriceE8: pending.limitPriceE8,
  });
  const resolved = await engine.tick(
    f.state,
    async () => {},
    undefined,
    100100,
    true,
  );
  assert.equal(resolved.phase, "waiting");
  assert.equal(f.state.pending, undefined);
  assert.equal(f.state.history.length, 1);
  assert.equal(f.orders.length, 0);
  await engine.tick(f.state, async () => {}, 1000000000n, 100200, true);
  assert.equal(f.orders.length, 0);
});

test("net exposure is batched across fills and only the confirmed hedge delta is ordered", async () => {
  const f = fixture();
  const engine = new HedgeEngine(f.adapter, policy);
  assert.equal((await f.tick(engine, -100_000_000n)).phase, "waiting");
  f.clock(100500);
  await f.tick(engine, -30_000_000n);
  assert.equal(f.orders.length, 0);
  f.clock(101000);
  assert.equal((await f.tick(engine, -300_000_000n)).phase, "pending");
  assert.equal(f.orders[0].size, 300_000_000n);
  assert.equal(f.orders[0].buy, true);
  f.clock(101001);
  assert.equal((await f.tick(engine, -300_000_000n)).phase, "balanced");
  assert.equal(f.orders.length, 1);
  assert.ok(f.saves() >= 3);
});

test("an accepted hedge survives a lost response and restart without duplicating exposure", async () => {
  const f = fixture();
  let engine = new HedgeEngine(f.adapter, policy);
  f.ambiguous();
  await assert.rejects(f.tick(engine, -2_000_000_000n), /Timeout/);
  assert.ok(f.state.pending);
  const saved = f.state.pending.cloid;
  engine = new HedgeEngine(f.adapter, policy);
  f.clock(100001);
  assert.equal((await f.tick(engine, -2_000_000_000n)).phase, "balanced");
  assert.equal(f.orders.length, 1);
  assert.equal(f.state.history[0].cloid, saved);
  assert.equal(f.state.pending, undefined);
});

test("uncertain retries preserve the signed nonce, cloid and expiry and expire closed", async () => {
  const f = fixture();
  f.adapter.submit = async (order) => {
    f.orders.push({ ...order });
    return { status: "unknown", filledSize: 0n };
  };
  let engine = new HedgeEngine(f.adapter, policy);
  await f.tick(engine, -2_000_000_000n);
  const original = { ...f.state.pending! };
  engine = new HedgeEngine(f.adapter, policy);
  f.clock(100001);
  await f.tick(engine, -2_000_000_000n);
  assert.deepEqual(f.orders[1], original);
  f.clock(original.expiresAt);
  assert.equal((await f.tick(engine, -2_000_000_000n)).phase, "blocked");
  assert.equal(f.orders.length, 2);
  assert.deepEqual(f.state.pending, original);
});

test("partial fills are reconciled against venue inventory before sizing the next hedge", async () => {
  const f = fixture();
  const engine = new HedgeEngine(f.adapter, policy);
  f.partial();
  await f.tick(engine, -2_000_000_000n);
  f.clock(100001);
  await f.tick(engine, -2_000_000_000n);
  assert.equal(f.orders[0].size, 2_000_000_000n);
  assert.equal(f.orders[1].size, 1_000_000_000n);
  assert.equal(f.state.history[0].filledSize, 1_000_000_000n);
});

test("a reversal flattens the existing external leg with reduce-only before opening its opposite", async () => {
  const f = fixture();
  const engine = new HedgeEngine(f.adapter, policy);
  await f.tick(engine, -2_000_000_000n);
  f.clock(100001);
  await f.tick(engine, 2_000_000_000n);
  assert.equal(f.orders[1].size, 2_000_000_000n);
  assert.equal(f.orders[1].reduceOnly, true);
  assert.equal(f.orders[1].buy, false);
  f.clock(100002);
  await f.tick(engine, 2_000_000_000n);
  assert.equal(f.orders[2].size, 2_000_000_000n);
  assert.equal(f.orders[2].reduceOnly, false);
});

test("stale prices, missing inventory finality, unmanaged orders and insufficient margin prevent new hedges", async () => {
  const f = fixture();
  const engine = new HedgeEngine(f.adapter, policy);
  assert.equal((await f.tick(engine, undefined)).phase, "pending");
  f.margin(0n);
  assert.equal((await f.tick(engine, -2_000_000_000n)).phase, "blocked");
  assert.equal(f.orders.length, 0);
  f.open();
  assert.match((await f.tick(engine, -2_000_000_000n)).reason!, /unmanaged/);
  f.stale();
  await assert.rejects(f.tick(engine, -2_000_000_000n), /stale/);
  assert.equal(engine.snapshot!.phase, "blocked");
  assert.equal(f.orders.length, 0);
});

test("confirmed fills are not hedged twice while the external account snapshot is behind", async () => {
  const f = fixture();
  const engine = new HedgeEngine(f.adapter, policy);
  await f.tick(engine, -2_000_000_000n);
  const read = f.adapter.account;
  f.adapter.account = async () => ({
    ...(await read()),
    timestamp: 99999,
    position: 0n,
  });
  f.clock(100001);
  assert.equal((await f.tick(engine, -2_000_000_000n)).phase, "pending");
  assert.equal(f.orders.length, 1);
});

test("freshness uses the response time when external reads advance the clock", async () => {
  const f = fixture();
  const engine = new HedgeEngine(f.adapter, policy);
  const original = Date.now;
  let now = 100000;
  Date.now = () => now;
  const account = f.adapter.account;
  f.adapter.account = async () => {
    now = 102000;
    f.clock(now);
    return account();
  };
  try {
    assert.equal(
      (await engine.tick(f.state, async () => {}, -2_000_000_000n)).phase,
      "pending",
    );
    assert.equal(f.orders.length, 1);
    assert.equal(f.orders[0].nonce, 102000);
    f.stale();
    await assert.rejects(
      engine.tick(f.state, async () => {}, -2_000_000_000n),
      /stale/,
    );
    assert.equal(f.orders.length, 1);
  } finally {
    Date.now = original;
  }
});

test("hedge policies reject invalid exposure windows and decimal parsing preserves exact quantities", () => {
  assert.throws(
    () => validateHedgePolicy({ ...policy, batchMs: 10000 }),
    /batching/,
  );
  assert.throws(() => validateHedgePolicy({ ...policy, ratioBps: 0 }), /ratio/);
  assert.equal(units("0.100000001", 9), 100_000_001n);
  assert.equal(decimal(100_000_001n, 9), "0.100000001");
  assert.equal(decimal(100_000_000n, 9), "0.1");
  assert.equal(decimal(10_000_000_000n, 8), "100");
  assert.equal(decimal(0n, 9), "0");
  assert.throws(() => units("1e3", 9), /decimal/);
  assert.throws(() => units("0.000000001", 8), /precision/);
});

test("venue quantity rounding leaves bounded residual exposure without repeatedly submitting dust", async () => {
  const f = fixture();
  const engine = new HedgeEngine(f.adapter, policy);
  await f.tick(engine, -2_000_123_456n);
  assert.equal(f.orders[0].size, 2_000_000_000n);
  f.clock(100001);
  const snapshot = await f.tick(engine, -2_000_123_456n);
  assert.equal(snapshot.phase, "balanced");
  assert.equal(snapshot.unhedgedPosition, -123_456n);
  f.clock(120000);
  assert.equal((await f.tick(engine, -2_000_123_456n)).phase, "balanced");
  assert.equal(f.orders.length, 1);
});

test("the real adapter signs IOC requests with the persisted nonce and does not include Depth identifiers", async () => {
  const wallet = privateKeyToAccount(`0x${"1".repeat(64)}`);
  const account = `0x${"2".repeat(40)}` as const;
  const original = globalThis.fetch;
  const requests: Record<string, unknown>[] = [];
  globalThis.fetch = (async (input, init) => {
    const body = JSON.parse(String(init!.body));
    requests.push(body);
    let response: unknown;
    if (body.type === "meta")
      response = {
        universe: [
          { name: "SOL", szDecimals: 3, maxLeverage: 20, marginTableId: 0 },
        ],
      };
    else if (body.type === "extraAgents")
      response = [{ address: wallet.address, name: "depth", validUntil: null }];
    else if (body.type === "orderStatus") response = { status: "unknownOid" };
    else if (body.type === "openOrders") response = [];
    else
      response = {
        status: "ok",
        response: {
          type: "order",
          data: {
            statuses: [{ filled: { oid: 1, totalSz: "1", avgPx: "100" } }],
          },
        },
      };
    return Response.json(response);
  }) as typeof fetch;
  try {
    const adapter = await HyperliquidAdapter.create({
      wallet,
      account,
      network: "testnet",
    });
    const order: HedgeOrder = {
      cloid: `0x${"a".repeat(32)}`,
      nonce: Date.now(),
      expiresAt: Date.now() + 10000,
      buy: true,
      size: 1_000_000_000n,
      limitPriceE8: adapter.price(10_011_123_456n, true),
      reduceOnly: false,
    };
    await adapter.submit(order);
    await adapter.submit(order);
    await new ExchangeClient({
      wallet,
      transport: new HttpTransport({ isTestnet: true }),
      nonceManager: () => order.nonce,
    }).order(
      {
        orders: [
          {
            a: 0,
            b: true,
            p: "100.11000000",
            s: "1.000000000",
            r: false,
            t: { limit: { tif: "Ioc" } },
            c: order.cloid,
          },
        ],
        grouping: "na",
      },
      { expiresAfter: order.expiresAt },
    );
    const actions = requests.filter((request) => request.action);
    assert.deepEqual(actions[0], actions[1]);
    assert.deepEqual(actions[0].action, actions[2].action);
    assert.deepEqual(actions[0].signature, actions[2].signature);
    assert.equal(actions[0].nonce, actions[2].nonce);
    assert.equal(actions[0].nonce, order.nonce);
    assert.equal(actions[0].expiresAfter, order.expiresAt);
    assert.equal(JSON.stringify(actions).includes("Depth"), false);
    assert.match(JSON.stringify(actions), /Ioc/);
    assert.ok(adapter.price(10_011_123_456n, true) <= 10_011_123_456n);
    assert.ok(adapter.price(10_011_123_456n, false) >= 10_011_123_456n);
  } finally {
    globalThis.fetch = original;
  }
});

test("an explicit venue rejection stops the hedge leg without reporting a pending fill", async () => {
  const f = fixture();
  f.adapter.submit = async (order) => {
    f.orders.push(order);
    return {
      status: "rejected",
      filledSize: 0n,
      reason: "Agent permission denied",
    };
  };
  const engine = new HedgeEngine(f.adapter, policy);
  const snapshot = await f.tick(engine, -2_000_000_000n);
  assert.equal(snapshot.phase, "blocked");
  assert.equal(snapshot.reason, "Agent permission denied");
  assert.equal(f.state.pending, undefined);
  assert.equal(f.state.history.at(-1)?.status, "rejected");
  assert.equal(f.orders.length, 1);
});

test("account setup refuses a wrong signer and an unfunded account before approving an agent", async () => {
  const wallet = privateKeyToAccount(`0x${"1".repeat(64)}`);
  const agent = privateKeyToAccount(`0x${"2".repeat(64)}`).address;
  await assert.rejects(
    setup_hyperliquid({ wallet, agent, account: agent, leverage: 1 }),
    /does not own/,
  );
  const original = globalThis.fetch;
  const requests: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init!.body));
    requests.push(body);
    return Response.json({ marginSummary: { accountValue: "0.0" } });
  }) as typeof fetch;
  try {
    await assert.rejects(
      setup_hyperliquid({ wallet, agent, network: "testnet", leverage: 1 }),
      /Fund Hyperliquid testnet/,
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].type, "clearinghouseState");
    assert.equal(
      requests.some((request) => request.action),
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("the adapter deduplicates partial fills, waits for incomplete full fills and rejects mismatched execution", async () => {
  const wallet = privateKeyToAccount(`0x${"1".repeat(64)}`);
  const account = `0x${"2".repeat(40)}` as const;
  const order: HedgeOrder = {
    cloid: `0x${"a".repeat(32)}`,
    nonce: Date.now(),
    expiresAt: Date.now() + 10000,
    buy: true,
    size: 2_000_000_000n,
    limitPriceE8: 10_000_000_000n,
    reduceOnly: false,
  };
  const fill = {
    oid: 1,
    tid: 11,
    coin: "SOL",
    side: "B",
    sz: "1",
    px: "100",
    fee: "0.04",
    feeToken: "USDC",
    hash: `0x${"3".repeat(64)}`,
  };
  let status = "canceled";
  let side = "B";
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init!.body));
    let value: unknown;
    if (body.type === "meta")
      value = {
        universe: [
          { name: "SOL", szDecimals: 3, maxLeverage: 20, marginTableId: 0 },
        ],
      };
    else if (body.type === "extraAgents")
      value = [{ address: wallet.address, validUntil: null }];
    else if (body.type === "orderStatus")
      value = {
        status: "order",
        order: {
          status,
          statusTimestamp: Date.now(),
          order: {
            oid: 1,
            coin: "SOL",
            cloid: order.cloid,
            side: "B",
            origSz: "2",
            sz: "1",
            limitPx: "100",
            reduceOnly: false,
          },
        },
      };
    else if (body.type === "userFillsByTime")
      value = [
        { ...fill, side },
        { ...fill, side },
      ];
    else throw new Error("Unexpected info request");
    return Response.json(value);
  }) as typeof fetch;
  try {
    const adapter = await HyperliquidAdapter.create({ wallet, account });
    const receipt = await adapter.receipt(order);
    assert.equal(receipt.status, "cancelled");
    assert.equal(receipt.filledSize, 1_000_000_000n);
    assert.equal(receipt.fee, 40000n);
    assert.deepEqual(receipt.hashes, [fill.hash]);
    status = "filled";
    assert.equal((await adapter.receipt(order)).status, "unknown");
    status = "canceled";
    side = "A";
    await assert.rejects(adapter.receipt(order), /does not match/);
  } finally {
    globalThis.fetch = original;
  }
});
