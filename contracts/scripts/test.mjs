import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import { resolvePath } from "../../scripts/paths.mjs";
import { createSigner } from "../../scripts/signers.mjs";
import { arciumRuntime } from "../../scripts/toolchain.mjs";
import { stageProgramKeypair } from "./keys.mjs";

if (process.argv[2] === "--docker") {
  process.exit(await runDocker(process.argv[3], process.argv.slice(4)));
}

stageProgramKeypair();
createSigner("localnet");
const runtime = arciumRuntime("build");
const shim = mkdtempSync(join(tmpdir(), "depth-docker-"));
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const docker = execFileSync("which", ["docker"], { encoding: "utf8" }).trim();
writeFileSync(
  join(shim, "docker"),
  `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(
    fileURLToPath(import.meta.url),
  )} --docker ${quote(docker)} "$@"\n`,
  { mode: 0o700 },
);
runtime.env.PATH = `${shim}:${runtime.env.PATH}`;
process.once("exit", () => rmSync(shim, { recursive: true, force: true }));

const address = Keypair.fromSeed(
  createHash("sha256").update("depth.oracle.fixture.v1").digest(),
).publicKey.toBase58();
if (address !== "3RW84c8AwWtLCVyETK2Xtruo9YsgFnMMt6uW2cDN4mzV") {
  throw new Error("Oracle fixture address changed");
}

function writeOracleFixture() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  writePriceUpdate(address, 20_000_000_000n, 20_000_000n, now, "price-update");
  const entryAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.entry.v1").digest(),
  ).publicKey.toBase58();
  writePriceUpdate(
    entryAddress,
    20_000_000_000n,
    20_000_000n,
    now + 50n,
    "price-entry",
  );
  const secondAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.second.v1").digest(),
  ).publicKey.toBase58();
  writePriceUpdate(
    secondAddress,
    20_000_000_000n,
    20_000_000n,
    now + 100n,
    "price-second",
  );
  const exitAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.exit.v1").digest(),
  ).publicKey.toBase58();
  writePriceUpdate(
    exitAddress,
    20_000_000_000n,
    20_000_000n,
    now + 300n,
    "price-exit",
  );
  const renewalAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.renewal.v1").digest(),
  ).publicKey.toBase58();
  writePriceUpdate(
    renewalAddress,
    20_000_000_000n,
    20_000_000n,
    now + 450n,
    "price-renewal",
  );
  const riskAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.risk.v1").digest(),
  ).publicKey.toBase58();
  writePriceUpdate(
    riskAddress,
    20_000_000_000n,
    20_000_000n,
    now + 600n,
    "price-risk",
  );
  const crashAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.crash.v1").digest(),
  ).publicKey.toBase58();
  writePriceUpdate(
    crashAddress,
    100_000_000n,
    1_000_000n,
    now + 750n,
    "price-crash",
  );
  const followupAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.followup.v1").digest(),
  ).publicKey.toBase58();
  writePriceUpdate(
    followupAddress,
    100_000_000n,
    1_000_000n,
    now + 751n,
    "price-followup",
  );
  const defaultAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.default.v1").digest(),
  ).publicKey.toBase58();
  writePriceUpdate(
    defaultAddress,
    10_000_000_000_000n,
    1_000_000_000n,
    now + 300n,
    "price-default",
  );
}

function writePriceUpdate(address, price, confidence, publishTime, filename) {
  const data = Buffer.alloc(134);
  Buffer.from("22f123639d7ef4cd", "hex").copy(data, 0);
  data[40] = 1;
  Buffer.from(
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    "hex",
  ).copy(data, 41);
  data.writeBigInt64LE(price, 73);
  data.writeBigUInt64LE(confidence, 81);
  data.writeInt32LE(-8, 89);
  data.writeBigInt64LE(publishTime, 93);
  data.writeBigInt64LE(publishTime - 1n, 101);
  data.writeBigInt64LE(price, 109);
  data.writeBigUInt64LE(confidence, 117);
  data.writeBigUInt64LE(0n, 125);
  mkdirSync(resolvePath("contracts/artifacts/localnet"), { recursive: true });
  writeFileSync(
    resolvePath(`contracts/artifacts/localnet/${filename}.json`),
    JSON.stringify({
      pubkey: address,
      account: {
        lamports: 1_000_000,
        data: [data.toString("base64"), "base64"],
        owner: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
        executable: false,
        rentEpoch: 0,
      },
    }),
  );
}

function runDocker(command, args) {
  const index = args.indexOf("-f");
  const path = index >= 0 ? resolve(args[index + 1]) : undefined;
  if (
    args[0] === "compose" &&
    args.includes("up") &&
    path === resolvePath("contracts/artifacts/docker-compose-arx-env.yml")
  ) {
    const compose = readFileSync(path, "utf8");
    const subnet = compose.match(/subnet: ([\d./]+)/)?.[1];
    if (subnet) {
      const ids = execFileSync(command, ["network", "ls", "-q"], {
        encoding: "utf8",
      })
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const networks = ids.length
        ? JSON.parse(
            execFileSync(command, ["network", "inspect", ...ids], {
              encoding: "utf8",
            }),
          )
        : [];
      const network = networks.find(
        (value) =>
          value.Name !== "artifacts_arx_network" &&
          value.IPAM?.Config?.some((item) => item.Subnet === subnet),
      );
      if (network) {
        const prefix = subnet.split(".").slice(0, 3).join(".");
        const addresses = new Set(
          Object.values(network.Containers ?? {}).map(
            (container) => container.IPv4Address.split("/")[0],
          ),
        );
        for (const suffix of [99, 100, 101]) {
          if (addresses.has(`${prefix}.${suffix}`))
            throw new Error("Arcium test addresses are already occupied");
        }
        // Reuse the subnet without changing or stopping its existing containers.
        writeFileSync(
          path,
          compose.replace(
            /^networks:[\s\S]*?(?=services:)/,
            `networks:\n  arx_network:\n    external: true\n    name: ${network.Name}\n\n`,
          ),
        );
      }
    }
  }
  const child = spawn(command, args, { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

function run(args, testFile, scenario) {
  return new Promise((resolve) => {
    const child = spawn(runtime.command, ["test", ...args], {
      stdio: "inherit",
      cwd: resolvePath("contracts"),
      env: {
        ...runtime.env,
        DEPTH_TEST_FILE: testFile,
        DEPTH_TEST_SCENARIO: scenario ?? "",
      },
    });
    child.on("error", (error) => {
      process.stderr.write(`${error.message}\n`);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const args = process.argv.slice(2);
const selected = args.indexOf("--test-name");
const testFile = selected < 0 ? null : args[selected + 1];
if (selected >= 0 && !["base", "trade"].includes(testFile)) {
  throw new Error("Unknown test suite");
}
const arciumArgs =
  selected < 0
    ? args
    : args.filter((_, index) => index !== selected && index !== selected + 1);
const tradeArgs = [...arciumArgs];
for (const option of ["--skip-build", "--skip-keygen"]) {
  if (!tradeArgs.includes(option)) tradeArgs.push(option);
}
const suites = testFile
  ? [[testFile, arciumArgs, process.env.DEPTH_TEST_SCENARIO]]
  : [
      ["base", arciumArgs],
      ["trade", tradeArgs],
      ["trade", tradeArgs, "maker-default"],
    ];
for (const [suite, suiteArgs, scenario] of suites) {
  writeOracleFixture();
  const code = await run(suiteArgs, suite, scenario);
  if (code !== 0) {
    process.exitCode = code;
    break;
  }
}
