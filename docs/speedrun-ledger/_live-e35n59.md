# Live E35N59 — claimed brick

2026-08-16T00:43Z. HTTP GET dest `main` shard3 tick **82277841**. No Memory write. No push. Do not unclaim **E36N57**.

PacifistBot `62f89e0d84c31c184db79629` · GCL pts 356.51M → **GCL 12** · CPU 20 · last **15.80** / 100t avg **11.82** / 500t **12.75** · **bucket 10000**.

## Operator now (shard3 console; no code push)

`features.autoExpand` is **unset = ON**. `CLAIMED_SPAWNLESS` **8000 is not live**. Pointer sits in `claimed` until **PHASE_TIMEOUT 20k @ 82292940** (~15.1k t), then `pick()` **E38N56**.

```
stopExpand()
Memory.features.autoExpand = false
```

Leave **E36N57**. Leave E35N59 / E39N58 unless attacking the leftover spawn. Dead GCL slots until DG or combat.

`Memory.features.claimRemotes` already absent. **Keep it off.** Live code still claims remotes if `CanClaimRemote >= 3` (now **5**).

## Claimed / colonise

| | |
| --- | --- |
| `Memory.autoExpand` | **stuck** `{ room: E35N59, spawnPos: 28,20, phase: "claimed", since: 82272940, started: 82271500 }` · **4901t** in `claimed` · run 6341t |
| `Memory.target_colonise` | **E35N59** spawn_pos 28,20 · `lastSpawnRanger` 82271501 |
| `features` | speedrun / dynamicLayout / minCutWalls / pickupLock **on** · `placeFromPlan` **false** · **no `autoExpand`** · **no `claimRemotes`** |
| `CanClaimRemote` | **5** (12 − 7 owned) |
| `packAdopt` | absent |
| segment 86 | `push-live-expansion.mjs` · 7 names · **`seg` omitted** · **no leftover-spawn filter** |

Pack (owned skipped by `mine[]`): E37N58, E36N57, E39N58, E35N59 all ours. Next unowned: **E38N56** 74 @39,26 (empty, 2 src, no leftover spawn) · E34N57 73 @21,26 · E39N56 47 @26,37.

## E35N59 objects (539)

Controller **ours** 17,20 · **RCL2 p=600 frozen** · DG **82283591 (~5750t)** · SM avail **1** · no reservation.

| What | Live |
| --- | --- |
| Our spawn / site | **none**. Pack tile **28,20 empty swamp** (`terrain=2`, 0 objects). Legal site. Not placed. |
| Leftover | **Enrique** Spawn1 **25,10** `68da3f7d7b34b70012d9c41e` · 5000/5000 · e=300 · not spawning |
| Walls | **532** leftover `constructedWall` (no user). 0 roads / ramparts / ext / tower / container |
| Sources | 18,6 + 37,20 both **3000**/3000 regen 300 · mineral **O** 31,13 35k |
| Hostiles | 0 creeps. `danger` / `blown_fuse` **false**. No planV2. `planPackMiss` 82275982 |

`rooms.construction` only sites a spawn at **RCL1**. Window already closed. Live `ensureSpawnSite` is not landing a site (tile is free — either not on live, or failing silent). Engine cap is **our** structures; Enrique does not block a site on 28,20. Machine still waits for a **finished** MY spawn.

## CBs

**0 in room.** Two just TTL'd (24-part, 400e carry — `[8W,8C,8M]`):

| Tomb | Death | Decay | Where |
| --- | ---: | ---: | --- |
| 36,41 | 82277732 | 82277852 | south, **~24** from ctrl 17,20 |
| 18,37 | 82277807 | 82277927 | south, **~17** from ctrl |

They never reached the controller or pack tile. 532 leftover walls. p=600 unchanged since earlier polls.

**1 inbound:** `ContainerBuilder-81420124-E37N59` · `targetRoom: E35N59` · still in **E37N59** (E37N59 Spawn1 was mid-spawn at 82277811, `spawnTime` 82277829) · route E36N59 → E35N59 · `_exitStuck` 1 @12,18. Same trip as the tombs. Will upgrade (DG **< 6000**, no MY spawn site → `buildTheSpawnFirst` false) or TTL in the wall maze. Cannot finish a spawn.

Mother E37N59 storage **29.4k** — will keep minting CBs while `target_colonise` is this room.

## finish() 8000 — would it help?

**Not the operator move. Do not push it.** Src has it; live does not. Tree dirty.

| Clock | Tick | From now |
| --- | ---: | ---: |
| now | 82277841 | — |
| `CLAIMED_SPAWNLESS` 8000 | **82280940** | **~3100t** |
| E39N58 RCL2 DG | 82280949 | ~3110t |
| E35N59 RCL2 DG | 82283591 | ~5750t |
| live `PHASE_TIMEOUT` 20k | **82292940** | **~15.1k t** |

If 8000 were live it would `finish` in ~3.1k — ~2.6k **before** this room drops to RCL1, ~12k before 20k. That only **unsticks the pointer**. Without `spawnlessOwned()` the next `CHECK_EVERY` 50 `pick()`s **E38N56** (clean this time). Same slide that already did E39N58 → E35N59, shorter fuse. E35N59 / E39N58 / E36N58 / E37N57 stay spawnless GCL slots.

`stopExpand()` + `features.autoExpand = false` does the useful half **this tick**: drop `target_colonise`, stop the CB bleed, do not claim E38N56. 8000 cannot do that until it is pushed **and** 3.1k elapse.

Shipping 8000 without the hold is the current bug with a shorter fuse. Do not mid-race / dirty-tree push.

## Rooms

Owned (7): E37N59, E37N58, **E36N57**, E35N59, E39N58, E36N58, E37N57.

| Room | State | Spawn |
| --- | --- | --- |
| **E35N59** | RCL2 p=600 frozen · DG **~5750** · 0 creeps · 2 CB tombs · 532 leftover walls · 0 our sites | **Enrique** Spawn1 **25,10**. Pack **28,20** empty |
| **E36N57 KEEP** | RCL3 p=89470 · DG **full ~20.0k** · Spawn5 **21,27** ours · tower 18,20 e=1000 · 10 ext · 5 boxes · 20 creeps (7U 8C 2EM 1filler 1Repair 1Sweeper) · 10 road sites 0/300 · SM expired (end 82270833), 1 avail | ours |
| **E39N58** | RCL2 p=2280 frozen · DG **~3110** · 0 creeps · 0 our sites | **Zhaban** Spawn1 **32,17** + 16 foreign sites. Pack **23,27** empty |
| E36N58 | RCL1 p=0 · DG **~5370** · 0 creeps | site Spawn **42,6 0/15k** |
| E37N57 | RCL1 p=0 · DG **~5160** · 0 creeps | site Spawn **26,29 0/15k** |
| E36N59 dropped | unowned · leftover **our** Spawn2 site 19,7 **3500**/15k · 0 creeps | none |
| E38N59 dropped | unowned · leftover **our** Spawn7 site 20,20 **0**/15k · 0 creeps | none |
| E37N59 | RCL6 p=230k · storage **29.4k** · Spawn1 21,24 · 11 creeps · minting the next CB | ours |
| E37N58 | RCL4 p=105k · storage 7.4k · Spawn4 24,15 · 8 creeps · 17 ramparts · 0 sites | ours |
| E38N56 next pack | unowned · 2 src · 0 structs · no leftover spawn | pack 39,26 |

25k janitor last **82275000**. Next **82300000** (~22.2k). Then E36N58 / E37N57 / E38N59 / E36N59 leftover sites go unless a creep is standing there.

## Still true

- Leftover is **Enrique's**. `destroy()` fails. `migrateSpawns` does not apply.
- Do not attack / dismantle Enrique or Zhaban in this note.
- Do not `SC()` the brick — AutoExpand overwrites `target_colonise` while `claimed`.
- Do not unclaim E36N57. Do not push-main / push-race / reset / SSH.
