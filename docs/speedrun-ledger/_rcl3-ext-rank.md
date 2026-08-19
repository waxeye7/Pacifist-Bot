# RCL3 leftover-5 ranking (spawn → RCL4)

Read-only rec. No code change this file. No race times invented
(`run-2026-08-14T01-06-48Z` is still RCL2-only). Clock: spawn → RCL4,
so an RCL3→4 delta **is** the spawn→RCL4 delta (RCL1–2 unchanged).

**Rec: C — hold `extensionTake(3)` at 5 until RCL4.** 800 is dead
(5W already 10 e/t; parked 4W is 500e). Paying 15k on the 135k costs
**938** ticks energy-only, **1125** if builders starve the depot.
`I` never pays. Do not dump after depot+tower (`B`).

Numbers from `_ext-payback.md` / `_ext-6w.md` / `_rcl3-sites-roads.md`.
Tower build cost is **5000** (`CONSTRUCTION_COST`), not 3000
(`TOWER_HITS`; `_ext-policy.md` line 8 is wrong).

---

## Model (not a race)

2-source rooms. 2 × 5W = **20 e/t** in. 4 parked 4W = **16 e/t**
upgrade once the depot exists and is fed. 2 × `[W,2C,2M]` builders =
**10 e/t** / 1500 ticks to finish 15k. Shared RCL3 infra (every
policy): depot 5k + tower 5k.

```
15k / 16 e/t           =  938   energy-only tax of paying on the 135k
15k / 10 e/t           = 1500   builder window
12 e/t × 1500          = 18000  starve loss (16 → 4 while builders drain spawn)
18000 / 16             = 1125   starve tax vs C
6k / 16                =  375   I's 2-ext energy-only
135k / 16              = 8438   RCL3→4 floor at 4 parked 4W
15k / 20 e/t           =  750   same 15k on the 405k (off this clock)
```

Starve path: `depotSink` (`carry.ts:152–161`) only feeds the depot
when `energyAvailable >= min(550, cap)`. Two 1W builders pull 10 e/t
out of spawn/ext; at cap 550 that drops the floor every tick they
work. Parked 4W go dry and shuttle (~4 e/t). Constant-rate algebra
then says A=B=D=E=F=G on the 15k itself; only **when** it is paid
and **whether** the depot is already up change the second-order terms.

800 unlocks **0 controller e/t**:

| body | 550 | 800 |
| --- | --- | --- |
| parked upgrader | `[4W,C,M]` 500e, 4 e/t (`parkedUpgraderBody` `:3384–3390`) | `getBody([W,W,C,M])` 85% of 800=680 → `[4W,2C,2M]` **600e**, still 4 e/t |
| home miner | `[5W,M]` 550e, 10 e/t (`:4166–4177`) | `[M,M,6W,M]` **750e** (`:4112–4160`), still 10 e/t |
| RCL1–3 carrier / builder / repair | hard-capped 400 / 300 / 200 | same |

5W already saturates `SOURCE_ENERGY_CAPACITY/ENERGY_REGEN_TIME = 10`.
6W theoretical 12, average 10. Walk-only recover of `[6W,3M]` vs
`[5W,M]` is ~1.8k net on ~11 replacements — payback **~70k ticks**,
not on the 8438-tick floor. `_ext-policy.md:13` “next miner rung is
750 and still 5W” is wrong on parts, right on yield (`_ext-6w.md`).

8W upgrader is `getBody([4W,C,M])` × 2 = 1000; 85% clamp needs cap
≈ **1177** (18 ext), not 800.

---

## Live hooks

- `extensionTake` / `rcl3SecondExtWaveReady` — `PlanV2.ts:873–897`.
  RCL3 take=5 until **own tower AND** controller depot (range≤4, not
  source-adj). Then take=10. Nested prefix `5 ⊂ 10 ⊂ cap`.
- `maxSitesFor` — `:32–36`. 5 at RCL2, **4** at RCL3, 8 at RCL4+
  with own `room.storage`.
- `PLACE_ORDER` — `:1016–1030`. RCL3: tower → container → ext → …
  → road. Not `RCL2_ORDER`.
- `placeFromPlanV2` every 15 ticks — `rooms.ts:339–340`.
- `roadsForRcl` / `rcl3EcoAndTowerRoads` — `PlanV2.ts:532–650`.
  Hold-5 leftover slots become **4 empty arterial roads**.
  Builders `suicide` on roads-only (`builder.ts:106–117`);
  spawn skips roads-only (`rooms.spawning.ts:1329–1333`);
  **sites are not removed**.
- Builder `findLocked` — `builder.ts:53–104`: spawnless-spawn →
  storage/link → **RCL3 depot → tower → ext → leftover containers**
  → roads-suicide. `_ext-policy.md:3` (“depot → all ext → tower”)
  is stale.
- `earlyBuildSlots` — `rooms.spawning.ts:3340–3347`. `min(cap, useful, 2)`.
- First RCL3 pack (5 ext + 1 source container already up):
  take=5 → tower + 2 leftover containers + **1 road**.
  take=10 → tower + 2 leftover containers + **1 ext**.

A below is **old instant-10** (ext finished before depot/tower if
`findLocked` is wrong). Instant-10 + **live** `findLocked` is
≈ D/B on build order (depot still first).

---

## Policies

Each: (1) energy off the controller (2) body unlocks (3) site-budget
(4) when the 15k is paid (5) RCL4 storage-first (6) steelman WIN.

### A — Instant 10 the tick we hit RCL3

1. **15k on the 135k.** Old order also delays the depot by that 15k
   → 1500 extra shuttle ticks at ~4 e/t instead of 16. Live
   `findLocked` does depot first, so A_live only pays the 15k, not
   the delay.
2. 800: 600e `[4W,2C,2M]` + 750e `[6W,3M]`. 0 extra e/t. HOL if
   available sits 550–599 (`depotSink` still floors at 550).
3. First pack: 1 ext not 1 road. After infra, 4 ext occupy the
   budget (good for slots, bad for energy). 2nd-source container
   waits behind ext (`findLocked` ext > leftover containers).
4. Tick 0 of RCL3 (siting). Finish: first if order wrong; after
   depot+tower if live.
5. Arrives RCL4 at cap 800. `PLACE_ORDER` still storage then 10 new
   ext. Cleanest RCL4 prefix. Clock already stopped.
6. **Steelman:** 550→800 buys 6W and +4 e/t, payback 15k/4=3750 <
   8438. **False.** Source cap 10; roster is 4×4W=16, not 20.
   A_old is the only policy that starves the parked 4W of a depot.

**Δ vs B:** **+0** (A_live) to **+200…+1125** (A_old depot delay).
**Δ vs A:** 0.

### B — After depot+tower (LIVE)

`rcl3SecondExtWaveReady` then `extensionTake` → 10.

1. **15k on the 135k**, after the 4W can park. Energy-only **ties A**.
   Starve **ties A** on the 15k; wins the depot-start race vs A_old
   (0 to −281, `_ext-payback.md`).
2. Same dead 800 as A, ~800+ ticks later.
3. First pack plants **1 unused road**. After ready: leftover road
   site steals 1 of 4 from the ext wave (`_rcl3-sites-roads.md`).
   Then ext block 2nd-source.
4. After depot 5k + tower 5k stand. Mid-climb, worst time to steal
   from a working 16 e/t sink.
5. Same as A: cap 800, storage then 10 ext. CYCLE-0's reason to dump
   (“RCL4 does not also eat 15k”) is an **RCL6** argument.
6. **Steelman:** unlock 6W with enough climb left that walk-in pays;
   don't leave 15k of RCL3 ext on the 405k. Walk-in recovers 1.8k.
   RCL4→5 tax is 750 ticks and **off this clock**. C is still ahead
   even on spawn→RCL5 (`_ext-payback.md`: 188–375).

**Δ vs B:** 0.
**Δ vs A:** **0 to −1125**.

### C — Hold until RCL4 (policy-doc rec)

`extensionTake(3)` stays 5. RCL4 `return engineCap` (20) dumps
deferred 5 + 10 new after storage.

1. **0 of the 15k on the 135k.** Infra only (depot+tower, then
   leftover 2nd-source if builders reach it). −938 energy-only vs
   anyone who pays 15k here; −1125 under starve.
2. **None.** Stays 550: `[5W,M]` + `[4W,C,M]`. No 600e/750e HOL.
3. After infra: **4 empty eco+tower roads** fill `maxSitesFor(3)`.
   Energy 0 (suicide). RCL4 `budget = 4 − 4 roads = 0` until a road
   finishes or is removed — storage wait is **after** the clock
   (`_rcl3-sites-roads.md`). Best combo is hold-5 **and**
   `roadsForRcl → []` at lvl 3; that is a different A/B.
4. After RCL4, after storage (`PLACE_ORDER` `:1017–1024`).
5. C is why storage-first exists: 15 leftover+new ext would lock 4
   slots for thousands of ticks with no bank. Storage 30k first,
   then 15×3k on the 8-slot post-storage budget. 15k extra vs B
   **after** the metric stops.
6. **Steelman:** it is the ranking. 800 buys 0 e/t; 15k at RCL4 is
   free for spawn→RCL4; even spawn→RCL5 still nets C ahead.

**Δ vs B:** **−938 / −1125**.
**Δ vs A:** **−938 / −1125**, plus A_old's depot delay.

### D — After depot only (don't wait for tower to site leftover 5)

1. Same **15k on the 135k**. Live `findLocked` still finishes tower
   before ext (`builder.ts:73–84`), so build order ≈ B. Only siting
   moves earlier (during the tower window).
2. 800 a few hundred ticks sooner than B → more 600e/750e HOL.
3. After depot, leftover slots go to ext not the dead road. Cleaner
   than B, same 4-slot cap.
4. 15k starts ~500 ticks (tower 5k/10 e/t) earlier than B. Same
   total energy.
5. Same as B.
6. **Steelman:** 800 lands faster so 6W hatches with more climb left.
   6W is still +0 e/t. Earlier dump is weakly **worse**.

**Δ vs B:** **0 to +50**.
**Δ vs A:** **0 to −1125**.

### E — After tower only

1. Happy path = B (builders do depot then tower; both exist the same
   tick). **15k on the 135k**.
2. Same as B.
3. Same as B.
4. Same as B if depot sited. If the depot tile is blocked, E dumps
   15k **without** a parked 4W → A_old.
5. Same as B.
6. **Steelman:** tower is the campaign guardrail; site ext the moment
   the room is “safe.” Tower does not move the RCL4 clock. Depot is
   the body unlock; waiting on tower without waiting on depot is the
   failure mode.

**Δ vs B:** **0** happy / **A_old** if no depot.
**Δ vs A:** **0 to −1125**.

### F — After `controller.progress >= 50%` of 135k

1. Same **15k on the 135k**. Constant-rate ticks **tie B**
   (`_rcl3-spend-model.md`: A=B=D=F).
2. 800-cap HOL / 6W tax for ~half as long as B (~125 ticks of
   0.27+0.27 e/t spawn waste, not a new income term).
3. Hold-5 until 67.5k, so **4 dead roads** for the first half
   (same hole as C/B-before-ready). Then 4 ext.
4. Mid-climb, after infra. Same 1500-tick builder window.
5. Same as B.
6. **Steelman:** dump when the sink is fat / floor piles exist, so
   15k comes off decay not the 16 e/t. If `drainPressure`
   (`rooms.spawning.ts:3541–3593`) is still seeing 14k floor, maybe.
   Live intent is 4 parked 4W + `depotSink` @550 — after that the
   room is upgrade-bound and F=B on the 15k. Dominated by C.

**Δ vs B:** **0** energy, **−80 to −200** HOL window.
**Δ vs A:** **−200 to −1125**.

### G — After 2nd source container exists

`plannedTilesFor(container)` RCL3 take = `staged.early` (`:912–916`)
= both sources + depot. First pack already **sites** the 2nd source.
G only delays **leftover ext siting** until that container **stands**.

1. Same **15k on the 135k**. 2nd-source 5k is also paid in RCL3
   (C/B pay it too; B after ext, G/C before).
2. Same dead 800, later than B.
3. After depot+tower+2nd-source: leftover slots were 1 road (hold)
   then 4 ext. 2nd-source is **not** blocked by ext (B/A block it).
4. After 5k more infra than B. Same 15k still on this climb.
5. Same as B.
6. **Steelman:** 2nd source drop-mine decays while B spends 1500
   ticks on ext; a container saves 1–2 e/t overflow. Income is 20,
   sinks are 16+10+spawn — leftover ≈ 0 if haul works. Save
   0–190 ticks of decay, not 15k.

**Δ vs B:** **0 to −190**.
**Δ vs A:** **−200 to −1125**.

### H — Site leftover 5 instantly; builders never finish them until RCL4

1. **0 of 15k** if the skip is real → C's energy. Live `findLocked`
   **will finish them** (ext at `:86–94` before suicide). Unpatched
   H **is A_live**.
2. None while they sit. The tick they finish (RCL4 or by accident)
   = B's 800 trap, later.
3. **This is the policy.** After infra, 4 ext sites fill
   `MAX_SITES=4`. Roads cannot site. `earlyBuildSlots` counts ext
   as useful → 2 builders stay queued. Closest-site fallback
   (`:121–122`) still picks ext unless all three of findLocked /
   earlyBuildSlots / closest filter them out.
4. Sited at RCL3 tick 0. Paid at RCL4 — or mid-climb if the skip
   leaks.
5. **Bricks storage-first.** `maxSitesFor(4)` is 4 until
   `room.storage` exists; 8 only after. `budget = 4 − 4 ext sites
   = 0`. Storage cannot site. No `spawnFirstLockdown`-style evict
   for storage (`PlanV2.ts:130–146` is spawnless-only).
6. **Steelman:** C's energy save without waiting to site at RCL4.
   Strictly dominated: if the skip holds, C is the same energy
   without hostage sites; if it leaks, H is A.

**Δ vs B:** **−938/−1125** (patched, ignore storage brick) or **0**
(unpatched). Do not ship.
**Δ vs A:** trap.

### I — Trickle 2 of 5 (cap 650) + add `[6W,M]`

1. **6k on the 135k** (2×3k). Energy-only 375 vs C, 563 saved vs B.
   Starve 450 vs C, 675 saved vs B.
2. Shipped miner at 650 is still `[5W,M]` (next rung is **750**,
   `:4112`). `[6W,M]`=650 must be **added**. 6 WORK / 1 MOVE = **6
   t/tile plains**, worse than `[5W,M]`'s 5. Still 10 e/t. +100e
   spawn tax / 1500 × 2 sources ≈ **−0.13 e/t**. No other 650
   body: parked 4W is 500; `getBody([4W,C,M])` 85% of 650=552 →
   one 500 segment; carriers/builders/repair stay capped.
3. 2 ext + 2 other = first pack full. Then hold 3. Smaller road
   hole than C, smaller ext hole than B.
4. 6k during RCL3; leftover 9k with C at RCL4.
5. Arrives cap 650. Storage first, then 3 leftover + 10 new.
6. **Steelman:** cheap 6W at 650, +2 e/t × 2 = +4, payback
   6k/4=1500. **False on both terms.** Source already 10 e/t; walk
   is worse, not better. The only “win” vs B is **spending 6k
   instead of 15k on a dead cap**. Dominated by C (spend 0).

**Does I ever pay?** **No.** Not vs C. Not on its own 6k. vs B it
only wins by being a smaller waste.

**Δ vs B:** **−500 to −675**.
**Δ vs A:** **−500 to −1800**.

---

## Ranking (best spawn→RCL4 first)

Signed ticks are **RCL3→4 = spawn→RCL4**. Negative = faster.
Two numbers: energy-only / starve. HOL/decay folded into the range.

| # | pol | vs B | vs A (old ext-first) | why |
| --- | --- | ---: | ---: | --- |
| 1 | **C** hold to RCL4 | **−938 / −1125** | **−938 / −2200** | 15k off this clock; no 800 HOL |
| 2 | **I** trickle 2 + `[6W,M]` | **−500 / −675** | **−500 / −1800** | smaller waste only; body never pays |
| 3 | **F** after 50% | **0 / −80…−200** | **−200 / −1300** | same 15k, shorter 800 window |
| 4 | **G** after 2nd-source box | **0 / 0…−190** | **−200 / −1300** | same 15k, 2nd-source not blocked |
| 5 | **B** depot+tower (live) | 0 | **0 / −1125** | 15k after 4W can park |
| 6 | **E** after tower only | 0 (or A_old) | ≈ B | happy path = B; no-depot = A |
| 7 | **D** after depot only | **0 / +50** | ≈ B | same 15k, earlier 800 |
| 8 | **A** instant 10 | **0 / +1125** | 0 | A_live≈B; A_old delays depot |
| 9 | **H** site now, finish at 4 | trap | trap | C if skip holds; A if it leaks; bricks storage |

Do not A/B H. Do not add a 650 miner rung to salvage I.

---

**One line:** C — hold leftover 5 through the 135k (`extensionTake(3)=5`);
800 is dead (5W=10 e/t, 4W=500e); 15k/16=938, starve=1125; pay after
storage at RCL4. I never pays. B is a 15k tax on a working 16 e/t sink.
