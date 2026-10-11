"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDepth } from "@/shared/depth/session";
import { AccountReader, type AccountSnapshot } from "@/shared/depth/snapshot";

export function useAccount() {
  const { trader, load, version, busy } = useDepth();
  const owner = trader?.options.wallet.publicKey.toBase58();
  const reader = useMemo(
    () => (trader ? new AccountReader(trader) : undefined),
    [trader],
  );
  const alive = useRef(true);
  const scope = useRef({ reader, owner, version });
  const attempted = useRef<
    { reader: AccountReader; version: number } | undefined
  >(undefined);
  const [state, setState] = useState<{
    owner: string;
    version: number;
    snapshot?: AccountSnapshot;
    snapshotVersion?: number;
    checking: boolean;
    error: string;
  }>();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    scope.current = { reader, owner, version };
  }, [reader, owner, version]);
  const read = useCallback(async () => {
    if (!reader || !owner) return;
    const current = () =>
      alive.current &&
      scope.current.reader === reader &&
      scope.current.owner === owner &&
      scope.current.version === version;
    const started = await load(async () => {
      if (!current()) return;
      setState((previous) => ({
        ...(previous?.owner === owner ? previous : {}),
        owner,
        version,
        checking: true,
        error: "",
      }));
      try {
        const snapshot = await reader.read(current);
        if (current())
          setState({
            owner,
            version,
            snapshot,
            snapshotVersion: version,
            checking: false,
            error: "",
          });
      } catch (cause) {
        if (current())
          setState((previous) => ({
            ...(previous?.owner === owner ? previous : {}),
            owner,
            version,
            checking: false,
            error:
              cause instanceof Error
                ? cause.message
                : "Account could not be loaded",
          }));
      }
    });
    if (!started && alive.current) attempted.current = undefined;
  }, [reader, owner, version, load]);
  useEffect(() => {
    if (
      !reader ||
      busy ||
      (attempted.current?.reader === reader &&
        attempted.current.version === version)
    )
      return;
    attempted.current = { reader, version };
    void read();
  }, [reader, version, busy, read]);
  const current = state?.owner === owner ? state : undefined;
  const snapshot = current?.snapshot;
  const empty = Boolean(
    snapshot?.balance.status === "uninitialized" && !snapshot.position,
  );
  return {
    balance: snapshot?.balance,
    position: snapshot?.position,
    read,
    readAtVersion: current?.snapshotVersion,
    outdated: Boolean(
      snapshot && (current?.snapshotVersion !== version || current.error),
    ),
    loaded: Boolean(snapshot),
    empty,
    checking: Boolean(
      trader && (!current || current.version !== version || current.checking),
    ),
    error: current?.error ?? "",
  };
}
export type AccountView = ReturnType<typeof useAccount>;
