# Next — 20-step controller (E12S3) without touching E13S7

Read-only rec. No src. Do not bundle. Metric: spawn→RCL4.

**One knob:** site the controller depot at RCL2 after slam-5, only when
`spawn.pos.getRangeTo(controller) > 10`. Keep `[2W,2C,2M]`. Do **not** add
a 7th shuttle.

---

## Geometry (BENCHMARK `1f90aub` + film spawn)

`ctrlSteps` is 8-dir BFS from the **anchor**, not spawn, not a source.

| | E12S3 | E13S7 | E5S3 |
| --- | ---: | ---: | ---: |
| BENCHMARK `ctrlSteps` | **20** far | **10** mid | **2** near |
| `srcSteps` | 12+20 | **2+3** | 18+29 |
| spawn (film) | (33,21) | (15,15) | (24,30) |
| controller | (19,27) | (25,14) | (37,41) |
| spawn→ctrl Chebyshev | **14** | **10** | 13 |
| nearer source→ctrl Cheby | 18 | 13 | 16 |

E13S7 is **not** ctrlSteps 2. That is E5S3. E13S7’s 2+3 is sources-to-anchor.
Spawn→ctrl is 10 either way — a `>10` Chebyshev gate leaves it on live policy.

Do **not** gate on source→ctrl range. E13S7 is 13–15 and would fire.

Do **not** gate on BENCHMARK `ctrlSteps`. E13S9 is ctrlSteps 20 with spawn→ctrl
Cheby **7**; E5S3 is ctrlSteps 2 with spawn→ctrl **13**. Live walk is spawn /
pickup → controller.

---

## Elapsed (candidate, same assignment)

`leftover-5` E12S3 R4 **23987** is dirty: cycle-7 leftover depot objects at
planner tiles (`_cycle7-recycle.md`). Clean far baseline is cycle-8 (object
scrub + legacy depot).

| cycle | E12S3 R2 / R3 / R4 | E13S7 R2 / R3 / R4 |
| --- | ---: | ---: |
| 5 leftover-5 (dirty depot) | 954 / 11394 / **23987** | 452 / 8450 / **23602** |
| 8 legacy depot (clean) | 847 / 16365 / **32872** | 1242 / 11816 / **23470** |
| 10 no RCL2 boxes KEEP | 1287 / 18391 / **34635** | 758 / 10306 / **24728** |
| 11 one source box SEND BACK | 1109 / 17703 / **33818** | 550 / 10708 / **24244** |

Means: leftover-5 RCL4 **24512** 7/8. Cycle-10 **30002**. Cycle-11 **29819**.

Clean gap E12S3 − E13S7 ≈ **9k** (32.9k vs 23.5k). Split ~4.5k on the 45k
(shuttle walk) and ~4.9k on the 135k (depot stands late; dry 4W fall back to
shuttle). Cycle-10/11 only add another ~1–2k on E12S3 vs clean cycle-8.
E13S7 stays 23.5–24.7k across 8/10/11.

---

## Shuttle math at leftover-5 cap 550

`[2W,2C,2M]` 450e, 1 t/tile plains. Cycle = harvest 25 + 2L + upgrade 50.

| L (pickup→ctrl) | e/t | ×6 |
| ---: | ---: | ---: |
| 10 (E13S7 spawn) | 1.05 | 6.32 |
| 13 (E13S7 nearer source) | 0.99 | 5.94 |
| 14 (E12S3 spawn) | 0.97 | 5.80 |
| 18 (E12S3 nearer source) | 0.90 | 5.41 |
| 20 (E12S3 `ctrlSteps`) | 0.87 | 5.22 |

Income after 550 is 20 e/t. All of these are upgrade-bound. Parked 4W ×4 = 16
e/t the tick a stocked depot exists (`hasControllerDepot`, range ≤4, not
source-adj). That is the step that kills the 2L walk.

Live `shuttleUpgraderBody` (`rooms.spawning.ts:3361–3364`): `<550` → 200e
`[W,C,M]`; `≥550` → `[2W,2C,2M]`. RCL2 never parks, even if a depot stands.
RCL3 parks only after the structure exists (`:913–915`). Legacy siting
(`siteLegacyControllerDepot`, `rooms.construction.ts:658–700`) is
`ctrl.level !== 3` — RCL2 cannot get a depot today.

---

## Rejected: shuttle body

No 550e body beats `[2W,2C,2M]` enough to be a race:

| body | cost | loaded | L=20 e/t | vs 0.87 |
| --- | ---: | --- | ---: | ---: |
| `[2W,2C,2M]` live | 450 | 1 t/tile | **0.87** | — |
| `[2W,3C,3M]` | 550 | 1 t/tile | 0.98 | +13% |
| `[3W,2C,2M]` | 550 | **2 t/tile** | 0.91 | +5%, loses as L grows |
| `[4W,C,M]` | 500 | 3 t/tile | ~0.36 | dead (why RCL2 is a shuttle) |

550e fill has **zero slack** at leftover-5. Cycle-7 recycle of living bodies
is SEND BACK (far rooms walk the 1W off the controller). Recipe flip does not
rewrite the six 450e already alive — same no-op as `_next-rcl2-sink.md`.
Body-only is dead unless bundled with recycle.

---

## Rejected: +1 upgrader when range > 10

Live RCL2 amount is already `cap>=550 ? 6 : 4` (cycle-4 KEEP). `pressure.burn`
adds +1..4 once floor ≥3000 (`:3534–3588`). After slam, income 20 − sink ~5.2
piles ~15 e/t → burn+1 in **~200 ticks**. Cycle-10 left source boxes off, so
the floor is fatter, not thinner.

Static 6→7 on far rooms is “burn, 200 ticks sooner.” Model **−0 to −800** on
the leftover 30k, ~0 once burn is live. Raising RCL3 `amount` as well HOL-blocks
the 5k depot (450e that should have been builder energy). Cycle-4 already said:
do not run extras during a 5k site.

E13S7 would be safe if gated `spawn.getRangeTo(ctrl) > 10` (it is 10). The
knob is just too small, and redundant with burn on the current no-box stack.

---

## The change

**Control:** live. `siteLegacyControllerDepot` only at RCL3. RCL2 amount 6
after 550. `[2W,2C,2M]`. Cycle-10 no RCL2 **source** boxes stays.

**Candidate (one knob):** same function, also site when

```
ctrl.level === 2
&& spawn.pos.getRangeTo(ctrl) > 10
&& room.energyCapacityAvailable >= 550
```

Same tile pick (prefer Cheby 3, plains, nearer spawn). Same “already standing
or queued → return.” Do **not** site during slam-5 (cap < 550). Do **not**
site a source box. Do **not** touch `plannedTilesFor` this race (bench rooms
have no `planV2`; this is the legacy path cycle-8 already uses). Do **not**
switch RCL2 to `parkedUpgraderBody` this race — empty-at-controller
`acquireEnergy` will draw the new depot (closest worthwhile, range 3 vs
source 18–27). RCL3 parks the 4W the tick the structure exists.

E13S7 spawn→ctrl = 10 → **no site, no spawn change**.

### Model (E12S3, L≈18–20 until depot, then ~0 walk)

2 builders `[W,2C,2M]` ≈ 4 e/t into a 5k site → ~1250 ticks + the 14-step walk.
Then 6 shuttles withdraw-upgrade ≈ 2.0 e/t each → **~12 e/t** vs 5.2.

| clock | vs live | why |
| --- | --- | --- |
| spawn→RCL2 | ~0 | gate is 550 |
| **RCL2→RCL3** | **−1.5k to −2.5k** | 1250t still at ~5.2, leftover ~23k at ~12 vs all 30k at 5.2 |
| **RCL3→RCL4** | **−0.5k to −1.5k** | depot already stands; park 16 e/t from tick 0 of 3, no 20-step builder walk at open |

E13S7: **0**. Far set that fires (spawn→ctrl Cheby > 10): E12S3 14, E8S5 19,
E11S6 13, E8S3 11, E18S5 27, E6S1 20, E12S1 22, E3S5 21, E5S3 13, E21S4 12.
Eight of sixteen. E13S7 / E18S9 / E9S1 / E13S9 / E16S9 / E4S7 stay off.

### Cost

5k after 550, only on the far half. Two 300e builders already live
(`earlyBuildSlots=2`). No extra spawn tax. Does not reopen cycle-10 (that KEEP
was “no source/depot **during slam** / no source boxes at RCL2 for everyone”).
This is post-slam, depot only, gated.

---

## Do not bundle

- Shuttle body / recycle 200e (cycle-7 SEND BACK).
- RCL2 `amount` 6→7, RCL3 4→5, `pressure.burn`.
- Source boxes, RCL3 roads (cycle-9 KEEP policy), leftover ext.
- `parkedUpgraderBody` at RCL2. Follow-up only if film shows 450e still
  walking past a stocked depot.
- PlanV2 `plannedTilesFor` RCL2 take=1 (source seat). Separate if a planned
  room ever sits on this bench.

---

## Film

`http://127.0.0.1:8767/` pair film. After `cap==550` on E12S3: a `container`
site at Cheby 2–4 of (19,27), not a source seat, **before** `rcl==3`. E13S7:
no new container until RCL3. Fail if E13S7 sites one at RCL2, or if E12S3
sites during slam (`cap<550`).
