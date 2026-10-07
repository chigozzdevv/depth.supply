import { Keypair, PublicKey } from "@solana/web3.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { resolvePath, settingPath } from "./paths.mjs";

const roles = {
  deployer: {
    path: "DEPTH_DEPLOYER_KEYPAIR_PATH",
    fallback: "keys/devnet/deployer.json",
  },
  program: {
    path: "DEPTH_PROGRAM_KEYPAIR_PATH",
    fallback: "keys/devnet/program.json",
  },
  buffer: {
    path: "DEPTH_BUFFER_KEYPAIR_PATH",
    fallback: "keys/devnet/buffer.json",
    create: true,
  },
  app: {
    path: "DEPTH_DEMO_APP_PATH",
    fallback: "keys/devnet/app.json",
    create: true,
  },
  trader: {
    path: "DEPTH_DEMO_TRADER_PATH",
    fallback: "keys/devnet/trader.json",
    create: true,
  },
  localnet: { create: true },
  keeper: { path: "DEPTH_KEEPER_KEYPAIR_PATH", inline: "DEPTH_KEEPER_KEYPAIR" },
};

function roleConfig(role) {
  if (!Object.hasOwn(roles, role))
    throw new Error(`Unknown signer role: ${role}`);
  return roles[role];
}

export function signerPath(role, env = process.env) {
  const config = roleConfig(role);
  if (role === "localnet") {
    const wallet = readFileSync(
      resolvePath("contracts/Anchor.toml"),
      "utf8",
    ).match(/^wallet\s*=\s*"([^"]+)"/m)?.[1];
    if (!wallet)
      throw new Error("Anchor.toml must configure the localnet wallet");
    return resolve(resolvePath("contracts"), wallet);
  }
  const path = settingPath(config.path, config.fallback, env);
  if (!path) throw new Error(`${config.path} is required`);
  return path;
}

function decodeSigner(source, { label = "Signer", expectedPublicKey } = {}) {
  let keypair;
  try {
    const bytes = JSON.parse(source);
    if (
      !Array.isArray(bytes) ||
      bytes.length !== 64 ||
      !bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ) {
      throw new Error();
    }
    keypair = Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch {
    throw new Error(`${label} must be a valid 64-byte JSON array`);
  }
  if (
    expectedPublicKey &&
    !keypair.publicKey.equals(new PublicKey(expectedPublicKey))
  ) {
    throw new Error(`${label} does not match the expected public identity`);
  }
  return keypair;
}

export function readSigner(path, options = {}) {
  let source;
  try {
    source = readFileSync(resolvePath(path), "utf8");
  } catch (error) {
    const unavailable = new Error(
      `${options.label ?? "Signer"} file is unavailable`,
    );
    unavailable.code = error.code;
    throw unavailable;
  }
  return decodeSigner(source, options);
}

export function loadSigner(
  role,
  { env = process.env, expectedPublicKey } = {},
) {
  const config = roleConfig(role);
  const inline = config.inline && env[config.inline];
  if (inline && env[config.path])
    throw new Error(`Configure one ${role} signer source`);
  const options = { label: `${role} signer`, expectedPublicKey };
  if (inline) return decodeSigner(inline, options);
  return readSigner(signerPath(role, env), options);
}

export function createSigner(role, options = {}) {
  if (!roleConfig(role).create)
    throw new Error(`Provision the ${role} signer independently`);
  try {
    return loadSigner(role, options);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (options.expectedPublicKey)
    throw new Error(`Provision the existing ${role} identity`);
  const path = signerPath(role, options.env);
  const keypair = Keypair.generate();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return loadSigner(role, options);
  }
  return keypair;
}
