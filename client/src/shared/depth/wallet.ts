import type { Adapter } from "@solana/wallet-adapter-base";

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
