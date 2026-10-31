/**
 * One sentence on why the watcher sent what it sent, from templates —
 * the why half of view/narrate.ts.
 */
import { byCodePoint } from "../../py/canon.ts";
import { R } from "../../sim/rules.ts";
import * as W from "../../sim/world.ts";
import type { Ev } from "../../sim/engine/events.ts";
import type { Intent } from "../../sim/watcher.ts";
import { commas, words } from "../render.ts";
import { count, frayed, isAre, list, names, pick, type Memory, type Option } from "./shared.ts";

/** Facts the why may lean on, every one read off the world or its books. */
export interface Facts {
  season: string; weekday: string; weather: string;
  dry: number; calm: number; soldOut: number; stockPct: number | null;
  worn: string[]; broken: string[]; frayed: string[];
  today: number | null; born: string[];
}

export function facts(w: W.World, books: Record<number, W.Daybook | undefined>, events: Ev[]): Facts {
  const back = (pred: (b: W.Daybook) => boolean): number => {
    let n = 0;
    for (let d = w.day; d > w.day - 64; d--) {
      const b = books[d];
      if (!b || !pred(b)) break;
      n++;
    }
    return n;
  };
  const week = [...Array(7).keys()].map((i) => books[w.day - i]).filter((b): b is W.Daybook => !!b);
  const shop = Object.values(w.fixtures).find((f) => f.kind === "shop" && typeof f.stock === "number");
  const full = R.fixtures.shop?.stock;
  const fx = Object.values(w.fixtures);
  const today = books[w.day];
  return {
    season: W.seasonName(w.day),
    weekday: W.weekdayName(w.day),
    weather: w.weather,
    dry: back((b) => b.weather !== "rain" && b.weather !== "storm"),
    calm: back((b) => b.weather !== "storm"),
    soldOut: week.filter((b) => b.sold_out).length,
    stockPct: shop && full ? Math.round((100 * shop.stock!) / full) : null,
    worn: [...new Set(fx.filter((f) => f.condition > 0 && f.condition < 0.35).map((f) => f.kind))].sort(byCodePoint),
    broken: [...new Set(fx.filter((f) => f.condition <= 0).map((f) => f.kind))].sort(byCodePoint),
    frayed: frayed(w),
    today: today ? Object.values(today.uses ?? {}).reduce((p, q) => p + q, 0) : null,
    born: names(events.filter((e) => e.kind === "born" && e.day > w.day - 7 && e.who)),
  };
}

/** Every line the why could say today for a choice already made, with its
 * template id: the ones whose facts hold, and the pack's line last. */
export function whyOptions(w: W.World, intent: Intent, books: Record<number, W.Daybook | undefined>,
                           events: Ev[]): Option[] {
  const f = facts(w, books, events);
  const pack = R.fates[intent.fate]?.why ?? intent.why;
  const opts: Option[] = [];
  const add = (ok: unknown, id: string, text: () => string) => { if (ok) opts.push([`${intent.fate}:${id}`, text()]); };
  const times = (k: number) => (k === 1 ? "once" : k === 2 ? "twice" : `${count(k)} times`);
  switch (intent.fate) {
    case "rain":
      add(f.dry >= 3, "dry", () => `${count(f.dry)} dry days; the lawns want rain`);
      add(f.dry >= 2, "held", () => `it is ${f.season}, and the sky has held off long enough`);
      break;
    case "storm":
      add(f.calm >= 5, "calm", () => `${count(f.calm)} days without a storm; enough of that`);
      add(f.season === "autumn" || f.season === "winter", "season", () => `${f.season} weather, and the estate should feel it`);
      break;
    case "heat":
      add(f.season === "summer", "summer", () => "high summer; let the courtyard bake");
      add(f.today !== null && f.today >= 400, "busy", () => `${commas(f.today!)} errands today — the heat will slow them`);
      break;
    case "frost":
      add(f.season === "winter" || f.season === "autumn", "season", () => `${f.season} nights are long; the estate wakes white`);
      break;
    case "delivery":
      add(f.soldOut, "sold", () => `the shop sold out ${times(f.soldOut)} this week; the shelves want filling`);
      add(f.stockPct !== null && f.stockPct < 50, "stock", () => `the shop's shelves are down to ${f.stockPct}%`);
      break;
    case "roadworks":
      add(f.today, "long", () => `${commas(f.today!)} errands today; let them take the long way round a while`);
      break;
    case "power_cut":
      add(!f.frayed.length, "steady", () => "nobody is fraying; the estate can stand a dark night");
      break;
    case "tranquillity":
      add(f.frayed.length, "fray", () => `${list(f.frayed)} ${isAre(f.frayed.length)} fraying; the estate could use a few quiet days`);
      break;
    case "damage": {
      // the worn kind where the damage is aimed, if one is, else any
      const aimed = Object.values(w.fixtures)
        .filter((x) => f.worn.includes(x.kind) && x.condition > 0 && x.condition < 0.35 && W.inRegion(w, intent.region, x.x, x.y))
        .map((x) => x.kind).sort(byCodePoint);
      const kind = aimed[0] ?? f.worn[0];
      add(kind, "worn", () => `the ${words(kind!)} has been wearing thin`);
      break;
    }
    case "quiet":
      add(!f.frayed.length, "steady", () => "nobody is fraying — the estate can keep its own day");
      add(f.today, "errands", () => `${commas(f.today!)} errands today; the estate needs nothing from me`);
      add(f.weather === "rain", "rain", () => "it is raining well enough without me");
      add(f.born.length, "born", () => `${list(f.born)} ${isAre(f.born.length)} new on the estate; let the days be ordinary`);
      add(true, "day", () => `the estate is left to its own ${f.weekday}`);
      break;
  }
  opts.push([`${intent.fate}:pack`, pack]);
  return opts;
}

/** The watcher's why for a choice already made: one short sentence in the
 * place's own voice, from the facts that fit the fate, or the pack's line. */
export function why(w: W.World, intent: Intent, books: Record<number, W.Daybook | undefined>,
                    events: Ev[], mem: Memory): string {
  return pick(W.rngFor(w.seed, w.day, "watch:why"), mem, whyOptions(w, intent, books, events));
}
