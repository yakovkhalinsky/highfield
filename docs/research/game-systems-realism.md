# Game systems research → Highfield realism

Research brief for Highfield's day-tick realism fork. Gen layout stays
Python-parity; day tick / `rules.json` / chronicle / visual fork are fair
game for realism work.

**Note:** A Cursor cloud agent could not attach (workspace root is
`/home/yakov/git`, not the Highfield repo with `origin`). This doc was
produced from local codebase exploration plus web research. Re-open
`/home/yakov/git/highfield` as the workspace to re-run the same brief on a
cloud agent if wanted.

---

## 1. Executive brief

Highfield already is a **needs-based utility sim** on a small UK mid-rise
courtyard estate: five day phases, fixtures that advertise affordances,
household drains, school/work duties, weather + watcher fates, wear,
illness, pantry, seasonal outdoor pull, and rising affinity when people
share a fixture. That is the right architecture (Zubek *Needs-Based AI*,
Sims motives, Talk of the Town utility routines) — not GOAP, not a city
builder.

Realism gains that matter most for *feel* (what you notice in 10–50 days)
are not more needs. They are:

0. **Correct weekday duties** — work must not share school holidays
   (`daytime.shift` currently gates on `schoolDay()`).
1. **Social texture** — affinity that can cool, prefer variety, and leave
   chronicle traces (TotT / Fabula / DF tavern).
2. **Amenity ↔ noise ↔ home quiet** — playground/road loudness vs flat
   quiet, with trees as buffers (Cities noise + UK estate guidance).
3. **Mood as memory of events** — thin “thoughts” that feed
   `unhappy` (RimWorld mood), so storms, sold-out shops, and dark stairs
   change who stays.
4. **Duty edges + cosmetic→behaviour** — bus-stop life, shop hours,
   puddles/wear/power affecting walk cost or home needs.

Do **not** chase full economies, combat/ASB gameplay, continuous physics,
or LLM chronicle. Keep seed determinism and five-phase ticks. New gen
fixtures (bins/GP/pub) wait until day-tick gaps above are closed — they
break gen parity.

**Already shipped (G4–G11 track in `tests/realism.test.ts`):** power cuts,
puddles/wear, home pantry meals, school holidays, local vs bus workers,
unit maintenance drift, seasonal outdoor multipliers, company×affinity.

**Codebase audit** ([Highfield sim gap analysis](2efc2982-3fa8-44d0-a2fa-cf140746815d)):
confirmed P0 holiday/work coupling; bus_stop/school/tree empty affords;
puddles/wear/power mostly visual; `building.water` unread.

---

## 2. Relevant systems inventory

| System | Provenance | Highfield map | Fit | Cost | Estate payoff |
|---|---|---|---|---|---|
| Needs / utility action pick | Sims; Zubek Needs-Based AI; Dave Mark Utility AI | `needs.ts` pressure → ranked → utility − travel + habit + whim | **High** (already core) | Tune rules; optional curves | Organic day rhythm |
| Affordance advertising | Sims object interactions | `fixtures.*.affords`, `candidates()` | **High** | Rules + small engine | New places “do” something |
| Schedule / duty blocks | RimWorld timetable; TotT routines | `daytime.ts` school/work/commute | **High** | Engine | Believable weekdays |
| Mood as thoughts | RimWorld mood/thoughts; DF stress | `stress`, household `unhappy` (thin) | **High** | Small engine | Emigration feels earned |
| Joy variety / tolerance | RimWorld recreation kinds | One play + company sinks; no variety penalty | **Medium** | Engine | Courtyard feels alive, not looped |
| Social venue co-presence | DF tavern; TotT co-location | Tables/benches/shop; affinity bump | **High** | Rules + narrate | Named friendships in chronicle |
| Asymmetric affinity + decay | Ryan TotT social networks | Affinity only rises (`affinity_gain`) | **High** | Engine | Cliques, cool-offs |
| Noise pollution + buffers | Cities: Skylines; Southwark noise guidance | `buildNoise`, quiet need, roads loud; trees don’t buffer | **High** | Rules/engine | Quiet flats vs loud play |
| Amenity land-value / leisure | Cities parks | No land value; fixtures decay | **Medium** | Stretch | Skip land value; keep wear |
| Weather outdoor mult | Many life sims | `weather.outdoor`, wet streak, puddles | **High** (present) | Tune | Rain keeps people in |
| Fixture lifecycle | Sims broken objects; Banished upkeep | decay, break_prob, repair | **High** (present) | Tune | Broken bench changes routes |
| Story sifting / fact chronicle | Fabula; WAWLT; Felt | Seeded templates, event-only | **High** (present) | Narrate | Richer arcs without inventing |
| Gossip / knowledge mutation | TotT; Gossamer; Fabula | Absent | **Stretch** | Large | Skip for now; sift events instead |
| GOAP multi-step plans | F.E.A.R. / hybrid Utility→GOAP | Duty paths are hard-coded | **Low** | Large | Overkill for 5 phases |
| City demand / zoning | C:S residential demand | Waiting list + fill_to | **Low** | — | Keep pop knobs only |
| Full gift/debt economy | Fabula | Pantry + shop stock only | **Low** | — | Estate, not village economy |

---

## 3. Gap analysis vs current Highfield

### Strong already
- Utility needs with phase/weekend/household drains and whim.
- School run, holidays, work share, local vs away commute, bus-stop wait spots.
- Noise field from sites + fixture use; quiet need from noise; home quiet × unit noise.
- Weather outdoor multipliers, wet streak, puddles, shade under heat, evening light boost.
- Watcher fates (weather, roadworks, power, delivery, damage, tranquillity).
- Pop pressure: birth/death, unhappy→emigrate, waiting list.
- Affinity rise on shared fixtures; company prefers high-affinity occupants.
- Seeded chronicle constrained to facts.

### Concrete gaps (player-visible)

| Gap | Evidence | Visible effect |
|---|---|---|
| **P0: work shares school holidays** | `shift()` returns `[]` unless `schoolDay()` — holidays idle all workers | Fortnight-long adult idle during term breaks |
| Trees don’t quiet the estate | `tree` empty `affords`; `buildNoise` ignores trees | Shade/heat only; no buffer from playground/road |
| Affinity never decays / no dislike | `bumpAffinity` only `min(1, +gain)` | Everyone slowly likes everyone |
| Unhappy mostly need-pressure | `households.ts` fray from stress/needs | Bad days barely stick as leave reasons |
| Bus stop logistics-only | `affords: {}`; AWAY wait ring; no real seating | People “teleport-wait”; no hang-out |
| School fixture hollow | yard + `meets` only; empty `affords` | No after-hours / venue feel |
| Puddles & cell wear cosmetic | `ground.ts` → API; `walkCost` ignores them | Rain looks wet, paths feel the same |
| Power ignores home needs | lamps dim + stair_mult; home food/rest unaffected; `water` unread | Blackouts don’t push people out or spoil pantry |
| Shop always open | no phase hours | Same errand pattern every phase |
| Local jobs are posts only | `localWorkSpot` → shop/bench/table; no restock/repair | “Workers” don’t change the estate |
| Play vs quiet tension weak | Playground loud/carry vs slow `quiet_base` drift | Courtyard noise rarely drives retreat |
| Recreation monoculture | play/company sinks few kinds | Same loops |
| Illness thin | wet/stress → ill days + mobility; no sick-child keep-home | “Unwell” mostly walks slower |
| Chronicle under-uses affinity | templates favour storms/births/errands | Social arcs stay invisible |

### Must not change
- Gen layout / fixture placement hashes (`src/sim/gen/**`, Python parity).
- `src/py` shims; vendored page3d except visual fork.
- Seeded RNG channels for existing behaviour (new behaviour needs new channels).

### Safe to change
- `rules.json` day-tick knobs, new fixture affords, weather/engine numbers.
- `src/sim/engine/**` realism fork, `decide.ts`, `narrate`, visual fork.

---

## 4. Recommended roadmap

### Phase A0 — fix hollow duties (do first)
1. **`workDay` ≠ `schoolDay`** — weekends off work OK; school holidays must still run
   adult shifts (`daytime.shift` / `commuting`). Carers stay on `school_hours` only
   when school is in. Tests in `realism.test.ts` as G12.

### Phase A — rules / small knobs
2. Give **trees** soft noise dampen + optional quiet/company affords.
3. Soft **company** on `bus_stop` (needs engine if AWAY people can’t seat).
4. Playground→quiet coupling; weekend outdoor company/play; winter indoor rest.
5. Watcher: weight `delivery` when stock low; `damage` when wear high.
6. Shop opening phases in rules + utility gate.

### Phase B — engine, still deterministic
7. Puddle/wear → walk cost or outdoor pressure; power-cut hurts home food/rest.
8. Sick child skips school (`dueAtSchool` × `ill`).
9. **Affinity decay** + overcrowding dislike; thoughts→unhappy from daybook.
10. Recreation variety preference; teen hangouts; tree cells in `buildNoise`.

### Phase C — presentation (then optional new fixtures)
11. Chronicle: wet weeks, dark flats, regulars at tables, holiday courtyard with
    adults still commuting.
12. Visual fork clarity for broken/dim/puddle.
13. **Only then** consider gen fixtures (bins, GP, pub) — breaks gen parity.

### Explicitly do **not** pursue
- Money, jobs market, zoning, traffic simulation.
- GOAP cooking chains or inventory management.
- Full gossip knowledge graphs (TotT-scale).
- Combat / crime as a system (at most chronicle colour from existing stress).
- Continuous-time physics or pathfinding showpieces beyond current scan/Manhattan.
- LLM watcher/chronicle (seeded templates are the product).
- Premature new gen amenities before A0–B.

---

## 5. Top 12 concrete update proposals

1. **Uncouple work from school holidays (P0)**  
   *Problem:* `shift()` uses `schoolDay()`, so holiday fortnights idle all workers.  
   *Change:* `workDay = weekday in Mon–Fri` (optional bank-holiday later); `schoolDay` keeps holidays; carers use `school_hours` only when school is on.  
   *Touch:* `daytime.ts`, `tests/realism.test.ts`.  
   *Feel:* courtyard empties on holiday mornings for schoolkids, not for every adult.  
   *Risk:* low; day-tick only; high player-visible correctness.

2. **Tree noise buffers (+ soft affords)**  
   *Problem:* trees are scenery + storm fall.  
   *Change:* dampen noise near trees; optional quiet/company affords.  
   *Touch:* `places.ts`, `rules.json`.  
   *Feel:* quieter lawns under planes.  
   *Risk:* low.

3. **Power/puddles affect behaviour**  
   *Problem:* ground + power mostly cosmetic.  
   *Change:* puddle → walk cost or outdoor pressure; power-cut → home food/rest penalty.  
   *Touch:* `path`/`needs`/`effects`.  
   *Feel:* wet paths and dark flats change where people go.  
   *Risk:* low–medium.

4. **Shop hours**  
   *Problem:* shop usable every phase.  
   *Change:* `fixtures.shop.phases` or engine allow-list (e.g. morning–evening).  
   *Touch:* `needs.ts`, `rules.json`.  
   *Feel:* night estate isn’t a supermarket.  
   *Risk:* low.

5. **Bus-stop company**  
   *Problem:* stop is commute latch / AWAY teleport.  
   *Change:* company afford + allow seating when not mid-commute clear; evening loiter.  
   *Touch:* `rules.json`, `daytime.ts`/`needs.ts`.  
   *Feel:* people cluster at the stop.  
   *Risk:* medium (AWAY mode interactions).

6. **Affinity decay**  
   *Problem:* social graph only heats up.  
   *Change:* daily decay; optional −gain on overcrowding bounce.  
   *Touch:* `needs.ts` / households, shape allowlist.  
   *Feel:* friendships need maintenance.  
   *Risk:* medium.

7. **Event thoughts → unhappy**  
   *Problem:* emigration ignores memorable bad days.  
   *Change:* daybook sold_out / storm / power / broke add fray.  
   *Touch:* `households.ts`, `rules.pop`.  
   *Feel:* a dark wet week empties a flat.  
   *Risk:* low–medium.

8. **Sick child keeps home**  
   *Problem:* ill kids still due at school.  
   *Change:* `dueAtSchool` false when `ill > 0`; carer may skip work.  
   *Touch:* `daytime.ts`.  
   *Feel:* quiet yard on a sick day.  
   *Risk:* low.

9. **Playground vs quiet flats**  
   *Problem:* UK play-noise tension soft.  
   *Change:* bump loud/carry; faster nearby `quiet_base` drift.  
   *Touch:* `rules.json`, `maintainUnits`.  
   *Feel:* flats near play fray sooner.  
   *Risk:* low.

10. **Demand-aware delivery**  
    *Problem:* restock underweighted when empty.  
    *Change:* boost `delivery` in `decide.ts` when stock low.  
    *Touch:* `decide.ts`.  
    *Feel:* watcher answers the shop.  
    *Risk:* low.

11. **Affinity + wet-week chronicle**  
    *Problem:* social/wet facts under-told.  
    *Change:* templates for regulars co-occupy + 2+ wet days.  
    *Touch:* narrate (+ optional daybook counters).  
    *Feel:* “the estate has regulars.”  
    *Risk:* low.

12. **Recreation variety**  
    *Problem:* same fixture kind every afternoon.  
    *Change:* utility penalty when habit matches for play/company.  
    *Touch:* `needs.ts`.  
    *Feel:* tables vs benches rotate.  
    *Risk:* low.

---

## 6. References

- Zubek, *Needs-Based AI* — https://robert.zubek.net/publications/Needs-based-AI-draft.pdf  
- Utility vs GOAP overview — https://recited.io/kb/ai-in-game-development/comparisons/goal-oriented-action-planning-vs-utility-based-ai-systems/  
- RimWorld Schedule / Mood — https://rimworldwiki.com/wiki/Schedule · https://rimworldwiki.com/wiki/Mood  
- RimWorld Joy system notes — https://ludeon.com/blog/2015/04/rimworld-alpha-10-joy-system-released/  
- DF Stress / Tavern — https://dwarffortresswiki.org/Stress · https://dwarffortresswiki.org/Tavern  
- Ryan, TotT affinity networks — https://jamesryan.computer/papers/2016_ryan_a_simple_method_for_evolving_large_character_social_networks.pdf  
- Ryan, TotT knowledge/gossip — https://jamesryan.computer/papers/2017_ryan_simulating_character_knowledge_phenomena_in_talk_of_the_town.pdf  
- Fabula (event log → chronicle, no LLM) — https://github.com/fuskio64/fabula  
- Story sifting (WAWLT) — https://doi.org/10.1145/3402942.3402953  
- Cities: Skylines noise — https://skylines.paradoxwikis.com/Pollution  
- UK estate play / noise — Playing Out CIH report; Southwark Noise Technical Guidance; Ealing Golf Links residents design charter  

---

## Suggested next step

**G12 first:** uncouple `workDay` from `schoolDay` (proposal 1) — small engine fix, largest correctness win. Then Phase A pack: tree dampen, shop hours, playground loudness, delivery weighting. Defer new gen fixtures (bins/GP/pub) until duties and cosmetic→behaviour gaps land.
