import type { Adapter, WalletName } from "@solana/wallet-adapter-base";
import { createContext } from "react";
import { flushSync } from "react-dom";

export function connectWallet(
  adapter: Adapter,
  select: (name: WalletName) => void,
): Promise<void> {
  // Attach the selected adapter's listeners before requesting connection from the click.
  flushSync(() => select(adapter.name));
  return adapter.connect();
}

export const WalletConnection = createContext<{
  connect: (
    adapter: Adapter,
    select: (name: WalletName) => void,
  ) => Promise<void>;
  connecting: boolean;
  reset: () => void;
} | null>(null);

export function watchConnection(
  adapter: Adapter,
  expired: () => void,
  timeoutMs = 30_000,
): () => void {
  const stop = () => {
    clearTimeout(timer);
    adapter.off("connect", stop);
    adapter.off("disconnect", stop);
  };
  const timer = setTimeout(() => {
    stop();
    if (!adapter.connected) expired();
  }, timeoutMs);
  adapter.on("connect", stop);
  adapter.on("disconnect", stop);
  return stop;
}
