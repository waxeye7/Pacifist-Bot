# Cycle-19 snap

`run-2026-08-16T07-40-10Z` · `cycle-19-5w-only` · **PILE vs `e839fc8`**, not an isolated 5W A/B.
See `_cycle19-stack.md`. 5W+leftover-5+no-RCL2-roads; **cargo** RCL3 pave + far-ctrl + miner-first.
Mark **29029 8/8**. This-control **29694**. Not dirty **24512**.
tick **4926832** · elapsed **35329 / 40000** (seed0 4891503) · lastSeen **4926832** · seed **16/16 seedOk**. exitReason **null**. watch **40404**.

Prev: cycle-18 FINAL tick-budget **4890981**. cand 2138 / 22636 7/8 / **31683 3/8** · ctrl 1666 / 15308 / **29694 8/8**. **CENSOR. No KEEP.** 18 FINAL stands.

## Race-mean

```
candidate  RCL2 1264 (n=8/8)  RCL3 17196 (n=8/8)  RCL4 31699 (n=2/8)  tick=4926832
control    RCL2 1615 (n=8/8)  RCL3 16566 (n=8/8)  RCL4 29303 (n=6/8)  tick=4926832
```

RCL2 **1264** vs **1615** (**−351**). RCL3 **17196 8/8** vs **16566 8/8** (**+630**, cand slower). RCL4 **31699 2/8** (E13S7 **31638** · E5S3 **31759**) vs **29303 6/8**.
vs-clean29029: 2-room 31699 is not a mean. **not 8/8**, no KEEP.

First cand L3: **E13S7 9607**/5 · E12S1 **14703** · E5S3 **15919** · E16S9 **17280** · E18S5 **17911** · E18S9 **18487** · E11S6 **20994** · E12S3 **22664**. leftover-5 **HOLD** L3+L4 cand ext=**5**.
First cand L4: **E13S7 31638**/5 then **E5S3 31759**/5. Climb E13S7 **22031** vs c18 **10766**.
First ctrl L3: **E21S4 11735**/10 leak · E3S5 **13482**/10 · E4S7 **13749**/9. First ctrl L4: **E21S4 23039** · **E4S7 24100** · E8S3 **31012** · E9S1 **31787** · E3S5 **32543** · E8S5 **33336**.

## Pair table (lastSeen ≤ 4926832)

| pair | cand | L/p/ext · e2/e3/e4 | ctrl | L/p/ext · e2/e3/e4 |
| --- | --- | --- | --- | --- |
| B1 hard | E5S3 | **4**/30446/**5** · 906 / 15919 / **31759** | E9S1 | **4**/56808/**10** · 777 / 19302 / **31787** |
| B2 hard | E12S3 | **3**/101998/**5** · 1648 / **22664** | E13S9 | 3/126801/**10** · 1824 / **18286** |
| B3 hard | E18S9 | **3**/11053/**5** thin · 1598 / **18487** | E8S5 | **4**/35867/**12** · 2856 / 17285 / **33336** |
| B4 med | E11S6 | **3**/128126/**5** · 1231 / **20994** | E8S3 | **4**/56037/**10** · 1867 / 17774 / **31012** |
| B5 med | E16S9 | **3**/109539/**5** · 1338 / **17280** | E4S7 | **4**/132164/**19** · 1365 / 13749 / **24100** |
| B6 med | E18S5 | **3**/133241/**5** · 1287 / **17911** | E6S1 | 3/122327/**10** · 1615 / **20917** |
| B7 easy | E12S1 | **3**/92715/**5** · 1236 / **14703** | E3S5 | **4**/30315/**13** · 1103 / 13482 / **32543** |
| B8 easy | E13S7 | **4**/45839/**5** · 865 / 9607 / **31638** | E21S4 | **4**/152204/**20** · 1512 / 11735 / **23039** |

All `seedOk=true`. leftover-5 **HOLD** cand L3+L4 ext=**5** (dest L4-until-storage). Slam-5 **8/8**. Ctrl leak **10** on remaining L3 · L4 dump E4S7 **19** · E21S4 **20** · E8S5 **12** · E3S5 **13**.
Thin: cand **E18S9 p=11053**/5. 5W dest **DIRTY** (cheap-miner `WORK<4`).

## Near

Cand next L4: **E18S5 p=133241**/5 need **1759**. Then E11S6 128126 need 6874 · E16S9 109539 need 25461 · E12S3 101998 need 33002 · E12S1 92715 need 42285.
Ctrl next L4: **E13S9 126801** need **8199**. Then E6S1 122327 need 12673.
~4.7k ticks left (35329/40000). E18S9 need **123947** — will not 8/8.

Pave: gate open L3+slam-5. leftover-5 hold. L4 cand still ext=5.

## Verdict — **WATCHING · will CENSOR**

- Still live (`exitReason` null, elapsed 35329 < 40000). No FINAL.
- **CENSOR.** 8/8 RCL4 impossible. No KEEP / REVERT / SEND BACK. Pile vs `e839fc8` — see `_cycle19-stack.md`.
- Beat **29029 8/8** or this-control **29694**. Not 24512. Do not Δ 31699 2/8.
- Cycle-18 FINAL **stands** — **CENSOR 3/8**, not KEEP.
- 5W dest dirty. Label is not a 5W A/B.
- Do **not** seed. 20 waits for FINAL.

Did: race-mean + pair table. Did **not**: push-race, seed, reset, revert, unclaim, SSH, src.

```
NEVER  seed
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim
NEVER  SSH
NEVER  src
```

---

Earlier (08:25Z): tick **4917064** · elapsed **25561 / 40000**. lastSeen **4919079**.

```
candidate  RCL2 1264 (n=8/8)  RCL3 17196 (n=8/8)  RCL4 — (n=0/8)  tick=4917064
control    RCL2 1615 (n=8/8)  RCL3 16566 (n=8/8)  RCL4 23570 (n=2/8)  tick=4917064
```

RCL2 **1264** vs **1615** (**−351**). RCL3 **17196 8/8** vs **16566 8/8** (**+630**, cand slower). RCL4 — vs **23570 2/8**.
vs-clean29029: no cand RCL4 yet. **not 8/8**, no KEEP.

First cand L3: **E13S7 9607**/5 · E12S1 **14703** · E5S3 **15919** · E16S9 **17280** · E18S5 **17911** · E18S9 **18487** · **E11S6 20994** (no 18-style DNF) · E12S3 **22664**. leftover-5 **HOLD** all 8.
First ctrl L3: **E21S4 11735**/10 leak · E3S5 **13482**/10 · E4S7 **13749**/9. First ctrl L4: **E21S4 23039** then **E4S7 24100**.

## Pair table (lastSeen ≤ 4919079)

| pair | cand | L/p/ext · e2/e3 | ctrl | L/p/ext · e2/e3/e4 |
| --- | --- | --- | --- | --- |
| B1 hard | E5S3 | **3**/103100/**5** · 906 / **15919** | E9S1 | 3/75517/**10** · 777 / **19302** |
| B2 hard | E12S3 | **3**/40289/**5** · 1648 / **22664** | E13S9 | 3/45320/**10** · 1824 / **18286** |
| B3 hard | E18S9 | **3**/7772/**5** thin · 1598 / **18487** | E8S5 | 3/94953/**10** · 2856 / **17285** |
| B4 med | E11S6 | **3**/48458/**5** · 1231 / **20994** | E8S3 | 3/92739/**10** · 1867 / **17774** |
| B5 med | E16S9 | **3**/20217/**5** · 1338 / **17280** | E4S7 | **4**/63830/**12** · 1365 / 13749 / **24100** |
| B6 med | E18S5 | **3**/76168/**5** · 1287 / **17911** | E6S1 | 3/52987/**10** · 1615 / **20917** |
| B7 easy | E12S1 | **3**/43172/**5** · 1236 / **14703** | E3S5 | 3/96371/**10** · 1103 / **13482** |
| B8 easy | E13S7 | **3**/79875/**5** · 865 / **9607** | E21S4 | **4**/66489/**19** · 1512 / 11735 / **23039** |

All `seedOk=true`. leftover-5 **HOLD** all cand L3 ext=**5**. Slam-5 **8/8**. Ctrl leak **10** on remaining L3 · L4 dump E4S7 **12** · E21S4 **19**.
Thin: cand **E18S9 p=7772**/5 c=11. Slow: **E16S9 p=20217**. At stamp 4917064 E13S7 p=**51799** (first e3). 5W dest **DIRTY** (cheap-miner `WORK<4`).

---

Earlier (08:05-ish): tick **4907867** · elapsed **16364 / 40000**. lastSeen **4907867**.

```
candidate  RCL2 1264 (n=8/8)  RCL3 13410 (n=3/8)  RCL4 — (n=0/8)  tick=4907867
control    RCL2 1615 (n=8/8)  RCL3 12989 (n=3/8)  RCL4 — (n=0/8)  tick=4907867
```

RCL2 **−351**. RCL3 **13410 3/8** vs **12989 3/8** (not 8/8 — do not Δ). First cand L3: E13S7 **9607**/5 then E12S1 **14703**/5 then E5S3 **15919**/5 HOLD.

| pair | cand | L/p/ext · e2/e3 | ctrl | L/p/ext · e2/e3 |
| --- | --- | --- | --- | --- |
| B1 hard | E5S3 | **3**/3906/**5** · 906 / **15919** | E9S1 | 2/24249/**5** · 777 |
| B2 hard | E12S3 | 2/16286/**5** · 1648 | E13S9 | 2/35725/**5** · 1824 |
| B3 hard | E18S9 | 2/26651/**5** · 1598 | E8S5 | 2/37370/**5** · 2856 |
| B4 med | E11S6 | 2/**8436**/**5** thin · 1231 | E8S3 | 2/33734/**5** · 1867 |
| B5 med | E16S9 | 2/38063/**5** · 1338 | E4S7 | **3**/9001/**9** · 1365 / **13749** |
| B6 med | E18S5 | 2/34426/**5** · 1287 | E6S1 | 2/22018/**5** · 1615 |
| B7 easy | E12S1 | **3**/6964/**5** · 1236 / **14703** | E3S5 | **3**/13703/**10** · 1103 / **13482** |
| B8 easy | E13S7 | **3**/2397/**5** · 865 / **9607** | E21S4 | **3**/32460/**10** · 1512 / **11735** |
