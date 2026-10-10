"use client";

import {
  Activity,
  Check,
  Expand,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import type { CandleInterval } from "@depthhq/sdk";
import type { ChartIndicatorId } from "@/components/chart/indicators";

const indicators = [
  { id: "sma", label: "SMA 20" },
  { id: "ema", label: "EMA 20" },
  { id: "bollinger", label: "Bollinger Bands" },
  { id: "rsi", label: "RSI 14" },
  { id: "macd", label: "MACD 12 / 26 / 9" },
] as const;

export function ChartToolbar({
  interval,
  active,
  expanded,
  ready,
  onInterval,
  onIndicator,
  onZoom,
  onFit,
  onReset,
  onExpand,
}: {
  interval: CandleInterval;
  active: ChartIndicatorId[];
  expanded: boolean;
  ready: boolean;
  onInterval: (interval: CandleInterval) => void;
  onIndicator: (id: ChartIndicatorId) => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onReset: () => void;
  onExpand: () => void;
}) {
  return (
    <div className="chart-toolbar">
      <div className="chart-intervals" role="group" aria-label="Chart interval">
        {(["1m", "5m", "15m", "1h", "4h", "1d"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={interval === value}
            onClick={() => onInterval(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="chart-actions">
        <details className="chart-indicators">
          <summary
            aria-label="Indicators"
            title="Indicators"
            className={active.length ? "chart-tool-active" : ""}
          >
            <Activity size={14} />
            <span>Indicators</span>
            {active.length > 0 && <em>{active.length}</em>}
          </summary>
          <div
            className="chart-indicator-menu"
            role="group"
            aria-label="Chart indicators"
          >
            {indicators.map(({ id, label }) => (
              <button
                key={id}
                aria-pressed={active.includes(id)}
                onClick={() => onIndicator(id)}
              >
                <span>{active.includes(id) && <Check size={12} />}</span>
                {label}
              </button>
            ))}
          </div>
        </details>
        <button
          aria-label="Zoom out"
          title="Zoom out"
          disabled={!ready}
          onClick={() => onZoom(1 / 1.25)}
        >
          <Minus size={14} />
        </button>
        <button
          aria-label="Zoom in"
          title="Zoom in"
          disabled={!ready}
          onClick={() => onZoom(1.25)}
        >
          <Plus size={14} />
        </button>
        <button
          aria-label="Fit price chart"
          title="Fit chart"
          disabled={!ready}
          onClick={onFit}
        >
          <Expand size={14} />
        </button>
        <button
          aria-label="Reset chart view"
          title="Reset chart"
          disabled={!ready}
          onClick={onReset}
        >
          <RotateCcw size={14} />
        </button>
        <button
          aria-label={
            expanded ? "Exit fullscreen chart" : "Open chart fullscreen"
          }
          title={expanded ? "Exit fullscreen" : "Fullscreen"}
          onClick={onExpand}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
    </div>
  );
}
