import { Buffer as BufferPolyfill } from "buffer";
import { PublicKey } from "@solana/web3.js";
import type { AccountInfo } from "@solana/web3.js";
import idl from "@/depth.json";
import type { Depth } from "@/depth";

const Buffer = globalThis.Buffer ?? BufferPolyfill;

export type { Depth };
export const DEPTH_IDL = idl as unknown as Depth;
export const DEPTH_PROGRAM_ID = new PublicKey(idl.address);
export const SOL_USD_FEED_ID = Buffer.from(
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "hex",
);
export const SOL_USD_MARKET_ID = "SOL-USD";
export const PYTH_PUSH_ORACLE_ID = new PublicKey(
  "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT",
);
export const PYTH_RECEIVER_ID = new PublicKey(
  "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
);
export const SOL_USD_PUSH_ACCOUNT = PublicKey.findProgramAddressSync(
  [Buffer.alloc(2), SOL_USD_FEED_ID],
  PYTH_PUSH_ORACLE_ID,
)[0];

const PRICE_UPDATE_DISCRIMINATOR = Buffer.from("22f123639d7ef4cd", "hex");

export function solUsdPublishTime(info: AccountInfo<Buffer> | null): number {
  if (!info) return 0;
  if (
    !info.owner.equals(PYTH_RECEIVER_ID) ||
    info.data.length !== 134 ||
    !info.data.subarray(0, 8).equals(PRICE_UPDATE_DISCRIMINATOR) ||
    info.data[40] !== 1 ||
    !info.data.subarray(41, 73).equals(SOL_USD_FEED_ID)
  ) {
    throw new Error("Pyth account is not a verified SOL/USD feed");
  }
  const timestamp = Number(info.data.readBigInt64LE(93));
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("Pyth SOL/USD publish time is invalid");
  }
  return timestamp;
}

export function marketAddress(programId = DEPTH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), SOL_USD_FEED_ID],
    programId,
  )[0];
}

export function quoteQueueAddress(programId = DEPTH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("quote-queue"), marketAddress(programId).toBuffer()],
    programId,
  )[0];
}

export function protocolAddress(programId = DEPTH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    programId,
  )[0];
}

export function appAddress(
  app: PublicKey,
  programId = DEPTH_PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("app"), app.toBuffer()],
    programId,
  )[0];
}

export function vaultAddress(programId = DEPTH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault")], programId)[0];
}

export function balanceAddress(
  owner: PublicKey,
  programId = DEPTH_PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), owner.toBuffer()],
    programId,
  )[0];
}

export function marketAccountAddress(
  owner: PublicKey,
  programId = DEPTH_PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("market-account"),
      marketAddress(programId).toBuffer(),
      owner.toBuffer(),
    ],
    programId,
  )[0];
}

export function recoveryConfigAddress(programId = DEPTH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("recovery-config"), marketAddress(programId).toBuffer()],
    programId,
  )[0];
}

export function depositAddress(
  owner: PublicKey,
  nonce: bigint,
  programId = DEPTH_PROGRAM_ID,
): PublicKey {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deposit"), owner.toBuffer(), bytes],
    programId,
  )[0];
}

export function transferAddress(
  owner: PublicKey,
  nonce: bigint,
  programId = DEPTH_PROGRAM_ID,
): PublicKey {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("margin-transfer"), owner.toBuffer(), bytes],
    programId,
  )[0];
}

export function withdrawalAddress(
  owner: PublicKey,
  nonce: bigint,
  programId = DEPTH_PROGRAM_ID,
): PublicKey {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("withdrawal"),
      balanceAddress(owner, programId).toBuffer(),
      bytes,
    ],
    programId,
  )[0];
}

export { circuits } from "@/circuits";
export { packQuoteCurve } from "@/quote";
export type { EncryptedQuote } from "@/quote";

export { computations } from "@/computations";
export { accountOffsets, enumValues } from "@/layout";
