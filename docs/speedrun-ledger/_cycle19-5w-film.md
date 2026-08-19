# Cycle-19 5W film — `cycle-19-5w-only`

`run-2026-08-16T07-40-10Z` · set `1f90aub` `--swap` · control frozen `e839fc8`.
redis `local-screeps-server-redis-1` `memory:pacifist1` + mongo `rooms.objects` + `users.code`.
seed0 **4891503** · 16/16 `seedOk`. e2 865–1648. Watch **40404**.
No `push-race`. No seed. No src. No reset. No git push. No unclaim. No SSH.

| clock | tick | elapsed | what |
| --- | ---: | ---: | --- |
| A | **4895614** | **4111** / 40k | Memory + objects · slam **not** 550 |
| B | **4896608** | **5105** | E12S1 / E13S7 slam-550, still 2W |
| C | **4897015** | **5512** | Memory · E13S7 `lastSpawn` 4896483 both src |
| D | **4897098** | **5595** | **5W live** E13S7 5+5 · E12S1 5+2 |
| E | **4907786** | **16283** | leftover dip: E13S7 **1+1** · E12S3 **1+2** · E11S6 **2+2** |
| F | **4909424** | **17921** | mem+objects · 4/8 L3 |
| G | **4918901** | **27398** | **8/8 L3** · miner bodies |
| H | **4928371** | **36868** | **4/8 L4** · L4 5W + late cheap |

cand RCL2 **1264** 8/8 vs **1615**. RCL3 **17196** **8/8** (E13S7 9607 · E12S1 14703 · E5S3 15919 · E16S9 17280 · E18S5 17911 · E18S9 18487 · E11S6 20994 · E12S3 22664) vs ctrl **16566** 8/8 (**+630**). RCL4 cand **33622** **4/8** (E13S7 **31638** · E5S3 **31759** · E18S5 **35279** · E11S6 **35812**) vs ctrl **31044** **8/8** (E21S4 23039 · E4S7 24100 · E8S3 31012 · E9S1 31787 · E3S5 32543 · E8S5 33336 · E13S9 36055 · E6S1 36483).

## WORK — **5W YES** at slam-550 (not 4) · later **cheap 1W/2W**

Want `[5W,M]` once `cap=550`, not clamp-4W. Pre-slam only 2W is correct (`cap<550`).
0 **4W1M** cand objects all clocks. 0 10+ flood. Ctrl twin still hatches **4W** at 550.

| room | e2 / e3 | D L/p · ext · WORK | E WORK | F L/p · ext/cap · fill | F WORK | 5W F |
| --- | --- | --- | --- | --- | --- | --- |
| **E13S7** | 865 / **9607** | 2/6764 · 5 · **5+5** | **1+1** | 3/**2690** · **5/550** · **22** | **1+2** | **no** (TTL then cheap) |
| **E12S1** | 1236 / **14703** | 2/5429 · 5 · **5+2** | 5+5 | 3/9409 · **5/550** · 450 | **2+2** | **no** (TTL then cheap) |
| E5S3 | 906 / **15919** | 2/7606 · 2 · 2+2 | 5+5 | 3/15528 · **5/550** · 500 | **5+5** | **YES** |
| E16S9 | 1338 / **17280** | 2/9450 · 2 · 2+2 | 2+5 | 3/3698 · **5/550** · 550 | **5+5** | **YES** |
| E12S3 | 1648 / — | 2/5608 · 2 · 2+2 | **1+2** | 2/21289 · 5/550 · 550 | **5+5** | **YES** (recovered) |
| E18S9 | 1598 / — | 2/6532 · 0 · 2+2 | 5+5 | 2/39755 · 5/550 · 550 | **5+5** | **YES** |
| E18S5 | 1287 / — | 2/7970 · 3 · 2+2 | 5+5 | 2/44002 · 5/550 · 500 | **5+5** | **YES** (head 5W stall 35) |
| E11S6 | 1231 / — | 2/5999 · 4 · 2+2 | **2+2** | 2/**12131** · 5/550 · 550 | **2+5** | **half** |

D hatch `[5W,M]=550` on first slam rooms. After first 1500 TTL, dest cheap-miner (`WORK<4`) hatches `[W,M]`/`[2W,M]` when fill < 550. `fiveWQueued` then blocks a 5W replace until `lastSpawn+1500`. **Not** clamp-4W.

## G — all L3 · **6/8 5+5** · dest WORK&lt;4 still dirties 2 rooms

mongo `rooms.objects` + redis `gameTime` **4918901** + `memory:pacifist1` (ages ~4919036). Watch **40404** left running.

Want: after 8/8 L3, live home miners `[5W,M]` 1/src — or still cheap 2W/1W from dest `homeWork<4`.

| room | e2 / e3 | G L/p · ext/cap · fill | roads/s | G WORK | sit | 5W now | vs F |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| **E13S7** | 865 / **9607** | 3/**77195** · 5/550 · 550 | 15/0 | **5+5** | 11,12 + 13,13 | **YES** | 1+2 → **5+5** |
| E12S1 | 1236 / **14703** | 3/42360 · 5/550 · 550 | 39/0 | **5+5** | 28,11 + 36,24 | **YES** | 2+2 → **5+5** |
| E5S3 | 906 / **15919** | 3/**101550** · 5/550 · 550 | 43/0 | **5+5** | 11,41 + 20,46 | **YES** | still |
| E16S9 | 1338 / **17280** | 3/20119 · 5/550 · **301** | 18/8 | **2+5** | 43,34 2W + 21,18 5W | **half** | 5+5 → cheap then 5W |
| E18S5 | 1287 / **17911** | 3/73656 · 5/550 · 550 | 43/0 | **5+5** | 10,20 + 10,35 | **YES** | still |
| **E18S9** | 1598 / **18487** | 3/**7622** · 5/550 · **206** | 25/8 | **2+1** | 20,39 2W + **45,5 1W** | **no** | 5+5 → **2+1** |
| E11S6 | 1231 / **20994** | 3/47262 · 5/550 · 500 | 37/0 | **5+5** | 30,20 + 47,3 | **YES** | 2+5 → **5+5** |
| E12S3 | 1648 / **22664** | 3/39883 · 5/550 · 550 | 14/8 | **5+5** | 34,20 + 47,33 | **YES** | still |

0 **4W1M** objects. 0 10+ flood. 1/src except E13S7 briefly 5+5+5s mid-replace (gone by G). Ctrl L3 still `[5W,3M]=650` (cap 800), L4 `[6W,3M]`.

**Yes, 5W hatched on 6/8.** Not still all 2W/1W. Dest `homeWork<4` still dirties after 5W TTL when fill&lt;550: **E18S9 2W+1W** (new 1W ttl 4920289 = spawn ~4918789; lastSpawn **4918782** age 254; fill **206**). **E16S9 2W leftover** + recovered 5W. `fiveWQueued` then holds the cheap body until `lastSpawn+1500`.

E18S9 p **7622** after **~8779** t of L3 (~0.87 e/t). Lead E5S3 p **101550** need **33450** to L4.

## H — **4/8 L4** · L4 rooms **did hatch 5W** · dest WORK&lt;4 still cheap on late

mongo `rooms.objects` **4928371** + redis `memory:pacifist1` **4928826**. Watch **40404** left running.

Want: after first cand L4, home miners still `[5W,M]` — or dest `homeWork<4` hatches `[W,M]`/`[2W,M]` on L4 too.

**Yes — L4 rooms hatched 5W.** Live home `[5W,M]` spawn (`ttl−1500`) is after that room's L4 tick. Dest WORK&lt;4 did **not** block 5W when fill ≥550. It still dirties **after 5W TTL** when fill&lt;550 (`fiveWQueued` then holds the cheap body until `lastSpawn+1500`).

| room | e2 / e3 / e4 | H L/p · ext/cap · fill | roads/s | H home body | sit | spawn vs L4 | 5W now |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| **E13S7** | 865 / 9607 / **31638** | **4**/65558 · **6/600** · 600 | 21/6 | **5W1M+5W1M** | 11,12 + 13,15 | 4926965 / 4927829 **after** 4923531 | **YES** |
| **E5S3** | 906 / 15919 / **31759** | **4**/45584 · **5/550** · 544 | 43/9 | **5W1M+5W1M** | 11,41 + 22,31 | 4927197 / 4928357 **after** 4923290 | **YES** |
| E11S6 | 1231 / 20994 / **35812** | **4**/6849 · 5/550 · 452 | 37/6 | **5+5** + 5W in spawn | 47,4 + 29,20 | 4926884 (L3 leftover) · 4928124 **after** 4927501 | **YES** |
| E18S5 | 1287 / 17911 / **35279** | **4**/8097 · 5/550 · 550 | 43/6 | **5W1M+5W1M** | 11,34 + 10,21 | 4927685 / 4928277 **after** 4927071 | **YES** |
| **E18S9** | 1598 / 18487 / — | 3/**12227** · 5/550 · **300** | 52/0 | **1W1M+1W1M** | 20,39 + 36,12 | cheap lastSpawn 4927159 / 4927900 | **no** |
| **E16S9** | 1338 / 17280 / — | 3/**125533** · 5/550 · 550 | 41/0 | **5W1M+5W1M** | 22,17 + 43,34 | 4927702 / 4928212 | **YES** |
| E12S3 | 1648 / 22664 / — | 3/107371 · 5/550 · **267** | 50/0 | **1W1M+1W1M** | 47,33 + 35,10 | dest cheap after 5W TTL | **no** |
| E12S1 | 1236 / 14703 / — | 3/102886 · 5/550 · 500 | 39/0 | **5W1M+5W1M** | 36,24 + 28,11 | still | **YES** |

0 **4W1M** objects. 0 10+ flood. Home 1/src. E5S3 earlier 3W2M was **remote** `targetRoom=E4S3`, not a home cheap-miner.

Hatch math: `ageTime − 1500` = spawn-complete. `[5W,M]` start ≈ that − 18 = `lastSpawn`. E13S7 `1227746` ttl 4928465 → lastSpawn **4926947**. E5S3 `4676790` ttl 4928697 → lastSpawn **4927179**. Both **after** L4.

| L4 room | L4 tick | live 5W spawn-complete | Δ after L4 |
| --- | ---: | ---: | ---: |
| E13S7 | **4923531** | **4926965** · **4927829** | **+3434** · **+4298** |
| E5S3 | **4923290** | **4927197** · **4928357** | **+3907** · **+5067** |
| E18S5 | **4927071** | **4927685** · **4928277** | **+614** · **+1206** |
| E11S6 | **4927501** | 4926884 leftover · **4928124** · 5W hatching | **+623** |

**Did L4 rooms ever hatch 5W? YES.** All four. Not still 2W/1W on the L4 pair.

Late dest dirt: **E18S9 1+1** fill **300** · **E12S3 1+1** fill **267**. E16S9 recovered **5+5** (was G **2+5** / pave-watch **2+2**). E13S7 leftover-5 **released** — `storage` standing, ext **6** + 14 ext sites. Other L4 still ext=**5** (storage site, not built).

## `fiveWQueued` **true 16/16** · `spawnStall` · leftover-5

`Memory.rooms[R].resources[R].energy[id].fiveWQueued`. `lastSpawn` = queue stamp. F mem **4909424**. G mem **4919036**. H mem **4928826**.

| room | src L | F lastSpawn age | G lastSpawn age | G stall | G head | leftover-5 G |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| E5S3 | 18/20 | 632 / 930 | 1004 / 1474 | **0** | [] | **HOLD** L3 ext=**5** |
| E12S3 | 12/23 | 986 / 84 | **33** / 642 | **16** | UG `4W1C1M` | **HOLD** L3 ext=**5** |
| **E18S9** | 10/31 | 316 / 1185 | **254** / 1178 | **11** | UG `4W1C1M` | **HOLD** L3 ext=**5** |
| E11S6 | 24/4 | 728 / 1060 | 1273 / **100** | **0** | [] | **HOLD** L3 ext=**5** |
| E16S9 | 24/8 | 166 / 788 | 410 / 1436 | **17** | UG `4W1C1M` | **HOLD** L3 ext=**5** |
| E18S5 | 13/2 | 802 / 50 | 1346 / 623 | **0** | [] | **HOLD** L3 ext=**5** |
| E12S1 | 3/13 | 690 / 690 | 1164 / 1164 | **0** | CA `4C2M` | **HOLD** L3 ext=**5** |
| **E13S7** | 4/2 | 1246 / 720 | 304 / 1180 | **0** | [] | **HOLD** L3 ext=**5** |

`overlap4WQueued` **false** 16/16. No `[4W,M]` miner head (G heads are UG `4W1C1M` / CA). `fiveWQueued` **true** 16/16. G leftover-5 **HOLD 8/8** ext=**5**. Max ext **5**. 0 10-ext leak.

H lastSpawn age (mem 4928826) / leftover-5: E13S7 1021/359 **DUMP** ext=**6** storage up · E5S3 136/493 **HOLD** L4 ext=**5** · E18S9 932/153 **HOLD** L3 · E16S9 1148/638 **HOLD** L3 · E11S6 473/726 **HOLD** L4 · E18S5 573/1166 **HOLD** L4 · E12S3 611/1349 **HOLD** L3 · E12S1 377/377 **HOLD** L3. H stall **0** all 8. Heads `[]` except E12S1 Sweeper. `fiveWQueued` **true** 16/16. `overlap4WQueued` **false** 16/16.

L2 roads N/A (all L3). L3 pave cargo G: E5S3 43 · E18S5 43 · E12S1 39 · E11S6 37 · E18S9 25+8 · E16S9 18+8 · E13S7 15 · E12S3 14+8.

## Watch

| room | feared | film F / G / H |
| --- | --- | --- |
| **E11S6** | p~**7891** freeze / 0 miners | F p **12131** climb · G **5+5** p 47262 · H **L4 35812** **5+5**. **not** c18 DG. |
| **E12S3** | **c=6** stall | F **5+5** · G **5+5** · H **1+1** dest cheap fill **267**. **not** c=6. |
| **E18S9** | dest WORK&lt;4 dirty | G **2W+1W** · H **1W+1W** fill **300** · p **12227** crawl |

## Dest `users.code` — sticky/overlap **ABSENT**

`pacifist1` main active ts **2026-08-16T07:39:58Z** (seed-clean). `pacifist-race` **2026-08-06T09:38:42Z** (`e839fc8`). Unchanged at H. Dest still `homeWork < 4` (1) · `homeWork < 2` **0**. Live: E18S9 / E12S3 `[W,M]`.

| name | cand dest | ctrl dest |
| --- | ---: | ---: |
| `STICKY_SOURCE_RANGE` / `stickySrc` / `atMine` | **0** | **0** |
| `overlapReplaceWanted` / `cullOverlapShuttle` / `overlap4WQueued` / `overlapCull` / `queuedParkedUpgrader` | **0** | **0** |
| `fiveWQueued` write | **1** | 0 |
| `extensionTake` `lvl<=3 → 5` | **5** | 0 |
| clamp-skip home `[5W,M]` 550 (`bodyCost===550` + 5W1M → `continue`) | **yes** | no |
| `cheap miner head` + `homeWork` | **yes** | no |
| `values.lastSpawn = 0` | self-heal only (`no miner alive or queued`) | same |

`clamped EnergyMiner` log **0** in dest + empty `users.console`.

## Verdict — **WATCHING**

| | |
| --- | --- |
| 5W after slam-550 | **yes** (D). **not 4W** |
| L4 rooms hatch 5W (H) | **YES** · E13S7 / E5S3 / E18S5 / E11S6 all live `[5W,M]` spawned after L4 |
| dest WORK&lt;4 dirty | **still** · H E18S9 **1+1** · E12S3 **1+1**. E16S9 recovered **5+5** |
| 4W hatch | **no** |
| flood | **no** · `fiveWQueued` 16/16 |
| leftover-5 L3 | **HOLD** remaining L3 ext=**5** |
| leftover-5 L4 | E5S3/E11S6/E18S5 **HOLD** ext=**5** · E13S7 **DUMP** storage+ext **6** |
| E13S7 / E5S3 | L4 **31638** / **31759** · **5+5** |
| E18S9 | **1W+1W** · p **12227** crawl |

No KEEP (4/8 L4 · pile · dest dirty). Mark **29029** / this-ctrl **29694**. Did **not**: push-race, seed, reset, git push, unclaim, SSH, src. Watch **40404** left running.
