import * as anchor from "@anchor-lang/core";
import { RescueCipher, x25519 } from "@arcium-hq/client";
import {
  DEPTH_PROGRAM_ID,
  circuits,
  marketAccountAddress,
  marketAddress,
} from "@depth/bindings";
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
      client.position.id.equals(marketAccountAddress(wallet.publicKey))
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
      encryptionNonce
    );
    assert.deepEqual(
      circuits.OrderInput.unpack(cipher.decrypt(ciphertext, encryptionNonce)),
      fields
    );
    assert.throws(() => u64(-1n, "notional"));
    assert.throws(() => u64(1.5 as unknown as bigint, "notional"));
    assert.equal(
      u64((1n << 64n) - 1n, "notional").toString(),
      ((1n << 64n) - 1n).toString()
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
        error instanceof DepthError && error.code === "ORDER_REJECTED"
    );
    owner = PublicKey.unique();
    await assert.rejects(operation.status(), /Order record is unavailable/);
  });

  test("wait timeout keeps an unfinished order queued", async () => {
    const operation = new DepthOperation(
      PublicKey.unique(),
      undefined,
      {} as anchor.Program,
      {} as Connection
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
        error.message === "Trade has not finalized yet"
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
        error instanceof DepthError && error.code === "ORDER_CANCEL_UNAVAILABLE"
    );
  });
});

test("operation polling resumes after a transient RPC failure without submitting another order", async () => {
  const operation = new DepthOperation(
    PublicKey.unique(),
    undefined,
    {} as anchor.Program,
    {} as Connection
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
    "filled"
  );
  assert.equal(attempts, 2);
});

test("private fill result resumes its view and closes it before returning", async () => {
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
    close: async () => {
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
    }
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
      error instanceof DepthError && error.code === "FILL_VIEW_PENDING"
  );
  await assert.rejects(
    operation.privateResult(),
    (error: unknown) =>
      error instanceof DepthError && error.code === "FILL_VIEW_CLEANUP_PENDING"
  );
  assert.equal((await operation.privateResult()).size, 100n);
  assert.ok(
    (await operation.privateResult()).positionId.equals(
      marketAccountAddress(owner)
    )
  );
  assert.equal((await operation.privateResult()).size, 100n);
  assert.equal(requests, 1);
  assert.equal(reads, 2);
  assert.equal(closes, 2);
});
