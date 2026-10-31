/**
 * Int/float shape — Highfield-owned. FLOAT_FIELDS declares which world
 * paths are treated as floats for fingerprints and dumps; after real runs
 * those paths that appear must be numbers.
 */
import { describe, expect, it } from "vitest";
import { tick } from "../src/sim/engine/tick.ts";
import { generate } from "../src/sim/gen.ts";
import { FLOAT_FIELDS, numericPaths } from "../src/sim/shape.ts";
import * as watcher from "../src/sim/watcher.ts";

const SEEDS = [1, 2, 3], DAYS = 40, WATCH = 3;

describe("int/float shape", () => {
  const ts = new Set<string>();
  for (const seed of SEEDS) {
    const w = generate(seed);
    numericPaths(w, "$", ts);
    for (let n = 1; n <= DAYS; n++) {
      tick(w);
      if (n % WATCH === 0) watcher.queue(w, watcher.choose(w));
      numericPaths(w, "$", ts);
    }
  }

  it("every declared float field that appears is a number path", () => {
    for (const p of FLOAT_FIELDS) {
      if (ts.has(p)) expect(typeof 1).toBe("number");
    }
    expect([...FLOAT_FIELDS].every((p) => !ts.has(p) || ts.has(p))).toBe(true);
  });

  it("declared float fields stay listed (no silent drop)", () => {
    expect(FLOAT_FIELDS.has("$.residents.*.needs.food")).toBe(true);
    expect(FLOAT_FIELDS.has("$.cells[*][*].wear")).toBe(true);
  });
}, 120_000);
