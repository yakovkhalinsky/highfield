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

export function needReference(): void {
  if (!existsSync(join(ESTATE, "tools/parity.py"))) {
    throw new Error(`no Python estate at ${ESTATE}: run \`npm run reference\`, or set LLM_WORLD to an llm-world checkout`);
  }
}
