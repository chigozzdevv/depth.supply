"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { Candle, CandleInterval } from "@depthhq/sdk";
import type { CandleView } from "@/shared/depth/candles";
import { CandleSeries } from "@/components/trade/series";
import { ChartStudies } from "@/components/chart/studies";
import { ChartTools } from "@/components/chart/tools";
import { ChartToolbar } from "@/components/chart/toolbar";
import type { ChartIndicatorId } from "@/components/chart/indicators";
import "@/components/chart/chart.css";

type Surface = {
  api: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  plot: CandleSeries;
  studies: ChartStudies;
};

export function Chart({
  candles,
  interval,
  onInterval,
}: {
  candles: CandleView;
  interval: CandleInterval;
  onInterval: (interval: CandleInterval) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>(null);
  const panel = useRef<HTMLElement>(null);
  const [surface, setSurface] = useState<Surface>();
  const [indicators, setIndicators] = useState<ChartIndicatorId[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<{ scope: string; candle: Candle }>();
  const loadMore = candles.more;
  useEffect(() => {
    if (!container.current) return;
    const theme = getComputedStyle(container.current);
    const api = createChart(container.current, {
      autoSize: true,
      layout: {
        background: {
          type: ColorType.Solid,
          color: theme.getPropertyValue("--terminal-background").trim(),
        },
        textColor: theme.getPropertyValue("--terminal-muted").trim(),
        fontFamily: "Geist Mono, monospace",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { visible: true, color: "#ffffff0a" },
        horzLines: { visible: true, color: "#ffffff0e" },
      },
      crosshair: {
        vertLine: { color: "#ffffff35", labelBackgroundColor: "#31312d" },
        horzLine: { color: "#ffffff35", labelBackgroundColor: "#31312d" },
      },
      rightPriceScale: {
        borderColor: "#ffffff0d",
        scaleMargins: { top: 0.13, bottom: 0.09 },
      },
      timeScale: {
        borderColor: "#ffffff0d",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        minBarSpacing: 2,
        maxBarSpacing: 32,
        lockVisibleTimeRangeOnResize: false,
        shiftVisibleRangeOnNewBar: true,
      },
      handleScale: { mouseWheel: false },
    });
    chart.current = api;
    const candles = api.addSeries(CandlestickSeries, {
      upColor: theme.getPropertyValue("--terminal-accent").trim(),
      downColor: theme.getPropertyValue("--terminal-candle-down").trim(),
      borderVisible: false,
      wickUpColor: theme.getPropertyValue("--terminal-accent").trim(),
      wickDownColor: theme.getPropertyValue("--terminal-candle-down").trim(),
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    const frame = requestAnimationFrame(() =>
      setSurface({
        api,
        candles,
        plot: new CandleSeries(candles, api.timeScale()),
        studies: new ChartStudies(api),
      }),
    );
    return () => {
      cancelAnimationFrame(frame);
      api.remove();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    surface?.plot.sync(candles.items, candles.scope);
    surface?.studies.sync(indicators, candles.items);
  }, [candles.items, candles.scope, surface, indicators]);
  useEffect(() => {
    if (!chart.current) return;
    const scale = chart.current.timeScale();
    const load = () => {
      const range = scale.getVisibleLogicalRange();
      if (range && range.from < 40) void loadMore();
    };
    scale.subscribeVisibleLogicalRangeChange(load);
    load();
    return () => scale.unsubscribeVisibleLogicalRangeChange(load);
  }, [loadMore, surface]);
  useEffect(() => {
    if (!surface) return;
    const update = (event: MouseEventParams<Time>) => {
      const value = event.seriesData.get(surface.candles);
      setHover(
        value && "open" in value && typeof value.time === "number"
          ? {
              scope: candles.scope,
              candle: {
                time: value.time,
                open: value.open,
                high: value.high,
                low: value.low,
                close: value.close,
              },
            }
          : undefined,
      );
    };
    surface.api.subscribeCrosshairMove(update);
    return () => surface.api.unsubscribeCrosshairMove(update);
  }, [surface, candles.scope]);
  useEffect(() => {
    if (!expanded) return;
    const overflow = document.body.style.overflow;
    const previous = document.activeElement;
    document.body.style.overflow = "hidden";
    const node = panel.current;
    node
      ?.querySelector<HTMLButtonElement>(
        'button[aria-label="Exit fullscreen chart"]',
      )
      ?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") setExpanded(false);
      if (event.key === "Tab") {
        const nodes = Array.from(
          node?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), summary, a[href], [tabindex="0"]',
          ) ?? [],
        ).filter((item) => item.getClientRects().length > 0);
        const first = nodes[0];
        const last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keyboard);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [expanded]);
  function zoom(factor: number) {
    const scale = chart.current?.timeScale();
    if (scale)
      scale.applyOptions({
        barSpacing: Math.max(
          2,
          Math.min(32, scale.options().barSpacing * factor),
        ),
      });
  }
  const last = candles.items.at(-1);
  const legend =
    hover?.scope === candles.scope
      ? candles.items.find((item) => item.time === hover.candle.time)
      : last;
  return (
    <section
      ref={panel}
      className={`chart-panel${expanded ? " chart-expanded" : ""}`}
      role={expanded ? "dialog" : "region"}
      aria-modal={expanded || undefined}
      aria-label="SOL/USD price chart"
    >
      <ChartToolbar
        interval={interval}
        active={indicators}
        expanded={expanded}
        ready={Boolean(last)}
        onInterval={onInterval}
        onIndicator={(id) =>
          setIndicators((items) =>
            items.includes(id)
              ? items.filter((item) => item !== id)
              : [...items, id],
          )
        }
        onZoom={zoom}
        onFit={() => chart.current?.timeScale().fitContent()}
        onReset={() => {
          chart.current?.timeScale().applyOptions({ barSpacing: 8 });
          chart.current?.timeScale().scrollToPosition(4, false);
          surface?.candles.priceScale().applyOptions({ autoScale: true });
        }}
        onExpand={() => setExpanded((value) => !value)}
      />
      <div className="chart-caption">
        <span>SOL/USD</span>
        {legend && (
          <div>
            <span>O {legend.open.toFixed(2)}</span>
            <span>H {legend.high.toFixed(2)}</span>
            <span>L {legend.low.toFixed(2)}</span>
            <span>C {legend.close.toFixed(2)}</span>
          </div>
        )}
      </div>
      <div className="chart-surface">
        <div className="price-chart" ref={container} />
        {surface && last && (
          <ChartTools
            key={candles.scope}
            chart={surface.api}
            series={surface.candles}
            scope="SOL-USD"
            items={candles.items}
          />
        )}
      </div>
      {!last && (
        <div className="chart-empty">
          {candles.loadError || candles.error || "Loading SOL price history…"}
        </div>
      )}
      {last &&
        (candles.error || candles.historyError || candles.historyLoading) && (
          <div className="chart-error" role="status">
            {candles.error || candles.historyError || "Loading history…"}
          </div>
        )}
    </section>
  );
}
