/** Wear and puddles on the estate grid — Highfield realism. */
import { R } from "../rules.ts";
import * as W from "../world.ts";
import { wetness } from "./weather.ts";

/** Soften or raise puddles from the wet streak; dry days drain them. */
export function updatePuddles(w: W.World): void {
  const wet = wetness(w);
  const step = R.engine.puddle_wet ?? 0.12;
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      const c = w.cells[y]![x]!;
      if (c.site === "water" || c.site === "building") {
        c.puddle = 0;
        continue;
      }
      if (wet > 0) c.puddle = Math.min(1.0, (c.puddle ?? 0) + step * wet);
      else c.puddle = Math.max(0.0, (c.puddle ?? 0) - step * 0.5);
    }
  }
}

/** Footfall wear from people outdoors today. */
export function updateWear(w: W.World): void {
  const step = R.engine.wear_step ?? 0.004;
  for (const r of Object.values(w.residents)) {
    if (r.where.mode === "in" || r.where.mode === "away") continue;
    const c = W.cellAt(w, r.where.x, r.where.y);
    if (c === null || c.site === "water" || c.site === "building") continue;
    c.wear = Math.min(1.0, (c.wear ?? 0) + step);
  }
}
