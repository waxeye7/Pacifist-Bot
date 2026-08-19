# Cycle-16 snap

`run-2026-08-16T03-18-19Z` · `cycle-16-5w-real` · **PILE vs `e839fc8`**, not an isolated 5W A/B.
Mark **29029 8/8** (cycle-8 clean leftover-5+6W). Not dirty **24512**. vs leftover-5 RCL3 **11000** is dirty; clean compare **29029** / this control.
tick **4807486** · elapsed **37834 / 40000** (seed0 4769652) · seed **16/16 seedOk**. exitReason **null**.

Prev: cycle-15 FINAL `23-57-10Z` SEND BACK latch (hatched 4W). cand 811 / 15177 / **32092** · ctrl 907 / 15134 / **28657**.

## Race-mean

```
candidate  RCL2 1548 (n=8/8)  RCL3 14363 (n=8/8)  RCL4 26849 (n=7/8)  tick=4807486
control    RCL2 1730 (n=8/8)  RCL3 15249 (n=8/8)  RCL4 30533 (n=8/8)  tick=4807486
```

RCL2 **1548** vs **1730** (**−182**). RCL3 **14363** 8/8 vs **15249** 8/8 (**−886**).
RCL4 cand **26849** 7/8 vs ctrl **30533** 8/8 (**−3684**, n mismatch). vs-clean29029 **−2180** on 7/8 — **not 8/8**, no KEEP. 7/8 is cycle-5’s CENSOR trick (drop the dead room).

## Pair table (lastSeen ≤ 4807486)

| pair | cand | L/p/ext · e2/e3/e4 | ctrl | L/p/ext · e2/e3/e4 |
| --- | --- | --- | --- | --- |
| B1 hard | **E5S3** | **4**/33930/5 · 1524/15396/**30237** | **E9S1** | **4**/102043/20 · 1330/17613/**29067** |
| B2 hard | **E12S3** | **4**/158488/19 · 1643/12501/**23955** | **E13S9** | **4**/42977/13 · 1398/16626/**34523** |
| B3 hard | **E18S9** | **4**/26240/6 · 1587/16541/**28968** | **E8S5** | **4**/73197/10 · 3374/15929/**33937** |
| B4 med | **E11S6** | **4**/121833/20 · 1798/11534/**23625** | **E8S3** | **4**/87628/12 · 1561/14084/**30000** |
| B5 med | **E16S9** | **4**/129853/20 · 1468/13269/**24278** | **E4S7** | **4**/156784/20 · 1501/14024/**22951** |
| B6 med | E18S5 | 3/5950/5 · 1123/**10408**/— | **E6S1** | **4**/46319/10 · 1798/19798/**35336** |
| B7 easy | **E12S1** | **4**/75471/20 · 1441/11504/**22886** | **E3S5** | **4**/27786/14 · 1213/11926/**35081** |
| B8 easy | **E13S7** | **4**/50219/5 · 1798/23750/**33991** | **E21S4** | **4**/177196/20 · 1666/11989/**23371** |

All `seedOk=true`. leftover-5 **HOLD L3** — cand **E18S5** ext=**5**. dump-at-L4 ok (E12S1 **20** · E11S6 **20** · E12S3 **19** · E16S9 **20**). L4 still-5: E5S3 E13S7. E18S9 **6**. Ctrl leak **10** (E8S5 E6S1); E21S4 **20**.
Late: cand **E13S7** hit L4 **33991**. cand **E18S5** missing RCL4 — DOWNGRADE L3→L2→L1 (~4806k, 0 creeps / 550-HOL-blackout) then re-L3 p=**5950**/5 c=12. Need 135k, **~2.2k ticks left** — will not hit 4. **CENSOR** like cycle-5 E5S3.

L4: cand E12S1 **22886** · E11S6 **23625** · E12S3 **23955** · E16S9 **24278** · E18S9 **28968** · E5S3 **30237** · E13S7 **33991**. missing **E18S5**. ctrl 8/8 E4S7 **22951** · E21S4 **23371** · E9S1 **29067** · E8S3 **30000** · E8S5 **33937** · E13S9 **34523** · E3S5 **35081** · E6S1 **35336**.

## Verdict — **WATCHING**

- Still live (`exitReason` null, elapsed 37834 < 40000, cand 7/8). No FINAL.
- No KEEP / REVERT / SEND BACK on a knob. Pile vs `e839fc8`. 7/8 is **not** KEEP.
- E18S5 **CENSOR**-track (like cycle-5). Do not treat **26849** as an 8/8 mean.
- Beat **29029 8/8** or this seed’s live control. Not 24512. Not dirty 11000.

Did: race-mean + pair parse. Did **not**: push-race, seed, reset, revert, unclaim.
