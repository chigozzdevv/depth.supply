import { spawn } from "node:child_process";
import { stageProgramKeypair } from "./keys.mjs";
import { resolvePath } from "../../scripts/paths.mjs";
import { arciumRuntime } from "../../scripts/toolchain.mjs";

stageProgramKeypair();

const devnet = process.argv.includes("--devnet");
if (process.argv.slice(2).some((arg) => arg !== "--devnet"))
  throw new Error("Usage: build.mjs [--devnet]");
const runtime = arciumRuntime("build");
const circuitBase = process.env.DEPTH_CIRCUIT_BASE_URL;
if (circuitBase && new URL(circuitBase).protocol !== "https:") {
  throw new Error("DEPTH_CIRCUIT_BASE_URL must be an HTTPS URL");
}

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: resolvePath("contracts"),
      env: runtime.env,
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
const code = await run(runtime.command, [
  "build",
  "--skip-keys-sync",
  ...(devnet ? ["--skip-program"] : []),
]);
process.exitCode =
  code === 0 && devnet
    ? await run("anchor", ["build", "--", "--features", "devnet"])
    : code;
