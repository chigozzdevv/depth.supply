"use client";

import { useEffect, useState } from "react";
import type {
  AccountState,
  BalanceSnapshot,
  PositionSnapshot,
} from "@depthhq/sdk";
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
  const [discovery, setDiscovery] = useState<{
    owner: string;
    version: number;
    state?: AccountState;
    hasPosition?: boolean;
    error?: string;
  }>();
  const metadata =
    discovery && discovery.owner === owner && discovery.version === version
      ? discovery
      : undefined;
  useEffect(() => {
    if (!trader || !owner) return;
    let cancelled = false;
    void Promise.all([trader.account().state(), trader.positions.list()])
      .then(([state, positions]) => {
        if (!cancelled)
          setDiscovery({
            owner,
            version,
            state,
            hasPosition: positions.items.length > 0,
          });
      })
      .catch((cause) => {
        if (!cancelled)
          setDiscovery({
            owner,
            version,
            error:
              cause instanceof Error
                ? cause.message
                : "Account could not be loaded",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [trader, owner, version]);
  const state = metadata?.state;
  const empty =
    state?.status === "uninitialized" && metadata?.hasPosition === false;
  const balance: BalanceSnapshot | undefined =
    empty && state
      ? { ...state, status: "uninitialized", amount: 0n }
      : current?.balance;
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
    balance,
    position: current?.position,
    read,
    readAtVersion: current?.version,
    outdated: !empty && Boolean(current && current.version !== version),
    loaded: empty || Boolean(current),
    empty,
    checking: Boolean(trader && !metadata),
    error: metadata?.error ?? "",
  };
}
export type AccountView = ReturnType<typeof useAccount>;
