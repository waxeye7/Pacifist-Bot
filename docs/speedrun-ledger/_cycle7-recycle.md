# Cycle-7 recycle-200e — SEND BACK

`run-2026-08-15T15-45-27Z`. Same room assignment as leftover-5 cycle-5.

| | cand | ctrl | vs leftover-5 cand |
|---|---:|---:|---:|
| RCL2 | 835 8/8 | 910 | +96 |
| RCL3 | **15329** 8/8 | 13863 | **+4329** |
| RCL4 | 25962 3/8 | 25201 4/8 | +1450 on finishers |

Pairs that wrecked RCL3: E12S3 21145 vs 16334 (+4811, ctrlSteps 20), E18S9 20407 vs 13444 (+6963).

## Why the model was wrong

`recycleTinyShuttles` set `memory.suicide`. Upgrader then `recycle()` — stops upgrading and walks to spawn. Census skips suiciders so 6W hatch, but the 1W is already off the controller. Far rooms pay a long walk both ways.

Leaving the 200e to die naturally keeps ~0.5 e/t until TTL. Revert the two functions.

## World dirt (not the knob, but it inflated noise)

Race rooms have **no planV2** (`planPackMiss`). Extra containers at planner depot tiles (E5S3 40,42 / E12S3 18,30) are leftover objects: `race.mjs --wipe` only deletes `user ∈ racers`, so user-null structures survive. Memory.speedrun still has old `rclTimes` from ~4336k.

Cycle-8: full object scrub + memory scrub, then **site a real RCL3 depot on the legacy path** so 4W can park after a clean wipe.
