"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Wallet, X } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { connect_hyperliquid } from "@depthhq/maker-sdk";
import {
  discoverEthereum,
  ethereumError,
  type EthereumWallet,
} from "@/shared/depth/ethereum";

export type HedgeWallet = Awaited<ReturnType<typeof connect_hyperliquid>>;
export function HedgeWalletButton({
  label,
  disabled,
  account,
  onConnected,
}: {
  label: string;
  disabled: boolean;
  account?: string;
  onConnected: (wallet: HedgeWallet, address: string) => void;
}) {
  const solana = useWallet();
  const [open, setOpen] = useState(false);
  const [wallets, setWallets] = useState<EthereumWallet[]>([]);
  const [connecting, setConnecting] = useState<string>();
  const [error, setError] = useState("");
  const pending = useRef<AbortController>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => discoverEthereum(window, setWallets), []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => () => pending.current?.abort(), []);
  function close() {
    pending.current?.abort();
    setOpen(false);
  }
  async function connect(option: EthereumWallet) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setConnecting(option.id);
    setError("");
    try {
      const wallet = await connect_hyperliquid(option.provider, {
        signal: controller.signal,
      });
      const [address] = await wallet.getAddresses();
      if (controller.signal.aborted) return;
      if (account && address.toLowerCase() !== account.toLowerCase())
        throw new Error(
          "Select the wallet owning the configured Hyperliquid account.",
        );
      onConnected(wallet, address);
      setOpen(false);
    } catch (cause) {
      if (!controller.signal.aborted) setError(ethereumError(cause));
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setConnecting(undefined);
      }
    }
  }
  return (
    <>
      <button
        type="button"
        className="terminal-button secondary"
        disabled={disabled}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        className="terminal-dialog"
        aria-labelledby={titleId}
        onClose={close}
        onCancel={close}
      >
        <div className="dialog-heading">
          <h2 id={titleId}>Connect hedge wallet</h2>
          <button
            type="button"
            aria-label="Close hedge wallet dialog"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <div className="wallet-options">
          {wallets.map((option) => {
            const icon =
              option.icon ??
              solana.wallets.find(({ adapter }) => adapter.name === option.name)
                ?.adapter.icon;
            return (
              <button
                type="button"
                key={option.id}
                className="wallet-option"
                disabled={Boolean(connecting)}
                onClick={() => void connect(option)}
              >
                {icon ? (
                  <Image
                    src={icon}
                    alt=""
                    width={24}
                    height={24}
                    className="wallet-icon"
                    unoptimized
                  />
                ) : (
                  <Wallet size={24} />
                )}
                {option.name}
                {connecting === option.id && <span>Connecting…</span>}
              </button>
            );
          })}
        </div>
        {!wallets.length && (
          <p>No Ethereum wallet detected. Enable your wallet extension.</p>
        )}
        {connecting && (
          <button
            type="button"
            className="terminal-button secondary full"
            onClick={close}
          >
            Cancel connection
          </button>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </dialog>
    </>
  );
}
