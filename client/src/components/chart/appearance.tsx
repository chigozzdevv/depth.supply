"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Lock, LockOpen, Palette, Trash2 } from "lucide-react";
import {
  CHART_DRAWING_COLORS,
  CHART_DRAWING_LINE_STYLES,
  CHART_DRAWING_THICKNESSES,
  type ChartDrawing,
  type ChartDrawingAppearance,
} from "@/components/chart/drawing";
import {
  DRAWING_COLORS,
  DRAWING_DASHES,
  DRAWING_WIDTHS,
} from "@/components/chart/style";

export function DrawingActions({
  drawing,
  onAppearance,
  onLock,
  onDelete,
}: {
  drawing: ChartDrawing;
  onAppearance: (patch: Partial<ChartDrawingAppearance>) => void;
  onLock: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="chart-drawing-context">
      <div
        aria-label="Selected drawing actions"
        className="chart-drawing-context-actions"
        role="group"
      >
        <button
          aria-label="Drawing appearance"
          aria-expanded={open && !drawing.locked}
          disabled={drawing.locked}
          title="Drawing appearance"
          onClick={() => setOpen(!open)}
        >
          <Palette size={14} />
        </button>
        <button
          aria-label={drawing.locked ? "Unlock drawing" : "Lock drawing"}
          aria-pressed={drawing.locked}
          title={drawing.locked ? "Unlock drawing" : "Lock drawing"}
          onClick={onLock}
        >
          {drawing.locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
        <button
          aria-label="Delete drawing"
          disabled={drawing.locked}
          title="Delete drawing"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {open && !drawing.locked && (
        <div
          aria-label="Drawing appearance"
          className="chart-drawing-appearance"
        >
          <Row label="Color">
            {CHART_DRAWING_COLORS.map((color) => (
              <button
                key={color}
                aria-label={`${color} line`}
                aria-pressed={drawing.appearance.color === color}
                className="chart-drawing-color-choice"
                style={
                  {
                    "--chart-drawing-swatch": DRAWING_COLORS[color],
                  } as CSSProperties
                }
                onClick={() => onAppearance({ color })}
              >
                <span />
              </button>
            ))}
          </Row>
          <Row label="Thickness">
            {CHART_DRAWING_THICKNESSES.map((thickness) => (
              <button
                key={thickness}
                aria-label={`${thickness} line thickness`}
                aria-pressed={drawing.appearance.thickness === thickness}
                className="chart-drawing-line-choice"
                onClick={() => onAppearance({ thickness })}
              >
                <span style={{ borderTopWidth: DRAWING_WIDTHS[thickness] }} />
              </button>
            ))}
          </Row>
          <Row label="Style">
            {CHART_DRAWING_LINE_STYLES.map((lineStyle) => (
              <button
                key={lineStyle}
                aria-label={`${lineStyle} line style`}
                aria-pressed={drawing.appearance.lineStyle === lineStyle}
                className="chart-drawing-line-choice"
                onClick={() => onAppearance({ lineStyle })}
              >
                <svg
                  aria-hidden="true"
                  height="8"
                  viewBox="0 0 28 8"
                  width="28"
                >
                  <line
                    strokeDasharray={DRAWING_DASHES[lineStyle]}
                    x1="1"
                    x2="27"
                    y1="4"
                    y2="4"
                  />
                </svg>
              </button>
            ))}
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="chart-drawing-appearance-row"
    >
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}
