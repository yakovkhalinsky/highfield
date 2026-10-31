/** The watcher's fates, landed and aged — Highfield realism fork. */
import { R } from "../rules.ts";
import * as W from "../world.ts";
import type { PyRandom } from "../../py/random.ts";
import type { Ev } from "./events.ts";

export function age(w: W.World): void {
  const keep: W.Fate[] = [];
  for (const f of w.fates) {
    f.left = ((f.left as number | undefined) ?? 0) - 1;
    if ((f.left as number) > 0) keep.push(f);
    else if (f.kind === "power_cut") restorePower(w, (f.region as string | undefined) ?? "all");
  }
  w.fates = keep;
}

export function land(w: W.World, evs: Ev[]): string | null {
  if (!w.pending.length) return null;
  const f = w.pending.shift()!;
  const spec = R.fates[f.kind as string];
  if (spec === undefined) return null;
  const rng = W.rngFor(w.seed, w.day, `fate:${f.kind}`);
  const [lo, hi] = spec.days ?? [1, 1];
  const left = rng.randint(lo, hi);
  const region = f.region ?? "all";

  if (spec.weather) {
    w.weather = spec.weather;
    w.weather_left = Math.max(w.weather_left ?? 0, left);
  }
  if (spec.stock) {
    for (const fx of Object.values(w.fixtures)) {
      if (fx.kind === "shop") fx.stock = R.fixtures.shop!.stock ?? 150;
    }
  }
  if (spec.damage) damage(w, f, spec.damage, rng);

  if (f.kind === "power_cut") cutPower(w, region);

  let tracked = false;
  for (const key of ["walk_mult", "stair_mult", "noise_mult"] as const) {
    const v = spec[key];
    if (v !== undefined && v !== null) {
      w.fates.push({ kind: f.kind, left, region, [key]: v });
      tracked = true;
    }
  }
  if (f.kind === "power_cut" && !tracked) {
    w.fates.push({ kind: f.kind, left, region });
  }

  evs.push({ day: w.day, kind: "fate", what: f.kind, region, left, say: spec.why ?? "" });
  return f.kind as string;
}

function cutPower(w: W.World, region: string): void {
  for (const b of Object.values(w.buildings)) {
    if (W.inRegion(w, region, b.door[0], b.door[1])) b.power = false;
  }
}

function restorePower(w: W.World, region: string): void {
  /* Only restore if no other active power_cut still covers the door. */
  for (const b of Object.values(w.buildings)) {
    if (!W.inRegion(w, region, b.door[0], b.door[1])) continue;
    const still = w.fates.some(
      (f) => f.kind === "power_cut" && ((f.left as number) > 0) &&
        W.inRegion(w, (f.region as string | undefined) ?? "all", b.door[0], b.door[1]),
    );
    if (!still) b.power = true;
  }
}

function damage(w: W.World, f: W.Fate, amount: number, rng: PyRandom): W.Fixture | null {
  const region = f.region ?? "all";
  const here = Object.values(w.fixtures).filter(
    (fx) => fx.condition > 0 && W.inRegion(w, region, fx.x, fx.y),
  );
  if (!here.length) return null;
  const fx = here[rng.randrange(here.length)]!;
  fx.condition = Math.max(0.0, fx.condition - amount);
  return fx;
}

/** True when a building has power (and no covering power_cut). */
export function hasPower(w: W.World, b: W.Building): boolean {
  return b.power !== false;
}
