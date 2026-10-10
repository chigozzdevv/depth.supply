import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import { MakerAccess, accessMessage } from "@/hedge/access";
import { hedgeView } from "@/hedge/schema";

test("maker access binds the signed challenge and returned history to the connected wallet", async () => {
  const owner = Keypair.generate().publicKey;
  const original = globalThis.fetch;
  let signed = "";
  let invalid = false;
  const expiresAt = Date.now() + 60000;
  const nonce = "a".repeat(64);
  const token = "b".repeat(64);
  globalThis.fetch = (async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("challenge"))
      return Response.json({
        wallet: owner.toBase58(),
        nonce,
        expiresAt,
        message: invalid
          ? "Sign a different message"
          : accessMessage(owner.toBase58(), nonce, expiresAt),
      });
    if (path.endsWith("session")) {
      assert.equal(JSON.parse(String(init!.body)).nonce, nonce);
      return Response.json({ token, expiresAt: Date.now() + 900000 });
    }
    assert.equal(
      (init!.headers as Record<string, string>).authorization,
      `Bearer ${token}`,
    );
    return Response.json({
      enabled: false,
      maker: owner.toBase58(),
      snapshot: null,
    });
  }) as typeof fetch;
  const access = new MakerAccess({
    serviceUrl: "https://depth.example",
    wallet: {
      publicKey: owner,
      signMessage: async (message) => {
        signed = new TextDecoder().decode(message);
        return new Uint8Array(64);
      },
    },
  });
  try {
    await assert.rejects(access.summary(), /Authorize/);
    await access.authorize();
    assert.equal(signed, accessMessage(owner.toBase58(), nonce, expiresAt));
    assert.equal((await access.summary()).enabled, false);
    access.disconnect();
    await assert.rejects(access.summary(), /Authorize/);
    invalid = true;
    signed = "";
    await assert.rejects(access.authorize(), /challenge is invalid/);
    assert.equal(signed, "");
  } finally {
    globalThis.fetch = original;
  }
});

test("malformed or cross-wallet hedge responses cannot reach the maker UI", () => {
  const owner = Keypair.generate().publicKey.toBase58();
  assert.throws(
    () =>
      hedgeView({ enabled: false, maker: "another", snapshot: null }, owner),
    /another wallet/,
  );
  const snapshot = {
    venue: "hyperliquid",
    network: "testnet",
    account: `0x${"1".repeat(40)}`,
    updatedAt: Date.now(),
    phase: "balanced",
    history: [],
    depthPosition: "10",
  };
  assert.equal(
    hedgeView({ enabled: true, maker: owner, snapshot }, owner).snapshot!
      .depthPosition,
    "10",
  );
  assert.throws(
    () =>
      hedgeView(
        {
          enabled: true,
          maker: owner,
          snapshot: { ...snapshot, depthPosition: "1e9" },
        },
        owner,
      ),
    /invalid/,
  );
  assert.throws(
    () =>
      hedgeView(
        {
          enabled: true,
          maker: owner,
          snapshot: { ...snapshot, history: [{}] },
        },
        owner,
      ),
    /invalid/,
  );
});
