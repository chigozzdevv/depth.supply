import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { setTimeout as sleep } from "node:timers/promises";

const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const chunkSize = 900;

export function writeInstruction(buffer, authority, offset, bytes) {
  const data = Buffer.alloc(16 + bytes.length);
  data.writeUInt32LE(1, 0);
  data.writeUInt32LE(offset, 4);
  data.writeBigUInt64LE(BigInt(bytes.length), 8);
  data.set(bytes, 16);
  return new TransactionInstruction({
    programId: loader,
    keys: [
      { pubkey: buffer, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

export function missingChunks(binary, account, authority) {
  if (
    !account?.owner.equals(loader) ||
    account.data.length !== binary.length + 37 ||
    account.data.readUInt32LE(0) !== 1 ||
    account.data[4] !== 1 ||
    !new PublicKey(account.data.subarray(5, 37)).equals(authority)
  )
    throw new Error("Upload buffer identity, authority or size is invalid");
  const offsets = [];
  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const bytes = binary.subarray(offset, offset + chunkSize);
    if (
      !bytes.equals(
        account.data.subarray(37 + offset, 37 + offset + bytes.length),
      )
    )
      offsets.push(offset);
  }
  return offsets;
}

export async function uploadBuffer(connection, buffer, signer, binary) {
  for (let round = 0; round < 5; round++) {
    const offsets = missingChunks(
      binary,
      await connection.getAccountInfo(buffer, "confirmed"),
      signer.publicKey,
    );
    if (!offsets.length) {
      console.log("Upload buffer verified byte for byte");
      return;
    }
    console.log(`Resuming ${offsets.length} missing upload chunks`);
    for (let start = 0; start < offsets.length; start += 32) {
      const blockhash = await connection.getLatestBlockhash("confirmed");
      const submitted = await Promise.allSettled(
        offsets.slice(start, start + 32).map(async (offset) => {
          const transaction = new Transaction({
            ...blockhash,
            feePayer: signer.publicKey,
          }).add(
            writeInstruction(
              buffer,
              signer.publicKey,
              offset,
              binary.subarray(offset, offset + chunkSize),
            ),
          );
          transaction.sign(signer);
          return connection.sendRawTransaction(transaction.serialize(), {
            preflightCommitment: "confirmed",
            maxRetries: 3,
          });
        }),
      );
      const signatures = submitted.flatMap((entry) =>
        entry.status === "fulfilled" ? [entry.value] : [],
      );
      let pending = signatures;
      for (let poll = 0; pending.length && poll < 15; poll++) {
        await sleep(1000);
        const statuses = await connection.getSignatureStatuses(pending);
        pending = pending.filter((signature, index) => {
          const status = statuses.value[index];
          if (status?.err)
            throw new Error(
              `Upload transaction failed: ${JSON.stringify(status.err)}`,
            );
          return (
            !status ||
            !["confirmed", "finalized"].includes(status.confirmationStatus)
          );
        });
      }
      if (
        pending.length ||
        submitted.some((entry) => entry.status === "rejected")
      ) {
        console.log("Reconciling interrupted upload writes");
        break;
      }
      if (start % 320 === 0 || start + 32 >= offsets.length)
        console.log(
          `Upload progress: ${Math.min(start + 32, offsets.length)}/${offsets.length} missing chunks confirmed`,
        );
    }
  }
  if (
    missingChunks(
      binary,
      await connection.getAccountInfo(buffer, "confirmed"),
      signer.publicKey,
    ).length
  )
    throw new Error(
      "Upload is incomplete; retain the existing buffer and resume",
    );
}
