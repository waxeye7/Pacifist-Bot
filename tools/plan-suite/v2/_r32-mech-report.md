# Round 32 mechanical review

Artifact `tools/plan-suite/out-v2/plans-hub.json` md5 `8e5d6725885bd3f3731379bedf408326` (27,780,512 bytes) — **matches expected**. HEAD `425acbd` (r29p10). Rooms dump `tools/plan-suite/v2/_r28-mech/rooms.json` (172/172, 0 missing). Node `v22.13.0` (`fnm` install on PATH). Probes in `tools/plan-suite/v2/_r32-mech/`. No suite source committed. Artifact not written. **No board moved.** No `boards` field. Physicals still 10,320 / 14,100 / 8,208.

`checkRoom` baseline (rooms dump, fleet-median noise stripped): **pass 172/172 · fail 0 · declared 300**. Validate main: **`pass 172/172 · fail 0 · declared-shortfall 122`**.

A gate that agrees with itself is not a gate. r29p10 closed the *named* 98 suffix (`19,27` on `fullRun` only) and the leaky discarded cut (`20,9→19,9`). The kept prefix is still a D8-neighbor bag. `wanted` is still a count. The last discarded rung is still a free enclosure that walks its own lap. The presence class still flips.

---

## BLOCKING

None on the board. r28 mineral-why / swap-offer doors stay closed. 93 plant-back stays closed.

---

## MAJOR

### 1. Criticism 98 — named `19,27` on `fullRun` BITES; the kept prefix is still a neighbor bag. ESCAPE.

**Exploit.** E11S1 is a real shrink. After r29p10 the suffix is gone: `fullRun.reserved === lane.reserved` (6 tiles / 2 rounds), `shrunk.wanted=7`. The refused extra is a count.

| attack | result |
|---|---|
| append `"19,27"` to `fullRun.reserved` + last / new trailing round, prefix identity broken | **BITES** (`reserved` ≠ `lane.reserved`) |
| append `"99,99"` / `"1,1"` | **BITES** (not this room's walkable interior floor) |
| invent shrink on E11S3: extra `"1,1"` as a new trailing round, `ext=58` `shallow=2` `ran=true` | **BITES** |
| **r32 named residue:** append `"19,27"` to **both** reserved copies, stuff last `byRound`, `tiles=7`, `wanted≥8` | **ESCAPE** |
| identity-swap first reserved tile `18,27 → 19,27` on both copies | **ESCAPE** |
| two D8 neighbors on both copies | **ESCAPE** |
| `shrunk.wanted += 1` / `+= 9` / `:= tiles+1` | **ESCAPE** |
| dropped E12S5: D8 extra on `fullRun.reserved` only | **ESCAPE** |

7 real shrinks. 9 dropped. 156 plain. 163 rooms have `reserved === lane.reserved`; the 9 `reservedGtLane` are the drops (refused walk still published). A neighbor of the walk is unread once the two copies agree.

**Root cause.** A shrink is still a prefix identity plus a floor bind. r29p10 deleted the refused COORD list and left `wanted > tiles`. Tiles that *are* the kept prefix must exist, be unique, sit on this room's floor, and touch the reserved walk. They are not required to be the greedy's tiles. `"19,27"` next to `"18,27"` is still the smallest witness — you just have to write it twice.

**Board moved?** No.

### 2. Criticism 88 — leaky `20,9→19,9` BITES; same-lap sealing nudge ESCAPE.

**Exploit.** E11S2 rungs: `1.56/46/37 ×3`, then `2.5/50/42` (last, eco-capped). Shipped wall 46/37 = freeze. Last fat is complete, 42 tiles, has `20,9` and `29,33`.

| attack | result |
|---|---|
| last fat → shipped 37-tile cut, `mobility=1.56`, `ramparts:=37` | **BITES** (would-have-taken) |
| 8-tile box around the sitter, lap 0, keep `ramparts=50` | **BITES** (published cut 8 @ 0 vs shipped 37 @ 1.56) |
| **r29p10 named:** nudge `20,9 → 19,9`, `mobility=0`, sitter leaks | **BITES** (`leaks the sitter`) |
| **r32 named residue:** nudge `29,33 → 28,34`, still seals, lap stays **2.5**, 42 tiles | **ESCAPE** |

The seal test fires only when the exterior flood reaches the sitter. A 42-tile neighbor of the composed cut that still encloses and walks the claimed lap is free. Would-have-taken still skips anything longer than shipped.

**Root cause.** Discarded `cutTiles` are still a free list held to `enclosureMobility` of themselves, plus "does not leak the sitter", plus shorter-or-equal would-have-taken, plus "fatter + equals freeze". The composed enclosure is not on the board.

**Board moved?** No.

### 3. Remaining META_DARK `presence` still flips. 172/172 if `baseCut`+`shallowNow` are left alone.

**Exploit.** 76 presence names, 23 derived. Zeroed every remaining `klass:"presence"` numeric/bool/nonempty-array leaf across all 172 rooms. 44 kinds, 4,319 events. `checkRoom`: **fail 172/172**, every first fail is `baseCut := 0` (three rooms also `shallowNow` note-identity). Exclude those two leaves: **pass 172/172**.

Single-room flatten, flattering direction — **38 ESCAPE** on the first copy:

`baseOverGated`, `boundHeld`, `boundLap`, `corridorFallback`, `corridorPlaced`, `deepExhausted`, `deepReach`, `digRoads`, `floorGated`, `floorOver`, `floorOverGated`, `freeDin`, `freeLeft`, `haulCost`, `hubDistCap`, `inertPromoted`, `lapCeilingFloor`, `massAdds`, `maxDist`, `maxHubDist`, `minDmgArray`, `minDmgPicked`, `mineralContainer`, `parkCap`, `radii`, `rescuedLap`, `roadsEaten`, `servedFree`, `shallowCost`, `shallowRamparts`, `shallowRefused`, `stitchTiles`, `stitched`, `stubCap`, `stubExhausted`, `stubRoads`, `towerOnly`, `wasLap`

Nine more *looked* like BITES on one copy (`deepBudget`, `floorUngated`, `strandedFirst`, `unsealed`, `worstCase`, `worstCaseUngated` — lane-anchor twin; `faceAndSatHeld`, `priceProven`, `searchedSeats` — swap-offer basis). Zero every copy: first six **ESCAPE**. Zero the last three and regen the basis: **ESCAPE**. A gate that agrees with itself is not a gate.

Closed this artifact (re-probed, BITES): `nukerInWindow`, `center`, `mineralSeatNetTiles`, `coveredDetourDeclared`.

`baseCut` is still *classified* `presence` and is only bounded (`>= 1` + `priceyWall` sync). The klass lies.

**Root cause.** Criticism 141(c). They derived the four cheap walks r30/r31 named. The class is still the class.

**Board moved?** No.

---

## MEDIUM

### 4. Exact `baseCut` / `protectRadius` pick is unread.

`protectRadius := 0` **BITES** (not in `RADII_WIDE`). `10 → 12` (E11S2) inside the enum **ESCAPE**. `baseCut := 0` **BITES**. `baseCut ± 1` keeping `priceyWall` on the same side of `MAX_CUT=45` **ESCAPE** (E11S1 32; E11S7 50).

Sample: E7S7 `baseCut=31` / cut=32. E1S6 `baseCut=57` / cut=58. E4S3 `baseCut=51` = cut. The pick is not freeze and not the shipped cut.

### 5. 141(e) — `plan.seed` is bound to the film. `seedScore` is free.

`plan.seed` 172/172. Independent parse of every gallery page: **126 seed==hub**, **46 seed≠hub**, **0 caption mismatches**. Rewrite `plan.seed → 1,1` **BITES**. `seedScore := 0` / `+= 999` **ESCAPE**.

### 6. `cutPasses.rampartsDeleted` split is still a log.

Naive swap of the two prune markers' `rampartsDeleted` **BITES** (last-prune `ramparts-before` identity). Last-prune `ramparts += 8` **BITES**. `sealCritical += 1` **BITES**. No room in this fleet has both prune markers deleting (`twoPruneDel=0`). E11S6 is `1 / 0`.

**r32 named:** E11S6 swap `1 ↔ 0`, set last-prune `ramparts = shipped + new deleted` (41+1=42). Sum still equals `inertPruned.size`. **ESCAPE**.

`+1 / −1` on that pair **BITES** (last prune goes to −1). The door is the swap that stays non-negative, not every split.

---

## MINOR / LOW

### 7. MINOR — 134(a) is still a fleet property, not a theorem.

Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**, 0 core-seal fails, 29 rooms differ from the shipped cut, 34 add + 46 remove, 27 adopt / 29 drift. Same census as r29–r31.

### 8. LOW — 134(d) is still a contract, not a derivation.

Independent road+rampart walk: **274 = 231 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified**. Agreement with a restated order.

---

## Attacked and held (r31 closures + r29p10 named, re-probed)

| attack | result |
|---|---|
| 93 plant `recovers`/`recoversDeep` back onto taken `fixedHolders` + note twin | **BITES** |
| 98 extra reserved `"99,99"` / `"1,1"` | **BITES** |
| 98 invent-shrink-fake-round on a plain 60/0 | **BITES** |
| 98 extra reserved `"19,27"` on `fullRun` only (last round or new trailing) | **BITES** |
| 88 last-fat shipped-cut + `ramparts:=cutlen` | **BITES** |
| 88 8-tile box keep-ramparts | **BITES** |
| 88 leaky `20,9 → 19,9` (sitter out) | **BITES** |
| `nukerInWindow` flip / `nukeWindow.center → 1,1` | **BITES** |
| `mineralSeatNetTiles` cleared | **BITES** |
| `coveredDetourDeclared` zeroed | **BITES** |
| `protectRadius := 0` / `baseCut := 0` | **BITES** |
| `plan.seed` rewritten | **BITES** |
| cutPasses naive swap / last-prune `ramparts += 8` / `sealCritical += 1` | **BITES** |
| `mineralOffNetworkWhy` append | **BITES** |

---

## Sample

`h(room) = fmix32(fnv1a32("round32-mech|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|---|---|---|
| 1 | **E7S7** | 8,419,049 |
| 2 | **E5S1** | 47,658,330 |
| 3 | **E1S6** | 49,002,069 |
| 4 | **E4S3** | 88,709,654 |
| 5 | **E19S2** | 89,730,025 |

Also: **E11S1 E11S2 E11S3 E11S7 E2S7**.

Own D8 exterior flood over shipped ramparts and over the cut, depth from that flood, mineral seat = container cheb≤1 of the mineral. `checkRoom` 0 fails on all ten.

| room | ext/road/ramp/cut/frz | lap | mineral | notes |
|---|---|---|---|---|
| E7S7 | 60/72/33/32/32 | **3** | 24,21 off | **dropped** (lane 0 / fullRun 21), `baseCut=31≠32` |
| E5S1 | 60/85/52/41/41 | 0 | 29,30 off | `protectRadius=8`, seed=hub |
| E1S6 | 60/91/61/58/58 | **4** | 37,8 off | **98 residue**, real shrink 21→ wanted 39, pricey 57 |
| E4S3 | 60/104/61/51/51 | 0 | 43,46 off | pricey 51, seed `24,25` ≠ hub `27,26` |
| E19S2 | 60/72/39/32/32 | **1.5** | 5,27 off | **taken** (5 holders), seed=hub |
| E11S1 | 60/101/43/32/32 | 0 | 24,8 off | **98 residue**, shrink 6 / wanted 7, seed `25,39` ≠ hub `24,41` |
| E11S2 | 60/101/46/37/37 | **1.5** | 14,30 **on** | **88 residue**, shrink 20 / wanted 21, last fat 2.5/50/42 |
| E11S3 | 60/80/37/32/32 | 0 | 12,37 off | plain `fullRun.ran=false` |
| E11S7 | 60/69/53/50/50 | **8.67** | 8,42 off | taken, 0 fixedHolders, pricey 50 |
| E2S7 | 60/72/21/18/18 | 0 | 32,3 off | golden, small shell |

**No sampled room leaks the sitter or any core structure through the shipped ramparts or the freeze.** 0 shallow-bare, 0 D4-blind extensions, 60/60. Film seed coords exist as `plan.seed` and match the page 172/172.

Nothing in the sample looks accidental. The expensive rooms say so (E7S7 lap 3 + drop, E1S6 lap 4 + shrink, E11S2 lap 1.5, E11S7 lap 8.67 + take, E19S2 taken).

---

## Clean re-derivations (terrain + shipped structure lists)

From `_r32-mech/rederive.mjs` (does not import `validate.mjs`):

| quantity | derived |
|---|---|
| rooms | 172, 0 missing terrain |
| extensions | **10,320** (60/60 × 172), 0 short |
| roads | **14,100** (median 81, min 53, max 124) |
| ramparts | **8,208** |
| containers / links / towers / labs / spawns | 688 / 688 / 1,032 / 1,720 / 516 |
| storage / terminal / nuker / observer / extractor | 172 / 172 / 172 / 172 / 172 |
| factory / powerSpawn | **0 / 0** |
| declarations / notes / noteRecords | 300 / 236 / 236 |
| road+rampart | **274 = 231 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified**, 153 rooms, median 2, max 5 |
| `roadKind` | 491 = 370 spur + 82 swampPave + 21 reflow + 11 alongCutMoved + 4 stitch + 3 conductBridge |
| tower clump (cheb≤2 of sitter) | `{0:12, 1:14, 2:53, 3:60, 4:30, 5:3}` |
| leaks / bare extractor-outside / shallow eco without rampart / ext without D4 road / stack / on-object / border | **0 / 0 / 0 / 0 / 0 / 0 / 0** |
| `cutAtFreeze` | 7,246 tiles, **0 loose**, 0 seal-fail, 29 rooms ≠ shipped cut, 34 add + 46 remove, 27 adopt / 29 drift |
| `mineralOffNetworkWhy` vs official census | **172/172 exact** |
| `fullRun` | 172 rooms ship it · 17 `ran` · 7 shrunk · 9 dropped · **156 plain** · 172 `reserved` / `byRound` / `lane.reserved` · 163 `reserved===lane` · 9 `reserved>lane` (the drops) |
| ladders | 57, all 57 have `cutTiles` (54 with `shellEscalation`, 3 recovery-only) |
| taken rooms | 12 (E11S7 E15S6 E18S3 E19S2 E2S1 E4S6 E5S5 E7S2 E7S5 E8S2 E9S1 E9S9) |
| `checkRoom` baseline | **pass 172/172 · fail 0 · declared 300**, every physical total 0 |
| film seed ≠ hub | **46** (same 46); `plan.seed` 172/172; caption 0 mismatches |

Artifact md5: `8e5d6725885bd3f3731379bedf408326`.

---

## What a closer has to do

1. **98.** `fullRun.reserved` / `lane.reserved` are the greedy's tiles (or a hash of the composed cap-10 board). "On this room's floor, unique, and D8 of the walk" is how 7 shrink rooms invent extra reserved. Writing `"19,27"` on **both** copies is the smallest witness. `wanted` is a hash of that board, or it is not a column.
2. **88.** Bind discarded `cutTiles` to the composed enclosure, or stop publishing them. Weigh the last rung against *this* list, not "shorter-or-prettier than shipped". A last discarded 42-tile list that still seals at lap 2.5 is the door — the leak test only catches the ones that don't enclose.
3. Remaining META_DARK presence: derive the cheap flattering ones (`corridorPlaced`, `stubRoads`, `towerOnly`, `stitched`, hub-kit bookkeeping that is a walk) or stop shipping them as evidence. Reclassify `baseCut` — the klass still says `presence`. Twin-identity is not a derivation.
4. Exact `baseCut`/`protectRadius` or stop publishing them. Enum + `>= 1` is not a pick.
5. **141(e).** `seedScore` is unread. The tile is on the artifact; the score is not.
6. `cutPasses.rampartsDeleted` is the per-pass deleted set, or it is not a column. Last-prune `ramparts = shipped + deleted` is an identity over a free split.

Findings 1–3 are the round. r29p10 closed the *named* suffix and the leaky discarded cut. The prefix is still a neighbor list. The last discarded rung is still a free enclosure that seals. A closer who only adds another identity over producer leaves will ship this review again.

---

## Residue for the next implementer

Concrete mutations that still escape on this artifact:

1. **98 D8-neighbor extra, both copies.** E11S1: `fullRun.reserved.push("19,27")`; same onto `lane.reserved`; stuff last `byRound`; `tiles = reserved.length`; `wanted = tiles+1`; copy the twin. `checkRoom` passes. Identity-swap `18,27 → 19,27` on both copies also passes. Dropped E12S5: extra D8 neighbor on `fullRun.reserved` only also passes.
2. **98 wanted-count.** E11S1: `shrunk.wanted += 1` (or `+= 9`, or `:= tiles+1`). The refused extra is a free integer.
3. **88 last fat rung, same-lap sealing nudge.** E11S2 needDeep+85: replace `29,33 → 28,34`, set `mobility` to `enclosureMobility` of the new 42-tile list (this probe: **2.5**), keep `ramparts=50`. Last rung still seals. Would-have-taken only judges `cuts.length ≤ shipped`.
4. **Presence.** Zero `corridorPlaced` / `stubRoads` / `towerOnly` / `stitched` / `boundHeld` / `digRoads` / `roadsEaten` on a single room. Fleet-wide zero of the class minus `baseCut`+`shallowNow` is silent. Lane-anchor / swap-offer "BITES" die if you zero both copies (and regen the basis).
5. **`seedScore := 0`** (or `+= 999`) on E11S1.
6. **`protectRadius` 10→12** (or any other `RADII_WIDE` swap). **`baseCut ± 1`** staying on the same side of 45.
7. **cutPasses split.** E11S6: swap the two prune `rampartsDeleted` (`1 ↔ 0`), set last-prune `ramparts = shipped + new deleted`.

---

## Could this be a clean round?

**No.** Named 98 `19,27` on one copy / 88 leaky cut / named 98 COORD bag / 88 shipped-cut / 88 8-tile box / 93 plant-back / four cheap presence walks closed. The kept prefix is a D8-neighbor bag. `wanted` is a count. The last discarded rung is a free sealing enclosure. The presence class still flips. `clean_rounds` is 0. The bar is 2 consecutive all-clean. Boards did not move.
