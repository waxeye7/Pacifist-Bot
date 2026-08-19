# Cycle 0 — RCL1–4 construction audit

Read-only. No code changed. Docker off. Campaign clock: spawn placement → RCL4.

**Live path:** if `room.memory.planV2` exists, `construction()` returns after `placeFromPlanV2` only — legacy stamps never run.

```633:636:src/Rooms/rooms.construction.ts
    if (room.memory.planV2) {
        placeFromPlanV2(room);
        return;
    }
```

New claims get a pack via `runPackAdoption` / AutoExpand (`src/Managers/AutoExpand.ts:229-263`, `:326+`). Missing pack → legacy `placeFromBasePlan` + checkerboard. Speedrun rooms with a shipped plan are **v2**.

Cadence: v2 re-sites every 15 ticks (`src/Rooms/rooms.ts:339-340`). Full `construction()` every 100 ticks at RCL<4, 1000 at RCL≥4 (`:353-360`).

---

## 1. What gets placed, in what order

Caps from `CONTROLLER_STRUCTURES`. Extra gates: `typeAllowedAtRcl` (`src/utils/PlanV2.ts:398-407`).

Type priority (`PLACE_ORDER` / `RCL2_ORDER`):

```852:896:src/utils/PlanV2.ts
const PLACE_ORDER = [
  "spawn", "storage", "tower", "container", "extension",
  "terminal", "link", "rampart", "road", "lab", "nuker", "extractor", "observer",
];
// RCL2 only: extension spliced ahead of container
```

Within a type, **array order is build order**. Extensions are sorted nearest-sitter walk (shallow +3) in the planner (`tools/plan-suite/v2/layer-ext.mjs:2147-2188`). First 5 = closest-to-sitter, deep preferred.

**Builder** (`src/Roles/builder.ts` `findLocked`) is a *different* order: spawnless-spawn → link/storage (RCL2 also any site at `spawn.y-2`) → **all extensions** → **all containers** → closest leftover (tower, roads, ramparts).

| RCL | Sited (v2, after spawn standing) | Built first (builder) |
| --- | --- | --- |
| **1** | Spawn only. `spawnFirstLockdown` strips every other site (`PlanV2.ts:123-138`, `:1547`, `:1634`). Caps: no ext/container/tower/road. | Spawn. `buildcontainer.ts:90-97` same rule. |
| **2** | 5 extensions, then 3 containers (src, src, ctrl). Mineral container deferred to RCL6 (`PlanV2.ts:624-654`, `:715-753`). No roads (`:399`). No hub container. | Extensions, then containers. RCL2 special: tile `spawn.x, spawn.y-2` outranks extensions (`builder.ts:37-39`) — leftover of the legacy hub seat; usually a no-op on v2. |
| **3** | Tower (1) → leftover containers → 5 more ext (cap 10) → **arterial roads** (`roadsForRcl`, median ~44 / max ~87; eco + tower spurs + faces for ext[0..9] + RCL2 containers + hub chains). Ramparts gated RCL4. | Extensions → containers → **closest** of tower+roads. Tower is sited first, finished last among eco. |
| **4** | Storage (1) → tower (still 1) → containers (still 3) → 10 more ext (cap 20) → **shell ramparts** (ahead of remaining roads; personal covers wait for the structure they cover, `:1605-1673`) → rest of the road array. | Storage (prio) → extensions → containers → closest (ramparts/roads). |

**Legacy (no `planV2`)** — young rooms (`rcl < 4 \|\| !storage`) call `placeFromBasePlan(room, 8)` (`rooms.construction.ts:658-668`). Order: storage, **hub container on storage tile**, extension (ring from hub), tower, extra spawn (RCL7), rampart (RCL4), roads (RCL3, arterials first, shell roads stripped until RCL4) — `BasePlan.ts:454-556`. Then the same function *keeps going*: spawn-adjacent hub container (`rooms.construction.ts:1033-1074`), source+controller containers once `findStorage` returns that hub (`:1101-1266`), checkerboard extensions around spawn/storage (`:1368-1383`), RCL3 towers at range-7 of storage (`:1521-1597`). Dual owners by design; `basePlanRoadsActive` stops the second road network (`:648-668`, `:1275`).

---

## 2. Roads before they pay?

**Yes at RCL3, after the 10th extension is sited.**

- No roads at RCL1–2 (`PlanV2.ts:399`, `BasePlan.ts:485`). RCL2 containers walk bare ground — comment admits this (`PlanV2.ts:493-495`).
- RCL3 arterial set is **not** “hauler walks this tick”. It includes tower spurs, a D4 face per first 10 extensions, and hub→container chains (`PlanV2.ts:483-490`). Median **44 tiles × 300 = 13.2k**, max **87 × 300 = 26.1k**, burned while the controller still wants **135k**.
- Once ext/container/tower *caps* are full, `PLACE_ORDER` spends the entire 4-site budget on roads. Builder then `findClosestByRange`s those roads (`builder.ts:73-79`) — not the tower if an ext/container site still exists, but the tower is only one tile and roads are many.
- Campaign guardrail “tower up by RCL3” is **siting**, not finishing. Builder will pave nearby roads before walking to a far tower.

Payback that *is* real: hub↔source and hub↔controller lines. Everything else at RCL3 is decoration relative to the 135k climb.

Legacy young rooms: `placeFromBasePlan` owns roads from RCL3; shell/exit/far sites are swept (`rooms.construction.ts:676-699`). Still arterials + hub ring, not “wait until 10 ext + tower exist”.

Remote roads: RCL≥3 + remotes, global ceiling 70 (`rooms.construction.ts:2309`, `:2367-2383`). Guardrail says remotes are not a crutch — they can still steal the global site cap from the commune.

---

## 3. MAX_SITES / builder count vs remaining sites

| | v2 | legacy young |
| --- | --- | --- |
| Site budget | `MAX_SITES = 4` (`PlanV2.ts:29`, `:1578`) | `placeFromBasePlan(room, 8)` + hard stop at 10 open (`BasePlan.ts:454-460`) |
| Recycle | every 15 ticks | every 100 ticks (RCL<4) |

Wanted builders (`src/Rooms/rooms.spawning.ts`):

| RCL | amount | body | gate |
| --- | --- | --- | --- |
| 1 | **6** (`:756-759`) | `[W,C,C,C,M]` 300 | `sites && carriers > 1 && EnergyMinersInRoom > 1` (`:1251`) |
| 2 | **4** (`:781-784`) | `getBody([W,C,C,C,M])` | same (`:1281`) |
| 3 | **6** (`:807-810`) | same | same (`:1311`) |
| 4 | **3** (`:844-847`) | same | `sites && (minersInRoom > 0 \|\| bankCanBuild) && (!realStorage \|\| bank > 15k)` (`:1373`) |

Mismatch:

- **4 sites, 4–6 builders** at RCL2–3. Extra builders are spawn-tax on the upgrade sink.
- **1-source rooms cannot spawn RCL1–3 builders at all** (`EnergyMinersInRoom > 1` is impossible). RCL6+ comment already calls this a typo (`rooms.spawning.ts:3307-3311`); the RCL1–3 rungs still have it. RCL4 uses `> 0`.
- Also needs **`carriers > 1`** before the first builder — first 5 extensions wait on two carriers.
- RCL2: 5 extensions, 4 slots → fifth waits one recycle (15t v2 / 100t legacy).
- RCL3: after 10 ext + tower + 3 containers, remaining work is **dozens of roads** with 6 builders. That is the opposite of “builders vs remaining *useful* sites”.
- `queueBuilder` (thin-bank / rampart-only, `:3332`) is RCL6+ only. RCL1–4 do not scale roster to leftover energy work.

`buildcontainer` is the colony escort (≤1–2 from the mother room, `:2584-2602`), not the commune builder count.

---

## 4. First container: when and where

**v2 (live planned rooms)**

- **When:** RCL2, *after* the 5 extensions are sited (`RCL2_ORDER`, `PlanV2.ts:869-896`). First pass sites 4 ext; next recycle sites 5th ext + 3 containers.
- **Where:** plan order `[source, source, controller]`. **Not** spawn, **not** hub. Mineral seat last, only from RCL6 (`containerStageOrder`, `:715-737`).
- **Built when:** after every open extension site is gone (`builder.ts:53-70`).

**Legacy**

- **When:** RCL2–3, *before* extensions in `placeFromBasePlan` (`BasePlan.ts:464-481`).
- **Where:** **hub = future storage tile** (`BasePlan.ts:206-207`). Plus a second “hub” at `spawn.y-2` (then cardinal fallbacks) if nothing is within range 4 of spawn (`rooms.construction.ts:1021-1074`).
- Once that hub exists, `findStorage` returns it (`roomFunctions.ts:139-168`) and the legacy block sites **source containers + a controller-path container** (`rooms.construction.ts:1103-1145`, `:1260-1266`) even at RCL2.

---

## 5. v2 plan or legacy order?

**Adopted rooms: v2 only.** Short-circuit above.

**Not adopted:** legacy `BasePlan` + leftover stamps (checkerboard ext, spawn.y-2 hub, pathfinder source containers, range-7 towers). `runPackAdoption` tries to close this every 25 ticks; a room with no pack entry stays legacy forever (`AutoExpand.ts:256-260`).

Builder/spawning are **shared** and still encode legacy assumptions (`spawn.y-2` lock, `findStorage` = hub container, RCL1–3 builder gates).

---

## 6. Ranked 3 — construction-order fixes for RCL4 time

Do not implement here. No planner-board moves (campaign guardrail). Bot-side only.

### 1. Cap RCL3 roads to source+controller arterials

**Why:** 13–26k energy + many builder-trips during the 135k RCL3→4 climb. Extension-face roads and tower spurs do not pay before storage. Builder closest-site then *commits* to that pavement.

**Where:** `src/utils/PlanV2.ts:513-522` (`roadsForRcl`) — at `lvl === 3` keep only tiles on hub→sources / hub→controller (reuse `plan.t.container` early set + spawn/storage as goals; do not restage the planner). Optionally `src/Roles/builder.ts:73-79` so leftover sites prefer tower over road.

**Risk:** medium. Far sources stay unpaved one RCL (fatigue). `auditRoadPrefix` (`PlanV2.ts:581`) may log orphans if the subset is disconnected — seed from sitter and only warn. Do **not** touch `push-plan.mjs` this cycle.

### 2. RCL1–3 builder gate + roster = sites, not 4–6

**Why:** 1-source rooms build **zero** structures until RCL4 (`EnergyMinersInRoom > 1`). Two-source rooms still wait on `carriers > 1`. Then they overspawn 6×300 bodies onto 4 sites and steal spawn from upgraders (the actual RCL4 clock).

**Where:** `src/Rooms/rooms.spawning.ts:1251`, `:1281`, `:1311` (gates); amounts `:756`, `:781`, `:807`. Match RCL4’s `miners > 0`. Want `min(amount, sites.length)` or 1–2 at RCL2, 1–2 at RCL3 until non-road sites remain, then 1 for leftover roads.

**Risk:** low. One-source rooms start building (intended). Smaller roster is more upgrade energy. Watch a 2-source swamp room so 2 builders can still finish 5×3000 + 3×5000 before RCL3.

### 3. First container = nearest source; controller container at RCL3

**Why:** Three 5k containers at RCL2, walked 10–27 tiles on dirt, after (or interleaved with) the 5 extensions that actually raise spawn capacity. Controller container does not pay until upgraders exist in volume; roads do not exist until RCL3. One adjacent source container is the drop-mine unlock.

**Where:** `src/utils/PlanV2.ts:739-753` (`plannedTilesFor` container prefix) — RCL2 take 1 (nearest source, plan index 0); RCL3 take 3. Monotonic: RCL2 ⊂ RCL3. Builder already prefers ext then container (`builder.ts:53-70`). Raise `MAX_SITES` to **5 at RCL2 only** (`PlanV2.ts:29`, `:1578`) so all 5 ext site in one pass.

**Risk:** low–medium. Second source overflows until RCL3 (dropped energy / extra carrier). `containerStageOrder` comments (`:664-693`) — **must stay a prefix**, never a per-level reshuffle, or migrate will tear the RCL2 container down. Do not defer the controller seat past RCL3.

---

## Out of scope this cycle (not ranked)

- Tower *siting* first at RCL3 is correct for the safety guardrail; do not delay the site, only stop paving before it finishes (fix 1).
- RCL4 shell-before-remaining-roads is a defence win, not an RCL4-time win (clock stops at RCL4).
- Spawn-first lockdown is already correct.
- `buildcontainer` opportunistic upgrade at RCL1 is already gated off while the spawn site exists (`buildcontainer.ts:119-140`).
