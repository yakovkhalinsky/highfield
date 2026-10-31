/**
 * Where a resident walks — the search in apps/estate/estate/engine/residents.py.
 * Departure (`pos`, `setOff`, `goTo`) sits here so the step helpers stay private.
 */
import { R } from "../rules.ts";
import * as W from "../world.ts";
import type { Cand } from "./families.ts";

type Res = W.Resident;

export function pos(w: W.World, r: Res): [number, number] {
  if (r.where.mode === "in") {
    const u = w.units[String(r.where.unit)]!;
    const b = w.buildings[String(u.building)]!;
    return [b.door[0], b.door[1]];
  }
  return [r.where.x, r.where.y];
}

export function unitOf(w: W.World, r: Res): W.Unit | null {
  let uid = r.where.unit ?? null;
  if (uid === null) {
    const h = w.households[String(r.household)];
    uid = h ? h.unit : null;
  }
  return uid !== null ? (w.units[String(uid)] ?? null) : null;
}

// the eight ways a step can go, in the order a tie is broken
const STEPS: readonly [number, number][] = [
  [0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1],
];

/** A cell's key; cells one off the plan (all a search can reach) stay distinct. */
export function ck(w: W.World, x: number, y: number): number {
  return (y + 2) * (w.width + 4) + (x + 2);
}

type Pt = [number, number];

// path()'s scratch: which cells this search has seen (by stamp, so nothing
// needs clearing between searches) and the cell each was reached from
let seen = new Int32Array(0);
let from = new Int32Array(0);
let stamp = 0;

/** For the tests: put the stamp where it is about to wrap (0x7fffffff),
 * which otherwise takes two billion searches to reach. */
export function setPathStamp(n: number): void {
  stamp = n;
}

/** Breadth-first, eight ways, the target allowed even if it can't be
 * walked on: world.path. The same search as pathMap below, step for step,
 * on flat arrays — it runs for every leg of every walk, which makes it
 * the hottest loop in the day. */
export function path(w: W.World, sx: number, sy: number, tx: number, ty: number): Pt[] | null {
  if (sx === tx && sy === ty) return [];
  // A start off the padded plan can't be keyed into the flat arrays (ck
  // would wrap into the next row). Nothing walks from there today —
  // residents and fixtures stand on the plan — but if one did, the same
  // search on a map keyed by the cell itself still answers as Python does.
  if (sx < -1 || sy < -1 || sx > w.width || sy > w.height) return pathMap(w, sx, sy, tx, ty);
  const span = w.width + 4;
  const size = span * (w.height + 4);
  if (seen.length < size) {
    seen = new Int32Array(size);
    from = new Int32Array(size);
    stamp = 0;
  }
  if (++stamp === 0x7fffffff) {
    seen.fill(0);
    stamp = 1;
  }
  const s0 = ck(w, sx, sy);
  seen[s0] = stamp;
  let frontier: number[] = [s0];
  while (frontier.length) {
    const nxt: number[] = [];
    for (const c of frontier) {
      const cx = (c % span) - 2;
      const cy = ((c / span) | 0) - 2;
      for (const [ox, oy] of STEPS) {
        const nx = cx + ox, ny = cy + oy;
        const k = c + oy * span + ox;
        if (seen[k] === stamp) continue;
        const isT = nx === tx && ny === ty;
        if (!isT && !W.passable(w, nx, ny)) continue;
        seen[k] = stamp;
        from[k] = c;
        if (isT) {
          const out: Pt[] = [];
          for (let n = k; n !== s0; n = from[n]!) out.push([(n % span) - 2, ((n / span) | 0) - 2]);
          out.reverse();
          return out;
        }
        nxt.push(k);
      }
    }
    frontier = nxt;
  }
  return null;
}

export function pathMap(w: W.World, sx: number, sy: number, tx: number, ty: number): Pt[] | null {
  const ck = (_w: W.World, x: number, y: number) => `${x},${y}`;
  const came = new Map<string, Pt | null>();
  came.set(ck(w, sx, sy), null);
  let frontier: Pt[] = [[sx, sy]];
  while (frontier.length) {
    const nxt: Pt[] = [];
    for (const [cx, cy] of frontier) {
      for (const [ox, oy] of STEPS) {
        const nx = cx + ox, ny = cy + oy;
        const k = ck(w, nx, ny);
        if (came.has(k)) continue;
        const isT = nx === tx && ny === ty;
        if (!isT && !W.passable(w, nx, ny)) continue;
        came.set(k, [cx, cy]);
        if (isT) {
          const out: Pt[] = [];
          let n: Pt = [nx, ny];
          while (!(n[0] === sx && n[1] === sy)) {
            out.push(n);
            n = came.get(ck(w, n[0], n[1]))!;
          }
          out.reverse();
          return out;
        }
        nxt.push([nx, ny]);
      }
    }
    frontier = nxt;
  }
  return null;
}

export function reach(w: W.World, sx: number, sy: number, limit: number | null = null): Map<number, number> {
  const dist = new Map<number, number>();
  dist.set(ck(w, sx, sy), 0);
  let frontier: Pt[] = [[sx, sy]];
  let d = 0;
  while (frontier.length && (limit === null || d < limit)) {
    d += 1;
    const nxt: Pt[] = [];
    for (const [cx, cy] of frontier) {
      for (const [ox, oy] of STEPS) {
        const nx = cx + ox, ny = cy + oy;
        const k = ck(w, nx, ny);
        if (dist.has(k)) continue;
        dist.set(k, d);
        if (W.passable(w, nx, ny)) nxt.push([nx, ny]);
      }
    }
    frontier = nxt;
  }
  return dist;
}

function followPath(r: Res, p: Pt[], steps: number): boolean {
  for (const [x, y] of p.slice(0, steps)) { // p[:steps], a negative end included
    r.where.x = x; r.where.y = y;
  }
  return p.length <= steps;
}

/** Python's path[steps:] for any int steps. */
function tail<T>(xs: T[], steps: number): T[] {
  return steps >= 0 ? xs.slice(steps) : xs.slice(Math.max(0, xs.length + steps));
}

function hold(r: Res, tx: number, ty: number, p: Pt[], steps: number): void {
  const rest = tail(p, steps);
  r.side = rest.length ? { to: [tx, ty], path: rest.map((q) => [q[0], q[1]]) } : null;
}

function routeWalk(w: W.World, r: Res, tx: number, ty: number, steps: number): boolean {
  r.side = null;
  const p = path(w, r.where.x, r.where.y, tx, ty);
  if (p === null) return false;
  return followPath(r, p, steps);
}

function walk(w: W.World, r: Res, tx: number, ty: number, steps: number): boolean {
  const held = r.side as { to?: unknown; path?: number[][] } | null | undefined;
  r.side = null;
  if (held !== null && typeof held === "object" && !Array.isArray(held)) {
    const to = held.to as number[] | undefined;
    if (Array.isArray(to) && to.length === 2 && to[0] === tx && to[1] === ty && held.path && held.path.length) {
      const p = held.path.map((q) => [q[0]!, q[1]!] as Pt);
      const wx = r.where.x, wy = r.where.y;
      if (Math.max(Math.abs(p[0]![0] - wx), Math.abs(p[0]![1] - wy)) === 1) {
        hold(r, tx, ty, p, steps);
        return followPath(r, p, steps);
      }
    }
  }
  for (let n = 0; n < steps; n++) {
    const wx = r.where.x, wy = r.where.y;
    if (wx === tx && wy === ty) return true;
    const dx = Number(tx > wx) - Number(tx < wx);
    const dy = Number(ty > wy) - Number(ty < wy);
    const forward: Pt[] = [];
    if (dx && dy) forward.push([wx + dx, wy + dy]);
    if (dx) forward.push([wx + dx, wy]);
    if (dy) forward.push([wx, wy + dy]);
    const keyed = forward.map((q) => ({ q, k: W.walkCost(w, q[0], q[1]) || 99 }));
    keyed.sort((a, b) => a.k - b.k);
    let moved = false;
    for (const { q: [cx, cy] } of keyed) {
      if (W.passable(w, cx, cy)) {
        r.where.x = cx; r.where.y = cy;
        moved = true;
        break;
      }
    }
    if (!moved) {
      const p = path(w, wx, wy, tx, ty);
      if (p === null) return false;
      hold(r, tx, ty, p, steps - n);
      return followPath(r, p, steps - n);
    }
  }
  return r.where.x === tx && r.where.y === ty;
}

export function setOff(w: W.World, r: Res, budget: number | null = null): [number, number, number] | null {
  let b0 = budget === null ? R.engine.steps_per_phase! * r.mobility : budget;
  if (r.where.mode !== "in") return [r.where.x, r.where.y, Math.max(1, Math.trunc(b0))];
  const unit = unitOf(w, r);
  if (unit === null) return null;
  const b = w.buildings[String(unit.building)]!;
  b0 -= unit.floor * R.engine.stair_step! * W.stairMult(w, b);
  if (b0 <= 0) return null;
  return [b.door[0], b.door[1], Math.max(1, Math.trunc(b0))];
}

export function goTo(
  w: W.World, r: Res, c: Cand,
  opts: { route?: boolean; sure?: boolean; budget?: number | null } = {},
): boolean {
  r.where.fixture = null;
  const off = setOff(w, r, opts.budget ?? null);
  if (off === null) return false;
  const [sx, sy, budget] = off;
  if (r.where.mode === "in") {
    const unit = unitOf(w, r)!;
    r.where = { mode: "at", unit: unit.id, x: sx, y: sy, fixture: null };
  }
  let arrived: boolean;
  if (opts.sure) arrived = routeWalk(w, r, c.x, c.y, w.width * w.height);
  else if (opts.route || c.duty) arrived = routeWalk(w, r, c.x, c.y, budget);
  else arrived = walk(w, r, c.x, c.y, budget);
  if (!arrived) return false;
  if (c.kind === "home") {
    r.where.mode = "in";
    r.where.unit = c.unit!.id;
  }
  return true;
}
