# Cycle-18 RCL2 — hypotheses, not a call

`run-2026-08-16T06-22-16Z` · `cycle-18-rcl3-haul` · pile vs `e839fc8`.
**8/8 spawn→RCL2.** Not KEEP / SEND BACK. Clock is 200 progress (cap 300).

```
candidate  RCL2 2138 (8/8)
control    RCL2 1666 (8/8)
```

**+472.** Cycle-17 same rooms: **1313 vs 1397 (−84).** Flip **+556** vs last Δ.
Mark **29029** / this-ctrl **29919**. Pave still inert (L3+slam-5).

| pair | cand e2 | ctrl e2 | Δ |
| --- | ---: | ---: | ---: |
| B1 E5S3 / E9S1 | 1818 | 1703 | +115 |
| B2 E12S3 / E13S9 | **2926** | 1644 | **+1282** |
| B3 E18S9 / E8S5 | 1996 | 1729 | +267 |
| B4 E11S6 / E8S3 | **2835** | 1725 | **+1110** |
| B5 E16S9 / E4S7 | 1581 | 1610 | −29 |
| B6 E18S5 / E6S1 | 2469 | 1868 | +601 |
| B7 E12S1 / E3S5 | 2214 | 1491 | +723 |
| B8 E13S7 / E21S4 | 1261 | 1561 | −300 |

Mean is E12S3 / E11S6 / E12S1 / E18S5. Easy E13S7 is **−300**.

## Not this clock

**no-RCL2-roads.** Gate is L3 + slam-5. 0 roads / 0 road sites at L1–L2
(`_cycle18-pave-watch.md`). 17’s SEND-BACK was builder-ticks on the
**45k**, not spawn→200. Label of 18 cannot move this mean.

**miner-first** (skip CA/UG until live miner). In src; `push-main` /
`push-vps` only. **Not in the race binary** (`push-pacifist` never).
18 dest = 17 dest at RCL1.

**5W HOL.** Live in the pile, fires at leftover-5 **550** after slam.
Spawn→RCL2 is still cap 300 / 2W. Cannot be +472.

## Hypotheses

1. **Sticky × this seed (far first-key).** Same sticky as 17 (−84).
   `identifySources` first key is `FIND_SOURCES` order. Sticky walks
   the first `[C,M]` to that pile (`_next-sticky-pickup.md` risk 2).
   Near drop-mines unserved until source B gets a CA. Hits split/far
   (E12S3 +1282, E11S6 +1110, E18S5 +601). E13S7 sources are range-2
   — sticky is a no-op there, and it **won**.

2. **Seed variance.** Frozen `e839fc8` control is **+269** vs 17
   (1397→1666). Same binary, different weather. Leftover `user:null`
   objects from 17 wipe (`_clean-world.md`) are per-room loud. Does
   **not** explain cand-only +1300 rooms by itself — weather + sticky
   pin can.

Race dest unchanged. Do not read +472 as pave, 5W, or miner-first.
Wait RCL3/4 **8/8**. Next isolated seed is still `cycle-N-5w-only`.

Did **not**: push-race, seed, reset, unclaim, SSH.
