# Cycle-16 E13S7 — still L2 at ~23k

`run-2026-08-16T03-18-19Z` · seed 4769652 · mongo `rooms.objects` + redis `memory:pacifist1` + `users.notifications`.
No src. No `push-race`.

**Cause:** leftover 2W died and HOL-exempt `[5W,M]` sat at 550 (film 10.3k: **0 live miners**, 2×5W queued, waiting fill); interleave spent the trickle, upgraders died, controller **downgraded L2→L1**, then the 45k was done twice. Not 4W hatch, not sticky-far (L=2/4), not a missing hauler formula, not `spawnStall` (0 at probe).

| clock | E13S7 | pair E21S4 |
| --- | ---: | ---: |
| RCL2 (first) | **1798** | 1666 |
| film 4779982 | L2 p=12381 ext=5 · **0 miners / 5W+5W q** | L2 p=30396 · **4+4** |
| notify | warn → **downgrade L1** → re-L2 → L3 | — |
| RCL3 | **23750** (~2.05 e/t on the first climb, then redo) | **11989** |
| RCL4 | — | 23371 |

Memory: `fiveWQueued` true both sources, `pathLength` 2/4, `lastShrink` 4788993 / `lastInterleave` 4788887 (~19.3k, 5W head `-6`), `lastSpawn` 4792915/4792993 (5W finally hatched), `spawn_list` []. Latch poke is gone → 1 miner/source → death is a blackout; HOL will not shrink 550→450; leftover-5 never fills 600.

## Probe tick 4793798 (elapsed 24146, just-L3 p=4158)

Miner WORK **5+5**. Ext **5/5** (50e). Hub (17,16) 2000e. Drops 1609+(14,14) + 738+(13,15). 0 roads, 0 tower. Sites: tower + 3 boxes (RCL3 pack). `spawnStall` 0.

| role | n | body |
| --- | ---: | --- |
| EnergyMiner | 2 | **5W1M** |
| Upgrader | 5 | 2W2C2M (still shuttles; depot not up) |
| Carrier | 2 | 4C4M + 3C3M |
| Builder | 2 | 1W2C2M |
| filler | 1 | 1C1M |
| Sweeper | 1 | 2C1M |
| Repair | 1 | 1W1C1M spawning |
| **creeps** | **14** | |
