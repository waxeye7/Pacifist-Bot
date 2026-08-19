# Cycle-20 stack vs `e839fc8` — what the number can teach

Watching `run-2026-08-16T08-58-29Z` `cycle-20-5w-only`. Label says
isolated 5W. Dest vs 19 dropped three bits. **Still a pile vs
`e839fc8`.** No `push-race`. No seed. No src. Control frozen
`e839fc8`. Set `1f90aub`, `--swap`. Metric: mean spawn→RCL4, **8/8**,
**clean world**. Mark **29029** / this-ctrl **31044**. Never 24512.

```
KEEP: leftover-5 + 5W clamp+HOL + cheap-miner WORK<2 + no-RCL2-roads
GONE vs 19: cheap-miner WORK<4 · RCL3 haul-pave · far-ctrl RCL2 depot
STILL CARGO:
  RCL1+RCL2+RCL3 miner-first
  L4 take+strip until storage.my
  6W · no-RCL2-boxes · slam-5
REVERTED earlier: sticky · overlap · latch
```

Can **film** 5W hatch (`WORK=5`; clamp-450 dead; HOL keeps `[5W,M]`;
`WORK<2` does not replace a live 2W). **Still cannot KEEP 5W alone**
if leftover-5 / miner-first moved.

Cycle-19 FINAL `run-2026-08-16T07-40-10Z`: cand **34358 5/8** vs ctrl
**31044 8/8**. **CENSOR.** Dest dirty (`WORK<4`). 20 is dest-19 minus
pave + far-ctrl + the cheap-miner gate fix. Not a twin of clamp+HOL.

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim E36N57
NEVER  SSH
NEVER  seed while 20 is watching
NEVER  src
```

---

## Verdict

**vs `e839fc8` this seed can only answer: is HEAD dest (5W-labeled,
leftover-5 + miner-first + L4 strip + 6W + no-boxes + slam-5 still
in) faster than the August 1 planner bot on this 16-room clean
`--swap` world.**

**It cannot KEEP or SEND BACK 5W.** A win is not “20 KEEP 5W.” A
loss is not “5W failed.” leftover-5 and miner-first still sit in
dest. Either way the Δ vs control is unidentified cargo.

`e839fc8` still dumps 10 ext, sites the full RCL3 road set, sites
RCL2 boxes, runs 4 shuttles, has no `[5W,M]` skip, no cheap-miner,
no miner-first. 20 is not a twin of clamp+HOL.

---

## Dest vs 19

| bit | 19 dest | 20 dest |
|---|---|---|
| leftover-5 `lvl<=3 → 5` | on | **on** |
| 5W clamp+HOL | on (dirty) | **on** — now filmable |
| cheap-miner | **WORK&lt;4** (replaced 5W while 2W lived) | **WORK&lt;2** (fix) |
| no-RCL2-roads | on | **on** |
| RCL3 haul-pave (`paveNow`) | dest cargo | **gone** (`ROAD && rcl < 4`) |
| far-ctrl RCL2 depot | dest cargo (`level===2` / slam-5+Cheby&gt;10) | **gone** (`level !== 3`) |
| RCL1+RCL2+RCL3 miner-first | dest cargo | **still cargo** |
| L4 take+strip until `storage.my` | dest cargo | **still cargo** |
| sticky / overlap / latch | gone | gone |
| 6W · no-RCL2-boxes · slam-5 | silent cargo | silent cargo |

---

## What is actually in the pile

| bit | isolated clock | last call |
|---|---|---|
| leftover-5 hold | dirty c5 **24512 7/8** (lie); clean bundled in c8 | **policy KEEP**; clock **thrown out** |
| 5W clamp+HOL | **never** | c16 film: 5W yes, 7/8 DNF; 19 **dirty WORK&lt;4**; **unisolated** |
| cheap-miner WORK&lt;2 | **never** | c16 E18S5 patch; 19 dest **WORK&lt;4** dirtied 5W; 20 is the fix |
| no-RCL2-roads | c17 RCL2-pave **SEND BACK** | **on** (the c17 fix) |
| no-RCL3-roads (c9) | c9 **30728 vs 29856 (+872)** | **on** — 20 does **not** pave at 3 |
| RCL3 haul-pave | **never** | labeled 17/18; 18 **CENSOR 3/8**; 19 cargo; **gone** |
| far-ctrl depot RCL2 slam-5 Cheby&gt;10 | **never** | `_next-far-depot`; 19 cargo; **gone** |
| RCL1+RCL2+RCL3 miner-first | **never** | empire; **dest cargo** on 19 and 20 |
| L4 take+strip until `storage.my` | **never** | after-clock (Δ0 on spawn→4); **dest cargo** |
| sticky pickup | **never** | after-15 #3; c12 haul-2 died **+2460**; **reverted** |
| overlap-replace 4W (roster D) | **never** | after-15 #2; model −200…−800; **reverted** |
| `lastSpawn=0` latch | c15 **32092 vs 28657 (+3435)** | **SEND BACK**; gone |
| 6W after 550 | dirty c4; never re-A/B clean | **shape KEEP**; silent cargo |
| no RCL2 source boxes | c10 **30002 vs 28404 (+1598)** | KEEP RCL3, **lost RCL4**; silent cargo |

Silent cargo vs `e839fc8` the label does not name: slam-5,
interleave-10, `getBody` off cap, builders `[W,2C,2M]`, drop RCL3
maintainer, remotes at 4, legacy depot (RCL3 only), hub+bin still
slamming at RCL2, leftover-5, 6W, no-boxes, 5W, cheap-miner,
miner-first, L4 strip.

---

## What the number **can** teach vs `e839fc8`

1. **Pile vs August 1, this world.** 8/8 spawn→RCL4, same rooms,
   `--swap`, clean scrub. Campaign-health, not a knob verdict.
   c8 **yes (−599)**. c9 / c10 / c15 **no**. c16 **7/8 DNF**. c17
   **1/8 CENSOR**. c18 **3/8 CENSOR**. c19 **5/8 CENSOR**. 20 is
   “did dropping pave + far-ctrl + the WORK&lt;4 dirt, with leftover-5
   + miner-first still in dest, buy a finish,” still as a *sum*.

2. **This seed’s control clock vs prior `e839fc8` clocks.** Same
   binary, wandering means (c8 **29628**, c17 **29919**, c18
   **29694**, c19 **31044**). A fat cand Δ can be control weather.
   `_clean-world.md`: leftover benefit at RCL4 is **0–1.2k** and
   per-room is loud.

3. **Film, not the mean.** Process only. Do not attribute ticks.
   - leftover-5: L3 **5 ext / cap 550**. L4 take until `storage.my`
     is **cargo** (19 left several rooms at ext=5).
   - real 5W: hatch `WORK=5`; `clamped EnergyMiner from 550 to 450`
     dead; HOL does not strip `[5W,M]`.
   - cheap-miner **WORK&lt;2**: if home `WORK<2` and `available < 550`,
     head becomes `[2W,M]`/`[W,M]`. A live **2W must not** be
     replaced (19 dirtied E16S9 / E12S3 / E13S7 this way).
   - **0 roads / 0 road sites at RCL2 and RCL3.** E16S9-class 62-road
     slam must not recur. 19’s L3 pave sites must not.
   - far-depot **absent**: Cheby&gt;10 rooms must **not** site a ctrl
     depot at RCL2. E13S7 / E18S9 stay off. Fail if a source seat
     appears at RCL2. RCL3 miss-guard still sites.
   - miner-first **cargo**: RCL1 skip CA/UG until a live miner;
     RCL2+RCL3 skip until `homeMinerWork >= 2`.
   - L4 strip **cargo**: after the clock. Take holds 5 until
     `storage.my`. Spawn→RCL4 Δ **0**.
   - sticky / overlap **absent**: no `stickySrc`; no parked 4W
     roster D.

4. **Pair split.** Far rooms (E12S3 / E5S3 / E18S9 / E18S5 / E11S6)
   own the mean. Easy E13S7 first ~23–25k teaches nothing. Another
   5/8 is **not 8/8** — do not call, do not “almost.”

5. **Hygiene.** 0 leftover planner boxes, 0 spawn-tile roads, 0
   stale `planV2` / `rclTimes.8`, 16/16 seeded. If that fails, the
   number teaches the same lie as **24512**.

---

## What it **cannot** teach vs `e839fc8`

**Any named KEEP / SEND BACK. Least of all 5W.** One Δ, leftover-5
+ miner-first still in dest, plus post-freeze silent cargo. You
cannot pull clamp+HOL out of the mean if leftover-5 or miner-first
moved.

**Isolated leftover-5, miner-first, cheap-miner, or no-RCL2-roads.**
Control is not a twin of any of them. Cheap-miner and miner-first
show on film (blackout / E11S6-class stall did / did not recur;
2W not replaced). Their model is “do not DNF,” not a tick Δ.

**Isolated no-roads / no-boxes.** Already isolated. They **lost
RCL4**. A 20 win does not revive them as speed KEEPs.

**24512.** Dirty leftover planner depots + 7/8 drop E5S3. Retired.

**c16 26849 / c17 27338 / c18 31683 / c19 34358 as a 5W effect.**
7/8, 1/8, 3/8, 5/8. Censor. Illegal.

**29029 as a 5W effect.** Cycle-8 is leftover-5+6W+depot, clean.
20 adds no-boxes, 5W, cheap-miner, no RCL2/3 roads, miner-first,
L4 strip, no latch, no sticky, no overlap, no pave, no far-ctrl
RCL2. Δ vs **29029** is *cargo after c8*, not 5W.

**c19 34358 vs this seed.** Different dest (WORK&lt;4, pave on,
far-ctrl on) **and** 5/8. Not a 5W A/B. Not a pave A/B.

**PlanV2 / claim / 1-source / swamp / unswapped.** Race is
`planPackMiss`, 2-source, 0–12% swamp, `--swap` only.

**RCL8.** Clock stops at 4. Delay-then-build can still be legal on
film (leftover-5 dumps at 4, now after `storage.my`). Skip-forever
cannot.

**Re-baseline.** A pile win is not a new control. `push-race`
stays dead.

**7/8, 5/8, 3/8, 1/8.** Different censoring → means not comparable.

---

## If you insist on reading the mean

Honest comparisons, none of them a knob:

| vs | what the Δ actually is |
|---|---|
| **this seed’s `e839fc8`** | HEAD dest pile vs Aug 1, this world |
| **c8 29029** | everything after leftover-5+6W+depot |
| **c10 30002** | 5W+heal+miner-first+L4 strip on the no-boxes clock |
| **c15 32092** | latch off + 5W on + dest cargo (not 5W) |
| **c16 26849 7/8** | nothing. censor. |
| **c17 27338 1/8** | nothing. censor. |
| **c18 31683 3/8** | nothing. censor. |
| **c19 34358 5/8** | nothing. censor. |
| **24512** | nothing. dirt. |

Call bar: RCL4 **8/8**. Report vs this control **and** vs **29029**.
Ignore gaps under ~200 (poll). **Do not KEEP 5W off this pile.**
Do not KEEP a knob. Do not SEND BACK a knob. Film the process
checks — especially 5W hatch + WORK&lt;2 not replacing 2W.

Clean cand RCL4 still lives in **29–32k** when the bot is honest
(c8 29029, c9 30728, c10 30002, c11 29819, c12 32303, c15 32092).
c16 / c17 / c18 / c19 are censors — do not park next to them. If
20 lands 29–32k **8/8**, you learned the dest pile did not explode
and 5W *hatched*. You did **not** learn 5W alone.

---

## What 20 already spent

Hygiene after 16: revert sticky + overlap, seed one 5W knob. 16
no-KEEP / 7/8 DNF. 17 left sticky and overlap in, added pave,
paved at RCL2, **CENSOR 1/8**. 18 killed RCL2 roads, kept the pile,
**CENSOR 3/8**. 19 dropped sticky + overlap and still seeded dest
with pave + far-depot + miner-first + L4 strip + WORK&lt;4 —
**CENSOR 5/8**. 20 dropped pave + far-ctrl + WORK&lt;4→WORK&lt;2
and still seeded leftover-5 + miner-first + L4 strip. That is why
this note exists instead of a 5W KEEP watch.

Sister: `_cycle19-stack.md`, `_cycle19-final.md`, `_next-after-19.md`,
`_cycle16-hygiene.md`, `_next-far-depot.md`, `_next-rcl3-pave.md`,
`_next-rcl4-release.md`, `_clean-world.md`,
`gauntlet/_critic-keep-stack.md`, `_SPEEDRUN-STATE.txt`.
