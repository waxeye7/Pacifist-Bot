# EARLY-GAME SPEEDRUN CAMPAIGN (documented want — not yet started)

Owner's ask: a long-running goal/campaign to drive the **average time to reach RCL4
(first milestone), then RCL6** down as far as it will go — iterate until *extremely*
diminishing returns. "Improve the early game of the bot super much."

## Metric

- Primary: mean game-ticks from spawn-placement to RCL4, measured across a fixed
  benchmark set of rooms (mix of easy/median/hard terrain, both sources enclosed and
  not). Then the same to RCL6.
- Secondary (guardrails): CPU per tick stays within shard3-style limits (~20/tick,
  bucket-friendly); no regression in survival (tower up by RCL3, ramparts seeded);
  remote income may be used, but the benchmark must also pass with remotes disabled.
- Measure with the existing A/B harness: spawn-in tooling (`tools/server/spawn-in.mjs`),
  `pacifist-race` user for control-vs-candidate runs on identical rooms, watchdog
  RCL-timestamp lines as the clock (it already logs "reached RCLn!").

## Known starting points (from live observation, to be re-verified at campaign start)

- RCL2→3 and 3→4 are spawn-throughput-bound: rooms sit with full spawns and few
  upgraders; the RCL5 upgrader gate (`storage > 30000`) freezes progress entirely
  (task #4 item 2 — fix lands before the campaign or as its first move).
- Early rooms overspawn tiny creeps (2-work miners long past the point bigger bodies
  are affordable); body-tier ladders are conservative.
- Builder/upgrader balance during construction phases starves the controller
  (E17S4: 4 builders / 0 upgraders while sites existed).
- Colonisation supporters and the early-carrier pipeline recently improved — the
  campaign should baseline AFTER those fixes.
- Plan-v2 adoption at low RCL: check that the build order (spawn→ext→tower→storage)
  and MAX_SITES=4 budget aren't the bottleneck; consider RCL-aware site priorities.

## Shape of the campaign (when started)

1. Freeze a benchmark: ~6 rooms × N seeded runs, record ticks-to-RCL2/3/4 as baseline.
2. Cycle: hypothesis → change → A/B on the benchmark → keep only wins ≥ noise floor.
3. Stop when the last 3 cycles each bought < ~2% — that is the diminishing-returns
   line the owner called.
4. Then repeat with the RCL6 target (storage/link/tower-2 era; upgrader tiering and
   hauling economy dominate there).

## Status

- **Documented only. Not started.** Current active goal is the base-planner
  perfection cycle (docs/BASE-PLANNER-PERFECTION-GOAL.md); this campaign queues
  behind it (or behind explicit owner reprioritization).
