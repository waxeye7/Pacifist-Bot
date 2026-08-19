# Cycle 0 — adversarial construction review

Read-only. No PlanV2 / construction / builder edit. No docker. No commit.
Live race `run-2026-08-14T01-06-48Z` is a baseline, not a keep-or-revert
sheet. Metric: mean ticks spawn-placement → RCL4.

Assigned commits: `e8ece9e` `4384aa0` `8e5357c` `3cdcc08` `33e7647`.
HEAD overlay `9b3763f` rewrote `plannedTilesFor` / builder order after
those five — cited as live interaction, not a fifth-and-a-half win.

Live path: `room.memory.planV2` → `placeFromPlanV2` only
(`rooms.construction.ts:633–636`). Recycle every 15 ticks.

Builder `findLocked` now: spawnless-spawn → link/storage → RCL3 depot
(`builder.ts:53–71`) → tower (`:73–84`) → extensions (`:86–94`) → leftover
containers (`:96–104`) → RCL3 roads-only `suicide` (`:106–117`).

---

## Ranked 3 after this baseline

One knob each. Do not bundle a keep (RCL2 five-site budget, one-container
prefix, depot-first) into these diffs. Do not push over the running race.

### 1. RCL3 leftover five extensions: dump vs skip-to-RCL4 vs instant-10

**Why first.** 15k on the 135k. Live `9b3763f` holds at 5 until depot AND
tower exist, then dumps the next five (`PlanV2.ts:867–897`, `:900–907`).
`_ext-policy.md` said skip the whole climb. Instant-10 is what the five
assigned commits left in place.

800 is not dead. Home miner jumps at `energyCapacityAvailable >= 750`
to 6W (`rooms.spawning.ts:4112–4160`). Two sources → +4 e/t. Parked 4W
is already 500e at 550 (`:3385–3390`); 800 only buys `[4W,2C,2M]` (600e)
which HOL-blocks when available sits 550–599. The 15k pays if the 6W
hatches with enough climb left; it is a tax if dumped late or if the
4W was the only body they modelled.

`extensionTake` is a nested prefix (`slice(0,5)` ⊂ `slice(0,10)` ⊂ cap).
Migrate will not tear the RCL2 five down. Safe to A/B.

**A/B:** `extensionTake` RCL3 always 5 (skip to RCL4) vs always 10
(instant) vs live hold-then-dump. Same builder order.

### 2. RCL3 no-pave (`3cdcc08`) vs pave the `e8ece9e` subset

**Why second.** Largest energy the assigned commits actually spend or
save. `3cdcc08` refuses to *build* roads (`builder.ts:106–117`,
`rooms.spawning.ts:1329–1333`). `e8ece9e` still *sites* the eco+tower
subset (`PlanV2.ts:639–647`, `:1797–1800`). After `9b3763f` holds leftover
ext, PLACE_ORDER fills leftover slots with those unused roads
(`:1016–1029`). One dead road site steals a slot from the second ext
wave.

1:1 haulers already walk plains at 1 tick/tile (`rooms.spawning.ts:3693–3700`).
This set is 0–12% swamp. Roads on plains do not help 1:1. Swamp is 5
ticks/tile loaded — B4 (E11S6 / E8S3, ~10–12%) is the only plausible
hurt.

Do **not** revert `e8ece9e` to the full arterial / first-20. If `3cdcc08`
loses, keep the eco+tower filter.

**A/B:** keep no-pave **and** `roadsForRcl` return `[]` at RCL3 (stop
siting) vs pave the `e8ece9e` subset. Not full arterial.

### 3. RCL2 first container = nearest-to-sitter, not `plan.t.container[0]`

**Why third.** Keep `4384aa0`'s prefix of one (`PlanV2.ts:912–916`). Do
not revert to three 5k dirt walks at RCL2. The commit/CYCLE-0 line says
"nearest source." The code takes plan-order index 0 of the early set.
Planner source order is `objects.filter(type===source)`
(`layer-hub.mjs:1308`, `:1452–1479`) — not hub distance. Hard pairs have
spreads like 3+41 steps (E9S1). Siting the far seat first is the
opposite of the hypothesis.

Second source stays drop-mine + carrier until RCL3. That is already the
RCL2 policy for one source. Overflow is real only if the far source is
the one they *did* buffer.

**A/B:** among the early (non-mineral) seats, take min chebyshev/sitter
(or `plan.si` / storage tile). Same `1 ⊂ early ⊂ all` prefix. Not "site
two source containers at RCL2."

---

## Likely HELP mean ticks-to-RCL4

Revert last.

- **RCL2 `maxSitesFor === 5`** (`PlanV2.ts:30–36`, `:1737`). All five
  extensions site in one 15-tick pass. `RCL2_ORDER` still puts ext ahead
  of the one container (`:1049–1054`). `8e5357c`. Cheap. Keep.

- **RCL2 one source container, not three** (`PlanV2.ts:912–916`).
  `4384aa0`. Saves 10k + two dirt walks during the 45k. Controller depot
  belongs at RCL3 (unlocks parked 4W). Prefix is monotone. Keep the
  *count*; fix *which* tile (#3).

- **RCL3 builders recycle when only roads remain** (`builder.ts:106–117`,
  `rooms.spawning.ts:1329–1333`). `3cdcc08`. 1:1 plains already 1
  tick/tile. Arterial tiles are ~12k the controller wants. Keep unless
  #2's pave-subset wins on B4.

- **`earlyBuildSlots` cap 2 on non-road sites** (`rooms.spawning.ts:3340–3347`).
  `8e5357c`. Stops 4–6×300e pavement/HOL. RCL2 work is 5×3000+5000=20k;
  two `[W,2C,2M]` = 10 e/t if they work. Upgrade-bound if 4 shuttles
  staff. Keep unless time-to-550 is slow (#3 runner-up).

- **Depot before leftover work** (`builder.ts:53–71`). Not in the five
  commits (`4a824e8`). Parks the 4W. Keep.

---

## Might HURT mean ticks-to-RCL4

- **`e8ece9e` is dead for builder energy and live for site theft.**
  `roadsForRcl` still returns the eco+tower subset at RCL3
  (`PlanV2.ts:639–647`). `3cdcc08` will not build it. After `9b3763f`
  holds leftover ext at 5, PLACE_ORDER (`:1016–1029`) is tower → leftover
  containers → (no more ext) → **roads**. First RCL3 pass can be tower +
  depot + 2nd-source + 1 unused road. That road sits until RCL4 and
  occupies a slot the second ext wave wants. CPU: 8-way BFS every 15
  ticks (`:529–634`) for sites nobody builds.

- **`4384aa0` "nearest source" is false.** Plan-order `[0]`, not sitter
  distance. See #3.

- **`33e7647` tower before 2nd-source container** — then `9b3763f` put
  tower before leftover ext too (`builder.ts:73–84`). Tower is 3k that
  does not move the RCL4 clock. Campaign guardrail is "up *by* RCL3",
  not ASAP. 2nd source at RCL3 is a 5W drop-mine (10 e/t) into a pile
  carriers already haul. 3k tax vs 5k optional buffer. Guardrail, not a
  speed hypothesis. Spawn adversary already said this.

- **`9b3763f` dumps 15k mid-climb** after depot+tower. `_ext-policy.md`
  said skip until RCL4 because "800 is dead." 800 is not dead for the
  6W miner (`rooms.spawning.ts:4112`). Hold-then-dump is a third policy
  nobody measured. If the wave lands late, they pay 15k and hatch 6W
  with no climb left. If it lands early, they delay 800-cap miners for
  the depot+tower window (5k+3k / 10 e/t ≈ 800 ticks + walks) — that
  part is probably right.

- **`3cdcc08` recycle can dump cargo.** `findLocked` sets `suicide` and
  returns; `run` then `recycle()` while `store` may still hold 50–100e
  (`builder.ts:114–116`, `:225–238`). Recycle does not empty carry into
  the spawn. Small leak every time the last non-road site finishes.

- **Two builders stack on one extension.** `findLocked` sorts by
  `progressTotal` (all 3000) and returns `buildings[0]` (`:87–92`). No
  unique lock. Cap 2 does not parallelize 5 sites. Pre-existing; the
  roster change assumes a split that the picker does not do.

---

## Unmeasured speculation

Do not keep or revert on these.

- Swamp tax of no-pave on B4 only. Do not generalise to a swamp shard.

- Time-to-550 with 2 vs 3 builders. 5×3000 sequential at 10 e/t ≈ 1500
  ticks vs ~1000. Shuttle body upgrades at 550 (`:3378–3381`). RCL2 is
  45k; a 500-tick delay to 2W2C2M is real and smaller than #1/#2.

- `maxSitesFor(4)===8` after storage (`PlanV2.ts:34`). Clock has already
  stopped. RCL6 concern.

- Leftover RCL3 road sites at the RCL4 tick. Clock has stopped.

- `rcl3EcoAndTowerRoads` terminals are `plannedTilesFor(container, 3)`
  (all three seats), not the one built at RCL2. Correct for siting;
  irrelevant if nobody paves.

- Live RCL2 lean (cand 918 n=7 vs ctrl 1057 n=8 in `_ext-policy.md`) is
  the whole cycle-0 stack, `--swap` false, incomplete. **Not a result.**

---

## Assigned commits, one line each

| Commit | What it did | Verdict vs mean RCL4 |
| --- | --- | --- |
| `e8ece9e` | RCL3 road set = hub→src/ctrl + D8 + first-tower spur | Dead under `3cdcc08`. Keep the filter if paving returns. Do not revert to arterial. |
| `4384aa0` | RCL2 container prefix = 1 | HELP on count. HURT on which tile. See #3. |
| `8e5357c` | tower-before-roads; `earlyBuildSlots`≤2; 5 RCL2 sites | 5-site KEEP. Cap-2 KEEP unless time-to-550 is slow. Tower-before-roads superseded. |
| `3cdcc08` | RCL3 does not pave; no roads-only builder | Likely HELP on this set. See #2. |
| `33e7647` | tower before leftover containers | Guardrail tax. Absorbed by `9b3763f` builder order. Not a first A/B. |
| `9b3763f` *(HEAD)* | hold leftover 5 ext until depot+tower; then dump; RCL4 site budget 8 | See #1. Largest live construction lever. |

---

## Do not touch mid-race

PlanV2, `rooms.construction.ts`, `builder.ts` siting/priority, docker,
`push-race`, commit. This file is the review.
