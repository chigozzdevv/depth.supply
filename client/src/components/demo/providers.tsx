"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { DepthSession } from "@/shared/depth/session";
import type { DemoConfig } from "@/shared/config/runtime";
import { errorMessage } from "@/shared/depth/error";
import { watchConnection } from "@/shared/depth/wallet";

function ConnectionGuard({
  expired,
  resolved,
}: {
  expired: () => void;
  resolved: () => void;
}) {
  const { wallet, connecting, connected, select } = useWallet();
  useEffect(() => {
    if (!wallet) return;
    const adapter = wallet.adapter;
    adapter.on("connect", resolved);
    return () => {
      adapter.off("connect", resolved);
    };
  }, [wallet, resolved]);
  useEffect(() => {
    if (!connecting || connected || !wallet) return;
    return watchConnection(wallet.adapter, () => {
      select(null);
      expired();
    });
  }, [wallet, connecting, connected, select, expired]);
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
  const expired = useCallback(
    () => setWalletError("Wallet did not respond. Unlock it and reconnect."),
    [],
  );
  const resolved = useCallback(() => setWalletError(""), []);
  const endpoint =
    typeof location === "undefined"
      ? "https://api.devnet.solana.com"
      : `${location.origin}/api/rpc?cluster=${config.environment}`;
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={[]}
        autoConnect
        localStorageKey="depth:wallet"
        onError={(error) => setWalletError(errorMessage(error))}
      >
        <ConnectionGuard expired={expired} resolved={resolved} />
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
    </ConnectionProvider>
  );
}
