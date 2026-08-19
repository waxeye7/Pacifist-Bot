# Overnight report — critical spawn ladder + empire layer (2026-08-19)

Branch: `feat/spawn-ladder` (isolated worktree; the shared checkout was never touched).
Design: `docs/EMPIRE-LAYER.md`. 2026-08-19 afternoon: everything below IS merged to `main` and deployed to VPS + live (see the merge/deploy section of the session notes); nothing is pushed to any git remote.
The build was deployed to the **VPS test server** for a soak (details below).

## What was built

| Piece | Where | One line |
|---|---|---|
| Empire pass | `src/Empire/empire.ts`, `main.ts` `phase("empire")` before rooms | looks at the whole empire once per tick, publishes census / rescue job / postures; rooms only read |
| Shared census | `src/Empire/census.ts` | one `Game.creeps` pass per tick: home crew, present, target, miners-by-source (+WORK) |
| Rescue as an empire job | `src/Empire/rescue.ts` + `rescueLib.ts` (helpers moved out of `rooms.spawning.ts`) | target, mother, cap decided once; retask/re-aim only here; hard-coded `"E37N58"` sort origin removed |
| Critical spawn ladder | `src/Rooms/spawnLadder.ts`, called from `spawning()` before the queue, regardless of bucket | miner per source, filler (RCL4+ storage), carry (unless link-hauled) — best body affordable NOW; pulls queued entries forward; bounded wait only with income |
| Flags | `Memory.features.empireBrain`, `Memory.features.spawnLadder` (default ON) | either can be flipped off live; legacy rescue path retained behind `empireBrain=false` |
| Tests | `test/unit/phoenix.test.ts` (the invariant, tick by tick), `spawnLadder.test.ts`, `empireCensus.test.ts`, `empireRescue.test.ts` | 178 total unit tests green (was 110), lint + typecheck + rollup build green |
| Diagnostics | `Memory.CPU.phases.empire`, `Memory.CPU.empireParts` | phase total + rescue/census/postures breakdown |

Commits (on top of `95a2fc9`, a snapshot of the shared tree's uncommitted work as of 04:19 — NOT mine, drop it on merge):
`c739bc5` feat, `a389e28` tests + link-aware hauler, `4d793c7` one room-walk per tick + census recount, `fe9dc05` stopgap keeps the real creep queued + producer looks past stopgaps, `6c68673` docs, `99beb22` CPU breakdown, plus whatever landed after this report was drafted (see `git log feat/spawn-ladder`).

## Evidence it works (VPS, 300 ms ticks)

- **W3N3, broke RCL6 (bank 0, cap 2300)** — the live-shard shape. Home miner died at ~t=2547249 with a
  300e miner stuck at the queue head and 27 energy. Ladder hatched `EnergyMiner-L2547352` ([W,M]) the
  tick energy hit 150 — ~100 ticks after death, vs ~220–270 for the old HOL/shrink path.
  This run also exposed a real flaw (the ladder dropped the queued real miner; the producer's 1500-tick
  per-source timer would have left the room on 1 WORK) — fixed in `fe9dc05` and re-soaked.
- **W2N1, RCL7, one link-hauled source, 2 spawns, 5600/5600** — deliberate full wipe: all 4 creeps
  suicided at t=2548228. `EnergyMiner-L2548229` (5 WORK, full size) hatched the **next tick**,
  `Filler-L2548230` the tick after on the second spawn. No carry (link-hauled), no double spawns,
  nothing further from the ladder once the floor was met; producer refilled the rest; energy back to
  5600 within ~200 ticks.
- Healthy rooms: zero ladder spawns across the soak (the ladder is invisible when the floor is met).
- CPU: `phases.empire` ≈ 0.25–0.4 on the VPS (5 rooms, 50 creeps, 32 remembered rooms):
  census ≈ 0.21, rescue ≈ 0.07, postures ≈ 0.02. Ladder per room per idle-spawn tick is
  negligible (one FIND_SOURCES + a queue parse). Expect ~0.25 CPU on shard3. The census will later
  *replace* the producer's own per-room `Game.creeps` walks — that is where the CPU win is.

Soak log: `scratchpad/soak.log` (one line every 5 min, anomalies flagged `!!`), W3N3 and W2N1 tick logs
next to it. Note the Grok loop pushes the shared tree to VPS whenever its tests are green, so the VPS
build may have been replaced during the night — the soak line says `build=ladder` or `build=OTHER-BUILD`.

## Adversarial review

Five lenses (starvation traps, queue interplay, rescue-move behaviour preservation, live safety /
CPU, tick-by-tick recovery), each finding adversarially verified by two skeptics. Run TWICE — once
on Fable agents, once on Opus (after its 529s cleared) — as independent fleets with clean context.
Outcomes at the bottom of this file. The first W2N1 "evidence" bullet above is retained as written
because it is part of the story: the review proved that run was a bug looking like a success, and
the second wipe (below) is the corrected validation.

## What is deliberately NOT in v1

- **Stopgap upgrade rung (R3)** — replacing a stopgap with the full body from the ladder itself the
  moment it is affordable. v1 leaves that to the producer's queue (correct; slower in broke rooms —
  W3N3's producer replacement took ~1400 ticks through the HOL/shrink machinery).
- **Postures consumed** — `postureOf(room)` is published (`normal | danger | rescue-target |
  rescue-donor`) and logged; `frozen` / `cpu-lean` / `war-support` are the next step and are what
  "freeze the economy, all CPU to the attack" and "big creeps, fewer intents" become.
- **Legacy rescue path deletion** — after `empireBrain` has soaked on live.

## Merging — read this before touching the shared tree

The Grok loop kept editing the shared checkout all night (`rooms.spawning.ts`, `spawnSafety.ts`,
`PlanV2.ts`, `Commands.ts`, `War/*`, tests) and, in particular, has been **refactoring the same rescue
helpers** I moved to `Empire/rescueLib.ts` (its `spawnSafety.ts` now exports `colonyNeedIsRescue`,
`spawnRescuePinHolds`, `spawnRescueValue`, `retaskKeepsHatcheryRole`, `coloniseVetoesNoVisionSpawnless`,
`destCheapRewritesHead`, `rememberOwnedRoomStats`). A trial merge at 06:00 showed conflicts in
`rooms.spawning.ts` (6 hunks: imports, the moved rescue block, `maybeSpawnColonyBuilder`),
`spawnSafety.ts` and three test files. This is a 30–60 minute careful merge, not a click.

Recommended sequence:
1. Stop the Grok loop. Commit (or stash) the shared tree so it has a base commit.
2. `git merge feat/spawn-ladder` (or apply `git diff 95a2fc9 feat/spawn-ladder`), resolving with this rule:
   **take the shared tree's newest helper *bodies/semantics* (they carry Grok's fixes) and keep the
   branch's *wiring* (empire pass, `rescueJob()` in `maybeSpawnColonyBuilder`, `runSpawnRescueOnce`
   gate, ladder call, `minerOnTheWay` stopgap rule).** Where a helper now lives in `spawnSafety.ts`,
   import it from there instead of `rescueLib.ts` and delete the duplicate in `rescueLib.ts`.
3. `npm test` (must be green: 178 tests), `npm run build`, then push to VPS first, live later.
4. Ask me to do the merge — I have the full context and will re-do the move from the latest bodies.

Rollback on live if anything looks wrong: `Memory.features.spawnLadder = false` and/or
`Memory.features.empireBrain = false` — no redeploy needed.

## Review findings and outcomes

Two independent 33-agent fleets (find: 5 lenses -> verify: 2 skeptics per finding, refute-by-default).
Fable fleet: 19 raw -> 9 confirmed / 5 refuted. Opus fleet: 22 raw -> 10 confirmed / 4 refuted.
Both converged on the same core defect, which the phoenix/unit tests had NOT caught because neither
modelled CARRY, links, or the producer timer — a good lesson in what green tests are worth.

**The core defect (Fable C1/C5/C8/C9, Opus O1/O2/O5/O8/O10, P1):** "full-size" was judged against
the ladder's OWN body tables (miners top out at [5W,2M]600, fillers at 6 parts/300e), not against
what the room actually builds. At RCL6+ a CARRY-less [5W,2M] therefore counted as "real": it
deleted the producer's queued 1500e CARRY link miner (dropIdx), was visible to minerOnTheWay, and
would have drop-mined a link source onto the floor for a creep-life with nothing hauling. The
first W2N1 soak "success" was this bug observed and misread. Fillers/carriers had the same shape
(a 300e/150-capacity filler could own an RCL8 fill loop for 1500 ticks).

**The fix (commits `ed2d3c9`, `89bd194`) — stopgap rework:** stopgap = NOT the creep the room would
really build (fewer WORK than fieldable, linked source, or a bigger queued entry exists; ladder
fillers/carriers always). Stopgaps never delete queued entries (dropIdx removed entirely), are
invisible to the producer census/index (it re-queues the real creep as if the slot were bare), and
YIELD — suicide — when the real creep arrives. Linked sources build from a CARRY-bearing table.
Non-stopgap/pulled miners stamp `lastSpawn` (fixes the duplicate-miner hole, Fable C6/Opus O4/O6).
Pull failures cannot loop: ERR_NAME_EXISTS renames the queued entry in place, unspawnable entries
are dropped (Fable C4). Role mutators (rescue retask/re-aim/revert, cullSurplusBuildersOnce)
invalidate the shared census when they change roles mid-tick (Opus O7/O9). A ≥2k bank with live
fillers counts as income, so a banked room waits (bounded) instead of panic-buying [W,M].

**Validated live (VPS, second wipe of W2N1, t=2603638):** next tick a [5W,1C] stopgap link-miner +
[3C] stopgap filler; the producer queued the real W10C5 miner and 8C filler; both hatched ~60t
later; both stopgaps suicided on cue; room fully restaffed with real bodies in ~110 ticks, queue
empty, no duplicates. W3N3 (storage lost overnight, cap 2300->950) is bridged by a [2W] stopgap
miner holding income while the producer catches up — the exact broke-room case the floor exists for.

Refuted findings worth keeping (correct behaviour, now documented): the legacy `empireBrain=false`
path is NOT byte-identical (candidate ordering no longer radiates from hard-coded "E37N58" — an
accepted improvement); the empire pass is a single point of failure by design (it try/catches and
rooms fall back to reading nothing); presentCount-based hauler counting was replaced by own-crew
counting as part of the rework.

Tests: 110 -> 178, all green (lint + typecheck + rollup build too). New: spawnLadder unit tests
(bodies, rungs, pulls, danger, fuzz), phoenix simulation (the invariant under adversarial memory),
empire census attribution, rescue-job end-to-end, stopgap yield/rename/stamp cases.
