import Fastify from "fastify";
import { DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import { deploymentRoute } from "@/features/deployment/deployment.route";
import { DeploymentService } from "@/features/deployment/deployment.service";

test("public deployment route serves only the configured matching release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-manifest-"));
  const path = join(directory, "devnet.json");
  const app = Fastify();
  const root = fileURLToPath(new URL("../../", import.meta.url));
  deploymentRoute(
    app,
    new DeploymentService({
      devnet: relative(root, path),
      "mainnet-beta": undefined,
    }),
  );
  try {
    const unavailable = await app.inject("/.well-known/depth/devnet.json");
    assert.equal(unavailable.statusCode, 503);
    const signed = {
      signer: "release-signer",
      signature: "release-signature",
      payload: {
        genesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
        program: DEPTH_PROGRAM_ID.toBase58(),
        expiresAt: Math.floor(Date.now() / 1000) + 60,
      },
    };
    await writeFile(path, JSON.stringify(signed));
    const available = await app.inject("/.well-known/depth/devnet.json");
    assert.equal(available.statusCode, 200);
    assert.deepEqual(available.json(), signed);
    assert.equal(available.headers["cache-control"], "no-store");
    signed.payload.genesisHash = "wrong";
    await writeFile(path, JSON.stringify(signed));
    assert.equal(
      (await app.inject("/.well-known/depth/devnet.json")).statusCode,
      500,
    );
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
