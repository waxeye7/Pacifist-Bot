# Round 31 mechanical review

Artifact `tools/plan-suite/out-v2/plans-hub.json` md5 `86d38bdd2b2aef39a79cb8aa134f9b06` (27,786,180 bytes) — **matches expected**. Rooms dump `tools/plan-suite/v2/_r28-mech/rooms.json` (172/172, 0 missing). Node `v22.13.0` (`fnm` install on PATH). Probes in `tools/plan-suite/v2/_r31-mech/`. No suite source committed. Artifact not written. **No board moved.** No `boards` field. Physicals still 10,320 / 14,100 / 8,208.

`checkRoom` baseline (rooms dump, fleet-median noise stripped): **pass 172/172 · fail 0 · declared 300**. Validate main: **`pass 172/172 · fail 0 · declared-shortfall 122`**.

A gate that agrees with itself is not a gate. r30's named COORD-bag / last-fat shipped-cut / 8-tile box / 93 plant-back / cheap presence (`nukerInWindow`, `center`, `mineralSeatNetTiles`, `coveredDetourDeclared`) **BITES**. The reserved suffix is still any D8 neighbor of the walk. The last discarded rung is still any COORD list that walks its own lap. The presence class still flips.

---

## BLOCKING

None on the board. r28 mineral-why / swap-offer doors stay closed. 93 plant-back stays closed.

---

## MAJOR

### 1. Criticism 98 — off-board / invent-shrink BITES; a real D8 neighbor of reserved ESCAPE.

**Exploit.** E11S1 is a real shrink: `fullRun.reserved` 7 tiles / 3 rounds (`[3,3,1]`), `shrunk.to=2`, `lane.reserved` 6. Prefix of `byRound[0..to)` is the shipped reservation.

| attack | result |
|---|---|
| append `"99,99"` / `"1,1"` to reserved + last round, `tiles`/`wanted` synced | **BITES** (not this room's walkable interior floor) |
| invent shrink on E11S3: extra `"1,1"` as a new trailing round, `ext=58` `shallow=2` `ran=true` | **BITES** (same floor bind) |
| **r31 named:** append `"19,27"` — D8 of reserved `"18,27"`, buildable, not an object tile — to reserved + last round; `tiles=8`; `wanted=8`; twin copied | **ESCAPE** |
| same extra as a new trailing round (`byRound` 4, prefix held) | **ESCAPE** |

156 plain rooms. 7 real shrinks. The floor bind is `buildable` + cheb≤2 (or walkable gap ≤5) of the reserved set or the cut. A neighbor of the walk is unread.

**Root cause.** A shrink is still a prefix test. Tiles after `to` must exist, be unique, sit on this room's floor, and touch the reserved walk. They are not required to be the greedy's tiles. r30 closed the COORD bag. The suffix is still a bag of neighbors.

**Board moved?** No.

### 2. Criticism 88 — shipped-cut / 8-tile box BITES; one-tile nudge of the last fat cut ESCAPE.

**Exploit.** E11S2 rungs: `1.56/46/37 ×3`, then `2.5/50/42` (last, eco-capped). Shipped wall 46/37 = freeze.

| attack | result |
|---|---|
| last fat → shipped 37-tile cut, `mobility=1.56`, `ramparts:=37` | **BITES** (cheaper-upkeep would-have-taken) |
| 8-tile box around the sitter, lap 0, keep `ramparts=50` | **BITES** (published cut 8 @ 0 vs shipped 37 @ 1.56) |
| **r31 named:** nudge last-fat tile `20,9 → 19,9`, `mobility = enclosureMobility` of the new 42-tile list (this probe: **lap 0**) | **ESCAPE** |

The would-have-taken rule on the published cut fires only when `cuts.length ≤ shippedCut.length`. A 42-tile last discarded enclosure is free as long as its lap agrees with itself — including one that walks lap 0 and would have beaten 1.56/46.

**Root cause.** Discarded `cutTiles` are still a free list held to `enclosureMobility` of themselves, plus a shorter-or-equal would-have-taken test, plus "fatter + equals freeze". The last rung of an eco-capped table is not weighed. The composed enclosure is not on the board.

**Board moved?** No.

### 3. Remaining META_DARK `presence` still flips. 172/172 if `baseCut`+`shallowNow` are left alone.

**Exploit.** 76 presence names, 23 derived. Zeroed every remaining `klass:"presence"` numeric/bool/nonempty-array leaf across all 172 rooms. 44 kinds, 4,319 events. `checkRoom`: **fail 172/172**, every first fail is `baseCut := 0` (three rooms also `shallowNow` note-identity). Exclude those two leaves: **pass 172/172**.

Single-room flatten, flattering direction — **38 ESCAPE** on the first copy:

`baseOverGated`, `boundHeld`, `boundLap`, `corridorFallback`, `corridorPlaced`, `deepExhausted`, `deepReach`, `digRoads`, `floorGated`, `floorOver`, `floorOverGated`, `freeDin`, `freeLeft`, `haulCost`, `hubDistCap`, `inertPromoted`, `lapCeilingFloor`, `massAdds`, `maxDist`, `maxHubDist`, `minDmgArray`, `minDmgPicked`, `mineralContainer`, `parkCap`, `radii`, `rescuedLap`, `roadsEaten`, `servedFree`, `shallowCost`, `shallowRamparts`, `shallowRefused`, `stitchTiles`, `stitched`, `stubCap`, `stubExhausted`, `stubRoads`, `towerOnly`, `wasLap`

Nine more *looked* like BITES on one copy (`deepBudget`, `floorUngated`, `strandedFirst`, `unsealed`, `worstCase`, `worstCaseUngated` — lane-anchor twin; `faceAndSatHeld`, `priceProven`, `searchedSeats` — swap-offer basis). Zero every copy: first six **ESCAPE**. Zero the last three and regen the basis: **ESCAPE**. A gate that agrees with itself is not a gate.

Closed this artifact (re-probed, BITES): `nukerInWindow`, `center`, `mineralSeatNetTiles`, `coveredDetourDeclared`.

`baseCut` is still *classified* `presence` and is only bounded (`>= 1` + `priceyWall` sync). The klass lies.

**Root cause.** Criticism 141(c). They derived the four cheap walks this review named. The class is still the class.

**Board moved?** No.

---

## MEDIUM

### 4. Exact `baseCut` / `protectRadius` pick is unread.

`protectRadius := 0` **BITES** (not in `RADII_WIDE`). `10 → 12` (E11S2) inside the enum **ESCAPE**. `baseCut := 0` **BITES**. `baseCut ± 1` keeping `priceyWall` on the same side of `MAX_CUT=45` **ESCAPE** (E11S1 32; E11S7 50).

Sample: E18S2 `baseCut=46` / cut=44. E11S4 `baseCut=37` / cut=38. E9S8 `baseCut=35` / freeze=37 / cut=35. The pick is not freeze and not the shipped cut.

### 5. 141(e) — `plan.seed` is bound to the film. `seedScore` is free.

`plan.seed` 172/172. Independent parse of every gallery page: **126 seed==hub**, **46 seed≠hub**, **0 caption mismatches**. Rewrite `plan.seed → 1,1` **BITES**. `seedScore := 0` / `+= 999` **ESCAPE**.

### 6. `cutPasses.rampartsDeleted` split is still a log.

Naive swap of the two prune markers' `rampartsDeleted` **BITES** (last-prune `ramparts-before` identity). Last-prune `ramparts += 8` **BITES**. `sealCritical += 1` **BITES**. No room in this fleet has both prune markers deleting (`twoPruneDel=0`).

**r31 named:** E11S6 swap `1 ↔ 0`, set last-prune `ramparts = shipped + new deleted` (41+1=42). Sum still equals `inertPruned.size`. **ESCAPE**.

---

## MINOR / LOW

### 7. MINOR — 134(a) is still a fleet property, not a theorem.

Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**, 0 core-seal fails, 29 rooms differ from the shipped cut, 34 add + 46 remove, 27 adopt / 29 drift. Same census as r29/r30.

### 8. LOW — 134(d) is still a contract, not a derivation.

Independent road+rampart walk: **274 = 231 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified**. Agreement with a restated order.

---

## Attacked and held (r30 closures, re-probed)

| attack | result |
|---|---|
| 93 plant `recovers`/`recoversDeep` back onto taken `fixedHolders` + note twin | **BITES** |
| 98 extra reserved `"99,99"` / `"1,1"` | **BITES** |
| 98 invent-shrink-fake-round on a plain 60/0 | **BITES** |
| 88 last-fat shipped-cut + `ramparts:=cutlen` | **BITES** |
| 88 8-tile box keep-ramparts | **BITES** |
| `nukerInWindow` flip / `nukeWindow.center → 1,1` | **BITES** |
| `mineralSeatNetTiles` cleared | **BITES** |
| `coveredDetourDeclared` zeroed | **BITES** |
| `protectRadius := 0` / `baseCut := 0` | **BITES** |
| `plan.seed` rewritten | **BITES** |
| cutPasses naive swap / last-prune `ramparts += 8` / `sealCritical += 1` | **BITES** |
| `mineralOffNetworkWhy` append | **BITES** |

---

## Sample

`h(room) = fmix32(fnv1a32("round31-mech|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|---|---|---|
| 1 | **E18S2** | 12,227,937 |
| 2 | **E13S5** | 83,513,035 |
| 3 | **E4S5** | 167,927,848 |
| 4 | **E11S4** | 190,408,773 |
| 5 | **E9S8** | 206,901,488 |

Also: **E11S1 E11S2 E11S3 E11S7 E2S7**.

Own D8 exterior flood over shipped ramparts and over the cut, depth from that flood, mineral seat = container cheb≤1 of the mineral. `checkRoom` 0 fails on all ten.

| room | ext/road/ramp/cut/frz | lap | mineral | notes |
|---|---|---|---|---|
| E18S2 | 60/65/47/44/44 | 0 | 24,46 off | pricey (`baseCut=46≠44`), seed `10,17` ≠ hub `11,17` |
| E13S5 | 60/83/22/21/21 | 0 | 29,7 off | `protectRadius=10`, seed=hub |
| E4S5 | 60/101/21/16/16 | 0 | 16,26 off | `protectRadius=11` |
| E11S4 | 60/87/43/38/38 | 0 | 45,32 off | `baseCut=37≠38` |
| E9S8 | 60/72/37/35/37 | 0 | 18,11 off | freeze≠cut (adopter), `protectRadius=9` |
| E11S1 | 60/101/43/32/32 | 0 | 24,8 off | **98 residue**, real shrink 7→6, seed `25,39` ≠ hub `24,41` |
| E11S2 | 60/101/46/37/37 | **1.5** | 14,30 **on** | **88 residue**, ladder 4 rungs, last fat 2.5/50/42 |
| E11S3 | 60/80/37/32/32 | 0 | 12,37 off | plain `fullRun.ran=false` |
| E11S7 | 60/69/53/50/50 | **8.67** | 8,42 off | taken, 0 fixedHolders, pricey 50 |
| E2S7 | 60/72/21/18/18 | 0 | 32,3 off | golden, small shell |

**No sampled room leaks the sitter or any core structure through the shipped ramparts or the freeze.** 0 shallow-bare, 0 D4-blind extensions, 60/60. Film seed coords exist as `plan.seed` and match the page 172/172.

Nothing in the sample looks accidental. The expensive rooms say so (E11S2 lap 1.5, E11S7 lap 8.67 + take, E18S2 a 46-tile pricey pick).

---

## Clean re-derivations (terrain + shipped structure lists)

From `_r31-mech/rederive.mjs` (does not import `validate.mjs`):

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
| `fullRun` | 172 rooms ship it · 17 `ran` · 7 shrunk · 9 dropped · **156 plain** · 172 `reserved` / `byRound` / `lane.reserved` |
| ladders | 57, all 57 have `cutTiles` (54 with `shellEscalation`, 3 recovery-only) |
| taken rooms | 12 (E11S7 E15S6 E18S3 E19S2 E2S1 E4S6 E5S5 E7S2 E7S5 E8S2 E9S1 E9S9) |
| `checkRoom` baseline | **pass 172/172 · fail 0 · declared 300**, every physical total 0 |
| film seed ≠ hub | **46** (same 46); `plan.seed` 172/172; caption 0 mismatches |

Artifact md5: `86d38bdd2b2aef39a79cb8aa134f9b06`.

---

## What a closer has to do

1. **98.** `fullRun.reserved` after `to` is the greedy's remaining tiles (or a hash of the composed cap-10 board). "On this room's floor and D8 of the walk" is how 7 shrink rooms invent extra reserved. `"19,27"` next to `"18,27"` is the smallest witness.
2. **88.** Bind discarded `cutTiles` to the composed enclosure, or stop publishing them. Weigh the last rung or do not print it. A last discarded 42-tile list that walks lap 0 is the door — the shorter-cut would-have-taken rule does not see it.
3. Remaining META_DARK presence: derive the cheap flattering ones (`corridorPlaced`, `stubRoads`, `towerOnly`, `stitched`, hub-kit bookkeeping that is a walk) or stop shipping them as evidence. Reclassify `baseCut` — the klass still says `presence`. Twin-identity is not a derivation.
4. Exact `baseCut`/`protectRadius` or stop publishing them. Enum + `>= 1` is not a pick.
5. **141(e).** `seedScore` is unread. The tile is on the artifact; the score is not.
6. `cutPasses.rampartsDeleted` is the per-pass deleted set, or it is not a column. Last-prune `ramparts = shipped + deleted` is an identity over a free split.

Findings 1–3 are the round. r30 closed the *named* COORD bag, the last-fat shipped-cut, and the 8-tile box. The suffix is still a neighbor list. The last discarded rung is still a free enclosure. A closer who only adds another identity over producer leaves will ship this review again.

---

## Residue for the next implementer

Concrete mutations that still escape on this artifact:

1. **98 D8-neighbor extra, prefix held.** E11S1: `fullRun.reserved.push("19,27")`; push the same key onto `byRound[byRound.length-1]` (or a new trailing round); `tiles = reserved.length`; `shrunk.wanted = tiles`; copy the twin. `checkRoom` passes. Any other buildable D8 neighbor of reserved that is not already on the board works the same.
2. **88 last fat rung, one-tile nudge.** E11S2 needDeep+85: replace one tile of the 42-tile cut (`20,9 → 19,9` is a witness), set `mobility` to `enclosureMobility` of the new list, keep `ramparts=50`. Last rung is not weighed. A 42-tile enclosure at lap 0 passes because would-have-taken only judges `cuts.length ≤ shipped`.
3. **Presence.** Zero `corridorPlaced` / `stubRoads` / `towerOnly` / `stitched` / `boundHeld` / `digRoads` / `roadsEaten` on a single room. Fleet-wide zero of the class minus `baseCut`+`shallowNow` is silent. Lane-anchor / swap-offer "BITES" die if you zero both copies (and regen the basis).
4. **`seedScore := 0`** (or `+= 999`) on E11S1.
5. **`protectRadius` 10→12** (or any other `RADII_WIDE` swap). **`baseCut ± 1`** staying on the same side of 45.
6. **cutPasses split.** E11S6: swap the two prune `rampartsDeleted`, set last-prune `ramparts = shipped + new deleted`.

---

## Could this be a clean round?

**No.** Named 98 `99,99`/`1,1`/invent-shrink / 88 shipped-cut / 88 8-tile box / 93 plant-back / four cheap presence walks closed. The reserved suffix is a D8-neighbor bag. The last discarded rung is a free enclosure. The presence class still flips. `clean_rounds` is 0. The bar is 2 consecutive all-clean. Boards did not move.
