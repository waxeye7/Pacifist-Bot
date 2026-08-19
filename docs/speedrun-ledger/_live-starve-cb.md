# Live starve CB — dest `main` shard3 after `basePlan.structures.spawn[0]` push

2026-08-16T01:00:35Z → **01:02:10Z**. HTTP GET dest `main` (`screeps.com`) shard3 tick **82278106** → **82278146**. No Memory write. No further push. Do **not** unclaim **E36N57**.

PacifistBot `62f89e0d84c31c184db79629` · GCL pts 356512982 → **356513524** · GCL 12 · CPU 20 · last 14.09 → **15.91** / 100t **13.15** / 500t **12.56** · **bucket 10000**. Credits 762k.

## Answer

**Yes — a CB is queued to E36N58.** No-vision fallback now sees `basePlan.structures.spawn[0]`. **0** live CBs in the extras. Sites still **0/15k** (nobody standing there yet). **0** CBs to E37N57 (nearest-first). **No scout needed.** E36N57 **KEEP**.

| | Live @ 82278106–46 |
| --- | --- |
| Push | **landed.** `modules.main` sha256 `7ebcd1fdaedeaa5dbb6e5926d22c3e4a53be71a7b708f3ab8c08830f76f33762` (was `e261bfef…`). Bytes **2004751** (was 2004626). Needles: `roomLooksSpawnlessOwned` / `Do not prefer target_colonise` / `Never trust target_colonise` / `E35N59 Enrique` **true** |
| `Memory.creeps` `buildcontainer` | **1** — `ContainerBuilder-81420124-E37N59` · `targetRoom: **E35N59**` · in **E35N59 14,42** · 400e · fatigue 64 · `building: true` (old brick CB) |
| E37N59 `spawn_list` CB | **`ContainerBuilder-11539103-E37N59` · `targetRoom: **E36N58**` · `fill: true` · 24-part** · queue length 3 (head) |
| CBs `targetRoom` E36N58 | **1 queued, 0 live** |
| CBs `targetRoom` E37N57 | **0** |
| E36N58 spawn site | Spawn3 **42,6 · 0/15000** · 0 creeps |
| E37N57 spawn site | Spawn6 **26,29 · 0/15000** · 0 creeps |
| scouts | **0** — not required. Both extras have `basePlan.structures.spawn[0]` (42,6 / 26,29). `basePlan.spawn` still **unset**. |

First GET @ **82278106** still had empty `spawn_list` (0 extra CBs). Refill is empty-queue + `(time - lastTimeSpawnUsed) % 35 == 0` (RCL6). `lastTimeSpawnUsed` **82277828** → fire **82278108**. Second GET @ **82278137** had the E36N58 CB at queue head. Spawn1 is hatching a local **Builder-58752753** (done **82278184**, ~38 t). CB hatches after that. Storage **30215**.

`target_colonise` still **E35N59**. Dispatcher did **not** use it. Nearest finishable from E37N59 is E36N58 (lin 1) over E37N57 (lin 2). E37N58 storage **5790** cannot mother. E36N57 has no live storage.

## E36N57 still owned

**Yes.** Controller.user is us. In `user/rooms` (7 owned). Do not unclaim.

| | |
| --- | --- |
| owner | **PacifistBot** `62f89e0d84c31c184db79629` |
| RCL | **3** p=91254 · DG **20000** (82298146) |
| spawn | **yes** Spawn5 21,27 ours · idle e=300 |
| sites | **10** road 0/300 ours |
| creeps | **17** ours, 0 foreign · 4U 8C 2EM 1filler 1Repair 1Sweeper |
| structs | 10 ext (500e) · tower 18,20 e=1000 · 5 containers |
| SM | expired (end 82270833) · avail 1 · CD 82300833 |
| danger / fuse | **false** / **false** |
| expand / colonise target | **no** |

Owned also: E37N59 E37N58 E35N59 E39N58 E36N58 E37N57.

## Spawn sites

| Room | Owner | RCL | p | DG left | Standing spawn | Site | Creeps |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: |
| **E36N58** | us | **1** | 0 | **5062** (82283208) | none | **Spawn3 42,6 0/15k** ours | **0** · CB queued from E37N59 |
| **E37N57** | us | **1** | 0 | **4853** (82282999) | none | **Spawn6 26,29 0/15k** ours | **0** · waiting (not nearest) |
| **E36N57 KEEP** | us | **3** | 91k | **20.0k** | Spawn5 21,27 | 10 road 0/300 | 17 |
| E35N59 brick | us | **2** | 600 frozen | **5445** | **Enrique** 25,10 | none ours | 1 old CB @ 14,42 |
| E39N58 brick | us | **2** | 2280 frozen | **2841** | **Zhaban** 32,17 | 0 ours · 16 foreign | 0 |
| E36N59 dropped | — | 0 | 0 | — | none | leftover Spawn2 19,7 **3500**/15k | 0 |
| E38N59 dropped | — | 0 | 0 | — | none | leftover Spawn7 20,20 **0**/15k | 0 |

E36N58 / E37N57: `danger` false · no foreign spawn · `speedrun` RCL1 since 82263208 / 82262999 · `planPackMiss` 82275332 / 82275107 · `basePlan.structures.spawn` **[{42,6},{40,6}]** / **[{26,29},{24,29}]** · `basePlan.spawn` **unset**. Finishable without vision after this push.

## E35N59 still brick (ok)

Still Enrique. Still ours. Not finishable. p=600 frozen. 532 leftover walls. 0 our sites.

CB-81420124 still `targetRoom: E35N59`, `building: true`, walking **14,42**. Will upgrade or TTL. Cannot finish a spawn.

## AutoExpand (read-only)

| | |
| --- | --- |
| `Memory.autoExpand` | **stuck** `{ room: E35N59, spawnPos: 28,20, phase: "claimed", since: 82272940, started: 82271500 }` · **~5.2k** in `claimed` |
| `Memory.target_colonise` | **E35N59** spawn_pos 28,20 · `lastSpawnRanger` 82271501 |
| `features.autoExpand` | **unset = ON** · no `claimRemotes` · speedrun / dynamicLayout / minCut / pickupLock **on** · `placeFromPlan` **false** |
| `CanClaimRemote` | **5** (12 − 7 owned) |
| `CLAIMED_SPAWNLESS` 8000 | **in binary** · fires **82280940** (~2.8k t) |
| live `PHASE_TIMEOUT` 20k | **82292940** (~14.8k t) |
| 25k janitor | last 82275000 · next **82300000** (~21.9k) |

E37N59 mother: storage **30215** · Spawn1 hatching Builder (done 82278184) · E36N58 CB at queue head. E37N58 storage 5790 — cannot pay.

Do not unclaim E36N57. Do not push-race. No Memory write. No SSH.
