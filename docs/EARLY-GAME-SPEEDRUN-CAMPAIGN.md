# EARLY-GAME SPEEDRUN CAMPAIGN

**Chained goal.** This campaign starts automatically when the base-planner
perfection goal (docs/BASE-PLANNER-PERFECTION-GOAL.md) terminates. It is
deliberately the LONG one — the owner's ask, verbatim in spirit: *keep going for
ages, make it really take ages, polish it in every way, until extremely
diminishing returns.* Do not rush it. Do not declare it done early.

## Mission

Drive the **average time (game ticks) from spawn placement to RCL8** down as far
as it will physically go. **RCL2 / RCL3 / RCL4 are the fast loop** — many A/Bs
per day — not the destination. A keep that wins RCL3 by skipping a structure
RCL8 still needs (extensions, storage, 1300 cap) is a revert. Delay-then-build
is legal; never-build is not. Each milestone runs hypothesis → implement → A/B
→ keep-or-revert, and only closes at a strict diminishing-returns bar.

## Termination bar (per milestone — this is what "ages" means)

- A milestone (RCL4 first, then RCL6) closes only when **4 consecutive cycles
  each improve the benchmark mean by < 1%** (noise-adjusted — see measurement),
  AND a final adversarial review agrees no known hypothesis remains untried
  that a reasonable player would expect to pay.
- Between milestones, re-baseline: RCL6 work starts from the RCL4-optimized bot.
- Regressions are never acceptable trades: a change that speeds RCL4 but slows
  RCL6, survival, or CPU beyond guardrails is reverted, not averaged away.

## Metric + guardrails

- **Primary**: mean ticks spawn-placement → RCL4 (later RCL6) across the fixed
  benchmark set. Report median and worst-room too; a win that only helps easy
  rooms is a partial win.
- **Guardrails (hard)**: CPU stays shard3-viable (~20/tick avg, bucket-friendly,
  no tick spikes > 100); tower up by RCL3; no safety regression (base plan
  adoption unharmed); benchmark must ALSO pass with remotes disabled (remote
  income is a lever, not a crutch); no regression of the perfected base planner
  (its validator stays green — the speedrun must not bend the base).
- **Statistical honesty**: every A/B uses the same rooms, same seeds/conditions,
  N ≥ 3 runs per side (more when the delta is near noise); report the spread,
  not just the mean. A "win" inside the noise band is not a win.

## Benchmark harness

- Fixed set: ~8 rooms spanning easy/median/hard terrain, enclosed and open
  sources, near and far controllers — chosen once at campaign start, frozen,
  documented in a BENCHMARK-ROOMS.json with the reasons for each pick.
- Control vs candidate: `pacifist-race` user runs the frozen control build,
  `pacifist` runs the candidate, same rooms, simultaneously — same server,
  same tick rate, eliminating machine variance.
- Clock: watchdog RCL-timestamp lines ("reached RCLn!") plus a small
  ticks-at-RCL recorder in room memory (RCL-progress tick tracking already
  exists from the b6603d1 work — verify and reuse).
- Tooling: `tools/server/spawn-in.mjs` for seeding, expansion-pack segments for
  plans, a campaign runner script (to be built, `tools/server/race.mjs`) that
  seeds both users, waits, harvests times, and appends to a results ledger
  (`docs/speedrun-ledger/*.json` — the trend line is part of the deliverable).

## Hypothesis backlog (seed list — the campaign grows it; try broadly before closing)

Spawning & bodies:
- Body-tier ladders per RCL/energy curve (miners, carriers, upgraders) — the bot
  overspawns tiny creeps past their era; derive tiers from energyCapacity, not
  snapshots of energyAvailable.
- Spawn-queue priority as a function of era (miner → carrier → upgrader vs
  builder weighting); eliminate head-of-line blocking losses.
- The RCL4-5 upgrader gates (storage floors) — tie to downgrade timers and era,
  not one number (first fix already landed; tune it with data).
Construction:
- RCL-aware plan build order (which 5 extensions first? tower timing vs eco?);
  MAX_SITES budget per era; builder counts vs sites remaining; avoid building
  roads before they pay for themselves.
- Container-before-storage era: is the first container placed at the right
  moment and place?
Energy flow:
- First-100-ticks choreography (harvest-to-spawn direct vs container-first);
  when the first dedicated filler pays for itself; loot/scavenge behavior in
  the pre-storage era.
- Carrier pathing/handoff efficiency in the pre-road era; pickup-lock tuning.
Macro:
- When remote mining starts paying at low RCL (with the remotes-disabled
  guardrail keeping the core honest); reserver timing.
- Colonisation-supporter sizing for freshly claimed rooms (auto-expand rooms
  ARE the early game, repeatedly — every claim is a fresh benchmark sample).
Each cycle: pick the highest-expected-value hypothesis, implement via Opus with
a tight spec, A/B it, keep or revert, commit, log the ledger entry, repeat.

## Process (same discipline as the planner goal)

- Fable curates every cycle; Opus implements and independently REVIEWS (fresh
  adversarial eyes on both the change and the measurement methodology — a biased
  benchmark is the failure mode to fear most here).
- Commit every kept cycle; ledger entry every cycle including reverted ones
  (a documented dead end is progress).
- Keep the live fleet healthy throughout (watchdog stays on; live bugs found
  along the way get fixed — they are usually speedrun findings in disguise).
- Periodically (every ~5 cycles) re-run the base-planner validator suite to
  prove the planner stayed perfect while the bot around it evolved.

## Status

- **Campaign STARTED 2026-08-13** in implement-and-review mode. Owner kicked
  this off now; the planner loop continues in parallel — do not wait on
  planner perfection.
- **A/B harness blocked** until local docker is allowed or `big_vps` seeds a
  race world. `tools/server/race.mjs` is local-docker-only; local docker is
  OFF on purpose. From this repo: no SSH, no VPS world/mod/tick changes, no
  spawn-in. Candidate dest is VPS (`npm run push-vps`) when there is
  something to measure.
- Control stays frozen at `e839fc8`. **Never** `npm run push-race`.
- Cycle 0: `docs/speedrun-ledger/CYCLE-0.md`.
