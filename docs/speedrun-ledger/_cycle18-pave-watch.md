# Cycle-18 pave watch — 0 roads at RCL2

`run-2026-08-16T06-22-16Z` · `cycle-18-rcl3-haul` · seed0 **4850955** · `--swap`.
mongo `rooms.objects` + redis `memory:pacifist1` · gameTime **4853252**.
cand **4/8 L2** (4 still L1). **0 standing roads / 0 road sites** on all 8 cand (ctrl also 0/0).

Gate is **L3 and slam-5** (`rcl===3 && cap>=550`). `BasePlan.ts:632–633, :669–670`.
Janitor wipes leftover L2 road sites (`construction.ts:797–800`).

**17 SEND-BACK was RCL2 pave.** E16S9 hit L3 at **31858** after **62 roads**. 300e/tile is cheap; builder-ticks on the 45k are not. Pave on the 135k only.

Do not mid-race push. Mark: **29029** / this-ctrl **29919**. Never 24512.

## Now (mongo 4853252)

| room | L / p | ext / cap | roads / sites |
| --- | --- | --- | ---: |
| E5S3 | 2 / 932 | 0 / 300 | **0 / 0** |
| E12S3 | 1 / 0 | 0 / 300 | **0 / 0** |
| E18S9 | 2 / 71 | 0 / 300 | **0 / 0** |
| E11S6 | 1 / 4 | 0 / 300 | **0 / 0** |
| E16S9 | 2 / 1115 | 0 / 300 | **0 / 0** |
| E18S5 | 1 / 154 | 0 / 300 | **0 / 0** |
| E12S1 | 1 / 82 | 0 / 300 | **0 / 0** |
| **E13S7** | 2 / **1360** | 0 / 300 | **0 / 0** |

L2 rooms already slamming (5 ext sites + hub/bin). Roads stay **0** until L3.

## Film at RCL2

**0 roads / 0 road sites.** Even after slam-5 (`cap>=550`) while still L2.

Fail: any standing road or road site at L2. That is the 17 leak.

## Film (first L3 + cap≥550)

1. Road **sites appear**. **≤8** open. Then standing roads climb.
2. Tiles = hub→spawn/ctrl/sources only (`haulRoadTiles` / walkLine BFS). **No** hub ring (RCL4). **No** wall/shell/rampart.
3. Builders **build** (no suicide). Roads-only → **2** builders.
4. leftover-5 **hold** (ext stays 5).
5. Recycle: finish 8 → next 8 of haul. 300e/tile actually spends.

Fail: 0 sites after L3+slam-5 · >8 open roads · wall tiles · hub-ring at L3 · builder suicide · 6 builders on pavement.

L3 before slam-5: still **0 roads** (also expected).

## First rooms

L2 now: **E13S7** (p=1360) then **E16S9** (1115) · **E5S3** (932). Last cycle first L3 was **E12S3** (still L1 here).
Film http://127.0.0.1:8767/ those the tick they hit 3.

## `arterialN` (live mem v7)

Prefix of `structures.road` after haul + hub-ring (`BasePlan.ts:362–379`). RCL3 **does not** pave the ring.

| room | N | hub | plan roads |
| --- | ---: | --- | ---: |
| E5S3 | 9 | 24,31 | 42 |
| E12S3 | 9 | 31,21 | 58 |
| E18S9 | **15** | 32,8 | 64 |
| E11S6 | 12 | 22,23 | 68 |
| E16S9 | 11 | 37,31 | 94 |
| E18S5 | 11 | 5,30 | 60 |
| E12S1 | 10 | 26,18 | 67 |
| E13S7 | 9 | 17,16 | 73 |

Did: mongo + redis. Did **not**: push-race, seed, reset, SSH VPS.
