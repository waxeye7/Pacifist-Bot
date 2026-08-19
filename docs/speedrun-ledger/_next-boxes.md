# Next boxes (not leftover-5 ext)

Read-only rec. No src edit. Clock: spawn → RCL4. Do not touch ext-take.

Sources: `PlanV2.plannedTilesFor` / `containerStageOrder`, `layer-hub.mjs` emit order, `builder.ts` `findLocked`, `upgrader.ts` `controllerDepot`, `hasControllerDepot` / `rcl3SecondExtWaveReady`, `tools/plan-suite/out-v2/plans-hub.json`, `docs/BENCHMARK-ROOMS.json` set `1f90aub` (16 rooms).

---

## Live tile rule

Planner emit (`layer-hub.mjs:1308`, `:1479`, `:1554–1560`):

`objects.filter(type===source)` → one seat per source **in that order** → controller bin → mineral last (`layer-misc`).

`packPlanPayload` does **not** reorder containers (links only).

`containerStageOrder`: last extractor-adjacent tile is mineral, deferred to RCL6. Early set = the rest, **plan order**. Tie rule exists for the old E8S3 ctrl/mineral overlap; current E8S3 plan is ctrl `(18,5)` / depot `(18,2)` / mineral box `(42,29)` — no overlap. Still last-match.

`plannedTilesFor(container)` prefixes of that one order:

| RCL | take | tiles |
| --- | ---: | --- |
| 2 | 1 | `early[0]` = `plan.t.container[0]` when mineral is last (all 16) |
| 3–5 | `early` | both source seats + controller |
| 6+ | all | + mineral |

RCL2 is **not** nearest-to-sitter. CYCLE-0 / `4384aa0` said “nearest source.” Code takes object-order `[0]`.

Siting: RCL2 `RCL2_ORDER` ext then that one box. RCL3 `PLACE_ORDER` tower then leftover containers (plan order: 2nd source, then depot) then ext/roads. Builder `findLocked`: RCL3 **depot site** (same geometry as below) → tower → ext → leftover containers. Roads-only → suicide.

Depot test (all four agree: `upgrader.ts`, `builder.ts:60–63`, `hasControllerDepot`, `rcl3SecondExtWaveReady`):

**live container, `getRangeTo(controller) ≤ 4`, not source-adjacent.**  
`hasControllerDepot` / `controllerDepot` also skip bin + storage ids. Ready-gate does not; same tile still matches.

Planner bin: chebyshev **1–3** of controller (prefer **exactly 3**), D8 of the controller link, not source-adj. Subset of ≤4.

---

## 1. RCL2 first box — far first?

Metric: chebyshev sitter (`plans-hub` `sitter` = `plan.si`) → source seats. `[0]` vs min of the two. BENCHMARK `srcSteps` is from the **anchor**, not the sitter — they disagree (E13S9).

| room | pair | band | `[0]` | other src | Δ | first is |
| --- | --- | --- | ---: | ---: | ---: | --- |
| **E9S1** | B1 | hard | **36** `(12,5)` | 4 `(33,41)` | 32 | **far** |
| **E13S9** | B2 | hard | **26** `(19,6)` | 8 `(9,24)` | 18 | **far** |
| E11S6 | B4 | med | **24** `(47,4)` | 6 `(29,20)` | 18 | **far** |
| E4S7 | B5 | med | **21** `(24,13)` | 9 `(40,43)` | 12 | **far** |
| E18S5 | B6 | med | **16** `(10,21)` | 3 `(11,34)` | 13 | **far** |
| E16S9 | B5 | med | **16** `(21,18)` | 6 `(43,34)` | 10 | **far** |
| E3S5 | B7 | easy | **10** `(16,15)` | 5 `(19,30)` | 5 | **far** |
| E13S7 | B8 | easy | 7 | 5 | 2 | far (noise) |
| E8S5 | B3 | hard | 19 | 21 | 2 | near |
| E5S3 | B1 | hard | 15 | 17 | 2 | near |
| E12S3 | B2 | hard | 14 | 16 | 2 | near |
| E12S1 | B7 | easy | 7 | 10 | 3 | near |
| E18S9 | B3 | hard | 13 | 27 | 14 | near |
| E8S3 | B4 | med | 8 | 24 | 16 | near |
| E6S1 | B6 | med | 7 | 17 | 10 | near |
| E21S4 | B8 | easy | 4 | 4 | 0 | tie |

**8 / 16** site the farther seat first. **6 / 16** are real (Δ≥5). **2 / 6 hard**: E9S1 (the 3+41 object split), E13S9 (hub sits on the *other* source than the anchor). E5S3 18+29 is *not* far-first (15 vs 17).

Far-first is the worst spend: 5k dirt walk to the long source, leave the hub-side tile as drop-mine (the easy haul). 5k energy is the same either tile; the walk + wrong buffer is the tax.

**A/B:** keep prefix of **one** after the five ext. Among early source seats, take min chebyshev to `plan.si` (storage tile if `si` missing). Same `1 ⊂ early ⊂ all`. Not “two source boxes at RCL2.”

Model: **0** on spawn→RCL2 / time-to-550. RCL2→RCL3 **−200 to −800** on the six far-first rooms, ~0 on the rest. Mean pulled by E9S1 / E13S9 / E11S6.

---

## 2. RCL3 controller depot — planned tile vs 4W

All 16: `container[2]` is the bin. Chebyshev to controller = **3**. None source-adjacent (checked vs both BENCHMARK sources). All pass `≤4 ∧ !sourceAdj`.

| room | ctrl | depot | ch | parkable |
| --- | --- | --- | ---: | --- |
| E5S3 | 37,41 | 40,42 | 3 | yes |
| E9S1 | 24,37 | 27,40 | 3 | yes |
| E12S3 | 19,27 | 18,30 | 3 | yes |
| E13S9 | 10,27 | 7,26 | 3 | yes |
| E18S9 | 25,6 | 28,6 | 3 | yes |
| E8S5 | 43,9 | 40,10 | 3 | yes |
| E11S6 | 12,24 | 15,26 | 3 | yes |
| E8S3 | 18,5 | 18,2 | 3 | yes |
| E16S9 | 42,22 | 41,25 | 3 | yes |
| E4S7 | 33,39 | 32,36 | 3 | yes |
| E18S5 | 8,9 | 10,12 | 3 | yes |
| E6S1 | 40,5 | 37,8 | 3 | yes |
| E12S1 | 15,38 | 13,35 | 3 | yes |
| E3S5 | 44,30 | 41,27 | 3 | yes |
| E13S7 | 25,14 | 22,15 | 3 | yes |
| E21S4 | 42,23 | 44,20 | 3 | yes |

Parked 4W: `controllerDepot` scans **live** structures with that test (not the plan, not `Structures.controllerLink` as gospel). First RCL3 pack sites tower + **both** leftover boxes (budget 4). `findLocked` prefers the depot **site**. Once it stands, 4W withdraw + `depotPark` (D8 of depot ∩ upgrade range 3). Bin at range 3 ⇒ some D8 tiles are range 2 of the controller.

`hasControllerDepot` / `rcl3SecondExtWaveReady` flip the same tick the structure exists. No planned-tile miss on this set.

**Not an A/B.** Tile is already the right geometry. Don’t “fix” discovery.

Residual (not this knob): first pack still *sites* the 2nd-source box next to the depot. Builder won’t work it until depot+tower (+ext if those sites exist). Empty 2nd-source site is a slot, not a find-miss.

---

## 3. Second source container vs 135k / tower

Cost **5000** (same as tower; `_ext-payback.md`). 3.7% of 135k. Unlock: nothing. 4W already paid by the depot. Miner already 5W / 10 e/t.

Live: **does not steal from the tower.** Builder: depot → tower → leftover boxes. Siting puts both leftover boxes in the first RCL3 pack *with* the tower; work order still finishes the tower first.

It **does** steal 5k + a dirt walk from the 135k if anyone finishes the site during the climb. After tower, leftover ext are held → next `findLocked` is that box. Two `[W,2C,2M]` drain 10 e/t into it (~500 ticks + walk).

When the box pays:

- Drop decay is `max(1, 0.1% pile)` / tick. 1:1 haulers, cap `[4C,4M]` 200e, sized to live WORK (`rooms.spawning.ts:3692–3714`). Residual pile ≈ 0 when round-trip ≤ 200/10 = 20 ticks (one-way ≲10 plains).
- Far unboxed source (one-way 15–36): one 200e body overflows; `homeCarriersWanted` can add a 2nd/3rd 400e HOL. The box is a **hauler-count** save, not an income save, if haul already matches.
- `_rcl3-ext-rank.md` G: leftover ≈ 0 if haul works; decay save **0–190 ticks**, not 5k.

If RCL2 already boxed the **far** seat (the 6 rooms above), leftover is the **near** seat. Near drop-mine is the easy haul. 2nd box pays even less, and the 5k walk is short.

If RCL2 boxed the **near** seat (correct), leftover is the far 5k walk *during* the 135k. Worst time to buy it.

Tower: keep first (guardrail). Do not swap 5k box ahead of 5k tower.

**A/B:** after depot+tower, **hold** the 2nd source box through the 135k (same spirit as leftover ext: site-budget idle or recycle; don’t finish 5k). Site at RCL4 with storage, or never on this clock. Not “two boxes at RCL2.”

Model: **−340 ticks** of climb if they would have built it (5000/14.7) plus saved builder-walk on the far rooms. Decay clawback only if haul is leaky on a far unboxed source **and** you already fixed first-box so that source is the leftover one — then the box can pay; measure pile size before flipping.

---

## Ranked A/Bs (after this race, one knob)

Do not bundle with leftover-5. Live race is the baseline.

| # | knob | rooms | Δ spawn→RCL4 (model) |
| --- | --- | --- | --- |
| **1** | RCL2 first seat = min chebyshev/`si` among early source seats, not `container[0]` | 6/16 real, 2/6 hard | **−200 to −800** on those; ~0 else. Biggest single box win. |
| **2** | Hold 2nd source box off the 135k (after depot+tower; don’t finish 5k) | all 16 | **−0 to −500** if live would build it; 0 if builders already recycle past it. Smaller than #1. |
| **3** | Depot tile / 4W find | 0/16 miss | **no A/B.** Already ≤4, not source-adj. |

#1 then #2. #2’s far-walk tax shrinks if #1 lands (leftover becomes the far seat — more reason to hold). Do not site two source boxes at RCL2 to “fix” order.
