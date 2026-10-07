import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const expectedAnchor = readFileSync("Anchor.toml", "utf8").match(
  /anchor_version = "([^"]+)"/
)?.[1];
if (!expectedAnchor) throw new Error("Anchor.toml must pin an Anchor version");
if (
  execFileSync("arcium", ["--version"], { encoding: "utf8" }).trim() !==
  "arcium 0.13.2"
) {
  throw new Error("Arcium CLI 0.13.2 is required to compile Depth circuits");
}
const circuitBase = process.env.DEPTH_CIRCUIT_BASE_URL;
if (circuitBase && new URL(circuitBase).protocol !== "https:") {
  throw new Error("DEPTH_CIRCUIT_BASE_URL must be an HTTPS URL");
}

let path = process.env.PATH;
let tools;
if (
  !execFileSync("anchor", ["--version"], { encoding: "utf8" })
    .trim()
    .endsWith(` ${expectedAnchor}`)
) {
  const pinned = join(homedir(), ".avm", "bin", `anchor-${expectedAnchor}`);
  if (!existsSync(pinned)) throw new Error(`Install Anchor ${expectedAnchor}`);
  tools = mkdtempSync(join(tmpdir(), "depth-build-"));
  symlinkSync(pinned, join(tools, "anchor"));
  path = `${tools}:${path ?? ""}`;
  process.once("exit", () => rmSync(tools, { recursive: true, force: true }));
}

const child = spawn("arcium", ["build", "--skip-keys-sync"], {
  stdio: "inherit",
  env: { ...process.env, PATH: path },
});
child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
