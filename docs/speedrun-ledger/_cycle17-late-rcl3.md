# Cycle-17 late RCL3 — slam delay, not pave

`run-2026-08-16T04-56-08Z` · `cycle-17-rcl3-pave` · **pile+pave** vs `e839fc8`.
Sticky+overlap+real 5W+cheap-miner still in. Pave **inert** until L3+slam-5.
**Not KEEP / SEND BACK.** Do not attribute the Δ to pave. Mark **29029** / this-ctrl **30533**.

tick **4832726** · elapsed **~22.5k / 40000** (seed0 4810260). TIMES 05:44Z.

```
ctrl   RCL3 15349 (n=8/8)
cand   RCL3 14162 (n=1/8)  E12S3 only. Other 7 still L2.
```

Ctrl 8/8 at **15349** is **on-schedule** (c16 this-ctrl 15249). Do not Δ **14162 vs 15349** — 1/8 vs 8/8. Cand is late because **slam never finished** on seven rooms, not because pave spent the 45k. The one room that *did* slam+L3 (E12S3 **14162**) is *ahead* of the ctrl mean — and that is the only room where pave is even live.

Last room film ~14–16k (`_cycle17-slam.md` lastSeen 4829575 still stalled):

| cand | L/p/ext · c | vs snap@5.2k |
| --- | --- | --- |
| E5S3 | 2/**3811/0** · 17 | 3452/0 — **+359 in 9k** |
| E18S5 | 2/**4292/0** · 16 | 4129/0 — **+163** |
| E11S6 | 2/4711/1 · 15 | 3837/0 |
| E13S7 | 2/**5280/5** · **5** | 4504/5 — slammed, then died |
| E16S9 | 2/5077/3 · 17 | 3164/0 |
| E18S9 | 2/6847/3 · 17 | 5073/1 |
| E12S1 | 2/10430/5 · 7 | 4805/4 |
| E12S3 | **3**/165/5 · 16 | 4613/3 · e3=**14162** |

## Not pave

Pave cannot own this row:

- Gate is **L3+slam-5**. Seven cand still L2 → **0 roads / 0 road sites**.
- E12S3 is the only pave-open room and it is **not** the late clock (14162 vs ctrl 15349).
- Overlap needs a standing depot; leftover-5 dump needs L4. Inert on the frozen rooms.

## Why cand is late (slam)

1. **0-ext slam stall** — E5S3 / E18S5 never banked 3k. Cap **300** forever, p frozen (~3.8k / ~4.3k). Chicken-egg: 2W only until 5 ext stand; energy sits in hub+floor, not those tiles. 45k at shuttle 200e. Sticky `atMine` pins first CA to FIND_SOURCES order (far key); near drop-mines unserved. Those two own the mean if they stay at 300.

2. **5W HOL-exempt blackout** — slammed-then-dead. E13S7 **5 ext / 5 creeps / p=5280**; E12S1 5/7/10430. Clamp skip + HOL skip stay; `[5W,M]` never shrinks; leftover 2W death = 0 miners; RCL≤3 interleave spends the trickle. Cycle-16 E13S7 was this film (0 miners / 2×5W q @10.3k → DG L1 → e3 **23750**). Cheap-miner heal only if 0 live **and** avail<550 — a queued 5W or dying 2W can miss the gate.

0-ext as its own clock (no 6W, no 5W) is the same two rooms as (1). Variance is weather-sized **if** the other seven were climbing. They are not.

Film those (miners WORK, spawn_list head, ext sites, CA vs source). Wait cand 8/8 RCL3 then RCL4 8/8. Still not a knob call.

Did **not**: push-race, seed, reset, revert, unclaim, SSH.
