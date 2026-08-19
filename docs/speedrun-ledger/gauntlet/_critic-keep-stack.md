# Critic — KEEP stack (hostile)

Independent of the implementers. Default **SEND BACK**. No `src` edit. Did not `push-race`, reset, SSH, or unclaim E36N57.

Control is frozen `e839fc8`. Set `1f90aub`, `--swap`, 8 pairs / 16 rooms. Metric that matters: mean spawn→RCL4, **8/8**, **clean world**. True north is spawn→RCL8; delay is legal, skip-forever is not (`gauntlet/CRITIC.md`).

---

## Verdict

| item | clock KEEP? | policy KEEP? | why |
|---|---|---|---|
| leftover-5 **24512 7/8** | **THROW OUT** | **yes** (delay 15k) | leftover planner boxes + drop E5S3 |
| 6W after 550 | **maybe** (dirty 8/8) | yes | never re-baselined on clean |
| no RCL3 BasePlan roads | **no** (+872) | **yes** (slots) | KEEP *policy*, not speed |
| no RCL2 source boxes | **no** (+1598) | leak-close only | KEEP RCL3, lost the clock |
| depot miss-guard | not isolated | **yes** (4W park) | −599 is leftover-5+6W+depot |
| 5W latch | **watching** | flood-stop | hatches **4W**, not 5W |

Honest leftover-5+6W mark on a clean seed: cycle-8 **`29029` 8/8** (`run-2026-08-15T16-59-09Z`). Clean cand RCL4 sits in **29–32k**. `_SPEEDRUN-STATE.txt` and `_next-after-15.md` still calling **24512 the mark** is the same lie as REPORT's "30.6k → 24.5k".

SEND BACK (already called, do not revive): HOL cycle-0/1 (`run-2026-08-15T04-41-19Z`, RCL3 **+2083**) and cycle-6 (`run-2026-08-15T13-42-57Z`, RCL4 **30139 vs 28818**); recycle cycle-7 (`run-2026-08-15T15-45-27Z`, RCL3 **+1466**); one-source-box 11 (`run-2026-08-15T20-46-12Z`, **+1301**); haul-2 12 (`run-2026-08-15T21-54-52Z`, **+2460**); 5W flood 13/14 (`run-2026-08-15T23-07-37Z` / `23-37-04Z`, 15 then 14 miners/source).

---

## 1. Is leftover-5 24512 a lie?

**Yes. Throw the clock out. Re-baseline on clean ~29–32k. Keep the policy.**

`_clean-world.md` already did the arithmetic. Cycle-5 `run-2026-08-15T12-13-10Z` was `--wipe` only. `race.mjs --wipe` deletes `user ∈ {pacifist1, pacifist-race}`. **`user: null` planner objects stay.** Documented leftovers through cycle-7 (`_cycle7-recycle.md`):

- E5S3 container **(40,42)** — planner depot tile (`_next-boxes.md` table: ctrl 37,41 / depot 40,42)
- E12S3 container **(18,30)** — planner depot tile
- leftover **roads**: cand E5S3 (24,30) (seed-failed, retry tick 4376680), ctrl E8S5 (24,9), ctrl E4S7 (30,32)

Race rooms are `planPackMiss`. `hasControllerDepot` (`rooms.spawning.ts:3387–3404`) only needs a **live** container, range ≤4 of the controller, not source-adj. On the dirty seed that box was already standing, so far rooms parked 4W on tick 0 of RCL3 without paying 5k. Cycle-8 is the first full object+memory scrub (`WORKBENCH` 17:03Z: "0 leftover planner boxes").

| | c5 dirty | c8 clean | c10 clean |
|---|---:|---:|---:|
| cand RCL3 | **11000** 8/8 | 13829 | 13327 |
| cand RCL4 | **24512 7/8** | **29029 8/8** | 30002 8/8 |
| same-7 RCL4 | 24512 | 28298 (**+3786**) | 29396 |

Of 30002 − 24512 = **5490**: leftover objects **+3786**, 7/8 drop E5S3 **+731**, later knobs **+973**. ~4.5k is dirt + censor. ~1k is real code **and it lost RCL4**.

Signature is leftover **depot**, not roads. Far controllers (ctrlSteps 20–25): E12S3 RCL4 **23987 → 32872 (+8885)**. Near E13S7 (ctrlSteps 10) is a wash (−132). E5S3 — the only 7/8 miss — had leftover road on the spawn tile, lastSeen 105277/135000, projected **~46k**. An 8/8 cycle-5 with that projection is **~27200**, not 24512. Clean E5S3 is a late **34.1k** both c8 and c10.

Leftover-5 as *policy* still KEEP. `extensionTake` (`PlanV2.ts:1079–1082`) is `lvl<=3 → 5`, RCL4+ `engineCap`. BasePlan (`BasePlan.ts:501–503`) and checkerboard (`rooms.construction.ts:306–316`) both call it. Cycle-2 `run-2026-08-15T06-02-18Z` leaked (legacy ignored take; cand L3 at 10 ext). Cycle-5+ film: cand L3 sits at 5, control 7–10. 800 buys nothing (`_ext-6w.md`: 6W miner still 10 e/t; parked 4W is already 500e at 550; 8W needs 1000). Future check: Q1 delay-yes, Q2 15k off 135k onto 405k toward 1300, Q3 no rewrite.

On a *clean* world the A/B shrinks to cycle-8 **−120 RCL3 / −599 RCL4** vs frozen control — not −1156 / −4.7k. Cycle-8 29029 is the same clock as cycle-4 dirty **29181** (6W, leftover-5 *leaking*). The 24.5k "leftover-5 win" is leftover boxes + 7/8. **Do not treat 24512 as a number a later cycle has to beat.**

---

## 2. Load-bearing vs cargo-cult

### Load-bearing

**Leftover-5 hold (policy).** Dead 800. Live 5-ext film every cycle after the leak close. Isolated *speed* on clean was never run (c8 is leftover-5+6W+depot vs `e839fc8`). Still KEEP: skip-forever would fail Q1.

**6W after 550 — only 8/8 RCL4 KEEP vs control, and it is dirty.** Cycle-4 `run-2026-08-15T09-59-18Z`: **29181 vs 30851 (−1670) 8/8**. `rooms.spawning.ts:877–879` `amount: cap>=550 ? 6 : 4`. Stay 4 during slam so the five ext finish. That is the right *shape*. It is **not** a clean re-baseline: same leftover boxes as cycle-5; leftover-5 was still *dumping* mid-RCL3 (WORKBENCH 10:56Z: E18S5/E12S1/E13S7 at 10 ext). Six shuttles on a *free* depot is not six shuttles that wait for a 5k site. On clean, bundled leftover-5+6W+depot is only **−599** (c8). Control itself moved 30851 → 29628 when dirt left. **−1670 is not a 6W effect you can take to the bank.**

The 6W KEEP is also **incomplete**. RCL3 `amount: 4` (`:922`) does not cull and does not hatch 4W while census ≥4 (`_next-rcl3-roster.md`). Six `[2W,2C,2M]` park at **10–12 e/t**, drain to **4×2W = 8**, *then* trickle `[4W,C,M]`. Designed sink is **16**. You KEEPed the extra two 450e bodies and never bought the cutover.

**Legacy depot miss-guard (correctness).** `siteLegacyControllerDepot` (`rooms.construction.ts:658–699`), RCL3-only, chebyshev 2–4, prefer 3, not source-adj. Without it, `hasControllerDepot` is false after a clean wipe and the 4W never parks. Cycle-8 `run-2026-08-15T16-59-09Z` **29029 vs 29628 (−599)** is leftover-5+6W+**this**, not an isolated depot A/B. E12S3 is still 32.9k. Keep the function. Do not claim −599 is the depot.

**No RCL3 BasePlan roads (slots, not speed).** `BasePlan.ts:486–489` `STRUCTURE_ROAD && rcl<4 continue`. Cycle-8 comment: 15 sites × 8 rooms blew the global 100-site cap so the first RCL4 room could not site storage (E13S7). Cycle-9 `run-2026-08-15T18-32-26Z` **30728 vs 29856 (+872)**. KEEP *policy* so leftover-5 can release the 4-slot budget (`_rcl3-sites-roads.md`). Calling it a speed KEEP is cargo-cult.

### Cargo-cult

**No RCL2 source/depot boxes as a speed KEEP.** Cycle-10 `run-2026-08-15T19-38-56Z`: RCL3 **13327 vs 13809 (−482)**, RCL4 **30002 vs 28404 (+1598)** and **+973 vs cycle-8**. They KEEPed a RCL3 win that **lost the clock that matters**. Implementation is a lie: source seats are gated `level >= 3` (`construction.ts:1422, :1432`) but **hub still slams at RCL2** (`:1132`) and **bin sites at `energyCapacityAvailable > 500`** (`:1100`) — slam-5 makes cap 550 *while still RCL2*. Cycle-15 snap: L2 E12S3 already 2 live boxes, E18S9 1+2 sites. That is hub+bin, not the gated source seats. PlanV2 still hands RCL2 `container[0]` (`PlanV2.ts:1097–1100`). Race rooms miss the pack, so the 8-pair is "fine"; VPS/claim slams a box.

**5W latch as a 5W KEEP.** Cycle-15 `run-2026-08-15T23-57-10Z` is **watching**. Latch held (8/8 cand = 2 miners, `_cycle15-snap.md`). Bodies are clamp-4W. `clampSpawnListToCapacity` (`rooms.spawning.ts:208–230`): `floor(550*0.85)=467`; hardcoded `[5W,M]=550` shrinks to `[4W,M]=450`. After the leftover 2W dies the source sits at **8 e/t** for ~1500t. Slam-5 paid 15k for a 10 e/t rung the clamp gives back. Dirty tree already has the 550 miner skip at `:208–219` — **not in the live 15 race**. Do not KEEP 15 as "one extra 5W".

**The mark itself.** REPORT L21: "a finishing room is ~6k faster (30.6k → 24.5k)". `_SURFACE.md` still lists leftover-5 as KEEP #0 without the clean-world asterisk. That is how a dirty 7/8 becomes folklore.

---

## 3. Single next knob — best expected Δ on CLEAN world

Do **not** race another construction hold. After cycle-8, every box/road knob lost RCL4 (c9 +872, c10 +1598, c11 +1301).

The stack is lying about income:

- Miners: **8 e/t** after the 2W dies (clamp-4W), not 10.
- Upgraders: **10–12 then 8** (six 2W → four 2W), not 16 parked 4W.
- 135k / 16 ≈ 8.4k ticks designed. At 10 e/t that is ~13.5k. You are climbing the segment that is the whole RCL4 clock at half sink.

| # | knob | model Δ spawn→RCL4 | why this, not that |
|---|---|---|---|
| **1** | **5W clamp skip** (`_next-5w-clamp.md`) | **−150…−600** | slam-5 is a lie until `[5W,M]` hatches. Skip 85% shrink for home 550 miner **and** HOL shrink when `bodyCost <= cap` (`:3029` `length*100=600` at cap 550). Do not touch `getBody`, the 550 producer, or `fiveWQueued`. Race **latch vs latch+skip** on a **clean** seed. Compare to **29029**, not 24512. |
| 2 | RCL3 overlap-replace 4W (roster D) | **−200…−800** (tail −1k) | bigger model. Sign-flips if the extra 500e starves `depotSink`. Measure after #1 so income is 10 e/t. Do **not** extras-only suicide (12→8, still no 4W). Do **not** recycle-walk (cycle-7). |
| 3 | Source-sticky pickup | hard/far mean | cycle-12 died because closest-select stacked both bodies on the near pile. Count-cut is the wrong first haul knob. After #1 the far pile is 10 e/t. |

**Pick #1.** Smaller than D on paper; it is the only legal next race while 15 is live, and every later income knob is junk at 8 e/t. If 15 SEND BACK, drop #1 and start at D.

Not these: adopt-plans (you *pay* for tiles; 24512 was *unowned leftovers already standing*); first-box min-chebyshev (needs pack); reopen no-rcl2-boxes; haul-2; HOL; recycle.

Hygiene is a **gate**, not a knob (`_clean-world.md` / `_NEXT-RACE.md` §0): user-null scrub, both racers' `Memory.rooms`, no stale `planV2` / `rclTimes.8`. Cycle-15 is still watching — do not mid-race push the clamp skip that is already sitting in the dirty tree.

---

## 4. Overfitting slam-5 / `1f90aub`?

**Yes. The KEEP stack is a 16-room, one-orientation, no-planV2, leftover-box story.**

- **Same 16 rooms every row.** `docs/BENCHMARK-ROOMS.json` `setHash` **`1f90aub`**, frozen 2026-08-01T16:15:28Z. `--swap` is mandatory: 6/8 pairs exceed the 8.0 pair-distance warn bar (`CONTROL.md` §3). The KEEP stack never ran the unswapped complement.
- **Race rooms have no `planV2`.** `construction()` never enters `placeFromPlanV2`. So: PlanV2 still sites RCL2 `container[0]` and RCL3 arterials (`typeAllowedAtRcl` road `>=3`, `roadsForRcl` non-empty at 3). "No RCL2 boxes" / "no RCL3 roads" are **BasePlan/legacy only**. Adopt the pack and both KEEPs vanish (`_next-after-15.md` #4).
- **All 16 are 2-source, low-swamp 0–12%.** 1:1 haul is free. One-source HOL, swamp 2:1, remotes — untested. `identifySources` order is `find(FIND_SOURCES)`, not hub-near; 6/16 real far-first (`_next-boxes.md`).
- **Control is Aug 1 planner-era `e839fc8`**, not a slam-5 twin. Control still dumps 10 ext, sites RCL3 roads, sites RCL2 boxes. Leftover-5 A/B is vs old policy, not vs a clean leftover-5 control. 6W was never vs a clean 4-shuttle control.
- **Slam-5 is baseline, not a KEEP.** Cycle-3 `run-2026-08-15T08-22-05Z`: RCL2 **762 vs 855**, RCL3 **17380 vs 15619 (+1761 lose)**, RCL4 **30603 6/8 vs 30159 8/8**. E18S9 late **+6382**. They then stacked 6W / leftover-5 / roads / boxes on that loser and called the pile a stack.
- **Means are a few rooms.** E13S7 (ctrlSteps 10, easy band) always finishes first ~23–25k. E5S3 / E12S3 (far) dominate the mean. Cycle-5 "win" was leftover depot on those far rooms — overfitting to planner dirt that *happens* to sit on `plans-hub` depot seats.
- **`Game.time` ~3–4e6.** Tick-0 `lastSpawn=0` flood (`_next-5w-latch.md` §1) is invisible. Cycle-13/14 only blew up because they poked `lastSpawn=0` on a live 2W.
- **7/8 censoring treated as KEEP.** Campaign law (`CONTROL.md` §4): different censoring counts → means not comparable. Cycle-5 KEEP violates that. Cycle-3 slam-5 6/8 did too.

A KEEP that only pays on leftover depot tiles in this 16, or only vs a two-week-old control that dumps 10 ext, is not a spawn→RCL8 KEEP.

---

## 5. What I would delete from `src` right now

No edit this turn. If I could:

| delete | where | why |
|---|---|---|
| `values.lastSpawn = 0` poke | `rooms.spawning.ts:4260–4276` | cycle-13/14 gun. Flag is the safety; the poke is the flood. One-shot unshift or nothing. |
| Dead shell-road filter | `BasePlan.ts:521–526` | unreachable after `rcl<4 continue` |
| RCL2 hub-bin site | `rooms.construction.ts:1100` (`energyCapacityAvailable > 500`) | 5k during slam. Cycle-10 KEEP is a lie while this lives. |
| Dual hub at RCL2 | `construction.ts:1132` `level == 2 \|\| 3` | same. Hub+bin is what cycle-15 L2 film already shows. |
| PlanV2 RCL2 first source seat | `PlanV2.ts:1100` `lvl < 3 ? 1 : early` | no-rcl2-boxes KEEP does not apply on the plan path. Align or admit the KEEP is race-only. |
| PlanV2 RCL3 roads | `roadsForRcl` / `typeAllowedAtRcl` road `>=3` | `_rcl3-sites-roads.md` wanted `[]` at `lvl===3`. 4 empty arterials hostage the first RCL4 storage pack (`budget = 4 − 4 roads`). |

**Do not delete:** `extensionTake` leftover-5; 6W `amount` after 550; `siteLegacyControllerDepot`; BasePlan `STRUCTURE_ROAD && rcl<4`. Those are the load-bearing four.

**Already gone (good):** `hatchedHomeHauler` / RCL1 HOL; `recycleTinyShuttles`; haul `MAX_HOME_CARRIERS_PER_SOURCE=2`; one-source-box. `recycleTinyCarriers` is still on (tiny haulers @550, not the sent-back knob) — leave it.

**Do not KEEP cycle-10 no-rcl2-boxes as a speed win.** Either revert the source-seat gate (RCL4 lost +1598) or finish the job (hub+bin+PlanV2) and re-race on clean vs **29029**. Partial leak-close that moves 10–15k of box spend onto the 135k is how you get 30002.

---

## Future check (CRITIC.md)

| policy | Q1 still-build | Q2 dead-cap / steal | Q3 RCL8 no-rewrite | |
|---|---|---|---|---|
| leftover-5 hold, dump at RCL4 | yes — `engineCap` | yes — 15k on 405k, not 135k; 800 dead | yes | **SHIP policy** |
| treat 24512 as the mark | n/a | n/a | n/a | **SEND BACK the clock** |
| 6W after 550, 4 during slam | yes — spawn-only | yes — 6×2W on 45k leftover; not 6×4W | yes | **SHIP shape; re-A/B clean** |
| no RCL3 BasePlan roads | yes — RCL4 still sites | yes — 0 energy on 135k | yes | **SHIP slots; not speed** |
| no RCL2 source boxes (partial) | yes — sited at 3 | **no** — 10–15k on 135k; hub+bin still slam | yes | **SEND BACK as speed KEEP** |
| depot miss-guard | yes — one container | yes — unlocks parked 4W | yes | **SHIP correctness** |
| 5W latch / lastSpawn=0 | n/a | n/a | n/a | **not a KEEP** |

---

## Did not

`push-race`. `server:local:reset`. git push. unclaim E36N57. VPS SSH. `src` edit. Mid-race push. Re-baseline. Seed.

Cycle-15 `run-2026-08-15T23-57-10Z` is still watching. Wait RCL4 8/8. Then clamp-skip on a **clean** seed vs **29029**.
