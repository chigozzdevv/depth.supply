import {
  formatMeasurement,
  measureDrawing,
  type ChartDrawing,
  type ChartDrawingAppearance,
} from "@/components/chart/drawing";
import {
  DRAWING_COLORS,
  DRAWING_DASHES,
  DRAWING_WIDTHS,
} from "@/components/chart/style";
import type { ScreenPoint } from "@/components/chart/geometry";
function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function RenderedDrawing({
  drawing,
  onSelect,
  paneHeight,
  paneWidth,
  points,
  selected,
}: {
  drawing: ChartDrawing;
  onSelect: () => void;
  paneHeight: number;
  paneWidth: number;
  points: Array<ScreenPoint | null>;
  selected: boolean;
}) {
  const first = points[0];
  const second = points[1];
  if (!first || (drawing.kind !== "horizontal" && !second)) return null;
  const start = drawing.kind === "horizontal" ? { x: 0, y: first.y } : first;
  const end =
    drawing.kind === "horizontal" ? { x: paneWidth, y: first.y } : second!;
  const measurement =
    drawing.kind === "measure"
      ? formatMeasurement(measureDrawing(drawing.points[0], drawing.points[1]))
      : undefined;
  const labelX = clamp((start.x + end.x) / 2, 64, Math.max(64, paneWidth - 64));
  const labelY = clamp(
    (start.y + end.y) / 2 - 11,
    16,
    Math.max(16, paneHeight - 16),
  );

  return (
    <g
      className={
        [
          selected ? "chart-drawing-selected" : "",
          drawing.locked ? "chart-drawing-locked" : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <line
        className="chart-drawing-hit-area"
        x1={start.x}
        x2={end.x}
        y1={start.y}
        y2={end.y}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect();
        }}
      />
      <DrawingLine
        appearance={drawing.appearance}
        end={end}
        kind={drawing.kind}
        start={start}
      />
      {drawing.kind === "horizontal" ? (
        <text
          className="chart-drawing-price-label"
          style={{ fill: DRAWING_COLORS[drawing.appearance.color] }}
          x={Math.max(8, paneWidth - 8)}
          y={clamp(first.y - 6, 13, paneHeight - 7)}
        >
          {drawing.points[0].price.toFixed(2)}
        </text>
      ) : null}
      {measurement ? (
        <g
          className="chart-measure-label"
          transform={`translate(${labelX}, ${labelY})`}
        >
          <rect
            height="23"
            rx="5"
            stroke={DRAWING_COLORS[drawing.appearance.color]}
            strokeOpacity="0.3"
            width="116"
            x="-58"
            y="-12"
          />
          <text
            dominantBaseline="middle"
            fill={DRAWING_COLORS[drawing.appearance.color]}
            textAnchor="middle"
          >
            {measurement}
          </text>
        </g>
      ) : null}
    </g>
  );
}

export function DrawingLine({
  appearance,
  className,
  end,
  kind,
  start,
}: {
  appearance: ChartDrawingAppearance;
  className?: string;
  end: ScreenPoint;
  kind: "trend" | "horizontal" | "measure";
  start: ScreenPoint;
}) {
  return (
    <line
      className={["chart-drawing-line", `chart-drawing-${kind}`, className]
        .filter(Boolean)
        .join(" ")}
      x1={start.x}
      x2={end.x}
      y1={start.y}
      y2={end.y}
      stroke={DRAWING_COLORS[appearance.color]}
      strokeDasharray={DRAWING_DASHES[appearance.lineStyle]}
      strokeWidth={DRAWING_WIDTHS[appearance.thickness]}
    />
  );
}
