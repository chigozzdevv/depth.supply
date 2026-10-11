import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AccountState,
  BalanceSnapshot,
  DepthClient,
  PositionSnapshot,
} from "@depthhq/sdk";
import { AccountReader, availableBalance } from "@/shared/depth/snapshot";

function fixture() {
  let state: AccountState = {
    id: "balance",
    status: "ready",
    version: 1n,
    slot: 10,
  };
  let balance: BalanceSnapshot = {
    ...state,
    id: "private-view-receipt",
    status: "ready",
    amount: 125_000_000n,
  };
  let position: PositionSnapshot | undefined;
  const calls = { balance: 0, position: 0 };
  let reject = false;
  let pause: Promise<void> | undefined;
  const client = {
    account: () => ({
      state: async () => ({ ...state }),
      summary: async () => {
        calls.balance++;
        if (pause) await pause;
        if (reject) throw new Error("Wallet approval rejected");
        return { ...balance };
      },
    }),
    positions: { list: async () => ({ items: position ? [{}] : [] }) },
    position: () => ({
      summary: async () => {
        calls.position++;
        return { ...position };
      },
    }),
  } as unknown as Pick<DepthClient, "account" | "position" | "positions">;
  return {
    reader: new AccountReader(client),
    calls,
    state: (next: AccountState) => {
      state = next;
    },
    balance: (next: BalanceSnapshot) => {
      balance = next;
    },
    position: (next: PositionSnapshot) => {
      position = next;
    },
    reject: (next: boolean) => {
      reject = next;
    },
    pause: (next: Promise<void>) => {
      pause = next;
    },
  };
}

test("new account discovery proves zero without any private view approval", async () => {
  const f = fixture();
  f.state({ id: "balance", status: "uninitialized", version: 0n, slot: 10 });
  const result = await f.reader.read(() => true);
  assert.equal(result.balance.amount, 0n);
  assert.equal(result.balance.status, "uninitialized");
  assert.equal(result.position, undefined);
  assert.equal(f.calls.balance, 0);
});

test("concurrent account reads share one approval while a later refresh reads the new version", async () => {
  const f = fixture();
  let release!: () => void;
  f.pause(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const first = f.reader.read(() => true);
  const duplicate = f.reader.read(() => true);
  assert.equal(first, duplicate);
  release();
  assert.equal((await first).balance.amount, 125_000_000n);
  assert.equal(f.calls.balance, 1);
  f.state({ id: "balance", status: "ready", version: 2n, slot: 20 });
  f.balance({
    id: "balance",
    status: "ready",
    version: 2n,
    slot: 20,
    amount: 75_000_000n,
  });
  assert.equal((await f.reader.read(() => true)).balance.amount, 75_000_000n);
  assert.equal(f.calls.balance, 2);
});

test("a rejected approval is recoverable only through a new read and never becomes zero", async () => {
  const f = fixture();
  f.reject(true);
  await assert.rejects(
    f.reader.read(() => true),
    /approval rejected/,
  );
  assert.equal(f.calls.balance, 1);
  f.reject(false);
  assert.equal((await f.reader.read(() => true)).balance.amount, 125_000_000n);
});

test("unchanged canonical balance versions reuse the private balance only within this wallet reader", async () => {
  const f = fixture();
  await f.reader.read(() => true);
  await f.reader.read(() => true);
  assert.equal(f.calls.balance, 1);
  const anotherWallet = fixture();
  await anotherWallet.reader.read(() => true);
  assert.equal(anotherWallet.calls.balance, 1);
});

test("disconnecting during balance approval prevents another position request", async () => {
  const f = fixture();
  f.position({
    id: "position",
    status: "ready",
    version: 2n,
    slot: 10,
    collateral: 50_000_000n,
    position: 1n,
  });
  let connected = true;
  let release!: () => void;
  f.pause(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const request = f.reader.read(() => connected);
  await Promise.resolve();
  connected = false;
  release();
  await assert.rejects(request, /Wallet changed/);
  assert.equal(f.calls.position, 0);
});

test("pending accounts, stale views and changed balance versions cannot become usable snapshots", async () => {
  const pending = fixture();
  pending.state({ id: "balance", status: "moving", version: 1n, slot: 10 });
  await assert.rejects(
    pending.reader.read(() => true),
    /processing/,
  );
  assert.equal(pending.calls.balance, 0);
  const stale = fixture();
  stale.balance({ id: "balance", status: "stale", version: 1n, slot: 10 });
  await assert.rejects(
    stale.reader.read(() => true),
    /not ready/,
  );
  const changed = fixture();
  changed.balance({
    id: "balance",
    status: "ready",
    version: 0n,
    slot: 10,
    amount: 200_000_000n,
  });
  await assert.rejects(
    changed.reader.read(() => true),
    /Balance changed/,
  );
});

test("fresh free balance excludes market collateral and is hidden while checking or outdated", async () => {
  const f = fixture();
  f.position({
    id: "position",
    status: "ready",
    version: 2n,
    slot: 10,
    collateral: 50_000_000n,
    position: 1n,
  });
  const snapshot = await f.reader.read(() => true);
  const ready = { ...snapshot, loaded: true, outdated: false, checking: false };
  assert.equal(availableBalance(ready), 125_000_000n);
  assert.equal(availableBalance({ ...ready, outdated: true }), undefined);
  assert.equal(availableBalance({ ...ready, checking: true }), undefined);
  assert.equal(availableBalance({ ...ready, balance: undefined }), undefined);
});
