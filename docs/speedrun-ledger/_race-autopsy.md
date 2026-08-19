# Race autopsy — stalled / dark rooms

`run-2026-08-14T01-06-48Z` · label `cycle-0-local-baseline` · setHash `1f90aub`

Read-only. No push, reset, wipe, spawn-in, or bot-src edit.

**Clocks**

- Redis `gameTime` at mongo snapshot: **3132014**
- Ledger `watch.lastTick`: **3130182** (`updatedAt` 2026-08-14T01:33:02.187Z)
- Dashboard stills: tick **3130347** (`generatedAt` 2026-08-14T01:34:19.618Z)
- Film: `where.md` — "Film frames start from this rebuild — earlier ticks were not recorded."

Mongo `progressTotal` on every RCL2 controller in this world is still `200` (RCL1 leftover). Dashboard / engine climb to RCL3 is **45000**. Quoted `p` on living RCL2 rooms is progress toward that 45k.

---

## Verdict

Dark rooms are **not** extension policy, HOL, or a missing spawn plan.

They are **pacifist2 PvP** on a contaminated local world.

- `pacifist2` is online (Redis `userOnline:pacifist2`, `lastUsedCpu` 65) with RCL6–8 rooms including **E13S5, E19S7, E21S6**.
- Live CCK creeps in race rooms at 3132014: `ContinuousControllerKiller-1859162-E19S7-E16S9`, `ContinuousControllerKiller-147056-E19S7-E18S5`. Earlier same tick-window: `…-E13S5-E9S1`, `…-E19S7-E18S9`, plus `Claimer-2216187-E21S6` in E21S4.
- Every unclaimed / downgraded race controller is signed by `pacifist2`:

  > `"too close to pacifist bot room, claim elsewhere."`

  That string is hard-coded in `src/Roles/ContinuousControllerKiller.ts` after a successful `attackController`.
- `pacifist2` Redis `Memory.commandsToExecute` still queued CCK waves: E16S9 ← E19S7, E18S9 ← E19S7, E12S1 ← E13S5 (delay/bucket 3000).
- `pacifist2.Memory.target_colonise.room === "E21S4"` and `expand.phase === "claiming"` **since 3121550** — 807 ticks **before** candidate seed of E21S4 (3122357). `lastSpawnRanger: 3131178`.
- No NPC `Invader` creeps in the 16 rooms. Invader only owns SK rooms E5S4 / E15S4.

**After the spawn dies:** 0 creeps, `energyAvailable/cap 0/0`, a **new** spawn *site* (`Spawn2`…`Spawn19`, progress 0/15000 — not the seeded `Spawn1`). `ensureSpawnFirst` / `spawnFirstLockdown` re-sites a spawn and forbids other sites, but nothing can build it. Brick.

**Safe mode does not save RCL1.** `src/Rooms/rooms.ts`:

```ts
if (room.memory.danger &&
    (room.controller.level == 2 || room.controller.level == 3) &&
    (!room.memory.Structures.towers || room.memory.Structures.towers.length == 0)) {
  room.controller.activateSafeMode();
}
```

E21S4 still has `safeModeAvailable: 1` unused. Survivors that SM'd are E13S9 (cand) and E5S3 (ctrl) — still inside `safeMode` 3144201 / 3143776.

**Not HOL / not plan-missing as the dark cause.** Dead rooms have leftover `spawnStall` on a dead head name (symptom). Almost all race rooms are `planV2: false` + `planPackMiss` (legacy `basePlan` still present). The six living candidate rooms and E5S3 are spawning and upgrading on that path.

**World is not a clean race shard.** Candidate `pacifist` (`pacifist1`) also owns eight RCL8 rooms (E1S4, E2S1, E2S7, E2S8, E3S3, E4S6, E7S2, …). Redis memory has **67** `Memory.rooms`. `race.mjs` wipe already warns: room memory is not cleared. E4S7 still has leftover `rclTimes.8: 3121322` and `planV2` from before this seed.

---

## Candidate RCL2 918 — honest? Will it censor RCL3/4?

Dashboard / `race-mean.mjs`: mean of rooms that **already have** a milestone. Not 8/8 forced.

Ledger RCL2 elapsed (poll upper bound):

| slot | room | elapsed | now |
| --- | --- | ---: | --- |
| B5 | E4S7 | 381 | alive, p=41134/45k |
| B4 | E8S3 | 949 | alive |
| B7 | E3S5 | 976 | alive |
| B2 | E13S9 | 987 | alive, SM |
| B6 | E6S1 | 995 | alive |
| B3 | E8S5 | 1049 | alive |
| B1 | E9S1 | 1088 | **unclaimed** |
| B8 | E21S4 | — | **never RCL2** |

(1088+987+1049+949+381+995+976) / 7 = **917.86 → 918**. `hit 7/8`. That arithmetic is honest.

It is **not** a preview of RCL3/4:

1. **E21S4 is already excluded.** If it ever hits RCL2 it will be ~10k+ elapsed and pull the 8/8 mean up. If it never hits, RCL3/4 stay `hit ≤ 6/8`.
2. **E9S1 is inside 918 and then died.** Memory `rclTimes.2: 3123242`, then `lastRcl: 1`, controller now `user: null`. It cannot contribute RCL3/4.
3. **At most 6 candidate rooms** can still make RCL3 (the living six). Fastest is E4S7 at 41134. No RCL3 milestone exists yet (`means.3.hit: 0`).
4. **Control 1057 (8/8) is historical RCL2 only.** Seven control rooms are now dark. Control RCL3/4 will be **0 or 1 / 8** (only E5S3 is alive).
5. **E4S7 381 is a real poll time** but the room is not a clean spawn: leftover `planV2`, `observe`, `rclTimes.8`, `startTick: 3121322` (before seed 3122302). Profile is also easy (`ctrlSteps: 3`, hardness 0.0188). Do not treat 381 as the same experiment as the ~950–1050 cluster.

Control RCL2 (all 8 hit, then 7 died): 859, 932, 1052, 1090, 1107, 1125, 1144, 1149 → mean **1057**.

---

## 16 rooms at tick 3132014

`ours` = controller.user is that side's racer. Spawn-in placed a **standing** `Spawn1`; a site named `SpawnN` with p=0 means the standing spawn was lost and SPAWN FIRST re-sited.

### Candidate (`pacifist` / `pacifist1`)

#### B1 E9S1 — DARK / lost (hard, seed 3122227, RCL2 @ 1088)

| | |
| --- | --- |
| RCL / progress | **0 / 0** (unclaimed). Was RCL2. Memory `rclTimes.2=3123242`, `lastRcl=1`. |
| Spawn standing | no |
| Spawn site | **Spawn19** (31,36) **0/15000** user pacifist |
| Creeps | 0 |
| energy | 0 / 0 |
| Sites | spawn×1 |
| Controller ours? | **no** (`user: null`) |
| Extra | `sign.user=pacifist2` time **3130198**, same CCK text. `sma=0` `smc=3180198` (SM was used, then expired). `lastPvpTime=3126169`. Memory: `danger:true`, `blown_fuse:true`, `lastTimeSpawnUsed=3126023`, `spawnStall=15` on dead `Carrier-664838-E9S1`. CCK `…-E13S5-E9S1` was in-room earlier this watch. |

**Why:** spawn lost to PvP, SM expired, CCK `attackController` unclaimed the room. Leftover 0-progress spawn site, 0 creeps → brick. Not HOL.

#### B2 E13S9 — alive (hard, seed 3122246, RCL2 @ 987)

| | |
| --- | --- |
| RCL / progress | **2 / 20358** (dash pt 45000) |
| Spawn standing | **Spawn1** (17,33) 5000/5000 |
| Spawn site | no |
| Creeps | 15: Carrier 5, Upgrader 4, EnergyMiner 3, Builder 2, Repair 1 |
| energy | 450 / 450 (3 ext) |
| Sites | container×2 (0), extension×2 (710/6000) |
| Controller ours? | **yes**. `safeMode=3144201` `sma=1` |
| Extra | `lastPvpTime=3129402` — attacked, SM still up. `planV2:false` `planPackMiss=3131364`. |

#### B3 E8S5 — alive (hard, seed 3122266, RCL2 @ 1049)

| | |
| --- | --- |
| RCL / progress | **2 / 16612** |
| Spawn standing | **Spawn1** (24,9), spawning `Carrier-1987563-E8S5` |
| Spawn site | no |
| Creeps | 20: Upgrader 7, Carrier 6, EnergyMiner 2, Builder 2, filler 1, Repair 1, Sweeper 1 |
| energy | 500 / 550 (5 ext) + 2 containers (629e) |
| Sites | container×3 (374/15000) |
| Controller ours? | **yes**. `sma=2` unused. `lastPvpTime` null. |

#### B4 E8S3 — alive (median, seed 3122284, RCL2 @ 949)

| | |
| --- | --- |
| RCL / progress | **2 / 18478** |
| Spawn standing | **Spawn1** (22,16) |
| Spawn site | no |
| Creeps | 15: Carrier 5, Upgrader 4, EnergyMiner 2, Builder 2, Repair 1, Sweeper 1 |
| energy | 550 / 550 (5 ext) + 2 containers |
| Sites | container×3 (3215/15000) |
| Controller ours? | **yes**. `sma=2`. `lastPvpTime` null. |

#### B5 E4S7 — alive, fastest (median, seed 3122302, RCL2 @ 381)

| | |
| --- | --- |
| RCL / progress | **2 / 41134** (closest to RCL3) |
| Spawn standing | **Spawn1** (30,32) |
| Spawn site | no |
| Creeps | 16: Carrier 7, Upgrader 5, EnergyMiner 2, Sweeper 1, Repair 1 |
| energy | 550 / 550 (5 ext) + container 2000e |
| Sites | none |
| Controller ours? | **yes**. `sma=2`. `lastPvpTime` null. |
| Extra | **leftover empire memory:** `planV2:true`, `rclTimes.8=3121322`, `startTick=3121322` (before seed). Only race room with adopted v2 plan. |

#### B6 E6S1 — alive (median, seed 3122320, RCL2 @ 995)

| | |
| --- | --- |
| RCL / progress | **2 / 10094** (slowest living climb) |
| Spawn standing | **Spawn1** (38,25), spawning `Carrier-1702030-E6S1` |
| Spawn site | no |
| Creeps | 16: Carrier 5, Upgrader 4, EnergyMiner 3, Builder 2, filler 1, Repair 1 |
| energy | 258 / 550 (5 ext) |
| Sites | container×4 (2941/20000) |
| Controller ours? | **yes**. `sma=2`. `lastPvpTime` null. `spawnStall=4` on a live Carrier — not brick. |

#### B7 E3S5 — alive (easy, seed 3122339, RCL2 @ 976)

| | |
| --- | --- |
| RCL / progress | **2 / 29050** |
| Spawn standing | **Spawn1** (23,27) |
| Spawn site | no |
| Creeps | 15: Carrier 4, Upgrader 4, EnergyMiner 2, Builder 2, Sweeper 1, Repair 1, filler 1 |
| energy | 550 / 550 (5 ext) + 4 containers (257e) |
| Sites | container×1 (70/5000), **road×4 (0/1200)** |
| Controller ours? | **yes**. `sma=2`. `lastPvpTime` null. |

#### B8 E21S4 — DARK / brick, never RCL2 (easy, seed 3122357, milestones `{}`)

| | |
| --- | --- |
| RCL / progress | **1 / 0** (never put 200e on the controller) |
| Spawn standing | no |
| Spawn site | **Spawn12** (45,15) **0/15000** user pacifist — same tile as `basePlan.structures.spawn[0]` |
| Creeps | 0 (dashboard frames showed visiting `RA` / `CL` only) |
| energy | 0 / 0 |
| Sites | spawn×1 |
| Controller ours? | **yes, still claimed** (`user: pacifist1`). `upgradeBlocked=3131942`. `sma=1` **unused**. `downgradeTime=3319662` ≈ spawn-in RCL1 timer, never refreshed. |
| Extra | `lastPvpTime=3123953` (elapsed ~1596). Memory `lastTimeSpawnUsed=3123935`, `danger:true` `danger_timer=449`, `blown_fuse:true`, `spawnStall=16` on dead `Filler-1303814-E21S4`. `rclTimes` has only `"1": 3122367`. |

**Why:** `pacifist2` was already colonising this room (`expand.since=3121550`) from E21S6. Rangers + claimer. Spawn worked ~1578 ticks then died with the first recorded PvP; **RCL1 never activates SM**. Claimer on controller (`upgradeBlocked`). 0 creeps / 0 energy / 0-progress spawn site → brick. Not a missing plan (basePlan spawn tile is exactly the site). Not HOL as the first cause — the spawn was producing until PvP.

Ledger `lastSeen` creeps:1 at 3130182 counted a visitor, not a home creep.

---

### Control (`pacifist-race`)

#### B1 E5S3 — alive, only living control (hard, seed 3122216, RCL2 @ 932)

| | |
| --- | --- |
| RCL / progress | **2 / 12309** |
| Spawn standing | **Spawn1** (24,30) |
| Spawn site | no |
| Creeps | 25: Upgrader 10, Carrier 6, Builder 4, EnergyMiner 2, Sweeper 1, Repair 1, filler 1 |
| energy | 550 / 550 (5 ext) + 3 containers (1931e) |
| Sites | container×2 (182/10000) |
| Controller ours? | **yes**. `safeMode=3143776` `sma=1`. `lastPvpTime=3128785`. |

Attacked; SM still running. Same SM gate as candidate.

#### B2 E12S3 — DARK / lost (hard, seed 3122237, RCL2 @ 859)

| | |
| --- | --- |
| RCL / progress | **0 / 0** unclaimed |
| Spawn standing | no |
| Spawn site | **Spawn3** (32,22) 0/15000 |
| Creeps | 0 (frames had `CC` visitors) |
| energy | 0 / 0 |
| Sites | spawn×1 |
| Controller ours? | **no** |
| Extra | sign pacifist2 @ **3129963**. `lastPvpTime=3124526`. Memory room **deleted** (ctrlMissing). |

#### B3 E18S9 — DARK / brick, still claimed (hard, seed 3122256, RCL2 @ 1144)

| | |
| --- | --- |
| RCL / progress | **1 / 1548** (downgraded from 2; p>pt leftover) |
| Spawn standing | no |
| Spawn site | **Spawn6** (33,9) 0/15000 |
| Creeps | 0 |
| energy | 0 / 0 |
| Sites | spawn×1 |
| Controller ours? | **yes** (still `pacifist-race`) |
| Extra | sign pacifist2 @ **3131438** (second wave; earlier sign 3126699). `upgradeBlocked=3132438`. `sma=0` `smc=3180351`. `lastTimeSpawnUsed=3124807`. CCK `…-E19S7-E18S9` was in-room; another CCK still queued. |

RCL1 + no towers → SM code does not fire. Next CCK will unclaim it.

#### B4 E11S6 — DARK / lost (median, seed 3122275, RCL2 @ 1125)

| | |
| --- | --- |
| RCL / progress | **0 / 0** unclaimed |
| Spawn standing | no |
| Spawn site | **Spawn2** (23,24) 0/15000 |
| Creeps | 0 |
| energy | 0 / 0 |
| Sites | spawn×1 |
| Controller ours? | **no** |
| Extra | sign pacifist2 @ **3128105**. `lastPvpTime=3124118`. Memory room deleted. |

#### B5 E16S9 — DARK / lost (median, seed 3122293, RCL2 @ 1107)

| | |
| --- | --- |
| RCL / progress | **0 / 0** unclaimed (was still RCL1 at first mongo pass this autopsy) |
| Spawn standing | no |
| Spawn site | **Spawn5** (38,32) 0/15000 |
| Creeps | **pacifist2 CCK** `ContinuousControllerKiller-1859162-E19S7-E16S9` |
| energy | 0 / 0 |
| Sites | spawn×1 |
| Controller ours? | **no** |
| Extra | sign pacifist2 @ **3131167**. `lastTimeSpawnUsed=3124099`. Memory `blown_fuse:true`. CCK still queued. |

#### B6 E18S5 — DARK / lost (median, seed 3122310, RCL2 @ 1090)

| | |
| --- | --- |
| RCL / progress | **0 / 0** unclaimed |
| Spawn standing | no |
| Spawn site | **Spawn7** (6,31) 0/15000 |
| Creeps | **pacifist2 CCK** `ContinuousControllerKiller-147056-E19S7-E18S5` |
| energy | 0 / 0 |
| Sites | spawn×1 |
| Controller ours? | **no** |
| Extra | sign pacifist2 @ **3130526**. Earlier tombstone `user:pacifist2`. `lastTimeSpawnUsed=3124648`. |

#### B7 E12S1 — DARK / lost (easy, seed 3122329, RCL2 @ 1149)

| | |
| --- | --- |
| RCL / progress | **0 / 0** unclaimed (was RCL1 p=4436 with site 2020/15000 at 3130347) |
| Spawn standing | no |
| Spawn site | **Spawn8** (27,19) **2020/15000** (only site with any progress) |
| Creeps | 0 |
| energy | 0 / 0 |
| Sites | spawn×1 |
| Controller ours? | **no** |
| Extra | sign pacifist2 @ **3131694**. CCK `…-E13S5-E12S1` was spawning in E13S5; command still queued. `lastTimeSpawnUsed=3127134`. 2020 progress = leftover builder work before the last creeps died, then CCK finished the claim. |

#### B8 E13S7 — DARK / lost (easy, seed 3122348, RCL2 @ 1052)

| | |
| --- | --- |
| RCL / progress | **0 / 0** unclaimed |
| Spawn standing | no |
| Spawn site | **Spawn4** (18,17) 0/15000 |
| Creeps | 0 (dashboard last still had `WC` visitor) |
| energy | 0 / 0 |
| Sites | spawn×1 |
| Controller ours? | **no** |
| Extra | sign pacifist2 @ **3128090**. `lastPvpTime=3124032`. Memory room deleted. |

---

## Ledger `lastSeen` @ 3130182 vs live @ 3132014

| room | lastSeen | live |
| --- | --- | --- |
| E9S1 | L1 s0 c1 | L0 s0 c0 unclaimed |
| E21S4 | L1 s0 c1 | L1 s0 c0 still claimed, p=0 |
| E12S3 | L0 s0 c0 | L0 unclaimed |
| E18S9 | L2 s0 c0 | L1 s0 c0 still claimed |
| E11S6 | L0 s0 c0 | L0 unclaimed |
| E16S9 | L1 s0 c0 | L0 unclaimed + live CCK |
| E18S5 | L1 s0 c0 | L0 unclaimed + live CCK |
| E12S1 | L1 s0 c0 | L0 unclaimed |
| E13S7 | L0 s0 c0 | L0 unclaimed |
| six cand + E5S3 | L2 s1 c10–21 | still L2, spawn standing |

Dashboard `stalled` flag is `spawns===0 && creeps<=1 && level<target` — correct on the dark set; it does not distinguish "visitor counted as 1 creep" from a home bootstrap creep.

---

## Code map (why, not what to change)

| Symptom | Code |
| --- | --- |
| Controller sign + unclaim | `ContinuousControllerKiller.ts` `attackController` + sign + requeue CCK ~1015t |
| Spawn site after loss, nothing else built | `rooms.construction.ts` `ensureSpawnFirst`; `PlanV2.spawnFirstLockdown` |
| No SM on E21S4 / downgraded RCL1 | `rooms.ts` SM only if `level == 2 \|\| level == 3` |
| 0 energy / 0 creeps cannot rebuild 15k spawn | engine: no spawn ⇒ cannot spawn; site 0/15000 |
| `planPackMiss` on nearly all race rooms | `AutoExpand.runPackAdoption` — pack segments never adopted; **legacy `basePlan` still builds**. Living rooms prove this is not the brick. |
| Leftover E4S7 RCL8 memory | `race.mjs` wipe does not clear `Memory.rooms` |

HOL (`spawnFirstInLine` interleave after 10 `-6` at RCL≤3, `spawnStall`) is visible as leftover counters on dead rooms. It is not why those rooms went dark.

---

## Scoreboard at 3132014

| | alive spawn | claimed brick | unclaimed |
| --- | ---: | ---: | ---: |
| candidate | 6 | 1 (E21S4) | 1 (E9S1) |
| control | 1 (E5S3) | 1 (E18S9, about to drop) | 6 |

RCL3: none. Candidate E4S7 at 41134/45000. Control E5S3 at 12309/45000.

This A/B is not measuring spawn→RCL4 bot quality on the frozen set. It is measuring which RCL2 rooms `pacifist2` has not finished CCK'ing, plus leftover empire memory on E4S7.
