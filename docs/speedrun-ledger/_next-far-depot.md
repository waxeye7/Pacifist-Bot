# Next — far-ctrl depot at RCL2 after slam-5

Race-ready one-knob. **Do not edit src until this is the live A/B.** Cycle-15
watching. No `push-race`. No leftover-5. No source boxes. No body / amount.

Expands `_next-far-ctrl.md`. Metric: mean ticks spawn→RCL4. Compare E12S3
to clean cycle-8 **32872**, not dirty leftover-5 23987.

**One knob:** `siteLegacyControllerDepot` also sites at RCL2 when

```
ctrl.level === 2
&& spawn.pos.getRangeTo(ctrl) > 10
&& room.energyCapacityAvailable >= 550
```

Same tile pick as today. RCL3 still always sites (cycle-8 miss-guard).

---

## Geometry — race spawn, not the hardness anchor

`RoomPosition.getRangeTo` is Chebyshev. Race spawn is `spawn-in.mjs` →
`plans-hub.json` `structures.spawn[0]`. Film `st:[["spawn",x,y]]` matches
that tile on **16/16** (`run-2026-08-15T08-22-05Z`).

BENCHMARK `ctrlSteps` is 8-dir BFS from the **anchor**, not spawn. Do **not**
gate on it. Do **not** gate on source→ctrl.

| room | slot | spawn | ctrl | Cheby | `ctrlSteps` | `ctrlBand` | fire `>10` |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| **E12S3** | B2 | 33,21 | 19,27 | **14** | 20 | far | **YES** |
| E8S5 | B3 | 24,9 | 43,9 | **19** | 10 | mid | **YES** |
| E11S6 | B4 | 25,21 | 12,24 | **13** | 14 | mid | **YES** |
| E8S3 | B4 | 22,16 | 18,5 | **11** | 14 | mid | **YES** |
| E18S5 | B6 | 9,36 | 8,9 | **27** | 25 | far | **YES** |
| E6S1 | B6 | 38,25 | 40,5 | **20** | 23 | far | **YES** |
| E12S1 | B7 | 27,16 | 15,38 | **22** | 21 | far | **YES** |
| E3S5 | B7 | 23,27 | 44,30 | **21** | 18 | far | **YES** |
| E5S3 | B1 | 24,30 | 37,41 | **13** | **2** | near | **YES** |
| E21S4 | B8 | 39,11 | 42,23 | **12** | 9 | mid | **YES** |
| **E13S7** | B8 | 15,15 | 25,14 | **10** | 10 | mid | **no** |
| E18S9 | B3 | 35,13 | 25,6 | **10** | 6 | near | **no** |
| E9S1 | B1 | 31,40 | 24,37 | **7** | 5 | near | **no** |
| E13S9 | B2 | 17,33 | 10,27 | **7** | **20** | far | **no** |
| E16S9 | B5 | 35,29 | 42,22 | **7** | 6 | near | **no** |
| E4S7 | B5 | 30,32 | 33,39 | **7** | 3 | near | **no** |

**10 fire / 6 off.** `>10` is exclusive: E13S7 and E18S9 sit on 10.

Traps (why the gate is spawn Cheby, nothing else):

- E13S9 is BENCHMARK far (`ctrlSteps` 20) with spawn→ctrl **7** → off.
- E5S3 is BENCHMARK near (`ctrlSteps` 2) with spawn→ctrl **13** → on.
  Operational BFS spawn→ctrl is **32** (`_late-rooms.md`). Cheby is the
  knob; do not swap in path length this race.
- E13S7 nearer source→ctrl Cheby is **13**. A source-range gate would
  fire the easy room. Do not.

`--swap` candidate (cycle-8/10 assignment): fire E5S3 / E12S3 / E11S6 /
E18S5 / E12S1. Off E18S9 / E16S9 / E13S7. **5/8.** Other swap: same 5/8
on the twin list.

---

## Why this does not undo cycle-10 no-RCL2-boxes KEEP

Cycle-10 KEEP (`REPORT`, `_clean-world.md`): source/depot boxes **start at
RCL3**. RCL3 **−482** vs control (slam spends 0 on boxes). RCL4 **+973 vs
cycle-8 / +1598 vs control** — paid 10–15k of source+depot *after* 3.

This knob is not that:

| | cycle-10 KEEP | this |
| --- | --- | --- |
| during slam (`cap < 550`) | no source, no depot | **still no** (`>= 550`) |
| RCL2 source seats | `level >= 3` (`construction.ts:1422`, `:1432`) | **untouched** |
| who gets an RCL2 depot | nobody | only spawn Cheby **>10** |
| E13S7 / E18S9 / E9S1 / E13S9 / E16S9 / E4S7 | no RCL2 box | **still no** |
| cost | 0 during 45k slam | **5k after 550**, far half only |

RCL2 elapsed stays ~0 vs live (gate is 550). Hub + bin still slam
(`_review-src.md` — cycle-10 was already partial). This does not add
them and does not ungate source seats. Near rooms still buy the depot
at RCL3, same as cycle-8.

---

## Live vs candidate

**Control:** live. `siteLegacyControllerDepot` `ctrl.level !== 3 → return`.
RCL2 amount 6 after 550. `[2W,2C,2M]`. Cycle-10 source seats stay `>= 3`.

**Candidate:** same function, same tile pick, one extra arm on the gate.
Do **not** touch `plannedTilesFor` (bench has no `planV2`). Do **not**
flip `parkedUpgraderBody` at RCL2. Do **not** change `depotSink` /
`findLocked` / amount / shuttle body.

Tile pick (unchanged, `:676–697`): cheb 2–4, not source-adj, not wall,
road/rampart ok. Score `cheb===3 ? 30 : cheb===2 ? 12 : 6`, `+20` plains,
`−getRangeTo(spawn)`. Standing or queued depot → return.

RCL2 upgraders already park on a **stocked** depot (`upgrader.ts:235–243`
`controllerDepot` + `depotPark`, no level gate). Body stays `[2W,2C,2M]`
→ 2 e/t × 6 = **~12 e/t** once the box has ≥50. Carriers already deliver
at `level >= 2` when `baseIsFed` (`carry.ts:159`, `:167–172`). After slam
cap is exactly 550, so full spawn+5 ext **can** go true. The RCL3-only
550-floor exception is leftover-ext; do not copy it here.

---

## Fenced diff — APPLIED

Against `src/Rooms/rooms.construction.ts`. One function. Applied 2026-08-16.
Src only. No push. No push-race. No reset.

```diff
--- a/src/Rooms/rooms.construction.ts
+++ b/src/Rooms/rooms.construction.ts
@@ -653,11 +653,24 @@
 /**
  * Legacy rooms never get planV2's controller bin. The 4W park only pays once a
  * live container sits range ≤4 of the controller and not on a source. Site one
- * at RCL3 (prefer chebyshev 3, plains, nearer the spawn).
+ * at RCL3 (prefer chebyshev 3, plains, nearer the spawn). Also site at RCL2
+ * after slam-5 when spawn→ctrl Chebyshev >10. No source boxes.
  */
 function siteLegacyControllerDepot(room, spawn) {
     const ctrl = room.controller;
-    if (!ctrl || ctrl.level !== 3) return;
+    if (!ctrl) return;
+    if (ctrl.level !== 3) {
+        // After slam-5 only. E13S7 spawn→ctrl is 10 → stays off.
+        if (
+            ctrl.level !== 2 ||
+            !spawn ||
+            spawn.pos.getRangeTo(ctrl) <= 10 ||
+            room.energyCapacityAvailable < 550
+        ) return;
+    }
     const sources = room.find(FIND_SOURCES);
     const isDepot = function (pos) {
         return pos.getRangeTo(ctrl) <= 4 && pos.findInRange(sources, 1).length === 0;
```

---

## Model Δ vs clean cycle-8 E12S3 **32872**

Do not use leftover-5 E12S3 **23987** — leftover planner depot at (18,30)
(`_clean-world.md`, `_cycle7-recycle.md`).

| | R2 | R2→3 | R3→4 | R4 |
| --- | ---: | ---: | ---: | ---: |
| cycle-8 legacy depot (clean) | 847 | **15518** | 16507 | **32872** |
| cycle-10 no RCL2 boxes KEEP | 1287 | **17104** | 16244 | **34635** |
| cycle-11 one source box SEND BACK | 1109 | 16594 | 16115 | 33818 |

c10 − c8 on E12S3 is **+1763**, almost all on the 45k (no RCL2 source
boxes). This knob does **not** put those boxes back. It spends **one** 5k
depot after 550 so the 6 shuttles stop walking L≈14–18.

Shuttle `[2W,2C,2M]` 450e, 1 t/tile plains. Cycle = harvest 25 + 2L +
upgrade 50. Stocked depot: withdraw + upgrade, **~2.0 e/t** each → **~12
e/t** vs 5.2. Two `[W,2C,2M]` into a 5k site ≈ 4 e/t → **~1250t** + the
14-step walk, still at ~5.2.

| clock | if depot stocks | if depot stays dry (`baseIsFed` never) |
| --- | --- | --- |
| spawn→RCL2 | ~0 | ~0 |
| **RCL2→RCL3** | **−1.5k to −2.5k** | **0 to +800** (5k tax) |
| **RCL3→RCL4** | **−0.5k to −1.5k** (4W from t0 of 3; no 20-step builder walk) | **−0.5k to −1.5k** |
| vs live c10 **34635** | **−2.0k to −4.0k → 30.6–32.6k** | **−0.5k to −1.5k → 33.1–34.1k** |
| **vs c8 32872** | **−0.2k to −2.2k** | **still +0.4k to +1.8k** |

Dry path does **not** close the cycle-10 regression. Stocked path
matches or beats 32872 **without** reopening source boxes.

E13S7: **0**. E5S3: Cheby 13 fires, but the depot *is* the pocket (plan
tile 40,42; BFS ~34). RCL2 park pays only if carriers feed the pocket;
RCL3 16 e/t still needs the far source (`_late-rooms.md`). Model
**−0.5k to −2.0k**, wide because of that last mile.

Other fire rooms scale with Cheby (E8S3 11 thin; E18S5 27 fat). Off
rooms 0. 8-mean (5/8 fire): **−0.6k to −1.8k** if stocked, **~0 to −0.6k**
if dry.

---

## Rank vs sticky pickup

Late-room autopsy (`_late-rooms.md`): sticky is **#1** on E5S3 / E12S3.
That still holds. This is not a substitute.

| | E5S3 | E12S3 | E13S7 | 8-mean |
| --- | ---: | ---: | ---: | ---: |
| **1. sticky** (`_next-sticky-pickup.md`) | **−2.5k to −6.5k** | **−1.5k to −4.5k** | 0 to +100 | −0.5k to −1.4k |
| **2. this depot** | −0.5k to −2.0k | **−2.0k to −4.0k** | **0** | −0.6k to −1.8k |
| 3. RCL2 amount 6→8, L_ctrl≥17 | −1.0k to −1.6k | −0.8k to −1.4k | 0 | −0.2k to −0.4k |

Sticky recovers the ignored far source (c12 3→2 measured the other
slope: E5S3 +3009, E12S3 +4176). This kills the far-ctrl *walk* after a
5k site. E12S3’s fat 45k is this knob; E5S3’s fat 135k is sticky (pocket
depot + unserved far miner). Mean can look similar; the tail that
misses 24512 by 9–10k is sticky first.

Race this **after** sticky if the goal is E5S3/E12S3. Race this first
only if you want a construction-only far-ctrl cut that is guaranteed 0
on E13S7. Do not bundle.

---

## Do not bundle

- Leftover-5 / `extensionTake` / second ext wave.
- Source boxes, RCL2 first-seat order, hub/bin close (`_review-src.md`).
- Shuttle body / recycle 200e (cycle-7 SEND BACK).
- RCL2 `amount` 6→7/8, RCL3 4→5, `pressure.burn`.
- `parkedUpgraderBody` at RCL2. Follow-up only if film shows 450e still
  walking past a stocked depot.
- `depotSink` RCL3 550-floor copied to RCL2. Follow-up if the box stands
  empty while spawn is HOL-busy.
- Builder `findLocked` depot-first at RCL2 (today RCL3-only, `:57`).
  After slam, hub `spawn.y-2` then any container — **bin can win the
  5k**. Watch; do not fix this race.
- PlanV2 `plannedTilesFor` RCL2 take=1. Bench has no pack.

---

## Film

`http://127.0.0.1:8767/` pair film.

- E12S3 after `cap==550`, **before** `rcl==3`: one `container` site at
  Cheby 2–4 of (19,27), **not** a source seat (`(36,9)` / `(46,34)`).
- E13S7: **no** new container until RCL3.
- Fail if E13S7 / E18S9 / E9S1 / E13S9 / E16S9 / E4S7 site a depot at
  RCL2.
- Fail if E12S3 sites during slam (`cap<550`).
- Fail if a **source** seat appears at RCL2 (cycle-10 undone).
- Watch: depot `store > 0` before RCL3 on a fire room. If it stays 0
  until `rcl==3`, the R2→3 model is the dry column — still race, read
  RCL4 against 32872, do not “fix” `depotSink` on the same seed.
