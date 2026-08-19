# Cycle-18 stack vs `e839fc8` — what the number can teach

Watching `run-2026-08-16T06-22-16Z` `cycle-18-rcl3-haul`. Not a one-knob
race. No `push-race`. Control frozen `e839fc8`. Set `1f90aub`, `--swap`.
Metric: mean spawn→RCL4, **8/8**, **clean world**. Mark **29029** /
this-ctrl **29919**. Never 24512.

```
leftover-5 + sticky + overlap + real 5W + cheap-miner
+ RCL3 haul-pave (BFS, 8 sites, 2 builders) + no-RCL2-roads
latch gone · RCL2-pave gone (c17 SEND BACK)
```

That is **seven live knobs** plus post-freeze cargo (6W, no-RCL2-boxes,
slam-5, …). Hygiene after 16 still said revert sticky + overlap and seed
**`cycle-N-5w-only`**. 17 did not. 18 did not. Do not read this as
pave-alone or 5W-alone.

Cycle-17 FINAL `run-2026-08-16T04-56-08Z`: cand **27338 1/8** vs ctrl
**29919 8/8**. RCL3 **4/8**. **CENSOR.** RCL2 full-haul-pave **SEND BACK**
(E16S9 L3 **31858** after **62** roads). RCL3 haul-pave stayed
**unisolated** (E12S3 27338, n=1, mid-race harden). 18 is that harden
with RCL2 roads wiped — still a pile.

---

## Verdict

**vs `e839fc8` this seed can only answer: is HEAD pile + RCL3 haul-pave
(no RCL2 roads) faster than the August 1 planner bot on this 16-room
clean `--swap` world.**

**It cannot KEEP or SEND BACK pave alone.** A win is not “18 KEEP
roads.” A loss is not “pave failed.” Either way the Δ is unidentified
cargo. Sticky, overlap, 5W, leftover-5, and cheap-miner all moved too.

`e839fc8` still dumps 10 ext, sites the full RCL3 road set, sites RCL2
boxes, runs 4 shuttles, has no sticky, no roster-D, no `[5W,M]` skip,
no cheap-miner head. Cycle-9 banned *all* RCL3 BasePlan roads and **lost
RCL4 (+872)**. Cycle-17 paved at RCL2 and **lost the 45k**. 18 paves the
BFS haul line (hub→ctrl/sources/spawn, then hub ring) **after RCL3 +
slam-5**, **max 8** open road sites, **2** builders, keep-far janitor.
That is not c9 inverted and not c17 isolated.

---

## What is actually in the pile

| bit | isolated clock | last call |
|---|---|---|
| leftover-5 hold | dirty c5 **24512 7/8** (lie); clean bundled in c8 | **policy KEEP**; clock **thrown out** |
| 6W after 550 | dirty c4; never re-A/B clean | **shape KEEP**; silent cargo |
| no RCL2 source boxes | c10 **30002 vs 28404 (+1598)** | KEEP RCL3, **lost RCL4**; silent cargo |
| real 5W (clamp+HOL) | **never** | c16 film: 5W yes, 7/8 DNF |
| sticky pickup | **never** | after-15 #3; c12 haul-2 died **+2460** |
| overlap-replace 4W (roster D) | **never** | after-15 #2; model −200…−800 |
| cheap-miner head (0 live + avail<550) | **never** | c16 E18S5 patch; process only |
| RCL3 haul-pave (BFS, 8, 2 builders) | **never** | labeled 17/18; **unisolated** |
| no-RCL2-roads | c17 RCL2-pave **SEND BACK** | **on** this seed (the c17 fix) |
| no-RCL3-roads (c9) | c9 **30728 vs 29856 (+872)** | **off** — 18 paves at 3 |
| `lastSpawn=0` latch | c15 **32092 vs 28657 (+3435)** | **SEND BACK**; gone |

Silent cargo vs `e839fc8` the label does not name: slam-5, interleave-10,
`getBody` off cap, builders `[W,2C,2M]`, drop RCL3 maintainer, remotes at
4, legacy depot, hub+bin still slamming at RCL2, leftover-5, 6W,
no-boxes, sticky, overlap, real 5W, cheap-miner. Haul-pave is one row.

---

## What the number **can** teach vs `e839fc8`

1. **Pile+RCL3-pave vs August 1, this world.** 8/8 spawn→RCL4, same
   rooms, `--swap`, clean scrub. Yes or no: is HEAD *today* faster than
   frozen control. Campaign-health, not a knob verdict. c8 **yes
   (−599)**. c9 / c10 / c15 **no**. c16 **7/8 DNF**. c17 **1/8 CENSOR**.
   18 is “did RCL3-only pave + the rest of the pile buy back c17’s
   construction stall,” still as a *sum*.

2. **This seed’s control clock vs prior `e839fc8` clocks.** Same binary,
   wandering means (c8 **29628**, c16 **30533**, c17 **29919**). A fat
   cand Δ can be control weather. `_clean-world.md`: leftover benefit at
   RCL4 is **0–1.2k** and per-room is loud. Read both sides.

3. **Film, not the mean.** After **RCL3 + slam-5** (`cap >= 550`):
   - **0 roads / 0 road sites at RCL2.** E16S9-class 62-road slam must
     not recur.
   - haul **road sites exist** (BFS hub→ctrl/sources/spawn, then ring).
     No wall/shell roads. **Max 8** open. **2** builders spend 300e/tile.
     Janitor **keeps** far haul tiles (>12 from spawn).
   - leftover-5 still **5 ext / cap 550**. Roads must not dump the
     leftover 5.
   - real 5W: hatch `WORK=5`; `clamped EnergyMiner from 550 to 450` dead.
   - cheap-miner: if 0 live miners and `available < 550`, head becomes
     `[2W,M]`/`[W,M]` — no second E18S5-class blackout.
   - overlap: depot *stands* → parked 4W while 2W still work.
   - sticky: far pile served; closest-select does not stack both bodies
     on the near source.

   Those are process checks. They do not attribute ticks.

4. **Pair split of the pile.** Far rooms (E12S3 / E5S3 / E18S9 / E18S5)
   still own the mean. Easy E13S7 first ~23–25k teaches nothing. A win
   that is only E13S7 is not a win. Another E18S5 DNF or a 1-room L4 is
   **not 8/8** — do not call, do not “almost.”

5. **Hygiene.** 0 leftover planner boxes, 0 spawn-tile roads, 0 stale
   `planV2` / `rclTimes.8`, 16/16 seeded. If that fails, the number
   teaches the same lie as **24512**.

---

## What it **cannot** teach vs `e839fc8`

**Any named KEEP / SEND BACK. Least of all pave.** One Δ, seven knobs,
plus post-freeze cargo. Cycle-9 already isolated “no RCL3 roads” and
**lost**. Cycle-17 already called **RCL2 pave SEND BACK**. 18 is not
the inverse A/B of either: it paves a *subset* at RCL3 only, caps at 8,
waits for slam-5, and ships sticky + overlap + 5W + cheap-miner. You
cannot pull pave out of the mean.

**Isolated leftover-5, 6W, sticky, overlap, real 5W, or cheap-miner.**
Control is not a twin of any of them. Cheap-miner can only show on
film (blackout did / did not recur). Its model is “do not DNF,” not a
tick Δ.

**Isolated no-roads / no-boxes.** Already isolated. They **lost RCL4**.
An 18 win does not revive them as speed KEEPs. An 18 loss does not add
new evidence against them.

**24512.** Dirty leftover planner depots + 7/8 drop E5S3. Retired.

**c16 26849 as a pave effect.** 7/8 + E18S5 censor. Illegal.

**c17 27338 as a pave effect.** 1/8 + E12S3 only. Illegal. Δ vs that
one room is still pile + mid-race harden, not 18.

**29029 as a pave effect.** Cycle-8 is leftover-5+6W+depot, clean. 18
adds no-boxes, sticky, overlap, real 5W, cheap-miner, RCL3 haul-pave,
no latch, no RCL2 roads. Δ vs **29029** is *cargo after c8*, not roads.

**PlanV2 / claim / 1-source / swamp / unswapped.** Race is
`planPackMiss`, 2-source, 0–12% swamp, `--swap` only. Pave here is a
16-room BasePlan story. `placeFromPlanV2` does not run.

**RCL8.** Clock stops at 4. Delay-then-build can still be legal on film
(leftover-5 dumps at 4). Skip-forever cannot.

**Re-baseline.** A pile win is not a new control. `push-race` stays dead.

**7/8 or 1/8.** Different censoring → means not comparable.

---

## If you insist on reading the mean

Honest comparisons, none of them a knob:

| vs | what the Δ actually is |
|---|---|
| **this seed’s `e839fc8`** | HEAD pile+RCL3-pave vs Aug 1, this world |
| **c8 29029** | everything after leftover-5+6W+depot |
| **c9 30728** | not “pave vs no-roads.” 18 is not c9 inverted |
| **c10 30002** | sticky+overlap+5W+heal+RCL3-pave on the no-boxes clock |
| **c16 26849 7/8** | nothing. censor. |
| **c17 27338 1/8** | nothing. censor. |
| **24512** | nothing. dirt. |

Call bar: RCL4 **8/8**. Report vs this control **and** vs **29029**.
Ignore gaps under ~200 (poll). Do not KEEP a knob. Do not SEND BACK a
knob. Film the process checks.

Then the *next* isolated seed is still **`cycle-N-5w-only`**: revert
sticky + overlap, keep clamp+HOL + leftover-5 + cheap-miner heal +
no-RCL2-roads. Not another pile. Not pave-alone on top of
sticky+overlap.

Clean cand RCL4 still lives in **29–32k** when the bot is honest
(c8 29029, c9 30728, c10 30002, c11 29819, c12 32303, c15 32092).
c16’s 26849 and c17’s 27338 are censors — do not park next to them.
If 18 lands 29–32k **8/8**, you learned the pile did not explode.
You did not learn why.

---

## What 18 already spent

Hygiene after 16: revert sticky + overlap, seed one 5W knob. 16 called
no-KEEP / 7/8 DNF. 17 left sticky and overlap in, added pave, paved at
RCL2, and **CENSOR 1/8**. 18 keeps the same pile, kills RCL2 roads, and
re-runs RCL3 haul-pave. That is why this note exists instead of a 5W
watch.

Sister: `_cycle17-stack.md`, `_cycle17-final.md`, `_next-rcl3-pave.md`,
`_next-after-16.md`, `_cycle16-hygiene.md`, `_clean-world.md`,
`gauntlet/_critic-keep-stack.md`, `_SPEEDRUN-STATE.txt`.
