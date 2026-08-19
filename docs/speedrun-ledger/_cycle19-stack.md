# Cycle-19 stack vs `e839fc8` — what the number can teach

Watching `run-2026-08-16T07-40-10Z` `cycle-19-5w-only`. **Label is a
lie.** Not a one-knob race. No `push-race`. No seed. No src. Control
frozen `e839fc8`. Set `1f90aub`, `--swap`. Metric: mean spawn→RCL4,
**8/8**, **clean world**. Mark **29029** / this-ctrl **29694**. Never
24512.

```
KEEP: leftover-5 + 5W clamp+HOL + cheap-miner WORK<4 + no-RCL2-roads
CARGO in dest (src at seed):
  RCL3 haul-pave (paveNow rcl===3)
  far-ctrl depot RCL2 slam-5 Cheby>10
  RCL1+RCL2 miner-first
  L4 take+strip until storage.my
REVERTED vs 18: sticky · overlap
latch gone
```

Four KEEP bits + four dest cargo + post-freeze silent cargo (6W,
no-RCL2-boxes, slam-5, …). Hygiene after 16 said revert sticky +
overlap and seed **`cycle-N-5w-only`**. 19 reverted those two. Dest
at seed still compiled pave + far-depot + miner-first + L4 strip.
Do not read this as 5W-alone.

Cycle-18 FINAL `run-2026-08-16T06-22-16Z`: cand **31683 3/8** vs ctrl
**29694 8/8**. **CENSOR.** RCL3 haul-pave **unisolated**. L2 0-roads
process pass. 19 is “drop sticky/overlap, keep 5W+heal, leave the
rest of dest.” Still a pile.

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim E36N57
NEVER  SSH
NEVER  seed while 19 is watching
```

---

## Verdict

**vs `e839fc8` this seed can only answer: is HEAD dest (5W-labeled,
cargo still in) faster than the August 1 planner bot on this 16-room
clean `--swap` world.**

**It cannot KEEP or SEND BACK 5W.** A win is not “19 KEEP 5W.” A
loss is not “5W failed.” Either way the Δ is unidentified cargo.
Pave, far-depot, miner-first, leftover-5, cheap-miner, and L4 strip
all sit in dest too.

`e839fc8` still dumps 10 ext, sites the full RCL3 road set, sites
RCL2 boxes, runs 4 shuttles, has no `[5W,M]` skip, no cheap-miner,
no miner-first, no far-ctrl RCL2 depot. 19 is not a twin of
clamp+HOL.

---

## What is actually in the pile

| bit | isolated clock | last call |
|---|---|---|
| leftover-5 hold | dirty c5 **24512 7/8** (lie); clean bundled in c8 | **policy KEEP**; clock **thrown out** |
| 5W clamp+HOL | **never** | c16 film: 5W yes, 7/8 DNF; labeled 19; **unisolated** |
| cheap-miner WORK&lt;4 | **never** | c16 E18S5 patch; 18 dest was `liveMiners===0`; harden **on** dest |
| no-RCL2-roads | c17 RCL2-pave **SEND BACK** | **on** this seed (the c17 fix) |
| RCL3 haul-pave (`paveNow rcl===3`) | **never** | labeled 17/18; 18 **CENSOR 3/8**; **dest cargo** |
| far-ctrl depot RCL2 slam-5 Cheby&gt;10 | **never** | `_next-far-depot`; **dest cargo** |
| RCL1+RCL2 miner-first | **never** | empire; **not** in 18 dest; **dest cargo** on 19 |
| L4 take+strip until `storage.my` | **never** | after-clock (Δ0 on spawn→4); **dest cargo** |
| sticky pickup | **never** | after-15 #3; c12 haul-2 died **+2460**; **reverted** |
| overlap-replace 4W (roster D) | **never** | after-15 #2; model −200…−800; **reverted** |
| `lastSpawn=0` latch | c15 **32092 vs 28657 (+3435)** | **SEND BACK**; gone |
| 6W after 550 | dirty c4; never re-A/B clean | **shape KEEP**; silent cargo |
| no RCL2 source boxes | c10 **30002 vs 28404 (+1598)** | KEEP RCL3, **lost RCL4**; silent cargo |
| no-RCL3-roads (c9) | c9 **30728 vs 29856 (+872)** | **off** — 19 still paves at 3 |

Silent cargo vs `e839fc8` the label does not name: slam-5,
interleave-10, `getBody` off cap, builders `[W,2C,2M]`, drop RCL3
maintainer, remotes at 4, legacy depot, hub+bin still slamming at
RCL2, leftover-5, 6W, no-boxes, 5W, cheap-miner, haul-pave,
far-depot, miner-first, L4 strip.

---

## What the number **can** teach vs `e839fc8`

1. **Pile vs August 1, this world.** 8/8 spawn→RCL4, same rooms,
   `--swap`, clean scrub. Campaign-health, not a knob verdict.
   c8 **yes (−599)**. c9 / c10 / c15 **no**. c16 **7/8 DNF**. c17
   **1/8 CENSOR**. c18 **3/8 CENSOR**. 19 is “did dropping sticky +
   overlap, with dest cargo still left, buy a finish,” still as a
   *sum*.

2. **This seed’s control clock vs prior `e839fc8` clocks.** Same
   binary, wandering means (c8 **29628**, c17 **29919**, c18
   **29694**). A fat cand Δ can be control weather. `_clean-world.md`:
   leftover benefit at RCL4 is **0–1.2k** and per-room is loud.

3. **Film, not the mean.** Process only. Do not attribute ticks.
   - leftover-5: L3 **5 ext / cap 550**. Roads must not dump the
     leftover 5.
   - real 5W: hatch `WORK=5`; `clamped EnergyMiner from 550 to 450`
     dead; HOL does not strip `[5W,M]`.
   - cheap-miner: if home `WORK<4` and `available < 550`, head
     becomes `[2W,M]`/`[W,M]` — leftover 1W is a blackout (18 dest
     missed this).
   - **0 roads / 0 road sites at RCL2.** E16S9-class 62-road slam
     must not recur.
   - haul-pave **cargo**: after RCL3 + slam-5, `paveNow` sites the
     BFS haul line. Max 8 open. Film it. Do not KEEP pave.
   - far-depot **cargo**: after slam-5, Cheby&gt;10 rooms site a ctrl
     depot at RCL2. E13S7 / E18S9 stay off. Fail if a source seat
     appears at RCL2.
   - miner-first **cargo**: RCL1 skip CA/UG until a live miner;
     RCL2 skip until `homeMinerWork >= 2`.
   - L4 strip **cargo**: after the clock. Take holds 5 until
     `storage.my`. Spawn→RCL4 Δ **0**.
   - sticky / overlap **absent**: no `stickySrc`; no parked 4W
     roster D.

4. **Pair split.** Far rooms (E12S3 / E5S3 / E18S9 / E18S5 / E11S6)
   own the mean. Easy E13S7 first ~23–25k teaches nothing. Another
   3/8 is **not 8/8** — do not call, do not “almost.”

5. **Hygiene.** 0 leftover planner boxes, 0 spawn-tile roads, 0
   stale `planV2` / `rclTimes.8`, 16/16 seeded. If that fails, the
   number teaches the same lie as **24512**.

---

## What it **cannot** teach vs `e839fc8`

**Any named KEEP / SEND BACK. Least of all 5W.** One Δ, four KEEP
bits, four dest cargo, plus post-freeze silent cargo. You cannot
pull clamp+HOL out of the mean.

**Isolated leftover-5, cheap-miner, no-RCL2-roads, pave, far-depot,
or miner-first.** Control is not a twin of any of them. Cheap-miner
and miner-first show on film (blackout / E11S6-class stall did /
did not recur). Their model is “do not DNF,” not a tick Δ.

**Isolated no-roads / no-boxes.** Already isolated. They **lost
RCL4**. A 19 win does not revive them as speed KEEPs.

**24512.** Dirty leftover planner depots + 7/8 drop E5S3. Retired.

**c16 26849 / c17 27338 / c18 31683 as a 5W effect.** 7/8, 1/8,
3/8. Censor. Illegal.

**29029 as a 5W effect.** Cycle-8 is leftover-5+6W+depot, clean.
19 adds no-boxes, 5W, cheap-miner, no RCL2 roads, haul-pave,
far-depot, miner-first, L4 strip, no latch, no sticky, no overlap.
Δ vs **29029** is *cargo after c8*, not 5W.

**c18 31683 vs this seed.** Different dest (sticky/overlap on, no
miner-first, cheap-miner `===0`) **and** 3/8. Not a 5W A/B.

**PlanV2 / claim / 1-source / swamp / unswapped.** Race is
`planPackMiss`, 2-source, 0–12% swamp, `--swap` only.

**RCL8.** Clock stops at 4. Delay-then-build can still be legal on
film (leftover-5 dumps at 4, now after `storage.my`). Skip-forever
cannot.

**Re-baseline.** A pile win is not a new control. `push-race`
stays dead.

**7/8, 3/8, 1/8.** Different censoring → means not comparable.

---

## If you insist on reading the mean

Honest comparisons, none of them a knob:

| vs | what the Δ actually is |
|---|---|
| **this seed’s `e839fc8`** | HEAD dest pile vs Aug 1, this world |
| **c8 29029** | everything after leftover-5+6W+depot |
| **c10 30002** | 5W+heal+pave+depot+miner-first on the no-boxes clock |
| **c15 32092** | latch off + 5W on + dest cargo (not 5W) |
| **c16 26849 7/8** | nothing. censor. |
| **c17 27338 1/8** | nothing. censor. |
| **c18 31683 3/8** | nothing. censor. |
| **24512** | nothing. dirt. |

Call bar: RCL4 **8/8**. Report vs this control **and** vs **29029**.
Ignore gaps under ~200 (poll). **Do not KEEP 5W off this pile.**
Do not KEEP a knob. Do not SEND BACK a knob. Film the process
checks.

Clean cand RCL4 still lives in **29–32k** when the bot is honest
(c8 29029, c9 30728, c10 30002, c11 29819, c12 32303, c15 32092).
c16 / c17 / c18 are censors — do not park next to them. If 19
lands 29–32k **8/8**, you learned the dest pile did not explode.
You did not learn why. You did **not** learn 5W.

---

## What 19 already spent

Hygiene after 16: revert sticky + overlap, seed one 5W knob. 16
no-KEEP / 7/8 DNF. 17 left sticky and overlap in, added pave,
paved at RCL2, **CENSOR 1/8**. 18 killed RCL2 roads, kept the pile,
**CENSOR 3/8**. 19 dropped sticky + overlap and still seeded dest
with pave + far-depot + miner-first + L4 strip. That is why this
note exists instead of a 5W watch.

Sister: `_cycle18-stack.md`, `_cycle18-final.md`, `_next-after-18.md`,
`_cycle16-hygiene.md`, `_next-far-depot.md`, `_next-rcl3-pave.md`,
`_next-rcl4-release.md`, `_clean-world.md`,
`gauntlet/_critic-keep-stack.md`, `_SPEEDRUN-STATE.txt`.
