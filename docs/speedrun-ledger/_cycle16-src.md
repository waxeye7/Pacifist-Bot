# Cycle-16 src vs hygiene (read-only)

2026-08-16. **No src edit. No `push-race`. No mid-race revert.**
16 is already watching (`run-2026-08-16T03-18-19Z`, `_SPEEDRUN-STATE.txt`).
15 SEND BACK (`32092` vs `28657`; latch hatched 4W). Control frozen `e839fc8`.

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  revert sticky/overlap while 16 is live
```

Wanted after 15 SEND BACK: drop `lastSpawn=0` latch poke; keep clamp
skip + HOL exempt; leftover-5 on; **revert sticky + overlap before
seed**. Src did the first three. The revert did **not** land. 16 is
the pile, not the isolated 5W race (`_cycle16-stack.md`).

---

## Src now

| bit | wanted | src |
|---|---|---|
| latch poke `lastSpawn=0` in fiveWQueued block | drop | **absent** |
| stale self-heal `values.lastSpawn = 0` | stay | **only** that write (`rooms.spawning.ts:4324–4327`) |
| `fiveWQueued = true` on home 550 path | stay | **yes** (`:4416–4417`) — **write-only**, never read |
| clamp skip home `[5W,M]` 550 | keep | **yes** (`clampSpawnListToCapacity` `:208–219`) |
| HOL exempt `[5W,M]` 550 | keep | **yes** (`spawnFirstInLine` `:3021–3027`) |
| leftover-5 `extensionTake` `lvl<=3 → 5` | keep | **yes** (`PlanV2.ts:1095–1098`; BasePlan + checkerboard both call it) |
| 6W `amount: cap>=550 ? 6 : 4` | keep | **yes** (`rooms.spawning.ts:882`) |
| `STICKY_SOURCE_RANGE` / `atMine` | revert | **still in** (`creepFunctions.ts:1484`, `:1588–1691`) |
| `overlapReplaceWanted` / `cullOverlapShuttle` | revert | **still in** (`rooms.spawning.ts:481`, `:1448–1452`, `:3436–3484`) |

No leftover poke in the fiveWQueued block. `rg lastSpawn\s*=\s*0`
in `src/` is the poisoned-stamp self-heal (`!onTheWay && lastSpawn
recent`) and the unrelated `lastSpawnCarrier` future-stamp heal.
550 path stamps `lastSpawn = Game.time` then `fiveWQueued = true`.
It does **not** zero `lastSpawn` to force an extra miner.

`fiveWQueued` cannot flood or un-flood anything now. Flag is cargo.
Leave the write; do not re-add the poke.

---

## What 16 can teach (pile vs `e839fc8`)

Live stack:

```
leftover-5 + 6W + no-RCL3-roads + no-RCL2-boxes
+ real 5W (clamp+HOL, poke gone)
+ sticky + roster-D overlap
```

vs August 1 `e839fc8` on this clean `--swap` 16-room world. Campaign
health check. **Not** a KEEP/SEND BACK on 5W, sticky, or overlap.

Film only (process, not ticks): hatch `WORK=5`; clamp/HOL 550→450
logs **dead**; after leftover 2W dies **10 e/t** not 8; **1**
miner/source until the 1500-gate (not 2, not 10+); leftover-5 cand
L3 **5 ext**.

Do not call on 7/8. Do not put **24512** next to it. A win is not
“16 KEEP 5W.” A loss is not “5W failed.”

---

## Next ONE isolated seed — after 16 is called

**Isolate real 5W.** Revert sticky + overlap (`_cycle16-hygiene.md`
§2). Keep clamp skip, HOL exempt, leftover-5, 6W, poke gone.
Do **not** revert mid-race.

Then seed one knob. Compare to this seed’s `e839fc8` **and** to
c10 **30002** (same KEEP stack without 5W / sticky / overlap).
Not vs 16’s pile (that Δ is sticky+overlap). Not vs 15 (latch-4W).

Roster D and sticky stay **after** that 5W race, one each, at 10 e/t.
