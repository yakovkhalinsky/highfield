/**
 * Shop stock persists overnight; only a delivery fate refills shelves.
 */
import { describe, expect, it } from "vitest";
import { land } from "../src/sim/engine/effects.ts";
import { updateFixtures } from "../src/sim/engine/places.ts";
import { tick } from "../src/sim/engine/tick.ts";
import { fateWeights } from "../src/sim/decide.ts";
import { generate } from "../src/sim/gen.ts";
import { R } from "../src/sim/rules.ts";
import type { Ev } from "../src/sim/engine/events.ts";

function shop(w: ReturnType<typeof generate>) {
  return Object.values(w.fixtures).find((f) => f.kind === "shop")!;
}

describe("shop stock", () => {
  it("persists overnight without a delivery", () => {
    const w = generate(1);
    const s = shop(w);
    const full = R.fixtures.shop!.stock!;
    expect(s.stock).toBe(full);
    s.stock = 12;
    const evs: Ev[] = [];
    updateFixtures(w, evs);
    expect(s.stock).toBe(12);
    tick(w);
    expect(shop(w).stock).toBe(12);
  });

  it("delivery fate restores shelves to full", () => {
    const w = generate(1);
    const s = shop(w);
    s.stock = 3;
    w.pending.push({ kind: "delivery", region: "all" });
    const evs: Ev[] = [];
    const kind = land(w, evs);
    expect(kind).toBe("delivery");
    expect(s.stock).toBe(R.fixtures.shop!.stock);
    expect(evs.some((e) => e.kind === "fate" && e.what === "delivery")).toBe(true);
  });

  it("raises delivery weight when stock is low", () => {
    const w = generate(1);
    const full = fateWeights(w).delivery!;
    shop(w).stock = 0;
    const bare = fateWeights(w).delivery!;
    expect(bare).toBeGreaterThan(full);
  });
});
