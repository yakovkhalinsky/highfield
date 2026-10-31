/**
 * Where the reference lives: llm-world, the Python estate this port is held
 * to, at the commit pinned in reference.json. `npm run reference` (run
 * before `npm test`) fetches it into .reference/llm-world; CI checks it out
 * there itself. LLM_WORLD=/path/to/llm-world uses another checkout instead,
 * e.g. llm-world's main for the weekly upstream check.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..");
export const LLM_WORLD = resolve(ROOT, process.env.LLM_WORLD ?? ".reference/llm-world");
export const ESTATE = join(LLM_WORLD, "apps/estate");
/** page3d's two folders in llm-world, and where this repo vendors each. */
export const PAGE3D = [
  { from: join(ESTATE, "estate/page3d"), to: join(ROOT, "page3d/estate") },
  { from: join(LLM_WORLD, "apps/shared/page3d"), to: join(ROOT, "page3d/shared") },
];

/**
 * Highfield's visual fork of page3d: `world.js` plus its ES modules under
 * `world/`. Sync skips them; vendor tests only require that forked paths
 * still exist (and may be Highfield-only extras under `world/`).
 * Paths are relative to page3d/estate or page3d/shared.
 */
export const PAGE3D_VISUAL_FORK = new Set(["world.js"]);

/** True for `world.js` and any file under the Highfield-only `world/` tree. */
export function isVisualFork(rel: string): boolean {
  return rel === "world.js" || rel.startsWith("world/");
}

export function needReference(): void {
  if (!existsSync(join(ESTATE, "tools/parity.py"))) {
    throw new Error(`no Python estate at ${ESTATE}: run \`npm run reference\`, or set LLM_WORLD to an llm-world checkout`);
  }
}
