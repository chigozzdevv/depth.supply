import { ComputeBudgetProgram, Transaction } from "@solana/web3.js";
import type { MakerClient } from "@/client/client";

export async function cleanupQuotes(
  client: MakerClient,
  options: { limit?: number; exclude?: string[] } = {},
): Promise<{ closed: number; reclaimedLamports: bigint; signature?: string }> {
  const limit = options.limit ?? 12;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 12)
    throw new RangeError("Cleanup limit must be between 1 and 12");
  const excluded = new Set(options.exclude);
  const actor = client.options.wallet.publicKey;
  const owner = actor.equals(client.options.maker);
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
  );
  let closed = 0;
  let reclaimedLamports = 0n;
  let cursor: string | undefined;
  do {
    const page = await client.quote.list({ cursor, limit: 100 });
    for (const item of page.items) {
      if (excluded.has(item.id.toBase58())) continue;
      const state = await client.quoteState(item.id);
      if (
        !["cancelled", "filled", "rejected"].includes(
          Object.keys(state.status)[0],
        ) ||
        state.attachedOrders !== 0 ||
        (!owner && !state.operator.equals(actor))
      )
        continue;
      if (state.replacementNonce != null) {
        const successor = client.quote.replacement(
          item.id,
          BigInt(state.replacementNonce.toString()),
        ).nextId;
        if (
          !(await client.options.connection.getAccountInfo(
            successor,
            "confirmed",
          ))
        )
          continue;
      }
      const info = await client.options.connection.getAccountInfo(
        item.id,
        "confirmed",
      );
      if (!info) continue;
      transaction.add(
        await (
          owner
            ? client.program.methods
                .closeQuote()
                .accountsPartial({ maker: actor, quote: item.id })
            : client.program.methods
                .closeOperatorQuote()
                .accountsPartial({ operator: actor, quote: item.id })
        ).instruction(),
      );
      reclaimedLamports += BigInt(info.lamports);
      if (++closed === limit) break;
    }
    cursor = closed < limit ? (page.nextCursor ?? undefined) : undefined;
  } while (cursor);
  if (!closed) return { closed, reclaimedLamports };
  const signature = await client.provider.sendAndConfirm(transaction, [], {
    commitment: "confirmed",
  });
  return { closed, reclaimedLamports, signature };
}
