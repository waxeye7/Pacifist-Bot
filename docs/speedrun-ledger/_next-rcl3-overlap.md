APPLIED IN SRC (not pushed).
File: src/Rooms/rooms.spawning.ts only. amount: 4 unchanged.
Latch: room.memory.overlap4WQueued (in-flight; clear when no Upgrader queued).
Want: RCL3 + standing depot + parked [4W,C,M] < 4 → queue one 4W even if 6 live.
No lastSpawn=0 / lastTimeSpawnUsed poke (cycle-13). No extras-only at depot (cycle-7).
Cap heads at 7. After a 4W is live, suicide oldest 2W in place iff parked>=1 && heads>=7.
Never memory.suicide / recycle(). Victim: unparked 2W first, else lowest TTL.
Census still counts every 2W; skip overlapCull same-tick. workFromBody, not getActiveBodyparts.
Do not push-race, seed, or mid-race push. Cycle-15 stays watching.
Fenced diff below is what landed.

## Verify (2026-08-16)

Re-read `rooms.spawning.ts` vs `_next-rcl3-roster.md` D / `_next-after-15.md` §2.
Already landed. No logic change. Fence comments added (not in live cycle-15;
do not push-race until 15 is called).

| spec | src |
| --- | --- |
| depot stands + `parked < 4` → one `[4W,C,M]` even if heads 6 | `overlapReplaceWanted` + RCL3 `else if` |
| after hatch, `suicide()` oldest 2W / no park tile | `cullOverlapShuttle`: unparked first, else lowest TTL |
| cap overlap 7; leave `amount: 4` | want refuses `upgraders >= 7`; `spawnrules[3].upgrade_creep.amount` still 4 |
| leftover 2W keep working | cull only `parked >= 1 && heads >= 7`; no extras-only; no `recycle()` |

Did not touch leftover-5, 5W latch, clamp skip, haul, boxes, planner hub.

# Next A/B — RCL3 overlap-replace 4W (roster D)

Applied in src. No `push-race`. Cycle-15
(`run-2026-08-15T23-57-10Z`) is still watching. This is after-15 **#2**
/ `_next-rcl3-roster.md` **D**: hatch parked `[4W,C,M]` **while** the
2W still work. Not extras-only cull. Not 6×4W.

Metric: mean ticks spawn→RCL4. Model deltas, not race numbers. One
knob. Do not bundle leftover-5, roads, haul, 5W clamp, or amount:6.

Line numbers are `rooms.spawning.ts` unless noted.

---

## Verdict

**Census poke, not `lastSpawn` poke.** Leave `amount: 4`. Leave the
head-count gate. Add an `else-if` that queues **one** parked 4W when
the depot *stands* and `parked < 4`, even if heads are 6. Latch
`room.memory.overlap4WQueued` like `fiveWQueued`. Cap overlap at 7.
After a 4W is live and heads hit 7, `creep.suicide()` the oldest (or
unparked) 2W **in place**. Never `memory.suicide` / `recycle()`.

Do **not** zero `lastTimeSpawnUsed` / invent `lastSpawn`. That is
cycle-13.

Do **not** stop counting 2W in the main census. That is the flood /
6×4W gun.

---

## Live gap (leftover-5 + 6W KEEP)

| | amount | body |
| --- | ---: | --- |
| RCL2 cap `≥ 550` | **6** (`:879`) | `[2W,2C,2M]` 450e (`:3368–3372`) |
| RCL3, no depot | **4** (`:922`) | same shuttle |
| RCL3, depot up | **4** | `parkedUpgraderBody` → `[4W,C,M]` 500e (`:3375–3381`) |

`hasControllerDepot` (`:3387–3405`): standing container, range ≤4 of
the controller, not a source box, not bin/storage. **Site does not
count.** Same test as `upgrader.ts` `controllerDepot`.

RCL3 `amount` does **not** read the depot. Only the recipe flips.
`recycleTinyShuttles` is gone (cycle-7 SEND BACK). Census is
head-count, not body (`:626–630`):

```
if(isInRoom(creep, room) && !creep.memory.suicide) upgraders++;
```

In-room (`:3127` = `creep.room.name == room.name`). Hatching creeps
count. `spawn_list` does not. Gate (`:1433`):

```
upgraders < spawnrules[3].upgrade_creep.amount + pressure.burn
```

One push per `add_creeps_to_spawn_list` pass. With 6 live, `6 < 4`
is false. Recipe is already 500e. Nobody new queues until deaths
drain **6 → 5 → 4**, and the first 4W only on the death that takes
the count to **3**.

Six 2W at a stocked depot: **10–12 e/t** (4 park tiles typical + 2
overflow shuttle). Then **8 e/t** (4×2W). Designed 4×4W: **16 e/t**.
That 8 e/t tail is the cap’s real cost on the 135k.

`pressure.burn` (`:3582`): 0 while floor `< 3000`, else
`min(4, max(1, floor(onFloor/3500)))`. Fed depot usually keeps burn
at 0. Storage-full `amount+6` (`:1438`) is dead at RCL3 (no storage).

End-of-life recycle (`upgrader.ts:341–347`) is **only**
`!controllerLink && TTL ≤ 50 && empty`. Once the depot exists that
path is dead. They work until TTL 0.

---

## Why not the two obvious pokes

### A — `lastSpawn = 0` / `lastTimeSpawnUsed` poke

Upgraders have **no** `lastSpawn`. The producer gun is
`lastTimeSpawnUsed` (`:129–147`):

```
spawn_list empty && (T - lastTimeSpawnUsed == 2
  || (T - lastTimeSpawnUsed) % 20 == 0)   // RCL ≤ 5
spawn_list non-empty && T % 500 == 0
```

Cycle-13: `values.lastSpawn = 0` every producer pass while a 2W
miner was live → queue empty + T+2 → one extra miner per spawn
cycle → 15/source. Cycle-15’s `fiveWQueued` is the safety on
**that** gun. Do not build a second copy for upgraders.

Poking `lastTimeSpawnUsed = 0` is a no-op (`:42–44` rewrites 0 to
`Game.time`). Poking `lastTimeSpawnUsed = Game.time - 2` fires the
producer this tick if the queue is empty — every pass, if you leave
it armed. Same flood shape.

**Do not poke either stamp.** Push the 4W yourself. Leave every
`lastSpawn` / `lastTimeSpawnUsed` writer alone.

### B — Census ignores 2W when the depot stands

```
// BAD
if (work >= 4 || !hasControllerDepot) upgraders++;
```

Then `0 < 4` is true on six live shuttles. `spawn_list` is not
counted. `% 500` with a non-empty queue and T+2 after hatch both
re-enter. Hatchling `getActiveBodyparts(WORK) == 0` (engine; same
bug cycle-15 documented at `_next-5w-latch.md` §3) looks like
another shuttle → another 4W. Four of those on top of six 2W = **10
heads**, 6×4W if you also raise `amount`. That is roster **E**.

The main census must **keep counting 2W**. The overlap path counts
parked separately.

### C — Kill extras the tick the depot stands

Census skip on `memory.suicide` drops 6→4 the same tick. Remaining
four are still 2W. Gate `4 < 4` false. Sink **12 → 8**. Zero 4W
unlocked. `recycle()` walks to spawn (cycle-7, RCL3 **+1466**).
`creep.suicide()` in place is cheaper and still the wrong set of
creeps.

Killing extras only pays **after** a 4W is already live, and only
to drop heads from 7→6 so the next 4W can queue. Not before.

---

## Latch (same shape as `fiveWQueued`)

`fiveWQueued` (`:4263–4276`, written `:4355`): one extra miner, then
silence. Flag lives on `Memory.rooms[home].resources[…].energy[id]`.
The gun is still `lastSpawn = 0`; the flag is the safety.

Overlap latch is **stricter**: no stamp poke at all. Flag lives on
`room.memory.overlap4WQueued` (owned home, always visible; not wiped
by `identifySources` / remotes / scout).

| | `fiveWQueued` | `overlap4WQueued` |
| --- | --- | --- |
| gun | `lastSpawn = 0` then 1500 gate | **direct `push`** of `[4W,C,M]` |
| when | cap ≥ 550, live miner tiny | depot stands, `parked < 4`, heads `< 7` |
| persist | forever (one extra miner) | **in-flight** — clear when the queued Upgrader is gone |
| re-arm | never | yes, until `parked >= 4` |
| hatch WORK | `getActiveBodyparts` is 0 | count `c.body` (hatchling is already 4) |
| queue | `queuedForSource` | `queuedWithPrefix('Upgrader-')` + body WORK ≥ 4 |
| cap | 2 miners/source (implicit) | **7 heads** |

Clear-before-want, same pass:

```
if (overlap4WQueued && !queuedParkedUpgrader && !queuedWithPrefix('Upgrader-'))
    overlap4WQueued = false
if (overlap4WQueued) refuse
```

Idle wipe (`:46`), clamp drop, `-14`/`-10` shred: flag clears, at
most **one** more 4W. Not one per producer pass.

`[4W,C,M] = 500`. Upgrader at `hardCap <= 550` is already exempt
from the 85% shrink (`:234–236`). Clamp will not turn this into a
3W that then looks “not parked.” Do not use `WORK < 5` as the
tiny test (cycle-14: a 4W is `< 5` forever).

Do **not** add burn to this path. Burn already rides the head-count
gate. Overlap target is **4 parked**, not `4 + burn`.

---

## Exact change (one file)

`rooms.spawning.ts` only. No `upgrader.ts`. No `carry.ts`.

1. **Census** (`:626–630`): still count every in-room 2W *and* 4W.
   Also skip `memory.overlapCull` so a same-tick in-place suicide
   is visible (Screeps `Game.creeps` is a tick-start snapshot).
   Do **not** skip 2W. Do **not** add a WORK check here.

2. **`add_creeps_to_spawn_list`** (`:478`): after
   `recycleTinyCarriers` (carriers only, leave it), call
   `cullOverlapShuttle(room)` **before** the census loop.

3. **RCL3 gate** (`:1433–1442`): existing `if` / `else if` stay.
   New `else if (overlapReplaceWanted(room, upgraders) && !danger &&
   sitesOk)` pushes `parkedUpgraderBody(room)` and sets the latch.
   `else if` so the head-count gate still owns the `heads < 4`
   replacement after extras die. Do not fire both in one pass.

4. **Helpers** next to `hasControllerDepot` (`:3405`).

`cullOverlapShuttle`:

- `hasControllerDepot` (standing, not site).
- Count heads / parked off `c.body` WORK, skip `suicide` and
  `overlapCull`.
- Fire only if `parked >= 1 && heads >= 7`.
- Victim: 2W (`WORK < 4`) with no `memory.controllerLink.x` first
  (overflow shuttle), else lowest `ticksToLive`.
- `victim.memory.overlapCull = 1` then `victim.suicide()`.
- **Never** `memory.suicide`. That is `upgrader.ts:344–347` →
  `recycle()` walk.

`overlapReplaceWanted`:

- Depot up. Clear stale latch. Refuse if latch, if any Upgrader
  already queued, if `parked >= 4`, if `upgraders >= 7`.
- `parked` = in-room `!suicide && !overlapCull` upgrader with
  `workFromBody >= 4`. Hatchling in the spawn is in-room and has
  4 WORK on `c.body`.

Leave `spawnrules[3].upgrade_creep.amount = 4`. Do not rewrite
living bodies. Do not touch RCL2.

---

## Timeline vs current 6→5→4 then first 4W

Current (KEEP):

1. Depot stands. Six 2W. Gate closed. Recipe already 4W. **No
   spawn.** Sink 10–12 e/t.
2. Death. 5. Still closed.
3. Death. 4. Still closed. Sink **8 e/t**.
4. Death. 3. `3 < 4`. One 500e 4W. Serial after that.

If the six were a wave, TTLs cluster → brief hole, then four 4W.
If staggered, a long **4×2W = 8 e/t** stretch. That is the control.

Overlap:

| pass | heads in | parked | action | sink (fed) |
| --- | ---: | ---: | --- | ---: |
| depot stands | 6 | 0 | queue 4W, latch | 10–12 |
| 4W #1 hatches (T+2) | 7 | 1 | cull 2W (`overlapCull`); census 6; queue #2 | 12–16 |
| 4W #2 hatches | 7 | 2 | same: cull + queue #3 | 14–16 |
| 4W #4 live | 6 | 4 | latch stays dark (`parked >= 4`) | **16** + 2 leftover 2W (~2) |

No hole. Temporary 7th head only while a 4W is hatching. Two
leftover 2W work until TTL 0 — we never cull down to 4 heads.
After they die, live `amount: 4` replaces 4W deaths as today.

Cull runs before census, so hatch T+2 is cull+queue in one pass.
If `Game.creeps` still lists the suicided 2W, `overlapCull` is
why that pass sees 6 not 7.

---

## Model Δ vs 6→5→4 then first 4W

135k at 12 e/t ≈ 11.3k t; at 8 ≈ 16.9k; at 16 ≈ 8.4k.

Staggered leftover TTL (mean remaining ~750): three deaths to
open the live gate ≈ **350–500 t** at 10–12, then a **4×2W = 8
e/t** tail of **500–1500 t** if the remaining four are young,
then trickle 4W. Overlap spends ~80 t + fill climbing 12→16 and
skips the 8 e/t tail.

| | RCL3→4 |
| --- | --- |
| Fed depot, `depotSink` holds 550 (`carry.ts:173`) | **−200…−800** (long 8 e/t tail → **−1k**) |
| Extra 500e HOL starves the park (4W shuttles at ~0.5) | **+0…+400** |
| Six already old at depot-complete (natural 4W soon) | ~0 (paid 2k e for a cutover that was free) |

Cost: 4 × 500e + 4 × 18 t serial HOL. `depotSink` already refuses
below `energyAvailable < 550`. Film the first 200 t after depot:
heads, WORK, `energyAvailable`, depot store, e/t. Abort the
hypothesis if the new 4W leave the park.

Do **not** model this against 6×4W or against extras-only cull.

---

## Failure modes (must not ship)

| mode | why it happens | this spec |
| --- | --- | --- |
| Cycle-7 walk | `memory.suicide` → `recycle()` | in-place `suicide()` only; never the flag |
| Extras-only at depot | cull with `parked == 0` | cull requires `parked >= 1` |
| Cycle-13 flood | stamp poke every pass | no stamp poke |
| `% 500` double-push | `spawn_list` not counted | latch + `queuedWithPrefix` |
| Hatchling looks tiny | `getActiveBodyparts == 0` | `c.body` WORK |
| 4W is “need more” forever | `WORK < 5` or ignore 2W in main census | parked = `WORK >= 4`; main census unchanged |
| 6×4W | `amount: 6` after depot | amount stays 4; overlap stops at 4 parked |
| 10 heads | ignore 2W, no cap | heads `< 7` on the want path |
| Stuck latch | queue wiped, flag stays | clear when no Upgrader queued |
| Clamp to 3W | 85% of 550 = 467 | existing Upgrader exempt |

---

## Fenced diff — **applied in src, not pushed**

Against `src/Rooms/rooms.spawning.ts`. Landed locally. Do not
`push-race`. Do not seed onto cycle-15.

```diff
--- a/src/Rooms/rooms.spawning.ts
+++ b/src/Rooms/rooms.spawning.ts
@@ -475,6 +475,7 @@ function recycleTinyCarriers(room): void {
 }
 
 function add_creeps_to_spawn_list(room, spawn) {
     recycleTinyCarriers(room);
+    cullOverlapShuttle(room);
 
     let EnergyMiners = 0;
@@ -624,8 +625,8 @@ function add_creeps_to_spawn_list(room, spawn) {
                 break;
 
             case "upgrader":
-                if(isInRoom(creep, room) && !creep.memory.suicide) {
+                if(isInRoom(creep, room) && !creep.memory.suicide && !creep.memory.overlapCull) {
                     upgraders ++;
                 }
                 break;
@@ -1440,6 +1441,14 @@ function add_creeps_to_spawn_list(room, spawn) {
                 room.memory.spawn_list.push(spawnrules[3].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                 console.log('Adding Upgrader to Spawn List: ' + name);
             }
+            else if(overlapReplaceWanted(room, upgraders) && !room.memory.danger && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 1500)) {
+                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
+                room.memory.spawn_list.push(parkedUpgraderBody(room), name, {memory: {role: 'upgrader'}});
+                room.memory.overlap4WQueued = true;
+                console.log('Adding overlap 4W Upgrader to Spawn List: ' + name);
+            }
             // After eco. Container decay is 50 hits/t (5000-tick life);
             // a 200e body must not HOL the depot builder or the parked 4W.
@@ -3403,6 +3412,80 @@ function hasControllerDepot(room): boolean {
         s.pos.findInRange(sources, 1).length == 0
     }).length > 0;
 }
+
+/** Body WORK, not getActiveBodyparts — a hatchling's active count is 0. */
+function workFromBody(creep): number {
+    let n = 0;
+    const body = creep.body || [];
+    for(let i = 0; i < body.length; i++) if(body[i].type == WORK) n++;
+    return n;
+}
+
+function queuedParkedUpgrader(room): boolean {
+    const q = room.memory.spawn_list || [];
+    for(let i = 0; i + 2 < q.length; i += 3) {
+        const name = q[i + 1];
+        const body = q[i];
+        if(typeof name !== "string" || name.indexOf("Upgrader") !== 0) continue;
+        let w = 0;
+        if(body) for(let j = 0; j < body.length; j++) if(body[j] == WORK) w++;
+        if(w >= 4) return true;
+    }
+    return false;
+}
+
+/**
+ * Roster D. After a parked 4W is live, drop one leftover 2W so heads
+ * return to 6 and the next 4W can queue. Never cull at parked==0
+ * (cycle-7 extras-only). Never memory.suicide (recycle-walk).
+ */
+function cullOverlapShuttle(room): void {
+    if(!room.controller || room.controller.level !== 3) return;
+    if(!hasControllerDepot(room)) return;
+    let parked = 0, heads = 0;
+    let victim: any = null;
+    let victimTtl = 9999;
+    let victimUnparked = false;
+    for(const name in Game.creeps) {
+        const c: any = Game.creeps[name];
+        if(!c || c.memory.role !== "upgrader") continue;
+        if(!isInRoom(c, room) || c.memory.suicide || c.memory.overlapCull) continue;
+        heads++;
+        if(workFromBody(c) >= 4) { parked++; continue; }
+        if(c.spawning) continue;
+        const unparked = !(c.memory.controllerLink && c.memory.controllerLink.x !== undefined);
+        const ttl = c.ticksToLive || 0;
+        if(!victim || (unparked && !victimUnparked) || (unparked == victimUnparked && ttl < victimTtl)) {
+            victim = c;
+            victimTtl = ttl;
+            victimUnparked = unparked;
+        }
+    }
+    if(parked >= 1 && heads >= 7 && heads > 4 && victim) {
+        victim.memory.overlapCull = 1;
+        victim.suicide();
+    }
+}
+
+/** One in-flight 4W while 2W still work. Not a lastSpawn poke. */
+function overlapReplaceWanted(room, upgraders: number): boolean {
+    if(!room.controller || room.controller.level !== 3) return false;
+    if(!hasControllerDepot(room)) return false;
+    if(room.memory.overlap4WQueued && !queuedParkedUpgrader(room) && !queuedWithPrefix(room, "Upgrader-")) {
+        room.memory.overlap4WQueued = false;
+    }
+    if(room.memory.overlap4WQueued) return false;
+    if(queuedParkedUpgrader(room) || queuedWithPrefix(room, "Upgrader-")) return false;
+    let parked = 0;
+    for(const name in Game.creeps) {
+        const c: any = Game.creeps[name];
+        if(!c || c.memory.role !== "upgrader") continue;
+        if(!isInRoom(c, room) || c.memory.suicide || c.memory.overlapCull) continue;
+        if(workFromBody(c) >= 4) parked++;
+    }
+    if(parked >= 4) return false;
+    if(upgraders >= 7) return false;
+    return true;
+}
```

---

## What not to bundle

- Recycle-walk / extras-only at depot (roster B, cycle-7). Dead.
- Nuke-all-2W the depot tick (roster C). Later; sign-flips if leftover TTL `< ~300`.
- RCL3 `amount: 6` (roster E). 24 e/t on 20 income.
- Hold RCL3 at 2 until depot (SURFACE #4). Inert on 6W.
- Leftover-5, RCL3 roads, 5W lastSpawn / clamp skip, haul-2.
- Counting `spawn_list` in the **main** census. Separate bug.
- `upgrader.ts` park / recycle. Role already parks 2W and 4W the same.

## Order

After-15 ranks **5W clamp skip** first if cycle-15 KEEP (so later
income knobs measure 10 e/t, not 8). This spec is the next
**roster** knob. If 15 SEND BACK, start here.

1. Wait RCL4 8/8 on 15. Do not mid-race push.
2. Clean seed (`_clean-world.md`).
3. Film one KEEP finisher: heads, WORK, depot tick, e/t. Confirm
   6→4 shuttles before the first 4W.
4. Race this diff vs that KEEP. One knob.
5. Watch: `overlap4W` log once per replacement (≤4), miner count
   still 2/source, no 8+ upgraders, no recycle walks off the
   controller.

In-flight races stay on live A.
