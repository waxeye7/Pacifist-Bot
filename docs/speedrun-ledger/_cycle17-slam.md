# Cycle-17 slam film — E5S3 / E18S5 vs E12S3

`run-2026-08-16T04-56-08Z` · `cycle-17-rcl3-pave` · mongo `rooms.objects` + redis `memory:pacifist1`.
Film **4833367** (elapsed **~23.1k** / seed0 4810260). Second pass ~**48338xx** (E18S5 4th ext). No `push-pacifist`.

lastSeen `ext` is **standing only**. Sites are up. Slam is a spend-fail, not a place-fail.

## One line

| room | line |
| --- | --- |
| **E5S3** | L2 **p=6281** · standing ext **3**/cap 450 · sites 2 ext (**1278→2523**/3000 + 0) + box 24,31 0/5000 · fill 130–172 · creeps 14–16 · **miner WORK 2+2** · **builders 2** (0e then 15+75, spending) · 5×[W,C,M] ups on 32-tile pocket · floor ~2k at seats · stall 27 |
| **E18S5** | L2 **p=8008** · standing ext **3→4**/cap 450–500 · sites 1–2 ext (**1365 then 2070**/3000) + box 5,30 0/5000 · fill 90–269 · creeps 14–15 · **miner WORK 2+2+2+2** (4 on 2 src; one at spawn) · **builders 2–3 all ~0e** · 3–4 ups (one 2W) on 25-tile ctrl · floor 3 · stall 49 |
| **E12S3** | **L3** e3=**14162** · p≈**90k**/135k · standing ext **5**/cap **550** leftover-5 hold · tower + 9 roads + 3 road sites · fill **550** · **miner WORK 5+5** · builders 2×100e · 4×4W ups · stall **0** |

0 @16.6k (`_cycle17-slam.md` prior) → 2 @~22k → 3/4 @23.1k. Still not slam-5.

## Why slam is slow

**miner WORK — yes, still 2W.** Cap 450 < 550 so `[5W,M]` cannot hatch. 8 e/t until the 5th ext stands. `fiveWQueued=true` both src is stale (write-only; hygiene miss, not the clock). E18S5's extra two 2W do not add a third source.

**0 builders — no.** E5S3 **2** live, now carrying, site 21,34 climbing. E18S5 **2–3** live, all empty: hub 9,34 = 0–146e, floor 3. Energy is in carriers (136+129) and a fat upgrader (100e), not on the ext tile.

- Chicken-egg at cap 450: **2W only** until 5 stand. E12S3 already paid 15k and hatched 5W.
- Roster during slam: **4–5×[W,C,M] upgraders + repair + filler** eat the trickle. E5S3 ctrl is **32** from spawn. E18S5 ctrl is **25**.
- Spawn heads are 300–350e (`4C3M` / `[W,2C,2M]`) at fill **<300** → stall 27 / 49. E18S5 `lastShrink` 4833241.
- Extra **5k** hub-tile container site still 0 (RCL2 `findLocked` prefers ext — correct). Not the lock.
- E18S5 sources are close (L=13/2) and **still** crawling: 4×2W flood + empty builders, not a 5W HOL (that is E12S3's 550 path).

E12S3 finished slam, hatched **[5W,M]**, hit L3, leftover-5 **hold**, pave **9** standing + **3** sites. Contrast, not the sick rooms.

No KEEP / REVERT / mid-race push. Mark **29029** / this-ctrl **30533**.
