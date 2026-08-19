# Empire layer, critical spawn ladder, rescue-as-empire-job

Status: v1, 2026-08-19. Branch `feat/spawn-ladder`. Feature flags `Memory.features.empireBrain`
and `Memory.features.spawnLadder` (both default ON; either can be flipped off live for rollback).

## Why

Read `docs/STARVATION-TRAPS.md` first. Five outages in one session were the same shape: a *gate*
("may this room do X?") judged by a number that drops *because* the room does things. Every gate
grows an escape hatch, every escape hatch is another special rule, and the room still latches.

Two structural causes sit under that:

1. **There is no floor.** A room's survival (a miner per source, something that moves energy) is
   produced by the same FIFO queue + producer cadence as everything else. An unaffordable head, a
   producer that only runs on an empty queue, or a low bucket can all leave a room with a spawn and a
   source and *nothing hatching* — see the HOL shrink/interleave/shred trilogy in `spawnFirstInLine`.
2. **Cross-room decisions are made from inside per-room code.** Spawn rescue (`Memory.spawnRescue`,
   `_spawnEmergency`, `target_colonise`, retasking neighbours' creeps) was driven from
   `spawning(room)`; one sick room reached across the empire from a per-room function, and every
   mother room re-ran an O(rooms) donor selection each tick.

## What v1 does

### 1. `src/Empire/` — the seed of an empire brain (runs once per tick, BEFORE rooms)

`main.ts`: `phase("empire", runEmpire)` right before `phase("rooms")`.

- `census.ts` — one pass over `Game.creeps` per tick, cached by tick. Home crew per room
  (`memory.homeRoom || creep.room.name`, and `targetRoom` is home/unset), creeps *present* per room
  (matches the producer's `isInRoom` counting), and EnergyMiners keyed by `memory.sourceId` with
  their WORK count. Rooms and the empire read the same numbers.
- `rescueLib.ts` — the pure rescue helpers, moved out of `rooms.spawning.ts` unchanged in behaviour
  except: `finishableSpawnSiteRooms()` no longer sorts by distance from a hard-coded room
  (`"E37N58"`); it sorts by distance to the nearest room of ours that has a spawn.
- `rescue.ts` — the empire *job*: decide the pinned rescue target, the mother room, and the builder
  cap ONCE per tick; re-aim / retask builders (the only code allowed to write other rooms' creeps'
  memory); publish `{need, mother, cap, rescue}` on the tick's empire state.
- `empire.ts` — `runEmpire()`, `empire()` (this tick's state or null), `postureOf(room)`.
  Postures in v1 are *derived and published*, not yet consumed: `rescue-target`, `rescue-donor`,
  `danger`, `normal`. They are the hook for `frozen` / `cpu-lean` / `war-support` next.

Rooms only READ empire state. `runSpawnRescueOnce()` inside room code is a no-op while
`empireBrain` is on; `maybeSpawnColonyBuilder(room)` asks "am I the mother?" instead of computing
it. `stripNonRescueQueue(room)` (own queue) stays room-side. Legacy paths remain behind the flag for
one soak cycle and are deleted afterwards.

### 2. `src/Rooms/spawnLadder.ts` — the critical-needs ladder (the floor)

Runs from `spawning(room)` with an idle spawn, **before** the queue and **regardless of bucket**
(same reasoning as `emergencyFillerRescue`, which stays as a redundant net). Pure decision function
`decideLadder(view)` + thin `runSpawnLadder(room, spawn)`.

Rungs, first actionable wins, at most one spawn per room per tick:

- **R1 miner floor** — every home source has ≥1 EnergyMiner alive/hatching. Missing → spawn the
  *best miner body affordable right now*. Two body tables: plain (`[5W,2M]` … `[W,M]`) and — for a
  **linked** source (energyMiner's `linkHaulBySource` cache <200t old, or RCL6+/cap750+/storage) —
  CARRY-bearing (`[5W,C,2M]` … `[W,C,M]`), because a CARRY-less creep drop-mines and cannot feed a
  link. If a matching miner is queued and affordable, pull *that* entry (body+memory, spliced +
  `lastSpawn` stamped). The ladder NEVER deletes a queued entry it did not spawn.

### Stopgaps (v1.1 — the review rework)

A floor creep is a **stopgap** unless it is the creep the room would really build: fewer WORK than
the room can field, ANY miner on a linked source, any body smaller than a queued entry for the same
job — and every ladder filler/carry (the producer's tiering is the truth there). Stopgaps carry
`memory.stopgap` and three rules make them safe:
  1. they never remove the queued real creep — it hatches behind them;
  2. they are **invisible to the producer** (creepIndex + add_creeps census skip them), so the
     producer sizes and queues the real replacement as if the slot were bare;
  3. they **yield** — suicide — the moment the real creep arrives (real miner within 2 of the
     source; real filler/carry hatched in the room), so seats are never blocked.
A non-stopgap/pulled ladder miner stamps `resources[..].energy[src].lastSpawn` so the producer's
1500-tick rung does not queue a duplicate.
- **R2 hauler floor** — the room has income (≥1 miner; a ≥2k bank with live fillers also counts,
  so a banked room is not "dead") but nothing OWN-crew that moves energy, and at least one staffed
  source is not linked. Spawn a `carry` for that source (always a stopgap). Body is the best
  CARRY/MOVE body affordable; in rooms with capacity ≥550 never fewer than 3 CARRY, because
  `recycleTinyCarriers` suicides ≤2-CARRY/≤200e carriers on capacity — a 1-CARRY floor creep there
  would be a spawn-and-kill loop.
- **R2b filler floor** — RCL≥4 with our storage: fillers present == 0 → spawn a `filler` (same body
  ladder as the emergency filler). Ordered before R2 when the storage already holds energy; with an
  EMPTY storage and no haulers the carry comes first (a filler would only stand there).
- Bounded patience: a room with **zero** miners spawns the moment anything is affordable (dead rooms
  move now). A room with some income may wait up to `LADDER_MAX_WAIT` (40) ticks for a better body,
  then takes the best it can afford. Waits always end in an action; nothing latches.
- Danger: if `room.memory.danger` and the queue head is an affordable defensive creep, the ladder
  yields. A source with a ranged hostile within 4 is skipped (same rule as the producer).

Floor creeps carry `memory.viaLadder = tick` and `memory.stopgap = true` when smaller than the best
body the room could build. The producer's own 1500-tick miner timer and carrier sizing replace
stopgaps as energy recovers; the ladder never blocks a proper spawn.

## Invariant this buys

> A room with one of our spawns and one source climbs back from zero creeps, on its own, whatever
> the queue, producer cadence, bucket, danger flag, or migration state say — and while it does, no
> other room's crew is touched by anything but the empire pass.

`test/unit/phoenix.test.ts` runs the real `decideLadder` against a mock room across ticks with
adversarial memory (HOL-blocked queue, low bucket, danger, cap≫available, storage-but-empty) and
asserts miner then hauler within a bounded number of ticks, no double spawns, and no action once the
floor is met.

## Explicit non-goals for v1

- No new gates. The ladder adds *actions*, not thresholds; the only new "wait" is bounded.
- No changes to body sizing of routine spawns (speedrun A/B measures those).
- Postures are published, not consumed. `frozen` / `cpu-lean` / `war-support` are next.
- Legacy rescue code stays until the flag has soaked; then delete.

## Rollback

`Memory.features.spawnLadder = false` — ladder never runs. `Memory.features.empireBrain = false` —
rooms run the legacy rescue path exactly as before (helpers are the same functions, imported).

## First soak (VPS test server, 2026-08-19, 300 ms ticks)

- **W3N3** (RCL6, bank 0, cap 2300 — the "broke live room" shape): the home miner died at
  ~t=2547249 with a 300e miner stuck at the queue head and 27 energy. The ladder hatched
  `EnergyMiner-L2547352` ([W,M]) the tick energy reached 150 — ~100 ticks after death; the old
  HOL/shrink path arrives at a similar body after ~220–270. This soak is also what exposed the
  "dropped the queued real miner" flaw fixed in `fe9dc05` (see R1 above).
- **W2N1** (RCL7, one link-hauled source, 2 spawns, 5600/5600): all four creeps suicided at
  t=2548228. `EnergyMiner-L2548229` (5 WORK, full size) hatched the next tick, `Filler-L2548230`
  the tick after on the second spawn; no carry (link-hauled), no double spawns, nothing further from
  the ladder once the floor was met; the producer refilled the rest and energy was back at 5600
  within ~200 ticks.
- `Memory.CPU.phases.empire` settled around 0.25–0.4 CPU/tick on the VPS (5 owned rooms, 32
  remembered rooms) — see the report for the shard3 estimate.

## Next steps (not in v1)

1. **Stopgap upgrade rung (R3)** — v1 leaves replacing a stopgap to the producer, which now queues
   the real miner promptly (stopgaps are invisible to `minerOnTheWay`) but sizes it to CAPACITY, so in
   a broke room it HOL-stalls and shrinks 40 ticks at a time (W3N3: ~1400 ticks to a 2-WORK miner).
   Sketch: a source staffed ONLY by stopgaps with total WORK < 5: (a) if the producer's miner is
   queued and affordable → pull it (same as R1); (b) if nothing is queued and the best affordable body
   has ≥ 2× the current WORK → spawn it and stamp `resources[home].energy[sid].lastSpawn` so the
   producer stands down for that creep-life. Never more than one R3 spawn per source per ~300 ticks.
   Miner "stopgap" should mean WORK < min(5, best-at-cap WORK), not cost < best cost.
2. **Postures consumed** — `frozen` (survival ladder only), `cpu-lean` (fewest, biggest bodies;
   links over legs), `war-support` (economy rooms fund the war). The empire pass already publishes
   `postureOf(room)`; the ladder is the floor every posture sits on.
3. **Delete the legacy rescue path** once `empireBrain` has soaked on live.
