# Cycle-21 snap

`run-2026-08-16T10-19-31Z` · `cycle-21-rcl3-haul` · dest-20 + **RCL3 haul-pave** after slam-5.
Dest: leftover-5 + 5W clamp+HOL + cheap-miner **WORK<2** + no-RCL2-roads + `paveNow` at L3.
Mark **29029 8/8**. This-control **29053**. Never **24512**.
tick **4990410** · elapsed **17571 / 40000** (seed0 **4972839**) · lastSeen **4990410** · seed **16/16 seedOk**. exitReason **null**. watch **106** polls · maxLag **186**.
git `e36e0a6` dirty.

Prev: cycle-20 FINAL tick-budget. cand **1320 / 18299 / 33334 3/8** · ctrl **1500 / 15419 / 29053 8/8**. **CENSOR 3/8. No KEEP 5W.** 20 FINAL stands.

## Race-mean

```
candidate  RCL2 1550 (n=8/8)  RCL3 13564 (n=6/8)  RCL4 — (n=0/8)  tick=4990410
control    RCL2 1524 (n=8/8)  RCL3 14627 (n=7/8)  RCL4 — (n=0/8)  tick=4990410
```

RCL2 **1550** vs **1524** (**+26**, cand slower). vs dest-20 **1320 / 1500**: cand **+230** · ctrl **+24**.
B4 E11S6 **3268** is the pull. Drop B4: cand **1305** vs dest-20 **1320**.
RCL3 **13564 6/8** vs ctrl **14627 7/8**. first e3 **E13S7 9608**. vs dest-20 **18299 8/8**: **do not Δ n**. vs-clean29029: no cand RCL4. **not 8/8**, no KEEP.

## Pair table (lastSeen ≤ 4990410)

| pair | cand | L/p/ext/cr · e2/e3 | ctrl | L/p/ext/cr · e2/e3 |
| --- | --- | --- | --- | --- |
| B1 hard | E5S3 | 3/**2187**/5/6 · **1254 / 15054** | E9S1 | 3/2028/5/13 · **1726 / 17170** |
| B2 hard | E12S3 | 3/**3690**/5/19 · **1284 / 16627** | E13S9 | 2/43006/5 · **1318** / — |
| B3 hard | E18S9 | 3/**4251**/5/11 · **1538 / 14261** | E8S5 | 3/7169/**7**/32 · **2047 / 16613** |
| B4 med | E11S6 | **2/38911**/5/9 · **3268** / — | E8S3 | 3/2109/5/20 · **1803 / 14382** |
| B5 med | E16S9 | 3/**13448**/5/11 · **1422 / 12733** | E4S7 | 3/13776/**10**/22 · **1446 / 12439** |
| B6 med | E18S5 | **2/12993**/5/14 · **1370** / — | E6S1 | 3/2661/5 · **1550 / 16720** |
| B7 easy | E12S1 | 3/**5936**/5/9 · **1160 / 13100** | E3S5 | 3/7632/**10** · **1339 / 13450** |
| B8 easy | E13S7 | 3/**78853**/5/13 · **1107 / 9608** | E21S4 | 3/39293/**10**/19 · **964 / 11618** |

All `seedOk=true`. RCL2 unc **146–178**. RCL4 **0/8**.

vs dest-20 cand e2: B8 **−415** · B3 **−283** · B2 **−131** · B1 **+126** · B5 **+186** · B6 **+187** · B7 **+205** · **B4 +1972**.

## leftover-5 · 5W · L2 roads · paveNow

| check | prove |
| --- | --- |
| leftover-5 HOLD | **HOLD** — cand **8/8 ext=5** / 550. Slam-5 **8/8**. Ctrl leak **7–10** (E8S5 7 · E4S7/E3S5/E21S4 10). |
| 5W @ cap 550 | All 8 cap **550**. Live bodies **unfilmed** this pass. Last mongo **4981949**: 5W **5/8** (E18S9/E11S6 2W · E18S5 1×2W). dest-21 `WORK<2`. |
| L2 roads = 0 | L2 left: **E11S6 · E18S5**. Last mongo **4981949** **0+0 / 8**. This pass **unfilmed**. Must stay 0. |
| haul-pave | Gate **open 6/8**. **r/s unfilmed.** E12S1 p frozen **5936**; E13S7 climbing **78853**. |

## Near

E13S7 need **56147** to L4. E11S6 **38911** frozen (stall family). E18S5 still L2.

## Verdict — **WATCHING · no KEEP**

- Still live (`exitReason` null, elapsed 17571 < 40000). No FINAL.
- **No KEEP.** 6/8 RCL3 · 0/8 RCL4. Do not Δ 13564 vs 14627. Do not Δ vs dest-20 R3 (n mismatch).
- Beat **29029 8/8** or this-control **29053**. **Never 24512.**
- Cycle-20 FINAL **stands** — **CENSOR 3/8**, not KEEP.
- leftover-5 **HOLD**. L2 roads / L3 pave / 5W bodies **not re-filmed**.
- Do **not** seed. Do not KEEP / REVERT / SEND BACK.

Did: race-mean + pair from ledger lastSeen. Did **not**: docker exec, push-race, seed, reset, revert, unclaim, SSH, src.

```
NEVER  seed
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim
NEVER  SSH
NEVER  src
```
