# Next A/B — HOL `length*100` still turns `[5W,M]` into 4W

Read-only. **No src. No `push-race`.** Cycle-15
(`run-2026-08-15T23-57-10Z`, `fiveWQueued`) is live. Latch held (2
miners/source) but every cand hatch is **4W** (`_cycle15-snap.md`).

Metric: mean ticks spawn→RCL4. One knob. Do not bundle leftover-5,
6W shuttle `amount`, haul MAX, roads, or boxes.

Sister notes: `_next-5w-clamp.md` (85% budget), `_next-5w-latch.md`
(flood). This is the remaining shrink after a clamp skip, and the
math that makes leftover-5 *always* fail the HOL bar.

---

## Exact sites (`rooms.spawning.ts`)

| what | lines | now |
| --- | --- | --- |
| producer → clamp same pass | `:124` then `:146–147` | `spawnFirstInLine` **first**; clamp only on a producer pass |
| `clampSpawnListToCapacity` | `:168–300` | routine budget `floor(hardCap*0.85)` `:230` |
| dirty clamp skip (WC, **not** in race) | `:208–219` | `continue` on home `[5W,M]` cost 550 |
| Upgrader 550 exempt (live) | `:234–236` | miner is not on this list |
| `ROUTINE_SPAWN_PREFIXES` | `:311–314` | `EnergyMiner` is routine → 85% |
| `shrinkQueuedBody` EnergyMiner | `:389–411` | drop WORK while `WORK>2`; floor `[2W,M]` |
| HOL shrink | `:3027–3037` | `mayShrinkHead` (`stall>40` + `lastShrink>40`) |
| EnergyMiner HOL predicate | `:3029` | `energyAvailable < body.length * 100 && length > 3` |
| RCL1–3 interleave | `:3076–3077` | every **10**t, spends the 550 fill |
| `getBody` | `:3590–3628` | unused on the 550 rung; 85% + oversize-segment |
| latch `fiveWQueued` | `:4263–4275` | zeros `lastSpawn` once |
| home 550 body | `:4340–4356` | hardcoded `[5W,M]`; `lastSpawn=T`; `fiveWQueued=true` `:4355` |
| cap `<550` | `:4358` | `getBody([2W,M], 6)` — not this bug |

`energyMiner.ts` does **not** size the body. `[5W,M]` has 0 CARRY →
drop-mine (`:246–277`). Harvest is 2e/WORK. 5W = **10 e/t** (source
cap). 4W = **8 e/t**. That is the whole clock.

`depotSink` (`carry.ts:170–173`) holds a 550 spawn floor at **RCL3
only**. Slam-5 + the overlap 5W fire on **RCL2**. No floor.

---

## Why `550 < 600`

```
[WORK,WORK,WORK,WORK,WORK,MOVE]
  5×100 + 50 = 550          // true spawn cost
  length 6 × 100 = 600      // HOL heuristic
```

HOL assumes every part is a WORK. MOVE is 50. The bar is **50 over**
the body and **50 over leftover-5 cap**.

Leftover-5: spawn 300 + 5×50 = **cap 550**. `energyAvailable` is
capped at 550. `550 < 600` is **always true**. The HOL EnergyMiner
clause can never go false at this cap, even on a full network.

HOL only *runs* on `-6` (`energyAvailable < 550`). Full 550 hatches.
The live stall is 300–549 for >40t: RCL≤3 interleave every 10t buys
300e builders / 450e shuttles out of the 550 the head is waiting for.
`mayShrinkHead` then drops one WORK / 40t: **5W → 4W → 3W → 2W**.

Changing the bar to `bodyCost` (`energyAvailable < 550`) does **not**
save it. 400 < 550 still shrinks. The head fits **cap**; it is waiting
for **fill**. Shrink is the wrong relief.

---

## Two shrinks, same 4W

**Clamp (live cycle-15).** `EnergyMiner` is routine. `floor(550*0.85)
= 467`. Producer unshifts 550; clamp same pass (`:147`) walks
`shrinkQueuedBody` until `cost <= 467` → one WORK → `[4W,M]=450`.
Log: `clamped EnergyMiner-… from 550 to 450`. Film: 8/8 cand are 4W
(`_cycle15-snap.md`). Latch then treats that 4W as “the 5W.”

Dirty WC already skips this at `:208–219`. **Not in the watching
race.**

**HOL (still live after that skip).** Clamp skip leaves a 550 head.
`-6` for 40t → `:3029` is true because `available < 600` at every
leftover-5 tick → same `shrinkQueuedBody` → 4W. Clamp skip without
HOL skip is a **40-tick delay before the same 4W**.

`getBody` is not on this path. Do not touch it.

---

## Wait-for-600 vs force 5W at 550

**Wait `energyAvailable >= 600` (“one more ext”).** Impossible at
leftover-5. Max available is 550. A gate on the 550 rung falls
through to `getBody([2W,M])` (`:4358`) and **never queues a 5W**.
Waiting for cap 600 is a 6th extension — leftover-5 leak, 3k on the
45k/135k, and the 10 e/t rung slam-5 paid 15k for stays locked.
Not a knob. Do not do this.

**Queue only when `energyAvailable >= 550`.** Same-pass clamp still
cuts 550 → 450 (`550 > 467`) unless the clamp skip ships too. Gate
alone is a no-op. Even with the skip, latch+1500 fire on a 300–549
tick and you either fall through to 2W or skip the write of
`fiveWQueued`. Worse than leaving the body queued.

**Force 5W at 550.** Keep the hardcoded body. Wait for
`energyAvailable >= 550` (true cost). Do not shrink while the
network is short. `depotSink` already aims at this floor on RCL3;
RCL2 has to wait on income + interleave cooldown.

---

## Ranked

| rank | option | hatches 5W at leftover-5? |
| --- | --- | --- |
| **1** | **exempt-HOL** (home `[5W,M]` that already fits cap) | **yes**, if clamp also skips |
| 2 | exempt-clamp-only | **no** — HOL 4W after 40t `-6` |
| 3 | wait-for-600 | **no** — cap 550 never reaches 600; fall-through is 2W |

**Ship 1 + the dirty clamp skip as one knob.** Neither half works
alone: clamp-only dies at HOL; HOL-only never sees a 5W (live clamp
already made 4W). Shared predicate below. Do not race them
separately.

Model vs cycle-15 latch-4W (same as `_next-5w-clamp.md`): after the
leftover 2W dies, **8 vs 10 e/t** for the rest of that life (~1500t)
≈ 6k ≈ **375t** on the 135k. RCL2→3 **−100…−400**, RCL3→4 **−50…−200**.
Does not raise the shuttle sink.

---

## One-knob patch (do **not** apply)

Against current `src/Rooms/rooms.spawning.ts`. Replaces the dirty
inline skip at `:208–219` with a helper both rungs use. Cycle-15 is
watching — leave the tree, do not push.

Does **not** change: leftover-5 / `extensionTake`, `amount: 6` after
550, `MAX_HOME_CARRIERS_PER_SOURCE`, roads, boxes, `getBody`, the
550 producer, `fiveWQueued`.

```diff
--- a/src/Rooms/rooms.spawning.ts
+++ b/src/Rooms/rooms.spawning.ts
@@ -205,18 +205,10 @@ function clampSpawnListToCapacity(room) {
         if(!body || !body.length) continue;
         let name:string = room.memory.spawn_list[i+1];
 
-        // 85% of 550 is 467 and strips a WORK off the home 550 [5W,M].
-        // Cycle-14 hatched 4W so WORK>=5 never counted. Wait for full cap.
-        if(name && name.startsWith("EnergyMiner") && hardCap >= 550 && body.length === 6) {
-            let homeMem:any = room.memory.spawn_list[i+2];
-            homeMem = homeMem && homeMem.memory;
-            if((!homeMem || !homeMem.targetRoom || homeMem.targetRoom === room.name)
-                && bodyCost(body) === 550
-                && _.filter(body, (p:any) => p === WORK).length === 5
-                && _.filter(body, (p:any) => p === MOVE).length === 1) {
-                continue;
-            }
+        // Home [5W,M] already fits leftover-5 cap. 85% of 550 is 467.
+        // Wait for energyAvailable >= 550; do not strip a WORK.
+        if(isHomeFiveWMiner(room, name, body, room.memory.spawn_list[i+2])) {
+            continue;
         }
 
         // ROUTINE creeps are budgeted at 85% of capacity, not 100%. A body
@@ -302,6 +294,26 @@ function bodyCost(body:string[]):number {
     return _.sum(body, (part:any) => BODYPART_COST[part]);
 }
 
+/** Home leftover-5 miner. Fits cap (550); HOL length*100 thinks it costs 600. */
+function isHomeFiveWMiner(room, name:string, body:string[], opts?:any):boolean {
+    if(!name || !name.startsWith("EnergyMiner") || !body || body.length !== 6) return false;
+    if(room.energyCapacityAvailable < 550) return false;
+    if(bodyCost(body) !== 550) return false;
+    let work = 0, move = 0;
+    for(let i = 0; i < body.length; i++) {
+        if(body[i] === WORK) work++;
+        else if(body[i] === MOVE) move++;
+    }
+    if(work !== 5 || move !== 1) return false;
+    const mem = opts && opts.memory;
+    if(mem && mem.targetRoom && mem.targetRoom !== room.name) return false;
+    return true;
+}
+
 /**
  * Names of the economy roles this room re-queues on its own every cycle. These
@@ -3026,7 +3039,9 @@ function spawnFirstInLine(room, spawn) {
                 }
                 else if(mayShrinkHead && (
                 room.memory.spawn_list[1].startsWith("Carrier") && room.energyAvailable < room.memory.spawn_list[0].length * 50 && room.memory.spawn_list[0].length > 3 ||
-                room.memory.spawn_list[1].startsWith("EnergyMiner") && room.energyAvailable < room.memory.spawn_list[0].length * 100  && room.memory.spawn_list[0].length > 3 ||
+                room.memory.spawn_list[1].startsWith("EnergyMiner")
+                    && !isHomeFiveWMiner(room, room.memory.spawn_list[1], room.memory.spawn_list[0], room.memory.spawn_list[2])
+                    && room.energyAvailable < room.memory.spawn_list[0].length * 100  && room.memory.spawn_list[0].length > 3 ||
                 room.memory.spawn_list[1].startsWith("Reserver") && room.memory.spawn_list[0].length > 2)) {
                     // NOT .shift(): that stripped parts off the FRONT of the
                     // body and produced miners with no WORK and reservers with
```

Against committed HEAD (no dirty skip): same helper + same HOL
guard, and insert the `if(isHomeFiveWMiner) continue;` at `:208`
before the 85% budget. Do not invent a second race.

Watch next seed for `clamped EnergyMiner from 550 to 450` (must
die) and `shrinking stalled head EnergyMiner` on a 550 body (must
die). Hatch WORK=5. `fiveWQueued` still one extra.

---

## What not to bundle

- `fiveWQueued` / `lastSpawn=0` — flood latch; keep.
- `getBody` 85% / oversize-segment — unused here.
- HOL `length*100` → `bodyCost` for every miner — broader; still
  shrinks a 550 head sitting at 400.
- Queue gate `energyAvailable >= 550` or `>= 600` — no-op or 2W
  fall-through.
- Cap 750 `[2M,6W,M]`, leftover-5, amount-6, haul MAX, roads, boxes.

Race **latch+4W vs latch+real 5W**. Not vs cycle-13 flood. Not on
the watching run.
