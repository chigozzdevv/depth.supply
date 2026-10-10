import type { Candle, CandlePage } from "@depthhq/sdk";

export const emptyCandles: Candle[] = [];

export class CandleHistory {
  private readonly records = new Map<
    number,
    { candle: Candle; fetchedAt: number }
  >();
  private items = emptyCandles;
  private dirty = false;
  private initialized = false;
  private latest?: CandlePage;
  private nextCursor: number | null = null;

  live(page: CandlePage) {
    this.merge(page);
    if (!this.latest || page.fetchedAt >= this.latest.fetchedAt)
      this.latest = page;
  }

  initialize(page: CandlePage) {
    this.live(page);
    this.initialized = true;
    this.nextCursor = page.nextCursor;
  }

  prepend(page: CandlePage) {
    this.merge(page);
    this.nextCursor =
      page.items.length > 0 &&
      page.nextCursor !== null &&
      this.nextCursor !== null &&
      page.nextCursor < this.nextCursor
        ? page.nextCursor
        : null;
  }

  view() {
    if (this.initialized && this.dirty) {
      this.items = [...this.records.values()]
        .map(({ candle }) => candle)
        .sort((a, b) => a.time - b.time);
      this.dirty = false;
    }
    return {
      items: this.items,
      page: this.latest,
      ready: this.initialized,
      cursor: this.nextCursor,
    };
  }

  private merge(page: CandlePage) {
    for (const candle of page.items) {
      const previous = this.records.get(candle.time);
      if (previous && previous.fetchedAt > page.fetchedAt) continue;
      if (
        !previous ||
        previous.candle.open !== candle.open ||
        previous.candle.high !== candle.high ||
        previous.candle.low !== candle.low ||
        previous.candle.close !== candle.close
      )
        this.dirty = true;
      this.records.set(candle.time, { candle, fetchedAt: page.fetchedAt });
    }
  }
}
