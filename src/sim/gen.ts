/**
 * Seeded, deterministic estate generation — apps/estate/estate/gen.py.
 *
 * Every draw comes from (seed, 0, "gen") in the same order as the Python,
 * so the same seed plants the same estate, cell for cell and name for
 * name. The parity test holds it to that. Sets of cells are keyed "x,y";
 * gen's sets are only ever asked for membership, never iterated.
 *
 * The plan is gen/layout.ts, the fixtures gen/fixtures.ts, and the first
 * households gen/populate.ts. This module runs them in that order.
 */
import { layOut } from "./gen/layout.ts";
import { placeFixtures } from "./gen/fixtures.ts";
import { populate } from "./gen/populate.ts";
import type * as W from "./world.ts";

export { BLOCK_NAMES, MAX_SIDE } from "./gen/layout.ts";
export { reachable } from "./gen/fixtures.ts";

export function generate(seed: number, width?: number | null, height?: number | null): W.World {
  const ground = layOut(seed, width, height);
  placeFixtures(ground);
  ground.st.cells = ground.cells;
  populate(ground.st, ground.buildings, ground.rng);
  ground.st.day = 1;
  return ground.st;
}
