# Next A/B — RCL2 sink after slam-5

Read-only note. No spawn/build edit. Do not touch the in-flight race.
Do **not** bundle any of these with extension policy (`maxSitesFor`,
`RCL2_ORDER`, leftover-5 hold, roads). Slam-5 is closed. These knobs
are roster/body only.

Metric: mean ticks spawn→RCL4. Model deltas below, not race numbers.
One knob per race. Ranked leftover after slam-5 (`_rcl2-ideas.md`,
`_SURFACE.md`).

---

## Live at 550 — old 200e keep working until death

Yes. Crossing cap 550 does **not** retire, rewrite, or recycle living
upgraders. Only **newly queued** bodies change.

`shuttleUpgraderBody` (`rooms.spawning.ts:3377–3381`):

- cap `< 550` → `getBody([W,C,M])` = **200e** (one 200 segment from 300
  through 500; 85% budget never buys a second)
- cap `≥ 550` → **`[2W,2C,2M]` 450e**

`spawnrules[2].upgrade_creep` is that body, `amount: 4` (`:799–808`).
The object is rebuilt each producer pass, so the *recipe* flips the tick
the fifth extension stands. The *roster* does not.

Census (`:556–559`) counts in-room `memory.role == "upgrader"` only.
No body check. `spawn_list` is not counted. Gate
`upgraders < amount + pressure.burn` (`:1313`) therefore stays **closed**
while four 200e are alive. Next 450e hatches only when one dies (or
`pressure.burn` rises). Producer pushes **one** upgrader per
`add_creeps_to_spawn_list` pass.

`clampSpawnListToCapacity` shrinks oversize heads. It does **not**
upgrade a 200e already sitting in `spawn_list`.

Upgrader recycle (`upgrader.ts:328–333`) is **not** a cap upgrade:

```
if(!controllerLink && ticksToLive <= 50 && !upgrading) suicide = true
→ recycle()
```

No depot at RCL2 (`controllerDepot` needs a range-4 non-source
container). So a 200e walks to spawn only in its last 50 empty ticks.
Otherwise it shuttles until `ticksToLive` hits 0. Leftover TTL when
slam-5 lands is **~400–1500** (RCL1 carry-in dies mid-slam; replacement
wave spawned ~T_rcl2+1500 is still 200e if cap was <550; slam itself is
~2.5k ticks of 15k ext at two `[W,2C,2M]`).

Delivered e/t, L≈13 plains, no depot:

| body | tank | cycle | e/t | roster 4 |
| --- | ---: | ---: | ---: | ---: |
| `[W,C,M]` 200 | 50 | ~101 | **0.50** | **2.0** |
| `[2W,2C,2M]` 450 | 100 | ~101 | **0.99** | **4.0** |

After slam the clock is upgrade-bound at **2.0** until those 200e die.
45k − ~15k ext = leftover **~30k**. 30k/2.0 = 15.0k ticks vs 30k/4.0 =
7.5k. TTL leftover clips the gap: 4×(0.50)×TTL wasted vs waiting for
natural death.

`pressure.burn` (`:3588`): 0 while floor `< 3000`, else
`min(4, max(1, floor(onFloor/3500)))`. Can queue extra 450e *on top of*
the four 200e if the pile is already big. It does not replace them.

Miners are a separate stamp. Cap 301–549 uses `getBody([2W,M])` still
**250e** and `lastSpawn = T + rand(−20,20) − 450` (`:4183–4186`) → next
queue at **~T+1050** while the 2W still has ~450 TTL. The 550 rung
(`[5W,M]`, `lastSpawn = T`, `:4166–4180`) only fires when
`Game.time - lastSpawn > 1500`. A 2W queued on the >300 path during
slam keeps its stamp; after 550 the room can sit on 2W for another
**~400–1050** ticks. 5W does not raise a 4-shuttle sink.

RCL3 (`:844–852`, `:1342`): `amount: 4` **before the depot exists**.
Body is still `shuttleUpgraderBody` until `hasControllerDepot` (standing
container, not the site), then `parkedUpgraderBody` = `[4W,C,M]` 500e
at 550. Four 450e shuttles + two 300e builders + miner/carrier unshifts
are the spawn-queue HOL the adversary flagged.

---

## One-knob A/Bs

Race these in this order. Do not combine. Do not touch ext siting.

### A — Recycle `[W,C,M]` the tick cap hits 550 (keep `amount: 4`)

**Control:** live. 200e work until death.

**Candidate (one knob):** the tick `energyCapacityAvailable >= 550`,
every living upgrader whose body is the 200e shuttle (`[W,C,M]` / 1
WORK / cost 200) sets `memory.suicide` and `recycle()`s. Queue
`[2W,2C,2M]`. **Leave `spawnrules[2].upgrade_creep.amount` at 4.**
Do not raise amount. Do not recycle 450e. Do not force 5W. Do not
change RCL3 amount.

**Must ship with the knob, else it is a no-op:**

1. Census skips `memory.suicide` (or `role` still `upgrader` walkers
   hold `amount: 4` for the whole ctrl→spawn walk, ~`ctrlSteps`).
2. Rewrite any `spawn_list` Upgrader whose body is still 200e to
   `shuttleUpgraderBody`. Clamp will not do this.

Producer still adds **one** per pass. After census drops, replacements
serialize: ~27 spawn ticks + fill, ×4. Refund
`floor(200 * TTL / 1500)` (TTL 400 → ~53e; TTL 1500 → 200e). Suicide
in-place is a different knob (lose refund, free the slot now) — do not
swap mid-race.

**Cost:** 4×450 = 1800e + ~108 spawn ticks, vs 4×200 already paid.
Miners still `unshift` first; 5W / haulers can HOL the first 450e.
Two builders may still be on the post-slam 5k source box — that is
spawn-energy competition, not an ext-policy change.

**Model**

| clock | delta | why |
| --- | --- | --- |
| spawn→RCL2 | ~0 | 550 is after RCL2 |
| **RCL2→RCL3** | **−2k to −6k** | 4.0 vs 2.0 on leftover 30k is −7.5k; TTL 400–1500 clips it; 1800e tax + serial hatch clips the top |
| RCL3→RCL4 | **−0 to −400** | enter 3 already on 4.0 shuttles; same parked 4W once depot stands |

If leftover TTL is <~200, skip — walk+spawn tax eats the gain.

---

### B — RCL2 `amount` 4 vs 6 after 550 only

**Control:** `amount: 4` always (`:803`).

**Candidate:** `spawnrules[2].upgrade_creep.amount =
  energyCapacityAvailable >= 550 ? 6 : 4`. Bodies stay
`shuttleUpgraderBody`. Do **not** raise during slam (six 200e steal
from the two builders and delay 550). Do **not** change
`spawnrules[3]`. Do **not** recycle 200e in this race.

`pressure.burn` already +0–4 when floor ≥3000. After slam+5W, income
20 minus sink 4.0 piles ~16 e/t → burn+1 in ~200 ticks. Measure
whether 6 is just “burn, always.”

**Cost:** +900e + ~54 spawn vs control. Two extra 0.99 shuttles into
RCL3 until they die; RCL3 will not replace them (`amount` 4).

**Model**

| clock | delta | why |
| --- | --- | --- |
| spawn→RCL2 | ~0 | gate is 550 |
| **RCL2→RCL3** | **−1.5k to −2.5k** | 6×0.99=5.9 vs 4.0; 30k/5.9=5.1k vs 7.5k. Smaller if burn already added 2 |
| RCL3→RCL4 | **−50 to −200** | extra two live out their TTL at 0.99, then park 4×4W same as control |

Do not run B on top of A in the same race. A then B is a later
stack if A wins and the leftover 30k is still fat.

---

### C — Hold RCL3 at 2 shuttles until the depot stands

**Control:** RCL3 `amount: 4` from tick 0 of the level (`:846`),
shuttle until `hasControllerDepot` (`:850–852`). Builders already
prefer the depot site (`builder.ts:53–70`). `earlyBuildSlots` = 2.

**Candidate:** `spawnrules[3].upgrade_creep.amount =
  hasControllerDepot(room) ? 4 : 2`. Body function unchanged (shuttle
then parked 4W). Do **not** recycle the extra two if four already
exist — that is knob A’s job, and killing working shuttles here mixes
knobs. Do **not** dump leftover ext to “make room.”

What this actually changes:

- If four already live (normal after RCL2): **no new 450e**. Delta ≈ 0
  until one dies. Replacement then stops at 2 until the container
  exists.
- If short at RCL3 open (200e died on the boundary, recycle walk,
  slam never filled 4): control queues 450e up to 4 **behind**
  builders (`push`) but **behind miner/carrier `unshift`**. Energy
  HOL is the 1800e fill, not the list order. Candidate queues 2×450
  = 900e, depot builder gets the other 900e sooner.
- `pressure.burn` still adds on top of the new amount. Leave it;
  changing burn is a fourth race.

After depot: parked `[4W,C,M]` ×4 = 16 e/t. Pre-depot shuttle 2×0.99
vs 4×0.99 for the depot window (~5k / ~4 e/t builders ≈ 1.2k ticks).

**Model**

| clock | delta | why |
| --- | --- | --- |
| spawn→RCL2 | 0 | RCL3 only |
| RCL2→RCL3 | 0 | |
| **RCL3→RCL4** | **−300 to +200** | sign = whether 450e are *queued* at open. Live 4 already: ~0 to −100 (replacements). Short roster: depot ~100–300t earlier, park 16 vs shuttle 4; lost 2 e/t × ~1.2k depot ≈ 2.4k e, vs 12 e/t × HOL-saved. Wash to slight win if HOL was real |

If A already ran, four 450e are alive at RCL3 open and C is nearly
inert. Race C on the **post-slam-5 baseline**, not on A, or you
measure nothing.

Adversary “Might HURT” (`_cycle0-adversary-spawn.md`) is this queue,
not the parked 4W after the depot.

---

### D — Force `[5W,M]` replace at 550 (smaller; after A/B/C)

**Control:** 2W `lastSpawn` ~T−450 → next miner ~T+1050 (`:4183–4186`).
550 rung waits on that stamp (`:4095`, `:4166–4180`).

**Candidate:** the tick cap ≥550, if that source’s living miner is
still 2W, set `values.lastSpawn = 0` so this pass queues `[5W,M]`.
Do **not** recycle upgraders. Do **not** change amounts.

Overlap is the same shape as the live 2W path (~450 TTL leftover):
2W+5W on one tile, source still 10 e/t, 250e body wasted until it
dies. Do not suicide the 2W in this knob (that is a second change).

**Model:** RCL2→RCL3 **−100 to −400** (fills the source box / feeds
burn; does not raise 4-shuttle sink). RCL3→RCL4 **−50 to −200**
(20 e/t at RCL3 open vs leftover 2W). Pays more only if B won.

---

## What not to bundle

- Leftover-5 / hold-to-RCL4 / instant-10 / RCL3 roads — `_ext-policy.md`,
  `_rcl3-ext-rank.md`. Closed for this stack.
- Shuttle gate at 450 / 3 ext. Different idea; later if A+B saturate.
- Stay `[W,C,M]` at 550. Dead unless `amount` doubles (`_rcl2-ideas` §4).
- RCL3 `amount` 4 vs 6 after depot. That is the parked-4W climb, not
  the 550 shuttle problem.
- Builder roster, container tile, RCL1 2-source HOL — other surface
  rows.

## Order

1. **A** (recycle 200e @ 550). Biggest model gap on the 45k.
2. **B** (amount 6 after 550) on the winner of A vs control.
3. **C** (RCL3 hold 2 until depot) on the slam-5 baseline, not stacked
   on A unless A shipped and C still looks fat in the film.
4. **D** (5W lastSpawn) last.

In-flight `run-2026-08-14T01-06-48Z` is the slam-5 baseline. Next
race starts at A.
