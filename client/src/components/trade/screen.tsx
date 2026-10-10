"use client";

import { useState } from "react";
import type { CandleInterval } from "@depthhq/sdk";
import type { DemoConfig } from "@/shared/config/runtime";
import { Providers } from "@/components/demo/providers";
import { Shell } from "@/components/demo/shell";
import { MarketHeader } from "@/components/demo/market";
import { Funds } from "@/components/demo/funds";
import { Chart } from "@/components/trade/chart";
import { Ticket } from "@/components/trade/ticket";
import { Records } from "@/components/trade/records";
import { useMarket } from "@/shared/depth/market";
import { useAccount } from "@/shared/depth/account";
import { useCandles } from "@/shared/depth/candles";

function Screen() {
  const view = useMarket();
  const account = useAccount();
  const [interval, setInterval] = useState<CandleInterval>("15m");
  const candles = useCandles(view.data, interval);
  const [mobile, setMobile] = useState("chart");
  return (
    <Shell
      role="trade"
      market={<MarketHeader view={view} candles={candles} />}
      actions={<Funds account={account} />}
    >
      <div
        className="mobile-trade-tabs"
        role="tablist"
        aria-label="Trading view"
      >
        {["chart", "trade", "positions"].map((value) => (
          <button
            role="tab"
            aria-selected={mobile === value}
            key={value}
            onClick={() => setMobile(value)}
          >
            {value === "chart"
              ? "Chart"
              : value === "trade"
                ? "Trade"
                : "Positions"}
          </button>
        ))}
      </div>
      <div className="trade-grid" data-mobile={mobile}>
        <div className="trade-chart">
          <Chart
            candles={candles}
            interval={interval}
            onInterval={setInterval}
          />
        </div>
        <div className="trade-ticket">
          <Ticket view={view} />
        </div>
        <div className="trade-records">
          <Records account={account} view={view} />
        </div>
      </div>
    </Shell>
  );
}
export function Trading({ config }: { config: DemoConfig }) {
  return (
    <Providers config={config} role="trade">
      <Screen />
    </Providers>
  );
}
