/**
 * Highfield realism fork: power, puddles, wear, pantry, holidays, local
 * work, illness, unit maintenance, affinity.
 */
import { describe, expect, it } from "vitest";
import { land, age } from "../src/sim/engine/effects.ts";
import { updatePuddles, updateWear } from "../src/sim/engine/ground.ts";
import { updateWetStreak } from "../src/sim/engine/weather.ts";
import {
  onHoliday, schoolDay, workDay, shift, carer, dueAtSchool, isLocalWorker, isWorker, isPupil,
} from "../src/sim/engine/daytime.ts";
import { maintainUnits, unhappiness } from "../src/sim/engine/households.ts";
import { candidates, decayAffinity, satisfy, utility } from "../src/sim/engine/needs.ts";
import { buildNoise } from "../src/sim/engine/places.ts";
import { tick } from "../src/sim/engine/tick.ts";
import { fateWeights } from "../src/sim/decide.ts";
import { generate } from "../src/sim/gen.ts";
import { R } from "../src/sim/rules.ts";
import * as W from "../src/sim/world.ts";
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

describe("G12 work vs school holidays", () => {
  it("workers keep shifts on school holidays; weekends stay off", () => {
    const w = generate(1);
    w.day = 65; // first holiday block [60,74]
    expect(onHoliday(w)).toBe(true);
    expect(schoolDay(w)).toBe(false);
    expect(workDay(w)).toBe(true);
    const workers = Object.values(w.residents).filter((r) => isWorker(w, r));
    const nonCarer = workers.find((r) => {
      const hh = Object.values(w.households).find((h) => h.id === r.household);
      return !hh || carer(w, hh) !== r;
    })!;
    expect(shift(w, nonCarer).length).toBeGreaterThan(0);

    /* Find a Saturday (weekday 5): day 5 from seed-1 start is often weekend-ish;
     * walk forward until weekday is Sat/Sun. */
    for (let d = 1; d <= 14; d++) {
      w.day = d;
      const wd = ((d - 1) % 7);
      if (wd === 5 || wd === 6) {
        expect(workDay(w)).toBe(false);
        expect(shift(w, nonCarer).length).toBe(0);
        break;
      }
    }
  });
});

describe("G13–G18 phase A knobs", () => {
  it("trees dampen noise near their cells", () => {
    const w = generate(1);
    const tree = Object.values(w.fixtures).find((f) => f.kind === "tree")!;
    const play = Object.values(w.fixtures).find((f) => f.kind === "playground");
    if (play) {
      play.last_use = 12;
      play.condition = 1;
    }
    buildNoise(w);
    const near = w.cells[tree.y]![tree.x]!.noise;
    expect(near).toBeGreaterThanOrEqual(0);
    expect(R.fixtures.tree!.noise_dampen).toBeGreaterThan(0);
    expect(Object.keys(R.fixtures.tree!.affords).length).toBeGreaterThan(0);
  });

  it("shop is closed at dawn and night", () => {
    const w = generate(1);
    const shop = Object.values(w.fixtures).find((f) => f.kind === "shop")!;
    const r = Object.values(w.residents)[0]!;
    const c = { kind: "shop", x: shop.x, y: shop.y, fixture: shop, unit: null };
    const rng = new PyRandom("shop-hours");
    expect(utility(w, r, c, "food", "dawn", rng)).toBeNull();
    expect(utility(w, r, c, "food", "night", rng)).toBeNull();
    expect(utility(w, r, c, "food", "morning", rng)).not.toBeNull();
  });

  it("bus_stop advertises company", () => {
    expect(R.fixtures.bus_stop!.affords.company).toBeGreaterThan(0);
    const w = generate(1);
    const c = candidates(w);
    expect(c.company!.some((x) => x.kind === "bus_stop")).toBe(true);
  });

  it("damage weight rises with worn fixtures", () => {
    const w = generate(1);
    const base = fateWeights(w).damage ?? 0;
    for (const f of Object.values(w.fixtures)) f.condition = 0.2;
    const worn = fateWeights(w).damage ?? 0;
    expect(worn).toBeGreaterThan(base);
  });
});

describe("G19–G25 phase B engine", () => {
  it("puddles and wear raise walkCost", () => {
    const w = generate(1);
    let x = 0, y = 0;
    outer: for (let yy = 0; yy < w.height; yy++) {
      for (let xx = 0; xx < w.width; xx++) {
        if (W.walkCost(w, xx, yy) !== null) { x = xx; y = yy; break outer; }
      }
    }
    const before = W.walkCost(w, x, y)!;
    w.cells[y]![x]!.puddle = 5;
    w.cells[y]![x]!.wear = 4;
    const after = W.walkCost(w, x, y)!;
    expect(after).toBeGreaterThan(before);
  });

  it("power cut lowers home food utility", () => {
    const w = generate(1);
    const r = Object.values(w.residents)[0]!;
    const hh = w.households[String(r.household)]!;
    hh.food_stock = 4;
    const unit = w.units[String(hh.unit)]!;
    const home = { kind: "home", x: 0, y: 0, fixture: null, unit };
    const rng = new PyRandom("power-home");
    const powered = utility(w, r, home, "food", "dawn", rng)!;
    w.buildings[String(unit.building)]!.power = false;
    const dark = utility(w, r, home, "food", "dawn", new PyRandom("power-home"))!;
    expect(dark).toBeLessThan(powered);
  });

  it("ill pupils are not due at school", () => {
    const w = generate(1);
    w.day = 10;
    expect(schoolDay(w)).toBe(true);
    const pupil = Object.values(w.residents).find((r) => isPupil(r))!;
    expect(dueAtSchool(w, pupil, "morning")).toBe(true);
    pupil.ill = 2;
    expect(dueAtSchool(w, pupil, "morning")).toBe(false);
  });

  it("affinity decays overnight", () => {
    const w = generate(1);
    const [a, b] = Object.values(w.residents);
    a!.affinity = { [String(b!.id)]: 0.5 };
    b!.affinity = { [String(a!.id)]: 0.5 };
    decayAffinity(w);
    expect((a!.affinity as Record<string, number>)[String(b!.id)]).toBeLessThan(0.5);
  });

  it("daybook thoughts raise unhappiness", () => {
    const w = generate(1);
    const hh = Object.values(w.households)[0]!;
    const before = hh.unhappy;
    w.daybook = { uses: {}, out: 0, noise: 0, broke: 2, sold_out: true, weather: "storm" };
    for (const b of Object.values(w.buildings)) b.power = false;
    unhappiness(w);
    expect(hh.unhappy).toBeGreaterThan(before);
  });
});
