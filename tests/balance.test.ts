/**
 * Balance fingerprint helpers — Highfield-owned. The engine may diverge
 * from Python; we still require a stable in-process fingerprint and the
 * Python-shaped json.dumps helper.
 */
import { describe, expect, it } from "vitest";
import { fingerprint, pyDumps, runOne } from "../scripts/balance.ts";

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
});
