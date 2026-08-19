# Cycle-15 pair table

`run-2026-08-15T23-57-10Z` · `cycle-15-5w-latch` · node parse, not `race-mean.mjs`.
Ledger `updatedAt` 2026-08-16T00:57:14Z · lastTick **4725471** · elapsed **28524 / 40000** (firstSeed 4696947).

## Means (node, hits only)

```
candidate  RCL2 811 (n=8/8)  RCL3 15177 (n=8/8)  RCL4 26926 (n=1/8)
control    RCL2 907 (n=8/8)  RCL3 15134 (n=8/8)  RCL4 24913 (n=4/8)
```

RCL2 **811** vs **907** (**−96**). RCL3 **15177** vs **15134** (**+43**).
RCL4 cand **26926** 1/8 vs ctrl **24913** 4/8. vs leftover-5 mark **24512** 7/8: first cand already **+2414**. Do not re-baseline on 1/8.

## All RCL4 elapsed (both sides)

| elapsed | room | side | slot | tick | prior | ± | e2 | e3 | lastSeen L/p/ext |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| **22403** | E4S7 | control | B5 | 4719521 | 4719394 | 127 | 731 | 13496 | 4/102350/**14** |
| **22927** | E21S4 | control | B8 | 4720159 | 4720025 | 134 | 927 | 11544 | 4/86474/**17** |
| **26914** | E8S5 | control | B3 | 4723951 | 4723835 | 116 | 812 | 14930 | 4/23204/**12** |
| **26926** | **E13S7** | **candidate** | B8 | 4724176 | 4724084 | 92 | 599 | 12691 | 4/6830/**5** |
| **27406** | E9S1 | control | B1 | 4724353 | 4724263 | 90 | 736 | 15812 | 4/18814/**10** |

Only five hits. Cand still **1/8**. Pair ctrl E21S4 **22927** (**+3999**). vs first ctrl E4S7 **22403** (**+4523**). Next cand E11S6 lastSeen p=125410 need **9590**.

## leftover-5 — ext per cand room (lastSeen 4725471)

**Holding.** 8/8 cand `ext=5` `cap=550`. L4 E13S7 standing still 5 (sites not lastSeen). Ctrl L3 leak **10**; post-up dump E4S7 **14** / E21S4 **17** / E8S5 **12** / E9S1 **10**.

| pair | room | L | p | ext | cap | e3 | e4 | need4 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B1 | E5S3 | 3 | 89264 | **5** | 550 | 15226 | — | 45736 |
| B2 | E12S3 | 3 | 70698 | **5** | 550 | 18312 | — | 64302 |
| B3 | E18S9 | 3 | 59686 | **5** | 550 | 19709 | — | 75314 |
| B4 | E11S6 | 3 | 125410 | **5** | 550 | 13686 | — | 9590 |
| B5 | E16S9 | 3 | 99398 | **5** | 550 | 15485 | — | 35602 |
| B6 | E18S5 | 3 | 120308 | **5** | 550 | 12262 | — | 14692 |
| B7 | E12S1 | 3 | 104484 | **5** | 550 | 14042 | — | 30516 |
| B8 | E13S7 | 4 | 6830 | **5** | 550 | 12691 | **26926** | — |

need4 = 135000 − p (L3 only). Next E11S6 then E18S5.

## Pair table (lastSeen 4725471)

| pair | cand | L/p/ext / e3 / e4 | ctrl | L/p/ext / e3 / e4 |
| --- | --- | --- | --- | --- |
| B1 | E5S3 | 3/89264/**5** / 15226 | **E9S1** | **4**/18814/10 / 15812 / **27406** |
| B2 | E12S3 | 3/70698/**5** / 18312 | E13S9 | 3/97333/10 / 17150 |
| B3 | E18S9 | 3/59686/**5** / 19709 | **E8S5** | **4**/23204/12 / 14930 / **26914** |
| B4 | E11S6 | 3/125410/**5** / 13686 | E8S3 | 3/118065/10 / 16352 |
| B5 | E16S9 | 3/99398/**5** / 15485 | **E4S7** | **4**/102350/14 / 13496 / **22403** |
| B6 | E18S5 | 3/120308/**5** / 12262 | E6S1 | 3/116863/10 / 16362 |
| B7 | E12S1 | 3/104484/**5** / 14042 | E3S5 | 3/76549/10 / 15427 |
| B8 | **E13S7** | **4**/6830/**5** / 12691 / **26926** | **E21S4** | **4**/86474/17 / 11544 / **22927** |

## Verdict — **WATCHING**

- Cand RCL4 **1/8**, not 8/8. No KEEP / REVERT / re-baseline.
- leftover-5 **8/8 ext=5**. L4 E13S7 still standing 5.
- First cand **26926** loses this control (mean 24913 4/8, first 22403) and is already past leftover-5 **24512** 7/8.
- Wait RCL4 8/8.

Did: node parse of the ledger (not race-mean). Did **not**: push-race, seed, reset, revert, unclaim.
