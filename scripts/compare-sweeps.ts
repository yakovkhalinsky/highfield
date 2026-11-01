/**
 * Compare two balance-sweep JSON documents offline. Each document is the
 * array `sweepsToJson` writes: one flat object per seed. This does not run
 * the estate.
 *
 *   tsx scripts/compare-sweeps.ts <left.json> <right.json>
 */
import { readFileSync } from "node:fs";
import { byCodePoint } from "../src/py/canon.ts";

type Row = Record<string, unknown>;

function isRow(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse one side. The Error names "left" or "right" when the document is not an array of objects. */
function parseSide(text: string, side: "left" | "right"): Row[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${side} is not an array of objects`);
  }
  if (!Array.isArray(data) || !data.every(isRow)) throw new Error(`${side} is not an array of objects`);
  return data;
}

function indexBySeed(rows: Row[], side: "left" | "right"): Map<number, Row> {
  const bySeed = new Map<number, Row>();
  for (const row of rows) {
    const seed = row.seed;
    if (typeof seed !== "number" || !Number.isFinite(seed)) {
      throw new Error(`${side} row has a non-numeric seed`);
    }
    if (bySeed.has(seed)) throw new Error(`${side} has two rows with seed ${seed}`);
    bySeed.set(seed, row);
  }
  return bySeed;
}

/** right − left, String()'d, with a leading + when the delta is positive. */
function deltaText(left: number, right: number): string {
  const delta = right - left;
  const shown = String(delta);
  return delta > 0 ? `+${shown}` : shown;
}

/** Left-row key order, then keys that exist only on the right, by code point. */
function diffKeys(left: Row, right: Row): string[] {
  const rightOnly = Object.keys(right).filter((key) => !Object.hasOwn(left, key));
  rightOnly.sort(byCodePoint);
  return [...Object.keys(left), ...rightOnly];
}

function changed(seed: number, key: string, left: unknown, right: unknown): string {
  if (typeof left === "number" && typeof right === "number") {
    return `seed ${seed} ${key}: ${String(left)} → ${String(right)} (${deltaText(left, right)})`;
  }
  return `seed ${seed} ${key}: ${String(left)} → ${String(right)}`;
}

function diffRow(seed: number, left: Row, right: Row): string[] {
  const lines: string[] = [];
  for (const key of diffKeys(left, right)) {
    const onLeft = Object.hasOwn(left, key);
    const onRight = Object.hasOwn(right, key);
    const lv = onLeft ? left[key] : undefined;
    const rv = onRight ? right[key] : undefined;
    if (onLeft && onRight && lv === rv) continue;
    lines.push(changed(seed, key, lv, rv));
  }
  return lines;
}

/** Difference report for two sweep JSON documents. Always ends with one newline. */
export function compareSweeps(left: string, right: string): string {
  const leftRows = indexBySeed(parseSide(left, "left"), "left");
  const rightRows = indexBySeed(parseSide(right, "right"), "right");
  const seeds = [...new Set([...leftRows.keys(), ...rightRows.keys()])].sort((a, b) => a - b);
  const lines: string[] = [];
  for (const seed of seeds) {
    const l = leftRows.get(seed);
    const r = rightRows.get(seed);
    if (l === undefined) lines.push(`seed ${seed}: only on the right`);
    else if (r === undefined) lines.push(`seed ${seed}: only on the left`);
    else lines.push(...diffRow(seed, l, r));
  }
  return (lines.length === 0 ? "no differences" : lines.join("\n")) + "\n";
}

function main(): void {
  const leftPath = process.argv[2];
  const rightPath = process.argv[3];
  if (leftPath === undefined || rightPath === undefined) {
    console.error("usage: tsx scripts/compare-sweeps.ts <left.json> <right.json>");
    process.exit(1);
  }
  const left = readFileSync(leftPath, "utf8");
  const right = readFileSync(rightPath, "utf8");
  process.stdout.write(compareSweeps(left, right));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
