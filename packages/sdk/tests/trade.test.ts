import * as anchor from "@anchor-lang/core";
import { getArciumProgram, RescueCipher, x25519 } from "@arcium-hq/client";
import {
  DEPTH_PROGRAM_ID,
  circuits,
  marketAccountAddress,
  marketAddress,
} from "@depthhq/bindings";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { randomBytes } from "node:crypto";
import { DepthClient, DepthError, DepthOperation } from "@/index";
import { encodeSide, u64 } from "@/trade/input";
import type { DepthView } from "@/view/view";

describe("trader wire and operation lifecycle", () => {
  test("position handle initializes with the wallet account", () => {
    const wallet = new anchor.Wallet(Keypair.generate());
    const constructor = DepthClient as unknown as new (options: {
      wallet: anchor.Wallet;
      connection: Connection;
      deployment: { localnet: true };
    }) => DepthClient;
    const client = new constructor({
      wallet,
      connection: new Connection("http://127.0.0.1:8899"),
      deployment: { localnet: true },
    });
    assert.ok(
      client.position.id.equals(marketAccountAddress(wallet.publicKey)),
    );
  });

  test("encrypts a packed short order using the generated Arcis layout", () => {
    assert.equal(encodeSide("long"), 1n);
    assert.equal(encodeSide("short"), -1n);
    const secret = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(secret);
    const cipher = new RescueCipher(x25519.getSharedSecret(secret, publicKey));
    const encryptionNonce = randomBytes(16);
    const fields = {
      side: encodeSide("short"),
      amount: 1n,
      margin: 2n,
      limit_price: 3n,
      max_fee: 4n,
      intent: 2n,
      version: 5n,
    };
    const ciphertext = cipher.encrypt(
      circuits.OrderInput.pack(fields),
      encryptionNonce,
    );
    assert.deepEqual(
      circuits.OrderInput.unpack(cipher.decrypt(ciphertext, encryptionNonce)),
      fields,
    );
    assert.throws(() => u64(-1n, "notional"));
    assert.throws(() => u64(1.5 as unknown as bigint, "notional"));
    assert.equal(
      u64((1n << 64n) - 1n, "notional").toString(),
      ((1n << 64n) - 1n).toString(),
    );
    assert.throws(() => u64(1n << 64n, "notional"));
  });

  test("reads terminal status from the confirmed onchain order", async () => {
    const id = PublicKey.unique();
    let state = "matching";
    let owner = DEPTH_PROGRAM_ID;
    const program = {
      programId: DEPTH_PROGRAM_ID,
      coder: {
        accounts: {
          decode: () => ({
            status: { [state]: {} },
            kind: { trade: {} },
            trader: PublicKey.unique(),
          }),
        },
      },
    } as unknown as anchor.Program;
    const connection = {
      getAccountInfoAndContext: async () => ({
        context: { slot: 91 },
        value: { owner, data: Buffer.alloc(8) },
      }),
    } as unknown as Connection;
    const operation = new DepthOperation(id, undefined, program, connection);
    assert.equal((await operation.status()).status, "queued");
    state = "filled";
    const final = await operation.wait({ timeoutMs: 100 });
    assert.equal(final.status, "finalized");
    assert.equal(final.outcome, "filled");
    assert.equal(final.slot, 91);
    assert.equal((await operation.confirm()).orderId.toBase58(), id.toBase58());
    state = "rejected";
    await assert.rejects(
      operation.confirm({ timeoutMs: 0 }),
      (error: unknown) =>
        error instanceof DepthError && error.code === "ORDER_REJECTED",
    );
    owner = PublicKey.unique();
    await assert.rejects(operation.status(), /Order record is unavailable/);
  });

  test("wait timeout keeps an unfinished order queued", async () => {
    const operation = new DepthOperation(
      PublicKey.unique(),
      undefined,
      {} as anchor.Program,
      {} as Connection,
    );
    operation.status = async () => ({
      id: operation.id.toBase58(),
      kind: "trade",
      owner: PublicKey.unique().toBase58(),
      status: "queued",
      slot: 12,
    });
    const snapshot = await operation.wait({ timeoutMs: 0 });
    assert.equal(snapshot.status, "queued");
    assert.equal(snapshot.outcome, undefined);
    await assert.rejects(
      operation.confirm({ timeoutMs: 0 }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Trade has not finalized yet",
    );
  });

  test("the owner cancels a matched trade through its canonical accounts", async () => {
    const id = PublicKey.unique();
    const owner = PublicKey.unique();
    const market = marketAddress();
    let trader = owner;
    let state = "matched";
    let submissions = 0;
    let accounts: Record<string, PublicKey> | undefined;
    const program = {
      programId: DEPTH_PROGRAM_ID,
      provider: { wallet: { publicKey: owner } },
      coder: {
        accounts: {
          decode: () => ({
            trader,
            market,
            kind: { trade: {} },
            status: { [state]: {} },
          }),
        },
      },
      methods: {
        cancelOrder: () => ({
          accountsPartial: (value: Record<string, PublicKey>) => {
            accounts = value;
            return {
              rpc: async () => {
                submissions += 1;
                state = "cancelled";
                return "cancel-signature";
              },
            };
          },
        }),
      },
    } as unknown as anchor.Program;
    const connection = {
      getAccountInfoAndContext: async () => ({
        context: { slot: 45 },
        value: { owner: DEPTH_PROGRAM_ID, data: Buffer.alloc(8) },
      }),
    } as unknown as Connection;
    const operation = new DepthOperation(id, undefined, program, connection);
    assert.equal((await operation.cancel()).outcome, "cancelled");
    assert.equal(submissions, 1);
    assert.ok(accounts?.actor.equals(owner));
    assert.ok(accounts?.marketAccount.equals(marketAccountAddress(owner)));
    assert.ok(accounts?.order.equals(id));
    assert.equal((await operation.cancel()).outcome, "cancelled");
    assert.equal(submissions, 1);
    trader = PublicKey.unique();
    await assert.rejects(
      operation.cancel(),
      (error: unknown) =>
        error instanceof DepthError &&
        error.code === "ORDER_CANCEL_UNAVAILABLE",
    );
  });
});

test("position summary retries a risk check that wins the view submission race", async () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const constructor = DepthClient as unknown as new (options: {
    wallet: anchor.Wallet;
    connection: Connection;
    deployment: { localnet: true };
  }) => DepthClient;
  const client = new constructor({
    wallet,
    connection: new Connection("http://127.0.0.1:8899"),
    deployment: { localnet: true },
  });
  (client as unknown as { read: () => Promise<unknown> }).read = async () => ({
    owner: wallet.publicKey,
    market: marketAddress(),
    status: { ready: {} },
    version: new anchor.BN(1),
  });
  let attempts = 0;
  let closed = false;
  client.requestMarketView = async () => {
    if (++attempts === 1) {
      throw Object.assign(
        new Error("Market account is processing another operation"),
        {
          error: { errorCode: { code: "WrongMarketAccountStatus" } },
        },
      );
    }
    return {
      deferClose: async () => {},
      wait: async () => ({
        status: "ready",
        id: PublicKey.unique().toBase58(),
        version: 1n,
        slot: 1,
        collateral: 10n,
        position: 0n,
      }),
      close: async () => {
        closed = true;
        return "close-signature";
      },
    } as unknown as DepthView;
  };
  const position = await client.position.summary({ timeoutMs: 3_000 });
  assert.equal(position.status, "ready");
  assert.equal(position.position, 0n);
  assert.equal(attempts, 2);
  assert.equal(closed, false);
});

test("operation polling resumes after a transient RPC failure without submitting another order", async () => {
  const operation = new DepthOperation(
    PublicKey.unique(),
    undefined,
    {} as anchor.Program,
    {} as Connection,
  );
  let attempts = 0;
  operation.status = async () => {
    if (++attempts === 1) throw new Error("temporary RPC outage");
    return {
      id: operation.id.toBase58(),
      kind: "trade",
      owner: PublicKey.unique().toBase58(),
      status: "finalized",
      outcome: "filled",
      slot: 12,
    };
  };
  assert.equal(
    (await operation.wait({ timeoutMs: 1000, pollMs: 100 })).outcome,
    "filled",
  );
  assert.equal(attempts, 2);
});

test("private fill result resumes its view and schedules cleanup before returning", async () => {
  const id = PublicKey.unique();
  const viewId = PublicKey.unique();
  let requests = 0;
  let reads = 0;
  let closes = 0;
  const view = {
    id: viewId,
    wait: async () =>
      ++reads === 1
        ? { status: "pending" as const, id: viewId.toBase58(), slot: 4 }
        : {
            status: "ready" as const,
            id: viewId.toBase58(),
            slot: 5,
            size: 100n,
          },
    deferClose: async () => {
      if (++closes === 1) throw new Error("temporary RPC error");
      return "close-signature";
    },
  } as unknown as DepthView;
  const owner = PublicKey.unique();
  const operation = new DepthOperation(
    id,
    undefined,
    { programId: DEPTH_PROGRAM_ID } as anchor.Program,
    {
      getAccountInfo: async () => ({ owner: DEPTH_PROGRAM_ID }),
    } as unknown as Connection,
    async () => {
      requests += 1;
      return view;
    },
  );
  operation.status = async () => ({
    id: id.toBase58(),
    kind: "trade",
    owner: owner.toBase58(),
    status: "finalized",
    outcome: "filled",
    slot: 4,
  });
  await assert.rejects(
    operation.privateResult({ timeoutMs: 0 }),
    (error: unknown) =>
      error instanceof DepthError && error.code === "FILL_VIEW_PENDING",
  );
  await assert.rejects(
    operation.privateResult(),
    (error: unknown) =>
      error instanceof DepthError && error.code === "FILL_VIEW_CLEANUP_PENDING",
  );
  assert.equal((await operation.privateResult()).size, 100n);
  assert.ok(
    (await operation.privateResult()).positionId.equals(
      marketAccountAddress(owner),
    ),
  );
  assert.equal((await operation.privateResult()).size, 100n);
  assert.equal(requests, 1);
  assert.equal(reads, 2);
  assert.equal(closes, 2);
});

test("submission waits through quote replacement and validates the new market snapshot", async () => {
  const wallet = new anchor.Wallet(Keypair.generate());
  const Constructor = DepthClient as unknown as new (
    options: DepthClient["options"],
  ) => DepthClient;
  const client = new Constructor({
    wallet,
    connection: new Connection("http://localhost:8899"),
    deployment: { localnet: true },
  });
  const app = PublicKey.unique();
  let reads = 0;
  let enabled = true;
  client.market = async () => ({
    address: marketAddress(),
    slot: 1,
    state: {
      status: { active: {} },
      pendingOrders: 0,
      activeQuoteCount: ++reads === 1 ? 0 : 1,
      oracleTimestamp: new anchor.BN(Math.floor(Date.now() / 1000)),
      config: { maxOracleAgeSeconds: 60, maxOrderQueueSeconds: 120 },
    } as unknown as Awaited<ReturnType<DepthClient["market"]>>["state"],
  });
  const internal = client as unknown as {
    read: (name: string) => Promise<unknown>;
    waitForMarket: (
      input: { marketId: "SOL-USD"; maxFee: bigint; validForSeconds: number },
      app: PublicKey,
      intent: "increase",
    ) => Promise<unknown>;
  };
  internal.read = async (name) =>
    name === "Protocol"
      ? { tradingEnabled: enabled }
      : name === "MarketAccount"
        ? {
            owner: wallet.publicKey,
            market: marketAddress(),
            status: { ready: {} },
          }
        : { active: true, app };
  const terms = {
    marketId: "SOL-USD" as const,
    maxFee: 1n,
    validForSeconds: 120,
  };
  await internal.waitForMarket(terms, app, "increase");
  assert.equal(reads, 2);
  enabled = false;
  await assert.rejects(
    internal.waitForMarket(terms, app, "increase"),
    /Market is paused/,
  );
  assert.equal(reads, 3);
});

test("full closes retain price caps, deadlines and nonces across a quote rotation", async () => {
  for (const explicit of [false, true]) {
    for (const failure of [
      "none",
      "rotation",
      "busy",
      "uncertain",
      "exhausted",
    ]) {
      const rotation = failure === "rotation";
      const wallet = new anchor.Wallet(Keypair.generate());
      const connection = new Connection("http://localhost:8899");
      const Constructor = DepthClient as unknown as new (
        options: DepthClient["options"],
      ) => DepthClient;
      const appId = PublicKey.unique();
      const client = new Constructor({
        wallet,
        connection,
        appId,
        deployment: { localnet: true },
      });
      const mxeSecret = x25519.utils.randomSecretKey();
      const mxeKey = x25519.getPublicKey(mxeSecret);
      const arcium = getArciumProgram(client.provider);
      const mxe = await arcium.coder.accounts.encode("mxeAccount", {
        padding: 0,
        cluster: 1,
        keygenOffset: new anchor.BN(0),
        keyRecoveryInitOffset: new anchor.BN(0),
        mxeProgramId: DEPTH_PROGRAM_ID,
        authority: null,
        utilityPubkeys: {
          set: [
            {
              x25519Pubkey: Array.from(mxeKey),
              ed25519VerifyingKey: Array(32).fill(0),
              elgamalPubkey: Array(32).fill(0),
              pubkeyValidityProof: Array(64).fill(0),
            },
          ],
        },
        lutOffsetSlot: new anchor.BN(0),
        computationDefinitions: [],
        status: { active: {} },
        bump: 1,
        currentEpochRecoveryRewards: new anchor.BN(0),
        recoveryRewardsEpoch: { 0: new anchor.BN(0) },
      });
      connection.getAccountInfo = async () => null;
      connection.getAccountInfoAndContext = async () => ({
        context: { slot: 1 },
        value: {
          owner: arcium.programId,
          data: mxe,
          lamports: 1,
          executable: false,
        },
      });
      const now = Math.floor(Date.now() / 1000);
      const quote = PublicKey.unique();
      const market = {
        revision: new anchor.BN(1),
        status: { active: {} },
        pendingOrders: 0,
        activeQuoteCount: 1,
        activeQuotes: [quote],
        backstopOffer: PublicKey.unique(),
        oracleTimestamp: new anchor.BN(now),
        oraclePriceE8: new anchor.BN(10_000_000_000),
        config: { maxOracleAgeSeconds: 600, maxOrderQueueSeconds: 300 },
      };
      let latest = { ...market, oraclePriceE8: new anchor.BN(9_900_000_000) };
      const position = {
        id: client.position.id.toBase58(),
        status: "ready" as const,
        slot: 1,
        version: 7n,
        collateral: 20_000_000n,
        position: 1_000_000_000n,
      };
      client.position.summary = async () => position;
      const internal = client as unknown as {
        ensureBalanceReady: () => Promise<void>;
        ensureMarketReady: () => Promise<void>;
        waitForMarket: () => Promise<unknown[]>;
        queue: () => Promise<object>;
      };
      internal.ensureBalanceReady = internal.ensureMarketReady = async () => {};
      internal.waitForMarket = async () => [
        { state: market },
        { tradingEnabled: true },
        {
          owner: wallet.publicKey,
          market: marketAddress(),
          status: { ready: {} },
          version: new anchor.BN(7),
        },
        { app: appId, active: true, feeBps: 1, version: new anchor.BN(1) },
      ];
      internal.queue = async () => ({});
      connection.getMultipleAccountsInfo = async () =>
        [0, 1, 2].map((i) => ({
          owner: DEPTH_PROGRAM_ID,
          data: Buffer.from([i]),
          lamports: 1,
          executable: false,
        }));
      let submitted: unknown[] = [];
      const requests: unknown[][] = [];
      const remaining: PublicKey[][] = [];
      const builder = {
        accountsPartial: () => builder,
        remainingAccounts: (accounts: { pubkey: PublicKey }[]) => {
          remaining.push(accounts.map((account) => account.pubkey));
          return builder;
        },
        rpc: async () => {
          if (failure === "uncertain") throw new Error("Failed to fetch");
          if (failure === "busy" && requests.length === 1)
            throw anchor.AnchorError.parse([
              "Program log: AnchorError occurred. Error Code: WrongOrderStatus. Error Number: 6023. Error Message: The order is in the wrong state.",
            ]);
          if ((rotation && requests.length === 1) || failure === "exhausted") {
            latest = {
              ...latest,
              activeQuotes: [PublicKey.unique()],
              oraclePriceE8: new anchor.BN(9_800_000_000),
            };
            throw anchor.AnchorError.parse([
              "Program log: AnchorError occurred. Error Code: WrongQuoteSnapshot. Error Number: 6026. Error Message: The supplied quotes differ from the complete market snapshot.",
            ]);
          }
          return "submitted";
        },
      };
      Object.defineProperty(client, "program", {
        value: {
          coder: {
            accounts: {
              decode: (name: string) =>
                name === "market"
                  ? latest
                  : {
                      status: { active: {} },
                      expiry: new anchor.BN(now + 120),
                      market: marketAddress(),
                    },
            },
          },
          methods: {
            submitOrder: (...args: unknown[]) => {
              submitted = args;
              requests.push(args);
              return builder;
            },
          },
        },
      });
      const pending = client.trade.close({
        marketId: "SOL-USD",
        maxFee: 100_000n,
        validForSeconds: 300,
        ...(explicit ? { worstPriceE8: 9_800_000_000n } : { slippageBps: 50 }),
      });
      if (failure === "uncertain" || failure === "exhausted") {
        await assert.rejects(
          pending,
          (error: unknown) =>
            error instanceof DepthError &&
            error.code ===
              (failure === "uncertain"
                ? "SUBMISSION_UNCONFIRMED"
                : "SUBMISSION_REJECTED"),
        );
        assert.equal(requests.length, failure === "uncertain" ? 1 : 3);
        for (const request of requests) {
          assert.equal(String(request[1]), String(requests[0][1]));
          assert.equal(String(request[5]), String(requests[0][5]));
        }
        continue;
      }
      const operation = await pending;
      assert.equal(operation.signature, "submitted");
      assert.equal(requests.length, rotation || failure === "busy" ? 2 : 1);
      if (rotation) {
        assert.equal(String(requests[0][1]), String(requests[1][1]));
        assert.equal(String(requests[0][5]), String(requests[1][5]));
        assert.ok(remaining[1][1].equals(latest.activeQuotes[0]));
        assert.ok(!remaining[0][1].equals(remaining[1][1]));
      }
      const cipher = new RescueCipher(
        x25519.getSharedSecret(
          mxeSecret,
          new Uint8Array(submitted[9] as number[]),
        ),
      );
      const order = circuits.OrderInput.unpack(
        cipher.decrypt(
          submitted[8] as number[][],
          (submitted[10] as anchor.BN).toArrayLike(Buffer, "le", 16),
        ),
      );
      assert.equal(
        order.limit_price,
        explicit ? 9_800_000_000n : 9_850_500_000n,
      );
      assert.equal(order.side, -1n);
      assert.equal(order.intent, 2n);
      assert.equal(order.amount, 0n);
      assert.equal(order.version, 7n);
      assert.equal(order.margin, 20_000_000n);
      assert.equal(order.max_fee, 100_000n);
    }
  }
});
