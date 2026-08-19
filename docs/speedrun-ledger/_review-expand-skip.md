Review `hasVisibleForeignSpawn` + `pick()` — read-only; no push; do not unclaim.
Predicate: vision && `FIND_HOSTILE_SPAWNS` (`my === false` only). No `Game.rooms` ⇒ false (trust pack). `pick()` `continue`s; all-skip deletes `autoExpand`.
Cannot skip our leftover spawn: `.my === true` is never hostile. Reclaim proceeds; `migrateSpawns` / `clearPlanSpawnTile` can retire it.
Unowned leftover (`user` undefined ⇒ `my === undefined`) misses the find — same hole `_live-spawn-block.md` warned; PlanV2 uses `FIND_STRUCTURES && !my`.
No in-tick infinite loop (finite `targets`). All-skip is a `CHECK_EVERY` 50t restart + log spam. Dead segment: 20k `PHASE_TIMEOUT` then same.
Skip is pick-only. No abort in `claiming`/`claimed`, no `spawnlessOwned` gate. Blind claim then later vision still 20k-wedges, then the next pack name.
Observer flicker: skip while seen, pick the same brick next cycle with no vision. No persistent skip list.
Ship later: `FIND_STRUCTURES && !my`; abort claimed/claiming; `spawnlessOwned` in `blockedReason`. Leave E36N57.
