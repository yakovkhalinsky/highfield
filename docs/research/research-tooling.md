# Research tooling → measuring and comparing runs

Tools for studying Highfield as an experiment. Part of the
[November 2026 review](review-2026-11-roadmap.md). Each tool is marked
**grounded** (builds on something in the repo), **partly grounded** or
**speculative**.

---

| Id | Tool | Basis in the repo (observed) | Status | Effort |
|---|---|---|---|---|
| T1 | Metrics graphs over time (population, `unhappy`, wet days, errands, fixture wear) | `src/view/runner.ts` keeps 64 day books with a `uses` counter | Grounded | S–M |
| T2 | Headless seed sweeps exported as CSV or JSON | `scripts/balance.ts` runs eight seeds for three years with chooser `HOOKS` | Grounded | S |
| T3 | Side-by-side run comparison (seed A against B, or rules A against B) | Seeds are deterministic, but the browser holds one seed per tab | Partly grounded: easiest offline on T2's output | M |
| T4 | Experiment toggles (rule overrides, e.g. affinity decay on or off) | Knobs live in `src/sim/rules.json`, but saves are checked against the rules, so an override would replant the estate | Speculative: needs a rules-variant id | M |
| T5 | Full replay or rewind | Determinism makes re-simulating from day 1 possible; there are no snapshots | Speculative | L |
| T6 | Longer history buffer | `KEEP_BOOKS` in `runner.ts` | Grounded; IndexedDB size trade-off | S |

T1 and T6 feed the [timeline scrubber (V9)](observability-and-visuals.md).
T2 is the cheapest way to check whether the
[mechanics](emergent-mechanics.md) actually produce new dynamics.
