/**
 * Highfield realism fork: power, puddles, wear, pantry, holidays, local
 * work, illness, unit maintenance, affinity.
 */
import { describe, expect, it } from "vitest";
import { land, age } from "../src/sim/engine/effects.ts";
import { updatePuddles, updateWear } from "../src/sim/engine/ground.ts";
import { updateWetStreak } from "../src/sim/engine/weather.ts";
import { onHoliday, schoolDay, isLocalWorker, isWorker } from "../src/sim/engine/daytime.ts";
import { maintainUnits } from "../src/sim/engine/households.ts";
import { candidates, satisfy, utility } from "../src/sim/engine/needs.ts";
import { tick } from "../src/sim/engine/tick.ts";
import { generate } from "../src/sim/gen.ts";
import { R } from "../src/sim/rules.ts";
import type { Ev } from "../src/sim/engine/events.ts";
import { PyRandom } from "../src/py/random.ts";

describe("G4 infrastructure", () => {
  it("power_cut kills building power and restores when the fate ends", () => {
    const w = generate(1);
    for (const b of Object.values(w.buildings)) expect(b.power).toBe(true);
    w.pending.push({ kind: "power_cut", region: "all" });
    const evs: Ev[] = [];
    land(w, evs);
    expect(Object.values(w.buildings).every((b) => b.power === false)).toBe(true);
    for (const f of w.fates) f.left = 1;
    age(w);
    expect(Object.values(w.buildings).every((b) => b.power === true)).toBe(true);
  });

  it("puddles rise with wet weather and wear rises with footfall", () => {
    const w = generate(1);
    w.weather = "rain";
    w.wet_days = 10;
    updateWetStreak(w);
    updatePuddles(w);
    let puddles = 0;
    for (const row of w.cells) for (const c of row) if ((c.puddle ?? 0) > 0) puddles++;
    expect(puddles).toBeGreaterThan(0);
    const r = Object.values(w.residents)[0]!;
    r.where = { mode: "at", unit: r.where.unit, x: 5, y: 5, fixture: null };
    const before = w.cells[5]![5]!.wear;
    updateWear(w);
    expect(w.cells[5]![5]!.wear).toBeGreaterThan(before);
  });
});

describe("G5 home meals", () => {
  it("home food needs pantry stock; shop trips refill the pantry", () => {
    const w = generate(1);
    const r = Object.values(w.residents)[0]!;
    const hh = w.households[String(r.household)]!;
    expect(hh.food_stock).toBe(R.engine.pantry);
    const unit = w.units[String(hh.unit)]!;
    const home = { kind: "home", x: 0, y: 0, fixture: null, unit };
    const rng = new PyRandom("t");
    hh.food_stock = 0;
    expect(utility(w, r, home, "food", "dawn", rng)).toBeNull();
    hh.food_stock = 4;
    expect(utility(w, r, home, "food", "dawn", rng)).not.toBeNull();
    satisfy(w, r, home, "food", "dawn");
    expect(hh.food_stock).toBe(3);

    const shop = Object.values(w.fixtures).find((f) => f.kind === "shop")!;
    const c = { kind: "shop", x: shop.x, y: shop.y, fixture: shop, unit: null };
    const before = hh.food_stock;
    shop.stock = 10;
    satisfy(w, r, c, "food", "morning");
    expect(hh.food_stock).toBeGreaterThan(before);
  });

  it("candidates include home for food when the need is home-capable", () => {
    const w = generate(1);
    const c = candidates(w);
    expect(c.food!.some((x) => x.kind === "home")).toBe(true);
  });
});

describe("G6–G10 purpose and season", () => {
  it("school holidays suspend school days", () => {
    const w = generate(1);
    w.day = 65; // inside first holiday block [60,74]
    expect(onHoliday(w)).toBe(true);
    expect(schoolDay(w)).toBe(false);
    w.day = 10;
    expect(onHoliday(w)).toBe(false);
  });

  it("some workers are local rather than bus-away", () => {
    const w = generate(1);
    const workers = Object.values(w.residents).filter((r) => isWorker(w, r));
    expect(workers.some((r) => isLocalWorker(w, r))).toBe(true);
    expect(workers.some((r) => !isLocalWorker(w, r))).toBe(true);
  });

  it("unit condition drifts with maintainUnits", () => {
    const w = generate(1);
    const u = Object.values(w.units).find((x) => x.household !== null)!;
    const before = u.condition;
    for (let i = 0; i < 50; i++) maintainUnits(w);
    expect(u.condition).toBeLessThan(before);
  });

  it("ticks without throwing across a short stretch", () => {
    const w = generate(42);
    const start = w.day;
    for (let i = 0; i < 14; i++) tick(w);
    expect(w.day).toBe(start + 14);
  });
});
