"use client";

import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/wordmark";
import { WalletButton } from "@/components/demo/wallet";
import { useDepth } from "@/shared/depth/session";

export function Shell({
  role,
  market,
  actions,
  children,
}: {
  role: "trade" | "maker";
  market: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const session = useDepth();
  return (
    <div className="terminal">
      <header className="terminal-header">
        <div className="terminal-container terminal-bar">
          <div className="terminal-navigation">
            <div className="terminal-brand">
              <Wordmark />
            </div>
            <nav aria-label="Demo navigation">
              <Link
                aria-current={role === "trade" ? "page" : undefined}
                href="/demo/trade"
              >
                Trade
              </Link>
              <Link
                aria-current={role === "maker" ? "page" : undefined}
                href="/demo/maker"
              >
                Maker
              </Link>
            </nav>
          </div>
          {market}
          <div className="terminal-actions">
            {actions}
            <span className="network-pill">
              {session.config.environment === "devnet" ? "Devnet" : "Localnet"}
            </span>
            <WalletButton />
          </div>
        </div>
      </header>
      <main id="main" className="terminal-container terminal-main">
        {(session.error ||
          (session.busy && !session.reading) ||
          session.message) && (
          <div
            className="terminal-notice"
            role={session.error ? "alert" : "status"}
          >
            {session.busy && !session.reading && (
              <LoaderCircle size={15} className="spin" />
            )}
            <span>
              {session.error ||
                (!session.reading && session.busy) ||
                session.message}
            </span>
            {session.error && session.retry && !session.busy && (
              <button onClick={session.retry}>Retry</button>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
