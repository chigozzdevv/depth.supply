import { Keypair } from "@solana/web3.js";
import { createPrivateKey, sign } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authenticateManifest,
  manifestBytes,
  type DeploymentManifest,
} from "@/chain/manifest";

test("deployment manifests reject changed payloads, untrusted signers, and expired releases", async () => {
  const keypair = Keypair.generate();
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(keypair.secretKey.subarray(0, 32)),
    ]),
    format: "der",
    type: "pkcs8",
  });
  const payload = {
    version: 1,
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    program: keypair.publicKey.toBase58(),
  } as DeploymentManifest;
  const signed = {
    payload,
    signer: keypair.publicKey.toBase58(),
    signature: sign(null, manifestBytes(payload), key).toString("base64"),
  };
  await authenticateManifest(signed, keypair.publicKey);
  await assert.rejects(
    authenticateManifest(signed, Keypair.generate().publicKey),
    /not trusted/,
  );
  payload.version = 2;
  await assert.rejects(
    authenticateManifest(signed, keypair.publicKey),
    /invalid/,
  );
  payload.version = 1;
  payload.expiresAt = 1;
  await assert.rejects(
    authenticateManifest(signed, keypair.publicKey),
    /invalid/,
  );
});
