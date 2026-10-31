/**
 * Generation stays deterministic. Cross-language world hashes are retired:
 * Highfield's households and rules now diverge from Python (food_stock, etc.).
 */
import { describe, expect, it } from "vitest";
import { canon, worldHash } from "../src/py/canon.ts";
import { generate } from "../src/sim/gen.ts";
import { compare, firstDiff, marksFor, parseSeeds } from "../scripts/parity.ts";

describe("world generation", () => {
  it("is deterministic in-process, and the hash sees a one-cell change", () => {
    const a = generate(42);
    const b = generate(42);
    expect(worldHash(a)).toBe(worldHash(b));
    b.cells[5]![5]!.wear = 0.25;
    expect(worldHash(a)).not.toBe(worldHash(b));
    expect(firstDiff(JSON.parse(canon(a)), JSON.parse(canon(b)))).toBe("$.cells[5][5].wear: 0 != 0.25");
  });

  it("plants food_stock on every household", () => {
    const w = generate(1);
    for (const hh of Object.values(w.households)) {
      expect(hh.food_stock).toBeGreaterThan(0);
    }
  });

  it("refuses a plan too small for its recipe, loudly", () => {
    expect(() => generate(1, 20, 20)).toThrow(/blocks in a row/);
    expect(() => generate(1, 0, 10)).toThrow(/positive/);
    expect(() => generate(1, 201, 30)).toThrow(/at most/);
  });
});

describe("the harness refuses to pass on nothing", () => {
  it("reads seed specs as parity.py does, and refuses junk", () => {
    expect(parseSeeds("1-3,42")).toEqual([1, 2, 3, 42]);
    for (const bad of ["", ",", "x", "3-1", "1-", "-4", "1.5"]) expect(() => parseSeeds(bad)).toThrow();
  });
  it("marks day 0, every K-th day and the last", () => {
    expect(marksFor(0, 0)).toEqual([0]);
    expect(marksFor(10, 4)).toEqual([0, 4, 8, 10]);
  });
  it("compares every seed it asked for, at every mark", () => {
    const r = compare("1,3", 6, 3, 2);
    expect(r.map((x) => [x.seed, x.days])).toEqual([[1, 0], [1, 3], [1, 6], [3, 0], [3, 3], [3, 6]]);
  });
});
