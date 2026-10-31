# Emergent mechanics → ranked for a watched sim

Mechanics ranked by how much interesting emergent dynamics they produce.
Grounded in [`game-systems-realism.md`](game-systems-realism.md). Part of
the [November 2026 review](review-2026-11-roadmap.md), see also
[observability and visuals](observability-and-visuals.md).

All items are **proposed**. None of them depend on player agency. The
research's don't-list still holds: no money, traffic, GOAP chains,
gossip graphs, crime systems or LLM chronicle.

---

## 1. Ranked list

| Rank | Id | Mechanic | Grounding | Emergent dynamic | Effort | Impact |
|---|---|---|---|---|---|---|
| 0 | M1 | `workDay` separate from `schoolDay`; carers tied to school hours only in term | Research A0 / proposal 1 | Prerequisite: holiday data is wrong without it | S | High |
| 1 | M2 | Thoughts: storm, sold out, dark flat or broken bench add timed mood debuffs that feed `unhappy` | RimWorld mood, DF stress; proposal 7 | Cascades from events to fraying to moving out | M | High |
| 2 | M3 | Affinity decay plus dislike from overcrowding | TotT (Ryan 2016); proposal 6 | Cliques form and dissolve | M | High |
| 3 | M4 | Puddles add walk cost; power cuts hurt home food and rest | Proposal 3 | Weather reshapes routes and crowding | M | High |
| 4 | M6 | Tree noise buffers; playground loudness against nearby flats | Cities noise, UK estate guidance; proposals 2, 9 | Spatial sorting of who's happy where | S | Med–High |
| 5 | M7 | Recreation variety penalty; teen and bus-stop hangouts | RimWorld joy, DF tavern; proposals 5, 12 | Rotating venues, new meeting points | M | Med |
| 6 | M5 | Shop hours; delivery weighted by low stock | Proposals 4, 10 | A daily rhythm and supply loops | S | Med |
| 7 | M8 | Sick child stays home; the carer may skip work | Proposal 8 | Knock-on effects through the household | S | Med |
| 8 | M9 | Chronicle arcs about regulars and wet weeks | Fabula, story sifting; proposal 11 | Tells the arcs that emerge | S | Med |
| 9 | M10 | New gen fixtures (bins, GP, pub) | Research Phase C step 13 | New venues; breaks gen parity | L | Med |

---

## 2. Why this order

M2, M3 and M4 add **feedback loops**: state that changes behaviour, which
changes state again. Loops are where emergence comes from. M5 to M8 add
rhythm and local texture. M9 makes the results legible in words. M10
waits because it breaks the gen parity bar.

Each new behaviour needs its own seeded RNG channel, so existing channels
keep their draws (research §3, "Must not change").
