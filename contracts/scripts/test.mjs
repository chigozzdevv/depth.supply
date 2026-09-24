import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";

const address = Keypair.fromSeed(
  createHash("sha256").update("depth.oracle.fixture.v1").digest()
).publicKey.toBase58();
if (address !== "3RW84c8AwWtLCVyETK2Xtruo9YsgFnMMt6uW2cDN4mzV") {
  throw new Error("Oracle fixture address changed");
}

function writeOracleFixture() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  writePriceUpdate(address, 20_000_000_000n, 20_000_000n, now, "price-update");
  const secondAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.second.v1").digest()
  ).publicKey.toBase58();
  writePriceUpdate(
    secondAddress,
    20_000_000_000n,
    20_000_000n,
    now + 100n,
    "price-second"
  );
  const crashAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.crash.v1").digest()
  ).publicKey.toBase58();
  writePriceUpdate(
    crashAddress,
    100_000_000n,
    1_000_000n,
    now + 101n,
    "price-crash"
  );
  const followupAddress = Keypair.fromSeed(
    createHash("sha256").update("depth.oracle.followup.v1").digest()
  ).publicKey.toBase58();
  writePriceUpdate(
    followupAddress,
    100_000_000n,
    1_000_000n,
    now + 102n,
    "price-followup"
  );
}

function writePriceUpdate(address, price, confidence, publishTime, filename) {
  const data = Buffer.alloc(134);
  Buffer.from("22f123639d7ef4cd", "hex").copy(data, 0);
  data[40] = 1;
  Buffer.from(
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    "hex"
  ).copy(data, 41);
  data.writeBigInt64LE(price, 73);
  data.writeBigUInt64LE(confidence, 81);
  data.writeInt32LE(-8, 89);
  data.writeBigInt64LE(publishTime, 93);
  data.writeBigInt64LE(publishTime - 1n, 101);
  data.writeBigInt64LE(price, 109);
  data.writeBigUInt64LE(confidence, 117);
  data.writeBigUInt64LE(0n, 125);
  mkdirSync("artifacts/localnet", { recursive: true });
  writeFileSync(
    `artifacts/localnet/${filename}.json`,
    JSON.stringify({
      pubkey: address,
      account: {
        lamports: 1_000_000,
        data: [data.toString("base64"), "base64"],
        owner: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
        executable: false,
        rentEpoch: 0,
      },
    })
  );
}

function run(args, testFile) {
  return new Promise((resolve) => {
    const child = spawn("arcium", ["test", ...args], {
      stdio: "inherit",
      env: { ...process.env, DEPTH_TEST_FILE: testFile },
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
const suites = testFile
  ? [[testFile, arciumArgs]]
  : [
      ["base", arciumArgs],
      ["trade", [...arciumArgs, "--skip-build", "--skip-keygen"]],
    ];
for (const [suite, suiteArgs] of suites) {
  writeOracleFixture();
  const code = await run(suiteArgs, suite);
  if (code !== 0) {
    process.exitCode = code;
    break;
  }
}
