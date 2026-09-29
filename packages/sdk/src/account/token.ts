import * as anchor from "@anchor-lang/core";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const tokenProgram = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const associatedProgram = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

export function associatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    associatedProgram
  )[0];
}

function tokenBalance(
  info: { owner: PublicKey; data: Buffer },
  owner: PublicKey,
  mint: PublicKey
): bigint {
  if (
    !info.owner.equals(tokenProgram) ||
    info.data.length < 165 ||
    !info.data.subarray(0, 32).equals(mint.toBuffer()) ||
    !info.data.subarray(32, 64).equals(owner.toBuffer()) ||
    info.data[108] !== 1
  )
    throw new Error("Settlement token account is invalid or frozen");
  return info.data.readBigUInt64LE(64);
}

export async function sourceTokenAccount(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  amount: bigint
): Promise<PublicKey> {
  if (amount <= 0n) throw new RangeError("Deposit amount must be positive");
  const accounts = await connection.getTokenAccountsByOwner(
    owner,
    { mint },
    "confirmed"
  );
  const preferred = associatedTokenAddress(owner, mint);
  const eligible = accounts.value
    .filter(({ account }) => {
      try {
        return tokenBalance(account, owner, mint) >= amount;
      } catch {
        return false;
      }
    })
    .map(({ pubkey }) => pubkey)
    .sort(
      (a, b) =>
        Number(b.equals(preferred)) - Number(a.equals(preferred)) ||
        a.toBase58().localeCompare(b.toBase58())
    );
  if (!eligible[0])
    throw new Error("No owned settlement token account covers the deposit");
  return eligible[0];
}

export async function destinationTokenAccount(
  provider: anchor.AnchorProvider,
  owner: PublicKey,
  mint: PublicKey
): Promise<PublicKey> {
  if (!provider.wallet.publicKey.equals(owner))
    throw new Error(
      "Only the wallet owner can prepare its settlement token account"
    );
  const address = associatedTokenAddress(owner, mint);
  let info = await provider.connection.getAccountInfo(address, "confirmed");
  if (!info) {
    const instruction = new TransactionInstruction({
      programId: associatedProgram,
      data: Buffer.from([1]),
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: address, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
      ],
    });
    await provider.sendAndConfirm(new Transaction().add(instruction), [], {
      commitment: "confirmed",
    });
    info = await provider.connection.getAccountInfo(address, "confirmed");
  }
  if (!info) throw new Error("Settlement token account was not created");
  tokenBalance(info, owner, mint);
  return address;
}
