import type { EthereumProvider } from "@depthhq/maker-sdk";
import { errorMessage } from "@/shared/depth/error";

export type EthereumWallet = {
  id: string;
  name: string;
  icon?: string;
  provider: EthereumProvider;
};
type LegacyProvider = EthereumProvider & {
  providers?: EthereumProvider[];
  isPhantom?: boolean;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
};
type EthereumWindow = EventTarget & {
  ethereum?: LegacyProvider;
  phantom?: { ethereum?: EthereumProvider };
};
type Registry = {
  subscribe: (read: (wallets: EthereumWallet[]) => void) => () => void;
};
const registries = new WeakMap<EthereumWindow, Registry>();
const providerValid = (value: unknown): value is EthereumProvider =>
  Boolean(value && typeof (value as EthereumProvider).request === "function");

export function discoverEthereum(
  target: EthereumWindow,
  read: (wallets: EthereumWallet[]) => void,
) {
  let registry = registries.get(target);
  if (!registry) {
    const wallets = new Map<EthereumProvider, EthereumWallet>();
    const readers = new Set<(wallets: EthereumWallet[]) => void>();
    const snapshot = () =>
      [...wallets.values()].sort((a, b) => a.name.localeCompare(b.name));
    const notify = () => {
      const current = snapshot();
      for (const listener of readers) listener(current);
    };
    target.addEventListener("eip6963:announceProvider", (event) => {
      const detail = (event as CustomEvent).detail;
      const info = detail?.info;
      if (
        !providerValid(detail?.provider) ||
        typeof info?.uuid !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          info.uuid,
        ) ||
        typeof info.name !== "string" ||
        !info.name.trim() ||
        info.name.length > 80 ||
        [...wallets.values()].some(
          (wallet) =>
            wallet.id === info.uuid && wallet.provider !== detail.provider,
        )
      )
        return;
      wallets.set(detail.provider, {
        id: info.uuid,
        name: info.name.trim(),
        icon:
          typeof info.icon === "string" &&
          info.icon.length <= 262_144 &&
          /^data:image\/(?:png|webp|jpeg|svg\+xml)[;,]/i.test(info.icon)
            ? info.icon
            : undefined,
        provider: detail.provider,
      });
      notify();
    });
    registry = {
      subscribe(listener) {
        readers.add(listener);
        const legacy = [
          target.phantom?.ethereum,
          ...(target.ethereum?.providers ?? []),
          target.ethereum,
        ];
        for (const provider of legacy) {
          if (!providerValid(provider) || wallets.has(provider)) continue;
          const flags = provider as LegacyProvider;
          wallets.set(provider, {
            id: `legacy-${wallets.size}`,
            name:
              provider === target.phantom?.ethereum || flags.isPhantom
                ? "Phantom"
                : flags.isMetaMask
                  ? "MetaMask"
                  : flags.isCoinbaseWallet
                    ? "Coinbase Wallet"
                    : "Ethereum wallet",
            provider,
          });
        }
        target.dispatchEvent(new Event("eip6963:requestProvider"));
        notify();
        return () => {
          readers.delete(listener);
        };
      },
    };
    registries.set(target, registry);
  }
  return registry.subscribe(read);
}

export function ethereumError(cause: unknown) {
  const code =
    cause && typeof cause === "object" && "code" in cause
      ? cause.code
      : undefined;
  if (code === -32002)
    return "A wallet request is already pending. Open the extension to approve or reject it.";
  if (code === 4001) return "Wallet connection declined.";
  return cause instanceof Error
    ? errorMessage(cause)
    : "Wallet connection failed.";
}
