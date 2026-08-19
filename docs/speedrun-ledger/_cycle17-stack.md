# Cycle-17 stack vs `e839fc8` — what the number can teach

Watching `run-2026-08-16T04-56-08Z` `cycle-17-rcl3-pave`. Not a one-knob
race. No `push-race`. Control frozen `e839fc8`. Set `1f90aub`, `--swap`.
Metric: mean spawn→RCL4, **8/8**, **clean world**.

```
leftover-5 + 6W + no-RCL2-boxes + sticky + overlap + real 5W
+ cheap-miner heal + RCL3 arterial pave
latch gone · no-roads gone (pave is the inverse of c9)
```

That is **eight live knobs** plus post-freeze cargo. Hygiene after 16
said revert sticky + overlap and seed **`cycle-N-5w-only`**. This seed
did not. Do not read it as pave-alone or 5W-alone.

Cycle-16 FINAL `run-2026-08-16T03-18-19Z`: cand **26849 7/8** vs ctrl
**30533 8/8**. E18S5 DNF (HOL-exempt `[5W,M]` blackout). **No KEEP**
(pile + censor). Cheap-miner heal is the E18S5 patch. Pave is the
labeled add. Both ride on the same 16 pile.

---

## Verdict

**vs `e839fc8` this seed can only answer: is HEAD pile + arterial pave
+ cheap-miner heal faster than the August 1 planner bot on this 16-room
clean `--swap` world.**

It cannot KEEP or SEND BACK pave alone. A win is not “17 KEEP roads.”
A loss is not “pave failed.” Either way the Δ is unidentified cargo.

`e839fc8` still dumps 10 ext, sites the full RCL3 road set, sites RCL2
boxes, runs 4 shuttles, has no sticky, no roster-D, no `[5W,M]` skip,
no cheap-miner head. Cycle-9 banned *all* RCL3 BasePlan roads and
**lost RCL4 (+872)**. 17 paves the arterial prefix (hub ring +
hub→spawn/ctrl/sources), **after slam-5**, **max 3** open road sites,
and builders actually spend 300e/tile. That is not c9 inverted one
knob — leftover-5, 5W, sticky, overlap, and the blackout heal all
moved too.

---

## What is actually in the pile

| bit | isolated clock | last call |
|---|---|---|
| slam-5 + getBody + park-after-depot + … | never vs a slam-5 control | cargo on every row |
| leftover-5 hold | dirty c5 **24512 7/8** (lie); clean bundled in c8 | **policy KEEP**; clock **thrown out** |
| 6W after 550 | dirty c4 **29181 vs 30851**; never re-A/B clean | **shape KEEP**; −1670 is not bankable |
| no RCL2 source boxes (hub+bin still slam) | c10 **30002 vs 28404 (+1598)** | KEEP RCL3, **lost RCL4** |
| real 5W (clamp+HOL so `[5W,M]` hatches) | **never** | c16 film: 5W yes, 7/8 DNF |
| sticky pickup | **never** | after-15 #3; c12 haul-2 died **+2460** |
| overlap-replace 4W (roster D) | **never** | after-15 #2; model −200…−800 |
| cheap-miner head (0 live + avail<550) | **never** | c16 E18S5 patch; process only |
| RCL3 arterial pave (max 3, after slam-5) | **never** | labeled 17; **not** c9 |
| no-RCL3-roads (c9) | c9 **30728 vs 29856 (+872)** | **slots KEEP**; **off** this seed |
| `lastSpawn=0` latch | c15 **32092 vs 28657 (+3435)** | **SEND BACK**; gone |

Silent cargo vs `e839fc8` the label does not name: slam-5, interleave-10,
`getBody` off cap, builders `[W,2C,2M]`, drop RCL3 maintainer, remotes at 4,
legacy depot, hub+bin still slamming at RCL2, leftover-5, 6W, no-boxes,
sticky, overlap, real 5W, cheap-miner. Pave is one row of that.

---

## What the number **can** teach vs `e839fc8`

1. **Pile+pave vs August 1, this world.** 8/8 spawn→RCL4, same rooms,
   `--swap`, clean scrub. Yes or no: is HEAD *today* faster than frozen
   control. Campaign-health, not a knob verdict. c8 **yes (−599)**.
   c9 / c10 / c15 **no**. c16 **7/8 DNF**. 17 is “did pave + the
   blackout heal buy back the construction losses,” still as a *sum*.

2. **This seed’s control clock vs prior `e839fc8` clocks.** Same binary,
   wandering means (c8 **29628**, c10 **28404**, c15 **28657**, c16
   **30533**). A fat cand Δ can be control weather. `_clean-world.md`:
   leftover benefit at RCL4 is **0–1.2k** and per-room is loud. Read
   both sides.

3. **Film, not the mean.** At RCL3, after slam-5 (`cap >= 550`):
   - arterial **road sites exist** (hub ring + hub→spawn/ctrl/sources).
     No wall/shell roads. **Max 3** open road sites.
   - builders **do not suicide** on roads-only (`findLocked` closest-site
     fallback; spawn still queues **1** if `paveArterials`).
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
   that is only E13S7 is not a win. Another E18S5 DNF is **7/8** — do
   not call, do not “almost.”

5. **Hygiene.** 0 leftover planner boxes, 0 spawn-tile roads, 0 stale
   `planV2` / `rclTimes.8`, 16/16 seeded. If that fails, the number
   teaches the same lie as **24512**.

---

## What it **cannot** teach vs `e839fc8`

**Any named KEEP / SEND BACK. Least of all pave.** One Δ, eight knobs,
plus post-freeze cargo. Cycle-9 already isolated “no RCL3 roads” and
**lost**. 17 is not the inverse A/B: it paves a *subset*, caps at 3,
waits for slam-5, and ships four other unscoped bits. You cannot pull
pave out of the mean.

**Isolated leftover-5, 6W, sticky, overlap, real 5W, or cheap-miner.**
Control is not a twin of any of them. Cheap-miner can only show on
film (blackout did / did not recur). Its model is “do not DNF,” not a
tick Δ.

**Isolated no-roads / no-boxes.** Already isolated. They **lost RCL4**.
A 17 win does not revive them as speed KEEPs. A 17 loss does not add
new evidence against them.

**24512.** Dirty leftover planner depots + 7/8 drop E5S3. Retired.

**c16 26849 as a pave effect.** That is 7/8 + E18S5 censor. Δ vs
**26849** is illegal. Δ vs c16 *finished rooms* is still pave +
cheap-miner on the same pile — two knobs, and the 7th room is gone.

**29029 as a pave effect.** Cycle-8 is leftover-5+6W+depot, clean. 17
adds no-boxes, sticky, overlap, real 5W, cheap-miner, pave, no latch.
Δ vs **29029** is *cargo after c8*, not roads.

**PlanV2 / claim / 1-source / swamp / unswapped.** Race is
`planPackMiss`, 2-source, 0–12% swamp, `--swap` only. Pave here is a
16-room BasePlan story. `placeFromPlanV2` does not run.

**RCL8.** Clock stops at 4. Delay-then-build can still be legal on film
(leftover-5 dumps at 4). Skip-forever cannot.

**Re-baseline.** A pile win is not a new control. `push-race` stays dead.

**7/8.** Different censoring → means not comparable.

---

## If you insist on reading the mean

Honest comparisons, none of them a knob:

| vs | what the Δ actually is |
|---|---|
| **this seed’s `e839fc8`** | HEAD pile+pave vs Aug 1, this world |
| **c8 29029** | everything after leftover-5+6W+depot |
| **c9 30728** | not “pave vs no-roads.” 17 is not c9 inverted |
| **c10 30002** | sticky+overlap+5W+heal+pave on the no-boxes clock |
| **c16 26849 7/8** | nothing. censor. |
| **24512** | nothing. dirt. |

Call bar: RCL4 **8/8**. Report vs this control **and** vs **29029**.
Ignore gaps under ~200 (poll). Do not KEEP a knob. Do not SEND BACK a
knob. Film the process checks. Then the *next* isolated seed is still
**`cycle-N-5w-only`**: revert sticky + overlap, keep clamp+HOL +
leftover-5 + cheap-miner heal. Not another pile. Not pave-alone on
top of sticky+overlap.

Clean cand RCL4 still lives in **29–32k** when the bot is honest
(c8 29029, c9 30728, c10 30002, c11 29819, c12 32303, c15 32092).
c16’s 26849 is 7/8 — do not park next to it. If 17 lands 29–32k
**8/8**, you learned the pile did not explode. You did not learn why.

---

## What 17 already spent

Hygiene after 16: revert sticky + overlap, seed one 5W knob. 16
called no-KEEP / 7/8 DNF. This seed left sticky and overlap in,
added pave, and shipped the E18S5 heal. That is why this note
exists instead of a 5W watch.

Sister: `_next-rcl3-pave.md`, `_cycle16-stack.md`, `_cycle16-hygiene.md`,
`_next-after-16.md`, `_cycle16-e18s5.md`, `_clean-world.md`,
`gauntlet/_critic-keep-stack.md`, `_SPEEDRUN-STATE.txt`.
