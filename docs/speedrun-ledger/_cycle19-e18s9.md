# Cycle-19 E18S9 — L3 p~11053 crawl, **not** c18 E16S9 1W blackout

`run-2026-08-16T07-40-10Z` · `cycle-19-5w-only` · seed0 **4891503** · seed E18S9 **4891635** · e2 **1598** · e3 **18487**.
mongo `rooms.objects` + redis `memory:pacifist1` + `users.code` + `users.notifications`.
Stamp **4926832** p=**11053** (`_RUNNING.txt`). Film **4928126 / 4928528 / 4928742 / 4929120** · elapsed **~35.3–37.6k / 40000**.
Watch **40404** left running.
No `push-race`. No seed. No src.

**Cause:** dest cheap-miner `homeWork < 4` replaced the 5W with **1W/2W**. Near `[W,M]` sits **36,12** (`_still` **1208**, `MoveTargetId` `road|…3403`) so src **46,4 stays 3000**. Far is the only income (`[W,M]` then dest-heal `[2W,M]`). `fiveWQueued` **true** both. fill **52→300**, never 550. Head is **CA / [] / UG 550**, not HOL `[5W,M]`. leftover-5 **HOLD**. **Not** c18 E16S9: no 5W-head at fill 89, no `liveMiners===0`, no frozen p, no DG.

## Dest — cheap-miner **IS** harden (`homeWork<4`)

| dest | user / branch | `users.code` ts | cheap-miner |
| --- | --- | --- | --- |
| **`pacifist`** (cand) | `pacifist1` main `activeWorld` | **2026-08-16T07:39:58Z** (seed-clean) | **yes** `homeWork < 4` → `[2W,M]`/`[W,M]` |
| `race` (ctrl) | `pacifist-race` main | 2026-08-06 (`e839fc8`) | **no** |

Gate (modules.main): head `EnergyMiner` · `cap>=550` · `available<550` · `bodyCost>=550` · then `if (homeWork < 4)`. `liveMiners===0` **absent**. `homeWork < 2` **0**. Heal only rewrites a **550-EM** head — idle on CA/UG. Far 1W TTL → dest bought `[2W,M]` (fill≥250). `fiveWQueued` then holds `lastSpawn+1500`.

## Clocks

leftover-5 **HOLD** ext **5 / 550**. 0 ext sites. No E18S9 DG notif.

| probe | tick | elapsed | p | miners WORK | fill | head | stall |
| --- | ---: | ---: | ---: | --- | ---: | --- | ---: |
| G (`_cycle19-5w-film`) | 4918901 | 27398 | **7622** | **2+1** | **206** | UG `4W1C1M` | 11 |
| **stamp** | **4926832** | **35329** | **11053** | — | — | — | — |
| A mongo+redis | **4928126** | 36623 | **12190** | **1+1** | **52** | `[2C,M]` 150 | **29** |
| B | 4928528 | 37025 | **12227** | **1+1** | **300** | `[]` | 0 |
| C | 4928742 | 37239 | **12277** | **1+2** | **300** | `[4W,C,M]` UG 550 | **53** |
| D redis | 4929120 | 37617 | ~12.3k | 1 stuck + 2 | (<550) | UG 550 | 19 |

p **7622→11053→12277** = **+1224 / 1910t** from stamp (**0.64 e/t**). L3 age ~18.6k → **0.66 e/t**. Need **~123k** more. **~2.4k** ticks left. **DNF.**

## Film — miners / spawn_list / energyAvailable / roads / leftover-5

`lastSpawn` = **queue stamp**, not hatch. `fiveWQueued` **true** both src all probes. `overlap4WQueued` **false**. `planV2` absent · `planPackMiss` 4926807. `speedrun.rclTimes` **stale** (old world) — ledger e2/e3 is truth.

| | A **4928126** | C **4928742** |
| --- | --- | --- |
| L / p / ext / cap | **3 / 12190 / 5 / 550** | **3 / 12277 / 5 / 550** |
| leftover-5 | **HOLD** 0 ext sites | **HOLD** |
| `energyAvailable` (live fill) | **52** (spawn 52 + ext 0) | **300** (spawn 250 + ext 50) |
| `spawn_list` | `[2C,M]` `Carrier-2554821` | `[4W,C,M]` UG |
| `spawnStall` | **29** (52 < 150) | **53** (300 < 550) |
| `lastTimeSpawnUsed` age | **31** | **503** (D: **103**) |
| roads / sites | **52 / 1** box 45,5 **2700/5000** | **52 / 1** box 45,5 **2900/5000** |
| tower / boxes | 34,8 **900e** · hub 35,11=0 · depot 28,6=0 · dirt 32,8 + 35,12 | same · all 0e |
| src 46,4 near / 19,40 far | **3000** / 2980 | **3000** / 2892 |
| creeps | 10 · 4 UG + 1 CA + 2 EM + B + filler + repair | 9–11 · 3 UG + 2 CA + 2 EM + B + filler |

### Miners

| miner | body | sit | src | note |
| --- | --- | --- | --- | --- |
| `…4333585` | **`[W,M]`** | **36,12** spawn-adj | **46,4** (`…3403` L=10) | **parked**. A→D **616+t** same tile. D: `_still` **1208** · `moving` true · path 36,12→**45,5** · `MoveTargetId` **`road\|…3403`**. No `harvested`. |
| `…1263664` | **`[W,M]`** | **20,39** seat | **19,40** (`…3405` L=28) | mining A/B. TTL 4928666 → dead. |
| `…2900808` | **`[2W,M]`** | **20,39** | **19,40** | dest heal after far 1W died (`lastSpawn` **4928679**). `harvested` true. |

Near lastSpawn **4927900** (age 226→842) = the parked 1W hatch. Far lastSpawn **4927159** then **4928679** (2W). Latch still inside 1500 on the fresh far stamp.

### Roads

L3 pave **cargo** (not this stall). arterialN **15** / plan 64. Standing **52** = haul + walkLine recycle (same overshoot as `_cycle19-pave-watch.md`). 0 road sites. 1-seat **45,5** is road **and** the box site the parked 1W is pathing to.

## vs cycle-18 E16S9 1W blackout

c18 E16S9 (`_cycle18-stall.md` / `_cycle18-e11s6.md`): L3 p **14551→15259 frozen** · e3 **13439** · live **1W** at 43,34 **mining** near 44,33 · far 22,18 **3000 dark** · fill **89–481** · head **`[5W,M]` 550 HOL** · dest **`liveMiners===0`** idle (`liveMiners=1`) · `lastUsed` **~1507** stale · roads **16/8 → 33/8** · tower **0e** · 5 creeps.

| | c18 **E16S9** | c19 **E18S9** |
| --- | --- | --- |
| p | **14.5–15.3k frozen** | **7.6→11.1→12.3k crawl** (0.6 e/t) |
| miners | **1W mining** near | **1W stuck 36,12** + far **2W mining** |
| dark src | far 3000 | **near 3000** (the stuck 1W's) |
| fill | 89–481 | **52→300** |
| head | **`[5W,M]` 550 HOL** | **CA 150 → [] → UG 550** |
| dest heal | `liveMiners===0` **blocked** | `homeWork<4` **fired** (far 2W) |
| lastUsed | **stale 1.5k** | **31–503** |
| leftover-5 | **HOLD** 5/550 | **HOLD** 5/550 |
| roads | 16–33 + 8 sites | **52 / 1** box |
| DG | no (room) / E11S6 yes | **none** |
| 5W | never while 1W live | G had 5+5; dest **dirtied** after TTL |

Same **family** (cheap leftover + a dark source + leftover-5). **Not** the same machine: c18 is HOL-550 + old gate. c19 dest already heals; the near 1W is a **`_still` park** on `road|src`, not a mining 1W blocking `===0`.

c19 **this-seed E16S9** is the counterexample: **5+5** · p **123k** · fill 371 · roads 41/0 · leftover-5 HOLD. The 18-hole is not back on that room.

## Hypothesis

| claim | film |
| --- | --- |
| same as c18 E16S9 1W blackout | **no** — crawl not freeze; head not HOL-5W; dest heal fired on far |
| dest missing cheap-miner | **no** — `homeWork<4` since 07:39Z; far `[2W,M]` is it |
| dest `WORK<4` dirties after 5W TTL | **yes** — G 5+5 → A **1+1** |
| leftover 1W + latch blocks 5W | **yes** — `fiveWQueued` + lastSpawn <1500 |
| HOL-550 + empty fill | **no** — heads were CA/UG |
| near 1W walking | **no** — `_still` **1208** at 36,12 |
| leftover-5 | **HOLD** ext=5 · 0 ext sites |
| RCL3 pave is the stall | **no** — cargo overshot; income is 0+4 e/t |

Not KEEP / SEND BACK (pile). Will **CENSOR** this room (need ~123k, ~2k left). Mark **29029** / this-ctrl **29694**. Pair E8S5 already L4 **33336**.

Did: redis `memory:pacifist1` + mongo objects + dest `users.code` + notifications. Did **not**: push-race, seed, reset, git push, unclaim, SSH, src.
