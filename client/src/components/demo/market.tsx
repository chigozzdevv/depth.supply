"use client";

import type { MarketView } from "@/shared/depth/market";
import type { CandleView } from "@/shared/depth/candles";
import { livePrice } from "@/shared/depth/price";

export function MarketHeader({
  view,
  candles,
}: {
  view: MarketView;
  candles: CandleView;
}) {
  const price = candles.error
    ? undefined
    : livePrice(candles.page, view.now * 1000);
  const formatted = price?.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <div
      className="terminal-market"
      data-live={price !== undefined}
      title={
        formatted ? `Live SOL/USD reference price: ${formatted}` : "SOL / USDC"
      }
    >
      <h1 className="terminal-pair">SOL / USDC</h1>
      {formatted && (
        <span
          className="terminal-price"
          aria-label={`Live reference price ${formatted}`}
        >
          {formatted}
        </span>
      )}
    </div>
  );
}
