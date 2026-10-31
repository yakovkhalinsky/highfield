/**
 * The people: what they want, where they go, and what it costs them —
 * apps/estate/estate/engine/residents.py.
 *
 * The day's loop lives here. Pathfinding is path.ts; wants and
 * satisfaction are needs.ts. Both are re-exported so existing imports
 * from this module keep working.
 */
import { R } from "../rules.ts";
import * as W from "../world.ts";
import * as D from "./daytime.ts";
import * as F from "./families.ts";
import type { Ev } from "./events.ts";
import {
  HOOKS, candidates, drain, fray, live, phaseMult, pressure, rankedNeeds, satisfy, seatHolders,
  topPress, weekMult,
} from "./needs.ts";

export const PHASES = ["dawn", "morning", "afternoon", "evening", "night"] as const;

/** Called as watcher(w, phase) once every resident has settled a phase. */
export const PHASE_WATCHERS: ((w: W.World, phase: string) => void)[] = [];

export { setPathStamp, path, pathMap, reach } from "./path.ts";
export {
  HOOKS, candidates, phaseMult, weekMult, pressure, rankedNeeds, satisfy, drain, topPress,
};
export type { Cands } from "./needs.ts";

const intKeys = W.ids;

function updateIllness(w: W.World, evs: Ev[]): void {
  const rng = W.rngFor(w.seed, w.day, "ill");
  const days = R.engine.ill_days ?? 3;
  const prob = R.engine.ill_prob ?? 0.08;
  const stressLine = R.engine.ill_stress ?? 2.5;
  const mob = R.engine.ill_mobility ?? 0.55;
  for (const r of Object.values(w.residents)) {
    const left = (r.ill as number | undefined) ?? 0;
    if (left > 0) {
      r.ill = left - 1;
      r.mobility = Math.min(r.mobility, mob);
      if ((r.ill as number) <= 0) {
        r.ill = 0;
        const hh = w.households[String(r.household)];
        const kind = hh ? R.households[hh.kind]?.mobility : undefined;
        r.mobility = kind ?? 1.0;
      }
      continue;
    }
    const wet = w.weather === "frost" || w.weather === "rain" || w.weather === "storm";
    const old = r.age >= R.people.ages.elder;
    if ((r.stress >= stressLine || (wet && old)) && rng.random() < prob) {
      r.ill = days;
      r.mobility = mob;
      evs.push({ day: w.day, kind: "ill", who: r.name || "someone" });
    }
  }
}

export function updateResidents(w: W.World, evs: Ev[]): void {
  const cand = candidates(w);
  const line = R.engine.stress_at!;
  D.overnight(w);
  updateIllness(w, evs);
  F.settle(w, evs);
  for (const phase of PHASES) {
    drain(w, phase);
    D.begin(w, phase);
    seatHolders(w);
    const leads = F.plan(w, (g) => topPress(w, g, phase), (g) => D.busy(w, g, phase));
    const led = new Set<number>();
    for (const ks of leads.values()) for (const k of ks) led.add(k.id);
    const fetch = D.collectors(w, phase);
    for (const rid of intKeys(w.residents)) {
      const r = w.residents[rid];
      if (r === undefined || led.has(r.id)) continue;
      if (F.OFF_PLAN.includes(r.where.mode)) {
        fray(r, line);
        continue;
      }
      const got = fetch.get(r.id) ?? [];
      live(w, [r, ...(leads.get(r.id) ?? [])], cand, phase, line, got);
      for (const k of got) led.add(k.id);
    }
    for (const f of Object.values(w.fixtures)) f.occupants = [];
    if (w.daybook) {
      let out = 0;
      for (const x of Object.values(w.residents)) if (x.where.mode === "at") out++;
      w.daybook.out = Math.max(w.daybook.out, out);
    }
    D.record(w, phase);
    for (const watch of PHASE_WATCHERS) watch(w, phase);
  }
}
