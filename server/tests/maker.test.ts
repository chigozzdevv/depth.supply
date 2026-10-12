import assert from "node:assert/strict";
import { createPrivateKey, sign } from "node:crypto";
import { test } from "node:test";
import Fastify from "fastify";
import { Keypair } from "@solana/web3.js";
import { MakerService } from "@/features/maker/maker.service";
import { makerRoute } from "@/features/maker/maker.route";
import { WalletAccess } from "@/shared/http/access";
import { hedgeConfig } from "@/shared/config/env";

const signature = (wallet: Keypair, message: string) =>
  sign(
    null,
    Buffer.from(message),
    createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        Buffer.from(wallet.secretKey.subarray(0, 32)),
      ]),
      format: "der",
      type: "pkcs8",
    }),
  ).toString("base64");

test("maker inventory is available only after its owner signs a single-use challenge", async () => {
  const wallet = Keypair.generate();
  const app = Fastify();
  makerRoute(
    app,
    new MakerService(wallet.publicKey, () => ({
      maker: wallet.publicKey.toBase58(),
      enabled: true,
      snapshot: null,
    })),
  );
  try {
    assert.equal(
      (await app.inject({ url: "/v1/maker/hedges" })).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          url: `/v1/maker/challenge?wallet=${Keypair.generate().publicKey}`,
        })
      ).statusCode,
      403,
    );
    const challenge = (
      await app.inject({
        url: `/v1/maker/challenge?wallet=${wallet.publicKey}`,
      })
    ).json();
    const body = {
      nonce: challenge.nonce,
      signature: signature(wallet, challenge.message),
    };
    const session = await app.inject({
      method: "POST",
      url: "/v1/maker/session",
      payload: body,
    });
    assert.equal(session.statusCode, 200);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/maker/session",
          payload: body,
        })
      ).statusCode,
      401,
    );
    const response = await app.inject({
      url: "/v1/maker/hedges",
      headers: { authorization: `Bearer ${session.json().token}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().maker, wallet.publicKey.toBase58());
    const denied = await app.inject({
      url: "/v1/maker/hedges",
      headers: { authorization: `Bearer ${"0".repeat(64)}` },
    });
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.body.includes(wallet.publicKey.toBase58()), false);
  } finally {
    await app.close();
  }
});

test("wrong-wallet signatures and expired challenges cannot open a maker session", () => {
  const wallet = Keypair.generate();
  const access = new WalletAccess(wallet.publicKey);
  const challenge = access.challenge(wallet.publicKey.toBase58())!;
  assert.equal(
    access.session(
      challenge.nonce,
      signature(Keypair.generate(), challenge.message),
    ),
    undefined,
  );
  const second = access.challenge(wallet.publicKey.toBase58())!;
  const original = Date.now;
  Date.now = () => second.expiresAt + 1;
  try {
    assert.equal(
      access.session(second.nonce, signature(wallet, second.message)),
      undefined,
    );
  } finally {
    Date.now = original;
  }
});

test("hedging stays opt-in, requires its own agent key and rejects cross-network settings", () => {
  assert.equal(hedgeConfig({}), undefined);
  assert.throws(
    () => hedgeConfig({ DEPTH_MAKER_HEDGE: "hyperliquid" }),
    /ACCOUNT_ADDRESS/,
  );
  const env = {
    DEPTH_MAKER_HEDGE: "hyperliquid",
    HYPERLIQUID_ACCOUNT_ADDRESS: `0x${"2".repeat(40)}`,
    HYPERLIQUID_AGENT_PRIVATE_KEY: `0x${"1".repeat(64)}`,
  };
  assert.equal(hedgeConfig(env)!.network, "testnet");
  assert.equal(hedgeConfig(env)!.policy.ratioBps, 10000);
  assert.equal(hedgeConfig(env)!.policy.maxUnhedgedMs, 90000);
  assert.equal(
    hedgeConfig({
      ...env,
      DEPTH_ENVIRONMENT: "mainnet-beta",
      HYPERLIQUID_NETWORK: "mainnet",
    })!.policy.maxUnhedgedMs,
    15000,
  );
  assert.throws(
    () => hedgeConfig({ ...env, HYPERLIQUID_NETWORK: "mainnet" }),
    /networks must match/,
  );
  assert.throws(
    () => hedgeConfig({ ...env, DEPTH_HEDGE_WAIT_MS: "1000" }),
    /batching/,
  );
});
