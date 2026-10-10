"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import type { ExecutionDetail, PendingItem } from "@depthhq/sdk";
import { useDepth } from "@/shared/depth/session";
import { decimal } from "@/shared/depth/format";
import { Pnl, type PnlCard } from "@/components/trade/pnl";

export function Execution({ item }: { item: PendingItem }) {
  const session = useDepth();
  const [detail, setDetail] = useState<ExecutionDetail>();
  const [card, setCard] = useState<PnlCard>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  async function read() {
    if (!session.trader) return;
    setError("");
    await session.run(
      "Reading private execution history",
      async () => {
        try {
          setDetail(await session.trader!.history.execution(item.nonce));
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Execution could not be read",
          );
          throw cause;
        }
      },
      false,
    );
  }
  if (!detail)
    return (
      <div className="execution-read">
        <button disabled={Boolean(session.busy)} onClick={() => void read()}>
          {error ? "Retry execution" : "Read execution"}
        </button>
        {error && <span role="alert">{error}</span>}
      </div>
    );
  const { fill, pnl } = detail;
  return (
    <div className="execution-details">
      <span data-side={fill.side === 1n ? "long" : "short"}>
        {fill.side === 1n ? "Buy" : "Sell"} {decimal(fill.size, 9, 4)} SOL
      </span>
      <span>@ ${decimal(fill.executionPriceE8, 8)}</span>
      <span>Fee {decimal(fill.fee, 6, 4)} USDC</span>
      {pnl && (
        <div className="execution-pnl">
          <span>PnL</span>
          <strong data-loss={pnl.net < 0n}>
            {pnl.net > 0n ? "+" : ""}
            {decimal(pnl.net)} USDC
          </strong>
          <button
            aria-label="Share execution PnL"
            onClick={() => {
              setCard({
                result: pnl,
                environment: session.config.environment,
                transaction: async () => detail.transaction,
              });
              setOpen(true);
            }}
          >
            <Share2 size={14} />
          </button>
        </div>
      )}
      <Pnl card={card} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
