import { PublicKey } from "@solana/web3.js";
import idl from "@/depth.json";
import type { Depth } from "@/depth";

export type { Depth };
export const DEPTH_IDL = idl as unknown as Depth;
export const DEPTH_PROGRAM_ID = new PublicKey(idl.address);
export const SOL_USD_FEED_ID = Buffer.from(
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "hex"
);
export const SOL_USD_MARKET_ID = "SOL-USD";

export function marketAddress(programId = DEPTH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), SOL_USD_FEED_ID],
    programId
  )[0];
}

export function protocolAddress(programId = DEPTH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    programId
  )[0];
}

export function appAddress(
  app: PublicKey,
  programId = DEPTH_PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("app"), app.toBuffer()],
    programId
  )[0];
}
