# Cycle-16 stack vs `e839fc8` — what the number can teach

Seeding. Not a one-knob race. No src. No `push-race`. Control frozen
`e839fc8`. Set `1f90aub`, `--swap`. Metric that matters: mean spawn→RCL4,
**8/8**, **clean world**.

```
leftover-5 + 6W + no-RCL3-roads + no-RCL2-boxes + sticky + overlap + real 5W
latch gone
```

That is **seven live knobs** plus everything still in HEAD since the Aug 1
freeze. `_cycle16-hygiene.md` said revert sticky + overlap and race **only**
clamp+HOL so `[5W,M]` hatches. This seed did not. Do not read it as that
race.

Cycle-15 `run-2026-08-15T23-57-10Z` **SEND BACK** (`32092` vs `28657`).
Latch hatched **4W**, not 5W. Latch is gone on 16. Good. That does **not**
make 16 a 5W A/B.

---

## Verdict

**vs `e839fc8` this seed can only answer: is the current candidate pile
faster than the August 1 planner bot on this 16-room clean `--swap`
world.**

It cannot KEEP or SEND BACK leftover-5, 6W, no-roads, no-boxes, sticky,
overlap, or real 5W. A win is not “16 KEEP 5W.” A loss is not “5W failed.”
Either way the Δ is unidentified cargo.

`e839fc8` is **not** a slam-5 leftover-5 twin. It dumps 10 ext, sites RCL3
roads, sites RCL2 boxes, runs 4 shuttles, has no sticky, no roster-D, no
`[5W,M]` skip. The A/B is HEAD-since-freeze vs a two-week-old control.
Every cycle 3–15 already ran that same comparison. This is the next row of
the same pile, not a new instrument.

---

## What is actually in the pile

| bit | isolated clock | last call |
|---|---|---|
| slam-5 + getBody + park-after-depot + … (all post-freeze still live) | never vs a slam-5 control | cargo on every row |
| leftover-5 hold | dirty c5 **24512 7/8** (lie); clean bundled in c8 | **policy KEEP**; clock **thrown out** |
| 6W after 550 | dirty c4 **29181 vs 30851**; never re-A/B clean | **shape KEEP**; −1670 is not bankable |
| legacy depot miss-guard | bundled in c8 **29029 vs 29628 (−599)** | **correctness KEEP**; −599 is not the depot |
| no RCL3 BasePlan roads | c9 **30728 vs 29856 (+872)** | **slots KEEP**; lost the clock |
| no RCL2 source boxes (hub+bin still slam) | c10 **30002 vs 28404 (+1598)**; **+973 vs c8** | KEEP RCL3, **lost RCL4** |
| real 5W (clamp+HOL so `[5W,M]` hatches) | **never** | planned 16; model −150…−600 vs latch-4W |
| sticky pickup | **never** | after-15 #3; c12 haul-2 died **+2460** the other way |
| overlap-replace 4W (roster D) | **never** | after-15 #2; model −200…−800 |
| `lastSpawn=0` latch | c15 **32092 vs 28657 (+3435)** | **SEND BACK**; gone |

**Latch gone ≠ extra 5W at 550.** 13/14/15’s hypothesis was one more miner
while the leftover 2W still works. Without the poke there is **no** extra
miner. 2W lives out. Replacement at 550 is 5W. Income: **4 e/t until the
2W dies, then 10.** Not 2W+5W = 14. On 1-seat rooms 15’s overlap was
already a no-op (`_cycle15-e12s3.md`). “Overlap” in *this* stack is roster
D (parked **upgrader** 4W while 2W shuttles live), not miner overlap.

Silent cargo vs `e839fc8` that the label does not name: slam-5, interleave-10,
`getBody` off cap, builders `[W,2C,2M]`, drop RCL3 maintainer, remotes at 4,
legacy depot, hub+bin still slamming at RCL2. The listed seven are not the
whole Δ.

---

## What the number **can** teach vs `e839fc8`

1. **Pile vs August 1, this world.** 8/8 spawn→RCL4, same rooms, `--swap`,
   clean scrub. Yes or no: is HEAD faster than frozen control *today*.
   That is a campaign-health check, not a knob verdict. c8 already said
   **yes (−599)**. c9 / c10 / c15 said **no** (+872 / +1598 / +3435). 16
   is “did the new income bits buy back the construction losses,” still
   as a *sum*.

2. **This seed’s control clock vs prior `e839fc8` clocks.** Same binary,
   wandering means (c8 **29628**, c10 **28404**, c15 **28657**). A fat
   cand Δ can be control having a good or bad seed, leftover dirt on
   *control* tiles, or pair luck. `_clean-world.md`: control leftover
   benefit at RCL4 is **0–1.2k** and per-room is loud. Read both sides.

3. **Film, not the mean.**
   - leftover-5: cand L3 **5 ext / cap 550**; ctrl still 7–10.
   - real 5W: hatch `WORK=5`; `clamped EnergyMiner from 550 to 450` **dead**;
     after leftover 2W dies **10 e/t**, not 8.
   - latch gone: **1 miner/source** until replacement, not 2, not 10+.
   - roster D: depot *stands* → a parked 4W while 2W still work; heads
     not 10+.
   - sticky: far pile served; closest-select does not stack both bodies
     on the near source (the c12 death).

   Those are process checks. They do not attribute ticks.

4. **Pair split of the pile.** Far rooms (E12S3 / E5S3 / E18S9) still own
   the mean. Easy E13S7 finishing first ~23–25k teaches nothing. A win
   that is only E13S7 is not a win.

5. **Hygiene.** 0 leftover planner boxes, 0 spawn-tile roads, 0 stale
   `planV2` / `rclTimes.8`, 16/16 seeded. If that fails, the number
   teaches the same lie as **24512**.

---

## What it **cannot** teach vs `e839fc8`

**Any named KEEP / SEND BACK.** One Δ, seven knobs, plus post-freeze
cargo. Sign-flip of any one is invisible. Overlap’s model (−200…−800) is
*larger* than real 5W’s (−150…−600). Sticky is unscoped (hard/far).
No-boxes already cost **+1598** vs this same control. You cannot pull
those apart from one mean.

**Isolated real 5W.** Planned 16 was latch-4W vs latch+5W, or (after SEND
BACK) poke-free replacement 5W **alone**. This seed adds sticky + roster D
and drops the latch. vs c15 `32092` is **three** changes (latch off, 5W
on, sticky+overlap on). vs `e839fc8` is that plus the whole KEEP stack.

**Isolated leftover-5 or 6W.** Control is not a leftover-5 twin and not a
4-shuttle twin. Clean leftover-5+6W vs `e839fc8` is already c8 **−599**,
and even that includes the depot miss-guard. 16 does not re-measure
them.

**Isolated no-roads / no-boxes.** Already isolated. They **lost RCL4**.
A 16 win does not revive them as speed KEEPs. A 16 loss does not add
new evidence against them.

**Isolated sticky or roster D.** Never raced. Both were ranked *after* a
5W hatch so they would be measured at 10 e/t, **one each**. Bundling
them with the hatch is how you keep a loser that the hatch paid for.

**24512.** Dirty leftover planner depots + 7/8 drop E5S3
(`_clean-world.md`). Retired. Do not put it next to this seed.

**29029 as a 5W effect.** Cycle-8 is leftover-5+6W+depot, clean. 16 adds
roads-off, boxes-off, sticky, overlap, real 5W, no latch. Δ vs **29029**
is *cargo after c8*, not 5W. Same for **30002** (c10): that Δ is
sticky+overlap+real 5W+latch-gone on top of no-boxes — still a bundle,
but a *smaller* one than vs `e839fc8`.

**PlanV2 / claim / 1-source / swamp / remotes / unswapped.** Race is
`planPackMiss`, 2-source, 0–12% swamp, `--swap` only. no-rcl2-boxes and
no-RCL3-roads **do not hold** on `placeFromPlanV2`. A KEEP here is a
16-room BasePlan story (`gauntlet/_critic-keep-stack.md` §4).

**RCL8.** Clock stops at 4. Delay-then-build can still be legal on film
(leftover-5 dumps at 4). Skip-forever cannot. The mean does not see 405k.

**Re-baseline.** A pile win is not a new control. `push-race` stays dead.

**7/8.** Campaign law: different censoring → means not comparable. Do
not call, do not “almost.”

---

## If you insist on reading the mean

Honest comparisons, none of them a knob:

| vs | what the Δ actually is |
|---|---|
| **this seed’s `e839fc8`** | HEAD pile vs Aug 1, this world |
| **c8 29029** | everything after leftover-5+6W+depot |
| **c10 30002** | sticky + overlap + real 5W + latch-gone, on the no-boxes clock |
| **c15 32092** | latch off + 5W on + sticky + overlap (still 3 knobs) |
| **24512** | nothing. dirt. |

Call bar: RCL4 **8/8**. Report vs this control **and** vs **29029**.
Ignore gaps under ~200 (poll). Do not KEEP a knob. Do not SEND BACK a
knob. Film the five process checks. Then the *next* seed is one of:
real 5W alone, roster D alone, or sticky alone — not another pile.

Clean cand RCL4 still lives in **29–32k** when the bot is honest
(c8 29029, c9 30728, c10 30002, c11 29819, c12 32303, c15 32092). If 16
lands there, you learned the pile did not explode. You did not learn
why.

---

## What 16 already spent

Hygiene said: if 15 SEND BACK, drop the poke, keep both skips, **revert
sticky + overlap**, seed one knob. 15 SEND BACK happened (`_RUNNING.txt`
FINAL). This seed kept the skips, dropped the latch, and **left sticky
and overlap in**. That is why this note exists instead of a 5W watch.

Sister: `_cycle16-hygiene.md`, `_next-cycle16.md`, `_next-after-15.md`,
`_clean-world.md`, `gauntlet/_critic-keep-stack.md`, `_SPEEDRUN-STATE.txt`.
