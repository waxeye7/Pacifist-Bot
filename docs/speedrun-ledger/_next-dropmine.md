# Next — drop-mine 4W vs 5W / sticky (leave)

Read-only. **No src. No `push-race`.** Cycle-15 still watching.
`energyMiner.ts` confirmed, leftover-5 era only (RCL&lt;6, cap 550,
home `[5W,M]` / clamp `[4W,M]`).

Metric: mean ticks spawn→RCL4. **Leave.** Not a knob. 4W waste is
the already-queued 5W hatch (`_next-5w-src.md`). Sticky is already
in `src` and is a **different** knob (`_cycle16-hygiene.md` revert
before 16). Do not bundle either into a miner-role change.

---

## Confirm — leftover-5 miner

| | src |
|---|---|
| Body | home cap 550–749, RCL&lt;7: `[5W,M]` (`rooms.spawning.ts` `:4420`). Live 15 clamp → `[4W,M]`. **0 CARRY.** |
| Path | `energyMiner.ts` `:277` — `CARRY==0` (or RCL&lt;6 / remote / no link) takes the harvest-and-drop arm, not the link arm. |
| Harvest | `harvestEnergy()` (`creepFunctions.ts` `:1408`) — `harvest(source)` only. Engine: 0 CARRY drops on the tile. Sit-on-container deposits into the box. |
| 2e/W | Engine `HARVEST_POWER`. `homeSourceHarvest` `:3717–3730` is `min(10, 2*WORK)`. Link-arm `potential` `:352–354` is `WORK*2` (boosted `*6`). Drop-mine does not recompute it. |
| Withdraw | **none.** `energyMiner.ts` has zero `withdraw`. Adjacent box is a **sit** (`:315–330`, range ≤2) or a CARRY **sink** (`adjacentEnergySink`). Leftover-5 home miners never have CARRY, so never transfer, never dump. |

Cycle-10 KEEP: no source/depot boxes at RCL2 (`construction.ts` `:1422`
`level >= 3`). RCL3 sites them. Builder: depot → tower → ext (held) →
leftover containers. So leftover-5 is **floor drop** through slam and
early RCL3; sit-on-box only after a source seat finishes. Still no
withdraw.

`dumpMinerEnergy` (`:188–216`) is CARRY-only. 0 CARRY never enters it.

---

## Waste — 4W vs 5W

Source is `3000/300 = 10` e/t. Unused source energy is **gone** when
`ticksToRegeneration` hits 0.

| hatch | e/t | per 300t cycle | leftover at regen |
|---|---:|---:|---:|
| **4W** (live 15) | 8 | 2400 | **600** (2 e/t) |
| **5W** (src skips) | 10 | 3000 | **0** |

That 2 e/t is **in the source**, not on the floor. Two sources × ~1500t
after the leftover 2W dies ≈ 6k ≈ **375t** on the 135k. Already the
cycle-16 model (`_next-5w-clamp.md`).

Dropped energy decays `ceil(amount / 1000)` / tick (min 1 while any
pile exists). Attended leftover-5 piles stay under a `[4C,4M]` load
(200). Both 4W and 5W then pay the same **1 e/t** floor if a crumb
sits, else **0** if the CA picks the same tick. 5W does **not** decay
more when hauled.

5W decays more **only** if haul fails and the pile crosses 1000
(then 2 e/t). Unattended: 5W hits 1000 in 100t, 4W in 125t. That is
the cycle-12 far-pile picture (closest-select, income ~10 not 20),
not a reason to stay at 4W.

Sit-on-box (RCL3, once the seat stands): harvest goes into the
container. **0 drop decay** for both bodies. 5W fills the 2000 box
faster; overflow is a haul problem, not a miner problem.

Overlap (latch 2W + extra): source still caps at 10. Extra WORK
beyond 5 is idle, not extra drop. 2W+4W wastes 1W; 2W+5W wastes 2W.
After the 2W dies the 4W leaves 2 e/t in the source for the rest of
its life. Overlap tax is spawn already spent.

Haul census already tracks the hatch: `homeSourceHarvest` = live
WORK. RCL1–3 `[4C,4M]`, want `ceil(e/t * (2L+6) * 1.35 / 200)`, cap
3. L≥12 at **10** e/t wants 3; at 8 e/t often 2. Same formula, not a
drop-mine edit.

---

## Sticky (in src) × this miner

`creepFunctions.ts` `:1495`, `:1599–1708`: `STICKY_SOURCE_RANGE = 2`,
`atMine` on adj salvage / lock / `hasRoom`. Carry + live `sourceId`
only. Not in the live 15 compile. Hygiene: **revert before 16** or
16 is two knobs.

| pile | where | `atMine` (≤2 of assigned source) |
|---|---|---|
| 0 CARRY drop | miner tile, `isNearTo(source)` → range **1** | yes |
| sit-on-box | legacy seat is path last-tile, range **1** of source | yes |
| overflow drop next to a full box | still range 1–2 | yes |
| box at 3 of the source | miner `containerNearby` is ≤2 of the **miner** | **no** — sticky spec risk #4. Do not bump to 3. Race path seats are range 1. |

`findContainers` is still room-sticky-fullest. `hasRoom` then drops
the other source’s box; `others` (`:1765–1776`) keeps this source’s.
Drop-mine without a box never hits that scan — `pick` takes the drop.

Complementary, not conflicting. Drop-mine **makes** the pile; sticky
makes the tagged CA walk to **that** pile. Without sticky, 5W far
grows 25% faster and is the worse decay case. That is why later
income knobs measure at **10 e/t**, not 8. Do not change the miner
to “help” sticky. Do not add CARRY: `[5W,C,M]=600` misses leftover-5
cap; a CARRY miner `if/else` dumps **instead of** harvest (`:303–305`)
and cannot drop-mine.

`dumpMinerEnergy` room-global hauler is inert here (0 CARRY).
`pickupIdle` on an empty assigned pile is a sticky measurement, not
a miner fix. `pick(false)` same-source queue stays.

---

## One knob or leave

**Leave.** No `energyMiner` edit.

| candidate | why not |
|---|---|
| Add CARRY / dump-into-box | 600e or lose a WORK. Dump skips harvest. 0 CARRY is the 550 body. |
| Miner `withdraw` from the source box | 0 CARRY store is empty. Nothing to pull into. Sit-on-box already deposits. |
| Sit / range tweak | Seats are range 1. Range-3 is a sticky/box problem, not this. |
| Drop vs 4W “less decay” | Unharvested source is 2 e/t. Decay is haul. Hatch 5W. |
| Bundle sticky into 16 | Hygiene revert. Ranked `_next-after-15.md` **#3**, after 5W. |

The 4W→5W gap is **clamp skip + HOL exempt** (`_next-5w-src.md`),
already in the dirty tree, not in the live 15 compile. Race that
after 15 is called. Then sticky, at 10 e/t.

Do not touch leftover-5, `fiveWQueued`, haul MAX, boxes, `getBody`.
