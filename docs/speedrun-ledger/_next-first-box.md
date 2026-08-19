# Next — SURFACE #6: RCL2 first source box = min chebyshev / `si`

Read-only rec. **No src. Diff is fenced, not applied.** No `push-race`.
No `server:local:reset`. Do not unclaim E36N57. Do not overwrite planner
hub. Cycle-11 one-source-box was **SEND BACK**. Cycle-10 no-RCL2-boxes
**KEEP**.

One knob. Metric: mean ticks spawn→RCL4. Set `1f90aub`.

**Dead until the 16 bench plans are adopted on candidate. Yes.**

Adopt (`_next-adopt-plans.md`) does **not** implement this pick. This
patch does **not** implement adopt. Do not bundle.

---

## Verdict

| | |
|---|---|
| Live race path | **inert** |
| Why | rooms are `planPackMiss` + `basePlan`; `construction()` never enters `placeFromPlanV2` |
| After adopt, still | `plannedTilesFor` take-1 is `container[0]` object order |
| This patch alone | compiles, never fires on race rooms |
| Adopt alone | tiles become plan tiles; first box is still far on 6/16 |
| Cycle-10 KEEP | no source/depot at RCL2 on the **legacy** path. Hub container stays. |
| Cycle-11 SEND BACK | one source box through the 135k (2nd at RCL4). Not this. |

Order: adopt 16 on candidate → then this. Control segments stay empty.

---

## Why race rooms have no `planV2`

`construction()` (`rooms.construction.ts:712–715`):

```
if (room.memory.planV2) { placeFromPlanV2(room); return; }
```

No `planV2` → `getBasePlan` + `placeFromBasePlan` + legacy source/depot
blocks. `placeFromPlanV2` / `plannedTilesFor` / `plan.si` never run.

`runPackAdoption` (`AutoExpand.ts:358–454`):

1. every 25t, first owned room with no `planV2` and no fresh `planPackMiss`
2. read segment 86, else sweep 80–85
3. hit → `adoptPacked`
4. miss / 200t timeout → `planPackMiss = Game.time`, retry in **3000** t

Race seed never wrote the 16-room bench pack to candidate 80–86.
Sweep finds nothing. Every bench room is `planPackMiss`. Legacy
`basePlan` builds the clock.

`plans-hub.json` already has all 16. Segments do not.

Young rooms auto-arm `planMigration: auto` once a plan exists. Fatal if
a leftover RCL8 `planV2` survives (`_next-adopt-plans.md` E4S7).

---

## What the knob is (and is not)

Planner emit (`layer-hub.mjs:1308`, `:1479`, `:1554–1560`):

`objects.filter(type===source)` → one seat per source **in that
order** → controller bin → mineral last (`layer-misc`).

`packPlanPayload` does **not** reorder containers (links only).

`containerStageOrder`: last extractor-adjacent tile is mineral,
deferred to RCL6. Early set = the rest, **plan order**.

`plannedTilesFor(container)` prefixes of that one order:

| RCL | take | tiles |
| --- | ---: | --- |
| 2 | 1 | `early[0]` = `plan.t.container[0]` (all 16: mineral is last) |
| 3–5 | `early` | **both** source seats + controller depot |
| 6+ | all | + mineral |

RCL2 is **not** nearest-to-sitter. CYCLE-0 / `4384aa0` said “nearest
source.” Code takes object-order `[0]`.

**This knob:** among early **source** seats only, RCL2 take-1 = min
chebyshev to `plan.si` (storage tile if `si` missing). Same
`1 ⊂ early ⊂ all`. Not two source boxes at RCL2.

**Keep, not this race:**

- Hub container at RCL2 stays (`BasePlan` `structures.container[0] =
  hub`; `placeFromBasePlan` sites it at 2, drops it at 4 when storage
  lands). PlanV2 has no hub container — storage *is* the hub.
- Both source seats stay in the RCL3 set. Depot stays RCL3
  (`siteLegacyControllerDepot` / `early` includes the bin).
- Leftover-5, 6W-after-550. Do not touch `extensionTake`.

Do **not** min-cheb the whole early set. Controller bin is often
closer than either source (E9S1 depot `si`-cheb **2**, near source
**4**, far **36**). That would site the depot at RCL2 and starve the
source box. Last-of-early is the bin (emit order, all 16).

### Not cycle-10 (KEEP)

Cycle-10: source/depot boxes start at RCL3. Cause: `findStorage()` is
the hub container, so `if (storage)` in `construction()` armed both
source seats + the path-depot during the slam (10–15k on 5k tiles
while ext were still finishing). Gate is
`room.controller.level >= 3` at `rooms.construction.ts:1422 / :1432`.

| | RCL3 | RCL4 |
|---|---:|---:|
| c10 vs control | 13327 vs 13809 (**−482**) | **30002 vs 28404 (+1598)** |
| c10 vs cycle-8 | −482 | **+973** |

KEEP the RCL3 policy (don’t dump 10–15k during slam). Lost the clock
that matters. Reopening “slam-5 then one source box” is a **different**
race (`_next-after-15.md` §5). Do not run it in the same seed as this.

### Not cycle-11 (SEND BACK)

Cycle-11: 2nd source box at RCL4 — one source box through the 135k.
`_late-rooms.md`: “nearer source box only.” RCL4 **29819 vs 28518
(+1301)** SEND BACK.

That is *when* the leftover source is paid (never on this clock), not
*which* tile is the single RCL2 box. Holding the 2nd seat is
`_next-boxes.md` #2, after this. E12S3 / E5S3 are already near-first
(Δ=2); c11 picked the wrong pair to prove “nearer.”

| | cycle-10 | cycle-11 | **this** |
|---|---|---|---|
| RCL2 source boxes | 0 | 1 (whichever `[0]` / nearer) | **1, min cheb/`si`** |
| RCL3 source boxes | 2 | 1 (2nd at 4) | **2** |
| Hub container @2 | yes | yes | **yes** |
| Depot @3 | yes | yes | **yes** |

---

## Model Δ — far-first rooms

Metric: chebyshev `plans-hub` `sitter` (`plan.si`) → source seats.
`[0]` vs the other. BENCHMARK `srcSteps` is from the **anchor**, not
the sitter — they disagree (E13S9).

Verified against `tools/plan-suite/out-v2/plans-hub.json` (do not
rewrite).

| room | pair | `[0]` / tile | other / tile | Δ | first is |
| --- | --- | ---: | ---: | ---: | --- |
| **E9S1** | B1 hard | **36** `(12,5)` | 4 `(33,41)` | 32 | **far** |
| **E13S9** | B2 hard | **26** `(19,6)` | 8 `(9,24)` | 18 | **far** |
| E11S6 | B4 | **24** `(47,4)` | 6 `(29,20)` | 18 | far |
| E4S7 | B5 | **21** `(24,13)` | 9 `(40,43)` | 12 | far |
| E18S5 | B6 | **16** `(10,21)` | 3 `(11,34)` | 13 | far |
| E16S9 | B5 | **16** `(21,18)` | 6 `(43,34)` | 10 | far |
| **E12S3** | B2 hard | 14 `(35,10)` | 16 `(47,33)` | 2 | **near** (noise) |

**6 / 16** real (Δ≥5). **2 / 6 hard** far-first: E9S1 (object split
3+41), E13S9 (hub sits on the *other* source than the hardness
anchor). E12S3 is **not** far-first.

Far-first is the worst 5k: dirt walk to the long source, leave the
hub-side tile as drop-mine (the easy haul). Energy is the same either
tile; walk + wrong buffer is the tax.

| room | RCL2→3 model | why |
| --- | ---: | --- |
| **E9S1** | **−400…−800** | 36 vs 4; biggest walk + wrong buffer |
| **E13S9** | **−250…−500** | 26 vs 8; real split |
| **E12S3** | **~0** | already `[0]`-near (14 vs 16). Dies on far ctrl (`_late-rooms.md`), not this. |
| other 4 far-first | **−200…−400** | mid splits |
| 10 already-near / tie | **~0** | |

**0** on spawn→RCL2 / time-to-550 (`RCL2_ORDER` still ext then one
box; builder finishes 5×3k first). Mean pulled by E9S1 / E13S9 /
E11S6. Do not average E12S3 into the win.

After this, leftover at RCL3 is the **far** seat. That is more reason
to hold it off the 135k (`_next-boxes.md` #2) — later, not this race.

---

## Exact patch (fenced, not applied)

Real site is `PlanV2.plannedTilesFor`. Race rooms never call it until
adopt. `BasePlan` / `construction` is the live path and has **no**
`plan.t.container` / `si`. The analog below is only a seat list +
sort; under cycle-10 KEEP it still sites **zero** source boxes at
RCL2.

Do not apply either half. Do not `push-race`.

### 1. `src/utils/PlanV2.ts` — the actual SURFACE #6

Do **not** reorder `staged.order` for all RCLs (migrate
`FREE_REPLACE`; returned array stays plan-index order). Only the RCL2
take-1 membership changes. Set stays `1 ⊂ early ⊂ all`.

Exclude the controller bin: last-of-early (emit order). If `room` is
in hand, prefer “adjacent to a live source.”

```ts
// in containerStageOrder, after building `order` / `early` — do not
// mutate `order`. Add a helper used only by plannedTilesFor:

function firstSourceSeat(plan: PackedPlan, staged: { order: number[]; early: number }, room?: Room): number {
  const planned = plan.t[STRUCTURE_CONTAINER] || [];
  const earlyIdx = staged.order.slice(0, staged.early);
  let seats = earlyIdx;
  if (room) {
    const sources = room.find(FIND_SOURCES);
    const hit = earlyIdx.filter((i) => {
      const p = unpack(planned[i]);
      return sources.some((s) => Math.abs(s.pos.x - p.x) <= 1 && Math.abs(s.pos.y - p.y) <= 1);
    });
    if (hit.length) seats = hit;
  } else if (earlyIdx.length > 1) {
    // emit order: sources… then controller bin. Do not min-cheb the bin
    // (E9S1 depot si-cheb 2 < near source 4).
    seats = earlyIdx.slice(0, earlyIdx.length - 1);
  }
  const originPacked =
    plan.si !== undefined
      ? plan.si
      : plan.t.storage && plan.t.storage.length
        ? plan.t.storage[0]
        : planned[seats[0]];
  const o = unpack(originPacked);
  let best = seats[0];
  let bestD = Infinity;
  for (const i of seats) {
    const p = unpack(planned[i]);
    const d = Math.max(Math.abs(p.x - o.x), Math.abs(p.y - o.y));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
```

```diff
--- a/src/utils/PlanV2.ts
+++ b/src/utils/PlanV2.ts
@@ plannedTilesFor, container branch
-  // RCL2: first source container only (plan-order prefix of the early set).
-  // Second source + controller stay on the same order at RCL3; mineral at RCL6.
-  // Nested prefixes: 1 ⊂ early ⊂ all. Never reorder — migrate is FREE_REPLACE.
-  const beforeExtractor = lvl < 3 ? Math.min(1, staged.early) : staged.early;
-  const take = Math.min(cap, lvl >= EXTRACTOR_RCL ? staged.order.length : beforeExtractor);
-  if (take >= planned.length) return planned;
-  if (take <= 0) return [];
-  const keep: { [i: number]: boolean } = {};
-  for (let i = 0; i < take; i++) keep[staged.order[i]] = true;
+  // RCL2: one source seat — min chebyshev to si among early SOURCE seats,
+  // not container[0] object order. Both source seats + depot stay in
+  // `early` at RCL3. Mineral last. Nested prefixes: 1 ⊂ early ⊂ all.
+  // Membership only; returned array stays plan-index order (FREE_REPLACE).
+  const beforeExtractor = lvl < 3 ? Math.min(1, staged.early) : staged.early;
+  const take = Math.min(cap, lvl >= EXTRACTOR_RCL ? staged.order.length : beforeExtractor);
+  if (take >= planned.length) return planned;
+  if (take <= 0) return [];
+  const keep: { [i: number]: boolean } = {};
+  if (lvl < 3 && staged.early > 0) {
+    keep[firstSourceSeat(plan, staged, room)] = true;
+  } else {
+    for (let i = 0; i < take; i++) keep[staged.order[i]] = true;
+  }
   const out: number[] = [];
   for (let i = 0; i < planned.length; i++) if (keep[i]) out.push(planned[i]);
   return out;
```

`conductorsForRcl` calls `plannedTilesFor(plan, type, lvl)` **without**
`room` — the emit-order fallback (drop last-of-early) must stay
correct so the RCL2 road audit uses the same tile the room will site.

`RCL2_ORDER` (ext then that one box) is unchanged.

### 2. `src/utils/BasePlan.ts` + `rooms.construction.ts` — live-path analog

`computeBasePlan` today:

```
structures[STRUCTURE_CONTAINER] = [{ x: hub.x, y: hub.y }];
```

Hub only. `placeFromBasePlan` then sites every slot up to
`CONTROLLER_STRUCTURES.container` (5 at RCL2). Source seats live in
`construction()` via `FIND_SOURCES` object order, gated `level >= 3`
(cycle-10).

Adding source seats to `basePlan.structures.container` **without** a
prefix undoes cycle-10 (both sources dump during slam). Prefix:

| RCL | slots | note |
| --- | --- | --- |
| 2 | `[hub]` | cycle-10 KEEP. Hub stays. **No RCL2 source box.** |
| 3–5 | `[hub, near, far]` | both source seats. Depot still `siteLegacyControllerDepot`. |
| 4+ | containers skipped | storage replaces hub |

That analog does **not** implement SURFACE #6. It only sorts the RCL3
leftover. Builder leftover-container pick is `progressTotal` (all
5000) then FIND order — weak.

To actually put a source box at RCL2 on this path: take `[hub, near]`
at 2. That is **reopen-c10 + nearest**, a different knob, and it lost
RCL4 ~1k. Do not ship it as this A/B.

Fenced analog (still not applied):

```diff
--- a/src/utils/BasePlan.ts  computeBasePlan, after hub container
@@
   structures[STRUCTURE_CONTAINER] = [{ x: hub.x, y: hub.y }];
+  // Source seats after hub, nearest-to-hub first. Not sited at RCL2
+  // (placeFromBasePlan prefix). Both go down at RCL3.
+  const sourceSeats: BasePlanPos[] = [];
+  for (const s of sources) {
+    let best: BasePlanPos | null = null;
+    let bestD = Infinity;
+    for (let dx = -1; dx <= 1; dx++) {
+      for (let dy = -1; dy <= 1; dy++) {
+        if (!dx && !dy) continue;
+        const x = s.pos.x + dx;
+        const y = s.pos.y + dy;
+        if (!isBuildable(room.name, x, y)) continue;
+        const key = `${x},${y}`;
+        if (blocked.has(key)) continue;
+        const d = chebyshev(hub, { x, y });
+        if (d < bestD) {
+          bestD = d;
+          best = { x, y };
+        }
+      }
+    }
+    if (best) {
+      sourceSeats.push(best);
+      blocked.add(`${best.x},${best.y}`);
+    }
+  }
+  sourceSeats.sort((a, b) => chebyshev(hub, a) - chebyshev(hub, b));
+  for (const p of sourceSeats) structures[STRUCTURE_CONTAINER].push(p);
```

```diff
--- a/src/utils/BasePlan.ts  placeFromBasePlan, container branch
@@ after maxAllowed / before walking slots
+    if (st === STRUCTURE_CONTAINER) {
+      // [0] hub. Rest = source seats, already nearest-first.
+      // RCL2: hub only (cycle-10). RCL3: hub + both sources.
+      const srcN = Math.max(0, slots.length - 1);
+      const takeSrc = rcl < 3 ? 0 : srcN;
+      slots = [slots[0]].concat(slots.slice(1, 1 + takeSrc));
+    }
```

```diff
--- a/src/Rooms/rooms.construction.ts  source box block ~1422
@@ if(storage) { sources = FIND_SOURCES }
+  // Nearest source first (chebyshev to hub / storage). Still gated
+  // level >= 3. Does not site a source at RCL2.
+  const origin = storage.pos;
+  sources = sources.slice().sort((a, b) => {
+    const da = Math.max(Math.abs(a.pos.x - origin.x), Math.abs(a.pos.y - origin.y));
+    const db = Math.max(Math.abs(b.pos.x - origin.x), Math.abs(b.pos.y - origin.y));
+    return da - db;
+  });
   // existing container1 = sources[0], container2 = sources[1]
   // existing `level >= 3 && level < 6` gates stay
```

`siteLegacyControllerDepot` stays RCL3-only. Do not lower the
`level >= 3` source-site gates in the same race.

---

## Whether this knob is dead until adopt

**Yes.** SURFACE #6 is `plannedTilesFor` take-1 among `plan.t.container`
early source seats vs `plan.si`. That function runs only inside
`placeFromPlanV2`. Race rooms are `planPackMiss`. The BasePlan analog
cannot see `si` and, with cycle-10 KEEP, sites no RCL2 source box.

Adopt the 16 (`_next-adopt-plans.md`) on **candidate** segments 80–86
only, `autoExpand = false`, no stale `planV2` / `rclTimes.8`. Fail the
run if any candidate room is still `planPackMiss` after 200t. Then
this patch is a one-knob A/B.

Never `--user pacifist-race`. Never write control segments.

---

## Not these

| | |
|---|---|
| Two source boxes at RCL2 | not this. Prefix of **one**. |
| Hold 2nd source off the 135k | `_next-boxes.md` #2. Cycle-11 SEND BACK. After this. |
| Depot tile / 4W find | not an A/B. All 16 already ≤4, not source-adj. |
| Reopen cycle-10 (slam-5 then one box) | different knob; lost RCL4. |
| Leftover-5 / 6W / no-RCL3-roads | KEEP. Stay. |
| `plan.mjs` / hub rewrite | never. |
