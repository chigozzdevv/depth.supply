import type { Candle } from "@depthhq/sdk";
import type {
  ISeriesApi,
  ITimeScaleApi,
  UTCTimestamp,
} from "lightweight-charts";

type Series = Pick<ISeriesApi<"Candlestick">, "setData" | "update">;
type Scale = Pick<
  ITimeScaleApi<UTCTimestamp>,
  "getVisibleLogicalRange" | "setVisibleLogicalRange" | "scrollToPosition"
>;

export class CandleSeries {
  private scope = "";
  private items: Candle[] = [];

  constructor(
    private readonly series: Series,
    private readonly scale: Scale,
  ) {}

  sync(items: Candle[], scope: string) {
    if (this.scope !== scope) {
      if (this.items.length > 0) this.series.setData([]);
      this.items = [];
      this.scope = scope;
    }
    if (items.length === 0) return;
    if (this.items.length === 0) {
      this.series.setData(
        items.map((item) => ({ ...item, time: item.time as UTCTimestamp })),
      );
      this.scale.scrollToPosition(4, false);
    } else if (
      this.items.every((item, index) => items[index]?.time === item.time)
    ) {
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const previous = this.items[index];
        if (
          !previous ||
          item.open !== previous.open ||
          item.high !== previous.high ||
          item.low !== previous.low ||
          item.close !== previous.close
        )
          this.series.update(
            { ...item, time: item.time as UTCTimestamp },
            index < this.items.length - 1,
          );
      }
    } else {
      const range = this.scale.getVisibleLogicalRange();
      const anchor = range
        ? Math.max(0, Math.min(this.items.length - 1, Math.floor(range.from)))
        : 0;
      const nextAnchor = items.findIndex(
        (item) => item.time === this.items[anchor].time,
      );
      this.series.setData(
        items.map((item) => ({ ...item, time: item.time as UTCTimestamp })),
      );
      if (range && nextAnchor >= 0) {
        const offset = nextAnchor - anchor;
        this.scale.setVisibleLogicalRange({
          from: range.from + offset,
          to: range.to + offset,
        });
      }
    }
    this.items = items;
  }
}
