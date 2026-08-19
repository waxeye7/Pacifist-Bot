# Cycle-15 laggard — E12S3 (far-ctrl)

Read-only. No src. No `push-race`. `run-2026-08-15T23-57-10Z` · `cycle-15-5w-latch` · setHash `1f90aub` `--swap` 40k. Control frozen `e839fc8`.
Do **not** change cycle-15. Sister film: `_cycle15-e18s9.md` is the swamp-corridor laggard. This is the **far-ctrl** laggard only. Do not rewrite `_next-far-ctrl.md` / `_next-far-depot.md`.

Objects `http://127.0.0.1:23456` (dest `pacifist` token) ticks **4728120** (L3 p=101015) and **4729380** (L3 p=115345). Ledger lastSeen **4729166** L3 p=112336 ext=5. Seed **4697015**. Pair mate control **E13S9** RCL3 **17150**, RCL4 **31964** (tick 4728960, ±99).

## Clocks — this race vs pair vs clean-world

| | E12S3 cand | E13S9 ctrl | Δ |
| --- | ---: | ---: | ---: |
| RCL2 | **988** (±154) | 1163 (±156) | **−175** |
| RCL3 | **18312** (±97) | 17150 (±107) | **+1162** |
| RCL4 | — (proj **~34.8k**) | **31964** | **~+2.8k** |
| lastSeen 4729166 | L3 p=112336 ext=**5** | L4 p=3977 ext=**10** | |

R2→3: **17324** vs 15987 (**+1337**). Observed 45k rate **2.60** vs **2.81** e/t. After 3: film 115345 / 14053t = **8.21** e/t → leftover 19.7k ≈ 2.4k t → own RCL4 **~34760**. Pair 135k in **14814** (9.11 e/t).

Clean-world (`_clean-world.md`, same assignment). Dirty leftover-5 is **not** the mark.

| cycle | E12S3 R2 / R3 / R4 | E13S9 R2 / R3 / R4 |
| --- | ---: | ---: |
| 5 leftover-5 (dirty depot @ 18,30) | 954 / **11394** / **23987** | 954 / 12274 / 28979 |
| 8 legacy depot (clean) | 847 / **16365** / **32872** | 1181 / 15889 / 33629 |
| 10 no RCL2 boxes KEEP | 1287 / **18391** / **34635** | 704 / 15971 / 31075 |
| 11 one source box SEND BACK | 1109 / 17703 / 33818 | 1209 / 15770 / 31247 |
| **15 5W-latch** | 988 / **18312** / **~34.8k** | 1163 / 17150 / **31964** |

Cycle-15 E12S3 RCL3 **matches cycle-10** (18312 vs 18391, inside ±97). Not an E18S9-style +4k latch regression. vs clean cycle-8: RCL3 **+1947** (no RCL2 boxes). vs dirty leftover-5: **+6918** (free planner depot gone). Projected RCL4 sits on the cycle-10 **34635** number, **+~2k** vs clean **32872**.

Memory `speedrun.rclTimes` is **cycle-4 leftover** (`startTick` 4336132). Ignore it. Use the ledger.

## Spawn → ctrl, seats, swamp

Live spawn is plan `spawn[0]` **(33,21)**. Not the BENCHMARK anchor (30,22). `planV2` missing, `planPackMiss` 4727082 — same as the other seven cand rooms. `basePlan.spawn` is (32,22)/(30,22); seed used the hub tile.

Both rooms are BENCHMARK `ctrlSteps` **20** / tuple enclosed/far/enclosed. Pair Δ **12.41** (⚠ loose). Operational walk is not the hardness number.

| | E12S3 | E13S9 (pair) |
| --- | ---: | ---: |
| hardness | **+0.64** | +0.20 |
| spawn / ctrl | **(33,21)** / (19,27) | (17,33) / (10,27) |
| spawn→ctrl walk (8-dir, stand 1) | **21 / 0 swamp** | **9 / 0** |
| Chebyshev spawn→ctrl | **14** (`>10` fire) | **7** (gate off) |
| BENCHMARK `ctrlSteps` | 20 far | 20 far |
| src A walk / seats | **11 / 4** (36,9) — 2 swamp seats | **35 / 1** (20,7) |
| src B walk / seats | **21 / 1** (46,34) plains (47,33) | **13 / 3** (10,23) |
| src→ctrl (stand 3) | **29 / 31** | **23 / 1** |
| src→ctrl Cheby | **18 / 27** | **20 / 4** |
| src→depot | **31 / 31** | 29 / **7** |
| Memory `pathLength` | **12 / 23** | 39 / 13 |
| room swamp (BENCH / encoded-2) | 4.0% / **1.7%** | 2.2% / 1.0% |

**“Far controller” is a lie about the pair.** Anchor→ctrl is 20 both sides. E13S9’s *spawn* is Cheby 7, and source (10,23) is Cheby **4** of the controller — shuttle stand-3 is **1**. E12S3’s nearest source is Cheby **18**, walk **29**. That is why the same BENCHMARK band is a 1.2k RCL3 / ~3k RCL4 pair gap.

Spawn→ctrl path is plains all the way (33,21 → 32,23 … 18,30 → 18,28). **Swamp is not the tax.** Eco walks carry 0–3 swamp tiles. 1:1 haulers / `[2W,2C,2M]` are already 1 t/tile plains. Do not flip RCL3 roads to save this room (cycle-9 KEEP policy; 0 roads standing).

Far source is **1-seat** (47,33). Latch `getOpenPositions()` is 0 once the 2W sits. Overlap 5W/4W is a **no-op** on that seat (`_next-5w-latch.md` §4). Near source has 4 seats (2 swamp); miner sits the swamp seat **(35,10)** with the box. Stationary 4W does not pay swamp.

## Creep mix (leftover-5 holding)

Tick 4729380, candidate, 5 ext / cap 550. Replacements since 4728120; **still 2 miners**.

| | E12S3 L3 p=115k | E13S9 L3 p=126k (4728120) |
| --- | --- | --- |
| miners | **2×4W1M** | 2× EnergyMiner |
| carriers | **5×4C4M** | 13× (control remotes live) |
| upgraders | **4×4W1C1M** parked on depot | 3 |
| builders | 0 | 0 |
| other | filler + repair | filler 3 + CLF + sweeper + repair |
| creeps | 13 | 26 |
| tower / boxes / roads / sites | 1 / **5** / **0** / **0** | 1 / 5 / **51** / 0 |
| ext / cap | **5 / 550** | **10 / 800** |

Depot **(18,30)** cheb 3 of (19,27), not source-adj — same tile `_next-boxes.md` / leftover-5 dirt used to gift. Store 134–352e. Four 4W parked in D8 (17–18, 29–31). Hub (31,21) 0e, bin (31,22) ~20e, near box (35,10) 222–360e, far box (47,33) **622–762e**. Far pile is served at L3. Depot is thin — 4×4W sink 16 e/t, delivered ~8.2.

`homeCarriersWanted` at 4W = 8 e/t, 1:1, `harvest×(2L+6)×1.35 / 200`, cap 3/source. L **12 + 23** → want **2+3 = 5**. The 5×400e stack is the formula on a 21-step source, not a flood.

`[2W,2C,2M]` on E12S3’s *best* source (L≈18): cycle 25+36+50 = 111 → **0.90 e/t**. ×6 = 5.4 model. Observed 45k / 17324 = **2.60** (slam + 2 builders + no RCL2 boxes + closest-pickup ignores the far drop). Pair’s pocket source is L≈4 → shuttle ~1.7 e/t each.

## Miner bodies — 4W vs 5W vs 2W

No **5W** hatched. Race cap 550, `[5W,M]` clamps to `[4W,M]` (`floor(550×0.85)=467`). Same in every cand room.

| when | E12S3 miners |
| --- | --- |
| snap ~15.8k (`_cycle15-snap.md`) | **2×4W** |
| film 4728120 / 4729380 | **2×4W1M** on (35,10) and (47,33) |

Names changed between probes (`EnergyMiner-1659707` → `…-863236` on the 1-seat). Still **2**, not 10+. After the 2W dies the far source is **8 e/t**, not 10. Income is not the 45k bottleneck (upgrade 2.60, mine 16). On the 135k, mine 16 vs delivered 8.2 — last mile, not WORK.

## `fiveWQueued`

Memory `rooms.E12S3.resources.E12S3.energy[*]` at 4728120:

| source | tile | `fiveWQueued` | `lastSpawn` | age | `pathLength` |
| --- | --- | --- | ---: | ---: | ---: |
| `…32cb` | (36,9) near | **true** | 4726887 | 1233 | 12 |
| `…32cd` | (46,34) far | **true** | 4727112 | 1008 | 23 |

Latch **held**. 2 miners, not 10+. Flag set on both. `spawn_list` empty, `spawnStall` 0. Ages <1500 — replacements, flag still blocks re-queue. Control E13S9 has **no** `fiveWQueued` (frozen `e839fc8`). Cycle-15 did what it claimed on this room. The extra body is still a 4W, and on the 1-seat the overlap poke never fires while anyone sits (`_next-5w-latch.md` §4).

## leftover-5 / no boxes / no RCL3 roads — this room?

**Leftover-5: no.** Every cand room is 5 ext / cap 550. E13S7 already RCL4 **26926** on the same hold. E12S3’s own leftover-5 clock was **RCL3 11394 / RCL4 23987** — that was the leftover depot at (18,30), not the hold. Holding the next five is not why the 45k is late.

**No RCL2 source boxes: yes, this room, not new this cycle.** Race rooms have no planV2. RCL2 only sites the hub. Planned seats (35,10) / (47,33) / depot (18,30) were empty through the 45k; miners drop on the seat. Boxes now standing are the RCL3 pack (tower + leftover boxes). Far box 762e proves L3 haul *can* reach that seat.

**No RCL3 roads: not the 45k.** Still 0 roads. Spawn→ctrl is 0 swamp — arterial roads do not pay the shuttle commute the way they do on E18S9’s 5-swamp corridor. Parked 4W stop walking the tick a stocked depot exists. Do not flip roads mid-race.

Control E13S9 has **51 roads** and **10 ext** (frozen leak) plus remotes on the spawn list. That is a pair confound on the 135k, not a candidate latch bug.

## Lag in ticks (walk, sink, swamp, seats)

| piece | ticks | why |
| --- | ---: | --- |
| RCL2 | **0** (won by 175) | slam-5 is not the miss |
| R2→3 walk | **~1.3k vs pair** | shuttle L≈18–21 vs pair L≈4 on the pocket source. Model 6×0.90 = 5.4 e/t vs live 2.60 |
| R2→3 no RCL2 depot | **~1.5–2.5k vs a stocked box** | `_next-far-ctrl.md`: 6 shuttles stay walking until `rcl==3`. Cycle-8→10 on *this* room is +1947, almost all on the 45k |
| swamp | **~0** | 0 swamp on spawn→ctrl; 2 on source walks |
| 1-seat / no 5W overlap | **~250–400** | far source 8 e/t until 2W dies; upgrade-bound at 2.6 so this does not move the 45k |
| R3→4 last mile | **~1.8k vs pair** | src→depot **31/31** vs pair 7 on the pocket source. Parked 16 e/t sink, delivered 8.2, depot 134e |
| leftover-5 / latch flood | **0** | ext=5 everywhere that finished faster; miners stayed 2 |

Split matches `_next-far-ctrl.md`: ~4.5k of the old 9k vs E13S7 was the 45k shuttle walk; ~4.9k was depot-late on the 135k. vs *this* pair mate the 45k gap is smaller (pocket source, not E13S7-class) and the rest is last-mile + pair looseness (12.41).

## One-knob implication

**Do not touch cycle-15.** Latch is holding. Flood is dead. This room is not a 5W-latch failure.

- Do **not** read 18312 as “need another `lastSpawn=0`.” 1-seat + clamp means you cannot get a real 5W overlap on (46,34).
- Do **not** flip leftover-5 or re-site RCL3 roads on the watching run.
- Next knob after RCL4 8/8 is already written: **RCL2 depot after slam-5 when spawn Cheby >10** (`_next-far-ctrl.md`, `_next-far-depot.md`). E12S3 fires (14). E13S9 stays off (7). E13S7 stays off (10). Model **−1.5k to −2.5k** on this room’s 45k, **−0.5k to −1.5k** on the 135k, vs live c10 **34635**. Compare to clean cycle-8 **32872**, not dirty 23987.
- Sticky pickup stays **#1 on the pair E5S3/E12S3 mean** (those notes). It is not a substitute for the 45k walk and is not a new knob here.

Did: ledger lastSeen + milestones (E12S3 vs E13S9 vs clean-world), BENCHMARK / 8-dir terrain BFS, room-objects + Memory `fiveWQueued` / `pathLength` / `planPackMiss` on dest `pacifist`. Did **not**: push-race, seed, revert, mid-race push, src edit, rewrite `_next-far-ctrl.md` / `_next-far-depot.md`.

## Verdict

**Geometry tax.** Not a latch / 4W-income bug.

Latch held (2 miners both probes, `fiveWQueued` true, no flood). RCL3 **18312 = cycle-10 18391**. The miss is spawn→ctrl **14 / walk 21** with sources **18 and 27** from the controller, depot only after 3, 1-seat far source as a ~300t footnote. Pair mate E13S9 is BENCHMARK-far and operationally near.
