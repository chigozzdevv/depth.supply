import { Keypair } from "@solana/web3.js";
import { SOL_USD_PUSH_ACCOUNT } from "@depth/bindings";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  keeperConfig,
  publisherConfig,
  serverConfig,
} from "@/shared/config/env";

test("shared configuration validates RPC URLs and the keeper signer", () => {
  const keypair = Keypair.generate();
  const config = keeperConfig({
    DEPTH_RPC_URL: "https://rpc.example.test",
    DEPTH_PRICE_ACCOUNT: keypair.publicKey.toBase58(),
    DEPTH_KEEPER_KEYPAIR: JSON.stringify(Array.from(keypair.secretKey)),
  });
  assert.equal(config.rpcUrl, "https://rpc.example.test");
  assert.ok(config.keypair.publicKey.equals(keypair.publicKey));
  assert.equal(
    SOL_USD_PUSH_ACCOUNT.toBase58(),
    "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
  );
  assert.ok(
    keeperConfig({
      DEPTH_RPC_URL: "https://rpc.example.test",
      DEPTH_KEEPER_KEYPAIR: JSON.stringify(Array.from(keypair.secretKey)),
    }).priceAccount.equals(SOL_USD_PUSH_ACCOUNT)
  );
  assert.equal(
    serverConfig({ SOLANA_RPC_URL: "https://rpc.example.test" }).port,
    8787
  );

  assert.throws(
    () => keeperConfig({ DEPTH_RPC_URL: "file:///tmp/rpc" }),
    /HTTP or HTTPS/
  );
  assert.throws(
    () =>
      keeperConfig({
        DEPTH_RPC_URL: "https://rpc.example.test",
        DEPTH_KEEPER_KEYPAIR: "[]",
      }),
    /64-byte JSON array/
  );
});

test("keeper and publisher can load one signer from a local file", () => {
  const signer = Keypair.generate();
  const directory = mkdtempSync(join(tmpdir(), "depth-signer-"));
  const path = join(directory, "wallet.json");
  try {
    writeFileSync(path, JSON.stringify(Array.from(signer.secretKey)), {
      mode: 0o600,
    });
    const env = {
      DEPTH_RPC_URL: "https://rpc.example.test",
      DEPTH_KEEPER_KEYPAIR_PATH: path,
    };
    assert.ok(keeperConfig(env).keypair.publicKey.equals(signer.publicKey));
    assert.ok(
      publisherConfig({
        ...env,
        PYTH_API_KEY: "test-key",
      }).keypair.publicKey.equals(signer.publicKey)
    );
    assert.throws(
      () =>
        keeperConfig({
          ...env,
          DEPTH_KEEPER_KEYPAIR: JSON.stringify(Array.from(signer.secretKey)),
        }),
      /one keeper signer source/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("publisher configuration requires a Pyth key and a valid shard", () => {
  const keypair = Keypair.generate();
  const env = {
    DEPTH_RPC_URL: "https://rpc.example.test",
    DEPTH_KEEPER_KEYPAIR: JSON.stringify(Array.from(keypair.secretKey)),
    PYTH_API_KEY: "test-key",
  };
  const config = publisherConfig(env);
  assert.equal(config.shardId, 0);
  assert.equal(config.publishAfterSeconds, 75);
  assert.throws(
    () => publisherConfig({ ...env, PYTH_API_KEY: "" }),
    /PYTH_API_KEY/
  );
  assert.throws(
    () => publisherConfig({ ...env, DEPTH_PYTH_SHARD_ID: "65536" }),
    /16-bit integer/
  );
});
