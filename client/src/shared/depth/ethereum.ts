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
  isRabby?: boolean;
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
    const legacyWallets = new Map<EthereumProvider, EthereumWallet>();
    const dedicated = new Set<EthereumProvider>();
    const readers = new Set<(wallets: EthereumWallet[]) => void>();
    const snapshot = () => {
      const announced = [...wallets.values()];
      const names = new Set(announced.map(({ name }) => name.toLowerCase()));
      const legacy = [...legacyWallets.values()].filter(
        ({ provider, name }) =>
          !wallets.has(provider) &&
          !names.has(name.toLowerCase()) &&
          (!announced.length || dedicated.has(provider)),
      );
      return [...announced, ...legacy].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    };
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
        const explicit = [
          target.phantom?.ethereum,
          ...(target.ethereum?.providers ?? []),
        ];
        for (const provider of explicit) {
          if (providerValid(provider)) dedicated.add(provider);
        }
        for (const provider of [...explicit, target.ethereum]) {
          if (!providerValid(provider) || legacyWallets.has(provider)) continue;
          const flags = provider as LegacyProvider;
          legacyWallets.set(provider, {
            id: `legacy-${legacyWallets.size}`,
            name:
              provider === target.phantom?.ethereum || flags.isPhantom
                ? "Phantom"
                : flags.isRabby
                  ? "Rabby Wallet"
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
  if (code === 4200 || code === -32601)
    return "This wallet does not support Ethereum account connections. Choose another wallet.";
  if (code === 4100) return "Open your wallet and allow this site to connect.";
  if (code === 4900 || code === 4901)
    return "Your Ethereum wallet is disconnected. Open it and reconnect.";
  const message =
    cause && typeof cause === "object" && "message" in cause
      ? cause.message
      : undefined;
  return typeof message === "string" && message.trim()
    ? errorMessage(new Error(message))
    : "Wallet connection failed. Open your wallet and try again.";
}
