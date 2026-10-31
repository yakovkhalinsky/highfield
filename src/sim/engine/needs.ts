/**
 * What a resident wants, and what meeting it costs them —
 * apps/estate/estate/engine/residents.py.
 */
import type { PyRandom } from "../../py/random.ts";
import { R } from "../rules.ts";
import * as W from "../world.ts";
import * as D from "./daytime.ts";
import * as F from "./families.ts";
import type { Cand } from "./families.ts";
import { ck, goTo, pos, reach, setOff, unitOf } from "./path.ts";
import * as P from "./places.ts";
import { wetness } from "./weather.ts";

type Res = W.Resident;

const intKeys = W.ids;

/**
 * The two seams tools/balance.py patches in Python (`residents.ranked_needs`
 * and `residents._satisfy` are module globals there). Hooks observe; they
 * cannot change what the engine does.
 */
export const HOOKS: {
  ranked: ((w: W.World, r: Res, phase: string, out: string[]) => void) | null;
  satisfy: ((w: W.World, r: Res, c: Cand, need: string, phase: string) => void) | null;
} = { ranked: null, satisfy: null };

export type Cands = Record<string, Cand[]>;

export function candidates(w: W.World): Cands {
  const out: Cands = {};
  for (const n of Object.keys(R.needs)) out[n] = [];
  for (const f of Object.values(w.fixtures)) {
    if (f.condition <= 0) continue;
    const affords = R.fixtures[f.kind]!.affords;
    if (affords.food && (f.stock ?? 1) <= 0) continue;
    for (const [need, q] of Object.entries(affords)) {
      if (q > 0) out[need]!.push({ kind: f.kind, x: f.x, y: f.y, fixture: f, unit: null });
    }
  }
  for (const u of Object.values(w.units)) {
    if (u.household === null) continue;
    const b = w.buildings[String(u.building)]!;
    for (const [need, spec] of Object.entries(R.needs)) {
      if (!spec.home) continue;
      out[need]!.push({ kind: "home", x: b.door[0], y: b.door[1], fixture: null, unit: u });
    }
  }
  return out;
}

export function phaseMult(need: string, phase: string): number {
  return R.needs[need]!.phases?.[phase] ?? 1.0;
}

export function weekMult(need: string, day: number): number {
  if (W.weekday(day) < 5) return 1.0;
  return R.needs[need]!.weekend ?? 1.0;
}

function drainsOf(w: W.World, r: Res): Record<string, number> {
  const kind = w.households[String(r.household)]?.kind ?? "";
  return R.households[kind]?.drains ?? {};
}

export function pressure(w: W.World, r: Res, need: string, phase: string): number {
  const spec = R.needs[need]!;
  if (spec.roles !== undefined && !spec.roles.includes(r.role)) return 0.0;
  const mult = drainsOf(w, r)[need] ?? 1.0;
  let p = spec.urge * r.needs[need]! * phaseMult(need, phase) * weekMult(need, w.day) * mult;
  if (!spec.home) {
    p *= R.weather.outdoor[w.weather] ?? 1.0;
    /* Seasonal outdoor life (G8): summer evenings pull company/play out;
     * winter keeps people nearer home. */
    const season = W.seasonName(w.day);
    if ((need === "company" || need === "play") && season === "summer" &&
        (phase === "evening" || phase === "afternoon")) p *= 1.25;
    if (!spec.home && season === "winter") p *= 0.85;
  }
  if ((r.ill as number | undefined) && (r.ill as number) > 0 && need === "rest") p *= 1.4;
  return p;
}

function rankedNeedsBase(w: W.World, r: Res, phase: string): string[] {
  const floor = R.engine.urge_floor!;
  const ranked: [number, string][] = [];
  for (const n of Object.keys(R.needs)) {
    const p = pressure(w, r, n, phase);
    if (p > floor) ranked.push([p, n]);
  }
  ranked.sort((a, b) => F.cmpTuple([-a[0], a[1]], [-b[0], b[1]]));
  return ranked.map(([, n]) => n);
}

export function rankedNeeds(w: W.World, r: Res, phase: string): string[] {
  const out = rankedNeedsBase(w, r, phase);
  if (HOOKS.ranked) HOOKS.ranked(w, r, phase, out);
  return out;
}

export function utility(w: W.World, r: Res, c: Cand, need: string, phase: string, rng: PyRandom): number | null {
  const [px, py] = pos(w, r);
  const unit = unitOf(w, r);
  const inside = r.where.mode === "in";
  const stair = R.engine.stair_step!;
  let eff: number;
  let cost: number;
  if (c.kind === "home") {
    if (unit === null || c.unit!.id !== unit.id) return null;
    if (need === "food") {
      const hh = w.households[String(r.household)];
      if (!hh || (hh.food_stock ?? 0) <= 0) return null;
      eff = (R.engine.home_food ?? 0.72) * c.unit!.condition;
    } else {
      eff = R.engine.home_rest! * c.unit!.condition;
    }
    eff *= 1.0 + 0.35 * wetness(w);
    if (need === "quiet") eff *= Math.max(0.05, 1.0 - P.unitNoise(w, c.unit!));
    cost = 0.0;
  } else {
    const f = c.fixture!;
    if (P.full(c.kind, f.occupants)) return null;
    eff = P.effective(c.kind, need, f.condition, f.occupants.length, f);
    const wet = wetness(w);
    if (wet) eff *= 1.0 - 0.45 * wet;
    const shade = w.cells[f.y]![f.x]!.shade;
    if (w.weather === "heat") eff *= 1.0 + 0.8 * shade;
    if (need === "quiet") eff *= 0.4 + 0.6 * shade;
    if (phase === "evening" || phase === "night") eff *= 1.0 + 0.7 * w.cells[f.y]![f.x]!.light;
    /* Company prefers people you already spend time with (G11). */
    if (need === "company" && f.occupants.length) {
      const aff = (r.affinity as Record<string, number> | undefined) ?? {};
      let boost = 0;
      for (const oid of f.occupants) boost = Math.max(boost, aff[String(oid)] ?? 0);
      eff += (R.engine.affinity_company ?? 0.35) * boost;
    }
    const d = Math.abs(c.x - px) + Math.abs(c.y - py);
    if (d > R.engine.scan!) return null;
    cost = d * R.engine.travel_cost! + (inside && unit ? unit.floor * stair : 0);
  }
  const habit = r.habit[phase] === c.kind ? R.engine.habit_bonus! : 0.0;
  return eff - cost + habit + rng.random() * R.engine.whim!;
}

function bumpAffinity(a: Res, b: Res): void {
  if (a.id === b.id) return;
  const gain = R.engine.affinity_gain ?? 0.15;
  const aa = (a.affinity as Record<string, number>) ?? (a.affinity = {});
  const bb = (b.affinity as Record<string, number>) ?? (b.affinity = {});
  aa[String(b.id)] = Math.min(1.0, (aa[String(b.id)] ?? 0) + gain);
  bb[String(a.id)] = Math.min(1.0, (bb[String(a.id)] ?? 0) + gain);
}

function satisfyBase(w: W.World, r: Res, c: Cand, need: string, phase: string): void {
  r.habit[phase] = c.kind;
  const full = R.engine.need_max! * R.engine.arrive_restore!;
  if (c.kind === "home") {
    const homeEff = need === "food" ? (R.engine.home_food ?? 0.72) : R.engine.home_rest!;
    r.needs[need] = Math.max(0.0, r.needs[need]! - full * homeEff);
    if (need === "food") {
      const hh = w.households[String(r.household)];
      if (hh && (hh.food_stock ?? 0) > 0) hh.food_stock = (hh.food_stock ?? 0) - 1;
    }
    return;
  }
  const f = c.fixture!;
  const restore = full * P.baseQuality(f.kind, need, f);
  r.needs[need] = Math.max(0.0, r.needs[need]! - restore);
  r.where.fixture = f.id;
  for (const oid of f.occupants) {
    const other = w.residents[String(oid)];
    if (other) bumpAffinity(r, other);
  }
  f.occupants.push(r.id);
  f.uses_today = (f.uses_today ?? 0) + 1;
  f.use_total += 1;
  if (w.daybook) {
    const u = w.daybook.uses;
    u[f.kind] = (u[f.kind] ?? 0) + 1;
  }
  if (need === "food" && f.stock !== undefined && f.stock !== null && f.stock > 0) {
    f.stock -= 1;
    if (f.stock <= 0 && w.daybook) w.daybook.sold_out = true;
    const hh = w.households[String(r.household)];
    if (hh) {
      const cap = R.engine.pantry ?? 8;
      const add = R.engine.shop_pantry ?? 3;
      hh.food_stock = Math.min(cap, (hh.food_stock ?? 0) + add);
    }
  }
}

export function satisfy(w: W.World, r: Res, c: Cand, need: string, phase: string): void {
  if (HOOKS.satisfy) HOOKS.satisfy(w, r, c, need, phase);
  satisfyBase(w, r, c, need, phase);
}

export function drain(w: W.World, _phase: string): void {
  const top = R.engine.need_max!;
  for (const r of Object.values(w.residents)) {
    const drains = drainsOf(w, r);
    for (const [need, spec] of Object.entries(R.needs)) {
      if (spec.roles !== undefined && !spec.roles.includes(r.role)) continue;
      if (spec.from === "noise") {
        let noise: number;
        if (r.where.mode === "in") {
          const unit = unitOf(w, r);
          noise = unit ? P.unitNoise(w, unit) : 0.0;
        } else if (r.where.mode === D.AWAY) {
          noise = 0.0;
        } else {
          noise = w.cells[r.where.y]![r.where.x]!.noise;
        }
        r.needs[need] = r.needs[need]! + noise * R.engine.quiet_gain!;
      } else {
        r.needs[need] = r.needs[need]! + spec.rate * (drains[need] ?? 1.0);
      }
      r.needs[need] = Math.min(top, r.needs[need]!);
    }
  }
}

function heldFixture(w: W.World, r: Res): W.Fixture | null {
  const where = r.where;
  const fid = where.fixture ?? null;
  if (where.mode !== "at" || fid === null) return null;
  const f = w.fixtures[String(fid)];
  if (f === undefined || f.x !== where.x || f.y !== where.y) return null;
  return f;
}

export function seatHolders(w: W.World): void {
  for (const f of Object.values(w.fixtures)) f.occupants = [];
  for (const rid of intKeys(w.residents)) {
    const r = w.residents[rid]!;
    const f = heldFixture(w, r);
    if (f !== null) f.occupants.push(r.id);
  }
}

export function topPress(w: W.World, r: Res, phase: string): number {
  // Python's max(): the first value, then any strictly greater — so a NaN
  // wins only when it comes first
  const needs = Object.keys(R.needs);
  if (!needs.length) return 0.0;
  let m = pressure(w, r, needs[0]!, phase);
  for (const n of needs.slice(1)) {
    const p = pressure(w, r, n, phase);
    if (p > m) m = p;
  }
  return m;
}

function homeOf(w: W.World, r: Res, cand: Cands, phase: string): [Cand | null, string | null] {
  const unit = unitOf(w, r);
  if (unit === null) return [null, null];
  let best: [number, Cand, string] | null = null;
  for (const [need, spec] of Object.entries(R.needs)) {
    if (!spec.home) continue;
    for (const c of cand[need] ?? []) {
      if (c.kind === "home" && c.unit!.id === unit.id) {
        const p = pressure(w, r, need, phase);
        if (best === null || p > best[0]) best = [p, c, need];
      }
    }
  }
  return best ? [best[1], best[2]] : [null, null];
}

function choose(
  w: W.World, party: Res[], cand: Cands, phase: string, rng: PyRandom,
  wanted: Map<number, string[]> | null = null,
): [Cand | null, string | null, Res | null] {
  const lead = party[0]!;
  const minding = party.length > 1;
  const ranked = new Map<number, string[]>();
  for (const p of party) ranked.set(p.id, rankedNeeds(w, p, phase));
  if (wanted !== null) for (const [k, v] of ranked) wanted.set(k, v);
  const wants: [number, string, Res][] = [];
  for (const p of party) for (const n of ranked.get(p.id)!) wants.push([pressure(w, p, n, phase), n, p]);
  wants.sort((a, b) => F.cmpTuple([-a[0], a[1], a[2].id], [-b[0], b[1], b[2].id]));
  let reachFn: ((c: Cand) => boolean) | null = null;
  if (minding && F.reachMatters(phase)) {
    const off = setOff(w, lead);
    if (off !== null) {
      const [sx, sy, budget] = off;
      const dist = reach(w, sx, sy, budget);
      reachFn = (c) => dist.has(ck(w, c.x, c.y));
    } else {
      reachFn = () => false;
    }
  }
  for (const [, need, p] of wants) {
    let best: Cand | null = null;
    let bestU: number | null = null;
    for (const c of cand[need] ?? []) {
      if (!F.allows(w, lead, c, phase, minding, reachFn)) continue;
      const u = utility(w, p, c, need, phase, rng);
      if (u !== null && (bestU === null || u > bestU)) { best = c; bestU = u; }
    }
    if (best !== null) return [best, need, p];
  }
  return [null, null, null];
}

function also(w: W.World, r: Res, c: Cand, phase: string, ranked: string[] | undefined): string | null {
  const list = ranked ?? rankedNeeds(w, r, phase);
  for (const need of list) {
    if (c.kind === "home") {
      if (R.needs[need]!.home) return need;
      continue;
    }
    const f = c.fixture!;
    if ((R.fixtures[f.kind]!.affords[need] ?? 0) > 0) return P.full(f.kind, f.occupants) ? null : need;
  }
  return null;
}

export function fray(r: Res, line: number): void {
  let frayed = -Infinity;
  for (const [n, spec] of Object.entries(R.needs)) {
    if (!spec.roles || !spec.roles.length || spec.roles.includes(r.role)) {
      const v = r.needs[n]!;
      if (v > frayed) frayed = v;
    }
  }
  if (frayed >= line) r.stress += 1.0;
  else r.stress *= R.engine.stress_decay!;
}

export function live(w: W.World, party: Res[], cand: Cands, phase: string, line: number, fetch: readonly Res[]): void {
  const r = party[0]!;
  const minding = party.length > 1;
  const held: [Res, W.Fixture | null][] = [];
  for (const p of party) {
    const h = heldFixture(w, p);
    if (h !== null) {
      const i = h.occupants.indexOf(p.id);
      if (i < 0) throw new Error(`list.remove(x): x not in list (resident ${p.id})`);
      h.occupants.splice(i, 1);
    }
    held.push([p, h]);
  }
  const dt = D.duty(w, party, phase, fetch);
  if (dt !== null) {
    const arrived = goTo(w, r, dt, { budget: R.engine.scan! });
    for (const k of party.slice(1)) F.follow(k, r);
    if (arrived) party = D.arrive(w, party, dt, phase, fetch);
    for (const p of party) fray(p, line);
    return;
  }
  const rng = W.rngFor(w.seed, w.day, `whim:${r.id}:${phase}`);
  const wanted = new Map<number, string[]>();
  let [best, needOf, who] = choose(w, party, cand, phase, rng, wanted);
  if (best === null && r.where.mode === "at" && F.curfew(w, r, phase, minding)) {
    [best, needOf] = homeOf(w, r, cand, phase);
    who = r;
  }
  if (best === null) {
    const full = R.engine.need_max! * R.engine.arrive_restore!;
    for (const [p, h] of held) {
      p.needs.rest = Math.max(0.0, p.needs.rest! - full * R.engine.home_rest!);
      if (h !== null) h.occupants.push(p.id);
    }
    return;
  }
  const home = best.kind === "home";
  const sure = home && F.sureHome(w, r, phase, minding);
  const route = minding && F.reachMatters(phase);
  const arrived = goTo(w, r, best, { route, sure });
  for (const k of party.slice(1)) F.follow(k, r);
  if (arrived) {
    satisfy(w, who!, best, needOf!, phase);
    for (const p of party) {
      if (p !== who) {
        const a = also(w, p, best, phase, wanted.get(p.id));
        if (a !== null) satisfy(w, p, best, a, phase);
      }
    }
  }
  for (const p of party) fray(p, line);
}
