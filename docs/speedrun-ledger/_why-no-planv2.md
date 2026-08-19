# Why race rooms never get planV2

Read-only. No src. No `push-race`. No mid-race adopt. Planner 98/88
parked r44 (`_status-planner.md`) — do not rewrite `plans-hub.json`.

Set `1f90aub`. Control frozen `e839fc8` / `pacifist-race`. Candidate
`pacifist`. Metric if this becomes a knob: mean spawn→RCL4, `--swap`.

Full adopt recipe: [`_next-adopt-plans.md`](_next-adopt-plans.md).
This file is the *why*.

---

## Where `planPackMiss` is set

Only `runPackAdoption()` (`src/Managers/AutoExpand.ts`). Two writes,
same field, same backoff:

| when | code | then |
| --- | --- | --- |
| segment walk > **200** t (`ADOPT_TIMEOUT`) | `:394–401` | `planPackMiss = Game.time`; retry in **3000** t |
| swept 80–85, no key for the room | `:436–444` | same stamp; log *legacy construction stays in charge* |

Cleared only in `adoptPacked()` (`:255`) after a real payload write.

Scan skip (`:372–373`): if `planPackMiss` exists and
`Game.time - miss < 3000`, that room is not even queued. A miss from
an empty-pack sweep therefore lasts **3000 t** unless someone deletes
the field.

`main.ts:209–210` always runs `runPlanV2Adoption()` then
`runAutoExpand()` → `runPackAdoption()`, even with
`features.autoExpand === false`. The expansion state machine is
optional. The pack sweep is not.

Race rooms hit the **empty-pack** branch, not the timeout, unless
segments are starved (animator 89–99 + error + 88 + 80–86 fight the
10-slot `setActiveSegments` cap — then timeout *looks* like a miss).

---

## How BasePlan is chosen vs the PlanV2 pack

`construction()` forks on a Memory bit. Nothing else.

```712:715:src/Rooms/rooms.construction.ts
    if (room.memory.planV2) {
        placeFromPlanV2(room);
        return;
    }
```

No `planV2` → `getBasePlan` + `placeFromBasePlan(room, 8)` while
`rcl < 4 \|\| !storage`, then leftover stamps (hub at `spawn.y-2`,
checkerboard ext, `siteLegacyControllerDepot`, pathfinder source
seats at `level >= 3`). `rooms.ts:351–353` 15-tick recycle is
**planV2-only**.

`Features.placeFromPlan` (default OFF) is a leftover console flag.
`construction()` does not read it. Young rooms always get BasePlan
when `planV2` is missing.

`getBasePlan` (`BasePlan.ts:425–441`): if `planV2` exists, return the
mirror `syncPlanV2Memory` wrote — never recompute v1 over it. Else
cache `room.memory.basePlan` at `PLAN_VERSION = 5` (hub score + ring
stamps + min-cut).

### Who can write `planV2`

| writer | source | when |
| --- | --- | --- |
| `adoptPacked` via `runPackAdoption` | segments **80–85**, index **86** | owned, no `planV2`, miss cooled |
| `adoptPacked` via AutoExpand `spawned` | named `st.seg` from 86 | only if AutoExpand claimed the room |
| `runPlanV2Adoption` / `adoptPlan()` | segment **88**, one room | `Memory.planV2Adopt`, **20** t |

Race seed uses **none** of those. `spawn-in.mjs` reads
`plans-hub.json` **only** for `structures.spawn[0]`, writes mongo
spawn + controller. No Memory. No segments.

`push-expansion-pack.mjs` is the stock 80–86 writer. It ranks
*unowned* rooms within dist **2–5** of *currently owned* rooms, skips
`taken`, ships top **12** payloads. After `--seed` the 16 bench names
are already owned → skipped. Before seed the ranker walks the empire
(freeze owned: E11S8, E13S5, …), not `1f90aub`.

---

## Why the 16 (`setHash 1f90aub`) have no pack

Hub has them. Segments do not. That is the whole bug.

```
E5S3 E9S1 E12S3 E13S9 E18S9 E8S5 E11S6 E8S3
E16S9 E4S7 E18S5 E6S1 E12S1 E3S5 E13S7 E21S4
```

`tools/plan-suite/out-v2/plans-hub.json` (r44, md5
`8e5d6725885bd3f3731379bedf408326`) contains all 16. `_status-planner.md`:
do not run `plan.mjs`; boards unmoved since r32.

They never land in 80–86 because:

1. **No bench-pack push has been run.** The paste in
   `_next-adopt-plans.md` §2 is the only writer that targets these
   names. Stock `push-expansion-pack.mjs` will not.
2. **Seed does not adopt.** `race.mjs --seed` → `spawn-in.mjs`. Spawn
   tile from the hub; layout stays unset.
3. **`runPackAdoption` then tells the truth.** Every 25 t it walks
   86 → 80–85, finds no key, stamps `planPackMiss`. BasePlan owns the
   room until the field is deleted *and* a pack exists.
4. **`--wipe` does not touch Memory or segments.** Stale
   `planPackMiss` (3000 t) and stale `planV2` (E4S7 RCL8 leftover —
   `_NEXT-RACE.md` §0) both survive. A leftover `planV2` is worse:
   the sweep **skips** that room (`:355`).

Cycle-0 audit line “speedrun rooms with a shipped plan are v2” is
wrong on this set. Shipped ≠ adopted.

---

## What `packAdopt` / `Memory.rooms[x].planV2` look like

### `Memory.packAdopt` — global cursor, one room

```
{ room: "E5S3", seg?: number, scan?: number, since: number }
```

Not an arming flag. Delete it and the next `% 25 === 0` scan
re-derives. States:

| shape | meaning |
| --- | --- |
| absent | idle; next scan picks an unplanned owned room |
| `{ room, since }` | just armed; next tick reads 86 |
| `{ room, seg, since }` | index named a plan segment |
| `{ room, scan: 0..5, since }` | fallback sweep of 80–85 |

`autoExpandStatus()` prints `packAdopt ${room} seg … scan … Nt` or
`idle`, plus `unplanned […]` (`AutoExpand.ts:555–565`).

### `Memory.rooms[x].planV2` — packed layout, or absent

`packPlanPayload` (`PlanV2.ts:445–535`) writes:

```
{
  v: 1,
  h: "<djb2>",          // payload.planHash
  s?: number,           // last syncPlanV2Memory tick
  t: {                  // packed x + y*50, plan array order
    spawn, extension, container, tower, storage, terminal,
    link, road, lab, nuker, rampart, observer, extractor,
    shellCut, labInput
  },
  rs?: number[],        // road stages, same length as t.road
  si?: number           // sitter packed
}
```

`Global.ts` types only `{ v, h?, s?, t }`. `rs` / `si` are live.

### Race room today

```
Memory.rooms["E5S3"].planV2         // undefined
Memory.rooms["E5S3"].planPackMiss   // Game.time of last empty sweep
Memory.rooms["E5S3"].basePlan       // { version: 5, hub, structures, perimeter, … }
Memory.packAdopt                    // idle, or walking another miss
Memory.planV2Adopt                  // unused unless someone adoptPlan()'d
```

`planPackMiss` is untyped (`(room.memory as any)`). Not on
`RoomMemory`.

`Memory.planV2Adopt = { room, since }` is the **other** cursor
(segment 88, 20 t). A 16-way `--adopt` loop keeps only the last name.

---

## First-box / ext rank / roads / depot — BasePlan-only on the race?

Tiles, yes. Count policy, no.

| knob | live on this race (no `planV2`) | would be, if adopted |
| --- | --- | --- |
| **First-box** | **inert.** No `plan.t.container`. Cycle-10: source seats `level >= 3` (`construction.ts:1422`, `:1432`). Hub container still RCL2 (storage tile + `spawn.y-2`). | `plannedTilesFor` prefix-1 = object-order `[0]`. 6/16 far-first (`_next-boxes.md`). Min-chebyshev is **not** implemented. |
| **Ext rank** | **count yes, tiles no.** `extensionTake` (`lvl<=3 → 5`) on BasePlan (`:499–503`) **and** checkerboard (`construction.ts:306–316`). Tiles = hub ring + checkerboard, not layer-ext. | Same take. Tiles = `layer-ext.mjs:2148–2189` nearest-sitter walk (+3 shallow), prefix of that array. |
| **Roads** | **held to RCL4.** `BasePlan.ts:489` `rcl < 4 continue` (cycle-9 KEEP). `basePlanRoadsActive` silences pathBuilder. | `typeAllowedAtRcl` road `>=3`; `roadsForRcl` still returns eco+tower arterials at 3. Cycle-9 did **not** land here (`_review-src.md` §2). |
| **Depot tile** | **legacy heuristic.** `siteLegacyControllerDepot` (`construction.ts:658–700`, RCL3, cheb 2–4, prefer 3). Plus leftover pathfinder ctrl box at `level >= 3`. | `plan.t.container[2]`, cheb 3, parkable on all 16 (`_next-boxes.md` §2). |

`construction()` never enters `placeFromPlanV2`, so SURFACE #6 /
first-box / plan-order containers / plan roads are dead on both
racers. leftover-5 *count* is the KEEP that actually fires.

---

## Control `e839fc8` vs candidate

Same miss. Different legacy stack.

Control AutoExpand at freeze already has `runPackAdoption` /
`planPackMiss`. Control 80–86 are also empty (never write
`pacifist-race`). Both sides sit on BasePlan.

| | control `e839fc8` | candidate src now |
| --- | --- | --- |
| `planV2` on bench | none | none |
| fork | same `if (planV2) return` | same |
| BasePlan roads | **site at RCL3** (`rcl < 3` skip) | **hold to RCL4** (`rcl < 4`) |
| leftover-5 | **no** — engine cap; no `extensionTake` on BasePlan/checkerboard → 10 ext @ L3 (cycle-15 ctrl leak 6/10) | **yes** — both placers honor take |
| RCL2 source / ctrl boxes | **yes** — ctrl-path box `level >= 2 && <= 6`; source seats ungated (`:1113`, `:1118` at freeze) | source seats `level >= 3` (cycle-10) |
| legacy depot siter | **absent** | `siteLegacyControllerDepot` (cycle-8) |
| 15-tick v2 recycle | only if `planV2` | only if `planV2` |

Adopting on candidate flips **tiles and cadence**, not leftover-5
count. It **undoes** no-rcl2-boxes (plan still sites `container[0]`
at 2) and no-RCL3-roads (`roadsForRcl` non-empty at 3). Accepted
path-switch — do not also ship min-chebyshev (`_next-after-15.md` #4).

Adopting on control would make it not-BasePlan. Then it is not the
frozen leftover-5+6W+no-rcl2-boxes control. **Never write its
segments.**

---

## Minimal path — NEXT race, candidate only

Do not do this mid-race. Do not `push-race`. Do not `plan.mjs`.
Do not `--dest race` / `--user pacifist-race`. Commands:
`_next-adopt-plans.md`.

1. **Hygiene both racers** (`_clean-world.md`): extra bots off, empire
   parked, user-null scrub, `_scrub-racer-mem.mjs`. No leftover
   `planV2` / `rclTimes.8` / `planPackMiss`.
2. **Candidate console first:**
   `Memory.features.autoExpand = false`; delete `packAdopt` /
   `planV2Adopt`; `planAnim.active = false`.
3. **Push the 16-room bench pack** → dest `pserver` user `pacifist`
   segments 80–86, `bench: true`, 3 rooms/seg. **Not**
   `push-expansion-pack.mjs`. `--dry-run` must print `pacifist` and
   all 16.
4. **Prove control 86 empty** (token `local-pacifist-race-token-001`).
5. **Seed** `--wipe --yes --swap`. Then candidate console: delete
   `planV2` / `planPackMiss` / `planMigration` / `basePlan` on all 16
   names; `resetSpeedrun()`.
6. **Wait the sweep.** 25 t scan, one room, ≤200 t walk, 8 owned
   candidate rooms → plans inside ~1–2k t if 80–86 stay active.
7. **Gate before `--watch`:** candidate 8/8 `planV2` present,
   `planPackMiss` absent, `autoExpand` false. Control: `planV2`
   absent, BasePlan, leftover-5 still 5 ext at L3.

Fail the run if any candidate room is still `planPackMiss` after
200 t — delete the miss and `Memory.packAdopt`, confirm 80–86 read
back. Fallback: `push-plan.mjs` + `adoptPlan`, **one** room, wait
≤20 t, candidate rooms only (`_next-adopt-plans.md` §4).

If candidate never adopts, the run is this baseline again, not the
knob.
