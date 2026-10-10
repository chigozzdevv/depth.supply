"use client";

import { useEffect, useState } from "react";
import type { PendingItem, ReceiptDetail } from "@depthhq/sdk";
import { useDepth } from "@/shared/depth/session";

export function transactionKey(item: PendingItem) {
  return `${item.id.toBase58()}:${item.kind}:${item.status}`;
}

export function useTransactions(items?: PendingItem[]) {
  const { trader } = useDepth();
  const owner = trader?.options.wallet.publicKey.toBase58();
  const [state, setState] = useState<{
    owner: string;
    values: Record<string, { transaction?: ReceiptDetail; error?: string }>;
  }>();
  useEffect(() => {
    if (!trader || !owner || !items) return;
    const sdk = trader;
    let stopped = false;
    let index = 0;
    async function worker() {
      while (!stopped && index < items!.length) {
        const item = items![index++];
        let value;
        try {
          value = { transaction: await sdk.account().detail(item) };
        } catch (cause) {
          value = {
            error:
              cause instanceof Error
                ? cause.message
                : "Transaction could not be read",
          };
        }
        if (!stopped)
          setState((previous) => ({
            owner: owner!,
            values: {
              ...(previous && previous.owner === owner ? previous.values : {}),
              [transactionKey(item)]: value,
            },
          }));
      }
    }
    void Promise.all([worker(), worker()]);
    return () => {
      stopped = true;
    };
  }, [trader, owner, items]);
  async function retry(item: PendingItem) {
    if (!trader || !owner) return;
    try {
      const transaction = await trader.account().detail(item);
      setState((previous) => ({
        owner,
        values: {
          ...(previous && previous.owner === owner ? previous.values : {}),
          [transactionKey(item)]: { transaction },
        },
      }));
    } catch (cause) {
      setState((previous) => ({
        owner,
        values: {
          ...(previous && previous.owner === owner ? previous.values : {}),
          [transactionKey(item)]: {
            error:
              cause instanceof Error
                ? cause.message
                : "Transaction could not be read",
          },
        },
      }));
    }
  }
  return { values: state?.owner === owner ? state?.values : undefined, retry };
}
