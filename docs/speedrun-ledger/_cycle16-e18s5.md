# Cycle-16 E18S5 — real L3→L2→L1, not a lastSeen glitch

`run-2026-08-16T03-18-19Z` · seed 4770053 · mongo `rooms.objects` + redis `memory:pacifist1` + `users.notifications`.
No src. No `push-pacifist`.

**lastSeen 4806429 L2 p=49938 creeps=1 is real.** Progress is not reset on DG, so L2 with p>45k is leftover L3 progress, not a poll mix. Then **L2→L1** (notif 04:45:08Z). Upgraders wrapped leftover p≈50k → L2 (04:46:20) → L3 (04:46:27). Now a **new** L3 climb.

| clock | E18S5 |
| --- | --- |
| first L3 | 4780461 / e3=**10408** (mem `rclTimes.3` 4780334) |
| prior film | L3 p **frozen 9438** · 0 miners · 1 carrier · hub 9,35=2000e · spawn 60–210 |
| lastSeen 4806429 | **L2** p=49938 ext=5 creeps=**1** |
| 04:45:08Z | **DG L1** — no upgrade activity |
| film 4806914 | L1 p=50175 (pt stale 200) · 9 creeps · **2×2W** miners · spawn 300 / ext 250 · **0 boxes** |
| 04:46:20 / 04:46:27 | re-L2 then re-L3 (progress wrap) |
| film **4807799** | **L3 p=6765** · ttd≈**20000** (`downgradeTime` 4827797) |

## Now (tick 4807799, elapsed ~37.7k)

| | |
| --- | --- |
| L / p / DG | **3 / 6765** / ~20k (stored `ticksToDowngrade` 200000 + `progressTotal` 200 are stale) |
| spawn / ext | Spawn1 9,36 · **spawnE 170** · ext **5** extE 150 · cap 550 · not spawning |
| tower | 7,30 · 1000e · hits 3000 |
| hub / boxes | **hubE 0** — 0 containers (old 9,35 2000 box gone). Sites: ctrl 5,12 **2305/5000**; 5,30 / 9,34 / 11,34 / 10,21 all 0/5000 |
| sources | 9,21 + 12,33 · ~2.5k/1.8k · drops 313+41 |
| miners | **3** = 2W+2W+**5W** (5W just hatched, ttl 4809155) |
| creeps | **13** · 3M 3C 4U 2B 1S |
| mem | `spawnStall` 8 · `overlap4WQueued` false · `lastShrink` 4806794 · `lastTimeSpawnUsed` 4807655 |

Cause unchanged: HOL-exempt `[5W,M]` sat at 550 through the blackout → 0 income → ttd died. 2W hatch (lastShrink) unstuck fill; leftover p bought instant re-L3. **RCL4 still censored** on this seed (37.7k, new L3 p=6.8k).
