import { spawn } from "node:child_process";
import { stageProgramKeypair } from "./keys.mjs";
import { resolvePath } from "../../scripts/paths.mjs";
import { arciumRuntime } from "../../scripts/toolchain.mjs";

stageProgramKeypair();

const runtime = arciumRuntime("build");
const circuitBase = process.env.DEPTH_CIRCUIT_BASE_URL;
if (circuitBase && new URL(circuitBase).protocol !== "https:") {
  throw new Error("DEPTH_CIRCUIT_BASE_URL must be an HTTPS URL");
}

const child = spawn(runtime.command, ["build", "--skip-keys-sync"], {
  stdio: "inherit",
  cwd: resolvePath("contracts"),
  env: runtime.env,
});
child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
