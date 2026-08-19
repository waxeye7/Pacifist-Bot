# Cycle-15 laggard — E18S9

Read-only. No src. No `push-race`. `run-2026-08-15T23-57-10Z` · `fiveWQueued` latch.
Do **not** change cycle-15.

Objects `http://127.0.0.1:23456` (pserver / pacifist token) ticks **4716381** (still L2 p=41807), **4717223** (just L3), **4718372** (L3 p=10190). Ledger RCL3 **19709** (tick 4716767, prior 4716700, ±67). Seed 4697058. ~18k elapsed the room was still L2 ~30–41k/45k, 5 ext, 14–17 creeps. Pair-slot mate E12S3 crossed at **18312**; it was the other L2 at ~18k, not the B3 twin (that's control E8S5, RCL3 14930).

## Spawn → ctrl, seats, swamp

Live spawn is plan `spawn[0]` **(35,13)**. Not the BENCHMARK anchor (32,13). `planV2` **false**, `planPackMiss` 4715032 — same as the other seven cand rooms.

| | E18S9 | E18S5 (fast) | E13S7 (fast) | E12S3 (other late) |
| --- | ---: | ---: | ---: | ---: |
| tuple / hardness | semi/near/enclosed **+0.36** | semi/far/tight −0.17 | semi/mid/enclosed −0.98 | enclosed/far/enclosed +0.64 |
| spawn | (35,13) | (9,36) | (15,15) | (33,21) |
| controller | (25,6) | (8,9) | (25,14) | (19,27) |
| spawn→ctrl walk (8-dir, stand 1) | **9 / 5 swamp** | 29 / 0 | 9 / 0 | 21 / 0 |
| Chebyshev spawn→ctrl | 10 | 27 | 10 | 14 |
| BENCHMARK `ctrlSteps` | 6 “near” | 25 far | 10 mid | 20 far |
| src A walk / seats | **28 / 1** (19,40) | 15 / 4 (9,21) | 4 / 2 (10,13) | 11 / 4 (36,9) |
| src B walk / seats | **10 / 1** (46,4) | 2 / 3 (12,33) | 2 / 4 (12,14) | 21 / 1 (46,34) |
| src→ctrl (stand 3) | **31 / 18** | 9 / 23 | 12 / 10 | 29 / 31 |
| room swamp (BENCH / encoded-2) | 8.7% / **5.8%** | 1.0% / 0.5% | 8.5% / 6.6% | 4.0% / 1.7% |

E13S7 room % is swampy; eco walks are 0–1 swamp. E18S9’s **controller corridor is the swamp** (path 34,12 → 33,11S … 29,7S → 28,6 → 26,5). Depot plan tile (28,6) sits on that line (6 steps, 5 swamp).

**“Near controller” is a lie about the race.** Anchor→ctrl is 6. Shuttle path is **source→ctrl: 18 or 31**. No source is next to the controller. E18S5’s spawn is farther (29) but one source is **9 plains** from the ctrl — that is why it is the fast room.

Both E18S9 sources are **1-seat plains** (45,5) and (20,39). Latch predicate `getOpenPositions()` is 0 once the 2W sits. Overlap 5W/4W is a **no-op** on this room unless the 2W is still walking.

## Creep mix vs fast room

Tick 4718372, all candidate, leftover-5 holding (5 ext).

| | E18S9 L3 p=10k | E18S5 L3 p=61k | E13S7 L3 p=74k |
| --- | --- | --- | --- |
| miners | **2×4W1M** | 2×4W1M | 4W + 3W |
| carriers | **5×4C4M** | 2×4C4M + 1×3C3M | **1×4C4M** |
| upgraders | 2×2W2C2M + 2×4W1C1M | **10×4W1C1M** parked | 4×4W1C1M parked |
| builders | 2×[W,2C,2M] | 0 | 0 |
| other | filler + repair | filler + repair | filler + 2 repair |
| creeps | 15 | 17 | 10 |
| tower / boxes / roads / sites | 0 / 4 / **0** / tower+box | 1 / 5 / 0 / none | 1 / 5 / 0 / none |

At the L2 probe (4716381, p=41807) E18S9 was **0 builders, 6×[2W,2C,2M] shuttles, 5 carriers, 2×4W, 0 source boxes, 0 depot**. Fast rooms were already parked 4W on a live depot.

`homeCarriersWanted`: L=pathLength, 1:1, `harvest×(2L+6)×1.35 / 200`, cap 3/source. Memory L **31** (far) + **10** (near), 4W = 8 e/t → want **3+2 = 5**. E13S7 L=2/4 → want 1. E18S5 L=2/15 → want 3. The 5×400e stack is the formula on a 28-step 4W source, not a flood.

`[2W,2C,2M]` on E18S9’s *best* source (18 steps, 1 swamp ≈ 22 loaded ticks): cycle 25+22+25+22 = 94 → **0.53 e/t**. ×6 = 3.2. Far source (31): **0.45**. Observed 45k / (19709−945) = **2.40 e/t**. Fast rooms ~3.7–3.9 e/t on their 45k.

## Miner bodies — 4W vs 5W vs 2W

No **5W** hatched. Race cap 550, `[5W,M]` clamps to `[4W,M]` (`floor(550×0.85)=467`). Same in E18S5 / E13S7 / E12S3.

| when | E18S9 miners |
| --- | --- |
| snap ~15.8k (`_cycle15-snap.md`) | 4W+3W (7 WORK) — leftover 2W dying on one seat |
| L2 ~18.6k (4716381) | **2×4W1M** on (45,5) and (20,39) |
| L3 4717223 / 4718372 | **2×4W1M** — far 4W was walking (20,35) just after `lastSpawn` 4717097 |

Never a live 2W+4W pair on the same source (1 seat). After the 2W dies the source is **8 e/t**, not 10. Income is not the 45k bottleneck (upgrade ~2.4, mine 16).

## `fiveWQueued`

Memory `rooms.E18S9.resources.E18S9.energy[*]` at 4717223:

| source | tile | `fiveWQueued` | `lastSpawn` | `pathLength` |
| --- | --- | --- | ---: | ---: |
| `…3403` | (46,4) near | **true** | 4716453 | 10 |
| `…3405` | (19,40) far | **true** | 4717097 | 31 |

Latch **held**. 2 miners, not 10+. Flag set on both. `spawn_list` empty, `spawnStall` 0. Same flag true on E18S5 / E13S7 / E12S3. Cycle-15 did what it claimed on this room. The extra body is still a 4W, and on 1-seat sources the overlap poke never fires while the 2W sits (`_next-5w-latch.md` §4).

## leftover-5 / no boxes / no RCL3 roads — this room?

**Leftover-5: no.** Every cand room is 5 ext / cap 550. E18S5 and E13S7 already RCL3 at 12.3k / 12.7k on the same hold. E18S9’s own leftover-5 clock was **RCL3 12828 / RCL4 27256** — its best. Holding the next five is not why the 45k is late.

**No RCL2 source boxes: yes, this room, not new this cycle.** Race rooms have no planV2. RCL2 only sites the hub container (`findStorage` = spawn+(0,−2) = **(35,11)**, 280–1490e). Planned seats (45,5) / (20,39) / depot (28,6) were empty through the 45k; miners drop on the seat tile (piles 91+147 at 4716381). Extra dirt boxes **(32,8)** and **(35,12)** are leftover objects, not eco tiles.

| cycle | E18S9 R2 / R3 / R4 | E18S5 R3 | E13S7 R3 | E12S3 R3 |
| --- | ---: | ---: | ---: | ---: |
| 5 leftover-5 (had RCL2 boxes) | 717 / **12828** / 27256 | 9439 | 8450 | 11394 |
| 10 no RCL2 boxes KEEP | 954 / **15779** / 32430 | 11993 | 10306 | 18391 |
| **15 5W-latch** | 945 / **19709** / — | **12262** | **12691** | **18312** |

No-box vs leftover-5 on *this* room: RCL3 **+2951**, RCL4 **+5174**. Fast rooms also paid (~+2.5k / +1.8k to RCL3) but started from a much lower base. E12S3 cycle-15 **matches** its cycle-10. E18S5 matches cycle-10. **E18S9 is +3930 vs its own cycle-10.** Geometry + no-box explains why it is *a* tail room (~16k). The extra ~4k this cycle is the latch / earlier 4W / 5-carrier HOL on L=31, not leftover-5.

**No RCL3 roads: not the 45k.** Still L2 for the whole miss. 0 roads in all four rooms now. After RCL3 this is the one cand room whose **spawn→ctrl walk is 5 swamp tiles** — arterial roads would actually pay here (swamp road = plains) for builders and for shuttles until the depot stands. Parked 4W stop walking that corridor the tick a stocked depot exists. First RCL3 pack (4717223) was tower + 2 containers, **no road sites** (policy). Do not flip roads mid-race to save this room; the 45k is already spent.

## One-knob implication

**Do not touch cycle-15.** Latch is holding. Flood is dead. This room is not a 5W-latch failure.

- Do **not** read 19709 as “need another `lastSpawn=0`.” 1-seat + clamp means you cannot get a real 5W overlap here.
- Do **not** flip leftover-5 or re-site RCL3 roads on the watching run.
- Next knob after RCL4 8/8, if 15 KEEP: **5W clamp skip** (`_next-5w-clamp.md`, `_next-after-15.md` #1) — measures 10 e/t vs 8, model −150…−600. It will barely move *this* room’s 45k (already upgrade-bound at ~2.4 e/t). It may help the 135k once the depot parks.
- Room-specific next (not this race): RCL2 depot when src→ctrl > 10 (`_next-far-ctrl.md`) — E18S9 is 18/31, E13S7 is 10/12 so a `>10` Cheby/walk gate leaves the fast room alone. Box-order A/B is the wrong tile here (first plan box is already the near seat).

Did: ledger lastSeen + milestones, BENCHMARK / plans-hub, room-objects + encoded terrain BFS, Memory `fiveWQueued` / `pathLength` / `planPackMiss`. Did **not**: push-race, seed, revert, mid-race push, src edit.
