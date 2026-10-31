/** The conductor: one day on the estate — Highfield realism fork. */
import * as W from "../world.ts";
import * as effects from "./effects.ts";
import { updatePuddles, updateWear } from "./ground.ts";
import { updateHouseholds } from "./households.ts";
import * as places from "./places.ts";
import { updateResidents } from "./residents.ts";
import { updateTrees } from "./trees.ts";
import { rollWeather, updateWetStreak } from "./weather.ts";
import type { Ev } from "./events.ts";

/** Advance one day. Returns the day's events, all kinds. */
export function tick(w: W.World): Ev[] {
  const evs: Ev[] = [];
  w.day += 1;
  const t = w.day;
  w.daybook = { uses: {}, out: 0, noise: 0.0, broke: 0, sold_out: false, worked: 0 };
  const prev = W.seasonIndex(t - 1), now = W.seasonIndex(t);
  if (now !== prev) evs.push({ day: t, kind: "turn", season: now });
  effects.age(w);
  rollWeather(w, evs);
  effects.land(w, evs);
  updateWetStreak(w);
  updatePuddles(w);
  w.daybook.weather = w.weather;
  w.daybook.wet_streak = w.wet_days;
  w.daybook.power_off = Object.values(w.buildings).some((b) => b.power === false);
  updateTrees(w, evs);
  places.buildNoise(w);
  places.buildLight(w);
  updateResidents(w, evs);
  updateWear(w);
  places.updateFixtures(w, evs);
  updateHouseholds(w, evs);
  return evs;
}
