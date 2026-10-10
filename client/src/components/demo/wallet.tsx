"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { Wallet, X, ExternalLink } from "lucide-react";
import { short } from "@/shared/depth/format";

export function WalletButton({
  label = "Connect wallet",
  className = "terminal-wallet",
}: { label?: string; className?: string } = {}) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const requested = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (!requested.current || !wallet.wallet) return;
    requested.current = false;
    void wallet
      .connect()
      .then(() => setOpen(false))
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Wallet connection failed",
        ),
      );
  }, [wallet]);
  const available = wallet.wallets.filter(
    (item) =>
      item.readyState === WalletReadyState.Installed ||
      item.readyState === WalletReadyState.Loadable,
  );
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        <Wallet size={15} />
        {wallet.connecting
          ? "Connecting…"
          : wallet.publicKey
            ? short(wallet.publicKey.toBase58())
            : label}
      </button>
      <dialog
        ref={dialog}
        className="terminal-dialog"
        onClose={() => setOpen(false)}
      >
        <div className="dialog-heading">
          <h2>{wallet.connected ? "Your wallet" : "Connect a wallet"}</h2>
          <button
            aria-label="Close wallet dialog"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        {wallet.connected ? (
          <>
            <p className="wallet-address">{wallet.publicKey?.toBase58()}</p>
            <button
              className="terminal-button"
              onClick={() =>
                void wallet.disconnect().then(() => setOpen(false))
              }
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p>Use a Solana wallet on devnet. Your keys stay in your wallet.</p>
            <div className="wallet-options">
              {available.map(({ adapter }) => (
                <button
                  key={adapter.name}
                  className="wallet-option"
                  onClick={() => {
                    setError("");
                    requested.current = true;
                    wallet.select(adapter.name);
                    if (wallet.wallet?.adapter.name === adapter.name) {
                      requested.current = false;
                      void wallet
                        .connect()
                        .then(() => setOpen(false))
                        .catch((cause) => setError(String(cause)));
                    }
                  }}
                >
                  {adapter.name}
                  <ExternalLink size={14} />
                </button>
              ))}
            </div>
            {available.length === 0 && (
              <p>
                No compatible wallet detected. Open this page in your
                wallet&apos;s browser or enable its browser extension.
              </p>
            )}
          </>
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
