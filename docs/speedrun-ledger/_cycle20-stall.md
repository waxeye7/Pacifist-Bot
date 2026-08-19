# Cycle-20 stall — E11S6 / E18S9 leftover-1W + HOL-550, dest WORK<2

`run-2026-08-16T08-58-29Z` · `cycle-20-5w-only` · seed0 **4932291** · e2 E11S6 **1296** · E18S9 **1821**.
mongo `rooms.objects` + redis `memory:pacifist1` + `users.code` + `users.notifications`.
Watch **19568** left running.
No `push-race`. No seed. No src.

**Cause:** leftover **1W/2W** + `fiveWQueued` latch + HOL-exempt `[5W,M]` at fill **65–396**. Dest cheap-miner is `homeWork < 2` and only rewrites an EnergyMiner **550-head** when `available < 550`. A live **2W** or **1+1** (`homeWork=2`) does **not** fire. `lastSpawn` is queue stamp — 5W waits TTL or 1500. **Not** c18 freeze: p **crawls**, **no DG**, dest **does** heal once leftover work drops below 2. **Not** c19 dest-dirty: dest does **not** replace a live 2W with another 2W.

Flag: E11S6 L2 **p=9081 c=10** · E18S9 L2 **p=10982 c=11**. Both still L2 after slam-550. Pair ctrl **E8S3 / E8S5 already L3**.

## Dest — cheap-miner **IS** WORK&lt;2

| dest | user / branch | `users.code` ts | cheap-miner |
| --- | --- | --- | --- |
| **`pacifist`** (cand) | `pacifist1` main `activeWorld` | **2026-08-16T08:57:49Z** (seed-clean) | **yes** `homeWork < 2` → `[2W,M]`/`[W,M]` |
| `race` (ctrl) | `pacifist-race` main | 2026-08-06 (`e839fc8`) | **no** |

Gate (modules.main): head `EnergyMiner` · `cap>=550` · `available<550` · `bodyCost>=550` · then `if (homeWork < 2)`. Comment: leftover 1W is not income; **a live 2W (work=2) can fill 550**. `liveMiners===0` **absent**. `homeWork < 4` **0**. Heal only rewrites a **550-EM** head — idle on CA/UG. `fiveWQueued` then holds `lastSpawn+1500`.

## Clocks

seed E11S6 **4932517** · E18S9 **4932291**. leftover-5 **HOLD** 5/550. L2 **0/0** roads. 0 DG notif either room.

| probe | tick | elapsed | E11S6 | E18S9 |
| --- | ---: | ---: | --- | --- |
| 5W-film C | 4939918 | 7627 | 2W + **5W-head** · p 7228 · fill **350** · stall **527** | **2+2** · p 6920 · cap 500 |
| **flag** | ~4947–49k | ~15–16k | L2 **p=9081 c=10** | L2 **p=10982 c=11** |
| lastSeen | 4948683 | 16392 | L2 **p=9364** c=10 | L2 **p=11189** c=9 |
| **A** mongo+redis | **4949015 / 4949346** | 16724 | **1+1** · p **9463** · fill **196** · UG head | **2** · p **11340** · fill **122** · **HOL 5W** stall **126** |
| **B** mongo | **~4950121** | 17830 | **1park+2** · p **9532** · fill **224–275** | **1+1** · p **11576** · fill **396** |
| **C** redis+mongo | **4950769** | 18478 | **2+5** · p **10002** · fill **350** · CA head | **2W walk** · p **12256** · fill **65** · HOL then dest **2W** |

p **9081→10002** = **+921 / ~3.3k** from flag (**0.28 e/t**). L2 age ~16.4k → **0.61 e/t**. Need **~35k** more. **~21.5k** left. **DNF** unless the C 5W holds.

E18S9 **10982→12256** = **+1274 / ~3.3k** (**0.39 e/t**). L2 age ~16.1k → **0.76 e/t**. Need **~33k**. **DNF** on cheap 1W/2W cycle.

## Film table

`lastSpawn` = **queue stamp**, not hatch. `fiveWQueued` **true** both src both rooms all probes. `overlap4WQueued` E11S6 **true stale** (dest overlap write **0**). `planV2` absent · `planPackMiss` live. `speedrun.rclTimes` **stale** (old world) — ledger e2 is truth.

| room | L / p | miners WORK | sit | fill (`energyAvailable`) | head (`spawn_list`) | stall | lastSpawn age | lastUsed age |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| **E11S6 A** | 2 / **9463** crawl | **1+1** | near **30,20** · far **26,20 park** | **196** | UG `[2W,2C,2M]` | 0 | 484 / 1488 | **724** |
| **E11S6 B** | 2 / **9532** | **1park+2** | far still **26,20** · near 2W **29,20** | **224–275** | (dest just hatched 2W) | — | — | fresh |
| **E11S6 C** | 2 / **10002** | **2+5** | near 2W **30,20** · far **5W 47,4** | **350** | CA `[4C,3M]` 350 | **54** | 403 / 1347 | **59** |
| **E18S9 A** | 2 / **11340** crawl | **2** | near **45,5** · far **3000 dark** | **122** | **EM `[5W,M]` 550** far | **126** | 1542 / **130** | **132** |
| **E18S9 B** | 2 / **11576** | **1+1** | both seats | **396** | dest cheap after 2W TTL | — | 1361 / 17 later | fresh |
| **E18S9 C** | 2 / **12256** | **2** | walk **32,14** (far) | **65** | HOL 5W → dest **`[2W,M]`** | **11** then hatch | 17 (5W queue) | **157** |

### E11S6 — parked 1W at **26,20**, then 5W luck

c18: p **6861 frozen** · **1W at spawn 26,20** not walking · both src **3000** · fill **54–237** · head **`[5W,M]` 550** · `lastUsed` **~6576** · dest `liveMiners===0` gated · then **DG L1 ×2**.

c20 A: **same tile 26,20**. `EnergyMiner-826989` `[W,M]` · `sourceId` **46,3 far** (`…032ab` L=24) · `MoveTargetId` **`road|…032ab`** · `_still` **303** · `moving` true · path 26,20→**47,4** · **no `harvested`**. B: still **26,20** (~1.1k parked). Other 1W `…3102610` on near 30,21 (`harvested`). src A **2796 / 2986**. 0 roads. Hub box site 25,20 **4343/5000** then standing. Roles A: 2 CA + filler + 2 EM + B + 2 UG + Repair. Heal **idle** (`homeWork=2`). Head A is a **400 UG**, not HOL-550. `lastUsed` 724 not 6k. p **9081→9463→9532→10002**.

C: parked 1W dead (ttl 4950546). Far lastSpawn **4950366** → **`[5W,M]`** `…171177` ttl 4952100 @47,4 `harvested` (src 46,3 **950**). Near leftover **2W** ttl 4951015. dest **did not** rewrite the 5W (`homeWork=2`). Fill lucked 550. Same recover as c18 E12S3 / c19 E12S3 — **after** the park, not instead of it.

### E18S9 — HOL-550 + dest WORK&lt;2 cycle, **not** c19 `_still` park

A: leftover **2W** `…3926798` @45,5 on near 46,4 (`harvested`, `MoveTargetId` `road|…3403`). Far 19,40 **3000 dark**. Head **`[5W,M]`** `EnergyMiner-562589` for `…3405` L=31. stall **126** (122 < 550). dest **idle** (`homeWork=2`). 0 roads / 0 sites. Boxes 35,11=0 · 32,8=0 · 35,12=26. 4 UG + 3 CA + filler.

B: 2W ttl 4949400 dead → dest `homeWork<2` bought **two `[W,M]`** (fill was 122 then climbed): `…562589` @20,39 far + `…4430933` @45,5 near. Both harvesting B. fill **396**.

C: both 1W dead together (ttl 4950906 / 4950921). HOL `[5W,M]` re-queued (`lastSpawn` **4950752** age 17) then dest rewrote to **`[2W,M]`** `…533483` walking 32,14 (far). fill **65**. Near dark again. `fiveWQueued` holds 5W until lastSpawn+1500.

**Not** c19 E18S9: that was L3 p~11k, 1W `_still` 1208 at 36,12, head CA/UG, dest `WORK<4` dirtied after 5W TTL. This seed is still L2, miner on seat (A) or walking (C), head **is** HOL-5W whenever leftover work≥2.

## vs cycle-18 / cycle-19 blackouts

| | c18 E11S6 | c18 E16S9 | c19 E11S6 | c19 E18S9 | **c20 E11S6** | **c20 E18S9** |
| --- | --- | --- | --- | --- | --- | --- |
| p | **6861 frozen** | **14.5–15.3k frozen** | **7891 crawl** → 13k | **7.6→12.3k crawl** | **9081 crawl** → 10.0k | **10982 crawl** → 12.3k |
| miners | **1W @ 26,20** | **1W mining** near | **2+2 on src** → 2+5 | **1W stuck 36,12** + far 2W | **1W @ 26,20** + near 1W → **2+5** | **2** then **1+1** then **2W** |
| dark src | both 3000 | far 3000 | none | **near 3000** | far 3000 while parked | far 3000 @A · near @C |
| fill | **54–237** | 89–481 | 5 then **550** | **52–300** | **196–350** | **122–396–65** |
| head | **5W 550 HOL** | **5W 550 HOL** | **4C4M** then `[]` | CA → [] → UG 550 | UG then CA | **5W HOL** then dest 2W |
| dest heal | `liveMiners===0` **blocked** | same **blocked** | `homeWork<4` idle (work=4) | `homeWork<4` **fired** | `homeWork<2` idle then **5W hatched** | `homeWork<2` **fired** on TTL |
| lastUsed | **6576** stale | **~1507** | **4–30** | **31–503** | **59–724** | **132–157** |
| leftover-5 | **HOLD** 5/550 | **HOLD** | **HOLD** | **HOLD** | **HOLD** | **HOLD** |
| roads | 0/0 | 16–33 + 8 | 0/0 | **52 / 1** | **0/0** | **0/0** |
| DG | **L2→L1 ×2** | no (room) | **none** | **none** | **none** | **none** |
| 5W | after leftover died + 2 wraps | never while 1W live | far 2W TTL → 5W | G 5+5 then dest dirtied | **C far 5W** (fill luck) | never while work≥2 |

Same **family** (cheap leftover + a dark source + leftover-5 HOL). **Not** the same machine as c18: dest WORK<2 **does** buy `[W,M]`/`[2W,M]` when leftover dies; p crawls; no DG. **Not** c19 dest-dirty: a live 2W is **not** replaced (5W-film B/C E13S7/E5S3 5+2). Fail mode now is **1+1 = work 2** — dest idle, HOL 5W starves, latch holds.

c20 **E12S3 / E18S5** are the counterexample: **5+5** · p **40k / 31k** · fill 400–550 · leftover-5 HOLD. The 18-hole is not back on those rooms.

## Hypothesis

| claim | film |
| --- | --- |
| same as c18 E11S6 blackout | **no** — crawl not freeze; no DG; dest heals on 0/1W; C hatched 5W |
| same as c18 E16S9 1W blackout | **family yes / machine no** — HOL-550 + leftover, but dest WORK<2 fires after TTL |
| same as c19 E18S9 `_still` park | **tile-rhyme only** — E11S6 26,20 `_still` 303 / `road\|src`; E18S9 this seed is on-seat |
| dest missing cheap-miner | **no** — `homeWork<2` since 08:57Z; B/C 1W/2W hatches are it |
| dest `WORK<4` dirties 5W | **no** — live 2W kept 5W-head (A E18S9 · 5W-film C E11S6) |
| leftover 1+1 (`homeWork=2`) blocks 5W | **yes** — heal idle; latch holds lastSpawn |
| HOL-550 + empty fill | **yes** E18S9 A/C · E11S6 5W-film C stall 527 |
| E11S6 1W walking | **no** — `_still` **303** at **26,20** A→B |
| leftover-5 | **HOLD** ext=5 · 0 ext sites |
| RCL2 roads | **0/0** |
| RCL3 this seed | 4/8 (E13S7 10503 · E5S3 15663 · E12S1 15865 · E16S9 16353). These two **not** |

Not KEEP / SEND BACK (pile). 5W hatch works once leftover dies **and** fill is 550 (E11S6 C). Heal still misses the `homeWork==2` + latch window — E18S9 is on that loop. Will **CENSOR** these two if they stay L2 (need ~33–35k, ~21k left). Mark **29029** / this-ctrl **31044**.

Did: redis `memory:pacifist1` + mongo objects + dest `users.code` + notifications. Did **not**: push-race, seed, reset, git push, unclaim, SSH, src.
