import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import type {
  Connection,
  PublicKey,
  VersionedTransactionResponse,
} from "@solana/web3.js";

export type ReceiptTransaction = {
  signature: string;
  slot: number;
  timestamp?: number;
};

export function depthInstructions(
  transaction: VersionedTransactionResponse,
  program: anchor.Program,
) {
  if (!transaction.meta || transaction.meta.err) return [];
  const keys = transaction.transaction.message.getAccountKeys({
    accountKeysFromLookups: transaction.meta.loadedAddresses,
  });
  const instructions = [
    ...transaction.transaction.message.compiledInstructions.map((ix) => ({
      programIdIndex: ix.programIdIndex,
      accounts: ix.accountKeyIndexes,
      data: Buffer.from(ix.data),
    })),
    ...(transaction.meta.innerInstructions ?? []).flatMap((group) =>
      group.instructions.map((ix) => ({
        programIdIndex: ix.programIdIndex,
        accounts: ix.accounts,
        data: Buffer.from(anchor.utils.bytes.bs58.decode(ix.data)),
      })),
    ),
  ];
  return instructions.flatMap((ix) => {
    if (!keys.get(ix.programIdIndex)?.equals(program.programId)) return [];
    let definition = program.idl.instructions.find((item) =>
      ix.data.subarray(0, 8).equals(Buffer.from(item.discriminator)),
    );
    if (
      !definition &&
      ix.data.subarray(0, 8).equals(Buffer.from("057da1a57b4b7ec6", "hex"))
    ) {
      const current = program.idl.instructions.find(
        (item) => item.name === "debitMarketV2Callback",
      );
      if (current) definition = { ...current, name: "debitMarketCallback" };
    }
    return definition
      ? [{ definition, accounts: ix.accounts.map((index) => keys.get(index)) }]
      : [];
  });
}

export async function receiptTransaction(
  connection: Connection,
  program: anchor.Program,
  address: PublicKey,
  names?: readonly string[],
): Promise<ReceiptTransaction> {
  let before: string | undefined;
  for (let page = 0; page < 10; page++) {
    const signatures = await connection.getSignaturesForAddress(
      address,
      { before, limit: 50 },
      "confirmed",
    );
    for (const signature of signatures) {
      if (signature.err) continue;
      const transaction = await connection.getTransaction(signature.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!transaction)
        throw new Error(
          "Transaction history is unavailable; retry with an archival RPC",
        );
      const changed = depthInstructions(transaction, program).some(
        (ix) =>
          (!names || names.includes(ix.definition.name)) &&
          ix.definition.accounts.some(
            (account, index) =>
              "writable" in account &&
              account.writable &&
              ix.accounts[index]?.equals(address),
          ),
      );
      if (changed)
        return {
          signature: signature.signature,
          slot: signature.slot,
          ...(transaction.blockTime == null
            ? {}
            : { timestamp: transaction.blockTime }),
        };
    }
    if (signatures.length < 50) break;
    before = signatures.at(-1)!.signature;
  }
  throw new Error(
    `Receipt transaction for ${address.toBase58()} was not found in recent history`,
  );
}
