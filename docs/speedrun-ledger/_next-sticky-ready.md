# Sticky pickup — ready (do not apply)

Read-only apply package. **Src not edited.** Cycle-15 (`run-2026-08-15T23-57-10Z`) is still watching — do not `push-pacifist` / `push-race` / apply mid-race. Not remotes. Not ext. Not `MAX_HOME_CARRIERS_PER_SOURCE` (stays **3**; cycle-12 haul-2 SEND BACK). Metric: mean ticks spawn→RCL4.

Spec: `_next-sticky-pickup.md`. Ranked `_next-haul.md` #2 / `_next-after-15.md` #3.

---

## Verdict

Fenced diff in `_next-sticky-pickup.md` **still matches** `src/Functions/creepFunctions.ts`. No regenerate. `STICKY_SOURCE_RANGE` / `atMine` / `stickySrc` are **absent** from `src/`.

| site | spec | src now |
|---|---|---|
| `PICKUP_LOCK_TTL` | `:1492`, insert `STICKY_SOURCE_RANGE=2` after | **yes** — next line is `_pickupLedger` |
| `acquireEnergy…` | `:1561` | **yes** |
| resolve `stickySrc`/`atMine` | after `const locking` `:1594` | **yes** — next is `unreserved` |
| adj salvage | `:1618–1632`, three `findInRange` filters | **yes** — no `atMine` |
| lock `stillGood` | `:1664–1669` | **yes** — roomName then `worthIt` |
| `hasRoom` | `:1686–1687` | **yes** — `!locking \|\| !strict \|\| unreserved` |
| want | `MAX_HOME_CARRIERS_PER_SOURCE=3` | **3** — `rooms.spawning.ts:3837` |
| leftover-5 | hold 5 all RCL3 | **yes** — `extensionTake` `lvl<=3 → 5` |

---

## Exact patch (not applied)

One function. Three sites, same `atMine`. Against current `src/Functions/creepFunctions.ts`. Identical to the spec fence.

```diff
--- a/src/Functions/creepFunctions.ts
+++ b/src/Functions/creepFunctions.ts
@@ -1491,6 +1491,9 @@ Creep.prototype.harvestEnergy = function harvestEnergy() {
 /** Ticks a hauler sticks to a chosen pile before re-evaluating. */
 const PICKUP_LOCK_TTL = 25;
 
+/** Next to PICKUP_LOCK_TTL (:1492). Range 0–2 covers source-tile drop, adjacent miner drop, source box. */
+const STICKY_SOURCE_RANGE = 2;
+
 /** Rebuilt lazily once per tick from Game.creeps — heap only, never Memory. */
 let _pickupLedger: { tick: number; claims: Map<string, number> } | null = null;
 
@@ -1593,6 +1596,17 @@ Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquire
 
     const locking = _pickupLockEnabled();
 
+    const stickySrc: any =
+        this.memory.role === "carry" && this.memory.sourceId
+            ? Game.getObjectById(this.memory.sourceId)
+            : null;
+    const atMine = (o: any) =>
+        !stickySrc ||
+        !stickySrc.pos ||
+        !!(o && o.pos &&
+            o.pos.roomName === stickySrc.pos.roomName &&
+            o.pos.getRangeTo(stickySrc) <= STICKY_SOURCE_RANGE);
+
     /** Unreserved energy, excluding this creep's own (possibly stale) claim. */
     const unreserved = (o: any) =>
         _pickupUnreserved(o, o && o.id === prevId ? prevClaim : 0);
@@ -1617,17 +1631,17 @@ Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquire
     // 1) Adjacent salvage first (instant tick, free profit, doesn't move us).
     //    Runs in both modes and does NOT disturb an existing lock.
     const adjDrop = this.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
-        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
+        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 0 && atMine(r),
     });
     if (adjDrop.length) return take(adjDrop[0]);
 
     const adjRuin = this.pos.findInRange(FIND_RUINS, 1, {
-        filter: (r) => r.store[RESOURCE_ENERGY] > 0,
+        filter: (r) => r.store[RESOURCE_ENERGY] > 0 && atMine(r),
     });
     if (adjRuin.length) return take(adjRuin[0]);
 
     const adjTomb = this.pos.findInRange(FIND_TOMBSTONES, 1, {
-        filter: (t) => t.store[RESOURCE_ENERGY] > 0,
+        filter: (t) => t.store[RESOURCE_ENERGY] > 0 && atMine(t),
     });
     if (adjTomb.length) return take(adjTomb[0]);
 
@@ -1666,6 +1680,7 @@ Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquire
             !expired &&
             locked.pos &&
             locked.pos.roomName === this.pos.roomName &&
+            atMine(locked) &&
             worthIt;
 
         if (stillGood) {
@@ -1684,7 +1699,7 @@ Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquire
     const selectMin = Math.min(nearWorth, free);
     /** strict = respect other creeps' reservations. */
     const hasRoom = (o: any, strict: boolean) =>
-        !locking || !strict || unreserved(o) >= selectMin;
+        atMine(o) && (!locking || !strict || unreserved(o) >= selectMin);
     const takeable = (o: any) =>
         locking ? Math.min(free, unreserved(o)) : Math.min(free, _pickupEnergyOf(o));
```

Who: `role === "carry" && sourceId` live. Missing / invisible id → `atMine` always true (today). FakeFiller flips back to `carry` empty and keeps the id. Upgrader / builder / filler unchanged.

Leave: lock TTL 25, `keepMin`, `pick(false)`, `pickupIdle`, `lockOn`, `selectMin` / `minWorth`, want=3, 1:1, 4C, `pressure.haul`. No `go(source)` on idle. No `Features` flag.

---

## Why this is safer than haul-2

Cycle-12 cut the 3rd body **and left closest-select**. Film: both (then the remaining two) stacked on near; far 5W decayed; income ~10 e/t not 20; 4W + leftover ext underfed on the 135k. RCL3 looked cheap (−1187 HOL). RCL4 **32303 vs 29843, +2460**. SEND BACK.

Sticky does not cut count. `spawn_carrier` already writes `memory.sourceId`; this is the first read. The 2nd/3rd body walks to *its* pile (range ≤2 of that source) instead of `findClosestByRange` in the room.

| | haul-2 (c12) | sticky (this) |
|---|---|---|
| bodies / source | 2 | **3** (L≥12 at 5W needs `10*(2L+6)*1.35/200` → 3; two leave ~86e/trip ≈ 2 e/t decaying) |
| pickup | closest — both on near | `atMine` — far gets its own shuttle |
| far miner | drop-mines alone | served if tagged |
| 4W on 135k | starved | still 3×200 capacity once both piles have a body |
| fail mode | silent far decay + RCL4 +2460 | named idle (`pickupIdle++`) if *its* pile is empty |

Re-open 3→2 only after a sticky KEEP **and** film shows both piles have a shuttle on L≥12. Kill `pick(false)` is the measurement *after* this.

---

## Risks

### 1. Miners starve

Assigned pile empty / `< minWorth` → `pick` misses, `pickupIdle++`, CA stands while the other source overflows. Do not steal overflow this race.

`dumpMinerEnergy` is **room-global**: one CA anywhere kills walk-in for **both** sources. A far-pinned CA counts. Near `[W,C,M]` then `drop()` on the source tile with nobody in range 1–2.

Range-3 box is invisible (`STICKY_SOURCE_RANGE=2`). Planner seats are adj (1); miner `containerNearby` is `<= 2` from the miner. Do not bump to 3 (that is E13S7 plus hub-adjacent sources).

Same-source 2nd body still queues (`pick(false)`). This knob only stops the *other* source's bodies joining. A 5W pile can still stack two CA when leftover ≥ `selectMin` after a 200-cap claim.

### 2. Haulers glue to far source

`identifySources` (`rooms.ts:649–663`) keys `find(FIND_SOURCES)` order, not hub-near. First `energy` key can be the long tile (E9S1 3+41, E13S9 26 vs 8). `sourceId` is lifetime for home (`targetRoom == homeRoom`). Once tagged far, they never take near overflow.

Today that first `[C,C,M]` closest-selects the near pile (accidentally right). After sticky it walks far for life.

E13S7 `(10,13)` / `(12,14)` — Chebyshev **2**. Range-2 disks cover both; stickiness is a no-op (easy pair). Voronoi would split; out of scope.

Hub crumbs ignored by sticky CA (adj now `atMine`). Dying-creep / overflow at spawn wait for upgrader/builder/unsticky. Fine on the clock.

`carry.ts:358–365` deletes `sourceId` when a remote is folded home at RCL<4. Those bodies go back to closest-select. Race clock is RCL4; home carriers keep the id.

### 3. RCL2 slam

Slam-5 is live (5 ext = 15k at cap 550). First hauler is `[C,C,M]` (RCL1 HOL SEND BACK). If the first `sourceId` is the far key, that body walks 16–41 instead of feeding the near pile that fills the slam. Near 2W drop-mines unserved until source B gets a CA.

Watch RCL1–2 on split rooms (hard band `srcSteps` 16–41). Film slam: 5-ext time vs control, not only RCL4. Sign can flip on those pairs even if the mean later wins.

Do not reorder `identifySources` this diff.

---

## Exact test

**When:** after cycle-15 is *called* (RCL4 8/8). `_SPEEDRUN-STATE.txt` is `cycle-15-watching`. **Do not apply now.**

**Cycle:** the next seed after 15. One knob. This patch only.

`_next-after-15.md` ranks clamp-skip #1 / roster D #2 / this #3. This note does not reorder. If 15 KEEP, do not bundle #1/#2 into this race. If 15 SEND BACK, drop #1 and this is still a later one-knob — still not a bundle.

**Leave on:** leftover-5 (`extensionTake` `lvl<=3 → 5`). 6W after 550. no-RCL3-roads. no-RCL2 source/depot boxes. want=**3**. `pressure.haul`. 1:1, 4C. `fiveWQueued` as 15 left it.

**Leave off:** haul-2, `pick(false)` kill, `Features.pickupSticky`, `go(source)` idle, Voronoi, spawn-order pin, remotes, ext-take, recycle 200e.

| | |
|---|---|
| Control | frozen `e839fc8`. Live closest-select. |
| Candidate | `atMine` as above. One function. |
| Set | `1f90aub`, `--swap`, `--target-rcl 4`, `--tick-budget 40000` |
| Metric | mean spawn→RCL4. Read pair split (hard/far vs easy). |
| Throughput | existing `pickupGot/pickupTicks`, `pickupIdle`, `pickupFallback`. No new counters. |
| Hygiene | `_clean-world.md` / `_NEXT-RACE.md` §0 **before** seed. Gate, not a knob. |

Film (`http://127.0.0.1:8767/`):

- E13S9 far EM `[19,6]` has a CA in range 1–2.
- E4S7 far `[40,43]` not empty-handed.
- 4W `en` not sitting 0 while a far pile decays.
- RCL1–2 split rooms: first CA not glued far while near slam starves.
- Cand L3 still **5 ext** (leftover-5 held).

Call KEEP only on RCL4 8/8 vs that seed's control. Dirty 24512 is not the bar; clean leftover-5+6W is cycle-8 **29029 8/8** or the live control.

Seed shape (after 15 called, after hygiene, after this diff, `push-pacifist` **not** `push-race`):

```
--label "cycle-N-sticky"
--note "sticky pickup vs closest-select; leftover-5 on; want=3"
```

---

## Do not

- Apply src mid cycle-15.
- `npm run push-race`. `server:local:reset`. `git push`. Unclaim E36N57. SSH VPS.
- Touch `MAX_HOME_CARRIERS_PER_SOURCE`. Touch `extensionTake`.
- Bundle clamp-skip, roster D, `pick(false)`, first-box, adopt-plans.
