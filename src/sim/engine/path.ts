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

// path()'s stamp scratch — kept so the wrap test still has something to
// exercise; routing itself is pathMap's Dijkstra over walkCost.
let mark = new Int32Array(0);
let stamp = 0;

/** For the tests: put the stamp where it is about to wrap (0x7fffffff),
 * which otherwise takes two billion searches to reach. */
export function setPathStamp(n: number): void {
  stamp = n;
}

/** Cost to step onto (x,y). Targets may be impassable (a door cell). */
function stepCost(w: W.World, x: number, y: number, isTarget: boolean): number | null {
  const c = W.walkCost(w, x, y);
  if (c !== null) return c;
  return isTarget ? 0 : null;
}

/**
 * Cost-aware eight-way search. Prefer path (1) over lawn (2) over road (4).
 * Delegates to pathMap so both stay in lockstep.
 */
export function path(w: W.World, sx: number, sy: number, tx: number, ty: number): Pt[] | null {
  const size = (w.width + 4) * (w.height + 4);
  if (mark.length < size) {
    mark = new Int32Array(size);
    stamp = 0;
  }
  if (++stamp === 0x7fffffff) {
    mark.fill(0);
    stamp = 1;
  }
  const x = Math.max(-1, Math.min(w.width, sx));
  const y = Math.max(-1, Math.min(w.height, sy));
  mark[ck(w, x, y)] = stamp;
  return pathMap(w, sx, sy, tx, ty);
}

export function pathMap(w: W.World, sx: number, sy: number, tx: number, ty: number): Pt[] | null {
  if (sx === tx && sy === ty) return [];
  const key = (x: number, y: number) => `${x},${y}`;
  const came = new Map<string, Pt | null>();
  const dist = new Map<string, number>();
  const sk = key(sx, sy);
  came.set(sk, null);
  dist.set(sk, 0);
  type Node = { c: number; x: number; y: number; s: number };
  const heap: Node[] = [];
  let nseq = 0;
  const push = (c: number, x: number, y: number) => {
    const node = { c, x, y, s: ++nseq };
    let i = heap.length;
    heap.push(node);
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pn = heap[p]!;
      if (pn.c < c || (pn.c === c && pn.s <= node.s)) break;
      heap[i] = pn; i = p;
    }
    heap[i] = node;
  };
  const pop = (): Node | null => {
    if (!heap.length) return null;
    const out = heap[0]!;
    const last = heap.pop()!;
    if (!heap.length) return out;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      if (l >= heap.length) break;
      let m = l;
      if (r < heap.length) {
        const ln = heap[l]!, rn = heap[r]!;
        if (rn.c < ln.c || (rn.c === ln.c && rn.s < ln.s)) m = r;
      }
      const mn = heap[m]!;
      if (last.c < mn.c || (last.c === mn.c && last.s <= mn.s)) break;
      heap[i] = mn; i = m;
    }
    heap[i] = last;
    return out;
  };
  push(0, sx, sy);
  while (heap.length) {
    const cur = pop()!;
    const ck0 = key(cur.x, cur.y);
    if (cur.c !== dist.get(ck0)) continue;
    if (cur.x === tx && cur.y === ty) {
      const out: Pt[] = [];
      let n: Pt = [tx, ty];
      while (!(n[0] === sx && n[1] === sy)) {
        out.push(n);
        n = came.get(key(n[0], n[1]))!;
      }
      out.reverse();
      return out;
    }
    for (const [ox, oy] of STEPS) {
      const nx = cur.x + ox, ny = cur.y + oy;
      const isT = nx === tx && ny === ty;
      const step = stepCost(w, nx, ny, isT);
      if (step === null) continue;
      const nc = cur.c + step;
      const nk = key(nx, ny);
      if (!dist.has(nk) || nc < dist.get(nk)!) {
        dist.set(nk, nc);
        came.set(nk, [cur.x, cur.y]);
        push(nc, nx, ny);
      }
    }
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
