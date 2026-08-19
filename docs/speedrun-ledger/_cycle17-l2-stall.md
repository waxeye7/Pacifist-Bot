# Cycle-17 L2 stall — HOL-550 blackout

`run-2026-08-16T04-56-08Z` · mongo `rooms.objects` + redis `memory:pacifist1` + `gameTime`.
Film **4843753** · elapsed **33493 / 40000** (seed0 4810260). First pass 4842970 / ~32.7k same shape.
No `push-race`.

**Cause:** HOL-exempt `[5W,M]` sits at fill **45–300** (`-6`, stall 38–52); leftover **1W/2W** still live so cheap-miner heal (`liveMiners===0`) does not fire; second source dark. Not 0-ups (except E18S5, consequence) and not sticky (drops empty, carriers exist).

| room | L / p | miners WORK | n/src | ups | fill | head | lastSpawn age | stall |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| E5S3 | 2 / 10400 | **1W** | 1 / 2 | 1 | 300 | **5W 550** | 48 / 248 | 49 EM |
| E18S9 | 2 / 10137 | **1W** | 1 / 2 | 1 | 281 | **5W 550** | 244 / 44 | 45 EM |
| E11S6 | 2 / 28000 | **2W** | 1 / 2 | 1 | **45** | **5W 550** | 53 / 1351 | 38 EM |
| E18S5 | 2 / **11292** frozen | **2W** (at spawn) | 1 / 2 | **0** | 300 | **5W 550** | 451 / 51 | 52 EM |
| E12S1 | 2 / 15814 | **2W** | 1 / 2 | 2 | 234 | **5W 550** | 42 / 242 | 43 EM |
| E13S7 | 2 / 22033 | **5+5** | 1 / 1 | 7 | **550** | empty (spawning U) | 1035 / 324 | 0 |
| E12S3 | **4** / 64740 | **6+6** | 1 / 1 | 6×4W | 950 | empty | 276 / 394 | 0 |

`fiveWQueued` **true** both home src all rows. lastSpawn is the **queue stamp**, not a hatch (ages 42–53 = just re-queued 5W). E5S3 / E18S9 already cheap-healed once (`[W,M]`); 5W re-queued on top. Interleave (age 31–590) spends the 2–4 e/t trickle on 300e builders / 400e shuttles. E18S5 p frozen ~800t, both src 3000, ups dead.

E13S7 **recovered** this hour (p +6.7k / ~800t). E16S9 escaped to L3 **31858** with **5+5**. E12S3 slammed first, 5W at leftover-5, e3 **14162** e4 **27338**.

Not KEEP / REVERT. Same cycle-16 E18S5 shape; cheap-heal misses while any leftover miner lives. Did **not**: push-race, seed, reset, unclaim, SSH.
