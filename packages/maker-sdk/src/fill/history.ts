import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import type { MakerClient } from "@/client/client";

export type FillPage = {
  fills: { id: string; signature: string; slot: number }[];
  cursor?: string;
  head?: string;
};

export class FillHistory {
  constructor(private readonly client: MakerClient) {}

  async list(
    options: { before?: string; until?: string; limit?: number } = {},
  ): Promise<FillPage> {
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new RangeError("limit must be between 1 and 100");
    const connection = this.client.options.connection;
    const signatures = await connection.getSignaturesForAddress(
      this.client.marketAccount(),
      { before: options.before, until: options.until, limit },
      "finalized",
    );
    const definition = this.client.program.idl.instructions.find(
      (ix) => ix.name === "sealClearingCallback",
    );
    if (!definition) throw new Error("IDL has no settlement callback");
    const orderIndex = definition.accounts.findIndex(
      (account) => account.name === "order",
    );
    if (orderIndex < 0)
      throw new Error("Settlement callback has no order account");
    const orders = new Map<string, { signature: string; slot: number }>();
    for (let i = 0; i < signatures.length; i += 5) {
      await Promise.all(
        signatures.slice(i, i + 5).map(async (signature) => {
          if (signature.err) return;
          const transaction = await connection.getTransaction(
            signature.signature,
            {
              commitment: "finalized",
              maxSupportedTransactionVersion: 0,
            },
          );
          if (!transaction)
            throw new Error(
              "Finalized transaction history is unavailable; retain the cursor and use an archival RPC",
            );
          if (transaction.meta?.err) return;
          const keys = transaction.transaction.message.getAccountKeys({
            accountKeysFromLookups: transaction.meta?.loadedAddresses,
          });
          const instructions = [
            ...transaction.transaction.message.compiledInstructions.map(
              (ix) => ({
                programIdIndex: ix.programIdIndex,
                accounts: ix.accountKeyIndexes,
                data: Buffer.from(ix.data),
              }),
            ),
            ...(transaction.meta?.innerInstructions ?? []).flatMap((group) =>
              group.instructions.map((ix) => ({
                programIdIndex: ix.programIdIndex,
                accounts: ix.accounts,
                data: Buffer.from(anchor.utils.bytes.bs58.decode(ix.data)),
              })),
            ),
          ];
          for (const ix of instructions) {
            if (
              !keys
                .get(ix.programIdIndex)
                ?.equals(this.client.program.programId) ||
              !ix.data
                .subarray(0, 8)
                .equals(Buffer.from(definition.discriminator))
            )
              continue;
            const order = keys.get(ix.accounts[orderIndex]);
            if (order)
              orders.set(order.toBase58(), {
                signature: signature.signature,
                slot: signature.slot,
              });
          }
        }),
      );
    }
    const addresses = [...orders.keys()];
    const fills: FillPage["fills"] = [];
    for (let i = 0; i < addresses.length; i += 100) {
      const batch = addresses.slice(i, i + 100);
      const accounts = await connection.getMultipleAccountsInfo(
        batch.map((id) => new PublicKey(id)),
        "finalized",
      );
      accounts.forEach((info, index) => {
        if (!info || !info.owner.equals(this.client.program.programId))
          throw new Error("Finalized fill receipt is unavailable");
        const order = this.client.program.coder.accounts.decode<{
          market: PublicKey;
          maker: PublicKey;
          status: Record<string, unknown>;
          kind: Record<string, unknown>;
        }>("orderRecord", info.data);
        if (
          order.maker.equals(this.client.options.maker) &&
          order.market.equals(this.client.marketAddress) &&
          "trade" in order.kind &&
          "filled" in order.status
        ) {
          fills.push({ id: batch[index], ...orders.get(batch[index])! });
        }
      });
    }
    fills.sort((a, b) => b.slot - a.slot || a.id.localeCompare(b.id));
    return {
      fills,
      head: signatures[0]?.signature,
      ...(signatures.length === limit
        ? { cursor: signatures.at(-1)!.signature }
        : {}),
    };
  }

  subscribe(
    listener: (fill: FillPage["fills"][number]) => Promise<void>,
    options: {
      cursor?: string;
      pollMs?: number;
      saveCursor: (cursor: string) => Promise<void>;
      onError: (error: unknown) => void;
    },
  ): () => void {
    const pollMs = options.pollMs ?? 2000;
    if (!Number.isSafeInteger(pollMs) || pollMs < 500)
      throw new RangeError("pollMs must be at least 500");
    let cursor = options.cursor;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        let before: string | undefined;
        let head: string | undefined;
        const fills = new Map<string, FillPage["fills"][number]>();
        do {
          const page = await this.list({ before, until: cursor });
          head ??= page.head;
          page.fills.forEach((fill) => fills.set(fill.id, fill));
          before = page.cursor;
        } while (before && !stopped);
        for (const fill of [...fills.values()].sort(
          (a, b) => a.slot - b.slot || a.id.localeCompare(b.id),
        )) {
          if (stopped) return;
          await listener(fill);
        }
        if (!stopped && head) {
          await options.saveCursor(head);
          cursor = head;
        }
      } catch (error) {
        if (!stopped) options.onError(error);
      } finally {
        if (!stopped) timer = setTimeout(poll, pollMs);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }
}
