"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDepth } from "@/shared/depth/session";
import { AccountReader, type AccountSnapshot } from "@/shared/depth/snapshot";
import { errorMessage } from "@/shared/depth/error";

export function useAccount() {
  const { trader, load, version, busy, reading } = useDepth();
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
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const snapshot = await Promise.race([
          reader.read(current),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    "Private account read timed out. Please try again.",
                  ),
                ),
              60000,
            );
          }),
        ]);
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
            error: errorMessage(cause),
          }));
      } finally {
        clearTimeout(timer);
      }
    });
    if (!started && alive.current) attempted.current = undefined;
  }, [reader, owner, version, load]);
  useEffect(() => {
    if (
      !reader ||
      busy ||
      reading ||
      (attempted.current?.reader === reader &&
        attempted.current.version === version)
    )
      return;
    attempted.current = { reader, version };
    void read();
  }, [reader, version, busy, reading, read]);
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
