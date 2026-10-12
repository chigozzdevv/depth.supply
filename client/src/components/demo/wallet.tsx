"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { Wallet, X } from "lucide-react";
import { PrivateViews } from "@/components/demo/views";
import { short } from "@/shared/depth/format";
import { WalletConnection } from "@/shared/depth/wallet";

export function WalletButton({
  label = "Connect wallet",
  className = "terminal-wallet",
}: { label?: string; className?: string } = {}) {
  const wallet = useWallet();
  const connection = useContext(WalletConnection);
  const connecting = wallet.connecting || Boolean(connection?.connecting);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (wallet.connected) dialog.current?.close();
  }, [wallet.connected]);
  const available = wallet.wallets.filter(
    (item) =>
      item.readyState === WalletReadyState.Installed ||
      item.readyState === WalletReadyState.Loadable,
  );
  return (
    <>
      <button
        className={className}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {!wallet.connected && <Wallet size={15} />}
        {wallet.publicKey
          ? short(wallet.publicKey.toBase58())
          : connecting
            ? "Connecting…"
            : label}
      </button>
      <dialog
        ref={dialog}
        className="terminal-dialog"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
      >
        <div className="dialog-heading">
          <h2 id={titleId}>
            {wallet.connected ? "Your wallet" : "Connect wallet"}
          </h2>
          <button
            aria-label="Close wallet dialog"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        {wallet.connected ? (
          <>
            {wallet.wallet && (
              <div className="wallet-identity">
                <Image
                  src={wallet.wallet.adapter.icon}
                  alt=""
                  width={28}
                  height={28}
                  className="wallet-icon"
                  unoptimized
                />
                <strong>{wallet.wallet.adapter.name}</strong>
              </div>
            )}
            <p className="wallet-address">{wallet.publicKey?.toBase58()}</p>
            {open && <PrivateViews />}
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
            <div className="wallet-options">
              {available.map(({ adapter }) => (
                <button
                  key={adapter.name}
                  className="wallet-option"
                  disabled={connecting}
                  onClick={() => {
                    if (!connection)
                      throw new Error(
                        "Wallet connection provider is unavailable",
                      );
                    setError("");
                    void connection
                      .connect(adapter, wallet.select)
                      .then(() => {
                        if (adapter.connected) setOpen(false);
                      })
                      .catch((cause) =>
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Wallet connection failed",
                        ),
                      );
                  }}
                >
                  <Image
                    src={adapter.icon}
                    alt=""
                    width={24}
                    height={24}
                    className="wallet-icon"
                    unoptimized
                  />
                  {adapter.name}
                </button>
              ))}
            </div>
            {connecting && (
              <button
                className="terminal-button full"
                onClick={() => {
                  if (!connection)
                    throw new Error(
                      "Wallet connection provider is unavailable",
                    );
                  connection.reset();
                  setOpen(false);
                }}
              >
                Cancel connection
              </button>
            )}
            {available.length === 0 && (
              <p>
                Open this page in a Solana wallet browser or enable its
                extension.
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
