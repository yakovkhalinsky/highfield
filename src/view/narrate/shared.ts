/**
 * The choice among fitting templates, and the words both the chronicle
 * and the watcher's why build their sentences from.
 */
import type { PyRandom } from "../../py/random.ts";
import type { Ev } from "../../sim/engine/events.ts";
import type * as W from "../../sim/world.ts";
import { commas } from "../render.ts";

/** Template ids lately used, oldest first; saved with the estate. */
export interface Memory { used: string[] }

export const MEMORY = 24;

export type Option = [id: string, text: string];

/** One of the options, preferring any not used lately: a line is never
 * said twice running, unless it is the only one that fits. */
export function pick(rng: PyRandom, mem: Memory, options: Option[]): string {
  // the older half: never used first, then the ones used longest ago, so
  // a line is never the last one said and the order never settles into a
  // round the reader can predict
  const age = (id: string) => mem.used.lastIndexOf(id);
  const ages = options.map(([id]) => age(id)).sort((p, q) => p - q);
  const cut = ages[Math.max(0, Math.ceil(options.length / 2) - 1)]!;
  const pool = options.filter(([id]) => age(id) <= cut);
  const [id, text] = rng.choice(pool);
  mem.used = mem.used.filter((u) => u !== id);
  mem.used.push(id);
  if (mem.used.length > MEMORY) mem.used.splice(0, mem.used.length - MEMORY);
  return text;
}

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "eleven", "twelve"];

/** A small count as a word, a large one with commas. */
export function count(n: number): string {
  return n < NUM.length ? NUM[n]! : commas(n);
}

/** "Ada", "Ada and Bram", "Ada, Bram and Cleo", "Ada, Bram, Cleo and 2 others". */
export function list(xs: string[], most = 4): string {
  if (xs.length > most) {
    const rest = xs.length - (most - 1);
    xs = [...xs.slice(0, most - 1), `${count(rest)} others`];
  }
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export const isAre = (n: number) => (n === 1 ? "is" : "are");

export function names(evs: Ev[], d = "someone"): string[] {
  return evs.map((e) => (e.who === undefined || e.who === null || e.who === "" ? d : String(e.who)));
}

/** The residents fraying now (stress ≥ 1), worst first, named ones only. */
export function frayed(w: W.World, n = 2): string[] {
  return Object.values(w.residents)
    .filter((r) => r.stress >= 1 && r.name)
    .sort((p, q) => q.stress - p.stress || p.id - q.id)
    .slice(0, n).map((r) => r.name!);
}
