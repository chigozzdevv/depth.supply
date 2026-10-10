import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createChartDrawing,
  formatMeasurement,
  measureDrawing,
  parseChartDrawings,
  removeChartDrawing,
  serializeChartDrawings,
  setChartDrawingLocked,
  updateChartDrawingAppearance,
} from "@/components/chart/drawing";

const first = { price: 100, time: 1_723_456_800 };
const second = { price: 105, time: 1_723_460_400 };

test("drawings require complete valid price and time anchors", () => {
  assert.equal(createChartDrawing("m", "measure", first), null);
  assert.equal(
    createChartDrawing("t", "trend", { price: NaN, time: 1 }, second),
    null,
  );
  assert.deepEqual(createChartDrawing("h", "horizontal", first)?.points, [
    first,
  ]);
  assert.deepEqual(createChartDrawing("t", "trend", first, second)?.points, [
    first,
    second,
  ]);
});

test("measurement reports signed price change and absolute elapsed time", () => {
  const measurement = measureDrawing(first, second);
  assert.deepEqual(measurement, {
    priceChange: 5,
    percentChange: 5,
    durationMs: 3_600_000,
  });
  assert.equal(formatMeasurement(measurement), "+5.00% · 1h");
  assert.equal(formatMeasurement(measureDrawing(second, first)), "-4.76% · 1h");
});

test("annotations round trip their styling and lock state and reject invalid storage", () => {
  const drawing = createChartDrawing("t", "trend", first, second)!;
  const styled = updateChartDrawingAppearance([drawing], "t", {
    color: "green",
    thickness: "thick",
    lineStyle: "dotted",
  });
  const locked = setChartDrawingLocked(styled, "t", true);
  assert.deepEqual(parseChartDrawings(serializeChartDrawings(locked)), locked);
  assert.deepEqual(parseChartDrawings("not-json"), []);
  assert.deepEqual(
    parseChartDrawings(
      JSON.stringify([
        locked[0],
        { ...drawing, kind: "unknown" },
        { ...drawing, points: [first] },
        { ...drawing, locked: "yes" },
        {
          ...drawing,
          appearance: { color: "purple", thickness: 12, lineStyle: "wavy" },
        },
      ]),
    ),
    locked,
  );
});

test("locked drawings resist styling changes and deletion until unlocked", () => {
  const drawing = createChartDrawing("t", "trend", first, second)!;
  const locked = setChartDrawingLocked([drawing], "t", true);
  assert.deepEqual(
    updateChartDrawingAppearance(locked, "t", { color: "red" }),
    locked,
  );
  assert.deepEqual(removeChartDrawing(locked, "t"), locked);
  assert.deepEqual(
    removeChartDrawing(setChartDrawingLocked(locked, "t", false), "t"),
    [],
  );
});

test("saved annotations are bounded to the latest hundred entries", () => {
  const drawings = Array.from({ length: 105 }, (_, i) =>
    createChartDrawing(String(i), "horizontal", first)!,
  );
  const restored = parseChartDrawings(serializeChartDrawings(drawings));
  assert.equal(restored.length, 100);
  assert.equal(restored[0].id, "5");
});
