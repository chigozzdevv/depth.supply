import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ViewCache, DeviceViews } from "@/view/cache";
import type { BalanceSnapshot, PositionSnapshot } from "@/view/view";

globalThis.indexedDB = fakeIndexedDB;

const balance: BalanceSnapshot = {
  status: "ready",
  id: "receipt",
  slot: 10,
  version: 2n,
  amount: 123_000_000n,
  readAt: 100,
};

test("private views survive a cache restart with encrypted storage and a non-extractable device key", async () => {
  const storage = new DeviceViews();
  const first = new ViewCache("devnet:program:wallet", storage);
  await first.set("balance", "account", balance);
  const envelope = await storage.read("devnet:program:wallet:balance:account");
  assert.ok(envelope && envelope.data.byteLength > 0);
  assert.doesNotMatch(
    new TextDecoder().decode(envelope.data),
    /123000000|amount|receipt/,
  );
  const second = new ViewCache("devnet:program:wallet", new DeviceViews());
  assert.deepEqual(await second.get("balance", "account", 2n), balance);
  assert.equal(await second.get("balance", "account", 3n), undefined);
  const proposed = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const key = await storage.key("devnet:program:wallet", proposed);
  assert.equal(key.extractable, false);
  await assert.rejects(crypto.subtle.exportKey("raw", key));
});

test("wallet, network, account and view kind are authenticated and corrupted ciphertext is rejected", async () => {
  const storage = new DeviceViews();
  const scope = "network:program:owner";
  await new ViewCache(scope, storage).set("balance", "account", balance);
  const envelope = (await storage.read(`${scope}:balance:account`))!;
  for (const [foreignScope, kind, account] of [
    ["network:program:other", "balance", "account"],
    ["other:program:owner", "balance", "account"],
    [scope, "market", "account"],
    [scope, "balance", "other"],
  ] as const) {
    await storage.write(`${foreignScope}:${kind}:${account}`, envelope);
    assert.equal(
      await new ViewCache(foreignScope, storage).get(kind, account, 2n),
      undefined,
    );
  }
  const altered = envelope.data.slice(0);
  new Uint8Array(altered)[0] ^= 1;
  await storage.write(`${scope}:balance:account`, {
    ...envelope,
    data: altered,
  });
  assert.equal(
    await new ViewCache(scope, storage).get("balance", "account", 2n),
    undefined,
  );
});

test("position views retain signed amounts and never reuse a pending or old version", async () => {
  const snapshot: PositionSnapshot = {
    status: "ready",
    id: "position",
    version: 7n,
    slot: 12,
    collateral: 20_000_000n,
    reserved: 0n,
    position: -1_000_000_000n,
    entryPriceE8: 12_000_000_000n,
    fundingCheckpoint: -20n,
  };
  const cache = new ViewCache("position", new DeviceViews());
  await cache.set("market", "account", snapshot);
  assert.deepEqual(
    await new ViewCache("position", new DeviceViews()).get(
      "market",
      "account",
      7n,
    ),
    snapshot,
  );
  assert.equal(await cache.get("market", "account", 8n), undefined);
  await cache.set("market", "pending", { ...snapshot, status: "pending" });
  assert.equal(await cache.get("market", "pending", 7n), undefined);
});
