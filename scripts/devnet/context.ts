import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import { createDepthMaker } from "@depthhq/maker-sdk";
import type { SignedManifest } from "@depthhq/sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createPrivateKey, sign } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolvePath, settingPath } from "@/workspace";
import { loadSigner as roleSigner } from "@/workspace/signers";
import { ChainSigner } from "@/server/shared/chain/chain.signer";
import { chainConnection } from "@/server/shared/chain/connection";

export { setTimeout as sleep } from "node:timers/promises";

export const devnetGenesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const marketId = "SOL-USD";
export const defaults = {
  allocation: 3_000_000n,
  tradeNotional: 10_000_000n,
  quoteCapacity: 500_000_000n,
  tierCapacity: 1_000_000_000n,
  maxFee: 1_000_000n,
  slippageBps: 50,
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

export function workflowPath(): string {
  return resolvePath("data/devnet/quote.json");
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

export async function devnetConnection(service = false): Promise<Connection> {
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(resolvePath(".env.local"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (service) {
    const connection = chainConnection(
      `${(process.env.DEPTH_SERVICE_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "")}/rpc`,
    );
    assert.equal(
      await connection.getGenesisHash(),
      devnetGenesis,
      "RPC is not Solana devnet",
    );
    return connection;
  }
  const url = process.env.SOLANA_RPC_URL;
  assert.ok(url, "SOLANA_RPC_URL is required in the root .env.local");
  const programData = PublicKey.findProgramAddressSync(
    [DEPTH_PROGRAM_ID.toBuffer()],
    new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
  )[0].toBase58();
  const connection = new Connection(url, {
    commitment: "confirmed",
    fetch: async (input, init) => {
      const request = JSON.parse(String(init?.body));
      const large =
        ["getAccountInfo", "getMultipleAccounts"].includes(request.method) &&
        !request.params?.[1]?.dataSlice &&
        JSON.stringify(request.params?.[0]).includes(programData);
      const signal = AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(20000),
      ]);
      try {
        const response = await fetch(input, { ...init, signal });
        if (large && !response.ok) throw new Error("Program read unavailable");
        return large
          ? new Response(await response.arrayBuffer(), {
              status: response.status,
              headers: response.headers,
            })
          : response;
      } catch (error) {
        if (!large || init?.signal?.aborted) throw error;
        return fetch("https://api.devnet.solana.com", {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(20000),
          ]),
        });
      }
    },
  });
  assert.equal(
    await connection.getGenesisHash(),
    devnetGenesis,
    "RPC is not Solana devnet",
  );
  return connection;
}

export async function devnetContext(service = false) {
  const connection = await devnetConnection(service);
  const owner = await loadSigner("deployer");
  const manifest = await readJson<SignedManifest>(
    settingPath(
      "DEPTH_DEVNET_MANIFEST_PATH",
      "deployments/devnet/manifest.json",
    )!,
  );
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(owner.secretKey.subarray(0, 32)),
    ]),
    format: "der",
    type: "pkcs8",
  });
  const wallet = Object.assign(new anchor.Wallet(owner), {
    signMessage: async (message: Uint8Array) =>
      new Uint8Array(sign(null, Buffer.from(message), key)),
  });
  const maker = await createDepthMaker({
    environment: "devnet",
    connection,
    deployment: { manifest, trustedSigner: owner.publicKey },
    wallet,
    serviceUrl: process.env.DEPTH_SERVICE_URL ?? "http://127.0.0.1:8787",
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

export async function journal(path: string, resume = false) {
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
    "renew_backstop",
    "release_backstop",
    "resume_market",
  ]);
  if (resume)
    assert.ok(
      previous && previous.status !== "complete",
      "There is no interrupted proof to resume",
    );
  assert.ok(
    resume ||
      !previous ||
      previous.status === "complete" ||
      (previous.status === "failed" &&
        previous.results.at(-1)?.stage === "reconciled") ||
      !previous.results.some((entry) =>
        mutationStages.has(String(entry.stage)),
      ),
    "The preceding run needs recovery or reconciliation before another proof can run; use its saved operation IDs and nonces",
  );
  const proof: Proof = resume
    ? previous!
    : {
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
  proof.status = "running";
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
