# RCL2 ideas — adversarial, after the in-flight race

Read-only review. No spawn/build edit. Do not touch `run-2026-08-14T01-06-48Z`.
Metric split: spawn→RCL2 (200 progress) and RCL2→RCL3 (45k). Bench is 2-source
every room (`BENCHMARK-ROOMS.json`). Mean `ctrlSteps` on the live run ≈ 13.

Live rungs (HEAD, `rooms.spawning.ts`):

| cap | home miner | RCL2 upgrader | builder |
| --- | --- | --- | --- |
| 300 | `[2W,M]` 250 (bootstrap `[W,C,M]` 200) | `getBody([W,C,M])` = **200** | `[W,2C,2M]` 300 |
| 350–500 (1–4 ext) | `getBody([W,W,M])` still **one 250 segment** (85% of 500 = 425) | still **200** | 300 |
| 550 (5 ext) | **`[5W,M]` 550** | **`[2W,2C,2M]` 450** | 300 |
| 750 | `[6W,3M]` 750, still 10 e/t (`_ext-6w.md`) | n/a | 300 |

There is **no 3W/4W miner and no 450 shuttle below 550**. Cap 350–500 is a dead
zone. `_ext-policy.md` “slam 5 for the 5W” is the right *action* and the wrong
*RCL2 reason*: four shuttles cannot sink 20 e/t. The RCL2 clock moves when the
**shuttle body** unlocks. 5W pays builders, `pressure.burn`, and RCL3.

---

## 1. Trickle 1–2 ext (stay on 2W) — KILL

**Dead.** 1 ext = 350, 2 ext = 400. Both still 2W miner and 200e `[W,C,M]`
shuttle. You pay 3–6k and unlock nothing.

Shuttle delivered e/t at L=13 (harvest + upgrade + 2L walk, 1 t/tile plains):

- `[W,C,M]` tank 50: `50 / (75+26) = 0.50`
- `[2W,2C,2M]` tank 100: `100 / 101 = 0.99`

Roster 4, no depot (RCL3):

| policy | income | sink | 45k wall |
| --- | --- | --- | --- |
| stay 300 / trickle 1–2 | 8 e/t (2×2W) | **2.0** e/t | **22.5k ticks** (upgrade-bound) |
| slam 5, then 450 shuttle | 8 then 20 | **4.0** after 550 | ~2.5k to finish 15k ext (builders take ~6, 4×0.50 take ~2) **+ 30k/4.0 = 7.5k → ~10k** |

Trickle loses **~12k ticks** RCL2→RCL3. Income-only naive (ignore sink) is still
45k/8 = 5625 vs 15k/8 + 30k/20 = 3375 (**+2.3k**). Same sign.

Stopping at 1–2 then finishing the last 3–4 at RCL3 also loses: you enter 3 at
cap 400, still 200e shuttles, and pay 9–12k more before 550 *during the 135k*.

Do not A/B trickle-and-stay-2W. The only remaining “not all 5” shape is §8.5
(drop the shuttle *gate* to 450 / 3 ext). That is a different idea.

---

## 2. First source container before last 1–2 ext — KILL

Last 1–2 ext *are* 500→550. Container is 5k and does not raise cap.

- Delay to 550 ≈ `5000 / 6` ≈ **830 ticks** (8 e/t minus ~2 in shuttles).
- Those 830 ticks stay on 0.50 e/t shuttle instead of 0.99. Loss `0.50×830 ≈ 415e` plus the delayed 5W.
- Drop-mine decay at 2W with carriers sized to live WORK is ~0. Container pays
  after 5W (10 e/t pile). That is *after* 550.

Live already does the right order: `RCL2_ORDER` sites ext first
(`PlanV2.ts:1049–1054`), `maxSitesFor(2)===5` (`:32–33`), builder `findLocked`
finishes every extension site before any container (`builder.ts:86–103`).

Keep: 5 ext, *then* one source container. Which tile is a later A/B (§8.4), not
when.

---

## 3. Builder 6 / 4 / 6 — already dead as live policy

`spawnrules` amounts are 6 / 4 / 6. `earlyBuildSlots` is `min(cap, useful, 2)`
on non-road sites, 1 once only roads remain (`:3340–3346`). RCL3 roads-only
queues **zero** (`:1331–1333`).

Live roster is **2** (RCL1–3, real sites), not 6/4/6. RCL1 almost never queues:
no ext/container sites (`typeAllowedAtRcl`). They are not starving upgrade with
six 300e bodies.

2 vs 1 at RCL2 (5×3000+5000=20k, 1W builders, income 8):

- 1 builder ~3 e/t effective + ~5 to ctrl → 15k ext in ~5k ticks.
- 2 builders ~6 e/t + ~2 to ctrl → 15k in ~2.5k ticks, then 450 shuttle earlier.

2 wins time-to-550. They **stack on one site** (`findLocked` sorts
`progressTotal`, all 3000, returns `[0]`). Energy-same (10 e/t into one 3k tile).
Do not revert to 4–6. Optional tiny A/B: 2 vs 1, only if time-to-550 looks slow.

---

## 4. Shuttle `[2W,2C,2M]` at 550 vs stay smaller — KEEP 450

Stay `[W,C,M]` at roster 4 is 2.0 vs 4.0 e/t. Remaining 30k: **15.0k vs 7.5k
ticks**. Stay-smaller loses ~7.5k on RCL2→RCL3.

Two 200e bodies ≈ one 450e on delivered e/t, but the roster is 4, not 8. Stay
smaller only ties if you also double `amount`. Cost: 4×450=1800 vs 4×200=800.
Miners `unshift` first, so the 550 `[5W,M]` still wins HOL.

`[4W,C,M]` at RCL2 stays dead (weight 5 / 1 MOVE = 3 t/tile, tank 50, ~0.3–0.5
e/t). Do not A/B “stay 200 at 550” unless bundled with `amount: 8`.

---

## 5. `earlyBuilderBody` `[W,2C,2M]` vs `[W,3C,M]` — keep 2C2M, small

CYCLE-0 / spawn adversary say `[W,2C,2M]` is 2 t/tile loaded. **Wrong.**

Loaded plains weight: CARRY full = 1, WORK = 1, MOVE = 0. Fatigue drain = 2×MOVE.

- `[W,2C,2M]`: weight 3, drain 4 → **1 t/tile**
- `[W,3C,M]`: weight 4, drain 2 → **2 t/tile**

Throughput on plains, L=15, 1W build 5 e/t:

- 2C2M: tank 100, cycle 15+20+15=50 → 2.0 e/t
- 3CM: tank 150, cycle 30+30+15=75 → 2.0 e/t

Same. 2C2M wins first-site latency and swamp (4 t/tile vs 10). The real bug
`[W,3C,M]` had was `getBody` stacking to 600e at cap 800. At RCL2 both are 300e.

Expected A/B delta: **~0–50 ticks** on this set (0–12% swamp). Not top 5.

---

## 6. First-100-ticks harvest-to-spawn vs container-first

**Container-first is illegal at RCL1** (`typeAllowedAtRcl` container ≥ 2). This
is not an A/B. RCL2 container-first is §2 (killed).

Live harvest-to-spawn is the 2-source bug already in `_cycle0-adversary-spawn.md`:

1. Source A: `[W,C,M]` 200. Source B sees `homeHasMiner` and `unshift`es
   `[W,W,M]` 250 (`:4194–4199`). Head is the 250. Leftover 50 buys neither the
   200 nor the `[C,M]`.
2. `[W,C,M].lastSpawn = T-(1500-100)` queues a **third** miner at T+100
   (`:4207–4210`) while the 1W still has ~1400 TTL.
3. `dumpMinerEnergy` walks in only if no hauler and spawn ≤8 (`energyMiner.ts:192–202`).
   Bench `srcStepsSum` is 5–47; the far source always drops. A CARRY miner
   cannot drop-mine — dump is a harvest skip.

Every bench room is 2-source. The ledger line “first energy ~100 ticks sooner”
is false on this set. Easy rooms with a source inside 8 (srcStepsSum 5–8) are
the only place 200+100 can pay.

A/B after the race (one knob at a time, same order as the spawn adversary):
one home miner until `[C,M]` hatches → drop the T+100 re-arm → then
`[W,C,M]+[C,M]+dump` vs old `[2W,M]+[C,C,M]`.

Expected spawn→RCL2: **50–200 ticks** if the HOL 250 dies. Sign flips on far-only
rooms if you keep a CARRY miner on the long source.

---

## Ranked 5 to A/B after this race

Do not patch the running baseline. One knob each. Deltas are model, not
measured. Spawn→RCL2 is a ~1k-tick clock (live RCL2 elapsed 381–1149); RCL2→RCL3
is the 45k wall.

| # | idea | spawn→RCL2 | RCL2→RCL3 | why |
| --- | --- | --- | --- | --- |
| **1** | Recycle `[W,C,M]` the tick cap hits 550, queue `[2W,2C,2M]` (keep `amount: 4`) | ~0 | **−2k to −6k** if old 200e bodies have ≥400 TTL | After slam, RCL2 is upgrade-bound at 2.0 until the 200e die (up to 1500t). 4.0 vs 2.0 on the leftover 30k is 7.5k ticks; TTL leftover clips it. Do **not** bundle `amount` |
| **2** | RCL2 `upgrade_creep.amount` 4 vs 6 (450 bodies, after 550 only) | ~0 (do not raise during slam) | **−1.5k to −2.5k** | 6×0.99=5.9 vs 4.0; 30k/5.9=5.1k vs 7.5k. +900e +90 spawn. `pressure.burn` already +0–4 when the floor piles — measure whether 6 is just burn-always |
| **3** | RCL1 bootstrap: one miner until `[C,M]` hatches; drop T+100 2W re-arm | **−50 to −200** | small carry-in | Fixes the 250 HOL on every 2-source room. Third miner at T+100 is anti-200-progress |
| **4** | RCL2 container tile = min sitter/chebyshev among early seats, not `plan.t.container[0]` | 0 | **−200 to −800 on hard** (0 on easy) | Keep prefix of **one** after all 5 ext. Planner source order is `objects.filter(source)`, not hub distance. E9S1-class 3+41 spreads site the far 5k dirt walk. Does not move 550 |
| **5** | Force `[5W,M]` replace when cap hits 550 (`lastSpawn` now ~T+1050 on the 2W path, `:4186`) | 0 | **−100 to −400** | 5W does not raise 4-shuttle sink. It fills ext/container and feeds `pressure.burn`. Pays more if #2 wins. Suicide leftover 2W TTL is the cost |

Not ranked, do not spend a race on them first:

- Trickle 1–2 stay 2W — dead (§1).
- Container before last ext — dead (§2).
- Revert builders to 6/4/6 — dead (§3).
- Stay `[W,C,M]` at 550 — dead unless `amount` doubles (§4).
- `[W,3C,M]` — noise (§5).
- Container-first at RCL1 — illegal (§6).
- Shuttle gate 450 / 3 ext, then last 2 — only leftover “trickle.” Unlocks 0.99
  e/t ~750 ticks earlier, delays 5W by 6k. Smaller than #1. A/B only if #1/#2
  saturate the sink and time-to-550 is still fat.
- RCL2 repairer at `progress > 4500` with no hit check (`:1303`) — 200e idle
  until a container exists. ~30–80 ticks. Fold into a spawn-HOL sweep.
- Split `findLocked` so 2 builders take 2 sites — energy-same while income-bound.

---

## Slam all 5 at RCL2 — CONFIRM

Keep `maxSitesFor(2)===5`, `RCL2_ORDER` ext-before-container, builder ext-before
container. Binary: 300 or 550. Intermediate caps buy zero bodies.

Confirm because **550 is the shuttle gate**, not because 5W saturates the tile.
`_ext-policy.md` “do not sit on a 2W for the 45k” is right; “550 / 5W miner” as
the RCL2 *clock* oversells income in a 4-shuttle room. 5W is the RCL3 carry-in.

In-flight race is the baseline for this stack. Next race starts at #1.
