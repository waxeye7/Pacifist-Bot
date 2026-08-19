# After cycle-18 — isolated `cycle-19-5w-only`

18 **called** FINAL CENSOR 3/8 (`run-2026-08-16T06-22-16Z`). 19 already seeded `run-2026-08-16T07-40-10Z` **`cycle-19-5w-only`**. **Do not re-seed.**

15 **SEND BACK**. 16 **already CENSOR 7/8** — do **not** seed-clean 16.

## After 18 is called (endReason / elapsed≥40000 / RCL4 8/8)

Src **already prepped 07:10Z** (not in race dest):

| bit | status |
| --- | --- |
| sticky pickup | **reverted** (`rg` empty) |
| overlap-replace / cull | **reverted** |
| latch `lastSpawn=0` poke | **gone** (self-heal only) |
| clamp skip + HOL exempt `[5W,M]` | **keep** |
| leftover-5 `lvl<=3 → 5` | **keep** |
| cheap-miner if home WORK&lt;4 | **keep** (harden) |
| L4 take + **strip ext sites** until `storage.my` | **keep** (after-clock) |
| RCL2 miner-first if 0 miners | **keep** (empire; cargo on 5W) |
| no-RCL2-roads | **keep** |
| far-ctrl depot RCL2 slam-5 Cheby>10 | **silent cargo** — revert before 5w-only if you want isolation |

Already seeded (do **not** re-run):

```
fnm exec --using 22 node tools/server/seed-clean.mjs --label cycle-19-5w-only --tick-budget 40000 --note "isolated 5W clamp+HOL; leftover-5; no sticky/overlap; no RCL2 roads"
```

`--swap`. Control `e839fc8`. Mark **29029** / this-ctrl **29694**. Never 24512.

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim E36N57
NEVER  re-seed 19
```
