# Next seed — after cycle-15

**Do not run this now.** Cycle-15 (`run-2026-08-15T23-57-10Z`, `cycle-15-5w-latch`) is live. Wait RCL4 8/8 / watch `exitReason`. Then seed. No `push-race`. No `server:local:reset`. No `--run` of the live ledger.

Set `1f90aub`. `--swap` stays on (every cycle 1–15). New ledger every seed.

---

## Exact command (after 15 is called)

**If 15 KEEP** (`_next-after-15.md` #1, clamp skip already in src):

```
fnm exec --using 22 node tools/server/seed-clean.mjs --label cycle-16-5w-clamp --tick-budget 40000 --note "skip 85% clamp for home [5W,M] that already fits cap; latch held on 15"
```

**If 15 SEND BACK** (drop #1, start at roster D):

```
fnm exec --using 22 node tools/server/seed-clean.mjs --label cycle-16-rcl3-overlap-4w --tick-budget 40000 --note "roster D overlap-replace parked 4W"
```

Fills `--seed --wipe --yes --swap --force`. Pushes **pacifist only**. Refuses if a ledger is still watching (override `--replace-live`, do not use that while 15 is live).

Then:

```
fnm exec --using 22 node tools/server/race.mjs --watch --run <new-runId> --interval 15
```

Do **not**:

- `--run run-2026-08-15T23-57-10Z`
- `npm run push-race`
- `server:local:reset`
- `_wipe-bench.js` (deletes owned controllers)
- unclaim E36N57 / SSH VPS

Expect census `seeded-live 16/16`. Abort if any room is `owner=-` or `roads>0` after seed.

---

## What failed before

### Cycle-5 (`run-2026-08-15T12-13-10Z`)

`race.mjs --wipe` only deletes `user ∈ {pacifist1, pacifist-race}` and resets the controller. **`user: null` stays.**

| miss | rooms | evidence |
| --- | --- | --- |
| wipe skipped as foreign (`owned by a non-benchmark user`) | 5: E12S1 E13S7 E16S9 E3S5 E6S1 | `_wipe-five.js` / `_who-foreign.js` |
| leftover roads on spawn tiles | E5S3 (24,30), E8S5 (24,9), E4S7 (30,32) | `seedError`: `something already sits at …: road` |
| leftover planner boxes (the 24512 dirt) | E5S3 (40,42), E12S3 (18,30) | `_clean-world.md` |

Manual recover: `_wipe-five.js` then `_scrub-three.js` then `race.mjs --force`. `_wipe-five` only deletes racer-owned objects — it does **not** clear the foreign user that made `--wipe` skip. `_scrub-three` (all non-source/mineral/controller) is what actually frees a tile.

### Cycle-11 (`run-2026-08-15T20-46-12Z`)

14/16 first pass failed. Every `seedError` is a **border walker**:

`creep@0,27` / `@40,0` / `@22,49` / `@49,19` — other users’ creeps on the room edge. `spawn-in.mjs` refuses any `user != null`. `race.mjs --wipe` treats that creep as “non-benchmark user” and **skips the room** (does not even reset the controller).

B8 (E13S7 / E21S4) seeded on the first pass. A later `--wipe --run` reset those controllers to 0, then `race.mjs:1224` saw `seedOk` and **skipped B8**. Entries later show `seedTick` 4593959 vs first-pass event ticks 4592956/4592983 — ~1k ticks unowned.

### Leftover Memory.rooms `rclTimes.8`

`--wipe` never touches Redis. E4S7 once ran with `planV2` + `rclTimes.8: 3121322` (`_NEXT-RACE.md` §0). `_scrub-racer-mem.mjs` deletes the 16 `Memory.rooms` keys and zeros `Memory.speedrun`. Parse fail used to `continue` and leave that dirt.

### Wipe deleting controllers

`_wipe-bench.js` is `deleteMany({ room, user ∈ racers+p2+waxeye })` with **no `type ≠ controller`**. Owned controllers vanish. Recover is `_restore-bench-ctrls.js` (BENCHMARK xy). `race.mjs --wipe` and `_reset-bench-ctrls.js` update in place. Do not call `_wipe-bench.js`.

---

## Gaps in `seed-clean.mjs` (and what changed)

Used. Not in `package.json`. Was already the right wrapper; it missed neighbors, restore, seedOk, and a census.

| gap | where | now |
| --- | --- | --- |
| leftover roads / foreign structs | `race.mjs --wipe` leaves `user: null` | `_scrub-bench-objects.js` on all 16 (replaces `_wipe-five` + `_scrub-three`) |
| walkers in the 16 | `_del-walkers.js` ran once, early | still first; **again immediately before** `race.mjs` |
| walkers in adjacent rooms (cycle-11) | only the 16 | `_del-walkers.js` also deletes edge creeps (`x/y ∈ {0,49}`) in the 8-neighbors |
| `Memory.rooms` / `rclTimes.8` | wipe never touches Redis | always `_scrub-racer-mem.mjs`; parse fail now **exits 1**; empty/`(nil)` starts clean; always zeros `speedrun` |
| controllers deleted | `_wipe-bench.js` | never called; `_reset-bench-ctrls.js` then `_restore-bench-ctrls.js` (insert-if-missing only) |
| `seedOk` skip after reset | `race.mjs:1224` | if `--run`, seed-clean clears `seedOk` when that room is rcl 0 / unowned **before** `race.mjs` |
| no visibility | silent | per-room `seedOk / owner / rcl / extras / walkers / roads` after hygiene and after seed |
| seed over a live watch | none | refuse unless `--replace-live` |

**Still in `race.mjs` / `spawn-in.mjs` (not patched):**

- `--wipe` still skips the whole room if a foreign creep is present (`tools/server/race.mjs` ~1161–1163). Hygiene + last-second del-walkers is the workaround; a walker that steps in during the 16 sequential `spawn-in` calls can still fail that room.
- `if (existing && existing.seedOk) continue` (~1224) still skips a reset controller if you invoke `race.mjs --seed --run` **without** seed-clean.
- Extra bots (`pacifist2`, `waxeye`) keep producing walkers. `_pause-extra-bots.js` is the kill switch; seed-clean does not pause them.

---

## What seed-clean runs

1. Refuse if newest / `--run` ledger is still watching.
2. `npm run push-pacifist` (unless `--skip-push`).
3. `_del-walkers.js` → `_scrub-bench-objects.js` → `_reset-bench-ctrls.js` → `_restore-bench-ctrls.js` → `_del-racer-creeps.js`.
4. `_scrub-racer-mem.mjs` (both racers, 16 rooms + `speedrun`).
5. Census. If `--run`, clear stale `seedOk`.
6. `_del-walkers.js` again.
7. `race.mjs --seed --wipe --yes --swap --force …`
8. Census. Want `seeded-live 16/16`.

---
## Wipe coverage — all Memory.rooms + autoExpand + target_colonise
Was: `_scrub-racer-mem.mjs` (seed-clean step 4) deleted only the 16 bench `Memory.rooms` keys and reset `speedrun`.
It did **not** delete non-bench `Memory.rooms` keys, `Memory.autoExpand`, or `Memory.target_colonise`.
Now: same scrub, both racers (`pacifist1`, `pacifist-race`): drop **every** `rooms` key, `delete autoExpand`, `delete target_colonise`, then `speedrun = {startTick:null,rclTimes:{},lastRcl:0}`.
Parse fail still exits 1. Empty/`(nil)` still starts `{}`. Logs `race` vs `other` key counts plus whether those two roots existed.
Why: leftover `Memory.rooms[<not-bench>].basePlan.spawn[0]` without `Structures.spawns` can queue a 24-part CB at RCL3 (hygiene §CB).
Stale `claiming` still `armColonise`s; stale `claimed` would abort at 8000t. Wipe is the gate, not a revert.
CB helpers (`maybeSpawnColonyBuilder` + friends) **stay** — this wipe is the stay condition from `_cycle16-hygiene.md`.
seed-clean USAGE now says all rooms + those two roots. `_wipe-bench.js` still never called. Did not execute seed.
Do not seed now (cycle-15 `23-57-10Z` live). Never `push-race`. Never `server:local:reset`. Never `--run` that id.
Step 4 above still says “16 rooms + speedrun”; the scrub now wipes **all** `rooms` keys + `autoExpand` + `target_colonise`.
