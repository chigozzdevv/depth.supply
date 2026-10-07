import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { resolvePath } from "./paths.mjs";

export const toolchain = JSON.parse(
  readFileSync(resolvePath("toolchain.json"), "utf8"),
);

export function arciumTarget(platform = process.platform, arch = process.arch) {
  if (platform === "darwin" && arch === "arm64") return "aarch64_macos";
  if (platform === "linux" && arch === "x64") return "x86_64_linux";
  throw new Error(`Arcium has no pinned binary for ${platform}/${arch}`);
}

export function arciumSpec(role, target = arciumTarget()) {
  if (!["build", "deploy"].includes(role))
    throw new Error(`Unknown Arcium role: ${role}`);
  const version = toolchain.arcium[role];
  const sha256 = toolchain.arcium.targets[target]?.[version];
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    !/^[a-f0-9]{64}$/.test(sha256 ?? "")
  ) {
    throw new Error(`Missing Arcium ${role} pin for ${target}`);
  }
  return {
    version,
    sha256,
    url: `https://bin.arcium.com/download/arcium_${target}_${version}`,
    path: resolvePath(`.tools/arcium/${version}/${target}/arcium`),
  };
}

export function verifyExecutable(path, spec) {
  let bytes;
  try {
    bytes = readFileSync(path);
    accessSync(path, constants.X_OK);
  } catch {
    throw new Error("Arcium executable is unavailable; run pnpm tools:setup");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== spec.sha256) {
    throw new Error(
      `Arcium ${spec.version} executable checksum differs from its toolchain pin`,
    );
  }
  let version;
  try {
    version = execFileSync(path, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, ARCIUM_NO_UPDATE_CHECK: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(
      `Unable to run the pinned Arcium ${spec.version} executable`,
    );
  }
  if (version !== `arcium ${spec.version}`) {
    throw new Error(
      `Expected Arcium ${spec.version}; executable reports ${version}`,
    );
  }
  return path;
}

function findExecutable(command, env) {
  if (isAbsolute(command) || command.includes("/")) return resolvePath(command);
  for (const directory of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = resolve(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return undefined;
}

export function resolveArcium(role, env = process.env) {
  const spec = arciumSpec(role);
  const override = env[`DEPTH_ARCIUM_${role.toUpperCase()}_CLI`];
  const path = override ? findExecutable(override, env) : spec.path;
  if (!path) throw new Error(`Arcium ${role} override is unavailable`);
  return verifyExecutable(path, spec);
}

export async function installExecutable(spec, destination, fetcher = fetch) {
  if (existsSync(destination)) {
    try {
      verifyExecutable(destination, spec);
      return "verified";
    } catch {}
  }
  if (new URL(spec.url).protocol !== "https:")
    throw new Error("Arcium downloads must use HTTPS");
  const response = await fetcher(spec.url, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.body)
    throw new Error(`Arcium download failed: HTTP ${response.status}`);
  if (response.url && new URL(response.url).protocol !== "https:") {
    throw new Error("Arcium download redirected away from HTTPS");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 64 * 1024 * 1024)
      throw new Error("Arcium download exceeds the binary size limit");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (createHash("sha256").update(bytes).digest("hex") !== spec.sha256) {
    throw new Error(
      `Downloaded Arcium ${spec.version} checksum differs from its toolchain pin`,
    );
  }
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
    chmodSync(temporary, 0o755);
    verifyExecutable(temporary, spec);
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
  return "installed";
}

export function arciumRuntime(role, env = process.env) {
  const command = resolveArcium(role, env);
  const expectedAnchor = readFileSync(
    resolvePath("contracts/Anchor.toml"),
    "utf8",
  ).match(/anchor_version = "([^"]+)"/)?.[1];
  if (!expectedAnchor)
    throw new Error("Anchor.toml must pin an Anchor version");
  const candidates = [
    findExecutable("anchor", env),
    join(homedir(), ".avm", "bin", `anchor-${expectedAnchor}`),
  ];
  const anchor = candidates.find((candidate) => {
    if (!candidate) return false;
    try {
      return (
        execFileSync(candidate, ["--version"], {
          encoding: "utf8",
          timeout: 10_000,
        }).trim() === `anchor-cli ${expectedAnchor}`
      );
    } catch {
      return false;
    }
  });
  if (!anchor) throw new Error(`Install Anchor ${expectedAnchor}`);
  const directory = mkdtempSync(join(tmpdir(), "depth-toolchain-"));
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    symlinkSync(command, join(directory, "arcium"));
    symlinkSync(anchor, join(directory, "anchor"));
  } catch (error) {
    cleanup();
    throw error;
  }
  process.once("exit", cleanup);
  return {
    command,
    env: {
      ...env,
      ARCIUM_NO_UPDATE_CHECK: "1",
      PATH: `${directory}${delimiter}${env.PATH ?? ""}`,
    },
    cleanup,
  };
}
