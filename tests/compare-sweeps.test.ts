/**
 * Offline diff of two balance-sweep JSON documents. The fixtures are
 * hand-written, so this never runs a year of the estate.
 */
import { describe, expect, it } from "vitest";
import { compareSweeps } from "../scripts/compare-sweeps.ts";

/** The exporter's shape: a pretty-printed array and a trailing newline. */
function sweep(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2) + "\n";
}

describe("compareSweeps", () => {
  it("prints a signed numeric delta", () => {
    const left = sweep([{ seed: 1, residents: 10, friction: 0.5 }]);
    const right = sweep([{ seed: 1, residents: 12, friction: 0.25 }]);
    expect(compareSweeps(left, right)).toBe(
      "seed 1 residents: 10 → 12 (+2)\nseed 1 friction: 0.5 → 0.25 (-0.25)\n",
    );
  });

  it("does not round a delta past JavaScript subtraction", () => {
    const left = sweep([{ seed: 1, occupancy: 0.3 }]);
    const right = sweep([{ seed: 1, occupancy: 0.1 }]);
    expect(compareSweeps(left, right)).toBe(
      `seed 1 occupancy: 0.3 → 0.1 (${String(0.1 - 0.3)})\n`,
    );
  });

  it("prints a string change without a delta", () => {
    const left = sweep([{ seed: 4, worn: "bench|oven", unused_fixture: "" }]);
    const right = sweep([{ seed: 4, worn: "bench", unused_fixture: "oven" }]);
    expect(compareSweeps(left, right)).toBe(
      "seed 4 worn: bench|oven → bench\nseed 4 unused_fixture:  → oven\n",
    );
  });

  it("reports a seed only on one side, in numeric order", () => {
    const left = sweep([
      { seed: 10, residents: 1 },
      { seed: 2, residents: 2 },
    ]);
    const right = sweep([
      { seed: 3, residents: 3 },
      { seed: 2, residents: 2 },
    ]);
    expect(compareSweeps(left, right)).toBe(
      "seed 3: only on the right\nseed 10: only on the left\n",
    );
  });

  it("skips a shared seed whose fields match, whatever the key order", () => {
    const left = sweep([
      { seed: 1, residents: 3, worn: "a" },
      { seed: 2, residents: 4, worn: "b" },
    ]);
    const right = sweep([
      { seed: 2, worn: "b", residents: 4 },
      { seed: 1, residents: 5, worn: "a" },
    ]);
    expect(compareSweeps(left, right)).toBe("seed 1 residents: 3 → 5 (+2)\n");
  });

  it("lists left keys in their order, then right-only keys by code point", () => {
    const left = sweep([{ seed: 1, worn: "bench", residents: 4, zebra: 1 }]);
    const right = sweep([{ seed: 1, mango: "m", worn: "oven", residents: 4, apple: "a" }]);
    expect(compareSweeps(left, right)).toBe(
      [
        "seed 1 worn: bench → oven",
        "seed 1 zebra: 1 → undefined",
        "seed 1 apple: undefined → a",
        "seed 1 mango: undefined → m",
        "",
      ].join("\n"),
    );
  });

  it("says no differences for identical documents", () => {
    const body = sweep([{ seed: 1, residents: 4, worn: "", all_broken: "tap" }]);
    expect(compareSweeps(body, body)).toBe("no differences\n");
    expect(compareSweeps(body, JSON.stringify(JSON.parse(body)))).toBe("no differences\n");
  });

  it("throws when JSON is invalid and names the side", () => {
    expect(() => compareSweeps("{", "[]")).toThrow(Error);
    expect(() => compareSweeps("{", "[]")).toThrow(/left/);
    expect(() => compareSweeps("[]", "")).toThrow(/right/);
    expect(() => compareSweeps("{}", "[]")).toThrow(/left/);
    expect(() => compareSweeps("[]", "null")).toThrow(/right/);
    expect(() => compareSweeps("[1]", "[]")).toThrow(/left/);
  });

  it("throws when one side repeats a seed", () => {
    const left = sweep([
      { seed: 1, residents: 1 },
      { seed: 1, residents: 2 },
    ]);
    expect(() => compareSweeps(left, "[]")).toThrow(/left/);
    expect(() => compareSweeps("[]", left)).toThrow(/right/);
  });
});
