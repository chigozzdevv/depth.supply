"use client";

import { useState } from "react";
import type { BalanceSnapshot, PositionSnapshot } from "@depthhq/sdk";
import { useDepth } from "@/shared/depth/session";

export function useAccount() {
  const { trader, run, version } = useDepth();
  const [snapshot, setSnapshot] = useState<{
    owner: string;
    version: number;
    balance: BalanceSnapshot;
    position?: PositionSnapshot;
  }>();
  const owner = trader?.options.wallet.publicKey.toBase58();
  const current = snapshot?.owner === owner ? snapshot : undefined;
  async function read() {
    if (!trader || !owner) return;
    await run(
      "Reading private account",
      async () => {
        const balance = await trader.account().summary();
        const positions = await trader.positions.list();
        const position = positions.items.length
          ? await trader.position().summary()
          : undefined;
        setSnapshot({ owner, version, balance, position });
      },
      false,
    );
  }
  return {
    balance: current?.balance,
    position: current?.position,
    read,
    readAtVersion: current?.version,
    outdated: Boolean(current && current.version !== version),
    loaded: Boolean(current),
  };
}
export type AccountView = ReturnType<typeof useAccount>;
