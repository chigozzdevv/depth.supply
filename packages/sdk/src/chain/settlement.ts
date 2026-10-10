import * as anchor from "@anchor-lang/core";
import type {
  Connection,
  PublicKey,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import type { OrderState } from "@/client/types";
import { depthInstructions } from "@/chain/transaction";

export type SettlementTransaction = {
  signature: string;
  slot: number;
  orderId: PublicKey;
  timestamp?: number;
};

export function settlementOrder(
  transaction: VersionedTransactionResponse,
  program: anchor.Program,
): PublicKey | undefined {
  const instruction = depthInstructions(transaction, program).find(
    (ix) => ix.definition.name === "sealClearingCallback",
  );
  if (!instruction) return;
  const orderIndex = instruction.definition.accounts.findIndex(
    (account) => account.name === "order",
  );
  if (orderIndex < 0)
    throw new Error("Settlement callback has no order account");
  return instruction.accounts[orderIndex];
}

export async function settlementTransaction(
  connection: Connection,
  program: anchor.Program,
  address: PublicKey,
  match: { orderId: PublicKey } | { trader: PublicKey; market: PublicKey },
): Promise<SettlementTransaction> {
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
      const orderId = settlementOrder(transaction, program);
      if (!orderId) continue;
      if ("orderId" in match) {
        if (orderId.equals(match.orderId))
          return {
            signature: signature.signature,
            slot: signature.slot,
            orderId,
            ...(transaction.blockTime == null
              ? {}
              : { timestamp: transaction.blockTime }),
          };
      } else {
        const info = await connection.getAccountInfo(orderId, "confirmed");
        if (!info?.owner.equals(program.programId))
          throw new Error("Settlement receipt is unavailable");
        const order = program.coder.accounts.decode<OrderState>(
          "orderRecord",
          info.data,
        );
        if (
          order.trader.equals(match.trader) &&
          order.market.equals(match.market) &&
          "trade" in order.kind &&
          "filled" in order.status
        )
          return {
            signature: signature.signature,
            slot: signature.slot,
            orderId,
            ...(transaction.blockTime == null
              ? {}
              : { timestamp: transaction.blockTime }),
          };
      }
    }
    if (signatures.length < 50) break;
    before = signatures.at(-1)!.signature;
  }
  throw new Error("Settlement transaction was not found in recent history");
}
