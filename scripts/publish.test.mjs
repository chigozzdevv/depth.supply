import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const source = dirname(fileURLToPath(import.meta.url));

function fixture(t, mismatch = false) {
  const root = mkdtempSync(join(tmpdir(), "depth-publish-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const folder of ["scripts", "dist/sdk", "bin"])
    mkdirSync(join(root, folder), { recursive: true });
  copyFileSync(join(source, "publish.mjs"), join(root, "scripts/publish.mjs"));
  const files = ["bindings", "schema", "sdk", "maker-sdk"].map((name) => {
    const folder = join(root, "packages", name);
    mkdirSync(folder, { recursive: true });
    const pkg = { name: `@depthhq/${name}`, version: "0.1.0" };
    writeFileSync(join(folder, "package.json"), JSON.stringify(pkg));
    const bytes = Buffer.from(`release fixture: ${name}`);
    const file = `depthhq-${name}-0.1.0.tgz`;
    writeFileSync(join(root, "dist/sdk", file), bytes);
    return {
      ...pkg,
      file,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    };
  });
  writeFileSync(join(root, "dist/sdk/release.json"), JSON.stringify({ files }));
  const key = `${files[0].name}@${files[0].version}`;
  writeFileSync(
    join(root, "dist/sdk/publishing.json"),
    JSON.stringify({
      [key]: {
        integrity: files[0].integrity,
        acceptedAt: "2026-10-10T00:00:00Z",
        status: "accepted",
      },
    }),
  );
  writeFileSync(
    join(root, "state.json"),
    JSON.stringify({ files, uploads: { [key]: 1 }, views: {}, mismatch }),
  );
  writeFileSync(
    join(root, "bin/npm"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const statePath = path.join(process.cwd(), "state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const [command, value] = process.argv.slice(2);
if (command === "whoami") {
  console.log("release-test");
} else if (command === "view") {
  const file = state.files.find(file => file.name + "@" + file.version === value);
  state.views[value] = (state.views[value] || 0) + 1;
  fs.writeFileSync(statePath, JSON.stringify(state));
  if (state.mismatch) console.log(JSON.stringify("sha512-different"));
  else if (state.uploads[value] && (file !== state.files[0] || state.views[value] > 2))
    console.log(JSON.stringify(file.integrity));
  else {
    console.log(JSON.stringify({ error: { code: "E404" } }));
    process.exitCode = 1;
  }
} else if (command === "publish") {
  const file = state.files.find(file => file.file === path.basename(value));
  const key = file.name + "@" + file.version;
  state.uploads[key] = (state.uploads[key] || 0) + 1;
  fs.writeFileSync(statePath, JSON.stringify(state));
  console.log("Upload accepted");
} else process.exitCode = 1;
`,
    { mode: 0o755 },
  );
  return { root, files };
}

async function run(root) {
  const child = spawn(process.execPath, ["scripts/publish.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      NPM_TOKEN: "release-test-token",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  return { code, output };
}

test("publishing resumes a scanning upload without submitting its version twice", async (t) => {
  const { root, files } = fixture(t);
  const result = await run(root);
  assert.equal(result.code, 0, result.output);
  const state = JSON.parse(readFileSync(join(root, "state.json"), "utf8"));
  const receipts = JSON.parse(
    readFileSync(join(root, "dist/sdk/publishing.json"), "utf8"),
  );
  for (const file of files) {
    const key = `${file.name}@${file.version}`;
    assert.equal(state.uploads[key], 1);
    assert.equal(receipts[key].status, "verified");
    assert.equal(receipts[key].integrity, file.integrity);
  }
  assert.equal(state.views[`${files[0].name}@${files[0].version}`], 3);
  assert.match(result.output, /Resuming accepted @depthhq\/bindings/);
});

test("publishing rejects different registry bytes before uploading any package", async (t) => {
  const { root, files } = fixture(t, true);
  const result = await run(root);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /already has different bytes/);
  const state = JSON.parse(readFileSync(join(root, "state.json"), "utf8"));
  assert.deepEqual(state.uploads, {
    [`${files[0].name}@${files[0].version}`]: 1,
  });
});
