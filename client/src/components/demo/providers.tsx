"use client";

import { useState, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { DepthSession } from "@/shared/depth/session";
import type { DemoConfig } from "@/shared/config/runtime";
import { errorMessage } from "@/shared/depth/error";

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
