"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CandleInterval, MarketData } from "@depthhq/sdk";
import { CandleHistory, emptyCandles } from "@/shared/depth/history";

type Feed = {
  scope: string;
  history: CandleHistory;
  controller: AbortController;
  error: string;
  loadError: string;
  historyError: string;
  historyLoading: boolean;
};
type ChartState = ReturnType<CandleHistory["view"]> &
  Omit<Feed, "history" | "controller">;

function snapshot(feed: Feed): ChartState {
  return {
    ...feed.history.view(),
    scope: feed.scope,
    error: feed.error,
    loadError: feed.loadError,
    historyError: feed.historyError,
    historyLoading: feed.historyLoading,
  };
}

export function useCandles(
  data: MarketData | undefined,
  interval: CandleInterval,
) {
  const [state, setState] = useState<ChartState>();
  const active = useRef<Feed>(null);
  const scope = `${data?.serviceUrl}:${interval}`;
  useEffect(() => {
    if (!data) return;
    const feed: Feed = {
      scope,
      history: new CandleHistory(),
      controller: new AbortController(),
      error: "",
      loadError: "",
      historyError: "",
      historyLoading: false,
    };
    active.current = feed;
    let retry: ReturnType<typeof setTimeout>;
    const signal = () =>
      AbortSignal.any([feed.controller.signal, AbortSignal.timeout(15_000)]);
    const stop = data.subscribe({
      interval,
      onUpdate: (page) => {
        if (feed.controller.signal.aborted) return;
        feed.history.live(page);
        feed.error = feed.history.view().page?.stale
          ? "Reference feed is delayed"
          : "";
        setState(snapshot(feed));
      },
      onError: () => {
        if (feed.controller.signal.aborted) return;
        feed.error = "Reference feed disconnected. Reconnecting…";
        setState(snapshot(feed));
      },
    });
    async function initialize() {
      try {
        const page = await data!.candles(
          "SOL-USD",
          { interval, limit: 200 },
          signal(),
        );
        if (feed.controller.signal.aborted) return;
        feed.history.initialize(page);
        feed.loadError = "";
        setState(snapshot(feed));
      } catch {
        if (feed.controller.signal.aborted) return;
        feed.loadError = "Reference history unavailable. Retrying…";
        setState(snapshot(feed));
        retry = setTimeout(initialize, 5000);
      }
    }
    void initialize();
    return () => {
      feed.controller.abort();
      clearTimeout(retry);
      stop();
      if (active.current === feed) active.current = null;
    };
  }, [data, interval, scope]);

  const more = useCallback(async () => {
    const feed = active.current;
    const cursor = feed?.history.view().cursor;
    if (
      !data ||
      !feed ||
      feed.scope !== scope ||
      feed.historyLoading ||
      cursor == null
    )
      return;
    feed.historyLoading = true;
    feed.historyError = "";
    setState(snapshot(feed));
    try {
      const page = await data.candles(
        "SOL-USD",
        { interval, limit: 200, before: cursor },
        AbortSignal.any([feed.controller.signal, AbortSignal.timeout(15_000)]),
      );
      if (!feed.controller.signal.aborted) feed.history.prepend(page);
    } catch {
      if (!feed.controller.signal.aborted)
        feed.historyError = "History unavailable. Scroll to retry.";
    } finally {
      feed.historyLoading = false;
      if (!feed.controller.signal.aborted) setState(snapshot(feed));
    }
  }, [data, interval, scope]);

  const current = state?.scope === scope ? state : undefined;
  return {
    scope,
    items: current?.items ?? emptyCandles,
    page: current?.page,
    ready: current?.ready ?? false,
    error: current?.error ?? "",
    loadError: current?.loadError ?? "",
    historyError: current?.historyError ?? "",
    historyLoading: current?.historyLoading ?? false,
    hasMore: current?.cursor != null,
    more,
  };
}

export type CandleView = ReturnType<typeof useCandles>;
