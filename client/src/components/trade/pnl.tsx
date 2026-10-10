"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Download, X } from "lucide-react";
import type { PositionPnl, SettlementTransaction } from "@depthhq/sdk";
import { decimal, short, transactionUrl } from "@/shared/depth/format";
import "@/components/trade/pnl.css";

export type PnlCard = {
  result: PositionPnl;
  environment: string;
  transaction: () => Promise<SettlementTransaction>;
};

const labels = {
  open: "Open position",
  closed: "Closed position",
  reduced: "Reduced position",
  reversed: "Reversed position",
};

function signed(value: bigint, decimals = 6) {
  return `${value > 0n ? "+" : ""}${decimal(value, decimals)}`;
}

export function Pnl({
  card,
  open,
  onClose,
}: {
  card?: PnlCard;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLDivElement>(null);
  const [transaction, setTransaction] = useState<{
    card: PnlCard;
    value: SettlementTransaction;
  }>();
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const signature =
    transaction && transaction.card === card
      ? transaction.value.signature
      : undefined;

  useEffect(() => {
    const element = dialog.current;
    if (open && card && !element?.open) element?.showModal();
    if (!open && element?.open) element.close();
  }, [open, card]);

  useEffect(() => {
    if (!open || !card || signature) return;
    let stopped = false;
    void card
      .transaction()
      .then((value) => {
        if (!stopped) {
          setTransaction({ card, value });
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (!stopped)
          setError(
            cause instanceof Error
              ? cause.message
              : "Transaction could not be loaded",
          );
      });
    return () => {
      stopped = true;
    };
  }, [open, card, retry, signature]);

  async function save() {
    if (!image.current || !card || !signature) return;
    setSaving(true);
    setError("");
    try {
      await document.fonts.ready;
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(image.current, {
        pixelRatio: 2,
        backgroundColor: "#0b0b0b",
      });
      if (!blob) throw new Error("The card image could not be created");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `depth-${card.result.state}-${signature.slice(0, 8)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The card could not be saved",
      );
    } finally {
      setSaving(false);
    }
  }

  const result = card?.result;
  const live = result?.state === "open";
  return (
    <dialog
      ref={dialog}
      className="pnl-dialog"
      aria-label="Position PnL"
      onClose={onClose}
    >
      <button
        className="pnl-close"
        aria-label="Close PnL card"
        onClick={() => dialog.current?.close()}
      >
        <X size={18} />
      </button>
      {card && result && (
        <>
          <div className="pnl-card" ref={image} data-loss={result.net < 0n}>
            <div className="pnl-header">
              <span className="wordmark">depth</span>
            </div>
            <div className="pnl-market">
              <h2>SOL / USDC</h2>
              <span className="pnl-side" data-side={result.side}>
                {result.side === "long" ? "Long" : "Short"}
              </span>
            </div>
            <div className="pnl-result">
              <span className="pnl-label">
                {live ? "Return on collateral" : "Return on prior collateral"}
              </span>
              <div className="pnl-number">
                {result.returnBps === null ? "—" : signed(result.returnBps, 2)}
                {result.returnBps !== null && (
                  <span className="pnl-percent">%</span>
                )}
              </div>
              <div className="pnl-net">
                <span>{signed(result.net)} USDC</span>
                <span
                  className="pnl-net-label"
                  title={
                    live
                      ? "Price PnL less accrued funding; exit fees are excluded."
                      : "Realized price PnL less this execution's funding and fee; earlier fees are excluded."
                  }
                >
                  {live ? "Unrealized PnL" : "Execution PnL"}
                </span>
              </div>
            </div>
            <dl className="pnl-prices">
              <div>
                <dt>Entry price</dt>
                <dd>${decimal(result.entryPriceE8, 8)}</dd>
              </div>
              <ArrowRight size={16} aria-hidden="true" />
              <div>
                <dt>{live ? "Mark price" : "Execution price"}</dt>
                <dd>${decimal(result.priceE8, 8)}</dd>
              </div>
            </dl>
            <div className="pnl-footer">
              <span>{labels[result.state]}</span>
              {signature ? (
                <a
                  href={transactionUrl(signature, card.environment)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View ${live ? "latest trade" : "trade"} settlement transaction ${signature}`}
                  title={signature}
                >
                  {short(signature)}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              ) : (
                <button
                  disabled={!error}
                  title={error || "Reading settlement transaction"}
                  onClick={() => {
                    setError("");
                    setRetry((value) => value + 1);
                  }}
                >
                  {error ? "Retry transaction" : "—"}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="pnl-brand">depth.supply</div>
          </div>
          <div className="pnl-actions">
            <button disabled={saving || !signature} onClick={() => void save()}>
              <Download size={14} />
              {saving ? "Saving…" : "Save card"}
            </button>
          </div>
          {error && (
            <p className="pnl-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </dialog>
  );
}
