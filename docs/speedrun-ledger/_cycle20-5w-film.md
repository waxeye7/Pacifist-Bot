# Cycle-20 5W film — `cycle-20-5w-only`

`run-2026-08-16T08-58-29Z` · set `1f90aub` `--swap` · control frozen `e839fc8`.
redis `local-screeps-server-redis-1` `memory:pacifist1` + mongo `rooms.objects` + `users.code`.
seed0 **4932291** · 16/16 `seedOk`. e2 **1320** vs **1500** (**−180**) 8/8. Watch **19568**.
No `push-race`. No seed. No src. No reset. No git push. No unclaim. No SSH.

| clock | tick | elapsed | what |
| --- | ---: | ---: | --- |
| A | **4937251** | **4960** / 40k | Memory + objects · slam **not** 550 · all 2W |
| B | **4937970** | **5679** | E13S7 slam-550 **5+2** · E12S1 slam still 2+2 |
| C | **4939918** | **7627** | E13S7 **5+5** · E12S1 **5+5+5** · E5S3 **2+5** · E11S6/E18S5 5W-head |
| D | **4950873** | **18582** | **8/8 cap 550** · miner bodies · leftover-5 · L2/L3 roads |

cand RCL2 **1320** 8/8 vs **1500**. RCL3 **14596** **4/8** (E13S7 **10503** · E5S3 **15663** · E12S1 **15865** · E16S9 **16353**). RCL4 —. L2 still: E11S6 / E18S9 / E18S5 / E12S3.

## WORK — want `[5W,M]` (or 5W+2W) once `cap=550` · **not** 2×2W dest-dirty

Dest cheap-miner is `homeWork<2` (not c19 `WORK<4`). Fail = **2×2W** while a 5W head should buy, like c19 E16S9.
0 **4W1M** cand objects all clocks. 0 10+ flood. Ctrl twin still hatches **4W** at 550.

| room | e2 / e3 | A WORK | B WORK | C WORK | D L/p · ext/cap · fill | D WORK | 5W D |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **E13S7** | 1522 / **10503** | 2+2+2 | **5+2** | **5+5** | **3**/56522 · **5/550** · 550 | **5+5** | **YES** |
| **E12S1** | 955 / **15865** | 2+2+2+2 | **2+2** | **5+5+5** | **3**/8345 · **5/550** · 550 | **5+5** | **YES** |
| **E5S3** | 1128 / **15663** | 2+2+2+2 | 2+2 | **2+5** | **3**/10050 · **5/550** · 550 | **5+5** | **YES** |
| E16S9 | 1236 / **16353** | 2+2+2 | 2+2 | 2+2 latch | **3**/12085 · **5/550** · 550 | **5+5** | **YES** |
| E12S3 | 1415 / — | 2+2 | 2+2+2 | 2+2+2+2 pre | 2/42370 · **5/550** · 550 | **5+5** | **YES** |
| E18S5 | 1183 / — | 2+2+2 | 2+2 | 2 + head 5W | 2/34902 · **5/550** · 550 | **5+5** | **YES** |
| **E11S6** | 1296 / — | 2+2+2 | 2+2+2+2 | 2 + head 5W | 2/**9607** · **5/550** · 4 | **5+2** | **YES** (2W leftover) |
| **E18S9** | 1821 / — | 2+2 | 2+2 | 2+2 pre | 2/**11950** · **5/550** · **202** | **1+1** | **no** dest-cheap |

B hatch `[5W,M]=550` on first slam room **with leftover 2W still seated**. Dest `homeWork<2` did **not** rewrite the 5W head (leftover work=2). c19 dest `WORK<4` would have: `2<4` → `[2W,M]` → **2×2W**.

## D — miner body table · all 8 cand · tick **4950873**

mongo `rooms.objects` + redis `memory:pacifist1` **4950308** / objects ~**49508xx**. Watch **19568** left running.

Want: live home `[5W,M]` 1/src, or still `[5W,M]+[2W,M]` overlap. Fail = dest-cheap `[2W,M]`/`[W,M]` only (c19 dest-dirty family).

| room | L/p · ext/cap · fill | roads/s | live bodies | sit | spawn-complete | leftover-5 | pave | 5W |
| --- | --- | ---: | --- | --- | ---: | --- | --- | --- |
| **E13S7** | 3/56522 · **5/550** · 550 | **0/0** | **5W1M+5W1M** | 13,13 + 11,12 | 4949586 / 4950266 | **HOLD** | **none** | **pass** |
| **E5S3** | 3/10050 · **5/550** · 550 | **0/0** | **5W1M+5W1M** | 20,46 + 11,41 | 4949865 / 4949883 | **HOLD** | **none** | **pass** |
| **E12S1** | 3/8345 · **5/550** · 550 | **0/0** | **5W1M+5W1M** | 36,26 + 28,11 | 4949781 / 4949923 | **HOLD** | **none** | **pass** |
| **E16S9** | 3/12085 · **5/550** · 550 | **0/0** | **5W1M+5W1M** | 21,18 + 43,34 | 4949357 / 4950342 | **HOLD** | **none** | **pass** |
| E12S3 | 2/42370 · **5/550** · 550 | **0/0** | **5W1M+5W1M** | 34,20 + 47,33 | 4950441 / 4950512 | n/a L2 slam-5 | n/a | **pass** |
| E18S5 | 2/34902 · **5/550** · 550 | **0/0** | **5W1M+5W1M** | 11,34 + 10,21 | 4950263 / 4950359 | n/a L2 | n/a | **pass** |
| **E11S6** | 2/**9607** · **5/550** · 4 | **0/0** | **5W1M+2W1M** | 45,8 walk + 29,20 | 4950600 / 4949515 | n/a L2 | n/a | **pass** |
| **E18S9** | 2/**11950** · **5/550** · **202** | **0/0** | **1W1M+1W1M** | 20,39 + 45,5 | 4949406 / 4949421 | n/a L2 | n/a | **fail** |

0 **4W1M**. Home 1/src. E11S6 far src **3000** — 5W walking 45,8→46,3; leftover 2W sits 29,20 (src 30,21). E16S9 / E12S1 / E5S3 / E13S7 L3 towers standing (not roads). Source-seat sites only on E13S7 / E16S9. **0** far-ctrl depot (boxes are hub/bin).

`ageTime − 1500` = spawn-complete. Fill **550** rooms replace 5W→5W (E13S7 `4014474`, E18S5 `1926680`, E12S3 `3268909`). E11S6 5W `171177` spawn-complete **4950600** while 2W `283988` still live — dest `homeWork=2` **idle**. Not 2×2W.

## leftover-5 · L2 0 roads · L3 no pave

| check | D **4950873** |
| --- | --- |
| leftover-5 L3 ext=5 | **HOLD 4/4** · E13S7 / E5S3 / E12S1 / E16S9 · 0 ext sites · 0 storage |
| leftover-5 L2 | slam-5 ext=**5** all 4 · n/a hold (still L2) |
| L2 0 roads | **pass 4/4** (and L3 also **0/0**) |
| L3 no pave (`paveNow` gone) | **pass 4/4** · 0 standing · 0 road sites · dest `ROAD && rcl < 4` skip |
| far-ctrl depot | **none** · dest `siteLegacyControllerDepot` `level !== 3` |

c19 L3 cargo was E5S3 43r · E12S1 39r · E13S7 15r. **Gone.**

## D — `fiveWQueued` **true 16/16** · dest-cheap only E18S9

mem **4950308**. `overlap4WQueued` **false** 16/16.

| room | lastSpawn age | stall | head | leftover-5 |
| --- | ---: | ---: | --- | --- |
| E13S7 | 60 / 740 | 0 | `[]` | **HOLD** L3 ext=**5** |
| E5S3 | 461 / 461 | 0 | `[]` | **HOLD** L3 ext=**5** |
| E12S1 | 403 / 545 | 0 | `[]` | **HOLD** L3 ext=**5** |
| E16S9 | 969 / 1486 | 0 | `[]` | **HOLD** L3 ext=**5** |
| E12S3 | 1396 / 1352 | 0 | `[]` | n/a L2 |
| E18S5 | 1478 / 63 | 0 | `[]` | n/a L2 |
| E11S6 | 1446 / 886 | 53 | UG `2W2C2M` | n/a L2 |
| **E18S9** | **900 / 1092** | 6 | UG `2W2C2M` | n/a L2 |

E18S9: 2W died ~4949400, fill **133** then **202**. dest `homeWork<2` rewrote the 5W head to `[W,M]` (`available<250`). lastSpawn **4949216 / 4949408** latched by `fiveWQueued` — next 5W blocked until `lastSpawn+1500` (~4950716 / 4950908). Live **1+1**. p **11950** crawl (~0.6 e/t after slam). **This is dest-cheap after TTL, not slam-550 2×2W.**

E11S6 earlier D-probe (~49492xx) was **1+1** then **1+2** (fill 4–300, dest cheap while `homeWork<2`). Then fill bought the HOL `[5W,M]` → live **5+2**. dest idle on the 2W. **Recovered.**

## B — first hatch · dest `WORK<2` held

mongo **4937970**. E13S7 ext **5 / 550** fill **550**.

| miner | body | sit | ttl | spawn-complete |
| --- | --- | --- | ---: | ---: |
| `EnergyMiner-3660518-E13S7` | **`[2W,M]`** | **11,12** (src 10,13) | 4938575 | 4937075 (pre-slam leftover) |
| `EnergyMiner-3511726-E13S7` | **`[5W,M]`** | **13,13** (src 12,14) | 4939288 | **4937788** |

Leftover 2W work=**2** → dest `homeWork<2` **idle**. Head stayed 5W. c19 dest `WORK<4` would have rewritten.

## Dest `users.code` — cheap-miner **WORK&lt;2**

`pacifist1` main active ts **2026-08-16T08:57:49Z** (seed-clean). `pacifist-race` **2026-08-06T09:38:42Z** (`e839fc8`).
Dest `homeWork < 2` **1** · `homeWork < 4` **0** · `homeMinerBestWork` **0**.

| name | cand dest | ctrl dest |
| --- | ---: | ---: |
| `STICKY_SOURCE_RANGE` / `stickySrc` / `atMine` | **0** | **0** |
| `overlapReplaceWanted` / `cullOverlapShuttle` / `overlap4WQueued` / `overlapCull` / `queuedParkedUpgrader` | **0** | **0** |
| `fiveWQueued` write | **1** | 0 |
| `extensionTake` `lvl<=3 → 5` | **5** | 0 |
| clamp-skip home `[5W,M]` 550 (`bodyCost===550` + 5W1M → `continue`) | **yes** | no |
| `cheap miner head` + `homeWork < 2` | **yes** | no |
| `homeWork < 4` | **0** | 0 |
| `paveNow` | comment only | 0 |
| `ROAD && rcl < 4` skip | **yes** (no RCL3 pave) | no |
| `siteLegacyControllerDepot` | `level !== 3` | 0 |
| `values.lastSpawn = 0` | self-heal only (`no miner alive or queued`) | same |

`clamped EnergyMiner` log **0**. `users.console` empty.

## Pass / fail per room (D)

| room | 5W live | leftover-5 | L2 0 roads | L3 no pave | dest-dirty 2×2W | **room** |
| --- | --- | --- | --- | --- | --- | --- |
| E13S7 | **pass** 5+5 | **pass** ext=5 | n/a L3 | **pass** 0/0 | **pass** | **PASS** |
| E5S3 | **pass** 5+5 | **pass** ext=5 | n/a L3 | **pass** 0/0 | **pass** | **PASS** |
| E12S1 | **pass** 5+5 | **pass** ext=5 | n/a L3 | **pass** 0/0 | **pass** | **PASS** |
| E16S9 | **pass** 5+5 | **pass** ext=5 | n/a L3 | **pass** 0/0 | **pass** | **PASS** |
| E12S3 | **pass** 5+5 | n/a L2 | **pass** 0/0 | n/a | **pass** | **PASS** |
| E18S5 | **pass** 5+5 | n/a L2 | **pass** 0/0 | n/a | **pass** | **PASS** |
| E11S6 | **pass** 5+2 | n/a L2 | **pass** 0/0 | n/a | **pass** (not 2×2W) | **PASS** |
| E18S9 | **fail** 1+1 | n/a L2 | **pass** 0/0 | n/a | **pass** (1+1, not 2×2W) | **FAIL** |

## Verdict — **WATCHING**

| | |
| --- | --- |
| dest cheap-miner | **WORK&lt;2** (not c19 WORK&lt;4) |
| 5W after slam-550 | **yes** (B E13S7 **5+2** · C E12S1 / E5S3). **not 4W** |
| 5W while 2W live | **yes** · B E13S7 **5+2** · C E5S3 **2+5** · D E11S6 **5+2** |
| dest-dirty 2×2W | **no** 8/8 |
| live 5W now | **7/8** · **E18S9 FAIL** 1+1 dest-cheap after TTL fill **202** |
| 4W hatch cand | **no** · ctrl **yes** at 550 |
| flood | **no** · `fiveWQueued` 16/16 |
| leftover-5 | **HOLD** L3 **4/4** ext=**5** |
| L2 0 roads | **pass** 8/8 rooms 0/0 |
| L3 no pave | **pass** 4/4 · `paveNow` gone |

No KEEP (4/8 L3 · pile vs isolated is leftover-5+miner-first still in dest). Mark **29029** / this-ctrl **31044**. Did **not**: push-race, seed, reset, git push, unclaim, SSH, src, push-pacifist. Watch **19568** left running.
