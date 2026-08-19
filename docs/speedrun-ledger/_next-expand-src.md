# Src — claimed spawnless abort + hold queue

2026-08-16. **Src only. Not a live push.** Did not run `push-race` / `push-main` /
`git push`. Did not unclaim **E36N57**. Did not touch `rooms.spawning`
`claimRemotes`.

Implements `_next-unstick-claimed.md`. File: `src/Managers/AutoExpand.ts`.

---

## Already in src — left alone

`hasVisibleForeignSpawn` (`:157-161`) + `pick()` skip (`:230-233`) were already
here. Vision && `FIND_HOSTILE_SPAWNS`; no vision → false (trust pack); `continue`
to next pack name; all-skip deletes `autoExpand`. Not rewritten.

Hole from `_review-expand-skip.md` still stands: skip is pick-only, misses
unowned leftovers (`user` undefined). This pass is the time-based fallback,
not that predicate change.

---

## What changed

### 1. `CLAIMED_SPAWNLESS = 8000` (`:56-57`)

Next to `PHASE_TIMEOUT` 20k (`:55`). 20k stays for `picking` / `claiming` /
`spawned`. The tighter bound is **`claimed` + spawnless only**.

### 2. Fire in `claimed`, not at the top of `advance` (`:497-525`)

After `!mine` → `claiming` and `hasSpawn` → `spawned`, before
`armColonise` / `ensureSpawnSite`:

```
claimedSince = st.since (number) || st.started (number) || Game.time - 8000
if (Game.time - claimedSince >= 8000)
  finish(st, "ABORT — claimed still spawnless after 8000t")
```

`finish` (`:204-208`) already clears `target_colonise` for this room and
`delete`s `autoExpand`. Does **not** unclaim. `since` is set by `setPhase`
on entry; `armColonise` does not reset it. Missing `since` on a hand-written
state uses `started`, else treats as already expired (`>=` so
`Game.time - 8000` fires on the first pass — `NaN > N` would sit forever).

### 3. `spawnlessOwned` + `blockedReason` hold (`:87-90`, `:101-103`)

```
function spawnlessOwned(): boolean {
  return ownedRooms().some((r) => r.find(FIND_MY_SPAWNS).length === 0);
}
```

Called after GCL / bucket / RCL3, **before** the existing `st` check.
Returns `"spawnless owned room — bootstrap before next claim"`.

Site-only RCL1 counts: `FIND_MY_SPAWNS` is finished MY spawn only. Without
this, `CHECK_EVERY` 50 + `pick()` would claim the next leftover the same
way 20k already did (E39N58 → E35N59). `autoExpand()` console uses the
same gate. `runPackAdoption` is independent.

---

## Why E36N57 is untouched

No unclaim path in this file. `finish` only clears Memory (`autoExpand` +
matching `target_colonise`). E36N57 is owned, has **our** spawn (21,27), so
`spawnlessOwned` is not about that room — other spawnless extras hold the
queue; E36N57 stays owned and spawning. No `Game.rooms.E36N57` write, no
`unclaim`, no `SC`.

## Why this is not a live push

Edit is local src. Deploy (`npm run push-race` / `push-main` / `git push`)
was not run. Shard3 / VPS still on whatever was last pushed. Operator
`stopExpand()` + `features.autoExpand = false` still the live hold until
a deliberate main push.

---

## Not this pass

- Rewrite `hasVisibleForeignSpawn` → `FIND_STRUCTURES && !my`
- Abort `claiming`/`claimed` on visible foreign spawn
- Pack filter `type === "spawn"` (`push-live-expansion.mjs`)
- CB retarget / `claimRemotes` / PlanV2 / WallClearer
- Unclaim anyone
