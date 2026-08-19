# Next — skip CB if visible spawn leftover / 20 > DG
`maybeSpawnColonyBuilder` → `spawnSiteUnfinishable`: visible MY spawn site, `(progressTotal-progress)/20 > ticksToDowngrade` → skip (cannot finish). No vision: keep.
Already in `src/Rooms/rooms.spawning.ts`. Race-inert (no spawnless RCL1).
Push-main only if E37N57 still spawnless, DG<400, 0 CBs.
Do not unclaim E36N57. Do not reclaim E36N58. No push-race.
Dead on race; leftover extras only.
