import { Keypair, PublicKey } from "@solana/web3.js";
import { DEPTH_PROGRAM_ID } from "@depth/bindings";
import { createPrivateKey, sign } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConnection } from "@/chain/environment";
import { manifestBytes } from "@/chain/manifest";
import { DepthError } from "@/operation/error";

const devnet = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

test("environment setup reads a signed release and binds it to the chain authority", async () => {
  const signer = Keypair.generate();
  const dataAddress = PublicKey.unique();
  const programData = Buffer.alloc(45);
  programData.writeUInt32LE(3);
  programData[12] = 1;
  signer.publicKey.toBuffer().copy(programData, 13);
  const program = Buffer.alloc(36);
  program.writeUInt32LE(2);
  dataAddress.toBuffer().copy(program, 4);
  let genesis = devnet;
  const connection = {
    getGenesisHash: async () => genesis,
    getAccountInfo: async (key: PublicKey) =>
      key.equals(DEPTH_PROGRAM_ID)
        ? { executable: true, owner: loader, data: program }
        : key.equals(dataAddress)
        ? { executable: false, owner: loader, data: programData }
        : null,
  } as unknown as import("@solana/web3.js").Connection;
  const payload = {
    version: 1,
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    genesisHash: devnet,
    program: DEPTH_PROGRAM_ID.toBase58(),
  };
  const privateKey = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(signer.secretKey.subarray(0, 32)),
    ]),
    format: "der",
    type: "pkcs8",
  });
  const manifest = {
    payload,
    signer: signer.publicKey.toBase58(),
    signature: sign(null, manifestBytes(payload), privateKey).toString(
      "base64",
    ),
  };
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(manifest));
  try {
    const resolved = await resolveConnection({
      environment: "devnet",
      connection,
    });
    assert.equal(resolved.connection, connection);
    assert.equal(resolved.serviceUrl, "https://depth.supply");
    assert.equal("manifest" in resolved.deployment, true);
    genesis = "wrong";
    await assert.rejects(
      resolveConnection({ environment: "devnet", connection }),
      (error: unknown) =>
        error instanceof DepthError && error.code === "DEPLOYMENT_UNAVAILABLE",
    );
    genesis = devnet;
    programData.set(PublicKey.unique().toBuffer(), 13);
    await assert.rejects(
      resolveConnection({ environment: "devnet", connection }),
      (error: unknown) =>
        error instanceof DepthError && error.code === "DEPLOYMENT_UNAVAILABLE",
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("localnet needs no published manifest and rejects a remote unsigned policy", async () => {
  const local = await resolveConnection({ environment: "localnet" });
  assert.equal(local.connection.rpcEndpoint, "http://127.0.0.1:8899");
  assert.deepEqual(local.deployment, { localnet: true });
  await assert.rejects(
    resolveConnection({
      environment: "devnet",
      connection: {
        getGenesisHash: async () => devnet,
        getAccountInfo: async () => null,
      } as never,
      deployment: { localnet: true },
    }),
    (error: unknown) =>
      error instanceof DepthError && error.code === "DEPLOYMENT_UNAVAILABLE",
  );
});
