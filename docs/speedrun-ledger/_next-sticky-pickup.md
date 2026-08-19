APPLIED IN SRC (not pushed). Cycle-15 live compiled code unchanged until push.
File: src/Functions/creepFunctions.ts — acquireEnergyWithContainersAndOrDroppedEnergy
STICKY_SOURCE_RANGE = 2 :1495 (next to PICKUP_LOCK_TTL :1492)
stickySrc / atMine after const locking :1597–1608
atMine on adjacent salvage :1634 drop, :1639 ruin, :1644 tomb
atMine on stillGood :1683
atMine on hasRoom :1701–1702
MAX_HOME_CARRIERS_PER_SOURCE stays 3 (rooms.spawning.ts untouched)
No Features flag. No pick(false) kill. No go(stickySrc) on idle.
No _next-sticky-ready.md — used this spec's exact patch.

# Next haul — source-sticky pickup

Read-only spec. **Do not edit src until this is the live A/B.** Not remotes. Not ext. Not `MAX_HOME_CARRIERS_PER_SOURCE` (cycle-12 haul-2 SEND BACK: RCL4 **32303 vs 29843, +2460**; 4W underfed). Metric: mean ticks spawn→RCL4.

`_next-haul.md` ranked this #2 after the count cut. Count cut first; extras were already stacked, so 2/source cut HOL (RCL3 −1187) and then starved the 4W. Pickup is still closest-wins. This is the handoff knob: the body `spawn_carrier` already tagged with `memory.sourceId` has to walk to *that* pile.

---

## Live miss

`sourceId` is spawn accounting only.

`spawn_carrier` (`rooms.spawning.ts:4561–4563`, remotes `:4507–4508`) writes `{role:'carry', sourceId, …}`. `homeCarriersWanted` / `liveCarriersForSource` count by that id. `identifySources` (`rooms.ts:649–663`) keys `data.energy` in `find(FIND_SOURCES)` order, not hub-near.

`acquireEnergyWithContainersAndOrDroppedEnergy` (`creepFunctions.ts:1561–1787`) never reads `sourceId`.

Default ON (`Features.ts` `pickupLock !== false`):

1. Adjacent salvage (`:1618–1632`) — first drop/ruin/tomb in range 1 of **the creep**. Ignores reservations. Ignores source.
2. Lock 25t (`:1651–1678`) — keep if unreserved ≥ `keepMin` (or queued floor). No source test.
3. `pick(true)` (`:1691–1763`) — closest ruin → tomb → drop (range-12 then any ≥ `minWorth`) → `findContainers` then other boxes. `hasRoom` is reservation only (`:1686–1687`). Not amount. Not `sourceId`.
4. `pick(false)` (`:1766–1777`) — every pile reserved → walk to the **same** closest pile and `lockOn(…, 0, queued)`. Explicit queue.

`findContainers` (`roomFunctions.ts:301–337`) is room-sticky-fullest (skips bin / hub storage / controller depot). Two source boxes → one id in `Structures.container`.

Film (`_next-haul.md` Q2): E13S9 CA on `[9–11,25–31]` next to near `[10,23]`; far EM `[19,6]` alone. E4S7 6–7 CA on hub/near; far EM `[40,43]` thin.

Cycle-12 cut the 3rd body **without** this. Near still won closest. Far still decayed. Income ~10 e/t not 20. 4W + leftover ext underfed on the 135k.

---

## One knob

**File:** `src/Functions/creepFunctions.ts`  
**Function:** `Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy` (`:1561`)  
**Who:** `this.memory.role === "carry" && this.memory.sourceId` and `Game.getObjectById(sourceId)` is live. Everyone else (upgrader, builder, filler, FakeFiller, carry with deleted `sourceId`) unchanged. FakeFiller flips back to `carry` when empty (`FakeFiller.ts:52–56`) and keeps `sourceId`.

**Predicate:** target is at the assigned source iff same room and Chebyshev `<= 2`.

```ts
/** Next to PICKUP_LOCK_TTL (:1492). Range 0–2 covers source-tile drop, adjacent miner drop, source box. */
const STICKY_SOURCE_RANGE = 2;
```

Resolve once, **before** the lock fast path (after `const locking` `:1594`):

```ts
const stickySrc: any =
    this.memory.role === "carry" && this.memory.sourceId
        ? Game.getObjectById(this.memory.sourceId)
        : null;
const atMine = (o: any) =>
    !stickySrc ||
    !stickySrc.pos ||
    !!(o && o.pos &&
        o.pos.roomName === stickySrc.pos.roomName &&
        o.pos.getRangeTo(stickySrc) <= STICKY_SOURCE_RANGE);
```

Missing / invisible `sourceId` → `stickySrc` null → `atMine` always true (today's closest-select). Do not invent a walk-to-source.

**Three sites, same predicate. Not three knobs.**

### 1. Adjacent salvage (`:1618–1632`)

Add `&& atMine(r)` (and the ruin/tomb equivalents) to the three `findInRange` filters.

Leave this out and a far-tagged CA that paths through the near pile fills there, `return take()`, never reaches its EM. That is cycle-12 again on any hub-between pair.

### 2. Lock `stillGood` (`:1664–1669`)

```ts
const stillGood =
    !!locked &&
    !expired &&
    locked.pos &&
    locked.pos.roomName === this.pos.roomName &&
    atMine(locked) &&
    worthIt;
```

A leftover / queued lock on the other source dies this tick (`delete this.memory.pickup`) and re-selects. Leave TTL 25 / `keepMin` / queued floor as they are.

### 3. `hasRoom` (`:1686–1687`)

```ts
const hasRoom = (o: any, strict: boolean) =>
    atMine(o) && (!locking || !strict || unreserved(o) >= selectMin);
```

`pick(true)` and `pick(false)` both go through this. Drops, ruins, tombs, `findContainers` retry, and the `others` box scan all inherit.

- Other source's fuller box fails `hasRoom` → fall through to `others` → own box or own drop.
- `pick(false)` can still queue a 2nd CA on **this** source's reserved pile (`pickupFallback++`). Same-source stack stays. Cross-source queue dies.
- `pickupLock === false`: `hasRoom` is just `atMine`. Sticky still applies.

Do **not** change `lockOn`, ledger, `selectMin` / `minWorth` / `nearWorth`, `PICKUP_LOCK_TTL`, or the `if (!target) pickupIdle++` idle (`:1779–1781`). Do **not** `go(stickySrc)` on idle.

### Exact patch (draft only — cycle-15 live)

Against current `src/Functions/creepFunctions.ts`. One function. Do **not** apply until this is the live A/B.

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

---

## A/B

| | |
| --- | --- |
| Control | live closest-select. `MAX_HOME_CARRIERS_PER_SOURCE` stays **3**. `pressure.haul` stays. |
| Candidate | `atMine` as above. One function. |
| Metric | mean spawn→RCL4. Read pair split (hard/far vs easy). |
| Throughput | existing `pickupGot/pickupTicks`, `pickupIdle`, `pickupFallback`. No new counters. |

Film (`http://127.0.0.1:8767/`): E13S9 far EM `[19,6]` has a CA in range 1–2; E4S7 far `[40,43]` not empty-handed. 4W `en` not sitting 0 while a far pile decays.

---

## Do not bundle

- `MAX_HOME_CARRIERS_PER_SOURCE` 3→2 (already SEND BACK). Re-open **after** a sticky keep, and only on L≥12 at 5W.
- Kill `pick(false)` (`_next-haul.md` #3). Next measurement: same-source 2nd body stands on a 400e pile with a 200-cap lock.
- `Features.ts` / `Commands.ts` flag. Race is candidate vs frozen `e839fc8`. No `Memory.features.pickupSticky`.
- `go(source)` preposition on idle.
- Voronoi (`rangeTo(assigned) <= rangeTo(other source)`). Range-2 is the knob. See E13S7.
- Spawn order / pin first `sourceId` to the near source.
- `dumpMinerEnergy` room-global hauler. `minerFloor`. Body 2:1 / `[5C,5M]`.
- Upgrader/builder closest-select (they still raid the near pile). Depot tile. Remotes. Ext.

---

## Risks

1. **Sticky idle.** Assigned pile empty / `< minWorth`, other source overflowing → `pick` misses, `pickupIdle++`, CA stands. Named next measurement, not this diff. Do not steal overflow this race.

2. **First body pinned to the far key.** `identifySources` first key can be the long tile (E9S1 3+41). Today that `[C,M]` closest-selects the near pile (accidentally right). After sticky it walks far; near EM drop-mines unserved until source B gets a CA. Watch RCL1–2 on split rooms. Do not reorder keys this diff.

3. **E13S7 overlap.** Sources `(10,13)` / `(12,14)` — Chebyshev **2**. Range-2 disks cover both. Stickiness is a no-op there (easy pair, `srcSteps` 2+3). Voronoi would split them; out of scope. No other `1f90aub` pair is this tight (next is E21S4 at 6).

4. **Range 2 vs a range-3 box.** Planner source seats are adj (1). Miner `containerNearby` is `<= 2` from the miner (`energyMiner.ts:315`). A box at 3 of the source is invisible to this CA. Do not bump to 3 — that is E13S7 plus hub-adjacent sources.

5. **`pick(false)` same-source queue remains.** Two CA on one 5W pile still happens when leftover ≥ `selectMin` after the first 200-cap claim. This knob only stops the *other* source's bodies joining. Film should show the 2nd/3rd body on *its* tile, not all three on near.

6. **Hub crumbs ignored** by sticky CA (adjacent now `atMine`). Dying-creep / overflow drops at spawn wait for an upgrader/builder/unsticky. Fine on the clock.

7. **`carry.ts:358–365` deletes `sourceId`** when a remote is folded home at RCL<4. Those bodies go back to closest-select. Race clock is RCL4; home carriers keep `targetRoom == homeRoom` and keep the id.

8. **Lock 25t on a crumb at mine** still holds (`keepMin`). Unchanged.

---

## Why this, not another count cut

Cycle-12: 2/source × closest-select = 2 on near, 0 on far. RCL3 looked cheap (less HOL in front of the 6W shuttles). RCL4 4W paid +2460.

After sticky, 3/source is capacity on L≥12 at 5W (`10*(2L+6)*1.35 / 200`): two bodies leave ~86e/trip on the median source (~2 e/t into a decaying pile). Do not cut until film shows both piles have a shuttle.
