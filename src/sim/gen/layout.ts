/**
 * The plan: roads, courtyard, blocks, and the buildings that stand on them —
 * the first half of apps/estate/estate/gen.py.
 */
import { ifloordiv } from "../../py/num.ts";
import type { PyRandom } from "../../py/random.ts";
import { R } from "../rules.ts";
import * as W from "../world.ts";

export const BLOCK_NAMES = ["Ash", "Elm", "Lime", "Maple", "Willow", "Hawthorn"] as const;

/** the largest side a plan may have */
export const MAX_SIDE = 200;

type P = readonly [number, number];
export const key = (x: number, y: number): string => `${x},${y}`;

function rect(cells: W.Cell[][], x0: number, y0: number, x1: number, y1: number, site: string): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (0 <= y && y < cells.length && 0 <= x && x < cells[0]!.length) cells[y]![x] = W.newCell(site);
    }
  }
}

function ring(x0: number, y0: number, x1: number, y1: number): string[] {
  const out: string[] = [];
  for (let y = y0 - 1; y < y1 + 2; y++) for (let x = x0 - 1; x < x1 + 2; x++) out.push(key(x, y));
  return out;
}

/** What `layOut` leaves for the fixtures and the first households. */
export interface Ground {
  st: W.World;
  cells: W.Cell[][];
  rng: PyRandom;
  w: number;
  h: number;
  rw: number;
  cy0: number;
  cy1: number;
  cx0: number;
  cx1: number;
  mid: number;
  buildings: W.Building[];
  shopB: W.Building | null;
  playAt: P | null;
  clear: Set<string>;
  schoolB: W.Building | null;
  reserved: Set<string>;
  stopAt: P | null;
}

export function layOut(seed: number, width?: number | null, height?: number | null): Ground {
  // Python's seed and sizes are ints; here they must be integers JS holds
  // exactly, or the rng key (`${seed}:0:gen`) and the plan would differ.
  if (!Number.isSafeInteger(seed)) throw new RangeError(`seed must be a whole number within ±(2^53 − 1), not ${seed}`);
  const w = width == null ? R.world.width : width;
  const h = height == null ? R.world.height : height;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h)) throw new RangeError(`sizes must be whole numbers, not ${w}×${h}`);
  const rng: PyRandom = W.rngFor(seed, 0, "gen");
  const g = R.gen;
  if (w <= 0 || h <= 0) throw new RangeError("sizes must be positive");
  if (w > MAX_SIDE || h > MAX_SIDE) {
    throw new RangeError(
      `at most ${MAX_SIDE}×${MAX_SIDE}: the page and the search are sized for a neighbourhood, not a city`,
    );
  }
  const st = W.newState(seed, w, h);
  st.biome = "estate";
  const cells: W.Cell[][] = [];
  for (let y = 0; y < h; y++) {
    const row: W.Cell[] = [];
    for (let x = 0; x < w; x++) row.push(W.newCell("lawn"));
    cells.push(row);
  }

  // --- the ring road
  const rw = g.road_width;
  rect(cells, rw, rw, w - rw - 1, rw + rw - 1, "road");
  rect(cells, rw, h - rw - rw, w - rw - 1, h - rw - 1, "road");
  rect(cells, rw, rw, rw + rw - 1, h - rw - 1, "road");
  rect(cells, w - rw - rw, rw, w - rw - 1, h - rw - 1, "road");

  // --- the courtyard
  const layout = g.layout ?? "quad";
  let cy0 = ifloordiv(h, 2) - 2;
  if (layout === "row") cy0 = Math.min(cy0, rw + rw + g.block_gap + 6 + 1);
  const cy1 = cy0 + 3;
  const cx0 = rw + 6;
  const cx1 = w - rw - 7;
  rect(cells, cx0, cy0, cx1, cy1, "paved");

  // --- the blocks
  const bw = 12;
  const bh = 6;
  const gap = g.block_gap;
  const blocks: [number, number][] = [];
  if (layout === "row") {
    const n = g.blocks;
    const span = n * bw + Math.max(0, n - 1) * gap;
    const bx = ifloordiv(w - span, 2);
    const by = rw + rw + gap;
    if (bx < rw * 2 || bx + span > w - rw * 2 || by + bh > h - rw * 2) {
      throw new RangeError(
        `the recipe asks for ${n} blocks in a row ${span} cells wide but this ${w}×${h} plan's ` +
          `inner ground is only ${Math.max(0, w - 4 * rw)} wide — widen the plan or lower gen.blocks`,
      );
    }
    for (let i = 0; i < n; i++) blocks.push([bx + i * (bw + gap), by]);
  } else if (layout === "quad") {
    const byTop = rw + rw + gap;
    const byBot = h - rw - rw - bh - gap;
    const bxLeft = rw + rw + gap;
    const bxRight = w - rw - rw - bw - gap - 1;
    for (const [bx, by] of [[bxLeft, byTop], [bxRight, byTop], [bxLeft, byBot], [bxRight, byBot]] as const) {
      if (bx + bw >= w - rw || by + bh >= h - rw || bx < rw || by < rw) continue;
      blocks.push([bx, by]);
    }
  } else {
    throw new RangeError(`gen.layout is '${layout}' — expected 'row' or 'quad'`);
  }
  if (blocks.length !== g.blocks) {
    throw new RangeError(
      `the recipe asks for ${g.blocks} blocks in a ${layout} but this plan holds ${blocks.length} — ` +
        `widen the plan or lower gen.blocks`,
    );
  }

  st.buildings = {};
  st.units = {};
  const buildings: W.Building[] = [];
  blocks.forEach(([bx, by], n) => {
    rect(cells, bx, by, bx + bw - 1, by + bh - 1, "building");
    const floors = rng.randint(g.block_floors[0], g.block_floors[1]);
    const per = rng.randint(g.units_per_floor[0], g.units_per_floor[1]);
    const door: P = by < ifloordiv(h, 2)
      ? [bx + ifloordiv(bw, 2), by + bh]
      : [bx + ifloordiv(bw, 2), by - 1];
    const bid = st.next_id; st.next_id += 1;
    const b = W.newBuilding(bid, `${BLOCK_NAMES[n % BLOCK_NAMES.length]} Block`, "block", bx, by, bw, bh, floors, door);
    for (let f = 1; f <= floors; f++) {
      for (let k = 0; k < per; k++) {
        const uid = st.next_id; st.next_id += 1;
        const u = W.newUnit(uid, bid, f, rng.choice([2, 2, 3, 4]));
        st.units[String(uid)] = u;
        b.units.push(uid);
      }
    }
    st.buildings[String(bid)] = b;
    buildings.push(b);
    const edge = by < ifloordiv(h, 2) ? cy1 : cy0;
    rect(cells, door[0], Math.min(door[1], edge), door[0], Math.max(door[1], edge), "path");
  });

  // --- the perimeter footpath
  if (g.perimeter_path) {
    const inner = rw * 2 + 1;
    const farX = w - rw * 2 - 2;
    const farY = h - rw * 2 - 2;
    rect(cells, inner, inner, farX, inner, "path");
    rect(cells, inner, farY, farX, farY, "path");
    rect(cells, inner, inner, inner, farY, "path");
    rect(cells, farX, inner, farX, farY, "path");
  }

  // --- the shop and the playground, apart, either side of the middle
  const mid = ifloordiv(cx0 + cx1, 2);
  const clear = new Set<string>();
  let shopB: W.Building | null = null;
  if (g.shop) {
    const sx = mid - 4;
    const sy = cy0;
    rect(cells, sx, sy, sx + 2, sy + 1, "building");
    const bid = st.next_id; st.next_id += 1;
    shopB = W.newBuilding(bid, "The Shop", "shop", sx, sy, 3, 2, 1, [sx + 1, sy + 2]);
    st.buildings[String(bid)] = shopB;
    for (const c of ring(sx, sy, sx + 2, sy + 1)) clear.add(c);
  }

  // --- the pond, and the playground
  if (g.pond) {
    const px = cx0;
    const py = cy1 - 1;
    rect(cells, px, py, px + 3, py + 1, "water");
  }
  let playAt: P | null = null;
  if (g.playgrounds) {
    const px = mid + 3;
    const py = cy0;
    rect(cells, px, py, px + 3, py + 1, "play");
    playAt = [px, py];
    for (const c of ring(px, py, px + 3, py + 1)) clear.add(c);
  }
  for (let y = cy0; y <= cy1; y++) for (let x = mid; x < mid + 2; x++) clear.add(key(x, y));

  // --- the school, and the way to the bus
  const reserved = new Set<string>();
  let schoolB: W.Building | null = null;
  if (g.school) {
    const sbw = 7;
    const sbh = 4;
    const yw = 6;
    const sx = mid - sbw + 1;
    const sy = cy1 + 3;
    const far = h - rw * 2 - 2;
    if (sy + sbh > far || sx + sbw + yw > w - rw * 2 - 2 || sx < rw * 2) {
      throw new RangeError(
        `the recipe asks for a school but this ${w}×${h} plan has no room for it south of the ` +
          `courtyard — widen the plan or set gen.school to False`,
      );
    }
    rect(cells, sx, sy, sx + sbw - 1, sy + sbh - 1, "building");
    rect(cells, sx + sbw, sy, sx + sbw + yw - 1, sy + sbh - 1, "yard");
    const door: P = [sx + ifloordiv(sbw, 2), sy - 1];
    const gate: P = [sx + sbw, sy - 1];
    const bid = st.next_id; st.next_id += 1;
    schoolB = W.newBuilding(bid, "Highfield School", "school", sx, sy, sbw, sbh, 2, door);
    schoolB.yard = [sx + sbw, sy, yw, sbh];
    schoolB.gate = [gate[0], gate[1]];
    st.buildings[String(bid)] = schoolB;
    rect(cells, door[0], cy1 + 1, door[0], door[1], "path");
    rect(cells, door[0], door[1], gate[0], gate[1], "path");
    reserved.add(key(door[0], cy1 + 1));
  }
  let stopAt: P | null = null;
  if (g.bus_stop) {
    const far = h - rw * 2 - 2;
    const bx = buildings[buildings.length - 1]!.door[0];
    for (let y = cy1 + 1; y < far; y++) {
      const site = cells[y]![bx]!.site;
      if (site !== "lawn" && site !== "path") {
        throw new RangeError(
          `the bus stop's path down x=${bx} meets '${site}' at y=${y} — the plan has no clear way ` +
            `from the blocks to the road`,
        );
      }
    }
    rect(cells, bx, cy1 + 1, bx, far - 1, "path");
    reserved.add(key(bx, cy1 + 1));
    stopAt = [bx, far + 1];
  }

  return {
    st, cells, rng, w, h, rw, cy0, cy1, cx0, cx1, mid, buildings,
    shopB, playAt, clear, schoolB, reserved, stopAt,
  };
}
