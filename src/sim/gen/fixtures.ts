/**
 * Benches, lamps, trees, and the places a need can be met —
 * the fixture half of apps/estate/estate/gen.py.
 */
import { idivmod, pyRound, range } from "../../py/num.ts";
import { R } from "../rules.ts";
import * as W from "../world.ts";
import { key, type Ground } from "./layout.ts";

type P = readonly [number, number];

function walkOf(site: string): number | null {
  return R.sites[site]!.walk;
}

/** Can a walker get from one passable cell to another within `limit` steps? */
export function reachable(cells: W.Cell[][], start: P, goal: P, limit: number): boolean {
  if (start[0] === goal[0] && start[1] === goal[1]) return true;
  const seen = new Set<string>([key(start[0], start[1])]);
  let frontier: P[] = [start];
  for (let i = 0; i < limit; i++) {
    const nxt: P[] = [];
    for (const [x, y] of frontier) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const px = x + dx;
        const py = y + dy;
        if (seen.has(key(px, py))) continue;
        if (!(0 <= px && px < cells[0]!.length && 0 <= py && py < cells.length)) continue;
        if (px === goal[0] && py === goal[1]) return true;
        if (walkOf(cells[py]![px]!.site) === null) continue;
        seen.add(key(px, py));
        nxt.push([px, py]);
      }
    }
    frontier = nxt;
  }
  return false;
}

function checkReach(st: W.World, cells: W.Cell[][], buildings: W.Building[]): void {
  const scan = R.engine.scan!;
  const doors = buildings.map((b) => b.door);
  for (const [need, spec] of Object.entries(R.needs)) {
    if (spec.from === "noise") continue;
    const goals: P[] = Object.values(st.fixtures)
      .filter((f) => R.fixtures[f.kind]!.affords[need])
      .map((f) => [f.x, f.y]);
    if (!goals.length) {
      throw new RangeError(
        `this plan places nothing that affords '${need}' — the need is in the law and nothing in ` +
          `the estate can meet it`,
      );
    }
    for (const d of doors) {
      if (!goals.some((gl) => reachable(cells, d, gl, scan))) {
        throw new RangeError(
          `the door at (${d[0]}, ${d[1]}) cannot reach anywhere affording '${need}' within ${scan} ` +
            `steps — nobody in that building can meet it, whatever they choose`,
        );
      }
    }
  }
}

function checkOlder(st: W.World, buildings: W.Building[]): void {
  const f = R.families;
  if (!f) return;
  const doors = buildings.map((b) => b.door);
  for (const kind of f.older_places) {
    const spots = Object.values(st.fixtures).filter((x) => x.kind === kind).map((x) => [x.x, x.y] as P);
    if (!spots.length) continue;
    for (const d of doors) {
      const near = Math.min(...spots.map(([x, y]) => Math.abs(x - d[0]) + Math.abs(y - d[1])));
      if (near > f.older_range) {
        throw new RangeError(
          `the door at (${d[0]}, ${d[1]}) is ${near} cells from the nearest ${kind}, past ` +
            `families.older_range (${f.older_range}) — the 10-15s there could never go to one`,
        );
      }
    }
  }
}

export function placeFixtures(ground: Ground): void {
  const {
    st, cells, rng, w, h, rw, cy0, cy1, cx0, cx1, mid, buildings,
    shopB, playAt, clear, schoolB, reserved, stopAt,
  } = ground;
  const g = R.gen;

  // --- the fixtures
  st.fixtures = {};
  const taken = new Set<string>();

  const place = (kind: string, x: number, y: number): W.Fixture | null => {
    if (!(0 <= x && x < w && 0 <= y && y < h)) return null;
    if (taken.has(key(x, y))) return null;
    if (walkOf(cells[y]![x]!.site) === null && kind !== "shop") return null;
    const fid = st.next_id; st.next_id += 1;
    const f = W.newFixture(fid, kind, x, y);
    st.fixtures[String(fid)] = f;
    taken.add(key(x, y));
    return f;
  };

  if (playAt) place("playground", playAt[0], playAt[1]);
  if (schoolB) {
    const gt = schoolB.gate as [number, number];
    place("school", gt[0], gt[1]);
  }
  if (stopAt) place("bus_stop", stopAt[0], stopAt[1]);

  const free = (x: number, y: number): boolean =>
    0 <= x && x < w && 0 <= y && y < h && !taken.has(key(x, y)) && walkOf(cells[y]![x]!.site) !== null;

  let edge: P[] = [];
  for (const y of [cy0 - 1, cy1 + 1]) for (let x = cx0; x <= cx1; x++) if (free(x, y)) edge.push([x, y]);
  rng.shuffle(edge);
  edge = edge.filter(([x, y]) => !reserved.has(key(x, y)) && !clear.has(key(x, y)));
  const inner: P[] = [];
  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0 + 1; x < cx1; x++) if (free(x, y) && !clear.has(key(x, y))) inner.push([x, y]);
  }
  rng.shuffle(inner);

  const plan: [string, P[]][] = [
    ["bench", edge.slice(0, g.benches)],
    ["lamp", edge.slice(g.benches, g.benches + g.lamps)],
    ["table", inner.slice(0, g.tables)],
  ];
  for (const [kind, spots] of plan) for (const [x, y] of spots) place(kind, x, y);

  // trees on the open lawns
  let planted = 0;
  let tries = 0;
  while (planted < g.trees && tries < 400) {
    tries += 1;
    const x = rng.randrange(w);
    const y = rng.randrange(h);
    if (cells[y]![x]!.site !== "lawn" || taken.has(key(x, y)) || clear.has(key(x, y))) continue;
    let near = false;
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) if ((dx || dy) && taken.has(key(x + dx, y + dy))) near = true;
    }
    if (near) continue;
    if (place("tree", x, y)) planted += 1;
  }

  // --- benches along the perimeter footpath
  const perimeterBenches = g.perimeter_benches ?? 0;
  if (perimeterBenches) {
    const e = rw * 2;
    const farX = w - rw * 2 - 1;
    const farY = h - rw * 2 - 1;
    const sides: Record<string, [P[], (p: P) => number]> = {
      top: [range(e + 1, farX).map((x) => [x, e] as P), (p) => p[0]],
      bottom: [range(e + 1, farX).map((x) => [x, farY] as P), (p) => p[0]],
      left: [range(e + 2, farY - 1).map((y) => [e, y] as P), (p) => p[1]],
      right: [range(e + 2, farY - 1).map((y) => [farX, y] as P), (p) => p[1]],
    };
    const order = ["top", "bottom", "left", "right"] as const;
    const [base, extra] = idivmod(perimeterBenches, order.length);
    const chosen: P[] = [];
    order.forEach((s, i) => {
      const want = base + (i < extra ? 1 : 0);
      const [cands, k] = sides[s]!;
      const spots = cands.filter(([x, y]) => free(x, y));
      spots.sort((a, b) => k(a) - k(b)); // stable, as sorted() is
      if (spots.length < want) {
        throw new RangeError(
          `the recipe asks for ${perimeterBenches} perimeter benches but the ${s} side holds only ` +
            `${spots.length} free spots beside the path — widen the plan or lower gen.perimeter_benches`,
        );
      }
      for (let j = 0; j < want; j++) {
        const t = want > 1 ? j / (want - 1) : 0.5;
        chosen.push(spots[pyRound(t * (spots.length - 1))]!);
      }
    });
    if (chosen.length !== perimeterBenches) {
      throw new RangeError(
        `the recipe asks for ${perimeterBenches} perimeter benches but this plan holds only ` +
          `${chosen.length} free spots beside the path — widen the plan or lower gen.perimeter_benches`,
      );
    }
    for (const [x, y] of chosen) {
      const f = place("bench", x, y);
      if (f) f.perimeter = true;
    }
  }

  if (shopB) place("shop", shopB.door[0], shopB.door[1]);

  // The recipe is a promise: fewer than it asks fails loudly.
  const got: Record<string, number> = {};
  for (const f of Object.values(st.fixtures)) got[f.kind] = (got[f.kind] ?? 0) + 1;
  const asked: Record<string, number> = {
    bench: g.benches + perimeterBenches, lamp: g.lamps, table: g.tables, tree: g.trees,
    playground: playAt ? g.playgrounds : 0, shop: shopB ? 1 : 0,
    school: schoolB ? 1 : 0, bus_stop: stopAt ? 1 : 0,
  };
  const short = Object.entries(asked).filter(([k, v]) => (got[k] ?? 0) !== v);
  if (short.length) {
    throw new RangeError(
      `the recipe asks for more than this plan can hold: ` +
        `${short.map(([k, v]) => `${k}: (${v}, ${got[k] ?? 0})`).join(", ")} (asked, placed) — ` +
        `widen the plan or lower the recipe`,
    );
  }

  checkReach(st, cells, buildings);
  checkOlder(st, buildings);
}
