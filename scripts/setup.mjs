import { rmSync, writeFileSync, mkdirSync } from "node:fs";
import { resolvePath } from "./paths.mjs";
import {
  arciumSpec,
  arciumTarget,
  installExecutable,
  resolveArcium,
} from "./toolchain.mjs";

const check = process.argv.includes("--check");
if (process.argv.slice(2).some((value) => value !== "--check")) {
  throw new Error("Usage: setup.mjs [--check]");
}
const target = arciumTarget();
const lock = resolvePath(".tools/arcium/.setup.lock");
if (!check) {
  mkdirSync(resolvePath(".tools/arcium"), { recursive: true });
  try {
    writeFileSync(lock, String(process.pid), { flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "Arcium setup is already running; inspect .tools/arcium/.setup.lock",
      );
    throw error;
  }
}
try {
  for (const role of ["build", "deploy"]) {
    const spec = arciumSpec(role, target);
    const status = check
      ? "verified"
      : await installExecutable(spec, spec.path);
    resolveArcium(role);
    console.log(`Arcium ${role}: ${spec.version} (${target}, ${status})`);
  }
} finally {
  if (!check) rmSync(lock, { force: true });
}
