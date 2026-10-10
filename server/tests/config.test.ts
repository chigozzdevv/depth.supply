import { Keypair } from "@solana/web3.js";
import { SOL_USD_PUSH_ACCOUNT } from "@depthhq/bindings";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  keeperConfig,
  deploymentPaths,
  oracleMode,
  publisherConfig,
  serverConfig,
} from "@/shared/config/env";

test("deployment paths resolve from the repository root", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  assert.deepEqual(
    deploymentPaths({
      DEPTH_DEVNET_MANIFEST_PATH: "deployments/devnet/manifest.json",
      DEPTH_MAINNET_MANIFEST_PATH: "",
    }),
    {
      devnet: join(root, "deployments/devnet/manifest.json"),
      "mainnet-beta": undefined,
    }
  );
});

test("shared configuration validates RPC URLs and the keeper signer", () => {
  const keypair = Keypair.generate();
  const config = keeperConfig({
    SOLANA_RPC_URL: "https://rpc.example.test",
    DEPTH_PRICE_ACCOUNT: keypair.publicKey.toBase58(),
    DEPTH_KEEPER_KEYPAIR: JSON.stringify(Array.from(keypair.secretKey)),
  });
  assert.equal(config.rpcUrl, "https://rpc.example.test");
  assert.equal(config.oracleMode, "sponsored");
  assert.ok(config.keypair.publicKey.equals(keypair.publicKey));
  assert.equal(
    SOL_USD_PUSH_ACCOUNT.toBase58(),
    "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
  );
  assert.ok(
    keeperConfig({
      SOLANA_RPC_URL: "https://rpc.example.test",
      DEPTH_KEEPER_KEYPAIR: JSON.stringify(Array.from(keypair.secretKey)),
    }).priceAccount.equals(SOL_USD_PUSH_ACCOUNT)
  );
  assert.equal(
    serverConfig({ SOLANA_RPC_URL: "https://rpc.example.test" }).port,
    8787
  );

  assert.throws(
    () => keeperConfig({ SOLANA_RPC_URL: "file:///tmp/rpc" }),
    /HTTP or HTTPS/
  );
  assert.throws(
    () =>
      keeperConfig({
        SOLANA_RPC_URL: "https://rpc.example.test",
        DEPTH_KEEPER_KEYPAIR: "[]",
      }),
    /64-byte JSON array/
  );
  assert.equal(oracleMode({ PYTH_ORACLE_MODE: "hermes" }), "hermes");
  assert.throws(
    () => oracleMode({ PYTH_ORACLE_MODE: "unknown" }),
    /sponsored or hermes/
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
      SOLANA_RPC_URL: "https://rpc.example.test",
      DEPTH_KEEPER_KEYPAIR_PATH: path,
    };
    assert.ok(keeperConfig(env).keypair.publicKey.equals(signer.publicKey));
    const root = fileURLToPath(new URL("../../", import.meta.url));
    assert.ok(
      keeperConfig({
        ...env,
        DEPTH_KEEPER_KEYPAIR_PATH: relative(root, path),
      }).keypair.publicKey.equals(signer.publicKey)
    );
    assert.ok(
      publisherConfig({
        ...env,
        PYTH_ORACLE_MODE: "hermes",
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
    SOLANA_RPC_URL: "https://rpc.example.test",
    DEPTH_KEEPER_KEYPAIR: JSON.stringify(Array.from(keypair.secretKey)),
    PYTH_ORACLE_MODE: "hermes",
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
    () => publisherConfig({ ...env, PYTH_ORACLE_MODE: "sponsored" }),
    /PYTH_ORACLE_MODE=hermes/
  );
  assert.ok(
    keeperConfig({
      ...env,
      PYTH_ORACLE_MODE: "sponsored",
      PYTH_API_KEY: "",
    }).priceAccount.equals(SOL_USD_PUSH_ACCOUNT)
  );
  assert.throws(
    () => publisherConfig({ ...env, DEPTH_PYTH_SHARD_ID: "65536" }),
    /16-bit integer/
  );
});
