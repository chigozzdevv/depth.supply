import { SOL_USD_FEED_ID } from "@depth/bindings";
import type { AccountInfo } from "@solana/web3.js";

const RECEIVER_ID = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
const DISCRIMINATOR = Buffer.from("22f123639d7ef4cd", "hex");

export function priceTimestamp(info: AccountInfo<Buffer> | null): number {
  if (!info) return 0;
  if (
    info.owner.toBase58() !== RECEIVER_ID ||
    info.data.length !== 134 ||
    !info.data.subarray(0, 8).equals(DISCRIMINATOR) ||
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
