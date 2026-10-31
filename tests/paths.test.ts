/**
 * Footpaths preferred over roads; bus waits stay off the carriageway;
 * tables provisioned for a fuller estate.
 */
import { describe, expect, it } from "vitest";
import { stopSpots } from "../src/sim/engine/daytime.ts";
import { path, pathMap } from "../src/sim/engine/path.ts";
import { generate } from "../src/sim/gen.ts";
import { R } from "../src/sim/rules.ts";

describe("road vs path", () => {
  it("prices the carriageway above the footpath", () => {
    expect(R.sites.road!.walk!).toBeGreaterThan(R.sites.path!.walk!);
    expect(R.sites.road!.walk!).toBeGreaterThan(R.sites.lawn!.walk!);
  });

  it("routes around the road when a footpath ring exists", () => {
    const w = generate(3);
    // Two perimeter path cells on opposite sides — the short hop would cut
    // across road if costs were equal; with road=4 the ring should win.
    const paths: [number, number][] = [];
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        if (w.cells[y]![x]!.site === "path") paths.push([x, y]);
      }
    }
    expect(paths.length).toBeGreaterThan(10);
    const a = paths[0]!;
    const b = paths[Math.floor(paths.length / 2)]!;
    const route = path(w, a[0], a[1], b[0], b[1]);
    expect(route).not.toBeNull();
    const roads = route!.filter(([x, y]) => w.cells[y]![x]!.site === "road").length;
    const onPath = route!.filter(([x, y]) => w.cells[y]![x]!.site === "path").length;
    expect(onPath).toBeGreaterThan(roads);
  });

  it("keeps path() and pathMap() in lockstep", () => {
    const w = generate(3);
    const fixtures = Object.values(w.fixtures).slice(0, 6);
    for (let i = 0; i < fixtures.length; i++) {
      for (let j = i + 1; j < fixtures.length; j++) {
        const a = fixtures[i]!, b = fixtures[j]!;
        expect(path(w, a.x, a.y, b.x, b.y)).toEqual(pathMap(w, a.x, a.y, b.x, b.y));
      }
    }
  });
});

describe("bus wait spots", () => {
  it("never seats a waiter on the road", () => {
    for (const seed of [1, 3, 42]) {
      const w = generate(seed);
      for (const [x, y] of stopSpots(w)) {
        expect(w.cells[y]![x]!.site, `seed ${seed} at ${x},${y}`).not.toBe("road");
      }
    }
  });
});

describe("tables", () => {
  it("plants enough tables for a fuller estate", () => {
    expect(R.gen.tables).toBeGreaterThanOrEqual(5);
    expect(R.fixtures.table!.capacity!).toBeGreaterThanOrEqual(6);
    const w = generate(1);
    const tables = Object.values(w.fixtures).filter((f) => f.kind === "table");
    expect(tables.length).toBe(R.gen.tables);
  });
});

describe("trees stay inside the ring", () => {
  it("does not plant trees on the outer apron beyond the roads", () => {
    const w = generate(7);
    const rw = R.gen.road_width;
    for (const f of Object.values(w.fixtures)) {
      if (f.kind !== "tree") continue;
      expect(f.x).toBeGreaterThanOrEqual(rw + 1);
      expect(f.x).toBeLessThanOrEqual(w.width - rw - 2);
      expect(f.y).toBeGreaterThanOrEqual(rw + 1);
      expect(f.y).toBeLessThanOrEqual(w.height - rw - 2);
    }
  });
});
