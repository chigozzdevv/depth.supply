import type { Candle } from "@depthhq/sdk";
import {
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  bollingerBands,
  ema,
  macd,
  rsi,
  sma,
  type ChartIndicatorId,
  type IndicatorPoint,
} from "@/components/chart/indicators";

type Line = ISeriesApi<"Line">;
type Plot = {
  id: ChartIndicatorId;
  lines: Line[];
  histogram?: ISeriesApi<"Histogram">;
};

export class ChartStudies {
  private plots: Plot[] = [];
  private key = "";
  constructor(private readonly chart: IChartApi) {}

  sync(indicators: ChartIndicatorId[], items: Candle[]) {
    const key = [...indicators].sort().join(",");
    if (key !== this.key) {
      for (const plot of this.plots) {
        for (const line of plot.lines) this.chart.removeSeries(line);
        if (plot.histogram) this.chart.removeSeries(plot.histogram);
      }
      this.plots = [];
      this.key = key;
      let pane = 1;
      for (const id of ["sma", "ema", "bollinger", "rsi", "macd"] as const) {
        if (!indicators.includes(id)) continue;
        if (id === "sma")
          this.plots.push({ id, lines: [this.line("SMA 20", "#9cbfff")] });
        if (id === "ema")
          this.plots.push({ id, lines: [this.line("EMA 20", "#ff8a3d")] });
        if (id === "bollinger")
          this.plots.push({
            id,
            lines: [
              this.line("BB upper", "#afa0d0"),
              this.line("BB middle", "#afa0d077"),
              this.line("BB lower", "#afa0d0"),
            ],
          });
        if (id === "rsi") {
          const line = this.line("RSI 14", "#c1a6ec", pane++);
          line.applyOptions({
            autoscaleInfoProvider: () => ({
              priceRange: { minValue: 0, maxValue: 100 },
            }),
          });
          for (const price of [30, 70])
            line.createPriceLine({
              price,
              color: "#ffffff30",
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: false,
              title: "",
            });
          this.plots.push({ id, lines: [line] });
        }
        if (id === "macd") {
          this.plots.push({
            id,
            lines: [
              this.line("MACD", "#9cbfff", pane),
              this.line("Signal", "#ff8a3d", pane),
            ],
            histogram: this.chart.addSeries(
              HistogramSeries,
              {
                title: "MACD histogram",
                priceLineVisible: false,
                lastValueVisible: false,
              },
              pane++,
            ),
          });
        }
      }
      for (const [index, pane] of this.chart.panes().entries())
        pane.setStretchFactor(index === 0 ? 5 : 1.4);
    }
    for (const plot of this.plots) {
      let values: IndicatorPoint[][] = [];
      if (plot.id === "sma") values = [sma(items)];
      if (plot.id === "ema") values = [ema(items)];
      if (plot.id === "bollinger") {
        const bands = bollingerBands(items);
        values = [bands.upper, bands.middle, bands.lower];
      }
      if (plot.id === "rsi") values = [rsi(items)];
      if (plot.id === "macd") {
        const data = macd(items);
        values = [data.macd, data.signal];
        plot.histogram!.setData(
          data.histogram.map((item) => ({
            ...item,
            time: item.time as UTCTimestamp,
            color: item.value >= 0 ? "#ff8a3d80" : "#f2f2f060",
          })),
        );
      }
      plot.lines.forEach((line, index) =>
        line.setData(
          values[index].map((item) => ({
            ...item,
            time: item.time as UTCTimestamp,
          })),
        ),
      );
    }
  }

  private line(title: string, color: string, pane = 0): Line {
    return this.chart.addSeries(
      LineSeries,
      {
        title,
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      pane,
    );
  }
}
