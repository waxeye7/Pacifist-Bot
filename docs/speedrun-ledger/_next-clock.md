# Clock — spawn→RCL4 (seedTick vs startTick vs progress)
`rooms.ts` does **not** write `rclTimes`. It only sets `speedrun.active` / `speedrun.rcl` (= current level) and logs `progress%`. Stamps are `main.ts` `trackRoomRcl` (after `rooms()`, **before** creeps) → `applyTrack`.
Published means (`TIMES.md` / `race-hourly` / `race.mjs`) = first poll with `controller.level ≥ m` minus `seedTick`. They never read `startTick`, `rclTimes`, or `progress`.
`seedTick` is `/api/game/time` **before** that room’s `spawn-in` (cycle-15: 4696947–4697250, span 303; pair ~20). Not spawn-complete, not first creep.
`startTick` is first bot tick with `level===1` or `hasMySpawn`. RCL1 lock only moves it if unset or in the future — leftover past `startTick` stays (E4S7 autopsy).
First attach at RCL>1: `startTick=now` and only the **current** level is stamped → memory spawn→RCL4 can be 0.
`rclTimes[n]` = first **seen** `Game.time` at level n. Upgrade lands in `RunAllCreepsManager` after track (+1). Existing keys are never overwritten.
`ensureRoomClock` copies global `rclTimes` onto an empty **primary** room clock — leftover `.8` / old `.4` survive and block a new stamp (negative or huge `rclTimes[4]−startTick`).
`progress` is `lastSeen` only. The crossing is `level`; progress resets to 0 on the same action. Interpolating RCL4 from it misses the tick. Do not use it as the clock.
Poll window (cycle-15 `uncertaintyTicks` 130–190, `maxPollLag` 190) makes every milestone late on **both** sides — not an A/B lie.
**Means lie if:** watch starts after a crossing (RCL2/3/4 share that one `poll−seedTick`); or stale `seedOk` keeps an old `seedTick` across wipe (unowned gap, `_next-seed.md`).
Mixing `rclTimes[4]−startTick` with `poll−seedTick` disagrees by `(start−seed)+(poll−actual)`. Do not mix the two clocks.
`TIMES` completer mean (hits only) rises as slow rooms finish — mid-run RCL4 `n<8` is fast-biased. `race.mjs --summary` already flags unequal censoring.
`firstSeed=min(seedTick)` is tick-budget only; last rooms get ~300t less budget. It is not the per-room clock.
No src edit. No `push-race`. No reset. Formula is fine if you stay on `seedTick`+`level` and wait `8/8`.
