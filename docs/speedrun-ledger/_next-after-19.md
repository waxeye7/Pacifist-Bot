# After cycle-19 — isolated 5W rematch

19 **FINAL CENSOR 5/8**. 20 live `run-2026-08-16T08-58-29Z`. **Do not re-seed.**

---

# Archive

19 **WATCHING** `run-2026-08-16T07-40-10Z` `cycle-19-5w-only`. **Do not seed.**

Label is a lie. Dest at seed: leftover-5 + 5W clamp+HOL + cheap-miner +
no-RCL2-roads **plus** cargo (RCL3 `paveNow`, far-ctrl RCL2 depot,
miner-first, L4 strip). Cannot KEEP 5W off this pile.

18 **CENSOR 3/8** stands (`31683` vs `29694`). 15 **SEND BACK**. 16
**CENSOR 7/8** — do **not** seed-clean 16.

## After 19 is called (endReason / elapsed≥40000 / RCL4 8/8)

Same next seed in all three cases:

| 19 call | next |
| --- | --- |
| CENSOR like 18 (n&lt;8) | isolated 5W rematch |
| 8/8 beats **29029** | still **no KEEP 5W** (pile). isolated rematch |
| 8/8 loses | isolated rematch |

Revert dest cargo so the rematch is leftover-5 + 5W clamp+HOL +
cheap-miner **WORK&lt;2** + no-RCL2-roads **only**. Dest-19
cheap-miner was **WORK&lt;4** — it replaced 5W while 2W lived.

| bit | next dest |
| --- | --- |
| leftover-5 `lvl<=3 → 5` | **keep** |
| 5W clamp skip + HOL exempt `[5W,M]` | **keep** |
| cheap-miner if home WORK&lt;2 | **WORK&lt;2** not dest-19 WORK&lt;4 |
| no-RCL2-roads | **keep** |
| far-ctrl RCL2 depot (`siteLegacyControllerDepot` `level===2` / slam-5+Cheby&gt;10) | **revert** |
| RCL3 haul-pave (`paveNow`) | **revert** |
| RCL1+RCL2 miner-first | **out** |
| L4 take+strip until `storage.my` | **out** |
| sticky / overlap / latch poke | stay **gone** |

Src already (dest-20 prep; 19 dest unchanged; do not seed): leftover-5
`lvl<=3 → 5`; cheap-miner **WORK&lt;2**; 5W clamp+HOL; no-RCL2-roads;
far-ctrl `siteLegacyControllerDepot` `level !== 3`; `paveNow` **gone**
(`ROAD && rcl < 4`); sticky/`stickySrc` + overlap
(`overlapReplaceWanted`) **gone**. Cargo still in src — do not revert
unless asked: RCL1+RCL2+RCL3 miner-first (`EnergyMinersInRoom < 1` /
`homeMinerWork < 2`); L4 take+strip until `storage.my`. Dest of 19
still compiled WORK&lt;4 + `level===2` depot + pave — do not
push-pacifist. Next compile must not.

Then (not now):

```
fnm exec --using 22 node tools/server/seed-clean.mjs --label cycle-20-5w-only --tick-budget 40000 --note "isolated 5W clamp+HOL; leftover-5; cheap-miner WORK<2; no RCL2 roads; no pave; no far-ctrl RCL2 depot"
```

`--swap`. Control `e839fc8`. Mark **29029** / this-ctrl **29694**. Never 24512.

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim E36N57
NEVER  SSH
NEVER  seed while 19 is watching
```
