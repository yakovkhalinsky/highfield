/**
 * One paragraph over a run of days, from templates —
 * the chronicle half of view/narrate.ts.
 */
import { byCodePoint } from "../../py/canon.ts";
import { R } from "../../sim/rules.ts";
import * as W from "../../sim/world.ts";
import type { Ev } from "../../sim/engine/events.ts";
import { MOVER, a, commas, plural, words } from "../render.ts";
import { count, frayed, isAre, list, names, pick, type Memory, type Option } from "./shared.ts";

/** What a fate is called, where "a delivery: the shop is restocked" reads
 * well; the weather fates and damage say themselves. */
const FATE_NOUN: Record<string, string> = {
  delivery: "a delivery", roadworks: "roadworks", power_cut: "a power cut",
  tranquillity: "a quiet spell",
};

const wasWere = (n: number) => (n === 1 ? "was" : "were");

function sentence(s: string): string {
  s = s.trim();
  if (!s) return s;
  s = s[0]!.toUpperCase() + s.slice(1);
  return /[.!?…]$/.test(s) ? s : s + ".";
}

/** Kinds counted, said aloud: "a bench and two lamps". */
function things(kinds: string[]): string {
  const n = new Map<string, number>();
  for (const k of kinds) n.set(k, (n.get(k) ?? 0) + 1);
  return list([...n.keys()].sort(byCodePoint).map((k) =>
    n.get(k) === 1 ? a(k) : `${count(n.get(k)!)} ${plural(words(k))}`));
}

function buildingOf(w: W.World, unit: unknown): string | null {
  const u = typeof unit === "number" ? w.units[String(unit)] : undefined;
  return u ? w.buildings[String(u.building)]?.name ?? null : null;
}

const SKY_DAYS: Record<string, string> = {
  clear: "clear", rain: "wet", storm: "stormy", heat: "hot", frost: "frosty",
};

interface Beat { weight: number; options: Option[] }

export interface Stretch {
  /** the run's days, oldest first */
  days: number[];
  events: Ev[];
  books: Record<number, W.Daybook | undefined>;
}

/** What the run's events were, as beats a sentence can be made of. */
function news(w: W.World, evs: Ev[]): Beat[] {
  const by = (k: string) => evs.filter((e) => e.kind === k);
  const out: Beat[] = [];
  const died = names(by("died"));
  if (died.length) {
    const n = died.length;
    out.push({ weight: 10, options: [
      ["died:0", `${list(died)} died`],
      ["died:1", `the estate lost ${list(died)}`],
      ["died:2", n === 1 ? `there was a death on the estate: ${died[0]}`
        : `there were ${count(n)} deaths on the estate: ${list(died)}`],
    ] });
  }
  const born = names(by("born"), "a child");
  if (born.length) {
    const n = born.length;
    out.push({ weight: 9, options: [
      ["born:0", `${list(born)} ${wasWere(n)} born on the estate`],
      ["born:1", `${n === 1 ? "a new name" : "new names"} on the estate: ${list(born)}`],
      ["born:2", `the estate grew by ${count(n)} — ${list(born)}, born here`],
    ] });
  }
  for (const e of by("turn")) {
    const i = e.season as number;
    const s = R.presentation.seasons[i] ?? "another season";
    const opts: Option[] = [["turn:0", `the season turned to ${s}`], ["turn:1", `${s} came in`]];
    const line = R.presentation.season_lines[String(i)];
    if (line) opts.push(["turn:2", line]);
    out.push({ weight: 8, options: opts });
  }
  const left = names(by("left"), "a household");
  if (left.length) {
    const n = left.length;
    out.push({ weight: 8, options: n === 1 ? [
      ["left:0", `${left[0]} left the estate`],
      ["left:1", `${left[0]} moved away`],
      ["left:2", `the estate said goodbye to ${left[0]}`],
    ] : [
      ["left:0", `${list(left)} left the estate`],
      ["left:3", `${count(n)} households moved away — ${list(left)}`],
    ] });
  }
  const moved = by("moved_in");
  if (moved.length) {
    const who = moved.map((e) => MOVER[e.where as string] ?? a(e.where || "household"));
    const where = moved.map((e) => buildingOf(w, e.flat));
    const n = moved.length;
    if (n === 1 && where[0]) {
      out.push({ weight: 7, options: [
        ["move:0", `${who[0]} moved into ${where[0]}`],
        ["move:1", `new neighbours in ${where[0]}: ${who[0]}`],
        ["move:2", `${where[0]} took in ${who[0]}`],
      ] });
    } else {
      out.push({ weight: 7, options: [
        ["move:3", `${list(who)} moved in`],
        ["move:4", `${count(n)} new households on the estate — ${list(who)}`],
      ] });
    }
  }
  // the engine says what someone grew into at the end of `what`: "a child
  // becomes an adult", "an adult becomes an elder" (households.agePeople)
  const grew = by("grew");
  const into = (role: string) => names(grew.filter((e) => String(e.what ?? "").endsWith(`becomes an ${role}`)));
  const adults = into("adult");
  const elders = into("elder");
  if (adults.length) {
    out.push({ weight: 6, options: [
      ["adult:0", `${list(adults)} came of age`],
      ["adult:1", `${list(adults)} ${isAre(adults.length)} grown now`],
    ] });
  }
  if (elders.length) {
    out.push({ weight: 6, options: [
      ["elder:0", `${list(elders)} ${isAre(elders.length)} counted among the elders now`],
      ["elder:1", `${list(elders)} turned elder`],
    ] });
  }
  for (const e of by("fate")) {
    const s = (e.say as string) || `the watcher sent ${words(e.what)}`;
    const opts: Option[] = [["fate:0", s]];
    const noun = FATE_NOUN[e.what as string];
    if (noun && e.say) opts.push(["fate:1", `${noun}: ${s}`]);
    out.push({ weight: 6, options: opts });
  }
  const storms = by("storm").length;
  if (storms) {
    out.push({ weight: 5, options: storms === 1
      ? [["storm:0", "a storm crossed the estate"], ["storm:1", "a storm came through"]]
      : [["storm:0", `${count(storms)} storms crossed the estate`]] });
  }
  const trees = by("tree_down").length;
  if (trees) {
    out.push({ weight: 5, options: trees === 1
      ? [["tree:0", "a tree came down"], ["tree:1", "the estate lost a tree"]]
      : [["tree:0", `${count(trees)} trees came down`]] });
  }
  const broke = by("broke").map((e) => String(e.what || "thing"));
  if (broke.length) {
    out.push({ weight: 5, options: [
      ["broke:0", `${things(broke)} broke`],
      ["broke:1", `${things(broke)} gave out`],
    ] });
  }
  if (by("frost").length) {
    // render.py's "ice on the pond", where the estate has a pond to ice
    const pond = w.cells.some((row) => row.some((c) => c.site === "water"));
    out.push({ weight: 3, options: pond
      ? [["frost:0", "ice on the pond"], ["frost:1", "the pond iced over"]]
      : [["frost:2", "a hard frost"], ["frost:3", "the estate woke white"]] });
  }
  return out;
}

const dayz = (n: number): string => (n === 1 ? "day" : "days");

/** The shape of the run's ordinary days, from their daybooks. */
function shape(w: W.World, s: Stretch): Beat | null {
  const days = s.days.filter((d) => s.books[d]);
  if (!days.length) return null;
  const totals = days.map((d) => Object.values(s.books[d]!.uses ?? {}).reduce((p, q) => p + q, 0));
  const total = totals.reduce((p, q) => p + q, 0);
  const n = days.length;
  if (!total) {
    return { weight: 1, options: [
      ["still:0", `${count(n)} still ${dayz(n)} — not one errand run`],
    ] };
  }
  const skies = days.map((d) => s.books[d]!.weather ?? "clear");
  const uses: Record<string, number> = {};
  for (const d of days) for (const [k, v] of Object.entries(s.books[d]!.uses ?? {})) uses[k] = (uses[k] ?? 0) + v;
  const aside = Object.keys(uses).filter((k) => k !== "shop" && uses[k]! > 0)
    .sort((p, q) => uses[q]! - uses[p]! || byCodePoint(p, q))[0];
  // the busiest place but the shop, said as it stood against the shop
  const many = Object.values(w.fixtures).filter((f) => f.kind === aside).length > 1;
  const place = aside ? `the ${many ? plural(words(aside)) : words(aside)}` : null;
  const rank = !aside ? "" : (uses.shop ?? 0) >= uses[aside]! ? "busiest after the shop" : "busier even than the shop";
  const one = skies.every((x) => x === skies[0]);
  const wet = skies.filter((x) => x === "rain" || x === "storm").length;
  const sky = one
    ? `${count(n)} ${SKY_DAYS[skies[0]!] ?? skies[0]} ${dayz(n)}`
    : wet ? `${skies.includes("storm") ? "wet weather" : "rain"} on ${count(wet)} of ${count(n)} days` : `${count(n)} dry days`;
  const best = totals.indexOf(Math.max(...totals));
  const opts: Option[] = [
    ["shape:1", `${commas(total)} errands over ${count(n)} ${dayz(n)}, the most on ${W.weekdayName(days[best]!)} (${commas(totals[best]!)})`],
  ];
  if (place) {
    opts.push(["shape:0", `${sky}; ${commas(total)} errands, and ${place} ${rank}`]);
    opts.push(["shape:2", `${sky}, and ${place} the place to be`]);
  }
  if (n > 1) opts.push(["shape:3", `${sky}; about ${commas(Math.round(total / n))} errands a day`]);
  return { weight: 1, options: opts };
}

function soldOut(s: Stretch): Beat | null {
  const k = s.days.filter((d) => s.books[d]?.sold_out).length;
  if (!k) return null;
  const times = k === 1 ? "once" : k === 2 ? "twice" : `${count(k)} times`;
  return { weight: 4, options: [
    ["sold:0", `the shop sold out ${times}`],
    ["sold:1", k === 1 ? "one evening the shop's shelves were bare" : `the shop's shelves were bare ${times}`],
  ] };
}

function fraying(w: W.World): Beat | null {
  const who = frayed(w);
  if (!who.length) return null;
  return { weight: 2, options: [
    ["fray:0", `${list(who)} ${isAre(who.length)} fraying`],
    ["fray:1", `it has been hard going for ${list(who)}`],
  ] };
}

/** One entry for a run of days: the two weightiest things that happened
 * and what the days were like. Never empty, never more than three
 * sentences, and only ever the run's own facts. */
export function chronicle(w: W.World, s: Stretch, mem: Memory, earlier: readonly string[] = []): string {
  const rng = W.rngFor(w.seed, w.day, "chronicle");
  const beats = news(w, s.events).sort((p, q) => q.weight - p.weight);
  const lead = beats.slice(0, 2);
  const extra = [soldOut(s), fraying(w)].filter((b): b is Beat => b !== null);
  if (lead.length < 2 && extra.length) lead.push(extra[0]!);
  const sh = shape(w, s);
  if (sh && lead.length < 3) lead.push(sh);
  if (!lead.length) {
    return `${count(s.days.length)} ${dayz(s.days.length)} the estate has no record of.`;
  }
  let text = "";
  for (let tries = 0; tries < 4; tries++) {
    text = lead.map((b) => sentence(pick(rng, mem, b.options))).join(" ");
    if (!earlier.includes(text)) return text;
  }
  // every wording is one the estate already keeps: name the days, which
  // no other entry can share
  const [from, to] = [s.days[0]!, s.days[s.days.length - 1]!];
  return `${text} ${sentence(from === to ? `day ${commas(from)}` : `days ${commas(from)} to ${commas(to)}`)}`;
}
