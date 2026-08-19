# Cycle-17 A/B — pave RCL3 haul roads

APPLIED IN SRC. Do not mid-race push-pacifist while cycle-16 is watching.

**Knob (hardened mid-17):** after slam-5 (`cap>=550`) at **RCL2 or 3**, site and **build** the live haul line (hub→ctrl/sources/spawn, then hub ring). Max **8** open road sites. **2** builders. Builders pick roads after tower, before source boxes. Janitor **keeps** haul tiles even if >12 from spawn (cycle-17 film: E12S3 only ever had 3 hub-ring sites at 0/300 because far>12 deleted the ctrl line). leftover-5 stays.

**Not cycle-9.** Cycle-9 banned all RCL3 roads after unused sites ate the 100-cap. That race **lost** RCL4 (+872). This paves the line and actually spends 300e/tile.

**Seed after 16 is called:**
```
fnm exec --using 22 node tools/server/seed-clean.mjs --label cycle-17-rcl3-pave --tick-budget 40000 --note "RCL3 arterial roads after slam-5; builders pave; leftover-5 stays"
```

Mark: cycle-16 RCL4 8/8 if KEEP, else cycle-8 **29029**. Never 24512.
