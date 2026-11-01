/**
 * V2 event tags and the V3 story line: today's facts, no new RNG draws.
 */
import { describe, expect, it } from "vitest";
import { generate } from "../src/sim/gen.ts";
import { eventTags, storyOf } from "../src/view/tags.ts";
import { snapshot } from "../src/view/api.ts";
import { plant, step } from "../src/view/runner.ts";

describe("event tags", () => {
  it("marks a break, an empty shop, a dark block and a busy playground", () => {
    const w = generate(1);
    const shop = Object.values(w.fixtures).find((f) => f.kind === "shop")!;
    shop.stock = 0;
    w.daybook.sold_out = true;
    const block = Object.values(w.buildings).find((b) => b.kind === "block")!;
    block.power = false;
    w.daybook.power_off = true;
    const play = Object.values(w.fixtures).find((f) => f.kind === "playground")!;
    play.last_use = 6;
    const tags = eventTags(w, [
      { day: w.day, kind: "broke", what: "bench", x: 3, y: 4 },
      { day: w.day - 1, kind: "broke", what: "lamp", x: 1, y: 1 },
      { day: w.day, kind: "tree_down", x: 8, y: 2 },
    ]);
    expect(tags.map((t) => t.label).sort()).toEqual(
      expect.arrayContaining(["bench broke", "tree down", "sold out", "power out", "loud"]),
    );
    expect(tags.some((t) => t.label === "lamp broke")).toBe(false);
    expect(tags.find((t) => t.kind === "power")).toMatchObject({ x: block.door[0], y: block.door[1] });
    expect(tags.find((t) => t.kind === "sold_out")).toMatchObject({ x: shop.x, y: shop.y });
  });

  it("does not invent a sold-out tag when the shop still has stock", () => {
    const w = generate(2);
    w.daybook.sold_out = true;
    for (const f of Object.values(w.fixtures)) if (f.kind === "shop") f.stock = 4;
    expect(eventTags(w, []).some((t) => t.kind === "sold_out")).toBe(false);
  });
});

describe("story line", () => {
  it("names today's latest fact and who is fraying", () => {
    const w = generate(1);
    const [a, b] = Object.values(w.residents);
    a!.stress = 1.4;
    b!.stress = 0.2;
    const story = storyOf(w, [
      { day: w.day, kind: "storm" },
      { day: w.day, kind: "born", who: "Ada" },
    ]);
    expect(story.changing).toMatch(/Ada was born/);
    expect(story.fraying).toBe(`fraying: ${a!.name}`);
  });

  it("says when the day and the people are quiet", () => {
    const w = generate(3);
    for (const r of Object.values(w.residents)) r.stress = 0;
    expect(storyOf(w, [])).toEqual({
      changing: "nothing new recorded today",
      fraying: "no one is fraying",
    });
  });

  it("rides on the snapshot the page already polls", () => {
    const s = plant(1);
    step(s);
    const snap = snapshot(s);
    expect(snap.story.changing.length).toBeGreaterThan(0);
    expect(snap.story.fraying.length).toBeGreaterThan(0);
    expect(Array.isArray(snap.tags)).toBe(true);
  });
});
