# 24512 is leftover boxes, not the leftover-5 clock

`--swap` set `1f90aub`. Same 16 rooms every row. Control frozen `e839fc8`.
Poll uncertainty 89–164 ticks — ignore gaps under ~200.

| run | label | world | cand RCL3 | cand RCL4 | ctrl RCL3 | ctrl RCL4 |
|---|---|---|---:|---:|---:|---:|
| [12-13-10Z](run-2026-08-15T12-13-10Z.json) | cycle-5 leftover-5 | dirty (`--wipe` only) | **11000** 8/8 | **24512 7/8** | 12156 | 28385 8/8 |
| [16-59-09Z](run-2026-08-15T16-59-09Z.json) | cycle-8 legacy-depot | **clean scrub** | 13829 8/8 | **29029 8/8** | 13949 | 29628 8/8 |
| [19-38-56Z](run-2026-08-15T19-38-56Z.json) | cycle-10 no-rcl2-boxes | clean | 13327 8/8 | **30002 8/8** | 13809 | 28404 8/8 |

**Verdict.** Of 30002 − 24512 = **5490**:

| piece | ticks | what |
|---|---:|---|
| leftover planner objects (same 7 finishers, leftover-5+6W held) | **+3786** | cycle-5 → cycle-8 RCL4 |
| 7/8 selection (drop E5S3) | **+731** | cycle-8 8/8 29029 − same-7 28298 |
| later knobs (no RCL3 roads, no RCL2 boxes) | **+973** | cycle-8 → cycle-10 8/8 |

3786 + 731 + 973 = 5490. **~4.5k is world dirt + dropping the room the dirt wrecked. ~1k is real code after the scrub, and it lost RCL4.**

Honest leftover-5+6W mark on a clean seed is cycle-8 **29029 8/8**, not 24512. Clean-seed cand RCL4 stays in a **29–32k** band (c8 29029, c9 30728, c10 30002, c11 29819, c12 32303).

Leftover-5 as *policy* (do not spend 15k on a dead 800 cap) still KEEP. The 24.5k *clock* is retired.

---

## What the dirt was

`race.mjs --wipe` deletes `user ∈ {pacifist1, pacifist-race}` and resets the controller. **`user: null` structures stay.** Planner roads and containers from earlier packs survive as unowned objects.

Documented leftovers still sitting through cycle-7 ([`_cycle7-recycle.md`](_cycle7-recycle.md)):

- E5S3 container at **(40,42)** — planner depot tile
- E12S3 container at **(18,30)** — planner depot tile

Cycle-5 seed also bounced on leftover **roads**:

- cand E5S3 **(24,30)** road (seed-failed, then placed)
- ctrl E8S5 (24,9) road
- ctrl E4S7 (30,32) road

Race rooms have no `planV2`. The parked 4W only fires on a **live** controller-adjacent container. On the dirty seed that box was already there, so far rooms parked on tick 0 of RCL3. Cycle-8 did a full object+memory scrub (`0 leftover planner boxes` in WORKBENCH) and started siting a real legacy depot so the 4W could park after a clean wipe.

Cycle-6/7 ran on the same leftover objects. Cycle-8 is the first clean world.

### Cycle-15 census (tick 4728434) — do not wipe/delete now

HTTP room-objects, dest pacifist + dest race. Full tile list + DELETE
(after 15 ends): [`_next-seed-leftovers.md`](_next-seed-leftovers.md).

0 pre-seed ObjectIds — cycle-15 started clean. This race rebuilt the
same dirt class: **66 containers + 428 control roads**, all `user: null`.
`--wipe` will leave them. Known ghosts **still stand** (this-race builds
on the planner tiles): E5S3 **(40,42)**, E12S3 **(18,30)**.

New planner-depot hits (same `_next-boxes.md` `container[2]` seats):

- cand E18S9 **(28,6)** · E18S5 **(10,12)**
- ctrl E9S1 **(27,40)** · E6S1 **(37,8)** · E3S5 **(41,27)**

All 16 rooms have a depot-range container. Spawn-tile roads that will
fail `spawn-in` after wipe: ctrl E8S5 **(24,9)**, ctrl E4S7 **(30,32)**.
Cand E5S3 (24,30) road is gone (spawn sits there; cand 0 roads).

---

## Candidate per-room (same assignment)

RCL3 elapsed, spawn → 3.

| slot | room | ctrlSteps | c5 | c8 | c10 | c8−c5 | c10−c5 |
|---|---|---:|---:|---:|---:|---:|---:|
| B1 | E5S3 | 2 | 16040 | 15275 | 15204 | −765 | −836 |
| B2 | E12S3 | 20 | 11394 | 16365 | 18391 | **+4971** | **+6997** |
| B3 | E18S9 | 6 | 12828 | 16568 | 15779 | +3740 | +2951 |
| B4 | E11S6 | 14 | 10621 | 14179 | 11433 | +3558 | +812 |
| B5 | E16S9 | 6 | 10574 | 13448 | 12032 | +2874 | +1458 |
| B6 | E18S5 | 25 | 9439 | 11435 | 11993 | +1996 | +2554 |
| B7 | E12S1 | 21 | 8651 | 11545 | 11477 | +2894 | +2826 |
| B8 | E13S7 | 10 | 8450 | 11816 | 10306 | +3366 | +1856 |
| | **mean 8/8** | | **11000** | **13829** | **13327** | **+2829** | **+2327** |
| | same-7 (no E5S3) | | 10280 | 13622 | 13059 | +3342 | +2779 |

RCL4 elapsed, spawn → 4.

| slot | room | c5 | c8 | c10 | c8−c5 | c10−c5 |
|---|---|---:|---:|---:|---:|---:|
| B1 | E5S3 | — (L3 p=105277) | 34148 | 34246 | | |
| B2 | E12S3 | 23987 | 32872 | 34635 | **+8885** | **+10648** |
| B3 | E18S9 | 27256 | 32070 | 32430 | +4814 | +5174 |
| B4 | E11S6 | 27599 | 27870 | 27572 | +271 | −27 |
| B5 | E16S9 | 23643 | 25963 | 28463 | +2320 | +4820 |
| B6 | E18S5 | 22209 | 25981 | 28424 | +3772 | +6215 |
| B7 | E12S1 | 23287 | 29859 | 29518 | +6572 | +6231 |
| B8 | E13S7 | 23602 | 23470 | 24728 | −132 | +1126 |
| | **mean** | **24512 7/8** | **29029 8/8** | **30002 8/8** | | |
| | same-7 | 24512 | 28298 | 29396 | **+3786** | **+4884** |

Signature is leftover **depot**, not leftover roads. Far controllers (ctrlSteps 20–25: E12S3 / E18S5 / E12S1) lose 6–10k to RCL4 once the free box is gone. Near E13S7 (ctrlSteps 10) is a wash at RCL4. Mid rooms pay at RCL3 and then catch up (E11S6 RCL4 27599 / 27870 / 27572).

Almost all of the leftover gap is already on the board at RCL3 (same-7 +3342 of +3786). The 135k segment is only ~+400 mean c5→c8. Cycle-10’s extra ~1k vs cycle-8 *is* on the 135k (no RCL2 boxes: slam spends 0 on source/depot, then pays 10–15k after 3).

RCL2 is not the story (739 vs 938 vs 908). Mixed per room, leftover roads do not explain 24512.

---

## E5S3 — dirt that *hurt*

Only candidate 7/8 miss. Leftover road on **(24,30)** failed the first seed; retry at tick 4376680 (`seedOk` after `seed-failed`). Spawn sat on a dirty tile. lastSeen at budget: L3, 105277/135000, 5 ext, 17 creeps, 39389 ticks from seed. Observed 4.51 e/t on the climb → **~46k** projected RCL4.

An 8/8 cycle-5 mean with that projection is **~27200**, not 24512. 24512 is the seven rooms leftover boxes *helped*, with the room leftover road *wrecked* dropped from the mean.

Clean E5S3 is a late 34.1–34.2k both cycle-8 and cycle-10 — the pair’s slow room, not a 24k room.

---

## Control (frozen) — leftover vs clean, no candidate knobs

Same rooms, same `e839fc8`. This is the leftover-structure instrument.

RCL3

| slot | room | c5 | c8 | c10 | c8−c5 |
|---|---|---:|---:|---:|---:|
| B1 | E9S1 | 13627 | 16587 | 14955 | +2960 |
| B2 | E13S9 | 12274 | 15889 | 15971 | +3615 |
| B3 | E8S5 | 13518 | 13864 | 14025 | +346 |
| B4 | E8S3 | 12135 | 13667 | 14272 | +1532 |
| B5 | E4S7 | 13017 | 12008 | 12052 | −1009 |
| B6 | E6S1 | 11995 | 15157 | 15293 | +3162 |
| B7 | E3S5 | 9136 | 12743 | 12124 | +3607 |
| B8 | E21S4 | 11547 | 11677 | 11777 | +130 |
| | **mean** | **12156** | **13949** | **13809** | **+1793** |

RCL4

| slot | room | c5 | c8 | c10 | c8−c5 | c10−c5 |
|---|---|---:|---:|---:|---:|---:|
| B1 | E9S1 | 37394 | 28153 | 27224 | −9241 | −10170 |
| B2 | E13S9 | 28979 | 33629 | 31075 | +4650 | +2096 |
| B3 | E8S5 | 27756 | 29897 | 27018 | +2141 | −738 |
| B4 | E8S3 | 25063 | 31547 | 27940 | +6484 | +2877 |
| B5 | E4S7 | 24919 | 22789 | 24372 | −2130 | −547 |
| B6 | E6S1 | 22729 | 31113 | 31456 | +8384 | +8727 |
| B7 | E3S5 | 23190 | 35917 | 34139 | +12727 | +10949 |
| B8 | E21S4 | 37046 | 23975 | 24008 | −13071 | −13038 |
| | **mean** | **28385** | **29628** | **28404** | **+1243** | **+19** |

Control leftover benefit is **~1.6–1.8k at RCL3**, **0–1.2k at RCL4** (c10 ties c5; c8 is +1.2k). Candidate leftover benefit is larger (~2.8k RCL3 / ~3.8k same-7 RCL4) because only the candidate parks a 4W on a leftover depot.

That extra ~1.0k of leftover-depot help is why cycle-5 leftover-5 vs control was **−1156** RCL3 and cycle-8 (same policy, clean) is **−120**. The A/B shrunk by the dirt, not because leftover-5 stopped holding (cand L3 sat at 5 ext on all three runs).

Control RCL4 per-room is loud (E21S4 37k dirty / 24k clean; E3S5 the other way). Do not read leftover roads as a uniform gift. Mean leftover vs clean for frozen control at RCL4 is inside race noise.

---

## What is still real code

**Leftover-5 hold (cycle-5).** Live check: cand L3 = 5 ext, ctrl = 7–10. On a *dirty* world that also looked like −4.7k RCL4 vs cycle-4 (29181 8/8). Cycle-4 was the same leftover world *without* the hold. Cycle-8 leftover-5 + depot on a *clean* world is **29029** — the same clock as cycle-4. The 24.5k “leftover-5 win” is leftover boxes + 7/8. The policy still pays (skip 15k of dead ext); it is not a 5k RCL4 lever on a clean seed.

**Legacy depot (cycle-8).** Miss-guard so the 4W can park after a clean wipe. A/B −599 RCL4 vs frozen control. Not a leftover-box substitute — E12S3 is still 32.9k.

**No RCL3 roads (cycle-9) / no RCL2 boxes (cycle-10).** Construction leaks closed. Cycle-10 KEEP on RCL3 (−482 vs control, 13327 vs cycle-8 13829). RCL4 **+973 vs cycle-8, +1598 vs control**. Real, and it lost the clock that matters.

Do not treat 24512 as the number a later cycle has to beat. Beat **29029 8/8** (clean leftover-5+6W) or the live control on that seed.
