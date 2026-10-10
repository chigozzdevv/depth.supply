import * as anchor from "@anchor-lang/core";
import { createDepthMaker } from "@depthhq/maker-sdk";
import type { SignedManifest } from "@depthhq/sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { resolvePath, settingPath } from "@/workspace";
import { loadSigner as roleSigner } from "@/workspace/signers";
import { ChainSigner } from "@/server/shared/chain/chain.signer";

export { setTimeout as sleep } from "node:timers/promises";

export const devnetGenesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const marketId = "SOL-USD";
export const defaults = {
  allocation: 3_000_000n,
  tradeNotional: 10_000_000n,
  quoteCapacity: 500_000_000n,
  tierCapacity: 1_000_000_000n,
  maxFee: 1_000_000n,
  slippageBps: 200,
  quoteSeconds: 120,
  attempts: 3,
};

export type ProofRecord = Record<string, unknown> & { stage?: string };
export type Recorder = (entry: ProofRecord) => Promise<void>;
export type Proof = {
  testedAt: string;
  updatedAt: string;
  status: "running" | "complete" | "failed";
  results: ProofRecord[];
  previousRuns?: Proof[];
};
export type ProofMarket = {
  status: Record<string, unknown>;
  incident: Record<string, unknown>;
  oracleAccount: PublicKey;
  oracleTimestamp: anchor.BN;
  oraclePriceE8: anchor.BN;
  fundingIndex: anchor.BN;
  pendingOrders: number;
  activeQuoteCount: number;
  quotedNotional: anchor.BN;
  backstopOffer: PublicKey;
  config: {
    quoteTiers: anchor.BN[];
    initialMarginBps: number;
    maxQuoteLifetimeSeconds: number;
  };
};
export type ProofQuote = {
  status: Record<string, unknown>;
  capacity: anchor.BN;
  tierCount: number;
  requiredMargin: anchor.BN;
  oracleTimestamp: anchor.BN;
  fundingIndex: anchor.BN;
};

export function encode(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function safeError(error: unknown): string {
  return String(error).replace(/(?:https?|wss?):\/\/[^\s]+/g, "[RPC endpoint]");
}

export function isMain(url: string): boolean {
  return (
    !!process.argv[1] &&
    pathToFileURL(resolvePath(process.argv[1])).href === url
  );
}

export function artifactPath(name: string): string {
  return resolvePath(`artifacts/devnet/${name}.json`);
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, encode, 2)}\n`, {
    mode: 0o600,
  });
  await rename(`${path}.tmp`, path);
}

export async function loadSigner(
  name: "deployer" | "app" | "trader",
): Promise<Keypair> {
  return roleSigner(name);
}

export async function devnetConnection(): Promise<Connection> {
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(resolvePath(".env.local"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const url = process.env.SOLANA_RPC_URL;
  assert.ok(url, "SOLANA_RPC_URL is required in the root .env.local");
  const connection = new Connection(url, "confirmed");
  assert.equal(
    await connection.getGenesisHash(),
    devnetGenesis,
    "RPC is not Solana devnet",
  );
  return connection;
}

export async function devnetContext() {
  const connection = await devnetConnection();
  const owner = await loadSigner("deployer");
  const manifest = await readJson<SignedManifest>(
    settingPath(
      "DEPTH_DEVNET_MANIFEST_PATH",
      "deployments/devnet/manifest.json",
    )!,
  );
  const wallet = new anchor.Wallet(owner);
  const maker = await createDepthMaker({
    environment: "devnet",
    connection,
    deployment: { manifest, trustedSigner: owner.publicKey },
    wallet,
  });
  return {
    connection,
    owner,
    wallet,
    manifest,
    maker,
    chain: new ChainSigner(connection, wallet),
  };
}

export async function journal(path: string) {
  const previous = await readJson<Proof>(path).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    },
  );
  const mutationStages = new Set([
    "quote_prepare_requested",
    "submit_prepare",
    "reserve_requested",
    "submit_reserve",
    "trader_deposit_requested",
    "trader_allocation_requested",
    "trade_open_requested",
    "trade_open_submitted",
    "trade_close_requested",
    "trade_close_submitted",
    "trader_release_requested",
    "trader_withdrawal_requested",
    "trade_recovery_required",
    "renew_backstop",
    "release_backstop",
    "resume_market",
  ]);
  assert.ok(
    !previous ||
      previous.status === "complete" ||
      !previous.results.some((entry) =>
        mutationStages.has(String(entry.stage)),
      ),
    "The preceding run needs recovery or reconciliation before another proof can run; use its saved operation IDs and nonces",
  );
  const proof: Proof = {
    testedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "running",
    results: [],
    previousRuns: previous
      ? [
          ...(previous.previousRuns ?? []),
          { ...previous, previousRuns: undefined },
        ]
      : [],
  };
  let pending = Promise.resolve();
  async function save() {
    proof.updatedAt = new Date().toISOString();
    await writeJson(path, proof);
  }
  const record: Recorder = async (entry) => {
    pending = pending.then(async () => {
      const event = { at: new Date().toISOString(), ...entry };
      proof.results.push(event);
      await save();
      console.info(JSON.stringify(event, encode));
    });
    await pending;
  };
  await save();
  return {
    proof,
    record,
    save: async () => {
      await pending;
      await save();
    },
  };
}
