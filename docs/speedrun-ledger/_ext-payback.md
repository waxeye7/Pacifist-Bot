# RCL3 leftover-5 payback (550 → 800)

Energy math only. No code change. Clock: spawn → RCL4.
We **always** build the next five extensions; this file is only **when** the 15k is paid — on the 135k RCL3→4 climb, or on the 405k RCL4→5 climb.

Shipped today is **B** (`9b3763f`, `rcl3SecondExtWaveReady` in `src/utils/PlanV2.ts`). Adversary rec is **C**.

---

## Verdict

| Question | Answer |
| --- | --- |
| Who wins the RCL3→4 clock? | **C.** Then B. A last. |
| Does 5W→6W pay back the 15k before RCL4? | **No.** Source already saturated at 5W. |
| Does C lose RCL4→5 by enough to matter? | **No** if the metric is spawn→RCL4 (that cost is off the clock). Even on spawn→RCL5, C is still net ahead. |

**One line:** 800 buys no extra controller e/t on the 135k. Pay the 15k after RCL4.

---

## Verified facts

Engine (`docs.screeps.com` Constants) + this bot.

| | |
| --- | --- |
| RCL3→4 | `CONTROLLER_LEVELS[3] = 135000` |
| RCL4→5 | `CONTROLLER_LEVELS[4] = 405000` |
| Ext / container / tower / storage | 3000 / 5000 / **5000** / 30000. (`_ext-policy.md` wrote tower 3k — that is `TOWER_HITS`, not `CONSTRUCTION_COST`.) |
| Next 5 ext | 5 × 3000 = **15000** (11% of 135k, 3.7% of 405k). Cap 550 → 800. |
| Parked 4W | `[4W,C,M]` = 500e, 4 e/t on a fed depot. 4 of them = **16 e/t**. `parkedUpgraderBody` at 550. |
| 4W at 800 | still 4 WORK. `getBody([W,W,C,M])` at cap 800, 85% budget 680 → `[4W,2C,2M]` = 600e. Same 16 e/t, +100e spawn, HOL if available is 550–599. |
| 5W miner | `[5W,M]` = 550. Unlocks at cap 550. **Already have.** 2 e/W × 5 = 10 e/t = `SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME`. |
| 6W+1M (hypothetical) | 650e. Fits in 800. Walks **slower** than 5W+1M (6 t/tile plains vs 5). Still 10 e/t. |
| 6W+3M (shipped) | `[2M,6W,M]` = 750e. `energyCapacityAvailable >= 750` and RCL < 6 (`rooms.spawning.ts:4112–4160`). 800 unlocks this. Still 10 e/t. |
| 8W+1M | 850e. **Does not fit in 800.** Still 10 e/t. |
| Spawn | `CREEP_SPAWN_TIME = 3` **per part**, not per 50e. WORK is 100e / 3 ticks. 4W = 18 ticks (not 30). 5W+1M = 18. 6W+1M = 21. 6W+3M = 27. |
| Income | 2 sources × 10 e/t = **20 e/t**. Benchmark rooms are 2-source. |
| Builders | 2 × `[W,2C,2M]`, `BUILD_POWER = 5` → 10 progress/t, 10 e/t while building. |
| Race | local ~1 s/tick. 938 ticks ≈ 16 min. 1125 ≈ 19 min. 750 ≈ 12.5 min. |
| RCL3 roster | 4 upgraders. RCL4 roster | 5 upgraders (`spawnrules[4].amount`). |

Shared during RCL3 (all three policies): controller depot 5k + first tower 5k. Guardrail is tower-by-RCL3. Those 10k are not the question.

---

## What 800 actually buys

Nothing that raises controller e/t on the 135k.

| Body | 550 | 800 | Δ e/t to controller |
| --- | --- | --- | --- |
| Parked upgrader | `[4W,C,M]` 500e, 4 e/t | `[4W,2C,2M]` 600e, 4 e/t | 0 |
| Home miner | `[5W,M]` 550e, 10 e/t | `[6W,3M]` 750e, 10 e/t | 0 (source cap) |
| RCL1–3 carrier | cap `[4C,4M]` 400e | same hard cap | 0 |
| RCL1–3 builder / repair | `[W,2C,2M]` / `[W,C,M]` | same hardcoded | 0 |
| 8W miner | — | 850 > 800 | n/a |
| 8W upgrader | — | needs `getBody([4W,C,M])` × 2 = 1000, 85% clamp → cap ≈ 1177 (18 ext) | n/a |

800 is a **spawn-tax trap**: 600e parked body and 750e miner wait longer than 500 / 550, and `depotSink` still holds a 550e floor (`carry.ts:152–158`).

---

## 5W → 6W does not pay back 15k

Source: 3000 energy / 300 ticks = **10 e/t**. 5W already hits that. 6W peaks at 12, then sits 50 ticks empty. Average still 10.

So extra harvest from the 15k is **0 e/t**. Payback time is infinite. This is true of 8W at 850 too.

Walk-in only (the 6W+3M’s extra MOVE, not the user’s 6W+1M):

- Plains: fatigue 2 per non-MOVE, 2 per MOVE per tick. 5W+1M = 5 t/tile. 6W+1M = 6 t/tile (worse). 6W+3M = 2 t/tile.
- ~12-tile walk: 60 vs 24 ticks. Save 36 ticks × 10 e/t = 360e per replacement.
- Climb floor 135000 / 16 = **8438 ticks**. ~5.6 miner lives / source × 2 = ~11 replacements. 11 × 360 = **4.0k** recovered.
- Extra body cost 200e × 11 = **2.2k**. Net ~1.8k against 15k. Payback ~70k ticks. Not before RCL4. Not before RCL5.

Counterfactual if someone ignores the source cap (+2 e/t per miner = +4 e/t): payback 15000 / 4 = 3750 ticks, which *would* fit in 8438 — **but the 4 parked 4W only sink 16**. Extra 4 e/t hits the floor unless a 5th 4W exists. Roster is 4. And the +4 e/t is false.

**Do not spend 15k to unlock 6W.**

---

## Three policies vs A

Assume 4 parked 4W = 16 e/t once the depot exists and is fed. Construction energy is 1:1 off the controller (builders and upgraders share the same 20 e/t).

| | A Instant | B After depot+tower (`9b3763f`) | C Not until RCL4 |
| --- | --- | --- | --- |
| When the 15k is paid | first thing at RCL3 | after depot 5k + tower 5k stand | after the 135k, on the 405k |
| 15k on which climb | 135k | 135k | 405k |
| Energy-only extra vs A (16 e/t constant) | 0 | **0** (same 15k, same rate) | **−938 ticks** (15000/16) |
| Starvation extra vs A | 0 | **0 to −281** | **−1125 ticks** |
| Depot delay vs A | 0 (worst) | parks ~1500 ticks sooner | parks with B, then never starves for ext |

### Energy-only (the 16 e/t assumption)

135k / 16 = **8438 ticks** floor.
A and B both dump 15k into ext during that climb → 150k / 16 = **9375**. Order does not change the total when the rate is constant.
C leaves the 15k off this clock → **8438**. **C is 938 ticks faster than A** (~16 min at 1 s/tick). **B ties A.**

### Starvation (what this bot actually does at cap 550)

`depotSink` feeds the depot only when `energyAvailable >= min(550, cap)`. Two 1W builders withdraw from spawn/ext at 10 e/t. At cap 550 that drops available below 550 every tick they work. Parked 4W go dry and fall back to shuttle (~4 e/t).

Then the 15k is not “+938 on a live 16 e/t sink.” It is **1500 ticks of 4 e/t** (15000/10) instead of 16. Lost: 12 e/t × 1500 = 18000 controller energy = **1125 ticks** vs C.

A and B both pay that 15k during RCL3, so they **tie** on the 15k itself under full starve. B still beats A on **when parking starts** (depot is 5k, not 20k, into the level). If B’s builders haul from source piles instead of spawn, leftover 7 e/t can still feed the depot during the 15k and B picks up ~281 ticks on A. C still wins.

A is the only policy that spends the 15k *before* the depot exists. That is 1500 extra shuttle ticks (4 e/t, not 16) on top of everything above. Do not do A.

---

## C on the RCL4→5 clock

C still builds the five. They land on the 405k, after storage (`PLACE_ORDER`).

RCL4 start rate: 5 × 4W = **20 e/t** (`spawnrules[4]`; 800 still does not buy a second 500e segment). 15000 / 20 = **750 ticks** (~12.5 min). 8W upgraders need ~18 ext (cap 1200, 85% = 1020). C is 15k of ext behind A/B at RCL4 start — that is the **same** 750 ticks, not a second penalty.

| Metric | C vs A |
| --- | --- |
| spawn → RCL4 (campaign) | **C wins by 938–1125 ticks.** The 750 is not on this clock. |
| RCL4 → RCL5 only | C loses **750 ticks** (3.7% of the 20250-tick 20 e/t floor). |
| spawn → RCL5 | C still **ahead 188–375 ticks** (saved 16 e/t, paid 20 e/t). |

If they later reach 8W × 5 = 40 e/t, C’s 15k costs 375 ticks and the combined lead grows.

**Campaign metric is spawn→RCL4 only.** C’s RCL4→5 loss does not matter. It is not large enough to flip a later RCL5 milestone either.

---

## Numbers in one place

```
15k / 16 e/t  =  937.5 ticks     energy-only tax of paying on the 135k
15k / 10 e/t  = 1500   ticks     builder window (2 × 1W)
12 e/t × 1500 = 18000  energy    starve loss vs staying at 16
18000 / 16    = 1125   ticks     starve tax vs C
15k / 20 e/t  =  750   ticks     same 15k on the 405k at 5 × 4W
135k / 16     = 8438   ticks     RCL3→4 floor at 4 parked 4W
405k / 20     = 20250  ticks     RCL4→5 floor at 5 × 4W
```

---

## Rec

Ship **C**: hold `extensionTake(3)` at 5 until RCL4. Keep depot → tower (guardrail). Recycle builders once only roads remain. Dump the deferred 5 with the RCL4 ten, after storage.

B is a compromise that still spends 11% of the 135k on a dead cap. A is strictly worse than B (late depot) and strictly worse than C (15k on the wrong climb).
