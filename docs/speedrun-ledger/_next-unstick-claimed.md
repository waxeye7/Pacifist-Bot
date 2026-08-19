# Next — unstick `claimed` after N ticks spawnless

Read-only. **Do not implement now. Do not edit `src`. Do not `push-main`.**
Do **not** unclaim **E36N57**. Do not unclaim E35N59 / E39N58 this pass.

One knob. Not a race A/B. Not the foreign-spawn skip (`_live-spawn-block.md`).
Not the CB retarget (`_next-claim-bootstrap.md`). Not pack adopt
(`_next-adopt-plans.md`).

The knob is a **tighter `claimed` timer**: if the ExpandState room is still
`FIND_MY_SPAWNS === 0` after **N** ticks in `claimed`, `finish()`. Then
**do not pick another name** while any owned room is spawnless.

`N = 8000`. That is the one tunable.

---

## Live miss

| poll | `Memory.autoExpand` | how long |
| --- | --- | --- |
| `_status-tree.md` tick **82270524** | `{ room: E39N58, spawnPos: 23,27, phase: "claimed", since: 82251460 }` | **~19k** |
| `_status-tree.md` / `_status-empire.md` tick **82277481** | `{ room: E35N59, spawnPos: 28,20, phase: "claimed", since: 82272940 }` | **~4.5k** |

`PHASE_TIMEOUT` **20000** (`AutoExpand.ts:55`, `:457-466`) fired on E39N58
around tick **82271460**. `finish` / the abort path deleted the state and
cleared `target_colonise`. `CHECK_EVERY` 50 then `pick()`ed the next still-
unowned pack name. That was E35N59. Same `claimed` wait, new brick.

Both rooms still owned, still spawnless:

| Room | RCL | DG | Our spawn | Creeps | Leftover |
| --- | ---: | ---: | --- | ---: | --- |
| **E39N58** | 2 | ~3.5k | none · pack tile **23,27** empty | 0 | **Zhaban** Spawn1 **32,17** + 16 foreign sites |
| **E35N59** | 2 p=600 | ~6.1k | none · pack tile **28,20** empty | 1 CB | **Enrique** Spawn1 **25,10** |
| **E36N57** | 3 | full | **KEEP** Spawn5 21,27 | 19 | none |

`features.placeFromPlan` is **false**. Live pack (`push-live-expansion.mjs`)
writes segment 86 with **`seg` omitted** — no 80–85 payloads.

---

## Why `claimed` does not leave

`advance` `claimed` (`:487-501`) has three exits:

1. `!controller.my` → back to `claiming` (re-claim the brick).
2. `FIND_MY_SPAWNS.length` → `spawned` (adopt, `finish`).
3. else every 10t: `armColonise` + `ensureSpawnSite`. No other exit.

`FIND_HOSTILE_SPAWNS` is **not ours**, so (2) never happens on a leftover.
Engine cap is **our** structures (`PlanV2.ts:2125-2133`) — a site on the
empty pack tile is legal. The machine still waits for a **finished** MY
spawn. Nobody finishes it:

- E39N58: colonise pointer moved on after the 20k abort. 0 creeps.
- E35N59: 1 CB. RCL2 `ticksToDowngrade` ~6.1k. `buildcontainer.ts:147`
  walks to the controller whenever `!buildTheSpawnFirst` and DG `< 6000`.
  `buildTheSpawnFirst` is true only if a **MY spawn site** exists. No site
  ⇒ the CB upgrades, never builds, `claimed` never advances.

`hasVisibleForeignSpawn` (`:148-151`) already skips in `pick()` — **inert
without vision**. Official pack is trusted. Claimer walks in, we own it,
then we see Enrique/Zhaban. Too late.

---

## Why `packAdopt` is not the unstick

`runPackAdoption` (`:348-455`) is a **segment cursor**, not an arming flag.
It does not read `Memory.autoExpand`. It does not call `finish`. It does
not site a spawn. It writes `room.memory.planV2` if segments 80–86 carry
that room.

Walk:

1. every 25t, first owned room with no `planV2` and no fresh `planPackMiss`
2. read 86 for a named `seg`, else sweep 80–85 one tick each
3. hit → `adoptPacked`; miss → `planPackMiss = now`, retry in **3000** t
4. cursor itself dies at **`ADOPT_TIMEOUT` 200**

Live: pack has no per-room payloads, so every spawnless official room
misses, backs off 3000t, repeats. `placeFromPlan` is off anyway —
construction would not enter `placeFromPlanV2`.

So packAdopt can sit next to a brick for tens of thousands of ticks and
the ExpandState stays `claimed`. Delete `Memory.packAdopt` and the next
scan rebuilds it. Wrong lever.

---

## Why `PHASE_TIMEOUT` 20k is not the knob

It already ran. That is how the pointer **slid** E39N58 → E35N59.

- Bound is all phases, including `claiming` (claimer window is
  `Game.time % 800 <= 100` plus a ≤7-room walk — 20k is the right
  give-up there).
- Abort deletes `autoExpand` + `target_colonise` and **does not hold
  the queue**. `blockedReason` only sees `st`. No `st` ⇒ `pick()` the
  next pack neighbour. GCL is still ahead (`rooms.ts` `CanClaimRemote
  = GCL − owned`).
- 20k is longer than RCL2 downgrade (10k). E39N58 sat almost two RCL2
  DG cycles in `claimed` before the slide.

A shorter global timeout would abort a live claimer. The bound that is
wrong is **`claimed` + spawnless only**.

---

## Exact change

File: `src/Managers/AutoExpand.ts` only. ~20 lines. Do not touch
PlanV2, spawning, observe, WallClearer, `buildcontainer`.

```ts
/** claimed + no MY spawn this long → finish(). One tunable. */
const CLAIMED_SPAWNLESS = 8000;
```

Next to `PHASE_TIMEOUT` (`:55`). Leave 20k for `picking` / `claiming` /
`spawned`.

### 1. Fire in `claimed`, not at the top of `advance`

`PHASE_TIMEOUT` sits above the switch (`:457`) and would still win at
20k. Put the tighter test **in the `claimed` case**, before
`armColonise` / `ensureSpawnSite`:

```ts
case "claimed":
  if (!mine) {
    setPhase(st, "claiming");
    return;
  }
  if (hasSpawn) {
    setPhase(st, "spawned");
    return;
  }
  if (Game.time - st.since > CLAIMED_SPAWNLESS) {
    finish(st, `ABORT — claimed still spawnless after ${CLAIMED_SPAWNLESS}t`);
    return;
  }
  armColonise(st);
  ensureSpawnSite(st, room as Room);
  return;
```

`finish` (`:194-198`) already clears `target_colonise` for this room and
`delete`s `autoExpand`. That is the unstick: CB dispatch is no longer
nailed to the brick (`rooms.spawning.ts:2523-2548` reads only that
name). Do not unclaim.

`since` is set by `setPhase` when we entered `claimed`. Do not reset it
on `armColonise`. Missing `since` → `NaN > N` is false → forever; if a
hand-written `Memory.autoExpand` has no `since`, treat that as `started`
or `Game.time - N` so the first pass can fire.

### 2. Hold the queue or the timer only slides faster

Same file, `blockedReason()` (`:86-97`), after the GCL / bucket / RCL3
checks, **before** the existing `st` check:

```ts
function spawnlessOwned(): boolean {
  return ownedRooms().some((r) => r.find(FIND_MY_SPAWNS).length === 0);
}

if (spawnlessOwned())
  return "spawnless owned room — bootstrap before next claim";
```

Without this, `CHECK_EVERY` `pick()`s the next leftover the same way
20k already did. With it, E39N58 / E35N59 / site-only RCL1 hold the
queue until a **MY** spawn stands or the room DGs off `ownedRooms()`.
Legitimate slow bootstrap also blocks — wanted.

`autoExpand()` console uses `blockedReason()` — same gate.
`runPackAdoption` stays independent.

`spawnlessOwned` is also site 3 of `_live-spawn-block.md`. Ship it
**once**, in this commit or that one, not twice. The N-tick `finish` is
the new piece. Shipping (1) without (2) is the current bug with a
shorter fuse.

### Why 8000

Spawn is 15 000 energy. Mother CB is `getBody([W,C,M], room, 24)` —
8 WORK, 375 ticks of build once they arrive (`rooms.spawning.ts:2543-2548`).
Claimer window + ≤7-room walk + fill ≈ 1–2.5k for a healthy colony.

| N | |
| ---: | --- |
| **8000** | ~3× a real bootstrap. Still inside RCL2 DG (10k). |
| 5000 | would have unstuck E39N58 before the slide; aborts a broke-mother wait. |
| 20000 | live value. Sat out a DG and claimed E35N59. |

Do not key the abort on site progress. User-facing predicate is
**spawnless**, not “site stalled”. A MY spawn site with a CB in the
room finishes in hundreds of ticks; if it has not by 8k the room is a
brick.

---

## Do not bundle

- Foreign-spawn skip / immediate abort (`_live-spawn-block.md` `hasForeignSpawn`,
  pack filter `type === "spawn"`). Different predicate (vision now vs
  time later). This knob is the fallback when pick had no vision.
- CB destination = finishable spawn-site room (`_next-claim-bootstrap.md`).
  After this knob `finish`es, that one can feed extras. Not this patch.
- Exempt spawn sites from the 25k 0-creep janitor (`rooms.ts:407-413`).
- `packAdopt` timeouts, `ADOPT_MISS_BACKOFF`, force-adopt, `placeFromPlan`.
- Attack / dismantle Zhaban or Enrique. Combat, not this knob.
- `claimRemotes`, WallClearer, `CanClaimRemote`.
- Lower `PHASE_TIMEOUT` for `claiming`.
- Unclaim anyone. **Especially not E36N57.**
- `push-main` / `push-race` / mid-race push.

---

## Console now (not the knob)

```
stopExpand()
Memory.features.autoExpand = false
```

Leave E36N57. Leave E35N59 / E39N58 unless attacking the leftover spawn.
They are dead GCL slots until DG or combat. Do not `SC` them — AutoExpand
is what overwrites `target_colonise`, and a CB there still cannot finish
a MY spawn next to a leftover.

---

## Pass / fail

After the knob (once pushed, not now):

- `claimed` + no MY spawn for **> N** ticks → `Memory.autoExpand` gone,
  `target_colonise` not that room, log `ABORT — claimed still spawnless`.
- `autoExpandStatus()` idle and blocked `spawnless owned room — bootstrap
  before next claim` while E35N59 / E39N58 (or any extra RCL1) is still
  ours and spawnless.
- Next pack neighbour is **not** claimed.
- `packAdopt` still walks unplanned owned rooms on its own 25 / 200 / 3000
  clocks. Unaffected.
- E36N57 still owned, still has its spawn.

Fail: pointer sits in `claimed` past N (timer not hit, or `since` is
`NaN`); or it `finish`es and the next poll shows a **new** `claimed`
room (hold missing); or anyone is unclaimed by this change.
