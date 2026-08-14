# Gradual Plan Migration — Spec (v2, matches implementation)

Goal: walk a LIVING, built room from its legacy layout to an adopted planV2
layout without ever compromising the room's ability to spawn, defend, or store.

## Architecture

One engine: PlanV2's per-class migration (migrateClass + migrateSpawns +
migrateHub) plus the placement loop's reclaimTile. EVERY destructive action —
both paths — must pass the single gate `migrationAllowed(room)`.

## Arming (opt-in; adoption alone never demolishes an established room)

- `room.memory.planMigration = {mode, since}`:
  - `"auto"`   — set at adoption when the room is young (RCL < 4 or fewer than
                 15 owned structures): fresh colonies, where clearing a
                 bootstrap squatter is the point.
  - `"gradual"`— set ONLY by console `migratePlan(room)`: the operator's
                 explicit go for reshaping a built room.
- Absent or after `migrateAbort(room)`: plan PLACEMENT continues, demolition
  does not. `dropPlan(room)` clears the plan AND all migration state.

## The gate — migrationAllowed(room) returns a block reason or null

Blocks on: not armed · paused (`migratePause`) · mode gradual below RCL 4 ·
`room.memory.danger` · hostiles present (direct find, covering the safe-mode
window where danger is cleared) · bucket < 3000 · controller downgrade risk
(floor = min(10000, half the level's own CONTROLLER_DOWNGRADE max, so RCL2's
10k max cannot permanently wedge it).

## Per-class protocol (unchanged core + I3)

- extension: 3/pass, 60 ticks apart, storage > 20k. REBUILD-CONFIRMED: while
  any extension construction site is pending, no further batch is destroyed.
- container: 1/pass (never both source containers in one tick), same
  rebuild-confirmation.
- tower: 1/pass, N-1 always live, never the last, replacement placed first.
- road: 3/pass, interior only (exterior = remote lines, never touched).
- spawn: ABSOLUTE — the room's only spawn is never destroyed; relocation only
  at RCL7+ with the planned replacement built and verified live for 60 ticks.
- storage/terminal: never (caps make build-then-drain impossible); deferred
  with a one-shot note. Their move is a manual, future step.
- reclaimTile (squatter on a planned tile): same gate as everything else,
  one per pass, container/extension/road only, never spawns.

## Console surface

migratePlan(room) · migrateAbort(room) · migratePause(room) /
migrateResume(room) · migrateStatus() — census computed with the ENGINE'S own
staged/RCL-capped tile view (exterior roads excluded, unmanaged legacy types
reported separately), plus the live gate verdict per room.

## State hygiene

dropPlan clears planMigration/planMigrate/planMigrateLog/planMigratePaused/
planSpawnReady/planDrain. Re-adoption with a changed plan hash clears
planMigrateLog so one-shot owner-action notes fire again for the new layout.

## Acceptance gauntlet

- Static: adversarial review workflow — no confirmed critical/major findings.
- Runtime (VPS W1N1, RCL7, fast ticks): arm gradual, observe (a) no invariant
  violations in polled snapshots, (b) off-plan census monotonically shrinking,
  (c) spawn capability continuously available, (d) migrateAbort mid-run leaves
  a functioning room, (e) engine converges or reports deferred immovables.
- Only after (a)-(e): push-main; E37N59 adoption is placement-only until the
  operator (or an explicitly authorized session) runs migratePlan("E37N59").
