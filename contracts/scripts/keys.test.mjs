import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stageProgramKeypair } from "./keys.mjs";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "depth-identity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, "program.json");
  const target = join(directory, "generated", "depth-keypair.json");
  const key = Keypair.generate();
  writeFileSync(source, JSON.stringify(Array.from(key.secretKey)), {
    mode: 0o600,
  });
  return { source, target, key };
}

test("a cleared build directory is linked back to the durable program identity", (t) => {
  const { source, target, key } = fixture(t);
  stageProgramKeypair(source, target);
  const restored = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(target, "utf8")))
  );
  assert.ok(restored.publicKey.equals(key.publicKey));
  rmSync(join(target, ".."), { recursive: true });
  stageProgramKeypair(source, target);
  assert.ok(readFileSync(target).equals(readFileSync(source)));
});

test("equivalent key formatting is accepted while a different identity is preserved and rejected", (t) => {
  const { source, target, key } = fixture(t);
  const alternate = join(target, "..", "different.json");
  stageProgramKeypair(source, target);
  rmSync(target);
  writeFileSync(target, JSON.stringify(Array.from(key.secretKey), null, 2), {
    mode: 0o600,
  });
  assert.doesNotThrow(() => stageProgramKeypair(source, target));
  const different = Keypair.generate();
  writeFileSync(alternate, JSON.stringify(Array.from(different.secretKey)), {
    mode: 0o600,
  });
  assert.throws(() => stageProgramKeypair(alternate, target), /differs/);
  assert.deepEqual(
    JSON.parse(readFileSync(target, "utf8")),
    Array.from(key.secretKey)
  );
});
