import type {
  ChartDrawingColor,
  ChartDrawingThickness,
  ChartDrawingLineStyle,
} from "@/components/chart/drawing";

export const DRAWING_COLORS: Record<ChartDrawingColor, string> = {
  blue: "rgba(105, 179, 255, 0.9)",
  green: "rgba(40, 213, 143, 0.9)",
  neutral: "#f2f2f0",
  orange: "#ff8a3d",
  red: "rgba(241, 83, 103, 0.9)",
};

export const DRAWING_WIDTHS: Record<ChartDrawingThickness, number> = {
  medium: 2,
  thick: 3,
  thin: 1.35,
};

export const DRAWING_DASHES: Record<ChartDrawingLineStyle, string | undefined> =
  {
    dashed: "5 4",
    dotted: "1 4",
    solid: undefined,
  };
