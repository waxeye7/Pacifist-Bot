# Cycle-17 pave watch — first RCL3

`run-2026-08-16T04-56-08Z` · `cycle-17-rcl3-pave` · cand **8/8 L2**.
mongo: **0 road sites / 0 standing roads** on cand (expected). Gate is **L3 and slam-5** (`cap>=550`). `BasePlan.ts:522–523`.

Do not mid-race push. Mark: **29029** / this-ctrl **30533**. Never 24512.

## First rooms

Usually first L3: **E18S5** (B6, R2 **916**) then **E13S7** (B8, R2 **972**).
Slam-5 may land first on **E12S1** (already 4 ext). Roads still wait for L3.

Film http://127.0.0.1:8767/ those two the tick they hit 3.

## Film (first L3 + cap≥550)

1. Road **sites appear**. **≤3** open. Then standing roads climb.
2. Tiles = hub-ring + hub→spawn/ctrl/sources only. **No** wall/shell/rampart.
3. Builders **build** (no suicide). Roads-only → **1** builder.
4. leftover-5 **hold** (ext stays 5).
5. Recycle: finish 3 → next 3 of `arterialN`. 300e/tile actually spends.

Fail: 0 sites after slam-5 · >3 open roads · wall tiles · builder suicide · 6 builders on pavement.

L3 before slam-5: still **0 roads** (also expected).

## `arterialN` (live mem v7)

Prefix of `structures.road` after hub-ring + greedy hub→spawn/ctrl/sources (`BasePlan.ts:327–350`).

| room | N | hub | plan roads |
| --- | ---: | --- | ---: |
| E5S3 | 9 | 24,31 | 42 |
| E12S3 | 9 | 31,21 | 58 |
| E18S9 | **15** | 32,8 | 64 |
| E11S6 | 12 | 22,23 | 68 |
| E16S9 | 11 | 37,31 | 94 |
| **E18S5** | **11** | 5,30 | 60 |
| E12S1 | 10 | 26,18 | 67 |
| **E13S7** | **9** | 17,16 | 73 |

E18S5 first 11: `6,29 6,30 6,31 5,30 6,32–36 7,36 8,36`.
E13S7 first 9: hub ring `16–18,15–17`.
