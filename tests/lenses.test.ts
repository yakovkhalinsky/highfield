/**
 * Ground-lens choice and colour. The overlay draws these; the functions
 * themselves stay free of THREE and of the document.
 */
import { describe, expect, it } from "vitest";
// page3d JS modules have no .d.ts; the build still typechecks tests.
// @ts-expect-error — no types for the visual-fork classic ES module
import { LENSES, lensColor, lensFromSearch, nextLens, prevLens } from "../page3d/estate/world/lens.js";

const FIELDS = ["wear", "puddle", "shade", "light"] as const;

describe("lensFromSearch", () => {
  it("reads the lens query param", () => {
    expect(lensFromSearch("?lens=puddle")).toBe("puddle");
    expect(lensFromSearch("?lens=wear")).toBe("wear");
    expect(lensFromSearch("?lens=shade")).toBe("shade");
    expect(lensFromSearch("?lens=light")).toBe("light");
    expect(lensFromSearch("?lens=off")).toBe("off");
    expect(lensFromSearch("?clock=0.2&lens=light")).toBe("light");
  });

  it("is off when the param is missing or unknown", () => {
    expect(lensFromSearch("")).toBe("off");
    expect(lensFromSearch("?day=3")).toBe("off");
    expect(lensFromSearch("?lens=nope")).toBe("off");
    expect(lensFromSearch("?lens=")).toBe("off");
  });
});

describe("nextLens", () => {
  it("walks the list and wraps to off", () => {
    expect(LENSES).toEqual(["off", "wear", "puddle", "shade", "light"]);
    expect(nextLens("off")).toBe("wear");
    expect(nextLens("wear")).toBe("puddle");
    expect(nextLens("puddle")).toBe("shade");
    expect(nextLens("shade")).toBe("light");
    expect(nextLens("light")).toBe("off");
  });

  it("starts an unknown current at wear", () => {
    expect(nextLens("nope")).toBe("wear");
    expect(nextLens("")).toBe("wear");
  });

  it("steps backward with prevLens", () => {
    expect(prevLens("wear")).toBe("off");
    expect(prevLens("off")).toBe("light");
    expect(prevLens("nope")).toBe("light");
  });
});

describe("lensColor", () => {
  it("is transparent at zero and when the lens is off", () => {
    for (const kind of LENSES) {
      expect(lensColor(kind, 0).a).toBe(0);
    }
    expect(lensColor("off", 9).a).toBe(0);
    expect(lensColor("wear", 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(lensColor("nope", 4).a).toBe(0);
    expect(lensColor("puddle", -1).a).toBe(0);
  });

  it("distinguishes wear, puddle, shade and light at full strength", () => {
    const colors = FIELDS.map((kind) => lensColor(kind, 9));
    for (const c of colors) {
      expect(c.a).toBeGreaterThan(0);
      for (const channel of [c.r, c.g, c.b, c.a]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
    const rgb = colors.map((c) => `${c.r},${c.g},${c.b}`);
    expect(new Set(rgb).size).toBe(4);
  });

  it("grows more opaque as the value rises, and wear darkens", () => {
    for (const kind of FIELDS) {
      expect(lensColor(kind, 9).a).toBeGreaterThan(lensColor(kind, 1).a);
      expect(lensColor(kind, 4)).toEqual(lensColor(kind, 4));
    }
    const pale = lensColor("wear", 1);
    const deep = lensColor("wear", 9);
    const lum = (c: { r: number; g: number; b: number }) =>
      0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(lum(deep)).toBeLessThan(lum(pale));
  });
});
