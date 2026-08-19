# Cycle-15 5W-latch snap

**FINAL SEND BACK.** `run-2026-08-15T23-57-10Z` · `cycle-15-5w-latch` · ended `all-reached-target` lastTick **4734130**. cand RCL2 **811** / RCL3 **15177** / RCL4 **32092** 8/8 vs ctrl **907** / **15134** / **28657** 8/8 (**+3435**). `lastSpawn=0` latch hatched **4W not 5W**. Do not KEEP. Do not re-seed 15.

`run-2026-08-15T23-57-10Z` · `cycle-15-5w-latch` · `fiveWQueued` latch (clamp-to-4W cannot re-queue).
Ledger/race-mean tick **4727508** (`updatedAt` 2026-08-16T01:02:46Z). Elapsed **30561 / 40000** (seed0 4696947). Objects tick **4727010**.

## Race-mean

```
run-2026-08-15T23-57-10Z  candidate  RCL2 811 (n=8/8)  RCL3 15177 (n=8/8)  RCL4 28786 (n=3/8)  tick=4727508
run-2026-08-15T23-57-10Z  control    RCL2 907 (n=8/8)  RCL3 15134 (n=8/8)  RCL4 25920 (n=5/8)  tick=4727508
```

RCL2 **811** vs **907** (**−96**). RCL3 **15177** 8/8 vs **15134** 8/8 (**+43**).
RCL4 cand **28786** 3/8 (E13S7 **26926**, E11S6 **29188**, E18S5 **30245**) vs ctrl **25920** 5/8 (**+2866**, n mismatch).
vs leftover-5 mark: RCL2 **+72** · RCL3 **+4177** (11000 8/8) · RCL4 **24512** 7/8 still mark — all 3 cand finishers already **> 24512**.

Cand L3 still out: E16S9 p=118241 need 16759 · E12S1 115402 need 19598 · E5S3 102830 need 32170 · E12S3 92897 need 42103 · E18S9 77614 need 57386.
Ctrl next: E6S1 p=133899 need **1101**. Then E13S9 need 16265.

Wait RCL4 8/8. No keep/revert. Do not re-baseline on 3/8.

## Pair table (lastSeen 4727508)

| pair | cand | L/p/ext | ctrl | L/p/ext |
| --- | --- | --- | --- | --- |
| B1 | E5S3 | 3/102830/5 | **E9S1** | **4**/46660/15 e4=**27406** |
| B2 | E12S3 | 3/92897/5 | E13S9 | 3/118735/10 |
| B3 | E18S9 | 3/77614/5 | **E8S5** | **4**/50792/18 e4=**26914** |
| B4 | **E11S6** | **4**/9518/5 e4=**29188** | **E8S3** | **4**/5749/9 e4=**29950** |
| B5 | E16S9 | 3/118241/5 | **E4S7** | **4**/136632/14 e4=**22403** |
| B6 | **E18S5** | **4**/164/5 e4=**30245** | E6S1 | 3/133899/10 |
| B7 | E12S1 | 3/115402/5 | E3S5 | 3/88967/10 |
| B8 | **E13S7** | **4**/26230/5 e4=**26926** | **E21S4** | **4**/113222/20 e4=**22927** |

**leftover-5 HOLDING.** Cand L3 and L4 all **5 ext**, cap 550. Objects: E11S6 L4 24 sites / E13S7 L4 22 sites — non-ext RCL4 dump, ext still 5. Ctrl leak 10 at L3; post-up dump 9–20.

## Latch — room-objects (8 cand, tick 4727010)

| room | L/p/ext | box+sites | miners | miner WORK | miner bodies | ugs | ug WORK |
| --- | ---: | --- | ---: | ---: | --- | ---: | ---: |
| E5S3 | 3/99698/5 | 5+0 | **2** | 8 | 4W+4W | 10 | 40 |
| E12S3 | 3/87485/5 | 5+0 | **2** | 8 | 4W+4W | 4 | 16 |
| E18S9 | 3/72254/5 | 5+0 | **2** | 8 | 4W+4W | 7 | 28 |
| E11S6 | 4/1580/5 | 3+24 | **2** | 8 | 4W+4W | 4 | 16 |
| E16S9 | 3/114241/5 | 5+0 | **2** | 8 | 4W+4W | 4 | 16 |
| E18S5 | 3/132444/5 | 5+0 | **2** | 8 | 4W+4W | 10 | 40 |
| E12S1 | 3/115402/5 | 5+0 | **2** | 8 | 4W+4W | 10 | 40 |
| E13S7 | 4/22545/5 | 3+22 | **2** | 8 | 4W+4W | 5 | 20 |

**Latch held.** 8/8 = **2 miners**, clamp-4W, no 5W hatched. `fiveWQueued` **16/16** home sources.

## Verdict — **WATCHING** (not finished)

- vs this control: RCL2 KEEP-shaped (−96). RCL3 **worse** (+43 8/8). RCL4 **worse** on incomplete n (+2866, 3/8 vs 5/8).
- vs leftover-5 **24512 7/8**: every cand RCL4 so far is slower. Do **not** KEEP 5W-latch if RCL3/RCL4 worse.
- Not REVERT yet (flood dead, leftover-5 holding, RCL2 ahead, 30.6k/40k).
- This is a **4W-overlap** A/B. If 15 SEND BACK, next knob = overlap-replace (`_next-rcl3-roster.md` D), not clamp-skip.

Did: race-mean + pair table + room-objects + Memory `fiveWQueued`. Did **not**: push-race, seed, revert, mid-race push, unclaim, SSH VPS.
