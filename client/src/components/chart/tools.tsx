"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Minus, MousePointer2, Ruler, TrendingUp } from "lucide-react";
import type { Candle } from "@depthhq/sdk";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import {
  createChartDrawing,
  defaultDrawingAppearance,
  parseChartDrawings,
  removeChartDrawing,
  serializeChartDrawings,
  setChartDrawingLocked,
  updateChartDrawingAppearance,
  type ChartDrawing,
  type ChartDrawingPoint,
  type ChartDrawingTool,
} from "@/components/chart/drawing";
import {
  pointFromEvent,
  horizontalPointFromEvent,
  toScreenPoint,
  toScreenPricePoint,
} from "@/components/chart/geometry";
import { DrawingLine, RenderedDrawing } from "@/components/chart/overlay";
import { DrawingActions } from "@/components/chart/appearance";

const tools = [
  { id: "pointer", icon: MousePointer2, label: "Navigate chart" },
  { id: "trend", icon: TrendingUp, label: "Draw trend line" },
  { id: "horizontal", icon: Minus, label: "Draw horizontal line" },
  { id: "measure", icon: Ruler, label: "Measure price and time" },
] as const;

export function ChartTools({
  chart,
  series,
  scope,
  items,
}: {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  scope: string;
  items: Candle[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const [tool, setTool] = useState<ChartDrawingTool>("pointer");
  const [draft, setDraft] = useState<ChartDrawingPoint>();
  const [cursor, setCursor] = useState<ChartDrawingPoint>();
  const [selected, setSelected] = useState<string>();
  const [drawings, setDrawings] = useState<ChartDrawing[]>(() =>
    readDrawings(scope),
  );
  const [, setRevision] = useState(0);
  const redraw = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setRevision((value) => value + 1);
    });
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(scope), serializeChartDrawings(drawings));
    } catch {
      /* Chart annotations remain usable when browser storage is unavailable. */
    }
  }, [drawings, scope]);
  useEffect(() => {
    const scale = chart.timeScale();
    const pane = chart.panes()[0]?.getHTMLElement();
    const parent = root.current?.parentElement;
    const observer = new ResizeObserver(redraw);
    if (pane) observer.observe(pane);
    scale.subscribeVisibleLogicalRangeChange(redraw);
    scale.subscribeSizeChange(redraw);
    parent?.addEventListener("wheel", redraw, { capture: true, passive: true });
    parent?.addEventListener("pointermove", redraw, {
      capture: true,
      passive: true,
    });
    parent?.addEventListener("pointerup", redraw, {
      capture: true,
      passive: true,
    });
    return () => {
      observer.disconnect();
      scale.unsubscribeVisibleLogicalRangeChange(redraw);
      scale.unsubscribeSizeChange(redraw);
      parent?.removeEventListener("wheel", redraw, true);
      parent?.removeEventListener("pointermove", redraw, true);
      parent?.removeEventListener("pointerup", redraw, true);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [chart, redraw]);
  useEffect(() => {
    redraw();
    const settled = requestAnimationFrame(redraw);
    return () => cancelAnimationFrame(settled);
  }, [items, redraw]);

  const { width, height } = chart.paneSize(0);
  const selection = drawings.find((item) => item.id === selected);
  function choose(next: ChartDrawingTool) {
    setTool(next);
    setDraft(undefined);
    setCursor(undefined);
    setSelected(undefined);
  }
  function remove() {
    if (!selection || selection.locked) return;
    setDrawings((items) => removeChartDrawing(items, selection.id));
    setSelected(undefined);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && (tool !== "pointer" || selection)) {
      event.preventDefault();
      event.stopPropagation();
      choose("pointer");
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selection) {
      event.preventDefault();
      event.stopPropagation();
      remove();
    }
  }
  function place(event: PointerEvent<SVGSVGElement>) {
    if (tool === "pointer" || event.button !== 0) return;
    const point =
      tool === "horizontal"
        ? horizontalPointFromEvent(event, series, width, height)
        : pointFromEvent(event, chart, series, width, height);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    root.current?.focus({ preventScroll: true });
    if (tool !== "horizontal" && !draft) {
      setDraft(point);
      return;
    }
    const drawing = createChartDrawing(
      crypto.randomUUID(),
      tool,
      tool === "horizontal" ? point : draft!,
      point,
    );
    if (drawing) setDrawings((items) => [...items, drawing].slice(-100));
    choose("pointer");
  }
  const previewStart = draft ? toScreenPoint(chart, series, draft) : null;
  const previewEnd = cursor ? toScreenPoint(chart, series, cursor) : null;
  const instruction =
    tool === "horizontal"
      ? "Click to place a price level"
      : tool === "pointer"
        ? undefined
        : draft
          ? "Click the second point · Esc to cancel"
          : "Click the first point · Esc to cancel";
  return (
    <div
      ref={root}
      className="chart-drawing-root"
      aria-label="Chart drawing canvas"
      tabIndex={-1}
      onKeyDown={keyboard}
      style={{ "--chart-drawing-center-y": `${height / 2}px` } as CSSProperties}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setSelected(undefined);
      }}
    >
      <div
        className="chart-drawing-toolbar"
        role="group"
        aria-label="Chart drawing tools"
      >
        {tools.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            aria-label={label}
            aria-pressed={tool === id}
            title={label}
            onClick={() => choose(id)}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
      {selection && (
        <DrawingActions
          key={selection.id}
          drawing={selection}
          onAppearance={(patch) =>
            setDrawings((items) =>
              updateChartDrawingAppearance(items, selection.id, patch),
            )
          }
          onLock={() =>
            setDrawings((items) =>
              setChartDrawingLocked(items, selection.id, !selection.locked),
            )
          }
          onDelete={remove}
        />
      )}
      {instruction && (
        <span className="chart-drawing-instruction" role="status">
          {instruction}
        </span>
      )}
      <svg
        aria-hidden="true"
        className={`chart-drawing-overlay ${tool !== "pointer" ? "chart-drawing-overlay-active" : ""}`}
        width={Math.max(1, width)}
        height={Math.max(1, height)}
        viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
        onPointerDown={place}
        onPointerLeave={() => setCursor(undefined)}
        onPointerMove={(event) => {
          if (tool !== "pointer")
            setCursor(pointFromEvent(event, chart, series, width, height));
        }}
      >
        {drawings.map((drawing) => (
          <RenderedDrawing
            key={drawing.id}
            drawing={drawing}
            paneWidth={width}
            paneHeight={height}
            selected={drawing.id === selected}
            points={
              drawing.kind === "horizontal"
                ? [toScreenPricePoint(series, drawing.points[0])]
                : drawing.points.map((point) =>
                    toScreenPoint(chart, series, point),
                  )
            }
            onSelect={() => {
              choose("pointer");
              setSelected(drawing.id);
              root.current?.focus({ preventScroll: true });
            }}
          />
        ))}
        {previewStart &&
          previewEnd &&
          tool !== "pointer" &&
          tool !== "horizontal" && (
            <DrawingLine
              start={previewStart}
              end={previewEnd}
              kind={tool}
              appearance={defaultDrawingAppearance(tool)}
              className="chart-drawing-preview"
            />
          )}
      </svg>
    </div>
  );
}

function storageKey(scope: string) {
  return `depth:chart:v1:${scope}`;
}
function readDrawings(scope: string) {
  try {
    return parseChartDrawings(localStorage.getItem(storageKey(scope)));
  } catch {
    return [];
  }
}
