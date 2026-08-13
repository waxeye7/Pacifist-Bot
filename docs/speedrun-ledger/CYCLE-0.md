# Cycle 0 — implement while A/B is blocked

Opened **2026-08-13**. Owner started the spawn→RCL4 campaign now, in
**implement-and-review** mode, in parallel with the planner loop. This page is
the cycle-0 ledger. It is not a results sheet.

## Mission

**RCL4 first.** Primary metric: mean game ticks from spawn placement to RCL4
on the frozen benchmark set. RCL6 is a later milestone and starts from the
RCL4-optimized bot. No baseline times yet — do not invent any.

## Frozen control

| | |
| --- | --- |
| Commit | **`e839fc8143a9b1c5807b9ad672410a1ce3e10090`** (`e839fc8`) |
| Dest / user | `race` / `pacifist-race` |
| Pin | `docs/speedrun-ledger/CONTROL.md` |

**NEVER `npm run push-race`.** That dest holds the control build. Pushing it
invalidates every later A/B. Re-baseline is a deliberate later step, not this
cycle.

## Benchmark set

`docs/BENCHMARK-ROOMS.json` — `setHash` **`1f90aub`**, frozen
**2026-08-01T16:15:28Z**, 8 paired slots (2 easy / 3 median / 3 hard).
`--swap` is mandatory when A/B eventually runs (6/8 pairs exceed the pair-
distance warn bar). No `run-*.json` this cycle; no numbers to report.

## A/B blocked

`tools/server/race.mjs` seeds via local docker/mongo only. Local docker is
**OFF on purpose.** VPS is the live dest (`npm run push-vps`) but this repo
does not SSH, does not change VPS world/mod/tick, and does not spawn-in
there.

Unblock when **either**:

1. local docker is allowed, or
2. `big_vps` seeds a race world.

Until then: implement and review, do not keep-or-revert on vibes.

## Cycle-0 work

Audits + first implementations against the campaign backlog, pending A/B:

1. Spawn body tiers from `energyCapacity` (not `energyAvailable` snapshots).
2. RCL1–3 build order — no early road tax.
3. First-100-ticks harvest-to-spawn choreography.

Clock already exists: `src/utils/Speedrun.ts` (`trackRoomRcl`,
`resetSpeedrun`, `speedrunStatus`). Reuse it; do not rebuild it.

Nothing in this cycle is kept as a measured win. Ledger a hypothesis when it
lands; keep-or-revert waits for a real A/B.

## Guardrails

- Planner board stays the planner loop's. Do not bend the base to the race.
- CPU shard3-viable (~20/tick avg, no tick spikes > 100); tower up by RCL3;
  remotes are a lever, not a crutch (benchmark must also pass remotes-off).
- No fake times. No docker. No `push-race`. No `server:local:reset`.
- Candidate uploads, when they happen, are `npm run push-vps` only.
- `tsc` clean on any bot change; live-fleet bugs found along the way still
  get fixed.

## Cycle 0 implementations

RCL1–3 builder and RCL2/3 repair gates in `src/Rooms/rooms.spawning.ts` no longer require `carriers > 1 && EnergyMinersInRoom > 1`. One-source rooms could never pass the miner clause, and two-source rooms queued zero builders until the second miner *and* second carrier existed, so the first five RCL2 extensions sat idle through eco bootstrap. Builders now queue when `sites.length > 0` and one home miner exists (`EnergyMinersInRoom >= 1`), capped at `min(spawnrules amount, sites)` so six bodies do not pile onto one site; repair uses the same miner floor and still keeps `!room.memory.danger` plus the RCL2 `progress > 4500` check. Hypothesis: first extensions start during the first miner, not after the second carrier. A/B still pending — docker is off and no race world; keep-or-revert waits for a measured run.

Home carriers no longer price haul off a phantom 6 WORK / 12 e/t. `getCarrierBody` (home sources only) and `homeCarriersWanted` size to `2 *` live EnergyMiner WORK on that `memory.sourceId` (floor 4 if none hatched yet — one 2W about to exist — cap 10). First hauler stays `[CARRY,CARRY,MOVE]`. Hypothesis: RCL1–3 rooms stop queuing 150e carriers that steal the spawn from upgraders. A/B still pending.

`getBody` now sizes segments from `energyCapacityAvailable` and will not emit above capacity (stack clamped to 85% of cap; one oversize segment ships only if it fits, else a prefix or skip). RCL1 queues 2 upgraders of `[W,C,C,M]` (250), not 6. RCL2 at 550 cap ships a fixed `[4W,C,M]` (500, 4 WORK) instead of one 300-energy `[2W,C,M]` leftover-sized segment. RCL3 uses `[4W,C,M]` until cap hits 800, then `getBody([W,W,C,M])` → 4W2C2M. Hypothesis: RCL2 upgrades at 4 e/t, not 2. A/B still pending.

RCL1–3 `spawnFirstInLine` interleaves the next affordable queue entry after 10 consecutive `ERR_NOT_ENOUGH_ENERGY` (was 40); RCL4+ stays at 40.

RCL3 `roadsForRcl` now keeps only hub↔source/controller chains (D8 of those containers plus the first-tower spur). `plan.rs` still stages the whole arterial at 3 — extension faces, unused hub filler, later tower spurs — so the bot filters that set geometrically rather than restaging. RCL2 still has no roads; RCL4+ still gets the full array. Monotone prefix. Hypothesis: the 135k climb is not spent paving extension flanks. A/B still pending.
