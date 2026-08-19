# Late rooms — E12S3 / E5S3

Read-only rec. No src. Not remotes. Not leftover-5 (that stay is the mark).
Clock: spawn → RCL4. One knob. Model Δ below, not a race number.

`--swap` candidate sits on the BENCHMARK *control* rooms: E5S3, E12S3, E13S7.

Leftover-5 mark **24512** is cycle-5 `7/8` (`where.md`). The missing eighth is **E5S3** (L3 p=105277, `final=censored`). E12S3 was **23987** on that seed, then regressed. E13S7 on cycles 10–11 is 24.2–24.7k — still the mark.

---

## Pair elapsed (the three named runs)

Candidate. RCL2 / RCL3 / RCL4. Legs = R2→3 (45k) and R3→4 (135k).

| run | knob | E5S3 | E12S3 | E13S7 |
| --- | --- | ---: | ---: | ---: |
| 19-38-56Z c10 | no RCL2 boxes | 719 / **15204** / **34246** | 1287 / **18391** / **34635** | 758 / 10306 / **24728** |
| 20-46-12Z c11 | nearer source box only | 689 / **15587** / **33436** | 1109 / **17703** / **33818** | 550 / 10708 / **24244** |
| 21-54-52Z c12 | haul 3→2 | 848 / **16832** / **37255** | 790 / **18836** / **38811** | 604 / 12132 / **26399** |

c10–11 mean R4: E5S3 **33841**, E12S3 **34226**, E13S7 **24486**. Tail is +9–10k vs the mark.

Legs (c10, typical):

| | R2→3 | R3→4 | R4 |
| --- | ---: | ---: | ---: |
| E5S3 | 14485 | **19042** | 34246 |
| E12S3 | **17104** | 16244 | 34635 |
| E13S7 | 9548 | 14422 | 24728 |

E12S3 dies on the 45k (far ctrl commute). E5S3 dies on the 135k (depot in the pocket). Both miss the 45k by 5–7k vs E13S7.

c12 haul-2: E5S3 **+3009**, E12S3 **+4176** vs c10. Capacity on the long source is live, not slack. E13S7 +1671 is smaller and want is 1–2 — do not read it as “3→2 hits the easy room.”

c11 nearer-box: −810 / −817 / −484 vs c10. These two are **not** far-first (`_next-boxes.md`: E5S3 15 vs 17, E12S3 14 vs 16). Wrong tile for this pair.

8-room c10 mean **30002**. If these two were 24512: mean **27520** (−2482). They are the tail, not the whole regression vs cycle-5 (the other six also drifted to ~28.5k).

Cycle-5 leftover-5, same rooms: E12S3 **23987** (R3 11394), E5S3 DNF, E13S7 23602. E12S3 *can* sit on the mark; E5S3 never has.

---

## Why (ctrlSteps / swamp / far source / 1-seat)

BENCHMARK `ctrlSteps` / `srcSteps` are from the **hardness anchor**, not the seeded spawn. Race seed is `spawn-in.mjs` → `plan.structures.spawn[0]`. Film `st:[["spawn",…]]` matches the plan, not the anchor.

| | E5S3 | E12S3 | E13S7 |
| --- | --- | --- | --- |
| tuple | enclosed/near/enclosed | enclosed/far/enclosed | semi/mid/enclosed |
| hardness | +0.614 | +0.642 | −0.975 |
| BENCHMARK anchor | (40,43) | (30,22) | (14,11) |
| **live spawn** | **(24,30)** | **(33,21)** | **(15,15)** |
| BENCHMARK srcSteps | 18+29 | 12+20 | 2+3 |
| BENCHMARK ctrlSteps | **2** (pocket) | 20 | 10 |
| minSourceFree | 2 | **1** | 2 |
| swampPct | 1.8% | 4.0% | **8.5%** |
| openPct | 40% | 46% | 84% |

8-dir BFS on frame terrain (`run-2026-08-15T08-22-05Z`), stand range-1 of source/ctrl:

| path | E5S3 | E12S3 | E13S7 |
| --- | ---: | ---: | ---: |
| spawn → src A / B | 16 / 17 | 11 / **21** | 4 / 2 |
| spawn → controller | **32** | **21** | 9 |
| spawn → planned depot | **34** | 19 | 7 |
| src → depot | **29 / 18** | 30 / 30 | 11 / 9 |
| swamp tiles on those paths | 0–2 | 0–2 | 0–1 |
| far-source open adj | 3 | **1** `(47,33)` | 2 / 4 |
| sources apart | 9 | **32** | 1 |

### Swamp — no

Room % is the trap. E13S7 has 4× E5S3 swamp and is the fast room. Eco paths here are 0–2 swamp tiles. 1:1 haulers / `[2W,2C,2M]` shuttles are already 1 t/tile plains. Roads (cycle-9, sent as a *speed* win) do not move this pair. Do not A/B extra MOVE.

### ctrlSteps — yes, but not the BENCHMARK number

**E5S3 “near” is a lie about the race.** Anchor (40,43) sits in the controller pocket (`ctrl` 2). Spawn is the planner hub (24,30) *outside* the pocket. Spawn→ctrl is **32** (0 swamp) — worse than E12S3’s 21.

`[2W,2C,2M]` tank 100, cycle `2L+50`:

| | L | e/t | roster 6 |
| --- | ---: | ---: | ---: |
| E5S3 | 32 | 0.88 | **5.3** |
| E12S3 | 21 | 1.09 | **6.5** |
| E13S7 | 9 | 1.47 | **8.8** |

Leftover ~30k after slam: 5.7k / 4.6k / 3.4k. Matches E12S3’s fat R2→3; E5S3’s 45k is the same tax plus enclosed traffic.

RCL3 parks `[4W,C,M]` on a depot that **must** sit in upgrade range → the pocket. Then haul becomes BENCHMARK 18+29 (E5S3 src→depot 18/29) / 30+30 (E12S3). Park without feed is 4 idle 4W. Shuttle-from-hub at L=32 is already 5.3 e/t; a starved park is worse.

### Far source — yes, both

From spawn, not only from the anchor. After 5W, `homeCarriersWanted` (`:3842`) at `[4C,4M]` 200e, `10*(2L+6)*1.35`:

| L | need | 3×200 | leak if served |
| ---: | ---: | ---: | ---: |
| 9 (E13S7) | 162 | — | want **1** |
| 16–17 (E5S3 from spawn) | 513–540 | 600 | 0 |
| 21 (E12S3 1-seat) | 648 | 600 | **0.7 e/t** |
| 29–30 (depot last mile) | 864–891 | 600 | **4.1–4.6 e/t** |

Once the 4W parks, *both* rooms are at the 3-cap floor on the long seat. c12 3→2 measured that.

Pickup is closest-unreserved (`creepFunctions.ts:1680–1728`) plus `pick(false)` queue (`:1773`). `sourceId` is spawn accounting only. Film c3 E5S3: EM at `(11,41)` and `(20,46)`, four CA on the hub `(21–24,31–33)`. E12S3: EM at `(36,10)` and `(47,33)`, four CA on `(32–33,20–22)`. Far pile is a 20–30 tile walk from the delivery tile; closest never takes it while the near pile is ≥ `selectMin`.

E13S7 sources are **1 step** apart. Closest ≈ sticky. Gate any haul knob on `pathLength`, not a global cap.

### 1-seat — E12S3 only, secondary

Far source `(46,34)` has one open tile `(47,33)` (film EM sits there). `getOpenPositions` excludes creeps (`roomPositionFunctions.ts:36–37`). Cycle-15 `fiveWQueued` latch is `tiny && seats > 0` (`:4267–4268`) → **the living 2W zeros the seat, 5W overlap never fires**. That source stays 4 e/t until the 2W dies (~400–1050t after 550). 6 e/t × ~800t ≈ 4.8k ≈ **250–400 ticks**, plus a later 5W walk ( `[5W,M]` is 3 t/tile × 21).

E5S3 is 2+3 seats. E13S7 is 2+4. After 550 a 5W still saturates 10 e/t on one tile — 1-seat is not the RCL3→4 wreck. Do not spend the next race on it first.

---

## Ranked 3 (one knob, both rooms, 0 on E13S7)

Do not bundle. Do not touch `extensionTake` / leftover-5. Do not reopen remotes.

### 1. Source-sticky pickup

**Why first.** Film is the far miner unserved. c12 says the 3rd body on L≥16 is capacity, not slack — but closest-select spends it on the near pile. `memory.sourceId` already exists on home carriers (`:4563`). Filter `acquireEnergy…` when `role=='carry' && sourceId` to drops/containers in range 1–2 of that source. Leave lock TTL / reserve / `pick(false)` alone this race (`_next-haul.md` #2).

E13S7 sources share a 1-step neighbourhood → closest ≈ sticky. Model **0 to +100** (one idle if its pile is empty).

E5S3 / E12S3 RCL3→4 is 16–19k vs E13S7 14.4k at ~7–8 e/t delivered vs ~10. Recovering the ignored source is 2–4 e/t into a 135k:

- half: 143k/9.5 vs 143k/7.3 → **−3.5k**
- full: 143k/12 vs 143k/7.3 → **−6.5k**

Also feeds the pocket depot so the parked 4W actually run (16 e/t sink). R2→3 sees a smaller slice (hub feed for shuttles).

| room | spawn→RCL4 |
| --- | --- |
| E5S3 | **−2.5k to −6.5k** |
| E12S3 | **−1.5k to −4.5k** |
| E13S7 | **0 to +100** |
| 8-mean | **−0.5k to −1.4k** |

Risk: sticky hauler idles while the other source overflows. Measure pile size on the *other* id, do not flip back to closest this race.

### 2. RCL2 `amount` 6→8 after 550 when spawn→ctrl ≥ 17

**Why.** Operational L_ctrl is 32 / 21 / 9. Cycle-4 already set `amount: cap>=550 ? 6 : 4` (`:879`). One branch: `>= 8` if `findPath(spawn, controller).length >= 17` (far band cutoff 17.67), else 6. Not during slam. Not RCL3 `amount: 4` (park).

Delivered e/t on the leftover 30k:

| | 6 | 8 | Δ ticks |
| --- | ---: | ---: | ---: |
| E5S3 0.88 | 5.3 | 7.0 | **−1.4k** |
| E12S3 1.09 | 6.5 | 8.7 | **−1.1k** |
| E13S7 1.47 | 8.8 | (gate off) | **0** |

+900e + 54 hatch. Miners still `unshift` first. `pressure.burn` can already add 0–4 — this is the *floor* on far-ctrl rooms, not burn-always.

| room | spawn→RCL4 |
| --- | --- |
| E5S3 | **−1.0k to −1.6k** (R2→3 only) |
| E12S3 | **−0.8k to −1.4k** |
| E13S7 | **0** |
| 8-mean | **−0.2k to −0.4k** (also hits E18S5-class far-ctrl; still 0 on E13S7) |

Does not fix the 135k last mile. Do this after #1, or if you want a spawn-only diff.

### 3. `MAX_HOME_CARRIERS_PER_SOURCE` +1 when `pathLength >= 16`

**Why.** At L=29–30, 3×200=600 vs need 864–891. A 4th `[4C,4M]` is +200 carry ≈ 3 e/t *if it walks to that source*. Gate on `values.pathLength` so E13S7 (2–4) never queues it. Leave 1:1 and the 4C cap. Leave `pressure.haul` alone.

c12 is the measured slope the other way (3→2 = +3–4k on these two). 3→4 is diminishing and **stacks without #1**.

| room | spawn→RCL4 |
| --- | --- |
| E5S3 | **−1.0k to −2.5k** if the 4th serves; **0 to +400** if it stacks |
| E12S3 | **−0.5k to −2.0k** / same sign-flip |
| E13S7 | **0** |
| 8-mean | **−0.2k to −0.6k** (or ~0 if stack) |

Do not run this before #1. The 4th body on a closest-select room is the E4S7 6–7 CA picture (`_next-haul.md`).

---

## Not this race

- **Far-first RCL2/RCL3 box.** Δ sitter is 2 on both rooms. c11 already tried nearer-first (−800, noise). E9S1-class 3+41 is a different pair (`_next-boxes.md` #1).
- **RCL2 depot / park during the 45k.** Depot *is* the pocket (E5S3 34 from spawn). Park without #1 starves. Cycle-5 E12S3 24.0k had RCL2 *source* boxes, not a proven depot win.
- **1-seat 2W recycle at 550.** E12S3 only. −250 to −400. After #1/#2. Cycle-15 latch cannot fire on `seats==0`.
- **Kill `pick(false)`.** Helps #1/#3; not a substitute. Idle-vs-stack is the next measurement.
- **Swamp MOVE / RCL3 roads.** 0–2 swamp on the eco path. Cycle-9 already answered.
- **Leftover-5 / remotes / trickle-ext / 6W miner.** Closed or forbidden.

#1 then #2. #3 only after sticky. Next seed: one of these, `--swap`, 40k, do not `push-race`.
