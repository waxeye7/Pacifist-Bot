# Gradual Plan Migration — Spec (v1)

Goal: walk a LIVING, built room from its legacy layout to an adopted planV2
layout without ever compromising the room's ability to spawn, defend, or store —
in contrast to the existing instant migration (runMigration), which demolishes
every off-plan structure at adoption time and is only safe for freshly-claimed
rooms.

## Modes

- `room.memory.planMigration = { mode: "gradual", phase, since, batch }`
  armed by console `migratePlan(roomName)`; requires `room.memory.planV2`
  already present (adopted with demolition suppressed — see Gate below).
- Absent memory → no migration activity at all (default; colonies keep the
  existing instant path).
- `migrateAbort(roomName)` deletes the state; nothing further is demolished.
  Already-migrated structures stay. `migrateStatus()` prints all rooms' states.

## Gate on the instant path

Adoption via segment 88 / pack adoption keeps its current behavior EXCEPT when
`room.memory.planMigration` exists with mode "gradual": then adoption writes
planV2 but MUST NOT call the demolition step. The gradual engine owns all
destruction from that point.

## Safety invariants — checked EVERY tick the engine acts; any violation pauses
the engine (phase "paused", reason logged) rather than proceeding:

I1. Spawn count: room keeps >= 1 functional (built) spawn at all times.
    Spawn relocation is only permitted while a SECOND built spawn exists
    (i.e. RCL >= 7 and both spawns up).
I2. Tower count: >= 1 built tower at all times (if the room had any).
I3. Energy capacity: extensionCount_current >= plannedBatchFloor, where the
    engine only destroys up to BATCH_SIZE (default 5) extensions at once and
    must see them REBUILT at planned positions before destroying the next
    batch.
I4. Storage/terminal: NEVER destroyed by the engine in v1. If the plan moves
    them, the engine completes everything else and finishes with phase
    "done-partial" listing the immovables. (Their migration is a future
    explicit opt-in.)
I5. Danger: room.memory.danger or hostiles present → engine pauses.
I6. Bucket: Game.cpu.bucket < 3000 → engine idles that tick.
I7. Controller downgrade: ticksToDowngrade < 10000 → pause (never let the
    migration distract from upgrading).

## Order of operations (phases)

P0 sanity     — planV2 present, invariants pass, diff computed.
P1 additive   — place planned structures whose tiles are FREE (roads,
                containers, extensions, labs, links, towers up to caps).
                No destruction. Uses existing placeFromPlanV2 placement.
P2 blockers   — structures standing ON planned tiles of a DIFFERENT type:
                destroy in dependency order (roads/containers first, then
                extensions, then labs/links), one batch per class, rebuild
                confirmed before next batch (I3).
P3 extensions — off-plan extensions beyond what P2 handled, batches of
                BATCH_SIZE, rebuild-confirmed between batches.
P4 towers     — off-plan towers one at a time; replacement tower must be BUILT
                before the next one is touched (I2).
P5 spawns     — RCL >= 7 only: destroy ONE off-plan spawn while the other
                lives; wait until the planned replacement is BUILT; repeat.
                The LAST spawn is never destroyed unless a planned spawn is
                already built elsewhere (I1).
P6 cleanup    — leftover off-plan roads/containers/walls; off-plan ramparts
                are NOT touched (decay handles them; defense reads the new
                shellCut already).
done / done-partial — state retained with a summary for migrateStatus().

## Destruction rules

- Only `structure.my` structures in the migrating room.
- Never: storage, terminal, controller, extractor (extractor only if plan
  places it elsewhere — it cannot, minerals are fixed → never).
- Nuker/observer/powerSpawn/factory: treated like labs (batch, rebuild first)
  — v1 may simply defer them to done-partial if absent from plan tooling.
- Every destruction logged loudly with tile + type; a rolling
  `planMigration.log` (last 20 events) in memory for the console.

## Builder pressure

The engine only creates work; construction sites are built by the existing
builder/erector economy. The engine must cap concurrent sites it creates
(MAX_SITES = 10) and must not fight ensureSpawnFirst or other placers: it
never runs in rooms below RCL 4, and it defers to danger.

## Testing gauntlet (acceptance)

- Static: adversarial review workflow — findings fixed until two consecutive
  clean rounds.
- Runtime (VPS W1N1, RCL7, 300ms ticks): adopt gradual plan, then observe:
  (a) invariants never violated in polled snapshots,
  (b) monotonic progress (diff size shrinks over time),
  (c) spawn capability continuously available (spawn queue not starved by
      capacity dips),
  (d) abort mid-P3 leaves a functioning room,
  (e) engine reaches done/done-partial.
- Only after (a)-(e): push-main, arm E37N59 with preview + explicit start.
