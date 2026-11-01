/**
 * A metrics series over the day books the runner kept.
 * Reads those books only: no chart, no world, and nothing written back.
 * Population and unhappy are not in a day book, so they are not here.
 */
import type { Daybook } from "../sim/world.ts";

export interface MetricPoint {
  day: number;
  errands: number; // sum of Object.values(uses); missing uses => 0
  wet: number;     // 1 when weather is "rain" or "storm", else 0. Frost is not a wet day (wet_days in the engine counts only rain and storm).
  noise: number;   // book.noise or 0
  broke: number;   // book.broke or 0
  worked: number;  // book.worked or 0
}

/** Day-number keys only. Blank and non-finite keys (NaN, Infinity) are not days. */
function dayNumber(key: string): number | undefined {
  if (key.trim() === "") return undefined;
  const day = Number(key);
  return Number.isFinite(day) ? day : undefined;
}

function errandsOf(uses: Daybook["uses"] | undefined): number {
  if (!uses) return 0;
  let sum = 0;
  for (const n of Object.values(uses)) sum += n;
  return sum;
}

function orZero(n: number | undefined): number {
  return n ?? 0;
}

function point(day: number, book: Daybook): MetricPoint {
  return {
    day,
    errands: errandsOf(book.uses),
    wet: book.weather === "rain" || book.weather === "storm" ? 1 : 0,
    noise: orZero(book.noise),
    broke: orZero(book.broke),
    worked: orZero(book.worked),
  };
}

/** One point per kept day book, oldest day first. Holes and non-day keys are left out. */
export function series(
  books: Record<string | number, Daybook | undefined> | null | undefined,
): MetricPoint[] {
  if (books == null) return [];
  const points: MetricPoint[] = [];
  for (const [key, book] of Object.entries(books)) {
    const day = dayNumber(key);
    if (day === undefined || book == null) continue;
    points.push(point(day, book));
  }
  points.sort((a, b) => a.day - b.day);
  return points;
}
