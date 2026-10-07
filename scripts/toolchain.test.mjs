import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  arciumSpec,
  arciumTarget,
  installExecutable,
  verifyExecutable,
} from "./toolchain.mjs";

function fixture(t, version = "0.13.2") {
  const directory = mkdtempSync(join(tmpdir(), "depth-toolchain-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bytes = Buffer.from(`#!/bin/sh\nprintf 'arcium ${version}\\n'\n`);
  const spec = {
    version: "0.13.2",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    url: "https://bin.arcium.com/test-fixture",
  };
  return { directory, path: join(directory, "arcium"), bytes, spec };
}

test("compiler and deploy pins cover supported platforms and reject unknown targets", () => {
  assert.equal(arciumTarget("darwin", "arm64"), "aarch64_macos");
  assert.equal(arciumTarget("linux", "x64"), "x86_64_linux");
  assert.throws(() => arciumTarget("darwin", "x64"), /no pinned binary/);
  for (const target of ["aarch64_macos", "x86_64_linux"]) {
    assert.equal(arciumSpec("build", target).version, "0.13.2");
    assert.equal(arciumSpec("deploy", target).version, "0.15.0");
  }
  assert.throws(() => arciumSpec("unknown"), /Unknown Arcium role/);
});

test("executables must pass both checksum and version verification", (t) => {
  const { path, bytes, spec } = fixture(t);
  writeFileSync(path, bytes, { mode: 0o755 });
  assert.equal(verifyExecutable(path, spec), path);
  assert.throws(
    () => verifyExecutable(path, { ...spec, sha256: "0".repeat(64) }),
    /checksum differs/,
  );
  assert.throws(
    () => verifyExecutable(path, { ...spec, version: "0.15.0" }),
    /Expected Arcium 0.15.0/,
  );
});

test("verified downloads install atomically and repeated setup uses the verified cache", async (t) => {
  const { path, bytes, spec } = fixture(t);
  let downloads = 0;
  const fetcher = async () => {
    downloads += 1;
    return new Response(bytes);
  };
  assert.equal(await installExecutable(spec, path, fetcher), "installed");
  assert.equal(verifyExecutable(path, spec), path);
  assert.equal(await installExecutable(spec, path, fetcher), "verified");
  assert.equal(downloads, 1);
});

test("bad downloads and incompatible binaries preserve the previous installation", async (t) => {
  const { directory, path, bytes, spec } = fixture(t, "0.15.0");
  const previous = Buffer.from("previous installation");
  writeFileSync(path, previous, { mode: 0o755 });
  await assert.rejects(
    () =>
      installExecutable(
        spec,
        path,
        async () => new Response("tampered binary"),
      ),
    /checksum differs/,
  );
  assert.ok(readFileSync(path).equals(previous));
  await assert.rejects(
    () => installExecutable(spec, path, async () => new Response(bytes)),
    /Expected Arcium 0.13.2/,
  );
  assert.ok(readFileSync(path).equals(previous));
  assert.deepEqual(readdirSync(directory), ["arcium"]);
  await assert.rejects(
    () =>
      installExecutable({ ...spec, url: "http://example.test/arcium" }, path),
    /HTTPS/,
  );
});
