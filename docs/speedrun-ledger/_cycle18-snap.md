# Cycle-18 snap

**FINAL CENSOR 3/8.** `run-2026-08-16T06-22-16Z` · `cycle-18-rcl3-haul` · tick-budget **4890981**. cand **2138** / **22636** 7/8 / **31683** **3/8** vs ctrl **1666** / **15308** / **29694** 8/8. E11S6 DNF L2. **No KEEP.**

`run-2026-08-16T06-22-16Z` · `cycle-18-rcl3-haul` · **PILE vs `e839fc8`**, not isolated 5W.
Knob: RCL3 haul-pave after slam-5 (BFS, 8 sites, 2 builders). **NO RCL2 roads.** leftover-5 stays.
Mark **29029 8/8**. This-control **29694**. Not dirty **24512**.
tick **4890981** · elapsed **40026 / 40000** (seed0 4850955) · seed **16/16 seedOk**. exitReason **tick-budget**.

## Race-mean (07:10Z)

```
candidate  RCL2 2138 (n=8/8)  RCL3 15333 (n=4/8)  RCL4 23715 (n=1/8)  tick=4876360
control    RCL2 1666 (n=8/8)  RCL3 15308 (n=8/8)  RCL4 24554 (n=1/8)  tick=4876360
```

RCL2 **+472**. RCL3 4/8 vs 8/8 — do not Δ. First cand RCL4 **E13S7 23715** vs ctrl **E21S4 24554**. vs-clean29029 **−5314** on n=1. **not 8/8**, no KEEP.

leftover-5 **HOLD** L3 ext=5. L4 dump E13S7 ext=7. Ctrl L3 leak 10.

| pair | cand | L/p/ext · e2/e3/e4 | ctrl | L/p/ext · e2/e3/e4 |
| --- | --- | --- | --- | --- |
| B1 | E5S3 | 3/65850/**5** · 1818/16706 | E9S1 | 3/108060/**10** · 1703/16116 |
| B2 | E12S3 | 2/29285/**5** · 2926 | E13S9 | 3/27946/**10** · 1644/18814 |
| B3 | E18S9 | 2/12507/**5** · 1996 | E8S5 | 3/61121/**10** · 1729/18127 |
| B4 | E11S6 | 2/**6861**/**5** stall · 2835 | E8S3 | 3/104823/**10** · 1725/14176 |
| B5 | E16S9 | 3/**14576**/**5** stall · 1581/13439 | E4S7 | 3/132658/**10** · 1610/14063 |
| B6 | E18S5 | 2/**6029**/**5** stall · 2469 | E6S1 | 3/90661/**10** · 1868/16009 |
| B7 | E12S1 | 3/45366/**5** · 2214/18238 | E3S5 | 3/91428/**10** · 1491/13036 |
| B8 | E13S7 | **4**/19236/**6** · 1261/12949/**23715** | E21S4 | **4**/21109/**10** · 1561/12126/**24554** |

Stalls: E11S6 0 miners · E18S5 1W · E16S9 1W + p frozen. L2 roads **0/0**. Will censor RCL3 if 4 stay L2.

15 SEND BACK / 16 CENSOR stand. Did **not** seed.

---

Earlier (06:45Z): tick **4864681** · elapsed **13726 / 40000**. lastSeen **4866684**.

Prev: cycle-17 FINAL tick-budget **4850273**. cand 1313 / 29990 4/8 / **27338 1/8** · ctrl 1397 / 15349 / **29919 8/8**. **CENSOR. RCL2-pave SEND-BACK. No KEEP.**

## Race-mean

```
candidate  RCL2 2138 (n=8/8)  RCL3 13194 (n=2/8)  RCL4 — (n=0/8)  tick=4864681
control    RCL2 1666 (n=8/8)  RCL3 12581 (n=2/8)  RCL4 — (n=0/8)  tick=4864681
```

RCL2 **2138 8/8** vs **1666 8/8** (**+472**). RCL3 **13194 2/8** vs **12581 2/8** (not 8/8 — do not Δ). RCL4 —.
vs-clean29029: no cand RCL4 yet. **not 8/8**, no KEEP.
vs-leftover5: RCL3 **+2194** vs dirty 11000; vs-clean **13829 −635**. dirty-not-mark.

First cand L3: **E13S7 12949**/5 then **E16S9 13439**/5 HOLD. First ctrl L3: **E21S4 12126**/10 leak then **E3S5 13036**.

After 4864681 (lastSeen 4866684): ctrl **13350 4/8** — E8S3 **14176** @4865131 · E4S7 **14063** @4865276. Cand still **2/8**.

## Pair table (lastSeen ≤ 4866684)

| pair | cand | L/p/ext · e2/e3 | ctrl | L/p/ext · e2/e3 |
| --- | --- | --- | --- | --- |
| B1 hard | E5S3 | 2/36306/**5** · 1818 | E9S1 | 2/42496/**5** · 1703 |
| B2 hard | E12S3 | 2/26648/**5** · 2926 | E13S9 | 2/33256/**5** · 1644 |
| B3 hard | E18S9 | 2/11259/**5** · 1996 | E8S5 | 2/25993/**5** · 1729 |
| B4 med | E11S6 | 2/5079/**5** · 2835 | E8S3 | **3**/9922/**6** · 1725 / **14176** |
| B5 med | E16S9 | **3**/14551/**5** · 1581 / **13439** | E4S7 | **3**/6165/**9** · 1610 / **14063** |
| B6 med | E18S5 | 2/5972/**5** · 2469 | E6S1 | 2/43751/**5** · 1868 |
| B7 easy | E12S1 | 2/25544/**5** · 2214 | E3S5 | **3**/12288/**10** · 1491 / **13036** |
| B8 easy | E13S7 | **3**/19680/**5** · 1261 / **12949** | E21S4 | **3**/20323/**10** · 1561 / **12126** |

All `seedOk=true`. leftover-5 **HOLD** E16S9 / E13S7 ext=**5**. Slam-5 cand **8/8**. Ctrl leak **10** E21S4 / E3S5 · E4S7 **9** · E8S3 **6**.
Stall (p frozen): cand **E11S6 5079** · **E18S5 5972** · **E18S9 11259** (thin 6–7c).

## Near

Cand next L3: **E5S3 p=36306**/5 need **8694**. Then E12S3 26648 · E12S1 25544.
Ctrl next L3: **E6S1 43751** need **1249**. Then E9S1 42496 need 2504.
Cand L3 lead E13S7 p=**19680** need **115320** to L4.

Pave: gate open E16S9 / E13S7 (L3+slam-5). Rest L2 → inert. leftover-5 hold.

## Verdict — **FINAL CENSOR 3/8**

- Called. exit **tick-budget** 4890981. cand 2138 / 22636 7/8 / **31683 3/8** vs ctrl 1666 / 15308 / **29694 8/8**.
- **No KEEP.** E11S6 DNF L2. RCL3 haul-pave unisolated. L2 0 roads (process pass).
- Mark **29029 8/8** / this-ctrl **29694**. Not 24512.
- Cycle-17 FINAL **stands**. 19 already seeded — do **not** re-seed.

Did: header stamp. Did **not**: push-race, seed, reset, revert, unclaim.
