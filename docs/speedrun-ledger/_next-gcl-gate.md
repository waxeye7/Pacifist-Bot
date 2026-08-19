# GCL / owned gate — 9th room on the bench

Read-only. **Did not edit `src`. Did not `push-race` / `push-main` / `git push`.**

Question: local race is **8 rooms per user**. With **GCL 4 and 8 owned**, does AutoExpand `pick()` a 9th (off-bench leftover in segment 86)?

**No. `pick()` is dead.**

---

## Gate (the only one)

`src/Managers/AutoExpand.ts` `blockedReason` `:93-107`:

```
owned = ownedRooms()                    // Game.rooms + controller.my
if (Game.gcl.level <= owned.length)
  return "GCL ${gcl} <= ${n} owned rooms (no free claim)"
```

Then bucket, RCL3+, `spawnlessOwned`, already-expanding.

Idle arm in `runAutoExpand` `:543-554`:

```
if (!st) {
  if (Game.time % 50 !== 0) return
  if (blockedReason()) return           // never writes Memory.autoExpand
  m.autoExpand = { phase: "picking", … }
  return                                // pick() is next tick, via advance
}
advance(st)
```

Console `autoExpand()` `:562-576` uses the same `blockedReason()`.

`pick()` `:218-248` does **not** re-check GCL. It only runs from `advance` while `Memory.autoExpand.phase === "picking"`. No state ⇒ no `pick()`.

---

## GCL 4 + 8 owned

Race accounts are GCL **17 000 000** (`CONTROL.md` §2) = **`Game.gcl.level === 4`**. Seed places the 8-pair. `4 <= 8` is true.

| owned | `GCL 4 <= n` | idle `pick()` |
| ---: | --- | --- |
| 1–3 | false | can arm (other gates) |
| **4** | **true** | **dead** |
| **8** | **true** | **dead** |

The 8-room server cap is not consulted. The bot keys off **GCL**, not 8. So it would already stop at **4** owned if it were claiming from a small empire. After a bench seed it starts at 8 and never arms.

A 9th claim is not attempted. Status string if you poke it:

`autoExpand blocked: GCL 4 <= 8 owned rooms (no free claim)`

---

## What still runs (not a claim)

`runPackAdoption` `:535-540` is **before** the feature/GCL gate. Adoption only. No `pick()`, no `armColonise`, no claimer.

`rooms.ts` `:426-431` every 300t:

`CanClaimRemote = GCL > roomsIController ? GCL - roomsIController : 0`

At 4 / 8 that is **0**. Observer WallClearer and `claimRemotes` both need `CanClaimRemote >= 1` (remotes also need `features.claimRemotes === true`).

---

## Only way `pick()` still fires

`blockedReason` is **not** re-checked once `Memory.autoExpand` exists. A leftover `phase: "picking"` skips the GCL test and `pick()` walks segment 86.

That state is wiped on seed (`seed-clean.mjs` / `_scrub-racer-mem.mjs` delete `autoExpand` + `target_colonise`). `finish` / `PHASE_TIMEOUT` / `stopExpand()` also delete it; the next 50t check then dies on GCL.

In-flight `claiming` / `claimed` can still `armColonise` (forces `CanClaimRemote = 1` if `< 1`). Not a new pick. Kill with `stopExpand()` if one is sitting.

Vision hole: `ownedRooms()` only counts **visible** `controller.my`. Bench seed rooms have a spawn → visible → 8. Blind owned rooms would undercount and could arm; not the 8-pair.

`skipHighRcl` undercounts `roomsIController` (skips RCL6+), not `ownedRooms()`. Bench is RCL1–4.

---

## Not this note

No src change. No live push. No unclaim. No pack rewrite. Feature `autoExpand` default is unset (= on); the GCL gate is what holds, not the feature flag.
