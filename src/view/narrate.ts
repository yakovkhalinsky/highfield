/**
 * The chronicle and the watcher's why, without a model.
 *
 * In apps/estate a model writes both: a paragraph over each run of days
 * (chronicler.py) and one sentence on why the watcher sent what it sent
 * (watcher.why_prompt). The browser has no model, so this module writes
 * them from templates — and the rule a model was given is the rule here,
 * kept by construction rather than by asking nicely:
 *
 *   - Only what happened. Every sentence is sifted out of the run's own
 *     events, its daybooks, or the world as it stands. A template whose
 *     fact is not there (no deaths, no sold-out shop, nobody fraying) is
 *     not on the menu that day; for the why, the pack's own line always is.
 *   - Nobody invented. Every name is a name an event or a resident
 *     carries; a template that names nobody says "a family", never "Ada".
 *   - No repeats. Each template has an id, the last few ids used are
 *     remembered (and saved with the estate), and a remembered one is
 *     only reused when nothing else fits; and no chronicle entry is word
 *     for word an entry the estate still keeps.
 *
 * The choice among fitting templates is the seed's: `rngFor(seed, day,
 * "chronicle")` and `rngFor(seed, day, "watch:why")`, generators of their
 * own that the world never draws from, so the words never change the
 * estate they describe.
 *
 * The chronicle is narrate/chronicle.ts, the why is narrate/watchWhy.ts,
 * and the shared pick and memory are narrate/shared.ts.
 */
export { MEMORY, count, list, pick } from "./narrate/shared.ts";
export type { Memory, Option } from "./narrate/shared.ts";
export { chronicle } from "./narrate/chronicle.ts";
export type { Stretch } from "./narrate/chronicle.ts";
export { facts, why, whyOptions } from "./narrate/watchWhy.ts";
export type { Facts } from "./narrate/watchWhy.ts";
