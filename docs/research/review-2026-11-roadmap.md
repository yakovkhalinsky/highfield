# Highfield review, November 2026 → roadmap

Review of `main` at **`4e1b362`** (1 Nov 2026), read-only. It builds on
[`game-systems-realism.md`](game-systems-realism.md). Companion docs:
[observability and visuals](observability-and-visuals.md) ·
[emergent mechanics](emergent-mechanics.md) ·
[research tooling](research-tooling.md).

Each section labels what is **observed** in the repo and what is
**proposed**.

---

## 1. Summary

Highfield already has a sound base for studying world systems: a
needs-based utility chooser, fixtures that advertise affordances, a
deterministic seeded day tick, and a chronicle that states only facts.
For an observer, the weak spot is **explanation**. Much of the state is
hidden or has no effect, and nothing on the page says why a resident
went where they did.

Order of work (proposed):

0. Fix the P0 work/holiday coupling.
1. Make every decision and event traceable: a why-log, follow-a-resident,
   lenses and event tags.
2. Add mechanics that feed back on each other (mood memory, affinity
   decay, cosmetic state that changes behaviour), so there is more
   emergence to watch.

**Top 3** (after the P0):
1. **Why-log + follow-a-resident** (M, high).
2. **Lenses + in-world event tags** (M, high).
3. **Mood as memory + affinity decay** (M, high).

---

## 2. Decided

**Highfield is watched, not played** (Yakov, 1 Nov 2026). It is a research
project for exploring world systems and mechanics. Recommendations favour
explainability and emergence. Anything that only serves player agency or
controls is dropped.

---

## 3. Current state (observed)

| Area | What's there |
|---|---|
| Runtime | Static Vite build. The sim runs in a Web Worker and saves to IndexedDB each day. Pace is 1 min, 20 s or 5 s per day, plus pause and step. `?seed=` resumes or plants an estate. |
| Determinism | Time, watcher and words all come from the seed (README "Time comes from the seed"). |
| Engine | `src/sim/engine/*`: needs, daytime, households, families, places, weather, trees, path, ground. |
| Needs | food, rest, company, play (children), quiet (from noise), with phase and weekend multipliers in `src/sim/rules.json`. |
| Fixtures | `bench`, `table`, `shop` and `playground` have `affords`. `lamp`, `tree`, `school` and `bus_stop` have empty `affords`. |
| Social and mood | Affinity only rises (`bumpAffinity`, `affinity_gain` 0.15, `src/sim/engine/needs.ts`). Household `unhappy` decays at `unhappy_decay` 0.97 (`households.ts`). |
| History kept | `src/view/runner.ts` keeps the last 400 events and 64 day books (`KEEP_BOOKS`). The chronicle keeps 40 entries. |
| Instrumentation | `scripts/balance.ts` runs eight estates for three years headless. `HOOKS` in `src/sim/engine/residents.ts` observe the chooser without changing anything. |
| Rendering and HUD | Vendored page3d (Three.js) plus Highfield's `world.js` visual fork. A chronicle/people/days feed, pace and phase controls, and a click-to-inspect card. |

**P0 bug (observed):** `shift()` in `src/sim/engine/daytime.ts` (line 158)
returns `[]` when `!schoolDay(w)`, so every worker sits idle during school
holidays. This matches proposal 1 in `game-systems-realism.md`.

The overview screenshot (`docs/screenshots/estate-web-overview.webp`)
shows residents bunched into dense clumps at the shop and playground.

---

## 4. Gaps

| Gap | Kind |
|---|---|
| Adults idle in holidays; sick children still due at school | Correctness (P0) |
| The chooser's reasoning is visible only to the balance hooks, not on the page | Explainability (reviewer's read) |
| Needs, noise, affinity and fray are hidden; crowds stack into blobs | Legibility (reviewer's read) |
| Only 64 day books and 400 events are kept | Short memory |
| Tree, bus stop and school do nothing; the shop is open in every phase | Hollow fixtures |
| Puddles, wear and power are cosmetic; affinity never decays | Weak feedback loops |

---

## 5. Prioritised roadmap (proposed)

| Order | Item | Effort | Impact | Notes |
|---|---|---|---|---|
| 1 | M1 work/school split | S | High | Add a G12 test in `tests/realism.test.ts` |
| 2 | T2 seed-sweep export + T6 longer history | S | High | Builds on `scripts/balance.ts` |
| 3 | V2 event tags + V3 story-first HUD + V8 accessibility | S | High | Uses data that already exists |
| 4 | V10 why-log | M | High | Read from the existing hooks; observation only |
| 5 | M2 thoughts + M3 affinity decay | M | High | New RNG channels and a shape allowlist update |
| 6 | V11 follow-a-resident + T1 metrics graphs | M | High | |
| 7 | M4 puddles/power + M6 trees/noise | S–M | High | |
| 8 | V1 lenses + V9 timeline scrubber | M | High | Best after M2–M6 land |
| 9 | M5, M7, M8, M9 | S–M | Med | |
| 10 | V4 crowds + V6 art direction; T3 run comparison | M | Med | |
| 11 | T4 toggles, T5 replay, M10 new fixtures, V7 juice | M–L | Med–Low | Speculative or breaks gen parity |

V, M and T ids refer to the companion docs.

---

## 6. Open questions

1. Is it OK to touch vendored page3d beyond the `world.js` fork? HUD, lens
   and why-log work would mean forking `hud.js` and `style.css`.
2. When, if ever, should gen parity with Python be given up so new
   fixtures can land?
3. Should Highfield get its own visual identity, or stay aligned with
   llm-world?
4. `game-systems-realism.md` links a "Highfield sim gap analysis" doc that
   isn't in the repo. Where does it live?
5. Are offline sweeps (T2) enough, or is run comparison wanted in the
   browser?
