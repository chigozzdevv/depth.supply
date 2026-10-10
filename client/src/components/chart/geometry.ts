import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  IChartApi,
  ISeriesApi,
  Logical,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { ChartDrawingPoint } from "@/components/chart/drawing";
export interface ScreenPoint {
  x: number;
  y: number;
}

export function pointFromEvent(
  event: ReactPointerEvent<SVGSVGElement>,
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  paneWidth: number,
  paneHeight: number,
): ChartDrawingPoint | undefined {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  if (x < 0 || x > paneWidth || y < 0 || y > paneHeight) return undefined;
  const time = chart.timeScale().coordinateToTime(x);
  const price = series.coordinateToPrice(y);
  const timestamp = toTimestamp(time);
  if (timestamp === null || price === null || !Number.isFinite(price))
    return undefined;
  return { price, time: timestamp };
}

export function horizontalPointFromEvent(
  event: ReactPointerEvent<SVGSVGElement>,
  series: ISeriesApi<"Candlestick">,
  paneWidth: number,
  paneHeight: number,
): ChartDrawingPoint | undefined {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  if (x < 0 || x > paneWidth || y < 0 || y > paneHeight) return undefined;
  const price = series.coordinateToPrice(y);
  if (price === null || !Number.isFinite(price)) return undefined;
  return { price, time: Math.floor(Date.now() / 1_000) };
}

export function toScreenPoint(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  point: ChartDrawingPoint,
): ScreenPoint | null {
  const timeScale = chart.timeScale();
  let x = timeScale.timeToCoordinate(point.time as UTCTimestamp);
  if (x === null) {
    const items = series.data();
    const first = items[0]?.time;
    const last = items.at(-1)?.time;
    if (
      typeof first !== "number" ||
      typeof last !== "number" ||
      point.time < first ||
      point.time > last
    )
      return null;
    const nearestIndex = timeScale.timeToIndex(
      point.time as UTCTimestamp,
      true,
    );
    x =
      nearestIndex === null
        ? null
        : timeScale.logicalToCoordinate(Number(nearestIndex) as Logical);
  }
  const y = series.priceToCoordinate(point.price);
  if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y))
    return null;
  return { x, y };
}

export function toScreenPricePoint(
  series: ISeriesApi<"Candlestick">,
  point: ChartDrawingPoint,
): ScreenPoint | null {
  const y = series.priceToCoordinate(point.price);
  if (y === null || !Number.isFinite(y)) return null;
  return { x: 0, y };
}

function toTimestamp(time: Time | null): number | null {
  if (time === null) return null;
  if (typeof time === "number") return time;
  if (typeof time === "string") {
    const parsed = Date.parse(time);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : null;
  }
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1_000);
}
