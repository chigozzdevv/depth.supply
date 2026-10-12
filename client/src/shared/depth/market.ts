"use client";

import { useEffect, useState } from "react";
import {
  create_depth_data,
  type MarketData,
  type PublicMarket,
  type PublicApp,
} from "@depthhq/sdk/data";
import { useDepth } from "@/shared/depth/session";
import { fundingFresh } from "@depthhq/bindings";

export function useMarket() {
  const { config } = useDepth();
  const [data] = useState<MarketData>(() =>
    create_depth_data({
      environment: config.environment,
      serviceUrl: `${location.origin}/api/depth`,
    }),
  );
  const [market, setMarket] = useState<PublicMarket>();
  const [app, setApp] = useState<PublicApp>();
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const client = data;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const [next, registration] = await Promise.all([
          client.market(),
          client.app(config.appId),
        ]);
        if (!stopped) {
          setMarket(next);
          setApp(registration);
          setError("");
          setNow(Math.floor(Date.now() / 1000));
        }
      } catch {
        if (!stopped) setError("Market data unavailable. Reconnecting…");
      } finally {
        if (!stopped) timer = setTimeout(read, 5000);
      }
    }
    void read();
    const clock = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [config, data]);
  const age = market
    ? Math.max(0, now - Number(market.oracle_timestamp))
    : undefined;
  const stale =
    age === undefined || age > (market?.max_oracle_age_seconds ?? 0);
  const fundingOverdue = Boolean(
    market &&
    !fundingFresh(
      Number(market.last_funding_timestamp),
      market.funding_interval_seconds,
      now,
    ),
  );
  const reason =
    error ||
    (!market
      ? "Loading market"
      : !app?.active
        ? "App registration is inactive"
        : market.status !== "active"
          ? `Market ${market.status}`
          : market.incident !== "none"
            ? "Market incident"
            : stale
              ? "Oracle update required"
              : fundingOverdue
                ? "Funding update required"
                : market.active_quote_ids.length === 0
                  ? "Waiting for maker liquidity"
                  : "");
  return {
    data,
    market,
    app,
    error,
    now,
    age,
    stale,
    fundingOverdue,
    reason,
    ready: !reason,
  };
}
export type MarketView = ReturnType<typeof useMarket>;
