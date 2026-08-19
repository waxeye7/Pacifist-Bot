# Cycle-15 first cand RCL4

`run-2026-08-15T23-57-10Z` · `cycle-15-5w-latch` · node parse, not `race-mean.mjs`.
Ledger `updatedAt` 2026-08-16T00:55:59Z · lastTick **4724917** · elapsed **27970 / 40000** (firstSeed 4696947).

## Means (node, hits only)

```
candidate  RCL2 811 (n=8/8)  RCL3 15177 (n=8/8)  RCL4 26926 (n=1/8)
control    RCL2 907 (n=8/8)  RCL3 15134 (n=8/8)  RCL4 24913 (n=4/8)
```

RCL2 **811** vs **907** (**−96**). RCL3 **15177** vs **15134** (**+43**).
RCL4 cand **26926** 1/8 vs ctrl **24913** 4/8. vs leftover-5 mark **24512** 7/8: first cand already **+2414**. Do not re-baseline on 1/8.

## All RCL4 rooms (both sides)

| elapsed | room | side | slot | tick | prior | ± | e2 | e3 | lastSeen L/p/ext |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| **22403** | E4S7 | control | B5 | 4719521 | 4719394 | 127 | 731 | 13496 | 4/96031/**14** |
| **22927** | E21S4 | control | B8 | 4720159 | 4720025 | 134 | 927 | 11544 | 4/76538/**16** |
| **26914** | E8S5 | control | B3 | 4723951 | 4723835 | 116 | 812 | 14930 | 4/15798/**11** |
| **26926** | **E13S7** | **candidate** | B8 | 4724176 | 4724084 | 92 | 599 | 12691 | 4/2478/**5** |
| **27406** | E9S1 | control | B1 | 4724353 | 4724263 | 90 | 736 | 15812 | 4/9420/**10** |

First cand L4 = E13S7 **26926** (±92). Pair ctrl E21S4 **22927** (**+3999**). vs first ctrl E4S7 **22403** (**+4523**). Matches `_cycle15-cand-to4.md` own≈26920.

Cand still **1/8**. Next cand E11S6 lastSeen p=123020 need **11980** (~1.2k t at ~10 e/t → own ~29.2k). Then E18S5 need ~22k.

## leftover-5 — first cand L4 (E13S7)

**Released.** Standing lastSeen still **5** / cap **550** (builders on the box). Live room-objects tick **4724759** (~583 t after 4724176):

| | E13S7 |
| --- | --- |
| standing ext | **5** (same five: 15,18 / 19,14 / 14,13 / 14,15 / 14,17) |
| ext sites | **15** all 0/3000 |
| take | **20** (5 leftover + 10 new) |
| storage | site **(15,13)** 1605/30000 · standing 0 |
| other sites | rampart 1 · road 5 |
| tower / boxes | 1 / 3 |

**5 → more.** Sites exist. Energy is storage-first (`findLocked`); ext sites sit at 0 during the 30k. Same shape as `_next-rcl4-release.md` (storage + leftover dump same construction pass).

Other 7 cand still L3 **ext=5** (hold). Ctrl L3 leak **10**; post-up dump E4S7 **14**, E21S4 **16**, E8S5 **11**, E9S1 **10**.

## Pair table (lastSeen 4724917)

| pair | cand | L/p/ext / e3 / e4 | ctrl | L/p/ext / e3 / e4 |
| --- | --- | --- | --- | --- |
| B1 | E5S3 | 3/84760/5 / 15226 | **E9S1** | **4**/9420/10 / 15812 / **27406** |
| B2 | E12S3 | 3/65389/5 / 18312 | E13S9 | 3/92230/10 / 17150 |
| B3 | E18S9 | 3/51546/5 / 19709 | **E8S5** | **4**/15798/11 / 14930 / **26914** |
| B4 | E11S6 | 3/123020/5 / 13686 | E8S3 | 3/111981/10 / 16352 |
| B5 | E16S9 | 3/92324/5 / 15485 | **E4S7** | **4**/96031/14 / 13496 / **22403** |
| B6 | E18S5 | 3/112858/5 / 12262 | E6S1 | 3/112045/10 / 16362 |
| B7 | E12S1 | 3/102122/5 / 14042 | E3S5 | 3/72355/10 / 15427 |
| B8 | **E13S7** | **4**/2478/5 / 12691 / **26926** | **E21S4** | **4**/76538/16 / 11544 / **22927** |

## Verdict — **WATCHING**

- Cand RCL4 **1/8**, not 8/8. No KEEP / REVERT / re-baseline.
- First cand **26926** loses this control (mean 24913 4/8, first 22403) and is already past leftover-5 **24512** 7/8.
- leftover-5 held through L3; first cand L4 sited the leftover 15 (standing still 5 while storage builds).
- Wait RCL4 8/8.

Did: node parse of the ledger (not race-mean) + live room-objects on E13S7 leftover-5. Did **not**: push-race, seed, reset, revert, unclaim.

---

## leftover-5 HOLD film — 2026-08-16T01:03:41Z · tick **4728085**

`GET http://127.0.0.1:23456/api/game/room-objects` dest **pacifist** (`X-Token` local). 8 cand + ctrl E4S7/E21S4/E8S5/E9S1. Re-read `run-2026-08-15T23-57-10Z` `updatedAt` **2026-08-16T01:04:01Z** lastSeen **4728021** elapsed **31074 / 40000** (firstSeed 4696947).

**Question:** 24/22 sites on E11S6 / E13S7 — leftover-5 leak, or RCL4 roads/walls/non-ext dump?

**Answer: HOLD intact.** Standing cand ext is still **5**. The site pile is the RCL4 release dump (15 ext sites at 0 + storage + roads/ramparts). No wall sites. No tower sites. No container sites on cand. Energy storage-first (`findLocked`); leftover 15 sit at 0 while the 30k builds. Same shape as the 4724759 E13S7 film (`_next-rcl4-release.md`).

### Race JSON RCL4 elapsed (re-read)

```
candidate  RCL2 811 (n=8/8)  RCL3 15177 (n=8/8)  RCL4 28786 (n=3/8)
control    RCL2 907 (n=8/8)  RCL3 15134 (n=8/8)  RCL4 26726 (n=6/8)
```

| elapsed | room | side | slot | tick | prior | ± | e2 | e3 | lastSeen L/p/ext/cap |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| **22403** | E4S7 | control | B5 | 4719521 | 4719394 | 127 | 731 | 13496 | 4/143769/**14**/1000 |
| **22927** | E21S4 | control | B8 | 4720159 | 4720025 | 134 | 927 | 11544 | 4/118783/**20**/1300 |
| **26914** | E8S5 | control | B3 | 4723951 | 4723835 | 116 | 812 | 14930 | 4/55410/**19**/1250 |
| **26926** | **E13S7** | **candidate** | B8 | 4724176 | 4724084 | 92 | 599 | 12691 | 4/30482/**5**/550 |
| **27406** | E9S1 | control | B1 | 4724353 | 4724263 | 90 | 736 | 15812 | 4/56172/**15**/1050 |
| **29188** | **E11S6** | **candidate** | B4 | 4726286 | 4726182 | 104 | 751 | 13686 | 4/18040/**5**/550 |
| **29950** | E8S3 | control | B4 | 4727029 | 4726944 | 85 | 1080 | 16352 | 4/12647/10/800 |
| **30245** | **E18S5** | **candidate** | B6 | 4727422 | 4727343 | 79 | 672 | 12262 | 4/1694/**5**/550 |
| **30758** | E6S1 | control | B6 | 4727916 | 4727818 | 98 | 1001 | 16362 | 4/881/10/800 |

Newer hits since first-cand film: **E11S6 29188**, **E18S5 30245**. Still 3/8. vs leftover-5 mark **24512** 7/8: first **+2414**, cand mean **+4274**. No KEEP / REVERT / re-baseline.

### Live objects — 8 cand (tick 4728085)

| room | L | p | stand ext | cap | ext sites | road | ramp | wall | tower | box | storage | sites Σ | take |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| E5S3 | **3** | 107722 | **5** | 550 | 0 | 0 | 0 | 0 | 0 | 0 | — | **0** | 5 |
| E12S3 | **3** | 100646 | **5** | 550 | 0 | 0 | 0 | 0 | 0 | 0 | — | **0** | 5 |
| E18S9 | **3** | 79516 | **5** | 550 | 0 | 0 | 0 | 0 | 0 | 0 | — | **0** | 5 |
| **E11S6** | **4** | 19096 | **5** | 550 | **15** 0/3000 | 6 | 2 | 0 | 0 | 0 | site (25,19) **5685**/30000 | **24** | 20 |
| E16S9 | **3** | 123231 | **5** | 550 | 0 | 0 | 0 | 0 | 0 | 0 | — | **0** | 5 |
| **E18S5** | **4** | 2012 | **5** | 550 | **15** 0/3000 | 6 | 2 | 0 | 0 | 0 | site (9,34) **925**/30000 | **24** | 20 |
| E12S1 | **3** | 122448 | **5** | 550 | 0 | 0 | 0 | 0 | 0 | 0 | — | **0** | 5 |
| **E13S7** | **4** | 31604 | **5** | 550 | **15** 0/3000 | 5 | 1 | 0 | 0 | 0 | site (15,13) **22235**/30000 | **22** | 20 |

All cand standing: spawn 1 · tower 1 · boxes 5 (L3) / 3 (L4) · storage 0 · roads 0 · walls 0. L4 E13S7 also has **9 standing ramparts** (1 more site). L3 **0 sites**.

L4 24 = 15 ext + 6 road + 2 ramp + 1 storage. L4 22 = 15 ext + 5 road + 1 ramp + 1 storage. **Not walls. Not towers. Not boxes.** 15 ext sites = leftover 5 + 10 new (take 20). Same five E13S7 tiles as 4724759: 15,18 / 19,14 / 14,13 / 14,15 / 14,17. Storage 1605 → **22235**.

### Ctrl named rooms (ext dump, not leftover-5)

| room | L | p | stand ext | ext sites | other sites | stand roads / ramp / wall / twr / box / stor |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| E4S7 | 4 | 144619 | **14** | 6 (2894/18000) | stor 27275/30k · ramp 6 | 42 / 2 / 0 / 1 / 3 / 0 |
| E21S4 | 4 | 121126 | **20** | 0 | box 2071/5k · road 2 · stor 8120/30k · ramp 8 | 87 / 0 / 0 / 1 / 4 / 0 |
| E8S5 | 4 | 55410 | **20** | 0 | 0 | 59 / 5 / 0 / 1 / 4 / 0 |
| E9S1 | 4 | 57558 | **15** | 3 (3370/9000) | road 5 | 51 / 0 / 0 / 1 / 4 / 0 |

Ctrl L3 still leak **10** (E13S9 / E3S5 lastSeen). Post-up dump **14–20**.

### Verdict — leftover-5

- Cand **L3 5/5** still **ext=5 / cap=550 / 0 sites**. Hold held through the 135k.
- Cand **L4 3/3** still **standing ext=5 / cap=550**. Did **not** leak standing. Sites exist: leftover 15 queued with the box, all **0** while storage builds.
- 24/22 sites = RCL4 dump, not a hold break. Roads + ramparts + storage + ext sites. **0 wall / tower / container sites.**
- leftover-5 **24512** still the dirty mark; clean **29029**. Cand 3/8 mean **28786** already past 24512. Wait 8/8.

Did: HTTP GET local pserver room-objects (8 cand + 4 ctrl) + node parse of the ledger. Did **not**: push-race, seed, reset, revert, unclaim, overwrite pair table above.
