# Cycle-20 RCL3 — film only, no KEEP

`run-2026-08-16T08-58-29Z` · `cycle-20-5w-only` · pile vs `e839fc8`.
TIMES **4958203** · elapsed **25657 / 40000**. **7/8 spawn→RCL3.** Not KEEP / SEND BACK.
Clock is 45k (cap 300). Dest: leftover-5 + 5W clamp+HOL **PASS** + no RCL3 pave.
Mark **29029** / this-ctrl **31044**. Never 24512.

```
candidate  RCL3 17160 (7/8)
control    RCL3 15419 (8/8)
```

**+1741.** vs leftover-5 KEEP **11000** (**+6160**). vs cycle-8 **13829** (**+3331**).
vs cycle-19 **17196 8/8** (−36 on 7/8 — do not Δ). E18S9 still out (L2 p≈44k).

| pair | cand e3 | ctrl e3 | Δ |
| --- | ---: | ---: | ---: |
| B1 E5S3 / E9S1 | 15663 | 15697 | −34 |
| B2 E12S3 / E13S9 | 18920 | 17559 | +1361 |
| B3 E18S9 / E8S5 | — | 15714 | out |
| B4 E11S6 / E8S3 | **22907** | 16316 | **+6591** |
| B5 E16S9 / E4S7 | 16353 | 15413 | +940 |
| B6 E18S5 / E6S1 | 19906 | 16392 | +3514 |
| B7 E12S1 / E3S5 | 15865 | 14282 | +1583 |
| B8 E13S7 / E21S4 | **10503** | 11979 | **−1476** |

Mean is E11S6 / E18S5 / E12S3 / E12S1. Easy E13S7 is **−1476**.

## Not a knob

**leftover-5** held (L3 ext=5). Policy **KEEP** (c5). RCL3 is slower than that
KEEP and this ctrl. **Cannot SEND BACK.**

**5W** process **PASS** (hatch `[5W,M]` at slam-550; dest `WORK<2` did not
replace a live 2W). RCL3 worse than ctrl. **Cannot KEEP 5W.**

**no RCL3 pave** (`paveNow` gone · L3 **0/0**). Cycle-9 same cut lost RCL4
**+872** (KEEP policy). Pave gone **may** have cost this RCL3. Film, not a call.

7/8 vs 8/8 is not a mean to KEEP off. Wait RCL4 **8/8**. Still a pile
(leftover-5 + miner-first + L4 strip still in dest).

```
NEVER  seed
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim
NEVER  SSH
NEVER  src
```

Did **not**: seed, push-race, reset, git push, unclaim, SSH, src.
