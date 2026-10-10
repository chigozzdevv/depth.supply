import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.slice(2);
if (check.length && (check.length !== 1 || check[0] !== "--check"))
  throw new Error("Usage: pnpm sdk:publish [--check]");
const envPath = join(root, ".env.local");
const token =
  process.env.NPM_TOKEN ||
  (existsSync(envPath)
    ? parseEnv(readFileSync(envPath, "utf8")).NPM_TOKEN
    : undefined);
if (token && /\s/.test(token)) throw new Error("NPM_TOKEN contains whitespace");
const folder = mkdtempSync(join(tmpdir(), "depth-publish-"));
const env = { ...process.env };
if (token) {
  const config = join(folder, "npmrc");
  writeFileSync(config, "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n", {
    mode: 0o600,
  });
  env.NPM_TOKEN = token;
  env.NPM_CONFIG_USERCONFIG = config;
}
const registry = [
  "--registry=https://registry.npmjs.org/",
  "--prefer-online",
  "--fetch-retries=0",
  "--fetch-timeout=20000",
];
const scrub = (value) =>
  token ? String(value).split(token).join("[redacted]") : String(value);
function npm(args) {
  try {
    return execFileSync("npm", [...args, ...registry], {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    let output;
    try {
      output = JSON.parse(String(error.stdout));
    } catch {}
    if (args[0] === "view" && output?.error?.code === "E404") return null;
    throw new Error(scrub(error.stderr || "npm command failed"));
  }
}

try {
  const release = JSON.parse(
    readFileSync(join(root, "dist", "sdk", "release.json"), "utf8"),
  );
  const names = ["bindings", "schema", "sdk", "maker-sdk"];
  if (release.files?.length !== names.length)
    throw new Error("Run pnpm sdk:pack to create a complete release");
  const files = names.map((name, index) => {
    const pkg = JSON.parse(
      readFileSync(join(root, "packages", name, "package.json"), "utf8"),
    );
    const record = release.files[index];
    if (!/^@[a-z0-9._-]+\/[a-z0-9._-]+$/.test(pkg.name))
      throw new Error("SDK packages need a valid npm scope");
    const file = `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`;
    if (
      record.name !== pkg.name ||
      record.version !== pkg.version ||
      record.file !== file
    )
      throw new Error("Release metadata changed; run pnpm sdk:pack");
    const path = join(root, "dist", "sdk", file);
    const bytes = readFileSync(path);
    if (createHash("sha256").update(bytes).digest("hex") !== record.sha256)
      throw new Error(`Release hash mismatch for ${pkg.name}`);
    return {
      name: pkg.name,
      version: pkg.version,
      path,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    };
  });
  const receiptsPath = join(root, "dist", "sdk", "publishing.json");
  const receipts = existsSync(receiptsPath)
    ? JSON.parse(readFileSync(receiptsPath, "utf8"))
    : {};
  function accepted(file) {
    return (
      receipts[`${file.name}@${file.version}`]?.integrity === file.integrity
    );
  }
  function record(file, status) {
    const key = `${file.name}@${file.version}`;
    receipts[key] = {
      integrity: file.integrity,
      acceptedAt: receipts[key]?.acceptedAt || new Date().toISOString(),
      status,
    };
    const temporary = `${receiptsPath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(receipts, null, 2)}\n`);
    renameSync(temporary, receiptsPath);
  }
  async function verify(file) {
    const deadline = Date.now() + 10 * 60_000;
    while (true) {
      const remote = npm([
        "view",
        `${file.name}@${file.version}`,
        "dist.integrity",
        "--json",
      ]);
      if (remote !== null) {
        if (JSON.parse(remote) !== file.integrity)
          throw new Error(`Registry integrity mismatch for ${file.name}`);
        record(file, "verified");
        return;
      }
      if (Date.now() >= deadline)
        throw new Error(
          `${file.name}@${file.version} is still processing; rerun pnpm sdk:publish to resume verification`,
        );
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  console.info(`Publishing account: ${npm(["whoami"])}`);
  const pending = [];
  for (const file of files) {
    const remote = npm([
      "view",
      `${file.name}@${file.version}`,
      "dist.integrity",
      "--json",
    ]);
    if (remote !== null) {
      if (JSON.parse(remote) !== file.integrity)
        throw new Error(
          `${file.name}@${file.version} already has different bytes`,
        );
      console.info(`Verified existing ${file.name}@${file.version}`);
    } else pending.push(file);
  }
  if (check.length) {
    const processing = pending.filter(accepted).length;
    console.info(
      `${pending.length - processing} verified packages ready to publish`,
    );
    if (processing) console.info(`${processing} accepted uploads awaiting npm`);
  } else {
    for (const file of pending) {
      if (!accepted(file)) {
        npm(["publish", file.path, "--access", "public"]);
        record(file, "accepted");
        console.info(`Upload accepted for ${file.name}@${file.version}`);
      } else console.info(`Resuming accepted ${file.name}@${file.version}`);
    }
    for (const file of pending) {
      await verify(file);
      console.info(`Published and verified ${file.name}@${file.version}`);
    }
  }
} finally {
  rmSync(folder, { recursive: true, force: true });
}
