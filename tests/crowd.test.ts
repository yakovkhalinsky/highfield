/**
 * The page's crowd and walk, loaded as the browser loads them (classic
 * scripts on a shared global). Bench facing, seating, table facing and a
 * short walk are facts the 3D view depends on — covered here without WebGL.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

type WalkApi = {
  buildGrid: (ground: Ground, opts?: object) => Grid;
  findPath: (grid: Grid, sx: number, sy: number, tx: number, ty: number) => Int16Array | null;
  straight: (sx: number, sz: number, tx: number, tz: number) => Route;
  sample: (route: Route, t: number, out: Sample) => Sample;
  duration: (total: number, dayMs: number) => number;
  pack: (rs: number[], cx: number, cz: number, opts: object) => { xs: number[]; zs: number[] } | null;
  WALK_CPS: number;
};
type CrowdApi = {
  R: number;
  SEAT_STEP: number;
  bench: (ground: Ground, f: Fixture) => Bench;
  benchFacing: (ground: Ground, f: Fixture) => { fx: number; fz: number; yaw: number };
  fixtureMap: (fixtures: Fixture[]) => Record<string, Fixture>;
  place: (Walk: WalkApi, grid: Grid, people: Person[], benches: Record<string, Bench>, fixAt: Record<string, Fixture> | null) => Place;
  faceTable: (fixAt: Record<string, Fixture>, hx: number, hy: number, x: number, z: number) => number | null;
  lift: (steps: Step[], x: number, z: number) => number;
  steps: (ground: Ground, fixtures: Fixture[]) => Step[];
  fit: (delay: number, dur: number, dayMs: number) => { delay: number; dur: number };
  QUEUE_MS: number;
};
type Ground = {
  width: number; height: number;
  codes: string[]; rows: number[][];
  walk?: Record<string, number | null>;
};
type Grid = { W: number; H: number; solid: Uint8Array };
type Fixture = { id: number; kind: string; x: number; y: number; cap?: number; perimeter?: boolean };
type Bench = { key: string; id: number; x: number; z: number; fx: number; fz: number; yaw: number; cap: number; cx: number; cy: number };
type Person = { id: number; x: number; y: number; in?: boolean; role?: string; fixture?: number | null };
type Place = { x: number[]; z: number[]; sit: number[]; fx: number[]; fz: number[]; seated: number; with: number[] };
type Route = { xs: number[]; zs: number[]; n: number; total: number };
type Sample = { x: number; z: number; dx: number; dz: number; moving: boolean };
type Step = { x0: number; z0: number; x1: number; z1: number; h: number };

function loadScript(file: string, sandbox: vm.Context) {
  const code = readFileSync(resolve(root, file), "utf8");
  vm.runInContext(code, sandbox, { filename: file });
}

function loadApis(): { Walk: WalkApi; Crowd: CrowdApi } {
  const sandbox = vm.createContext({
    globalThis: {},
    module: { exports: {} },
    exports: {},
    console,
  });
  sandbox.globalThis = sandbox;
  loadScript("page3d/shared/walk.js", sandbox);
  loadScript("page3d/estate/crowd.js", sandbox);
  const Walk = sandbox.EstateWalk as WalkApi;
  const Crowd = (sandbox.EstateCrowd || sandbox.module.exports) as CrowdApi;
  expect(Walk?.buildGrid).toBeTypeOf("function");
  expect(Crowd?.place).toBeTypeOf("function");
  return { Walk, Crowd };
}

/** Tiny open yard: path on the south of a bench cell, lawn elsewhere. */
function yard(): Ground {
  const codes = ["lawn", "path", "building", "water"];
  const W = 5, H = 5;
  const rows = Array.from({ length: H }, () => Array(W).fill(0));
  for (let x = 0; x < W; x++) rows[3]![x] = 1; // path row
  return {
    width: W, height: H, codes, rows,
    walk: { lawn: 1, path: 1, building: null, water: null },
  };
}

const { Walk, Crowd } = loadApis();

describe("EstateCrowd + EstateWalk", () => {
  it("faces a bench toward the neighbouring path", () => {
    const g = yard();
    const f = { id: 1, kind: "bench", x: 2, y: 2, cap: 2 }; // north of path row 3
    const face = Crowd.benchFacing(g, f);
    expect(face).toEqual({ fx: 0, fz: 1, yaw: 0 });
    const b = Crowd.bench(g, f);
    expect(b.cap).toBe(2);
    expect(b.x).toBe(2.5);
    expect(b.z).toBe(2.5);
    expect(b.fz).toBe(1);
  });

  it("seats residents up to the bench cap and stands the rest clear", () => {
    const g = yard();
    const grid = Walk.buildGrid(g);
    const f = { id: 7, kind: "bench", x: 2, y: 2, cap: 2 };
    const benches = { "2,2": Crowd.bench(g, f) };
    const fixAt = Crowd.fixtureMap([f]);
    const people: Person[] = [
      { id: 1, x: 2, y: 2, fixture: 7 },
      { id: 2, x: 2, y: 2, fixture: 7 },
      { id: 3, x: 2, y: 2, fixture: 7 },
      { id: 4, x: 2, y: 2 }, // not a bench user
    ];
    const spots = Crowd.place(Walk, grid, people, benches, fixAt);
    expect(spots.seated).toBe(2);
    expect(spots.sit.filter((s) => s === 1)).toHaveLength(2);
    expect(spots.sit.filter((s) => s === 2).length).toBeGreaterThanOrEqual(1);
    /* sitters share the bench facing */
    for (let i = 0; i < people.length; i++) {
      if (spots.sit[i] === 1) {
        expect(spots.fz[i]).toBe(1);
        expect(Math.abs(spots.z[i]! - 2.5)).toBeLessThan(0.01);
      }
    }
    /* nobody stacked on the exact same spot */
    const keys = spots.x.map((x, i) => `${x.toFixed(3)},${spots.z[i]!.toFixed(3)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("turns a stander at a table to face its middle", () => {
    const fixAt = Crowd.fixtureMap([{ id: 3, kind: "table", x: 1, y: 1 }]);
    /* cell (1,1), standing east of the table centre (1.5, 1.5) */
    const yaw = Crowd.faceTable(fixAt, 1, 1, 2.2, 1.5);
    expect(yaw).toBeCloseTo(-Math.PI / 2, 5);
    expect(Crowd.faceTable(fixAt, 2, 2, 2.5, 2.5)).toBeNull();
  });

  it("routes around a solid and samples the walk to the end", () => {
    const g = yard();
    /* wall through the middle so the path must go around */
    g.rows[1]![2] = 2;
    g.rows[2]![2] = 2;
    const grid = Walk.buildGrid(g);
    const cells = Walk.findPath(grid, 0, 1, 4, 1);
    expect(cells).not.toBeNull();
    /* never steps on the building cells */
    for (let i = 0; i + 1 < cells!.length; i += 2) {
      const x = cells![i]!, y = cells![i + 1]!;
      expect(g.codes[g.rows[y]![x]!]).not.toBe("building");
    }
    const route = Walk.straight(0.5, 0.5, 3.5, 0.5);
    const out = { x: 0, z: 0, dx: 0, dz: 0, moving: false };
    Walk.sample(route, 0, out);
    expect(out.x).toBeCloseTo(0.5, 5);
    Walk.sample(route, route.total, out);
    expect(out.x).toBeCloseTo(3.5, 5);
    expect(out.moving).toBe(false);
  });

  it("fits a queued delay inside the day", () => {
    const dayMs = 60_000;
    const f = Crowd.fit(Crowd.QUEUE_MS * 3, dayMs * 0.9, dayMs);
    expect(f.delay + f.dur).toBeLessThanOrEqual(dayMs + 1e-6);
    expect(f.dur).toBeGreaterThan(0);
  });

  it("lifts feet onto a door step within FOOT, and not past the ramp", () => {
    const steps = [{ x0: 1, z0: 1, x1: 2, z1: 2, h: 0.06 }];
    expect(Crowd.lift(steps, 1.5, 1.5)).toBeCloseTo(0.06, 5);
    expect(Crowd.lift(steps, 10, 10)).toBe(0);
  });
});
