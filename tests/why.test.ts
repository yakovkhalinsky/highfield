/**
 * V10 why-log: ranked needs and the winning place, kept off the world.
 */
import { describe, expect, it } from "vitest";
import { worldHash } from "../src/py/canon.ts";
import { generate } from "../src/sim/gen.ts";
import { tick } from "../src/sim/engine/tick.ts";
import { HOOKS, rankedNeeds } from "../src/sim/engine/needs.ts";
import { noteRanked, whyFor } from "../src/sim/engine/whyLog.ts";
import { snapshot } from "../src/view/api.ts";
import { whyLines } from "../src/view/hudBridge.ts";
import { plant, step } from "../src/view/runner.ts";

describe("why log", () => {
  it("keeps the note off the world and drops it when the day moves on", () => {
    const w = generate(1);
    const id = Object.values(w.residents)[0]!.id;
    const before = worldHash(w);
    noteRanked(w, id, "dawn", ["rest", "food", "quiet", "play"]);
    expect(worldHash(w)).toBe(before);
    expect("why" in w).toBe(false);
    expect(whyFor(w, id)).toEqual([
      { phase: "dawn", ranked: ["rest", "food", "quiet"], need: null, place: null, candidates: [], met: false },
    ]);
    const view = whyFor(w, id);
    view[0]!.ranked.push("nope");
    expect(whyFor(w, id)[0]!.ranked).toEqual(["rest", "food", "quiet"]);
    w.day += 1;
    expect(whyFor(w, id)).toEqual([]);
  });

  it("still hands the chooser's own list to the balance hook", () => {
    const w = generate(4);
    const r = Object.values(w.residents)[0]!;
    let seen: string[] | null = null;
    HOOKS.ranked = (_w, _r, _phase, out) => { seen = out; };
    try {
      const out = rankedNeeds(w, r, "morning");
      expect(seen).toBe(out);
      expect(whyFor(w, r.id)[0]!.ranked).toEqual(out.slice(0, 3));
    } finally {
      HOOKS.ranked = null;
    }
  });

  it("records a day's phases on the snapshot the card reads", () => {
    const s = plant(2);
    step(s);
    const w = s.world;
    for (const r of Object.values(w.residents)) expect("why" in r).toBe(false);
    const snap = snapshot(s);
    const explained = snap.people.filter((p) => p.why.some((row) => row.ranked.length > 0));
    expect(explained.length).toBeGreaterThan(0);
    expect(explained.some((p) => p.why.some((row) => row.place))).toBe(true);
    const row = explained[0]!.why[0]!;
    expect(row.ranked.length).toBeLessThanOrEqual(3);
    expect(whyFor(w, explained[0]!.id)).toEqual(explained[0]!.why);
  });
});

describe("why lines", () => {
  const person = {
    id: 7,
    why: [
      { phase: "dawn", ranked: ["rest"], need: "rest", place: "home", candidates: ["home"], met: true },
      { phase: "morning", ranked: ["food", "rest"], need: "food", place: "shop", candidates: ["shop", "cafe"], met: true },
      { phase: "evening", ranked: ["company"], need: "company", place: "bus_stop", candidates: ["bus_stop", "bench"], met: false },
    ],
  };

  it("puts the phase on the card first and names the other places", () => {
    expect(whyLines({ viewPhase: "morning", people: [person] }, { kind: "resident", id: 7 })).toEqual([
      { phase: "morning", text: "food, rest → shop · also cafe" },
      { phase: "dawn", text: "rest → home" },
      { phase: "evening", text: "company → bus stop, not there yet · also bench" },
    ]);
  });

  it("stays quiet for a place or an empty card", () => {
    expect(whyLines({ people: [person] }, { kind: "fixture", id: 7 })).toEqual([]);
    expect(whyLines({ people: [person] }, null)).toEqual([]);
  });
});
