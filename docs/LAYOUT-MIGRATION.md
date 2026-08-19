# Layout + perimeter migration tracker

**Goal:** dynamic hub plan + **min-cut** rampart perimeter (not square shell).  
**Status:** in progress. Placement is **per room**, not global — see below.

## What actually switches placement on

There is no global placement flag. The switch is **`room.memory.planV2`**:

| State | Effect |
|-------|--------|
| `room.memory.planV2` absent | legacy stamp construction runs (`rooms.construction.ts`) |
| `room.memory.planV2` present | `construction()` short-circuits into `placeFromPlanV2` — legacy stamps never run in that room |

Placement alone only ever **adds** structures. Removing anything needs a second,
explicit arm:

| State | Effect |
|-------|--------|
| no `room.memory.planMigration` | placement only; off-plan legacy structures are left standing |
| `planMigration.mode = "gradual"` | operator-armed migration (`migratePlan(room)`) |
| `planMigration.mode = "auto"` | auto-armed for a *young* room (RCL < 4 **and** < 15 structures) at adoption |

Every destructive action goes through `migrationAllowed` (`utils/PlanV2.ts`),
which additionally blocks on hostiles, safe mode, low storage and downgrade
risk. A re-adopted plan whose hash changed demotes a heuristic `auto` arm on an
established room back to placement-only.

Adopt / drop / arm from the console:
`adoptPlan(room)`, `dropPlan(room)`, `migratePlan(room[, true | "hub"])`, `migrateStatus()`.

`Memory.features` still carries `minCutWalls` (default `true`) and `squareWalls`
(default `false`) for the *planner's* wall generator — those two are read by
`rooms.construction.ts`. The old `dynamicLayout` / `placeFromPlan` flags and
their `enablePlaceFromPlan()` / `disablePlaceFromPlan()` console toggles were
read by nothing and have been removed.

Console: `features()`, `replanBase(room)`, `basePlan(room)`, `showPerimeter(room)`.

## Plan memory shape

```
room.memory.basePlan = {
  version, hub, structures, perimeter: [{x,y}...], score, scoredAt
}
room.memory.defence.perimeter  // mirror for combat
room.memory.construction.rampartLocations  // [x,y][] sync for erect roles
```

## Coupling inventory (full explore — do not skip)

### Done this pass
- Min-cut perimeter in `BasePlan` + `MinCut.ts`
- Defence tower/safeMode damaged-shell uses `Perimeter` helpers (not 8–13 only)
- Square shell generator gated off by default (`squareWalls: false`)
- Per-room placement via `room.memory.planV2`; demolition behind the migration arm
- Tracker + console: `replanBase`, `showPlan`, `showPerimeter`

### BLOCKER still open (~35 sites) — next waves

| Area | Assumption | Fix |
|------|------------|-----|
| `rooms.construction.ts` | Storage spawn.y-2, bin, labs, factory, spawns, links, towers stamps | Plan stamps only |
| `roomFunctions` findBin / findStorageContainer / findStorageLink | Fixed offsets | Memory IDs + plan |
| `creepFunctions` findStorage / bin / link + **RD cost matrices ±11 square** | Shell = Chebyshev square | Perimeter cost matrix |
| `RampartDefender` / `RRD` | storage range 8–12 / enemy@11 | Perimeter home |
| `SpecialRepair` | Square frame ±10 | Perimeter set |
| `rooms.labs.ts` | Lab offsets from storage | Cluster detect / plan |
| `energyMiner` storage link | storage+(-2,0) | Plan |
| `rooms.spawning` SpecialRepair / erect | range 8–10 | Perimeter |
| Dual legacy construction | ~~Still runs beside plan~~ | **Done** — `room.memory.planV2` short-circuits the stamps |

### MEDIUM later
Nuke band, maintainer ≥9, danger road ≤10, room-specific E41N58 radii, repair parking on bin tile.

## Refactor policy

We **will** leave medium items and fix when they bite — but perimeter + hub + placement land first so defense never looks at a missing square.

New rooms (race / auto-expand): adopt the plan and the room auto-arms migration
while it is young.  
Existing rooms: `adoptPlan` also ARMS force-ALIGN automatically (2026-08-19); run `migratePlan` when you
want the legacy layout retired.

## Test suite (next)

Offline multi-room PNG: terrain + hub candidates + stamps + min-cut vs square count.  
Local rooms: E2S7, E5S1, E9S8, swampy empties from mongo map.
