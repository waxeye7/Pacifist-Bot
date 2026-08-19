# Cycle-21 RCL3 — film only, no KEEP

`run-2026-08-16T10-19-31Z` · `cycle-21-rcl3-haul` · dest-20 + **RCL3 haul-pave** after slam-5.
Dest: leftover-5 + 5W clamp+HOL + cheap-miner **WORK<2** + no-RCL2-roads + `paveNow` at L3.
vs dest-20 FINAL `run-2026-08-16T08-58-29Z` · **no pave** · cand **18299 8/8** / ctrl **15419 8/8**.
Mark **29029** / this-ctrl **29053**. Never 24512.

lastTick **4990135** · elapsed **~17296 / 40000** (seed0 **4972839**) · watch **104** · maxLag **186**.
exitReason **null**. Still live. TIMES 10:44Z tick **4989138** was cand **12951 5/8** vs ctrl **12972 4/8**.

```
candidate  RCL2 1550 (8/8)  RCL3 13564 (6/8)  RCL4 — (0/8)
control    RCL2 1524 (8/8)  RCL3 14627 (7/8)  RCL4 — (0/8)
TIMES 5/8  cand 12951 (5/8)  ctrl 12972 (4/8)   ← do not Δ
dest-20    cand 18299 (8/8)  ctrl 15419 (8/8)
```

**No KEEP on n=5 or n=6.** 0/8 RCL4. vs-clean **29029** / this-ctrl **29053** not in play.

## Pair e3 vs dest-20 FINAL

| pair | d21 cand | d20 cand | Δ | d21 ctrl | d20 ctrl |
| --- | ---: | ---: | ---: | ---: | ---: |
| B1 E5S3 / E9S1 | 15054 | 15663 | **−609** | 17170 | 15697 |
| B2 E12S3 / E13S9 | 16627 | 18920 | **−2293** | — L2 p=41900 | 17559 |
| B3 E18S9 / E8S5 | **14261** | **26274** | **−12013** | 16613 | 15714 |
| B4 E11S6 / E8S3 | — L2 p=**38911** | **22907** | out | 14382 | 16316 |
| B5 E16S9 / E4S7 | 12733 | 16353 | **−3620** | 12439 | 15413 |
| B6 E18S5 / E6S1 | — L2 p=**11598** | 19906 | out | 16720 | 16392 |
| B7 E12S1 / E3S5 | 13100 | 15865 | **−2765** | 13450 | 14282 |
| B8 E13S7 / E21S4 | **9608** | 10503 | **−895** | 11618 | 11979 |

Same-6 mean: d21 **13564** vs d20 **17263** (**−3699**). All six in are faster. Tail not in: **E11S6** (d20 **22907**) · **E18S5** (d20 **19906**).

TIMES 5/8 (drop E12S3): E5S3 15054 · E18S9 14261 · E16S9 12733 · E12S1 13100 · E13S7 9608 = **12951**. d20 same-5 **16932**.

## Pave vs late rooms — **not the 135k**

Headline **12951 vs 18299** is **not** pave buying the 135k.

- `paveNow` gates **after L3 + slam-5**. L2 film **0/0** roads (`_cycle21-pave-watch.md`). Spawn→RCL3 cannot be a pave win.
- dest-20 mean was the **late tail**: E18S9 **26274** (L2 dest-cheap loop) · E11S6 **22907** · E18S5 **19906** · E12S3 **18920**.
- dest-21 already converted two of those: E18S9 **14261** (**−12.0k**, no cheap loop this seed) · E12S3 **16627** (**−2.3k**). That is L2 variance, not 135k.
- dest-21 **still out** the other two. E18S5 L2 p=**11598**/5 at ~17k elapsed (need **33402**) — dest-20-style late room, **not in the mean**. E11S6 p=**38911** frozen ~525t (need **6089**). If those two land at d20 clocks, 8/8 mean ≈ **(81383+22907+19906)/8 = 15525** — still <18299, still not 8/8, still not KEEP.

Pave's clock is **L3→L4 135k**. **0/8 RCL4.** Film only:

| cand L3 | e3 | L3 age | p / 135k | e/t | vs d20 climb |
| --- | ---: | ---: | ---: | ---: | --- |
| E13S7 | 9608 | **7197** | **77869** | **10.8** | d20 climb **19115** (0 roads). Project ~12.5k if rate holds → e4 ~22k vs **29618**. n=1, 57k left. |
| E16S9 | 12733 | 4236 | 13448 | 3.2 | slow start (road spend?) |
| E12S1 | 13100 | 3758 | 5936 | 1.6 | slow |
| E18S9 | 14261 | 2824 | 4251 | 1.5 | slow |
| E5S3 | 15054 | 2242 | 1945 | 0.9 | frozen 525t |
| E12S3 | 16627 | 525 | 3228 | 6.1 | just in |

E13S7 **may** be the pave 135k (c18 haul climb **10766**; d20 no-pave **19115**). Other L3 rooms are **spending**, not paying back. Do not KEEP off 10.8 e/t on one easy room.

## leftover-5 · 5W

leftover-5 **HOLD** all cand L3 ext=**5**. Ctrl leak E4S7/**10** · E3S5/**10** · E21S4/**10** · E8S5/**6**.
5W hatch **process-pass** earlier (L2 0/0). Not a clock KEEP.

## Verdict — **WATCHING · no KEEP**

- Live. No FINAL. **No KEEP** on n=5 **12951** or n=6 **13564**.
- **Not pave buying 135k.** Composition + dest-20 E18S9 loop absent. 135k unproven (0/8 RCL4).
- Beat **29029 8/8** or this-ctrl **29053**. **Never 24512.**
- Cycle-20 FINAL **stands** — **CENSOR 3/8**, not KEEP 5W.
- Watch **E18S5** (late) · **E11S6** (freeze) · **E13S7** 135k.

Did **not**: seed, push-race, reset, git push, unclaim, SSH, src.

```
NEVER  seed
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim
NEVER  SSH
NEVER  src
```
