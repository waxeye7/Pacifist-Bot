# Cycle-16 live hygiene

`run-2026-08-16T03-18-19Z` · seedTick 4769652 · poll ~4777392 · mongo/redis read-only.

**FAIL** — Memory not scrubbed. World objects clean (0 leftover / 0 24512 dirt).

| gate | |
|---|---|
| 16/16 ctrl `pacifist1` / `pacifist-race`, not mixed | **PASS** |
| 0 leftover unowned planner boxes (pre-seed user-null / wrong-user) | **PASS** |
| 0 spawn-tile roads | **PASS** |
| 0 `planV2` / `rclTimes.8` on the 16 | **PASS** |
| `pacifist2` offline / 0 CCK | **PASS** |
| leftover objects that replay 24512 (pre-seed depot-range box) | **PASS** |
| Memory seed-clean (`autoExpand` / `target_colonise` / all `rooms` keys) | **FAIL** |

## Dirty (Memory)

`pacifist1`:

- `autoExpand` + `target_colonise` claiming **E2S7**
- `planV2` on live empire **E1S4** `5886t6` / **E2S1** `7kimhu` / **E2S8** `136itcf` (L6, not the 16)
- `Memory.speedrun` `skipHighRcl:true` `lastRcl:6` `rclTimes.{5,6}` primary E1S4
- stale `rooms.*.speedrun.rclTimes` (pre-seed startTick ~4335k; **no `.8`**):
  - E5S3 `{1,2,3,4}`
  - E12S3 `{1,2,3,4}`
  - E18S9 `{1,2,3,4}`
  - E11S6 `{1,2,3,4,5}`
- still owns L6 **E1S4 E2S1 E2S8**

`pacifist-race`: 0 `planV2`, 0 `rclTimes.8`, 0 `autoExpand`. Leftover remote `Memory.rooms` (E6S0 E12S9 …). `tasks.wipeRooms` lists cand **E5S3 E11S6 E16S9**. `DistressSignals.reinforce_me=E5S3`.

## Dirty objects

**None leftover.** 0 pre-seed non-terrain. 0 roads. 0 spawn-tile roads (E8S5 24,9 / E4S7 30,32 / E5S3 24,30 clear). 0 walkers. 0 CCK. 0 `pacifist2` creeps. `pacifist2` `active=0` `activeWorld=false`.

This-race user-null containers (would survive `--wipe`, not leftover): hubs + slam boxes. Planned-depot tile already up: **E3S5 (41,27)**. Depot-range also: **E21S4 (40,20)**. Not 24512 class until a wipe-only reseed.
