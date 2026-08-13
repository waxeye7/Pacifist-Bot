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

`getBody` now sizes segments from `energyCapacityAvailable` and will not emit above capacity (stack clamped to 85% of cap; one oversize segment ships only if it fits, else a prefix or skip). RCL1 queues 1 upgrader of `[W,C,C,M]` (250). RCL3 uses `[4W,C,M]` until cap hits 800, then `getBody([W,W,C,M])` → 4W2C2M. A/B still pending.

RCL1–3 `spawnFirstInLine` interleaves the next affordable queue entry after 10 consecutive `ERR_NOT_ENOUGH_ENERGY` (was 40); RCL4+ stays at 40.

RCL3 `roadsForRcl` now keeps only hub↔source/controller chains (D8 of those containers plus the first-tower spur). `plan.rs` still stages the whole arterial at 3 — extension faces, unused hub filler, later tower spurs — so the bot filters that set geometrically rather than restaging. RCL2 still has no roads; RCL4+ still gets the full array. Monotone prefix. Hypothesis: the 135k climb is not spent paving extension flanks. A/B still pending.

Five extensions plus the nearest source buffer. Second source and controller containers stay on the plan at RCL3. Monotone prefix. A/B still pending.

`Memory.speedrun.disableRemotes` is the remotes-off guardrail the remotes-disabled A/B needed. Default unset: speedrun ON still opens RCL3+ remotes. When set, `manageRemotes` closes every remote every tick (it used to `return` on `!allowRemotes` and leave them running) and spawn will not queue remote miners, carriers, or reservists. Console: `disableRemotes()` / `enableRemotes()`. A/B still pending.

RCL1 first-100-ticks: the opening 300 now buys `[WORK,CARRY,MOVE]` (200) plus `[CARRY,MOVE]` (100) instead of a 250 drop-miner and 100 ticks of spawn regen for a 150-energy `[C,C,M]`. The 1W miner transfers into an adjacent spawn/extension, walks a full load in if no hauler is alive and the spawn is within 8, otherwise drops — a CARRY miner cannot drop-mine, so without that dump it sat `ERR_FULL`. `lastSpawn` re-arms 100 ticks out so a `[W,W,MOVE]` replacement follows; RCL1 still wants one hauler. The RCL1 DOB≤60 sweeper no longer stacks on every producer pass. Post-bootstrap first hauler is still `[C,C,M]`. Hypothesis: first energy hits the spawn ~100 ticks sooner. A/B still pending.

RCL2–3 construction finish: builders pick a tower site before leftover roads (ext → container → tower → closest). RCL1–3 roster is `min(cap, useful, 2)` on non-road sites and 1 once only roads remain. RCL2 site budget is 5 so the five extensions land in one 15-tick pass. Hypothesis: the first tower finishes during the 135k climb, and spawn time stays on upgraders instead of six pavement bodies. A/B still pending.

Era spawn priority: RCL1 wants 1 upgrader (200 progress), not 2. RCL3 wants 4 — the same roster as RCL2 — instead of dropping to 2 for a 3× larger controller (8 e/t → 16 e/t on the 135k climb). When RCL3 sites are roads-only, upgraders queue ahead of the leftover pavement body. Hypothesis: the 135k climb is not half-staffed and a road site does not HOL-block a 500-energy upgrader. A/B still pending.

Colonisation supporters are `getBody([W,C,M], room, 24)` (max 8 of each, off-road 1:1) and leave the mother with a storage fill. They used to be `getBody([W,C,C,C,M], room, 50)` — a 50-part 3000e body at RCL8 that walked 2–4 ticks/tile and then fell through into the mother's own sites while `fill` was set. Every claim is a fresh spawn→RCL4 sample. Hypothesis: the colony spawn starts hundreds of ticks sooner. A/B still pending.

Pre-storage loot: RCL1–3 sweepers ignore source-adjacent drop-mine piles (carriers already haul those; a 2W pile hits 50e in ~13 ticks and used to buy a permanent `[C,C,M]` sweeper). Tombs, ruins, and stray off-source drops still get one small sweeper. RCL4+ unchanged. Hypothesis: the 135k climb is not paying 150e + spawn time for a third hauler on the miner tile. A/B still pending.

First dedicated filler pays when the bank can load it. RCL1–5 no longer unshift a filler the tick `storage` exists (an empty RCL4 storage used to jump two 300e `[4C,2M]` ahead of miners/upgraders). Real storage: 0 below 200e, 1 until 2000e, then the roster. Hub-container fallback: one, and only if it holds ≥100e and spawn/ext are hungry. Remote extras only after the bank is a real buffer. Emergency fillers in `spawnFirstInLine` unchanged. Hypothesis: the RCL4 clock is not 600e of empty-storage HOL. A/B still pending.

Remotes open at RCL4, not RCL3. An RCL3 remote is unreserved 5 e/t (reservers are RCL5+) after a 50–80 tile walk, and its miner/carrier steal spawn from the 135k climb. `manageRemotes`, the spawn loop, speedrun hints, remote-road siting, and live miner/carrier retarget all use the same floor. `disableRemotes()` still force-closes at any RCL. Hypothesis: the RCL4 clock is home eco only. A/B still pending — remotes-off remains the guardrail.

Pre-road home carriers are 1:1 CARRY:MOVE (same rule remotes already use). The old loop added MOVE every other CARRY at every RCL, so a loaded hauler was 2 ticks/tile on dirt through the 135k climb — RCL2 has no roads, RCL3 only sites arterials and we stopped paving them first. RCL4+ with real storage stays 2:1. First RCL1 hauler is still `[C,M]`. Hypothesis: home haul matches the walk, so fewer bodies cover the same e/t. A/B still pending.

RCL3 no longer queues the 800e maintainer. Arterials hit 2000 hits after ≈3000 ticks of decay, which is mid-135k-climb, and the body stole a spawn from a 500e 4W upgrader. Ramparts are RCL4+; the existing `[W,C,M]` repairer covers roads. RCL4+ maintainers unchanged. Hypothesis: the climb is not paying 800e to nurse a 300-hit road. A/B still pending.

RCL2 upgraders are `[2W,2C,2M]` (450), not `[4W,C,M]`. The controller container is RCL3, so RCL2 is a source↔controller shuttle: `[4W,C,M]` is 3 ticks/tile and a 50-energy tank (~0.5 e/t delivered on a 15-tile walk, not 4). The 2W/2C/2M body walks and holds 100. RCL3 still parks the 4W on the depot. Hypothesis: RCL2 actually delivers ~1 e/t per upgrader. A/B still pending.

RCL3 keeps the shuttle body until the controller container exists, then switches to the parked 4W. Builders finish that depot before leftover extensions (the next five only raise cap 550→800; the 4W is already 500e). Hypothesis: the first third of the 135k climb is not 4W shuttling at ~0.3 e/t. A/B still pending.

RCL1–3 builders are `[W,2C,2M]` (300), not `[W,3C,M]` / `getBody` of that segment. Dirt walk is 2 ticks/tile loaded instead of 4, and cap 800 no longer stacks a 600e `[2W,6C,2M]` that HOL-blocks the parked 4W. RCL4+ still uses the road-era stack. Hypothesis: the controller depot and the five RCL2 extensions finish on a walk that matches the ground. A/B still pending.

`ControllerLinkFiller` is RCL5+ link-only. The RCL3/4 container branch unshifted a 250–500e `[4C,M]` (4 ticks/tile loaded) the tick the depot existed, HOL in front of the parked 4W that depot is for. Carriers already dump surplus into the depot; dry-depot upgraders shuttle. Hypothesis: the 135k climb is not paying a 250e HOL for a third hauler. A/B still pending.

RCL3 carriers feed the controller depot once spawn/ext hold 550e, not only once every new extension is full. The leftover five extensions kept `baseIsFed` false for the rest of the climb, so the parked 4W sat on an empty depot and shuttled. Towers still get 500 before the depot. Hypothesis: the 4W actually parks. A/B still pending.

RCL3 repairer stays `[W,C,M]` (200). `getBody` stacked it to `[2W,2C,2M]` (400) at cap 550 and `[3W,3C,3M]` (600) at 800 — HOL in front of the parked 4W. One WORK covers container decay (50 hits/t); roads are not paved first. RCL4+ unchanged. Hypothesis: the climb is not paying 400–600e to nurse a container. A/B still pending.

RCL3 does not pave. The roads-only builder is gone, and leftover builders recycle once only roads remain. 1:1 haulers already walk plains at 1 tick/tile; arterial tiles are ~12k the controller wants. RCL4 still gets the full road array. Hypothesis: the 135k climb is not spent on pavement. A/B still pending.
