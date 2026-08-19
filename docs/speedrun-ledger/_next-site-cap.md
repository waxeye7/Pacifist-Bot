# Site cap — leftover-5 + no-RCL3-roads vs 100

Read-only. **No src. No `push-race`.** Cycle-15 (`run-2026-08-15T23-57-10Z`)
still watching. Cycle-9 KEEP (`BasePlan.ts:486–489` `ROAD && rcl<4`) was
slots, not speed (`_rcl3-sites-roads.md`, `_critic-keep-stack.md`).

Metric if this ever becomes a knob: first RCL4 room can site storage, and
every RCL3 room gets a depot. Not a spawn→RCL4 A/B.

---

## Verdict

**Yes — leftover-5 + no-RCL3-roads leaves headroom on the actual race
(8 rooms / user).** Mid-L3 candidate sits at **0–1** open site. First
RCL4 dump is **22** in one room (storage included). **78 slots free.**

**No room is starved of a depot.** All **16/16** have a standing
controller-range container. Six candidate rooms dual-sited the depot
(miss-guard + path-flip) — extra 5k, not a miss.

**Do not model the race as 16 rooms on one 100.** Engine cap is
**per player**. `--swap` is 8 + 8. Control (frozen `e839fc8`, still
dumps 10 ext + RCL3 roads + remotes) is the side still sitting
**70–99/100**. E8S5 just hit RCL4 with **7 ext sites and no storage
site** — cycle-8’s E13S7 failure, live on control.

One-user 16 (later adopt / empire) is a different math. Slam-sync
**16 × ~7 = 112** can `ERR_FULL`. Not this seed.

---

## Engine vs the 16

`MAX_CONSTRUCTION_SITES` = **100 per user**, not shard-global.
`Game.constructionSites` is that user’s map. Two racers → two pools.

| | rooms | policy | live sites |
| --- | ---: | --- | ---: |
| candidate `pacifist` | 8 bench + 3 parked L6 | leftover-5, no RCL3 roads, remotes@4 | **22** (all E13S7, first RCL4) |
| control `pacifist-race` | 8 bench + remotes | dump-10, RCL3 roads, remotes on | **74** |

Cycle-8 comment was **15 × 8 = 120** on *one* user, not 16 × 15.
That is still the right unit.

Remotes reserve `GLOBAL_SITE_CEILING = 70`
(`rooms.construction.ts:2543`, `:2630`). Home leftover
`createConstructionSite` does **not** read that. Only `Build_Remote_Roads`
bails at 70.

---

## What the two KEEPs actually stop

Race rooms have **no `planV2`**. `construction()` never enters
`placeFromPlanV2` (`rooms.construction.ts:712–715`). `maxSitesFor`
does not run. Young path: `placeFromBasePlan(room, 8)` then leftover
stamps with **no room cap**.

| KEEP | where | what it removes from the 100 |
| --- | --- | --- |
| leftover-5 | `extensionTake` `lvl<=3 → 5` (`PlanV2.ts:1095–1099`); BasePlan `:501–503`; checkerboard `:306–316` | 5 ext sites × N rooms through the 135k |
| no RCL3 roads | `BasePlan.ts:489` `ROAD && rcl<4` | 6–8 arterial sites × N (`LEGACY_ROAD_SITE_CAP=6` plus BasePlan `maxSites=8`) |

`basePlanRoadsActive = true` for `rcl < 4 \|\| !storage` (`:741–748`),
so legacy `pathBuilder` roads (`:1449`) are also off while young.
RCL2 source seats already gated `level >= 3` (`:1422`, `:1432`).

`maxSitesFor` (`PlanV2.ts:45–63`) is **adopt-only**: RCL2 **5**, else
**4**, RCL4+ own storage **8**, RCL6+ thin bank **0/2**. Race never
hits it. `_rcl3-sites-roads.md` “4 empty arterials hostage storage”
is the PlanV2 hole if you adopt without also returning `[]` from
`roadsForRcl` at `lvl===3`.

---

## Peak occupancy (candidate policy, no planV2)

Leftover path after BasePlan still fires hub / bin / depot / source
boxes **without** a per-room ceiling (`:1100` bin if `cap>500`,
`:1132` hub RCL2–3, `:1177` `siteLegacyControllerDepot`, `:1422`
sources). Room cap is only BasePlan `existingSites >= 10` / `maxSites=8`.

| window | per room | 8 rooms / user | 16 rooms one user |
| --- | ---: | ---: | ---: |
| RCL2 slam (5 ext + hub + bin) | **~7** | **56** | **112 — over** |
| RCL3 first pack (tower + depot + 2 src ± hub/bin) | **5–6** | **40–48** | **80–96** |
| Mid-L3 after eco stands (film) | **0–1** | **0–8** | **0–16** |
| First RCL4 dump (take flips to 20) | **~22** | **22** + 0–1×7 ≈ **29** | N overlapping × 22 |

RCL4 dump shape, live E13S7: **15 ext + storage + 5 road + 1 spawn
rampart = 22**. `extensionTake(4)` is engine cap the tick of 4
(`_next-rcl4-release.md`). Checkerboard does not honor BasePlan’s 8.
Roads now legal (`rcl<4` gate lifts). Cadence becomes **1000** t
(`rooms.ts:365`), except `DOB==2` on the upgrade tick.

8 rooms do **not** dump 22 at once. Cycle-15 spread to first RCL4 is
~7–15k ticks. Two overlapping dumps ≈ 44. Still inside 100.

16-as-one-user slam is the only leftover-5 + no-roads overflow.
RCL3 first-pack 96 is tight: depot is **after** hub/bin/tower in
`construction()`, silent `ERR_FULL`, retry in 100 t. Race 8 never
gets there.

---

## Live film (mongo, cycle-15, E13S7 just crossed 4)

Candidate L3 (leftover-5 holding, 0 roads):

| room | L | ext | box | sites | depot |
| --- | ---: | ---: | ---: | ---: | --- |
| E5S3 | 3 | 5 | 5 | 0 | STAND (dual 34,44 + 40,42) |
| E12S3 | 3 | 5 | 5 | 0* | STAND 18,30 |
| E18S9 | 3 | 5 | 5 | 0 | STAND (dual 28,6 + 28,5) |
| E11S6 | 3 | 5 | 5 | 0 | STAND 15,24 |
| E16S9 | 3 | 5 | 5 | 0 | STAND (dual 39,23 + 39,21) |
| E18S5 | 3 | 5 | 5 | 0 | STAND (dual 5,12 + 10,12) |
| E12S1 | 3 | 5 | 5 | 0 | STAND (dual 12,35 + 14,35) |
| **E13S7** | **4** | 5+15sited | 3 | **22** | STAND (dual 22,11 + 22,12) |

\*E12S3 had `src@47,33` at 96% on the first pass; gone by the second.
Not a depot.

Control L3 still **10 ext + 32–60 roads**. L4: E4S7 **17** sites
(incl. storage 31%), E21S4 **12**, **E8S5 7 ext / 0 storage**.
Control remotes hold another ~30 (roads + containers). That is why
control hugs 70–99 and leftover-5 cannot “release the 4-slot budget”
on that user — cycle-9 never shipped to `e839fc8`.

---

## Depot — none starved

`hasControllerDepot` (`rooms.spawning.ts:3381–3399`): live container,
Chebyshev ≤4 of controller, not source-adj, not bin/storage id.

`siteLegacyControllerDepot` (`construction.ts:658–700`): RCL3 only,
prefer cheby 3, plains, nearer spawn. **No room-count check. No
global-70 check.** Fails only `ERR_FULL` (retry next `construction()`,
100 t at L3). Does not need `findStorage()`.

Second sitter: path-flip `linkLocation` (`:1269–1292`), range **3**,
needs hub (`findStorage`). Miss-guard prefers 3, so both fire → dual
depot on 6/8 cand. Extra 5k on the 135k, park still unlocks.

| miss mode | leftover-5 + no-roads, 8 rooms | 16 one user slam |
| --- | --- | --- |
| global 100 `ERR_FULL` | **no** (peak 56 / 22) | **yes**, last rooms |
| tile blocked | no (ring 2–4) | no |
| RCL2 far rooms | by design (`level===3`; `_next-far-depot.md`) | same |
| PlanV2 4-slot hostage | N/A (no pack) | adopt: tower+2 src+depot fill `maxSitesFor(3)=4`; roads wait |

Cycle-8 hostage was **empty RCL3 roads** filling BasePlan’s 8/10 so
RCL4 `existingSites >= 10` returned before storage. No-roads +
leftover-5 leaves those 8 slots empty at the upgrade tick. E13S7
sited storage **15,13** (`spawn.y-2`) on the same dump as the 15 ext.
That is the KEEP doing the job it was kept for.

---

## Rec

- **Do not race a site-cap knob.** Headroom is already there on
  candidate. Control’s 74–99 is frozen-policy, not a candidate bug.
- **Keep** leftover-5 and no-RCL3-roads. Slots KEEP, not speed KEEP.
- **Do not** treat 24512 / cycle-8 E13S7 as a live candidate risk.
- Adopt-16 later: `maxSitesFor` + still-on PlanV2 RCL3 roads
  (`roadsForRcl` / `typeAllowedAtRcl` `>=3`) re-opens the 4-road
  hostage `_rcl3-sites-roads.md` already named. Separate note.
- Dual depot is not this question. Leave it.

Did **not**: `src` edit, `push-race`, seed, revert, mid-race push.
Mongo was find-only.
