import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { repositoryRoot } from "./paths.mjs";
import { createSigner, loadSigner, readSigner } from "./signers.mjs";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "depth-signers-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { path: join(directory, "wallet.json"), key: Keypair.generate() };
}

test("role loading supports relocated files and verifies the public identity", (t) => {
  const { path, key } = fixture(t);
  writeFileSync(path, JSON.stringify(Array.from(key.secretKey)), {
    mode: 0o600,
  });
  const env = { DEPTH_DEPLOYER_KEYPAIR_PATH: relative(repositoryRoot, path) };
  assert.ok(
    loadSigner("deployer", {
      env,
      expectedPublicKey: key.publicKey,
    }).publicKey.equals(key.publicKey),
  );
  assert.throws(
    () =>
      loadSigner("deployer", {
        env,
        expectedPublicKey: Keypair.generate().publicKey,
      }),
    /expected public identity/,
  );
  assert.deepEqual(
    JSON.parse(readFileSync(path, "utf8")),
    Array.from(key.secretKey),
  );
});

test("invalid JSON, bytes, and secret/public mismatches never expose key material", (t) => {
  const { path, key } = fixture(t);
  const invalid = Array.from(key.secretKey);
  invalid[63] ^= 1;
  for (const value of [
    "private-secret-invalid-json",
    "[]",
    JSON.stringify(Array(64).fill(256)),
    JSON.stringify(invalid),
  ]) {
    writeFileSync(path, value);
    assert.throws(
      () => readSigner(path),
      (error) => {
        assert.match(error.message, /valid 64-byte JSON array/);
        assert.ok(!error.message.includes(value));
        return true;
      },
    );
  }
});

test("missing deployment keys cannot be generated or replaced", (t) => {
  const { path } = fixture(t);
  const env = {
    DEPTH_DEPLOYER_KEYPAIR_PATH: path,
    DEPTH_PROGRAM_KEYPAIR_PATH: path,
  };
  assert.throws(() => loadSigner("deployer", { env }), /file is unavailable/);
  for (const role of ["deployer", "program", "keeper"]) {
    assert.throws(() => createSigner(role, { env }), /Provision/);
  }
  assert.ok(!existsSync(path));
});

test("explicit demo creation is private and idempotent and refuses invalid existing keys", (t) => {
  const { path } = fixture(t);
  const options = { env: { DEPTH_DEMO_APP_PATH: path } };
  const first = createSigner("app", options);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const original = readFileSync(path);
  assert.ok(createSigner("app", options).publicKey.equals(first.publicKey));
  assert.ok(readFileSync(path).equals(original));
  writeFileSync(path, "invalid-existing-key");
  assert.throws(() => createSigner("app", options), /valid 64-byte/);
  assert.equal(readFileSync(path, "utf8"), "invalid-existing-key");
});

test("keeper requires exactly one signer source and expected identities cannot be recreated", (t) => {
  const { path, key } = fixture(t);
  const inline = JSON.stringify(Array.from(key.secretKey));
  assert.ok(
    loadSigner("keeper", {
      env: { DEPTH_KEEPER_KEYPAIR: inline },
    }).publicKey.equals(key.publicKey),
  );
  assert.throws(
    () => loadSigner("keeper", { env: {} }),
    /DEPTH_KEEPER_KEYPAIR_PATH is required/,
  );
  assert.throws(
    () =>
      loadSigner("keeper", {
        env: { DEPTH_KEEPER_KEYPAIR: inline, DEPTH_KEEPER_KEYPAIR_PATH: path },
      }),
    /one keeper signer source/,
  );
  assert.throws(
    () =>
      createSigner("trader", {
        env: { DEPTH_DEMO_TRADER_PATH: path },
        expectedPublicKey: key.publicKey,
      }),
    /existing trader identity/,
  );
  assert.ok(!existsSync(path));
});
