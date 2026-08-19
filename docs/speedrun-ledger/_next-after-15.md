# Next five one-knobs — after cycle-15 (5W latch)

Read-only rec. **No src. No `push-race`. No mid-race push.** Cycle-15
(`run-2026-08-15T23-57-10Z`, `fiveWQueued`) is still watching — latch
held (2 miners/room, no 10+ flood) but the extra body is **4W**. Do not
keep/revert until RCL4 8/8.

Metric: mean ticks spawn→RCL4. One knob per race. **Leftover-5 24512
still the mark** (cycle-5, 7/8). `_clean-world.md` says the honest
*clean-seed* leftover-5+6W clock is cycle-8 **29029 8/8** (dirt + 7/8
censor built 24512); that is a comparison, not a new mark.

Did **not** rewrite `_SURFACE.md`: its table is “after cycle-4” plus
KEEP/SEND BACK history; 15 is not called. `_late-rooms.md` was not on
disk.

---

## Race order (for the mean)

| # | knob | vs live after 15 | model Δ | spec |
|---|---|---|---|---|
| **1** | **5W clamp skip** | latch extra is 4W (`floor(550×0.85)=467`) | **−150…−600** | `_next-5w-clamp.md` |
| **2** | **RCL3 overlap-replace 4W** (roster D) | 6×2W park 10–12, drain to 4×2W=8, then trickle 4W | **−200…−800** (tail can stretch **−1k**) | `_next-rcl3-roster.md` D |
| **3** | **Source-sticky pickup** | `sourceId` spawn-only; closest-select stacks near | hard/far mean; cycle-12 was **+2460** the other way | `_next-sticky-pickup.md` |
| **4** | **Adopt 16-room v2 pack** (candidate segments only) | `planPackMiss` → first-box / plan tiles inert | tile quality + unlocks #5; **not** a 24512 replay | `_next-adopt-plans.md` |
| **5** | **First box = min chebyshev/`si`** | object-order `[0]` far-first on 6/16 | **−200…−800** on those; ~0 else | `_next-boxes.md` #1 |

If 15 SEND BACK, drop #1 and start at #2. Hygiene (`_clean-world.md` /
`_NEXT-RACE.md` §0) is a **gate**, not a knob.

---

## 1 — Stop clamp from turning `[5W,M]` into 4W

Cycle-15’s hypothesis is “one extra 5W at 550.” The latch stopped the
flood; `clampSpawnListToCapacity` still shrinks the hardcoded 550 body
to `[4W,M]` (budget 467), and HOL `-6` after 40t drops WORK again
(`length*100=600` at cap 550). After the leftover 2W dies the source
sits at **8 e/t** for ~1500t — slam-5 paid 15k for a 10 e/t rung the
clamp gives back. One knob: skip the 85% shrink for a home `[5W,M]`
that already fits cap (clone the Upgrader 550 exemption) **and** skip
the HOL shrink when `bodyCost <= energyCapacityAvailable`. Do not
touch `getBody`, the 550 producer, or `fiveWQueued`. Dirty tree already
has the clamp skip; it is not in the live 15 race. Model vs latch-4W:
RCL2→3 **−100…−400**, RCL3→4 **−50…−200**. Race **latch vs latch+skip**,
not vs cycle-13 flood. Do this first if 15 KEEP so later income knobs
are measured at 10 e/t, not 8.

## 2 — Overlap-replace parked 4W (do not park 6×4W)

Cycle-4 KEEP left six `[2W,2C,2M]` after 550. RCL3 `amount: 4` does not
cull them and does not hatch 4W until census hits 3, so the 135k runs
**10–12 e/t** (six 2W, some overflow-shuttle) then **8 e/t** (4×2W)
before the designed **16 e/t** (4×4W). Roster D: when the depot
*stands* and `parkedCount < 4`, queue one `[4W,C,M]` even if heads are
6; after it hatches, `suicide()` the oldest 2W (or the one with no park
tile); cap overlap at 7; leave `amount: 4`. Keep the 2W working — no
hole. Do **not** extras-only suicide (sink 12→8, still no 4W). Do
**not** recycle-walk (cycle-7 +1466). Do **not** `amount: 6` (6×4W =
24 on 20 income). Roster C (nuke all 2W the depot tick) is later and
sign-flips if leftover TTL is thin. Model **−200…−800** if `depotSink`
still holds 550; **+0…+400** if the extra 500e starves the park. Film
heads/WORK/e/t for 200t after depot on a 15-finisher before seeding.

## 3 — Source-sticky pickup (not another count cut)

Cycle-12 `MAX_HOME_CARRIERS_PER_SOURCE` 3→2 SEND BACK (RCL4 **32303 vs
29843, +2460**): closest-select put both bodies on the near pile, far
5W decayed, 4W starved. `spawn_carrier` already writes `memory.sourceId`;
`acquireEnergyWithContainersAndOrDroppedEnergy` never reads it. One
knob, one function, three sites, same `atMine` (Chebyshev ≤2 of that
source): adjacent salvage, lock `stillGood`, `hasRoom`. Leave lock TTL,
`pick(false)`, want=3, 1:1, 4C. After 15+clamp the far pile is 10 e/t;
sticky is how the 2nd/3rd body becomes a shuttle instead of a spawn
tax. Re-open haul-2 only after a sticky KEEP **and** film shows both
piles served on L≥12. Kill `pick(false)` is the measurement *after*
this, not this diff. Watch RCL1–2 on split rooms (first `energy` key
can be the long tile). E13S7 range-2 overlap is a no-op.

## 4 — Adopt the 16-room v2 pack (candidate only)

Race rooms are `planPackMiss` + BasePlan. `construction()` never enters
`placeFromPlanV2`, so SURFACE #6 / first-box / plan-order containers
are inert; cycle-8’s legacy depot is a miss-guard, not leftover-box
quality (clean E12S3 still ~32.9k). One knob: write the existing
`plans-hub.json` 16 into **candidate** segments 80–86 (`bench: true`),
`autoExpand = false`, then seed. Control segments stay empty.
Leftover-5 and 6W still hold; **no-rcl2-boxes and no-RCL3-roads do
not** on the plan path (`plannedTilesFor` still sites `container[0]`
at 2; `roadsForRcl` still returns arterials at 3). That is accepted
path-switch, not a second construction edit — do **not** also ship
min-chebyshev. This does **not** replay 24512: those ticks were
*unowned leftover objects already standing*; adopt makes the bot
*site and pay* the tiles. Hygiene first (`_clean-world.md`: user-null
scrub, both racers’ `Memory.rooms`, no stale `planV2` / `rclTimes.8`).
Fail the run if any candidate room is still `planPackMiss` after 200t.
Never `--user pacifist-race`. Wait until 15 is called.

## 5 — First source seat = min chebyshev / `si` (after #4)

Planner emit is `objects.filter(source)` order, not hub-near. **6/16**
real far-first (Δ≥5): E9S1 36 vs 4, E13S9 26 vs 8, plus E11S6 / E4S7 /
E18S5 / E16S9. Worst spend: 5k dirt walk to the long source, leave the
hub seat as drop-mine. One knob after the pack is live: among early
source seats, take min chebyshev to `plan.si` (storage tile if `si`
missing). Keep prefix of **one**. Not two boxes at RCL2. Not “hold 2nd
box off the 135k” (cycle-11 SEND BACK, +1301). Model **−200…−800** on
those six, ~0 else; mean pulled by the hard split rooms. If #4 is
deferred, the BasePlan substitute is **reopen cycle-10** (slam-5 then
one source box): cycle-10 KEEP RCL3 **−482** but RCL4 **+973 vs
cycle-8 / +1598 vs control** — the clock that matters lost ~1k. Do not
run first-box and reopen-c10 in the same race.

---

## Not these (already called, inert, or off-clock)

| | |
|---|---|
| Leftover-5 hold | KEEP. 24512 still the mark. |
| 6W after 550 | KEEP. |
| RCL1 HOL / recycle 200e / haul-2 / 2nd box @ RCL4 / 5W-once flood | SEND BACK. |
| Hold RCL3 at 2 until depot | Inert on 6W (SURFACE #4). |
| 6×4W / extras-only suicide / recycle-walk | Roster B/E + cycle-7. |
| RCL4 construction cadence | Off spawn→RCL4 (`_next-rcl4-cadence.md`). |
| Claim-bootstrap / colony CB | Live shard (`_next-claim-bootstrap.md`). Not a race. |
| Planner 98/88, remotes, storage floors | Deliberately later. |
| Clean-world scrub | Gate before the next seed. |

Late rooms on 15 (no `_late-rooms.md`): cand **E18S9** slam stall (3 ext
at ~12k elapsed, then L2 p≈19k at ~16k); **E12S3** far (ctrlSteps 20;
clean-world **+8885** RCL4 once leftover depot gone). Film those; do
not invent a sixth knob.

Wait RCL4 8/8 on 15. Then #1 (if KEEP) on a **clean** seed.
