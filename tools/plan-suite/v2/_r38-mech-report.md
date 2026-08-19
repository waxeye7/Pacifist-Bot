# Round 38 mechanical review

Artifact `tools/plan-suite/out-v2/plans-hub.json` md5 `8e5d6725885bd3f3731379bedf408326` (27,780,512 bytes) — **matches expected**. HEAD `0b81233` (r29p16: bind `hubDistCap` + leftover presence). Artifact bytes unchanged since r32. p16 is a gate + mutate-corpus pass (`r27-gates.mjs`, `mutate.mjs`, `layer-ext.mjs` export of the ladder). Rooms dump `tools/plan-suite/v2/_r28-mech/rooms.json` (172/172, 0 missing). Node `v22.13.0` (`fnm` install on PATH). Probes in `tools/plan-suite/v2/_r38-mech/`. No suite source committed. Artifact not written. **No board moved.** No `boards` field. Physicals still 10,320 / 14,100 / 8,208.

`checkRoom` baseline (rooms dump, fleet-median noise stripped): **pass 172/172 · fail 0 · declared 300**. Validate main: **`pass 172/172 · fail 0 · declared-shortfall 122`**.

A gate that agrees with itself is not a gate. r29p16 closed the *named* leftover flattens (`hubDistCap` off-ladder / `lapCeilingFloor` ≠ `MOBILITY_TARGET` / `corridorPlaced` 60 iff `corridorFallback` 0). r29p15 closed the ten leftover walks and bound `seedScore`. r29p14 closed the nine leftover walks and `boundLap`. r29p13 closed the three leftover walks and the stitch 0/1 flag. r29p12 closed the five leftover presence walks. r29p11 closed leaky+`complete=false`. r29p10 closed one-copy `"19,27"`. The kept prefix is still a D8-neighbor bag. `wanted` is still a count. The last discarded rung is still a free enclosure that walks its own lap. `hubDistCap` is an enum. The presence class still flips once `baseCut`+`shallowNow` are left with the derived set. `stubCap` is an enum. The reserved mineral pair is a topology bound.

---

## BLOCKING

None on the board. r28 mineral-why / swap-offer doors stay closed. 93 plant-back stays closed. 88 leaky + `complete=false` stays closed. Named 98 one-copy stays closed. The five p12 walks stay closed. p13 three walks + stitch 0/1 stay closed. p14 nine names (and `boundLap`) stay closed. p15 ten named flattens stay closed. `seedScore := 0` / `+= 999` stay closed. Named p16 three (plus `corridorFallback` polarity) stay closed.

---

## MAJOR

### 1. Criticism 98 — named `19,27` on `fullRun` BITES; the kept prefix is still a neighbor bag. ESCAPE.

**Exploit.** E11S1 is a real shrink. After r29p10 the suffix is gone: `fullRun.reserved === lane.reserved` (6 tiles / 2 rounds), `shrunk.wanted=7`. The refused extra is a count. p16 did not touch this.

| attack | result |
|---|---|
| append `"19,27"` to `fullRun.reserved` + last / new trailing round, prefix identity broken | **BITES** (`reserved` ≠ `lane.reserved`) |
| append `"99,99"` / `"1,1"` | **BITES** (not this room's walkable interior floor) |
| invent shrink on E11S3: extra `"1,1"` as a new trailing round, `ext=58` `shallow=2` `ran=true` | **BITES** |
| **named residue:** append `"19,27"` to **both** reserved copies, stuff last `byRound`, `tiles=7`, `wanted≥8` | **ESCAPE** |
| identity-swap first reserved tile `18,27 → 19,27` on both copies | **ESCAPE** |
| two D8 neighbors on both copies | **ESCAPE** |
| `shrunk.wanted += 1` / `+= 9` / `:= tiles+1` | **ESCAPE** |
| dropped E12S5: D8 extra on `fullRun.reserved` only | **ESCAPE** |

7 real shrinks. 9 dropped. 156 plain. 163 rooms have `reserved === lane.reserved`; the 9 `reservedGtLane` are the drops (refused walk still published). A neighbor of the walk is unread once the two copies agree.

**Root cause.** A shrink is still a prefix identity plus a floor bind. r29p10 deleted the refused COORD list and left `wanted > tiles`. Tiles that *are* the kept prefix must exist, be unique, sit on this room's floor, and touch the reserved walk. They are not required to be the greedy's tiles. `"19,27"` next to `"18,27"` is still the smallest witness — you just have to write it twice.

**Board moved?** No.

### 2. Criticism 88 — leaky `20,9→19,9` + `complete=false` BITES; same-lap sealing nudge ESCAPE.

**Exploit.** E11S2 rungs: `1.56/46/37 ×3`, then `2.5/50/42` (last, eco-capped). Shipped wall 46/37 = freeze. Last fat is complete, 42 tiles, has `20,9` and `29,33`. p16 did not touch this.

| attack | result |
|---|---|
| last fat → shipped 37-tile cut, `mobility=1.56`, `ramparts:=37` | **BITES** (would-have-taken) |
| 8-tile box around the sitter, lap 0, keep `ramparts=50` | **BITES** (published cut 8 @ 0 vs shipped 37 @ 1.56) |
| nudge `20,9 → 19,9`, `mobility=0`, sitter leaks, `complete` stays true | **BITES** (`leaks the sitter`) |
| **r29p11 named:** same leak + `complete=false` + regen | **BITES** (`complete or not`) |
| same leak + `complete=false`, escalation only, no regen | **BITES** |
| last fat `complete=false` alone (still seals, lap 2.5) | **ESCAPE** |
| **named residue:** nudge `29,33 → 28,34`, still seals, lap stays **2.5**, 42 tiles | **ESCAPE** |

r29p11 dropped the `complete === true` guard. The seal test now fires whether or not the forger flips the flag. A 42-tile neighbor of the composed cut that still encloses and walks the claimed lap is free. Would-have-taken still skips anything longer than shipped. Completeness itself is unread.

**Root cause.** Discarded `cutTiles` are still a free list held to `enclosureMobility` of themselves, plus "does not leak the sitter", plus shorter-or-equal would-have-taken, plus "fatter + equals freeze". The composed enclosure is not on the board. r29p11 closed the flag skip, not the list.

**Board moved?** No.

### 3. Remaining META_DARK `presence` still flips. Minus `baseCut`+`shallowNow` is silent again.

**Exploit.** 44 presence names, 55 derived (p16 moved four: `hubDistCap` / `lapCeilingFloor` / `corridorPlaced` / `corridorFallback`; p15 ten; p14 ten including `boundLap`; p13 three; p12 five). Zeroed every remaining `klass:"presence"` numeric/bool/nonempty-array leaf across all 172 rooms. 21 kinds, 1,778 events. `checkRoom`: **fail 172/172**, every first fail is `baseCut := 0`.

Exclude `baseCut` only: **fail 3/172** — first fail is the `shallowNow` note (E12S6, E2S3, E9S2). Exclude `baseCut`+`shallowNow`: **pass 172/172**. Same 172/172 if those two plus all newly derived names (p12–p16) are skipped. Same 172/172 if those two plus **every** `klass:"derived"` name are skipped (19 leftover kinds, 1,603 events). The r37 "minus derived+baseCut+shallowNow fails 172/172 on `hubDistCap`" door is shut — not because the class was derived, because p16 reclassified the leaf the p15 formula reads.

Single-room flatten, flattering direction — **15 ESCAPE** on the first copy:

`baseOverGated`, `deepExhausted`, `digRoads`, `freeLeft`, `haulCost`, `inertPromoted`, `maxHubDist`, `parkCap`, `radii`, `rescuedLap`, `rescuedTo`, `rolledBackFrom`, `shallowRamparts`, `stubExhausted`, `wasLap`

Nine more *looked* like BITES on one copy (`deepBudget`, `floorUngated`, `strandedFirst`, `unsealed`, `worstCase`, `worstCaseUngated` — lane-anchor twin; `faceAndSatHeld`, `priceProven`, `searchedSeats` — swap-offer basis). Zero every copy: first six **ESCAPE**. Zero the last three and regen the basis: **ESCAPE**. A gate that agrees with itself is not a gate.

Closed this artifact (re-probed, BITES): `nukerInWindow`, `center`, `mineralSeatNetTiles`, `coveredDetourDeclared`, **p12 five**, **p13 three**, **p14 nine** + `boundLap`, **p15 ten**, **`seedScore`**, **p16 four**.

`baseCut` is still *classified* `presence` and is only bounded (`>= 1` + `priceyWall` sync). The klass lies. `hubDistCap` is now *classified* `derived` and is an enum whose only reader is the sibling formula.

**Root cause.** Criticism 141(c). They derived the four cheap leaves this review named. They bound `hubDistCap` to `{16,19,23,999}` without binding the pick. The class is still the class.

**Board moved?** No.

---

## MEDIUM

### 4. Exact `baseCut` / `protectRadius` / `hubDistCap` / `stubCap` picks are unread.

`protectRadius := 0` **BITES** (not in `RADII_WIDE`). `10 → 12` (E11S2) inside the enum **ESCAPE**. `baseCut := 0` **BITES**. `baseCut ± 1` keeping `priceyWall` on the same side of `MAX_CUT=45` **ESCAPE** (E11S1 32; E11S7 50).

`stubCap := 0` **BITES** (not 43 or 51). E11S1 `43 → 51` **ESCAPE**. E11S2 `51 → 43` **ESCAPE**.

`hubDistCap := 0` **BITES** (p15 `deepReach` formula: `min(2,18)=2` vs 18). `hubDistCap := 17` **BITES** (not in `HUB_CAP_LADDER`). `16 → 19` / `23` / `999` on E11S1: **ESCAPE**. `19 → 16` on E9S7: **ESCAPE**. Fleet `deepReach` is 18 on all 172; any in-ladder swap keeps `min(cap+2,18)=18`. Flattening the cap to 0 is already the sibling formula. The new gate is only "not a rung".

Sample: E5S9 `baseCut=50` = cut (pricey). E5S4 `baseCut=64` / cut=66. E18S4 `baseCut=51` / cut=53. E14S4 `baseCut=38` / cut=40. The pick is not freeze and not the shipped cut.

### 5. 141(e) — `plan.seed` and `seedScore` are both bound. Closed on the named flatten.

`plan.seed` 172/172. Independent parse of every gallery page: **126 seed==hub**, **46 seed≠hub**, **0 caption mismatches**. Rewrite `plan.seed → 1,1` **BITES**. `seedScore := 0` **BITES** (`0` vs fullest window `-92.9` on E11S1). `seedScore += 999` **BITES** (`906.1` vs `-92.9`). The named unread integer is closed. It is the window max, not the tile's own score.

### 6. `cutPasses.rampartsDeleted` split is still a log.

Naive swap of the two prune markers' `rampartsDeleted` **BITES** (last-prune `ramparts-before` identity). Last-prune `ramparts += 8` **BITES**. `sealCritical += 1` **BITES**. No room in this fleet has both prune markers deleting (`twoPruneDel=0`). E11S6 is `1 / 0`.

**Named:** E11S6 swap `1 ↔ 0`, set last-prune `ramparts = shipped + new deleted` (41+1=42). Sum still equals `inertPruned.size`. **ESCAPE**.

`+1 / −1` on that pair **BITES** (last prune goes to −1). The door is the swap that stays non-negative, not every split.

### 7. p16 four — named flatten BITES; three of the four are identities, not the pick.

| attack | result |
|---|---|
| `hubDistCap := 0` | **BITES** (`deepReach` vs `min(0+2,18)`) |
| `hubDistCap := 17` | **BITES** (not in `{16,19,23,999}`) |
| `lapCeilingFloor := 0` both reflow copies | **BITES** (`≠ MOBILITY_TARGET 1.2`) |
| `corridorPlaced := 0` on a 60 / `fallback=0` room | **BITES** |
| `corridorFallback := 1` on a 60 room | **BITES** |
| `hubDistCap` 16↔19 / 16→23 / 16→999 | **ESCAPE** |
| `corridorPlaced := 0` on a fallback room (E2S5, placed 59) | **ESCAPE** |

`lapCeilingFloor` is the constant 1.2. `hubDistCap` is `{16,19,23,999}`. `corridorPlaced` is "60 iff fallback is 0", not the placed count. Zeroing placed on a room that already fell back leaves both sides of the iff false.

### 8. p15 ten — named flatten BITES; four of the ten are identities, not the tiles.

| attack | result |
|---|---|
| `floorGated` / `floorOver` / `floorOverGated` / `freeDin` / `massAdds` / `maxDist` / `deepReach` zeroed | **BITES** |
| `stubCap := 0` / seat or approach moved to `1,1` | **BITES** |
| `stubCap` 43↔51 | **ESCAPE** |
| `deepReach += 1` | **BITES** |
| `hubDistCap` retargeted so `min(cap+2,18)` still equals shipped 18 | **ESCAPE** |
| reserved seat to another cheb-1 of the mineral, approach left | **BITES** (approach is then not D8 of the new seat) |
| reserved seat **and** approach both moved to a legal pair | **ESCAPE** |
| reserved approach to another D8 of the same seat | **ESCAPE** |

`floorGated` / `floorOver` / `floorOverGated` / `freeDin` / `massAdds` / `maxDist` are real walks. `deepReach` is `min(unreadCap+2, 18)`. `stubCap` is `{43,51}`. The reserved mineral pair is "some cheb-1 seat and some D8 approach", not the reserved tiles.

---

## MINOR / LOW

### 9. MINOR — 134(a) is still a fleet property, not a theorem.

Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**, 0 core-seal fails, 29 rooms differ from the shipped cut, 34 add + 46 remove, 27 adopt / 29 drift. Same census as r29–r37.

### 10. LOW — 134(d) is still a contract, not a derivation.

Independent road+rampart walk: **274 = 231 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified**. Agreement with a restated order.

---

## Attacked and held (r37 closures + r29p16 named, re-probed)

| attack | result |
|---|---|
| 93 plant `recovers`/`recoversDeep` back onto taken `fixedHolders` + note twin | **BITES** |
| 98 extra reserved `"99,99"` / `"1,1"` | **BITES** |
| 98 invent-shrink-fake-round on a plain 60/0 | **BITES** |
| 98 extra reserved `"19,27"` on `fullRun` only (last round or new trailing) | **BITES** |
| 88 last-fat shipped-cut + `ramparts:=cutlen` | **BITES** |
| 88 8-tile box keep-ramparts | **BITES** |
| 88 leaky `20,9 → 19,9` (sitter out) | **BITES** |
| 88 leaky `20,9 → 19,9` + `complete=false` + regen | **BITES** |
| 88 leaky + `complete=false`, no regen | **BITES** |
| `nukerInWindow` flip / `nukeWindow.center → 1,1` | **BITES** |
| `mineralSeatNetTiles` cleared | **BITES** |
| `coveredDetourDeclared` zeroed | **BITES** |
| **p12 five** `stitched` / `stitchTiles` / `roadsEaten` / `towerOnly` / `stubRoads` flattened | **BITES** |
| **p13** `mineralContainer` / `minDmgPicked` / `servedFree` zeroed or `+= 1` | **BITES** |
| **p13** `stitched := 2` / `:= laid.stitch` / `:= 1` on a no-stitch room | **BITES** |
| **p14** `arrayPartner → 1,1` / `rcl5Pair.picked → 1,1` / `minDmgArray` 0 or `+= 1` | **BITES** |
| **p14** `battlementGap := 1` / `battlementGapTiles` plant `{1,1}` | **BITES** |
| **p14** `boundHeld` flipped / `boundLap := 0` | **BITES** |
| **p14** `fillerTiles := 1` / `shallowCost` 0 or `+= 1` / `shallowRefused` cleared | **BITES** |
| **p14** `fillerTiles` and `extFace` both set to 1 | **BITES** (late-road book) |
| **p14** `boundHeld := false` and `bounded` dropped below the as-built lap | **BITES** (note `lap.bound`) |
| **p15** `floorGated` / `floorOver` / `floorOverGated` / `freeDin` / `massAdds` / `maxDist` / `deepReach` / `stubCap` zeroed | **BITES** |
| **p15** reserved seat / approach moved to `1,1` | **BITES** |
| **`seedScore := 0` / `+= 999`** | **BITES** |
| **p16** `hubDistCap := 0` / `:= 17` | **BITES** |
| **p16** `lapCeilingFloor := 0` | **BITES** |
| **p16** `corridorPlaced := 0` on 60/`fallback=0` / `corridorFallback := 1` on 60 | **BITES** |
| `protectRadius := 0` / `baseCut := 0` | **BITES** |
| `plan.seed` rewritten | **BITES** |
| cutPasses naive swap / last-prune `ramparts += 8` / `sealCritical += 1` | **BITES** |
| `mineralOffNetworkWhy` append | **BITES** |

---

## Sample

`h(room) = fmix32(fnv1a32("round38-mech|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|---|---|---|
| 1 | **E13S4** | 25,221,593 |
| 2 | **E5S9** | 31,264,513 |
| 3 | **E5S4** | 55,883,569 |
| 4 | **E18S4** | 61,738,150 |
| 5 | **E14S4** | 86,844,721 |

Also: **E11S1 E11S2 E11S3 E11S7 E2S7**.

Own D8 exterior flood over shipped ramparts and over the cut, depth from that flood, mineral seat = container cheb≤1 of the mineral. `checkRoom` 0 fails on all ten unique.

| room | ext/road/ramp/cut/frz | lap | mineral | notes |
|---|---|---|---|---|
| E13S4 | 60/79/48/43/43 | **3.29** | 29,30 off | hashed #1, seed=hub, `protectRadius=12` |
| E5S9 | 60/83/59/50/50 | 0 | 22,18 **on** | **pricey** 50, seed=hub, `protectRadius=8` |
| E5S4 | 60/90/67/66/66 | **4.67** | 13,30 off | **pricey** pick 64 ≠ cut 66, seed=hub |
| E18S4 | 60/88/63/53/53 | **2.5** | 35,30 off | **pricey** pick 51 ≠ cut 53, seed=hub |
| E14S4 | 60/82/45/40/40 | **1.67** | 6,46 off | pick 38 ≠ cut 40, seed=hub, `protectRadius=9` |
| E11S1 | 60/101/43/32/32 | 0 | 24,8 off | **98 residue**, shrink 6 / wanted 7, seed `25,39` ≠ hub `24,41`, `seedScore=-92.9` |
| E11S2 | 60/101/46/37/37 | **1.5** | 14,30 **on** | **88 residue**, shrink 20 / wanted 21, last fat 2.5/50/42, `protectRadius=10` |
| E11S3 | 60/80/37/32/32 | 0 | 12,37 off | plain `fullRun.ran=false`, seed=hub |
| E11S7 | 60/69/53/50/50 | **8.67** | 8,42 off | taken, 0 fixedHolders, pricey 50 |
| E2S7 | 60/72/21/18/18 | 0 | 32,3 off | golden, small shell |

**No sampled room leaks the sitter or any core structure through the shipped ramparts or the freeze.** 0 shallow-bare, 0 D4-blind extensions, 60/60. Film seed coords exist as `plan.seed` and match the page 172/172.

Nothing in the sample looks accidental. The expensive rooms say so (E13S4 lap 3.29, E5S4 lap 4.67 + pick-not-cut, E18S4 lap 2.5, E14S4 lap 1.67, E11S2 lap 1.5, E11S7 lap 8.67 + take). Three of the hash five publish a `baseCut` that is not the shipped cut.

---

## Clean re-derivations (terrain + shipped structure lists)

From `_r38-mech/rederive.mjs` (does not import `validate.mjs`):

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
2. **88.** Bind discarded `cutTiles` to the composed enclosure, or stop publishing them. Weigh the last rung against *this* list, not "shorter-or-prettier than shipped". A last discarded 42-tile list that still seals at lap 2.5 is the door — the leak test (complete or not) only catches the ones that don't enclose.
3. Remaining META_DARK presence: derive the cheap flattering ones (`maxHubDist`, `digRoads`, hub-kit bookkeeping that is a walk) or stop shipping them as evidence. Reclassify `baseCut` — the klass still says `presence`. Bind `hubDistCap` to the layer-1 pick, or stop publishing it; `min(cap+2,18)` plus "in the ladder" is not a pick. Twin-identity is not a derivation.
4. Exact `baseCut`/`protectRadius`/`stubCap`/`hubDistCap` or stop publishing them. Enum + `>= 1` is not a pick. `stubCap` is `{43,51}`. `hubDistCap` is `{16,19,23,999}`. The reserved mineral pair is some legal seat+approach, not the reserved tiles. `corridorPlaced` is the placed count, or it is not a column.
5. `cutPasses.rampartsDeleted` is the per-pass deleted set, or it is not a column. Last-prune `ramparts = shipped + deleted` is an identity over a free split.

Findings 1–3 are the round. r29p16 closed the *named* leftover flattens (`hubDistCap` ladder / `lapCeilingFloor` constant / `corridorPlaced` iff). The prefix is still a neighbor list. The last discarded rung is still a free enclosure that seals. A closer who only adds another identity over producer leaves will ship this review again.

---

## Residue for the next implementer

Concrete mutations that still escape on this artifact:

1. **98 D8-neighbor extra, both copies.** E11S1: `fullRun.reserved.push("19,27")`; same onto `lane.reserved`; stuff last `byRound`; `tiles = reserved.length`; `wanted = tiles+1`; copy the twin. `checkRoom` passes. Identity-swap `18,27 → 19,27` on both copies also passes. Dropped E12S5: extra D8 neighbor on `fullRun.reserved` only also passes.
2. **98 wanted-count.** E11S1: `shrunk.wanted += 1` (or `+= 9`, or `:= tiles+1`). The refused extra is a free integer.
3. **88 last fat rung, same-lap sealing nudge.** E11S2 needDeep+85: replace `29,33 → 28,34`, set `mobility` to `enclosureMobility` of the new 42-tile list (this probe: **2.5**), keep `ramparts=50`. Last rung still seals. Would-have-taken only judges `cuts.length ≤ shipped`. Last-fat `complete=false` alone also passes.
4. **Presence.** Zero `maxHubDist` / `digRoads` / `parkCap` on a single room. Fleet-wide zero of the class minus `baseCut`+`shallowNow` is silent 172/172 (p16 moved `hubDistCap` to derived). Fleet-wide zero minus those **and every `klass:"derived"`**: silent 172/172. Lane-anchor / swap-offer "BITES" die if you zero both copies (and regen the basis).
5. **`protectRadius` 10→12** (or any other `RADII_WIDE` swap). **`baseCut ± 1`** staying on the same side of 45. **`hubDistCap` 16→19/23/999**. **`stubCap` 43↔51**.
6. **p16 corridor iff.** E2S5: `corridorPlaced := 0` while `corridorFallback > 0`. Both sides of "60 iff fallback 0" stay false.
7. **p15 reserved mineral pair.** E11S1: move `mineralSeatAtReservation` `24,8 → 24,7` **and** move `mineralApproachAtReservation` onto a D8 of `24,7`. Approach-only `25,9 → 25,8` also passes.
8. **cutPasses split.** E11S6: swap the two prune `rampartsDeleted` (`1 ↔ 0`), set last-prune `ramparts = shipped + new deleted`.

---

## Could this be a clean round?

**No.** Named p16 four leftover flattens / named p15 ten leftover walks + `seedScore` / named p14 nine + `boundLap` / named p13 three + stitch 0/1 / named p12 five / named 88 leaky+`complete=false` / named 98 `19,27` on one copy / 88 leaky complete / named 98 COORD bag / 88 shipped-cut / 88 8-tile box / 93 plant-back closed. The kept prefix is a D8-neighbor bag. `wanted` is a count. The last discarded rung is a free sealing enclosure. The presence class still flips once `baseCut`+`shallowNow` are left alone. `hubDistCap` / `stubCap` / `protectRadius` are enums. The reserved mineral pair is a topology bound. `corridorPlaced` is an iff, not the count. `clean_rounds` is 0. The bar is 2 consecutive all-clean. Boards did not move.
