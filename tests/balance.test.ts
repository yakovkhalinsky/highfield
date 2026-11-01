/**
 * Balance fingerprint helpers — Highfield-owned. The engine may diverge
 * from Python; we still require a stable in-process fingerprint and the
 * Python-shaped json.dumps helper.
 */
import { describe, expect, it } from "vitest";
import { fingerprint, pyDumps, runOne, sweepsToCsv, sweepsToJson } from "../scripts/balance.ts";

describe("balance fingerprint", () => {
  it("json.dumps as Python spells it", () => {
    expect(pyDumps({ b: [1, "é"], a: null })).toBe('{"a": null, "b": [1, "\\u00e9"]}');
  });
  it("seed 1, one year: deterministic in-process", () => {
    const a = fingerprint([runOne(1, 1)]);
    const b = fingerprint([runOne(1, 1)]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  }, 180_000);

  it("exports a planted estate as JSON and CSV", () => {
    const row = runOne(1, 0);
    const json = JSON.parse(sweepsToJson([row])) as Record<string, unknown>[];
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({ seed: 1, days: 0 });
    expect(json[0]).toHaveProperty("family");
    const csv = sweepsToCsv([row]);
    const [header, line] = csv.trim().split("\n");
    expect(header!.split(",")).toContain("occupancy");
    expect(header!.split(",")).toContain("flat_share");
    expect(line!.startsWith("1,0,")).toBe(true);
    expect(sweepsToCsv([])).toMatch(/^seed,days,/);
  });
});
