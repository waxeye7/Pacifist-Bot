# Next A/B — RCL3 roster after 6W (do we park 6×4W?)

Read-only. No `src` edit. Cycle-4 KEEP left `spawnrules[2].amount = 6`
after cap 550. RCL3 is still `amount: 4` parked 4W once the depot
stands. Census is head-count, not body. This note is the seam.

Metric: mean ticks spawn→RCL4. Model deltas, not race numbers. One
knob. Do not bundle leftover-5, roads, haul, or 5W lastSpawn.

---

## Verdict

**Neither 6×4W nor “6 shuttles until death, then 4×4W.”**

Living `[2W,2C,2M]` keep that body. They may **park as 2W** (2 e/t)
when the depot is stocked. They never become `[4W,C,M]`.

`amount: 4` does **not** kill extras and does **not** hatch 4W while
`upgraders ≥ 4`. Deaths drain **6 → 5 → 4 shuttles**. The first parked
4W queues only on the death that takes the count to **3**.

So: stay at 6 shuttles, shrink to 4 shuttles, *then* trickle 4W.
**Not** 6×4W. **Not** a clean cutover at last TTL.

**Do not suicide extras-only when the depot stands.** That is 12 e/t →
8 e/t and still no 4W. Cycle-7 already sent back recycle-walk.

---

## Live rungs

`rooms.spawning.ts`, rebuilt every producer pass.

| | amount | body |
| --- | ---: | --- |
| RCL2 cap `< 550` | **4** | `shuttleUpgraderBody` → `getBody([W,C,M])` = **200e** |
| RCL2 cap `≥ 550` | **6** (`:866`) | `[2W,2C,2M]` **450e** (`:3361–3365`) |
| RCL3, no depot | **4** (`:909`) | same shuttle |
| RCL3, depot up | **4** | `parkedUpgraderBody` → `[4W,C,M]` **500e** at 550 (`:3368–3374`) |

`hasControllerDepot` (`:3380–3398`): standing container, range ≤4 of
the controller, not a source box, not bin/storage. **Site does not
count.** Same test as `upgrader.ts` `controllerDepot`.

RCL3 `amount` does **not** read the depot. Only the *recipe* flips.
`recycleTinyCarriers` (`:449–462`) is carriers only. There is no
`recycleTinyShuttles` (cycle-7 revert).

---

## Census

```
case "upgrader":
    if(isInRoom(creep, room) && !creep.memory.suicide) upgraders++;
```

`:613–616`. In-room (`:3120` = `creep.room.name == room.name`). No
WORK check. No cost check. `spawn_list` is not counted. Hatching
creeps in the spawn **are** in-room, so they count.

Gate (`:1420`, same shape at RCL2 `:1391`):

```
upgraders < spawnrules[3].upgrade_creep.amount + pressure.burn
```

One `push` per `add_creeps_to_spawn_list` pass. Body is whatever the
rule says **this** tick. Already-queued entries keep the body they
were pushed with.

`pressure.burn` (`:3575`): 0 while floor `< 3000`, else
`min(4, max(1, floor(onFloor/3500)))`. With 6 live, a new 4W only
if `6 < 4+burn` → **burn ≥ 3** (floor ≥ 10500). Fed depot usually
keeps burn at 0. Storage-full `amount+6` (`:1425`) is dead at RCL3
(no storage).

---

## What the six actually do

Role code does not care about spawnrules. `upgrader.ts:235–271`:
stocked depot → `depotPark` (adj to depot **and** upgrade range ≤3).
No free tile → `null` → old shuttle (`:100–101`). Dry depot →
`acquireEnergyWithContainersAndOrDroppedEnergy` (source piles).

| living body | dry / shuttle | stocked park |
| --- | ---: | ---: |
| `[2W,2C,2M]` | ~0.99 e/t | **2** e/t |
| `[4W,C,M]` | ~0.5 (fat, 50 tank) | **4** e/t |

Six live 2W, depot up, tiles enough: **12 e/t**. Designed 4×4W:
**16 e/t**. Six 4W: **24 e/t** on 20 e/t income — over-roster.

Park tiles are not guaranteed 8. Depot at range 3 of the controller
throws out neighbours at range 4. Overflow 2W keep shuttling
(~1 e/t). Typical mix **4 parked 2W + 2 shuttle 2W ≈ 10 e/t**.

End-of-life recycle (`upgrader.ts:341–347`) is **only**
`!controllerLink && TTL ≤ 50 && empty`. Once the depot exists that
path is dead. They work until TTL 0.

---

## Timeline (normal after cycle-4)

1. RCL2 after slam: hatch up to 6×450e. Gate closed at 6.
2. Tick of RCL3: same 6 live. `amount` 4. `6 < 4` false. **No
   spawn, no kill, no rewrite.**
3. Depot site (5k) → builders. Shuttles still ~6 e/t.
4. Container stands: `hasControllerDepot` true. *New* queue would
   be 500e 4W. Census still 6. Gate still closed.
5. Six 2W park (or overflow-shuttle). Sink **10–12 e/t**, not 16.
6. Death: 5, then 4. Still `≥ 4`. Still no 4W.
7. Next death: 3. Now `3 < 4`. One `[4W,C,M]` pushes. Serial after
   that until 4 live, mix 2W+4W while the last shuttles finish.

If the six hatched as a wave, TTLs cluster → brief hole, then four
4W. If staggered, a long **4×2W = 8 e/t** stretch after the two
extras die and before those four die. That is the cap’s real cost
on the 135k.

---

## Is `amount: 4` inert?

| moment | inert? |
| --- | --- |
| RCL2→3 tick, 6 already live | **Yes.** No spawn, no cull. Same as SURFACE #4 (hold-2-until-depot) on 6W. |
| Depot stands | **Yes for hatch.** Recipe flips; nobody new is queued. |
| After first two deaths | **No.** Refuses to replace. Roster is 4×2W, not 4×4W. |
| After count hits 3 | **No.** This is what finally starts the parked 4W. |
| If someone sets RCL3 `amount: 6` “to match 6W” | After the shuttles die you **do** park **6×4W**. That is the over-roster. Live code does not do this. |

“Don’t spawn more than 4 at RCL3” is a **replacement valve**, not a
transition cull. It is why we never park 6×4W, and also why we are
late to 4×4W.

SURFACE #4 (amount 2 until depot) is a *different* knob and is
inert on this baseline for the same census reason.

---

## Suicide extras when the depot stands?

**No — extras-only.**

Census skip on `memory.suicide` (`:614`) would drop 6→4 the same
tick. Remaining four are still 2W. Gate `4 < 4` false. Sink
**12 → 8** (or 10 → 8 if the extras were the overflow shuttles).
Zero 4W unlocked.

`recycle()` (`creepFunctions.ts:2080+`) walks to bin/spawn. That is
cycle-7: they leave the controller, refund
`floor(cost × TTL / 1500)`, RCL3 **+1466**. SEND BACK.

`creep.suicide()` in place: no walk, no refund, same sink cut.
“Recycle-like, just lost” is cheaper than the walk and still the
wrong set of creeps.

Killing extras only pays if a *second* knob also replaces the
remaining 2W with 4W. Do not ship the cull alone.

---

## One-knob A/Bs

Race these after leftover-5 / 6W, not on an in-flight seed. Do not
combine.

### A — Do nothing (control)

Live. 6×2W park at 10–12 e/t, drain to 4×2W, then 4W trickle.
Cycle-4 already paid for the extra two shuttles on the early 135k
(and on leftover RCL2). This is the measured KEEP.

### B — Suicide extras-only at depot (just lost)

**Do not race first.** Model **+100 to +800** (8 vs 12 for leftover
TTL of the two). Same 4×2W tail. Only useful stacked on C/D.

### C — In-place suicide **all** living 2W the tick depot stands, hatch 4×4W

Census skip suicide. Rewrite any shuttle still in `spawn_list` to
`parkedUpgraderBody`. `creep.suicide()`, not `recycle()`. Leave
`amount: 4`.

Cost: lose leftover 450e ×6 (TTL 500 → 900e sunk; TTL 1200 →
2160e). Hole while 4×500e hatch serial (~18 ticks + fill each).
Gain: 16 vs 12 after the hole.

**Model RCL3→4: −400 to +800.** Sign is leftover TTL. If the six
are already old at depot-complete, natural death is close and C
is a hole for free. Skip if mean remaining TTL `< ~300`.

This is cycle-7’s shape on 450e bodies with the walk removed.
Still a hole. Film the first 200 ticks after depot.

### D — Overlap replace (keep 2W working)

Depot up and `parkedCount < 4` → queue one 4W **even if** total
heads are 6. After a 4W hatches, `suicide()` the oldest 2W (or
the one with no park tile). Cap overlap at 7. Leave `amount: 4`
as the parked target.

Cost: one extra 500e + 18 ticks, four times, while the 2W still
deliver 2 e/t. No hole. Temporary 7 heads on the depot tiles.

**Model RCL3→4: −200 to −800** if depot is fed (climb 12→16
without a gap). **+0 to +400** if the extra 500e HOL starves
`depotSink` (`carry.ts` 550 floor) and the new 4W shuttles.

Do not raise `amount` to 6 in this race.

### E — RCL3 `amount: 6` after depot (the 6×4W trap)

**Do not.** After the shuttles die you park 6×4W = 24 e/t on 20
income. Floor pile + burn then adds more. This is the failure
mode the live `amount: 4` exists to prevent.

---

## What not to bundle

- Recycle-walk (`recycle()` / cycle-7). Dead.
- Hold RCL3 at 2 until depot (SURFACE #4). Inert on 6W.
- RCL3 `amount` 4 vs 6 as a *pre-depot* shuttle cap. That was
  `_next-rcl2-sink` C on a 4-shuttle baseline.
- Leftover-5, RCL3 roads, 5W lastSpawn, haul-2.
- Counting `spawn_list` as upgraders. Separate census bug, not
  this roster.

## Order

1. Film one finishing room on the current KEEP: heads, WORK,
   depot tick, e/t. Confirm 6→4 shuttles before the first 4W.
2. **D** (overlap replace) if that film shows a long 8–12 e/t
   tail after depot.
3. **C** only if D’s HOL is real and leftover TTL is fat.
4. Never B alone. Never E.

In-flight races stay on A.
