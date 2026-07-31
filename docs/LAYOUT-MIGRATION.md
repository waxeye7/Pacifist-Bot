# Layout + perimeter migration tracker

**Goal:** dynamic hub plan + **min-cut** rampart perimeter (not square shell).  
**Status:** in progress. Live placement is **flagged off by default**.

## Feature flags (`Memory.features`)

| Flag | Default | Meaning |
|------|---------|---------|
| `dynamicLayout` | `true` | Compute/cache `basePlan` (hub + stamps + min-cut perimeter) |
| `placeFromPlan` | `false` | Actually place construction sites from plan |
| `minCutWalls` | `true` | Prefer min-cut perimeter over square ring when planning |
| `squareWalls` | `false` | Legacy square ring generator (off when minCut on) |

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
- `placeFromPlan` default **false** (plan compute only)
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
| Dual legacy construction | Still runs beside plan | Gate stamps when placeFromPlan |

### MEDIUM later
Nuke band, maintainer ≥9, danger road ≤10, room-specific E41N58 radii, repair parking on bin tile.

## Refactor policy

We **will** leave medium items and fix when they bite — but perimeter + hub + placement flags land first so defense never looks at a missing square.

New rooms (race): `placeFromPlan` on when ready.  
Existing RCL5: plan computes + visualizes; placement stays off until adopt mode exists.

## Test suite (next)

Offline multi-room PNG: terrain + hub candidates + stamps + min-cut vs square count.  
Local rooms: E2S7, E5S1, E9S8, swampy empties from mongo map.
