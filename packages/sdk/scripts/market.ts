import * as anchor from "@anchor-lang/core";
import {
  DEPTH_IDL,
  marketAddress,
  protocolAddress,
  quoteQueueAddress,
  recoveryConfigAddress,
  solUsdPublishTime,
  SOL_USD_PUSH_ACCOUNT,
} from "@depth/bindings";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { readFile, writeFile } from "node:fs/promises";
import { createRecoveryShares } from "@/recovery/shares";
import type { RecoveryEnvelope } from "@/recovery/shares";

const genesisHash = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const checkOnly = process.argv.includes("--check");
if (process.argv.slice(2).some((value) => value !== "--check")) {
  throw new Error("Usage: market.ts [--check]");
}
const rpc = process.env.SOLANA_RPC_URL;
const committeePath = process.env.DEPTH_RECOVERY_COMMITTEE_PATH;
const envelopePath = process.env.DEPTH_RECOVERY_ENVELOPES_PATH;
const signerPath =
  process.env.DEPTH_DEPLOYER_KEYPAIR_PATH || "target/test-wallet.json";

if (!rpc || new URL(rpc).protocol !== "https:") {
  throw new Error("SOLANA_RPC_URL must be an HTTPS devnet endpoint");
}
if (!committeePath || !envelopePath) {
  throw new Error(
    "Set DEPTH_RECOVERY_COMMITTEE_PATH and DEPTH_RECOVERY_ENVELOPES_PATH",
  );
}

function integer(value: unknown, name: string, max: number): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > max
  ) {
    throw new RangeError(`Invalid ${name}`);
  }
  return value as number;
}

function amount(value: unknown, name: string): anchor.BN {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    BigInt(value) > (1n << 64n) - 1n
  ) {
    throw new RangeError(`Invalid ${name}`);
  }
  return new anchor.BN(value);
}

const rawPolicy = JSON.parse(
  await readFile(
    new URL("../../../contracts/config/devnet-market.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;
const rawTiers = rawPolicy.quoteTiers;
if (!Array.isArray(rawTiers) || rawTiers.length !== 4) {
  throw new RangeError("The market needs four quote tiers");
}
const config = {
  initialMarginBps: integer(
    rawPolicy.initialMarginBps,
    "initial margin",
    10_000,
  ),
  maintenanceMarginBps: integer(
    rawPolicy.maintenanceMarginBps,
    "maintenance margin",
    10_000,
  ),
  liquidationFeeBps: integer(
    rawPolicy.liquidationFeeBps,
    "liquidation fee",
    10_000,
  ),
  tradeFeeBps: integer(rawPolicy.tradeFeeBps, "trade fee", 10_000),
  insuranceFeeBps: integer(rawPolicy.insuranceFeeBps, "insurance fee", 10_000),
  maxAccountNotional: amount(rawPolicy.maxAccountNotional, "account limit"),
  maxMarketNotional: amount(rawPolicy.maxMarketNotional, "market limit"),
  maxOracleAgeSeconds: integer(
    rawPolicy.maxOracleAgeSeconds,
    "oracle age",
    2 ** 32 - 1,
  ),
  maxConfidenceBps: integer(
    rawPolicy.maxConfidenceBps,
    "oracle confidence",
    10_000,
  ),
  maxQuoteDeviationBps: integer(
    rawPolicy.maxQuoteDeviationBps,
    "quote deviation",
    10_000,
  ),
  maxQuoteLifetimeSeconds: integer(
    rawPolicy.maxQuoteLifetimeSeconds,
    "quote lifetime",
    2 ** 32 - 1,
  ),
  maxOrderQueueSeconds: integer(
    rawPolicy.maxOrderQueueSeconds,
    "order queue duration",
    2 ** 32 - 1,
  ),
  fundingIntervalSeconds: integer(
    rawPolicy.fundingIntervalSeconds,
    "funding interval",
    2 ** 32 - 1,
  ),
  fundingRateCapBps: integer(
    rawPolicy.fundingRateCapBps,
    "funding cap",
    10_000,
  ),
  quoteTiers: rawTiers.map((value, index) =>
    amount(value, `quote tier ${index + 1}`),
  ) as [anchor.BN, anchor.BN, anchor.BN, anchor.BN],
  backstopMinCollateral: amount(
    rawPolicy.backstopMinCollateral,
    "backstop minimum",
  ),
};

const rawCommittee = JSON.parse(await readFile(committeePath, "utf8"));
if (!Array.isArray(rawCommittee) || rawCommittee.length !== 5) {
  throw new RangeError("The recovery committee needs five members");
}
const committee = rawCommittee.map((value, index) => {
  if (
    typeof value?.signer !== "string" ||
    typeof value?.encryptionKey !== "string"
  ) {
    throw new TypeError(`Invalid recovery member ${index + 1}`);
  }
  const signer = new PublicKey(value.signer);
  const encryptionKey = Buffer.from(value.encryptionKey, "base64");
  if (
    encryptionKey.length !== 32 ||
    encryptionKey.toString("base64") !== value.encryptionKey
  ) {
    throw new RangeError(`Invalid encryption key for member ${index + 1}`);
  }
  return { signer, encryptionKey };
});
if (
  new Set(committee.map((member) => member.signer.toBase58())).size !== 5 ||
  new Set(committee.map((member) => member.encryptionKey.toString("hex")))
    .size !== 5
) {
  throw new RangeError("Recovery signer and encryption keys must be distinct");
}

const connection = new Connection(rpc, "confirmed");
if ((await connection.getGenesisHash()) !== genesisHash) {
  throw new Error("The configured RPC does not point to Solana devnet");
}
const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(await readFile(signerPath, "utf8"))),
);
const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(signer),
  { commitment: "confirmed" },
);
const program = new anchor.Program(DEPTH_IDL, provider);
const accounts = program.account as unknown as {
  protocol: { fetch(address: PublicKey): Promise<{ authority: PublicKey }> };
  market: {
    fetch(address: PublicKey): Promise<{
      oracleAccount: PublicKey;
      config: Record<string, anchor.BN | number | anchor.BN[]>;
    }>;
  };
  recoveryConfig: {
    fetch(address: PublicKey): Promise<{
      recoveryKey: number[];
      signers: PublicKey[];
    }>;
  };
};
const market = marketAddress();
const protocol = protocolAddress();
const quoteQueue = quoteQueueAddress();
const recoveryConfig = recoveryConfigAddress();
const [protocolState, oracleInfo] = await Promise.all([
  accounts.protocol.fetch(protocol),
  connection.getAccountInfo(SOL_USD_PUSH_ACCOUNT),
]);
if (!protocolState.authority.equals(signer.publicKey)) {
  throw new Error("The deployer is not the protocol authority");
}
if (!oracleInfo) {
  throw new Error("The sponsored Pyth SOL/USD account is unavailable");
}
const oracleAge = Math.floor(Date.now() / 1000) - solUsdPublishTime(oracleInfo);
if (oracleAge < 0 || oracleAge > config.maxOracleAgeSeconds) {
  throw new Error("The sponsored Pyth SOL/USD account is stale");
}
const existingMarket = await connection.getAccountInfo(market);
if (checkOnly) {
  console.log(
    `Verified devnet authority and sponsored oracle for ${market.toBase58()}`,
  );
  console.log(`Market: ${existingMarket ? "present" : "not created"}`);
  process.exit(0);
}

type ShareFile = {
  market: string;
  signers: string[];
  envelopes: RecoveryEnvelope[];
};

let shares: ShareFile;
try {
  shares = JSON.parse(await readFile(envelopePath, "utf8")) as ShareFile;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  if (existingMarket) {
    throw new Error("The market exists but its recovery envelopes are missing");
  }
  const generated = createRecoveryShares(
    market,
    committee.map((member) => member.encryptionKey),
  );
  shares = {
    market: market.toBase58(),
    signers: committee.map((member) => member.signer.toBase58()),
    envelopes: generated.envelopes,
  };
  await writeFile(envelopePath, `${JSON.stringify(shares, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}
if (
  shares.market !== market.toBase58() ||
  shares.envelopes.length !== 5 ||
  shares.signers.length !== 5 ||
  shares.signers.some(
    (value, index) => value !== committee[index].signer.toBase58(),
  ) ||
  shares.envelopes.some(
    (value, index) =>
      value.market !== shares.market ||
      value.index !== index + 1 ||
      value.threshold !== 3 ||
      value.recipient !== committee[index].encryptionKey.toString("base64") ||
      value.recoveryKey !== shares.envelopes[0].recoveryKey,
  )
) {
  throw new Error("The saved recovery envelopes do not match the committee");
}
const recoveryKey = Buffer.from(shares.envelopes[0].recoveryKey, "base64");
if (recoveryKey.length !== 32) {
  throw new Error("The saved recovery key is invalid");
}

if (!existingMarket) {
  const signature = await program.methods
    .createMarket(
      config,
      SOL_USD_PUSH_ACCOUNT,
      Array.from(recoveryKey),
      committee.map((member) => member.signer),
    )
    .accountsPartial({
      authority: signer.publicKey,
      protocol,
      market,
      quoteQueue,
      recoveryConfig,
    })
    .rpc();
  console.log(`Created draft SOL/USDC market: ${signature}`);
}

const [marketState, recoveryState] = await Promise.all([
  accounts.market.fetch(market),
  accounts.recoveryConfig.fetch(recoveryConfig),
]);
if (
  !marketState.oracleAccount.equals(SOL_USD_PUSH_ACCOUNT) ||
  !Buffer.from(recoveryState.recoveryKey).equals(recoveryKey) ||
  recoveryState.signers.some(
    (value, index) => !value.equals(committee[index].signer),
  ) ||
  Object.entries(config).some(([name, value]) => {
    const stored = marketState.config[name as keyof typeof config];
    return Array.isArray(value)
      ? !Array.isArray(stored) ||
          value.some(
            (item, index) => item.toString() !== stored[index].toString(),
          )
      : value.toString() !== stored.toString();
  })
) {
  throw new Error("The onchain market differs from the saved setup");
}
console.log(`Verified draft SOL/USDC market ${market.toBase58()}`);
console.log(`Encrypted recovery envelopes: ${envelopePath}`);
