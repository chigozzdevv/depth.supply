import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { test } from "node:test";
import {
  EventEmitter,
  type Adapter,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { connectWallet, watchConnection } from "@/shared/depth/wallet";

function adapter(): Adapter {
  return Object.assign(new EventEmitter(), { connected: false }) as Adapter;
}

test("manual connection selects the adapter and calls connect before the click returns", async () => {
  const wallet = adapter();
  const name = "Phantom" as WalletName;
  let selected: WalletName | undefined;
  let connectCalls = 0;
  let autoCalls = 0;
  let resolve!: () => void;
  const approval = new Promise<void>((done) => {
    resolve = done;
  });
  Object.assign(wallet, {
    name,
    connect: () => {
      assert.equal(selected, name);
      connectCalls++;
      return approval;
    },
    autoConnect: async () => {
      autoCalls++;
    },
  });
  const pending = connectWallet(wallet, (name) => {
    selected = name;
  });
  assert.equal(connectCalls, 1);
  assert.equal(autoCalls, 0);
  assert.equal(pending, approval);
  resolve();
  await pending;
});

test("a rejected wallet approval reaches the connection dialog", async () => {
  const wallet = adapter();
  const rejected = new Error("User rejected the request");
  Object.assign(wallet, {
    name: "Phantom" as WalletName,
    connect: async () => {
      throw rejected;
    },
  });
  await assert.rejects(
    connectWallet(wallet, () => {}),
    (error) => error === rejected,
  );
});

test("an unanswered wallet connection expires once and removes its listeners", async () => {
  const wallet = adapter();
  let expired = 0;
  const stop = watchConnection(wallet, () => expired++, 5);
  await wait(15);
  assert.equal(expired, 1);
  assert.equal(wallet.listenerCount("connect"), 0);
  assert.equal(wallet.listenerCount("disconnect"), 0);
  stop();
  await wait(10);
  assert.equal(expired, 1);
});

test("a completed or cancelled connection cannot expire later", async () => {
  for (const event of ["connect", "disconnect"] as const) {
    const wallet = adapter();
    let expired = 0;
    watchConnection(wallet, () => expired++, 5);
    wallet.emit(event);
    await wait(15);
    assert.equal(expired, 0);
    assert.equal(wallet.listenerCount("connect"), 0);
    assert.equal(wallet.listenerCount("disconnect"), 0);
  }
});

test("switching wallets disposes the previous connection deadline", async () => {
  let expired = 0;
  const previous = adapter();
  const current = adapter();
  const stop = watchConnection(previous, () => expired++, 5);
  stop();
  const clear = watchConnection(current, () => expired++, 5);
  await wait(15);
  assert.equal(expired, 1);
  assert.equal(previous.listenerCount("connect"), 0);
  clear();
});

test("a connected adapter is not cleared when its event races the deadline", async () => {
  const wallet = adapter();
  let expired = 0;
  watchConnection(wallet, () => expired++, 5);
  Object.assign(wallet, { connected: true });
  await wait(15);
  assert.equal(expired, 0);
});
