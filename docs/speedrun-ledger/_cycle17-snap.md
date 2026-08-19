# Cycle-17 snap

`run-2026-08-16T04-56-08Z` · `cycle-17-rcl3-pave` · **PILE+pave vs `e839fc8`**, not an isolated 5W A/B.
Knob: haul-pave after slam-5 (`RCL2+`, max 8 road sites, 2 builders). leftover-5 stays. Sticky+overlap still in.
Mark **29029 8/8** (cycle-8 clean leftover-5+6W). This-control **30533**. Not dirty **24512**.
tick **4843367** · elapsed **33107 / 40000** (seed0 4810260) · seed **16/16 seedOk**. exitReason **null**. polls 263.

Prev: cycle-16 FINAL tick-budget **4809710**. cand 1548 / 14363 / **26849 7/8** · ctrl 1730 / 15249 / **30533 8/8**. E18S5 DNF. **16 FINAL stands. No KEEP** (pile + censor).

## Race-mean

```
candidate  RCL2 1313 (n=8/8)  RCL3 23010 (n=2/8)  RCL4 27338 (n=1/8)  tick=4843367
control    RCL2 1397 (n=8/8)  RCL3 15349 (n=8/8)  RCL4 28131 (n=6/8)  tick=4843367
```

RCL2 **1313** vs **1397** (**−84**). RCL3 **23010 2/8** vs **15349 8/8** (not 8/8 — do not Δ). RCL4 **27338 1/8** vs **28131 6/8**.
vs-clean29029: cand first **27338** is **−1691** on 1/8 — **not 8/8**, no KEEP.

First cand L3: **E12S3 14162**/5 then **E16S9 31858**/5 HOLD. First cand L4: **E12S3 27338**/12 (dump started). First ctrl L4: **E21S4 22957**/20.

## Pair table (lastSeen ≤ 4843367)

| pair | cand | L/p/ext · e2/e3/e4 | ctrl | L/p/ext · e2/e3/e4 |
| --- | --- | --- | --- | --- |
| B1 hard | E5S3 | 2/10332/**5** · 1630 | E9S1 | **4**/69831/**14** · 1290 / 15668 / **27282** |
| B2 hard | E12S3 | **4**/59360/**12** · 1590 / 14162 / **27338** | E13S9 | **3**/107186/**10** · 1610 / 18864 |
| B3 hard | E18S9 | 2/10109/**5** · 1547 | E8S5 | **4**/7918/**10** · 1569 / 16471 / **32563** |
| B4 med | E11S6 | 2/27941/**5** · 1265 | E8S3 | **4**/48466/**10** · 1636 / 15279 / **28501** |
| B5 med | E16S9 | **3**/4050/**5** · 1094 / **31858** | E4S7 | **4**/97707/**14** · 1363 / 13722 / **25216** |
| B6 med | E18S5 | 2/11292/**5** · 916 | E6S1 | **3**/120857/**10** · 1437 / 18033 |
| B7 easy | E12S1 | 2/15735/**5** · 1488 | E3S5 | **4**/6545/**10** · 1154 / 13376 / **32269** |
| B8 easy | E13S7 | 2/18970/**5** · 972 | E21S4 | **4**/144785/**20** · 1115 / 11382 / **22957** |

All `seedOk=true`. leftover-5 **HOLD** E16S9 ext=5. E12S3 L4 dump ext=**12**. Slam-5 cand **8/8**. Late L2 **6/8** all ext=5 (was 7 — E16S9 just L3). Ctrl leak **10** on L3 + fresh L4; E21S4 **20** · E4S7/E9S1 **14**.

## Near

Cand next L3: **E11S6 p=27941**/5 need **17059**. Then E13S7 18970 · E12S1 15735. Frozen ~10k: E18S5 11292 · E5S3 10332 · E18S9 10109.
Ctrl next L4: **E6S1 120857** need **14143**. Then E13S9 107186 need 27814.
Cand E16S9 p=**4050** need **130950** to L4.

Pave: pile+pave. Gate open on slam-5 (all 8 cand). leftover-5 hold except E12S3 dump.

## Verdict — **WATCHING**

- Still live (`exitReason` null, elapsed 33107 < 40000). No FINAL.
- No KEEP / REVERT / SEND BACK. Pile vs `e839fc8` (leftover-5+sticky+overlap+pave).
- Beat **29029 8/8** or this-control **30533**. Not 24512. Not dirty 11000.
- Cycle-16 FINAL **stands** — **not** KEEP (7/8 E18S5 DNF).

Did: race-mean + pair parse. Did **not**: push-race, seed, reset, revert, unclaim.
