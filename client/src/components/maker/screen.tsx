"use client";

import { useEffect, useState } from "react";
import type { QuoteSnapshot } from "@depthhq/maker-sdk";
import type { CandleInterval } from "@depthhq/sdk";
import type { DemoConfig } from "@/shared/config/runtime";
import { Providers } from "@/components/demo/providers";
import { Shell } from "@/components/demo/shell";
import { MarketHeader } from "@/components/demo/market";
import { Funds } from "@/components/demo/funds";
import { Chart } from "@/components/trade/chart";
import { Records } from "@/components/trade/records";
import { QuoteTicket } from "@/components/maker/ticket";
import { Quotes } from "@/components/maker/quotes";
import { Fills } from "@/components/maker/fills";
import { Operators } from "@/components/maker/operators";
import { Hedges } from "@/components/maker/hedges";
import { Automation } from "@/components/maker/automation";
import { useMarket } from "@/shared/depth/market";
import { useAccount } from "@/shared/depth/account";
import { useDepth } from "@/shared/depth/session";
import { useCandles } from "@/shared/depth/candles";

function Screen() {
  const session = useDepth();
  const view = useMarket();
  const account = useAccount();
  const [interval, setInterval] = useState<CandleInterval>("15m");
  const candles = useCandles(view.data, interval);
  const [tab, setTab] = useState("quotes");
  const [state, setState] = useState<{
    owner: string;
    items: QuoteSnapshot[];
    cursor: string | null;
  }>();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const owner = session.maker?.options.maker.toBase58();
  useEffect(() => {
    if (!session.maker || !owner) return;
    const maker = session.maker;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const page = await maker.quote.list({ limit: 20 });
        const items = await Promise.all(
          page.items.map((item) => item.handle.status()),
        );
        if (!stopped) {
          setState((previous) => {
            if (!expanded || !previous || previous.owner !== owner)
              return { owner: owner!, items, cursor: page.nextCursor };
            const refreshed = new Map(items.map((item) => [item.id, item]));
            return {
              owner: owner!,
              items: [
                ...items,
                ...previous.items.filter((item) => !refreshed.has(item.id)),
              ],
              cursor: previous.cursor,
            };
          });
          setError("");
        }
      } catch {
        if (!stopped)
          setError(
            "Quote discovery is unavailable. Your canonical quotes remain onchain.",
          );
      } finally {
        if (!stopped) timer = setTimeout(read, 15_000);
      }
    }
    void read();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [session.maker, session.version, owner, expanded]);
  const current = state?.owner === owner ? state : undefined;
  async function more() {
    if (!session.maker || !owner || !current?.cursor) return;
    try {
      const page = await session.maker.quote.list({
        cursor: current.cursor,
        limit: 20,
      });
      const items = await Promise.all(
        page.items.map((item) => item.handle.status()),
      );
      setExpanded(true);
      setState({
        owner,
        items: [...current.items, ...items],
        cursor: page.nextCursor,
      });
    } catch {
      setError("More quotes could not be loaded");
    }
  }
  return (
    <Shell
      role="maker"
      market={<MarketHeader view={view} candles={candles} />}
      actions={<Funds account={account} />}
    >
      <div className="maker-grid">
        <div className="maker-chart">
          <Chart
            candles={candles}
            interval={interval}
            onInterval={setInterval}
          />
        </div>
        <div className="maker-ticket">
          <QuoteTicket view={view} quotes={current?.items ?? []} />
        </div>
        <section className="maker-records records-panel">
          <div className="records-heading">
            <div role="tablist" aria-label="Maker records">
              {[
                "quotes",
                "fills",
                "automation",
                "hedges",
                "account",
                "operators",
              ].map((value) => (
                <button
                  role="tab"
                  aria-selected={tab === value}
                  key={value}
                  onClick={() => setTab(value)}
                >
                  {value === "quotes"
                    ? "Quotes"
                    : value === "fills"
                      ? "Fills"
                      : value === "automation"
                        ? "Automation"
                        : value === "hedges"
                          ? "Hedges"
                          : value === "account"
                            ? "Account"
                            : "Operators"}
                </button>
              ))}
            </div>
          </div>
          {tab === "quotes" ? (
            <Quotes
              items={current?.items}
              error={error}
              more={current?.cursor ? more : undefined}
            />
          ) : tab === "fills" ? (
            <Fills />
          ) : tab === "automation" ? (
            <Automation />
          ) : tab === "hedges" ? (
            <Hedges />
          ) : tab === "account" ? (
            <Records account={account} view={view} />
          ) : (
            <Operators />
          )}
        </section>
      </div>
    </Shell>
  );
}
export function Making({ config }: { config: DemoConfig }) {
  return (
    <Providers config={config} role="maker">
      <Screen />
    </Providers>
  );
}
