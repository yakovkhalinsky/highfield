/**
 * What an observer can point at, read off state the day already recorded.
 * Tags and the story line do not draw from the sim's RNG and do not write
 * the world back. A tag lasts for the day the fact is true; the scene
 * fades it across one phase of the pace clock.
 */
import type { Ev } from "../sim/engine/events.ts";
import * as W from "../sim/world.ts";
import { say } from "./render.ts";

export type TagKind = "broke" | "down" | "sold_out" | "power" | "loud";

export interface EventTag {
  id: string;
  x: number;
  y: number;
  kind: TagKind;
  /** Words, so the mark is not colour alone. */
  label: string;
}

/** A playground that was sat on this much yesterday reads as loud. */
const LOUD_USES = 4;

export interface Story {
  changing: string;
  fraying: string;
}

function add(tags: EventTag[], seen: Set<string>, tag: EventTag): void {
  if (seen.has(tag.id)) return;
  seen.add(tag.id);
  tags.push(tag);
}

/** In-world marks for today's facts: a break, a fallen tree, an empty
 * shop, a dark block, a playground that was busy. */
export function eventTags(w: W.World, events: readonly Ev[]): EventTag[] {
  const tags: EventTag[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (e.day !== w.day) continue;
    const x = e.x, y = e.y;
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (e.kind === "broke") {
      const what = typeof e.what === "string" ? e.what.replace(/_/g, " ") : "fixture";
      add(tags, seen, { id: `broke:${x},${y}`, x, y, kind: "broke", label: `${what} broke` });
    } else if (e.kind === "tree_down") {
      add(tags, seen, { id: `down:${x},${y}`, x, y, kind: "down", label: "tree down" });
    }
  }
  if (w.daybook?.sold_out) {
    for (const f of Object.values(w.fixtures)) {
      if (f.kind === "shop" && (f.stock ?? 1) <= 0) {
        add(tags, seen, { id: `sold:${f.id}`, x: f.x, y: f.y, kind: "sold_out", label: "sold out" });
      }
    }
  }
  if (w.daybook?.power_off) {
    for (const b of Object.values(w.buildings)) {
      if (b.power !== false || !b.door) continue;
      add(tags, seen, {
        id: `power:${b.id}`, x: b.door[0], y: b.door[1], kind: "power", label: "power out",
      });
    }
  }
  for (const f of Object.values(w.fixtures)) {
    if (f.kind !== "playground" || f.condition <= 0) continue;
    if ((f.last_use ?? 0) < LOUD_USES) continue;
    add(tags, seen, { id: `loud:${f.id}`, x: f.x, y: f.y, kind: "loud", label: "loud" });
  }
  return tags;
}

/** What's changing, then who is fraying (stress at the engine's line).
 * Totals stay in the census chips under this. */
export function storyOf(w: W.World, events: readonly Ev[]): Story {
  let latest: Ev | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.day === w.day) { latest = events[i]; break; }
  }
  const changing = latest ? say(latest) : "nothing new recorded today";
  const frayed = Object.values(w.residents).filter((r) => r.stress >= 1);
  const names = frayed.slice(0, 4).map((r) => r.name || "someone");
  const fraying = names.length === 0
    ? "no one is fraying"
    : frayed.length > names.length
      ? `fraying: ${names.join(", ")} and ${frayed.length - names.length} more`
      : `fraying: ${names.join(", ")}`;
  return { changing, fraying };
}
