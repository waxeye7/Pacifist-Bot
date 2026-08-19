# Cycle-16 hygiene — one knob before seed

Read-only. **Do not apply these hunks. Do not edit `src`.** Cycle-15
(`run-2026-08-15T23-57-10Z`, `cycle-15-5w-latch`) is still watching.
Do not seed now. Line numbers are current dirty WC (2026-08-16).

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  seed while 15 is watching
```

Cycle-16 is **latch + clamp skip + HOL exempt**. One knob. Both skips
or neither: clamp-only → HOL 4W after 40t `-6`; HOL-only → same-pass
clamp already made 4W (`_next-5w-src.md`). Latch is already in the
live 15 compile. The skips are not.

Src is dirtier than that compile. Sticky + roster D in the same push
makes 16 a three-knob bundle. Revert those two **before** seed-clean.

---

## Inventory vs cycle-15 compiled

| extra | file | in 15 compile? | 16 |
|---|---|---|---|
| `fiveWQueued` + `lastSpawn=0` poke | `rooms.spawning.ts` `:4330–4346`, write `:4425` | **yes** — that race | **stay** |
| clamp skip home `[5W,M]` 550 | `:208–219` | no | **stay** (the knob) |
| HOL exempt `[5W,M]` 550 | `:3017–3023` | no | **stay** (same knob) |
| sticky pickup | `creepFunctions.ts` `:1495`, `:1599–1702` | no | **revert** |
| overlap-replace (roster D) | `rooms.spawning.ts` `overlapReplaceWanted` / `cullOverlapShuttle` / `overlap4WQueued` | no | **revert** |
| naked-shell | `PlanV2.ts` `isShellNaked` / `maxSitesFor` / strip | no | **stay** (VPS) |
| CB helpers | `rooms.spawning.ts` `maybeSpawnColonyBuilder` + friends | no | **stay** (VPS) — see fire |
| expand unstick | `AutoExpand.ts` `CLAIMED_SPAWNLESS` / `spawnlessOwned` | no | **stay** (VPS) |

Already in 15 and **not** this list (leave on): leftover-5
`extensionTake` `lvl<=3 → 5`, 6W `amount: cap>=550 ? 6 : 4`, no
BasePlan roads `rcl<4`, no RCL2 source seats `level >= 3`, legacy
depot miss-guard, haul=3, recycle-200e gone.

---

## 1. MUST stay — the 5W A/B

Do **not** revert these. Do **not** extract `isHomeFiveWMiner` this
race. Do **not** touch `getBody`, the 550 producer, leftover-5, 6W
`amount`, haul MAX, roads, boxes.

### Clamp skip — `clampSpawnListToCapacity` `:208–219`

```
EnergyMiner && hardCap >= 550 && length === 6
  && home (!targetRoom || targetRoom === room.name)
  && bodyCost === 550 && WORK === 5 && MOVE === 1
    → continue
```

Without this, same-pass clamp (`:146–147`) budgets
`floor(550*0.85)=467` and `shrinkQueuedBody` emits `[4W,M]=450`.
That is the live 15 hatch. Log `clamped EnergyMiner from 550 to 450`
must die on 16.

### HOL exempt — `spawnFirstInLine` `:3017–3023`

EnergyMiner shrink is still `available < length*100 && length > 3`,
AND-not

```
cap >= 550 && length === 6 && bodyCost === 550 && WORK === 5
```

`[5W,M]` length 6 → bar **600**. Leftover-5 cap is 550, so
`550 < 600` is always true. After 40t `-6`, HOL drops WORK
(5→4→3→2) even on a full network. Clamp skip without this is a
40-tick delay before the same 4W.

Operator bind is on the EnergyMiner clause only (`&& !(` tighter
than the Carrier / Reserver `||`). HOL omits the home/`MOVE===1`
check. Fine — remotes are off the spawn→RCL4 clock.

### Latch — already raced

```
:4330–4346  home && cap>=550 && !fiveWQueued && lastSpawn recent
            && !queued && live WORK<5 && seats>0
              → lastSpawn = 0
:4425       550 path: lastSpawn = T; fiveWQueued = true
```

If 15 **KEEP**: leave the poke. 16 is latch-4W vs latch+real 5W.

If 15 **SEND BACK** (flood, or lose RCL4 8/8): drop **only**
`:4345` `values.lastSpawn = 0`. Keep `fiveWQueued` write + both
skips. 1500-gate replacement is then 5W, not 4W. Do not re-ship
cycle-13. Safer poke-free unshift is `_next-5w-latch.md` §safer —
not this hygiene.

Watch after seed: hatch `WORK=5`; after leftover 2W dies **10 e/t**
not 8; `fiveWQueued` still one extra; miners 2/source (KEEP) or 1
until replacement (SEND BACK).

---

## 2. MUST revert — else 16 is not one knob

`_next-after-15.md` ranks these **#2** (overlap) and **#3**
(sticky). Measure them later, at 10 e/t, not bundled with 5W.

### 2a. Sticky pickup — `src/Functions/creepFunctions.ts`

Fires on **every** home `carry` with `sourceId` from RCL1. Closest-
select → assigned-source Chebyshev ≤2. Cycle-12 haul-2 died because
closest-select stacked both bodies on the near pile. This **is**
the race clock. Revert all of it.

`MAX_HOME_CARRIERS_PER_SOURCE` stays **3**. Do not touch lock TTL,
`pick(false)`, `go(stickySrc)`.

```diff
--- a/src/Functions/creepFunctions.ts
+++ b/src/Functions/creepFunctions.ts
@@ -1491,9 +1491,6 @@ Creep.prototype.harvestEnergy = function harvestEnergy() {
 /** Ticks a hauler sticks to a chosen pile before re-evaluating. */
 const PICKUP_LOCK_TTL = 25;
 
-/** Next to PICKUP_LOCK_TTL (:1492). Range 0–2 covers source-tile drop, adjacent miner drop, source box. */
-const STICKY_SOURCE_RANGE = 2;
-
 /** Rebuilt lazily once per tick from Game.creeps — heap only, never Memory. */
 let _pickupLedger: { tick: number; claims: Map<string, number> } | null = null;
@@ -1596,17 +1593,6 @@ Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquire
 
     const locking = _pickupLockEnabled();
 
-    const stickySrc: any =
-        this.memory.role === "carry" && this.memory.sourceId
-            ? Game.getObjectById(this.memory.sourceId)
-            : null;
-    const atMine = (o: any) =>
-        !stickySrc ||
-        !stickySrc.pos ||
-        !!(o && o.pos &&
-            o.pos.roomName === stickySrc.pos.roomName &&
-            o.pos.getRangeTo(stickySrc) <= STICKY_SOURCE_RANGE);
-
     /** Unreserved energy, excluding this creep's own (possibly stale) claim. */
     const unreserved = (o: any) =>
         _pickupUnreserved(o, o && o.id === prevId ? prevClaim : 0);
@@ -1631,17 +1617,17 @@ Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquire
     // 1) Adjacent salvage first (instant tick, free profit, doesn't move us).
     //    Runs in both modes and does NOT disturb an existing lock.
     const adjDrop = this.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
-        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 0 && atMine(r),
+        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
     });
     if (adjDrop.length) return take(adjDrop[0]);
 
     const adjRuin = this.pos.findInRange(FIND_RUINS, 1, {
-        filter: (r) => r.store[RESOURCE_ENERGY] > 0 && atMine(r),
+        filter: (r) => r.store[RESOURCE_ENERGY] > 0,
     });
     if (adjRuin.length) return take(adjRuin[0]);
 
     const adjTomb = this.pos.findInRange(FIND_TOMBSTONES, 1, {
-        filter: (t) => t.store[RESOURCE_ENERGY] > 0 && atMine(t),
+        filter: (t) => t.store[RESOURCE_ENERGY] > 0,
     });
     if (adjTomb.length) return take(adjTomb[0]);
@@ -1680,7 +1666,6 @@ Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquire
             !expired &&
             locked.pos &&
             locked.pos.roomName === this.pos.roomName &&
-            atMine(locked) &&
             worthIt;
 
         if (stillGood) {
@@ -1699,7 +1684,7 @@ Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquire
     const selectMin = Math.min(nearWorth, free);
     /** strict = respect other creeps' reservations. */
     const hasRoom = (o: any, strict: boolean) =>
-        atMine(o) && (!locking || !strict || unreserved(o) >= selectMin);
+        !locking || !strict || unreserved(o) >= selectMin;
     const takeable = (o: any) =>
         locking ? Math.min(free, unreserved(o)) : Math.min(free, _pickupEnergyOf(o));
```

Do **not** revert the RCL6+ `_storageFloorFor` band in the same file
(`:895–904`). That is VPS; `lvl >= 6` never hits the RCL1–4 clock.

### 2b. RCL3 overlap-replace — `src/Rooms/rooms.spawning.ts`

Roster D. Fires the tick a controller depot **stands** at RCL3:
`overlapReplaceWanted` pushes `[4W,C,M]` while 6×2W still work,
`overlap4WQueued` latches, `cullOverlapShuttle` `suicide()`s a 2W
at heads≥7. That is the 135k sink (10–12 → 16 e/t vs KEEP 10–12 →
8). Second knob. `amount: 4` stays. Do not restore
`recycleTinyShuttles` (cycle-7 SEND BACK).

Four sites + the type.

```diff
--- a/src/Rooms/rooms.spawning.ts
+++ b/src/Rooms/rooms.spawning.ts
@@ -476,7 +476,6 @@ function recycleTinyCarriers(room): void {
 }
 
 function add_creeps_to_spawn_list(room, spawn) {
     recycleTinyCarriers(room);
-    cullOverlapShuttle(room);
 
     let EnergyMiners = 0;
@@ -625,7 +624,7 @@ function add_creeps_to_spawn_list(room, spawn) {
                 break;
 
             case "upgrader":
-                if(isInRoom(creep, room) && !creep.memory.suicide && !creep.memory.overlapCull) {
+                if(isInRoom(creep, room) && !creep.memory.suicide) {
                     upgraders ++;
                 }
                 break;
@@ -1441,12 +1440,6 @@ function add_creeps_to_spawn_list(room, spawn) {
                 room.memory.spawn_list.push(spawnrules[3].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                 console.log('Adding Upgrader to Spawn List: ' + name);
             }
-            else if(overlapReplaceWanted(room, upgraders) && !room.memory.danger && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 1500)) {
-                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
-                room.memory.spawn_list.push(parkedUpgraderBody(room), name, {memory: {role: 'upgrader'}});
-                room.memory.overlap4WQueued = true;
-                console.log('Adding overlap 4W Upgrader to Spawn List: ' + name);
-            }
             // After eco. Container decay is 50 hits/t (5000-tick life);
             // a 200e body must not HOL the depot builder or the parked 4W.
@@ -3398,82 +3391,6 @@ function hasControllerDepot(room): boolean {
         s.pos.findInRange(sources, 1).length == 0
     }).length > 0;
 }
-
-/** Body WORK, not getActiveBodyparts — a hatchling's active count is 0. */
-function workFromBody(creep): number {
-    let n = 0;
-    const body = creep.body || [];
-    for(let i = 0; i < body.length; i++) if(body[i].type == WORK) n++;
-    return n;
-}
-
-function queuedParkedUpgrader(room): boolean {
-    const q = room.memory.spawn_list || [];
-    for(let i = 0; i + 2 < q.length; i += 3) {
-        const name = q[i + 1];
-        const body = q[i];
-        if(typeof name !== "string" || name.indexOf("Upgrader") !== 0) continue;
-        let w = 0;
-        if(body) for(let j = 0; j < body.length; j++) if(body[j] == WORK) w++;
-        if(w >= 4) return true;
-    }
-    return false;
-}
-
-/**
- * Roster D. After a parked 4W is live, drop one leftover 2W so heads
- * return to 6 and the next 4W can queue. Never cull at parked==0
- * (cycle-7 extras-only). Never memory.suicide (recycle-walk).
- */
-function cullOverlapShuttle(room): void {
-    if(!room.controller || room.controller.level !== 3) return;
-    if(!hasControllerDepot(room)) return;
-    let parked = 0, heads = 0;
-    let victim: any = null;
-    let victimTtl = 9999;
-    let victimUnparked = false;
-    for(const name in Game.creeps) {
-        const c: any = Game.creeps[name];
-        if(!c || c.memory.role !== "upgrader") continue;
-        if(!isInRoom(c, room) || c.memory.suicide || c.memory.overlapCull) continue;
-        heads++;
-        if(workFromBody(c) >= 4) { parked++; continue; }
-        // spawning creeps cannot suicide; do not pick a hatchling 2W
-        if(c.spawning) continue;
-        const unparked = !(c.memory.controllerLink && c.memory.controllerLink.x !== undefined);
-        const ttl = c.ticksToLive || 0;
-        if(!victim || (unparked && !victimUnparked) || (unparked == victimUnparked && ttl < victimTtl)) {
-            victim = c;
-            victimTtl = ttl;
-            victimUnparked = unparked;
-        }
-    }
-    if(parked >= 1 && heads >= 7 && heads > 4 && victim) {
-        victim.memory.overlapCull = 1;
-        victim.suicide();
-    }
-}
-
-/** One in-flight 4W while 2W still work. Not a lastSpawn poke. */
-function overlapReplaceWanted(room, upgraders: number): boolean {
-    if(!room.controller || room.controller.level !== 3) return false;
-    if(!hasControllerDepot(room)) return false;
-    if(room.memory.overlap4WQueued && !queuedParkedUpgrader(room) && !queuedWithPrefix(room, "Upgrader-")) {
-        room.memory.overlap4WQueued = false;
-    }
-    if(room.memory.overlap4WQueued) return false;
-    if(queuedParkedUpgrader(room) || queuedWithPrefix(room, "Upgrader-")) return false;
-    let parked = 0;
-    for(const name in Game.creeps) {
-        const c: any = Game.creeps[name];
-        if(!c || c.memory.role !== "upgrader") continue;
-        if(!isInRoom(c, room) || c.memory.suicide || c.memory.overlapCull) continue;
-        if(workFromBody(c) >= 4) parked++;
-    }
-    if(parked >= 4) return false;
-    if(upgraders >= 7) return false;
-    return true;
-}
 
 /**
  * When a dedicated filler pays for itself.
```

`queuedWithPrefix` is pre-existing (Repair/Maintainer/…). Leave it.

```diff
--- a/src/utils/Global.ts
+++ b/src/utils/Global.ts
@@ -202,7 +202,6 @@ declare global {
         homeRoom: string;
         targetRoom: string;
         suicide: boolean;
-        overlapCull?: number;
         storage: any;
         source: any;
         sourceId:any;
```

After revert, `rg overlapReplaceWanted|cullOverlapShuttle|overlap4WQueued|overlapCull|workFromBody|queuedParkedUpgrader|STICKY_SOURCE_RANGE|atMine|stickySrc` in `src/` is empty.

---

## 3. VPS-only — can stay in src

Race rooms are RCL1–4, `planPackMiss`, spawn-in MY spawn, GCL 4 / 8
owned. That is **not** the same as “RCL1–4 so nothing fires.” Gates
below.

### Naked-shell — `PlanV2.ts` `isShellNaked` / `maxSitesFor` / strip

**Does not fire on the 8-pair.** Triple gate:

1. `placeFromPlanV2` returns if `!room.memory.planV2`
   (`PlanV2.ts:2064–2065`). Race is empty-pack `planPackMiss`
   (`_why-no-planv2.md`). `construction.ts:712` never enters.
2. `maxSitesFor` naked exception is `lvl >= 6 && my storage && E <
   30k/80k/150k` (`:51–58`). Clock is RCL4. Budget 40k. No RCL6.
3. Strip / road+rampart-only siting (`:2125–2138`, `:2208`) is
   inside `placeFromPlanV2`.

`extensionTake` leftover-5 in the same file **does** run on the
race (BasePlan + checkerboard). That is a KEEP already in 15, not
the shell exception.

Sister PlanV2 dirt (`clearPlanSpawnTile`, young off-plan spawn
retire, occupy/count split) is also planV2 / spawnless. Race
spawn-in means `ensureSpawnFirst` never runs. Dead on the clock.

### Expand unstick — `AutoExpand.ts`

**Does not fire on the intended 8-pair.** New bits:

| bit | when it runs | race |
|---|---|---|
| `CLAIMED_SPAWNLESS` 8000 abort | `phase === "claimed"` && no MY spawn | no `Memory.autoExpand` after a clean seed; rooms have spawns |
| `spawnlessOwned` hold | `blockedReason` before `pick()` | `pick()` already blocked: GCL **4 ≤ 8** owned |
| `hasVisibleForeignSpawn` skip | inside `pick()` | same — `pick()` never starts |
| `clearPlanSpawnTile` in `ensureSpawnSite` | `claimed` && no MY spawn | no claimed machine |

The RCL1–4 claim is the wrong reason. The real reasons are **GCL
vs 8 rooms** and **spawn-in**. `runPackAdoption()` still always
runs (`features.autoExpand === false` only skips the state
machine). That is HEAD, not this extra; empty pack → `planPackMiss`
same as 15.

**Leftover Memory hole (not a race-room gate):**
`_scrub-racer-mem.mjs` deletes the 16 `Memory.rooms` keys and
resets `speedrun`. It does **not** delete `Memory.autoExpand` or
`Memory.target_colonise`. A stale `claimed` pointer would now abort
at 8000t (safer than sitting). A stale `claiming` still
`armColonise`s. Wipe those two keys at seed (gate, not a revert).

### CB helpers — `rooms.spawning.ts` `:4987–5061`

**Not RCL-gated off the race.** Cycle-15 CB sat inside
`if (target_colonise && …)` — race never queued one. Current
`maybeSpawnColonyBuilder` runs **every** producer pass, colonise
or not.

Gates that **do** open on the clock:

- `controller.level < 3` → return. Dead RCL1–2. **Live at RCL3.**
- `storage > 10000` — `storage` is `findStorage()` = **hub
  container**. Slam-5 rooms stock the hub on the 135k. This
  **can** be true.
- `bucket > 7750` — yes after seed.
- `finishableSpawnSiteRoom` — the actual safety.

Live room: MY spawn → not a hit. Seed-in rooms are safe.

Memory fallback (`roomLooksSpawnlessOwned` no vision):

```
!Structures.spawns
  && (speedrun || planV2 || planPackMiss || basePlan)
  && basePlan.spawn[0]
    → hit
```

No live spawn-site check. `_scrub-racer-mem.mjs` only deletes the
**16** keys. Candidate historically had ~67 Redis rooms
(`_NEXT-RACE.md`). A leftover `Memory.rooms[<not-bench>]` with
`basePlan.spawn[0]` and no `Structures.spawns` makes RCL3+hub>10k
queue a 24-part CB onto the 135k. That **is** a second knob.

**Stay in src only if seed-clean also:**

1. Delete every `Memory.rooms` key, not just the 16.
2. `delete Memory.target_colonise; delete Memory.autoExpand`.
3. Census: 0 `buildcontainer`, 0 spawnless owned.

If that gate is not landed, revert CB too (put the HEAD
`target_colonise` block back, drop `maybeSpawnColonyBuilder` /
`finishableSpawnSiteRoom` / `roomLooksSpawnlessOwned`). Safer one-
knob. Do not apply now.

---

## 4. Also dirty, dead on the clock (not the listed extras)

Leave. Not 16. Not a revert.

| | why dead |
|---|---|
| `creepFunctions.ts` RCL6+ storage floor | `lvl >= 6` |
| `Speedrun.ts` `skipHighRcl` | flag off; seed-clean writes a fresh `speedrun` without it |
| `energyMiner.ts` / `repair.ts` `isSanctionedRampart` | links / fat ramparts; no RCL3 roads/ramparts |
| `rooms.ts` `skipHighRclRoom` | same flag |

Do not bundle these into the revert pass.

---

## 5. Order (still do not run)

1. Call 15 on RCL4 **8/8** or explicit SEND BACK. No mid-race push.
2. Apply §2 hunks (sticky + overlap + `overlapCull` type). Src only.
3. Confirm §1 still present. `rg` empty on the revert names.
4. Seed-clean gate (`_clean-world.md` / `_next-seed.md`): user-null
   scrub, **all** `Memory.rooms`, `autoExpand` / `target_colonise`,
   no stale `planV2` / `rclTimes.8`. `pacifist2` offline.
5. Seed `cycle-16-5w-clamp`. `--swap`. Control frozen `e839fc8`.
   Leftover-5 on. Never `--run` `23-57-10Z`. Never `push-race`.

Metric: mean spawn→RCL4 vs this seed's control **and** vs clean
**29029** 8/8. Not vs dirty 24512 7/8. Not vs cycle-13 flood.

Sister: `_next-cycle16.md`, `_next-5w-src.md`, `_next-5w-clamp.md`,
`_next-5w-hol.md`, `_next-5w-latch.md`, `_next-sticky-pickup.md`,
`_next-rcl3-overlap.md`, `_next-naked-shell.md`,
`_next-claim-bootstrap.md`, `_next-expand-src.md`.
