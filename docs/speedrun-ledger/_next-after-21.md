# After cycle-21 — do not seed

21 **WATCHING** `run-2026-08-16T10-19-31Z` `cycle-21-rcl3-haul`. **Do not re-seed.** **Do not push-pacifist.**

Dest-21: leftover-5 + 5W WORK<2 + bestWORK + no-RCL2-roads + **RCL3 paveNow**. Cargo: miner-first + L4 strip.

Mark **29029** / this-ctrl **29053**. Never 24512.

## After 21 FINAL

| 21 call | next |
| --- | --- |
| CENSOR n&lt;8 | dest-22 dest-cheap `=== 0` (src already staged) |
| 8/8 beats 29029 | still isolate dest-cheap; do not KEEP pave off a pile |
| 8/8 loses | dest-22 dest-cheap `=== 0` |

Do **not** KEEP 5W / leftover-5 / pave isolated off a pile.

| bit | dest-22 |
| --- | --- |
| leftover-5 `lvl<=3 → 5` | **keep** |
| 5W clamp+HOL | process-pass only |
| cheap-miner **=== 0** | **the knob** (was WORK&lt;2) |
| bestWORK | **keep** |
| no-RCL2-roads | **keep** |
| RCL3 paveNow | dest-21 test — KEEP only if 8/8 and isolated |
| lastSpawn=0 poke | **stay gone** |
| miner-first `=== 0` | dest-23 staged (was `< 2`) |
| L4 strip | still cargo — dest-24 |

```
fnm exec --using 22 node tools/server/seed-clean.mjs --label cycle-22-cheap0 --tick-budget 40000 --note "dest-cheap only at 0 miners; leftover-5; 5W clamp+HOL; pave stays if 21 process-pass"
```

`--swap`. Control `e839fc8`. **Not now.**

```
NEVER  seed while 21 watches
NEVER  npm run push-race
NEVER  push-pacifist
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim
NEVER  SSH
```
