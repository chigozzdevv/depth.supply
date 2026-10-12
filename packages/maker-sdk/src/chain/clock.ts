import { Connection, PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";

const owner = new PublicKey("Sysvar1111111111111111111111111111111111111");

export async function chainTime(
  connection: Pick<Connection, "getAccountInfo">,
) {
  const clock = await connection.getAccountInfo(
    SYSVAR_CLOCK_PUBKEY,
    "confirmed",
  );
  if (!clock?.owner.equals(owner) || clock.data.length !== 40)
    throw new Error("Solana clock sysvar is unavailable");
  const time = clock.data.readBigInt64LE(32);
  if (time <= 0n || time > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Solana clock timestamp is invalid");
  return Number(time);
}
