/**
 * The first households — the last draws of apps/estate/estate/gen.py.
 * `day` is still 0 here, as it was before generate set it to 1.
 */
import type { PyRandom } from "../../py/random.ts";
import { moveIn } from "../engine/households.ts";
import { R } from "../rules.ts";
import type * as W from "../world.ts";

export function populate(st: W.World, buildings: W.Building[], rng: PyRandom): void {
  const g = R.gen;
  st.households = {};
  st.residents = {};
  const units: number[] = [];
  for (const b of buildings) for (const u of b.units) if (st.units[String(u)]!.floor <= 4) units.push(u);
  rng.shuffle(units);
  const founding: string[] = [];
  for (const [kind, n] of Object.entries(g.founding)) for (let i = 0; i < n; i++) founding.push(kind);
  rng.shuffle(founding);
  for (const kind of founding) {
    if (!units.length) break;
    moveIn(st, kind, st.units[String(units.pop())]!, rng);
  }
  for (let i = 0; i < g.waiting; i++) st.waiting.push({ kind: rng.choice(R.pop.roster) });

  for (const b of buildings) rng.shuffle(b.units);
}
