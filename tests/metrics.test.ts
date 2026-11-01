/**
 * series() reads kept day books into a metrics row per day.
 * It does not fill gaps, and it does not write the books back.
 */
import { expect, it } from "vitest";
import type { Daybook } from "../src/sim/world.ts";
import { series } from "../src/view/metrics.ts";

function book(over: Partial<Daybook> = {}): Daybook {
  return { uses: {}, out: 0, noise: 0, broke: 0, ...over };
}

it("returns nothing for empty input", () => {
  expect(series(null)).toEqual([]);
  expect(series(undefined)).toEqual([]);
  expect(series({})).toEqual([]);
});

it("sorts two days given out of order", () => {
  // "5.0" / "2.0" are not integer indexes, so they enumerate in insertion order.
  const books: Record<string, Daybook> = {};
  books["5.0"] = book({ uses: { shop: 1 }, noise: 1 });
  books["2.0"] = book({ uses: { shop: 4 }, noise: 2 });
  expect(Object.keys(books)).toEqual(["5.0", "2.0"]);
  expect(series(books).map((p) => p.day)).toEqual([2, 5]);
  expect(series(books).map((p) => p.errands)).toEqual([4, 1]);
});

it("sums uses into errands", () => {
  const points = series({
    3: book({ uses: { shop: 2, well: 3, park: 1 } }),
    4: book(),
  });
  expect(points.map((p) => p.errands)).toEqual([6, 0]);
  const missing = { out: 0, noise: 1, broke: 0 } as Daybook;
  expect(series({ 1: missing })[0]?.errands).toBe(0);
});

it("counts rain and storm as wet and clear and frost as dry", () => {
  const wet = (weather: string) => series({ 1: book({ weather }) })[0]?.wet;
  expect(wet("rain")).toBe(1);
  expect(wet("storm")).toBe(1);
  expect(wet("clear")).toBe(0);
  expect(wet("frost")).toBe(0);
  expect(wet("heat")).toBe(0);
});

it("turns missing worked, noise and broke into 0", () => {
  const raw = { uses: { shop: 1 }, out: 2 } as unknown as Daybook;
  expect(series({ 8: raw })[0]).toMatchObject({ noise: 0, broke: 0, worked: 0, errands: 1 });
  expect(series({ 9: book({ noise: 4, broke: 2, worked: 7 }) })[0]).toMatchObject({
    noise: 4, broke: 2, worked: 7,
  });
  expect(series({ 10: book({ noise: 0, broke: 0, worked: 0 }) })[0]).toMatchObject({
    noise: 0, broke: 0, worked: 0,
  });
});

it("omits a gap day instead of filling a zero", () => {
  const books: Record<string, Daybook | undefined> = {
    1: book({ noise: 1 }),
    2: undefined,
    4: book({ noise: 3 }),
  };
  const points = series(books);
  expect(points.map((p) => p.day)).toEqual([1, 4]);
  expect(points).toHaveLength(2);
  expect(points.map((p) => p.noise)).toEqual([1, 3]);
});

it("does not mutate the input uses object", () => {
  const uses = Object.freeze({ shop: 2, well: 1 });
  const books = { 4: book({ uses, noise: 3, broke: 1, worked: 5, weather: "clear" }) };
  const before = structuredClone(books);
  const points = series(books);
  expect(uses).toEqual({ shop: 2, well: 1 });
  expect(books[4]!.uses).toBe(uses);
  expect(books).toEqual(before);
  expect(points).toEqual([{ day: 4, errands: 3, wet: 0, noise: 3, broke: 1, worked: 5 }]);
});

it("skips keys that are not finite day numbers", () => {
  const books: Record<string, Daybook> = {
    foo: book({ noise: 9 }),
    NaN: book({ noise: 9 }),
    Infinity: book({ noise: 9 }),
    "-Infinity": book({ noise: 9 }),
    6: book({ noise: 1 }),
  };
  expect(series(books)).toEqual([
    { day: 6, errands: 0, wet: 0, noise: 1, broke: 0, worked: 0 },
  ]);
});
