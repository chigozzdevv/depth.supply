"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import type { Adapter, WalletName } from "@solana/wallet-adapter-base";
import { DepthSession } from "@/shared/depth/session";
import type { DemoConfig } from "@/shared/config/runtime";
import { errorMessage } from "@/shared/depth/error";
import {
  WalletConnection,
  connectWallet,
  watchConnection,
} from "@/shared/depth/wallet";

function ConnectionGuard({
  expired,
  resolved,
  manual,
}: {
  expired: () => void;
  resolved: () => void;
  manual: boolean;
}) {
  const { wallet, connecting, connected } = useWallet();
  useEffect(() => {
    if (!wallet) return;
    const adapter = wallet.adapter;
    adapter.on("connect", resolved);
    return () => {
      adapter.off("connect", resolved);
    };
  }, [wallet, resolved]);
  useEffect(() => {
    if ((!connecting && !manual) || connected || !wallet) return;
    return watchConnection(wallet.adapter, expired, manual ? 60_000 : 15_000);
  }, [wallet, connecting, connected, expired, manual]);
  return null;
}

export function Providers({
  config,
  role,
  children,
}: {
  config: DemoConfig;
  role: "trade" | "maker";
  children: ReactNode;
}) {
  const [walletError, setWalletError] = useState("");
  const [generation, setGeneration] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const requested = useRef(false);
  const pending = useRef<{ promise: Promise<void> } | undefined>(undefined);
  const reset = useCallback(() => {
    requested.current = false;
    pending.current = undefined;
    setConnecting(false);
    setWalletError("");
    // Recreate adapters because a timed-out request can leave their connecting flag set.
    setGeneration((value) => value + 1);
  }, []);
  const expired = useCallback(() => {
    reset();
    setWalletError("Wallet did not respond. Unlock it and reconnect.");
  }, [reset]);
  const connect = useCallback(
    (adapter: Adapter, select: (name: WalletName) => void) => {
      if (pending.current) return pending.current.promise;
      requested.current = true;
      setWalletError("");
      setConnecting(true);
      const attempt = { promise: connectWallet(adapter, select) };
      pending.current = attempt;
      attempt.promise = attempt.promise.finally(() => {
        if (pending.current !== attempt) return;
        pending.current = undefined;
        setConnecting(false);
      });
      return attempt.promise;
    },
    [],
  );
  const restore = useCallback(
    async () => generation === 0 && !requested.current,
    [generation],
  );
  const resolved = useCallback(() => setWalletError(""), []);
  const endpoint =
    typeof location === "undefined"
      ? "https://api.devnet.solana.com"
      : `${location.origin}/api/rpc?cluster=${config.environment}`;
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletConnection.Provider value={{ connect, connecting, reset }}>
        <WalletProvider
          key={generation}
          wallets={[]}
          autoConnect={restore}
          localStorageKey="depth:wallet"
          onError={(error) => setWalletError(errorMessage(error))}
        >
          <ConnectionGuard
            expired={expired}
            resolved={resolved}
            manual={connecting}
          />
          <DepthSession config={config} role={role}>
            {walletError && (
              <div role="alert" className="terminal-toast">
                <span>{walletError}</span>
                <button onClick={() => setWalletError("")}>Dismiss</button>
              </div>
            )}
            {children}
          </DepthSession>
        </WalletProvider>
      </WalletConnection.Provider>
    </ConnectionProvider>
  );
}
