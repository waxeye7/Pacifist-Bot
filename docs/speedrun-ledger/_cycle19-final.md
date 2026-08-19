# Cycle-19 FINAL — tick-budget · CENSOR 5/8 · no KEEP

`run-2026-08-16T07-40-10Z` · `cycle-19-5w-only` · `--swap` · control `e839fc8`.
exit **tick-budget** 4931580. Seed 4891503. 16/16 `seedOk`.

| | RCL2 | RCL3 | RCL4 |
|---|---|---|---|
| **cand** | **1264** 8/8 | **17196** 8/8 | **34358** **5/8** |
| **ctrl** | 1615 8/8 | 16566 8/8 | **31044** 8/8 |

vs this-ctrl RCL4: **5/8 vs 8/8**. vs clean **29029**: 5-room 34358 is not a mean. **24512 still dirt.**

## Cand RCL4

| room | R2 | R3 | R4 | L3→L4 |
|---|---:|---:|---:|---:|
| E13S7 | 865 | **9607** | **31638** | 22031 (c18 was 10766) |
| E5S3 | 906 | 15919 | 31759 | 15840 |
| E18S5 | 1287 | 17911 | 35279 | 17368 |
| E11S6 | 1231 | 20994 | 35812 | 14818 |
| E16S9 | 1338 | 17280 | 37301 | 20021 |

DNF: E12S3 L3 p=130756 (4k short). E12S1 L3 120958. E18S9 L3 20494 stall.

## Call

**CENSOR 5/8. No KEEP. Not a 5W A/B.**

5W dest **DIRTY** (`WORK<4` replaced `[5W,M]` while 2W still lived). leftover-5 **held** (L4 take-until-storage left several rooms at ext=5). RCL2 −351 is real; L3→L4 climb is the hole (E13S7 22k vs c18 10.7k). Pile vs `e839fc8` — cannot KEEP 5W / leftover-5 / pave / far-ctrl off 5/8.

20 already seeded `run-2026-08-16T08-58-29Z` **`cycle-20-5w-only`**. **Do not re-seed.** Mark **29029** / this-ctrl **31044**.

Did **not**: seed, push-race, reset, git push, unclaim, SSH, src.

```
NEVER  seed
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim
NEVER  SSH
```
