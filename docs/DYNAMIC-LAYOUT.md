# Dynamic base layout (active work)

## Problem today

`rooms.construction.ts` is mostly **spawn-relative stamps**:

- Storage/hub container at `spawn.y - 2` (with a few fallbacks)
- Extensions on a fixed checkerboard around storage/spawn
- Roads along PathFinder to sources/controller after storage exists
- Square rampart ring at range 10 from storage

That breaks or is terrible when:

- Spawn is against a wall / controller / exit
- Sources are far on the wrong side of the hub
- The room is asymmetric (swamp walls)

## Direction

1. **Score a hub** once per room (or when RCL/spawn changes): open space, distance to sources + controller, away from exits/edges.
2. **Stamp a compact core** relative to hub: storage, terminal, towers, labs later — not relative to whatever spawn landed on.
3. **Extensions**: flood-fill open tiles by distance to hub (roads on checker/even pattern optional).
4. **Cache** `room.memory.basePlan` so we don’t rescore every tick.
5. **Migrate carefully**: if structures already exist, keep them; plan fills gaps / next RCL only.

## Module

`src/utils/BasePlan.ts` — pure planning + memory cache.  
`rooms.construction.ts` — place sites from plan (thin executor).

## Non-goals (for now)

- Full min-cut bunker (later)
- Moving spawn after place (too expensive)
- RCL8 calm/hibernation
