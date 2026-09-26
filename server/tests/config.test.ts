import { Keypair } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { keeperConfig, serverConfig } from "@/shared/config/env";

test("shared configuration validates RPC URLs and the keeper signer", () => {
  const keypair = Keypair.generate();
  const config = keeperConfig({
    DEPTH_RPC_URL: "https://rpc.example.test",
    DEPTH_KEEPER_KEYPAIR: JSON.stringify(Array.from(keypair.secretKey)),
  });
  assert.equal(config.rpcUrl, "https://rpc.example.test");
  assert.ok(config.keypair.publicKey.equals(keypair.publicKey));
  assert.equal(
    serverConfig({ SOLANA_RPC_URL: "https://rpc.example.test" }).port,
    8787,
  );

  assert.throws(
    () => keeperConfig({ DEPTH_RPC_URL: "file:///tmp/rpc" }),
    /HTTP or HTTPS/,
  );
  assert.throws(
    () =>
      keeperConfig({
        DEPTH_RPC_URL: "https://rpc.example.test",
        DEPTH_KEEPER_KEYPAIR: "[]",
      }),
    /64-byte JSON array/,
  );
});
