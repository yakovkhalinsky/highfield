/**
 * Why a resident moved this phase — observation only.
 *
 * The log is a WeakMap beside the world. It is not a field on the world,
 * a resident, or a save, so the canonical hash never sees it. Recording
 * happens after the chooser has already drawn its whim; nothing here
 * calls the sim RNG or changes a return value.
 */
import type * as W from "../world.ts";

/** The engine's phase order (residents.PHASES). Copied so this module
 *  does not import the residents cycle. */
const PHASES = ["dawn", "morning", "afternoon", "evening", "night"] as const;

export interface WhyView {
  phase: string;
  ranked: string[];
  need: string | null;
  place: string | null;
  candidates: string[];
  met: boolean;
}

interface Slot {
  day: number;
  ranked: string[];
  need: string | null;
  place: string | null;
  candidates: string[];
  met: boolean;
}

type Book = Partial<Record<string, Slot>>;

const logs = new WeakMap<W.World, Map<number, Book>>();

function book(w: W.World): Map<number, Book> {
  let m = logs.get(w);
  if (!m) logs.set(w, (m = new Map()));
  return m;
}

function fresh(day: number): Slot {
  return { day, ranked: [], need: null, place: null, candidates: [], met: false };
}

function slotFor(w: W.World, id: number, phase: string, day: number): Slot {
  const m = book(w);
  let b = m.get(id);
  if (!b) m.set(id, (b = {}));
  let slot = b[phase];
  if (!slot || slot.day !== day) b[phase] = slot = fresh(day);
  return slot;
}

/** Top needs, in the order the chooser will walk them. Replaces any
 *  earlier note for this phase so a new day cannot keep yesterday's pick. */
export function noteRanked(w: W.World, id: number, phase: string, ranked: readonly string[]): void {
  const slot = slotFor(w, id, phase, w.day);
  slot.ranked = ranked.slice(0, 3);
  slot.need = null;
  slot.place = null;
  slot.candidates = [];
  slot.met = false;
}

/** The place the chooser kept. `candidates` are kinds already scored. */
export function noteChoice(
  w: W.World, id: number, phase: string,
  place: string, need: string, candidates: readonly string[],
): void {
  const slot = slotFor(w, id, phase, w.day);
  slot.need = need;
  slot.place = place;
  slot.candidates = candidates.slice(0, 4);
  slot.met = false;
}

/** They arrived and the need was met. A follower who never owned the
 *  party's choice still gets the place they actually used. */
export function noteMet(w: W.World, id: number, phase: string, need: string, place: string): void {
  const slot = slotFor(w, id, phase, w.day);
  slot.met = true;
  if (!slot.need) {
    slot.need = need;
    slot.place = place;
  }
}

/** Today's phases only, in dawn-to-night order. Copies, so a caller
 *  cannot write back into the log. */
export function whyFor(w: W.World, id: number): WhyView[] {
  const rec = logs.get(w)?.get(id);
  if (!rec) return [];
  const out: WhyView[] = [];
  const seen = new Set<string>();
  const emit = (phase: string) => {
    if (seen.has(phase)) return;
    seen.add(phase);
    const slot = rec[phase];
    if (!slot || slot.day !== w.day) return;
    out.push({
      phase,
      ranked: [...slot.ranked],
      need: slot.need,
      place: slot.place,
      candidates: [...slot.candidates],
      met: slot.met,
    });
  };
  for (const phase of PHASES) emit(phase);
  for (const phase of Object.keys(rec)) emit(phase);
  return out;
}
