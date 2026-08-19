# Round 30 mechanical review

Artifact `tools/plan-suite/out-v2/plans-hub.json`. Brief expected md5 `7eed9e2c02f0641ec4fc80b4c8a0b496` — **confirmed at first read** (27,789,280 bytes). Disk at probe time is `86d38bdd2b2aef39a79cb8aa134f9b06` (27,786,180 bytes). This reviewer did not write the artifact. The successor dropped `recovers`/`recoversDeep` from taken-room `fixedHolders` and is otherwise the r29p4 reserved-board family. Rooms dump `tools/plan-suite/v2/_r28-mech/rooms.json` (172/172, 0 missing). Node `v22.13.0` (`fnm` install on PATH). Probes in `tools/plan-suite/v2/_r30-mech/`. No suite source committed. **No board moved.** No `boards` field on the plan; physicals are still 10,320 / 14,100 / 8,208.

`checkRoom` baseline (rooms dump, fleet-median noise stripped): **pass 172/172 · fail 0 · declared 300**. Validate main: **`pass 172/172 · fail 0 · declared-shortfall 122`**.

A gate that agrees with itself is not a gate. Named forge / delete reserved / 60/0 shallow / cutAdopted plant / cutPasses `+= 1` / 93 plant-back **BITES**. The reserved list is still a bag of COORD strings. The last discarded rung is still a free enclosure.

---

## BLOCKING

None on the board. The r28 mineral-why / swap-offer doors stay closed. 93's taken-room counterfactual integers are gone from `fixedHolders` on this snapshot.

---

## MAJOR

### 1. Criticism 98 — named forge BITES; extra reserved tiles that prefix-match ESCAPE.

**Exploit.** E11S3 is a plain 60/0 room: `fullRun.ran=false`, `reserved=["25,40","31,17","32,16"]`, `byRound` two rounds, `lane.reserved` the same three tiles.

| attack | result |
|---|---|
| r29 named forge (`fullRun` tiles/ext/shallow/ran + `shrunk`, no reserved rewrite) | **BITES** (`fullRun.reserved has 3 tile(s) and fullRun.tiles is 15`) |
| delete `fullRun.reserved` / delete `fullRun` (both twins) / delete reserved on a drop | **BITES** |
| 60/0 `ext=58` `shallow=2` `ran=true` (kept) | **BITES** (`fullRun.ext is 58 and this room ships 60`) |
| 60/0 rewrite leaving `ran=false` | **BITES** (ran identity) |
| invent `shrunk`, leave `fullRun` honest | **BITES** (`cap-10 walk was free`) |
| erase E11S1's real shrink (both twins) | **BITES** (stranded stubs) |
| append `"1,1"` / new extra round / `"99,99"` to reserved+byRound after the prefix, keep `shrunk.to` | **ESCAPE** |
| invent a shrink on E11S3: extra round `["1,1"]`, `ext=58` `shallow=2` `ran=true` `to=existing rounds`, prefix = `lane.reserved` | **ESCAPE** |
| duplicate a prefix key | **BITES** (set, not bag) |

156 plain rooms. 7 real shrinks. Off-board `99,99` is a legal COORD.

**Root cause.** `reserved`/`byRound` are a list of `\d{1,2},\d{1,2}` strings. A shrink is "prefix of `byRound[0..to)` equals `lane.reserved` and `reserved.length > lane.reserved.length`". There is no walk, no interior test, no producer hash. Extra keys after the prefix are unread. A kept 60/0 room invents a priced refusal by appending a fake round and flipping `ran`.

**Board moved?** No.

### 2. Criticism 88 — fatter mobility BITES; last discarded rung is still a free enclosure. ESCAPE.

**Exploit.** E11S2 rungs: `1.56/46/37 ×3`, then `2.5/50/42` (last, eco-capped, not weighed). Shipped wall 46/37 = freeze.

| attack | result |
|---|---|
| fatter discarded mobility `2.5 → 0.5` + regen | **BITES** (`enclosureMobility of its published cut is 2.5`) |
| keep ramparts=50, swap cutTiles to freeze/shipped, mobility 1.56 | **BITES** (`cutTiles ARE cutAtFreeze`) |
| **r29 named:** replace fatter cut with shipped 37-tile cut, `mobility=1.56`, `ramparts:=37` | **ESCAPE** |
| same named swap on last fat rung (re-run) | **ESCAPE** |
| invent 8-tile box, lap 0, on a *non-last* twin (needDeep+25, 46 ramparts) | **BITES** (would-have-taken) |
| invent 8-tile box, lap 0, on the *last* fat rung, keep ramparts=50 | **ESCAPE** |
| one-tile nudge of the 42-tile discarded cut, mobility = its own walk | **ESCAPE** |
| non-last fat (E11S6 needDeep+25) shipped-cut + `ramparts:=cutlen` | **BITES** (cheaper-upkeep would-have-taken) |

96 fat rungs; 37 are last. E11S2's only fat rung is last. `ecoBudget` is absent ⇒ `ecoCapped=true` ⇒ last rung is not weighed.

**Root cause.** Discarded `cutTiles` are held to `enclosureMobility` of themselves. The r29 freeze-identity only fires when `ramparts > shipped` **and** the list **is** `cutAtFreeze`. Setting `ramparts` down to the shipped cut length skips it. The would-have-taken rule skips the last rung of an eco-capped table. A last discarded rung may be any COORD list that walks the claimed lap — including a box that would have beaten the incumbent.

**Board moved?** No.

### 3. Remaining META_DARK `presence` names still flip flattering. 172/172 if `baseCut`+`shallowNow` are left alone.

**Exploit.** Zeroed every remaining `klass:"presence"` numeric/bool/nonempty-array leaf across all 172 rooms. 80 presence names, 19 derived. 47 kinds, 4,518 events. `checkRoom`: **fail 172/172**, every first fail is `baseCut := 0` (and three rooms also `shallowNow` note-identity). Exclude those two leaves: **pass 172/172**.

Single-room ESCAPE, flattering direction: `corridorFallback`, `corridorPlaced`, `roadsEaten`, `stitched`, `mineralSeatNetTiles`, `stubRoads`, `nukerInWindow`, `towerOnly`, `boundHeld`, `floorGated`, `baseOverGated`, `coveredDetourDeclared`, `digRoads`, …

BITES (now derived or bounded): `extractorOffNetwork` (twin of `mineralOffNetwork`), `mobilityShippedFree.maxGated` (mass-free walk), `extractorSeatNetTiles` (D8 of extractor), `baseCut := 0`.

`baseCut` is still *classified* `presence` in `META_DARK` and is only bounded (`>= 1` + `priceyWall` sync). The klass lies.

**Root cause.** Criticism 141(c). r29 derived three cheap walks. The class is still the class.

**Board moved?** No.

---

## MEDIUM

### 4. Exact `baseCut` / `protectRadius` pick is unread.

`protectRadius := 0` **BITES** (not in `RADII_WIDE`). `12 ↔ 6` inside the enum **ESCAPE**. `baseCut := 0` **BITES**. `baseCut -= 1` keeping `priceyWall` on the same side of `MAX_CUT=45` **ESCAPE**.

Sample: E9S5 `baseCut=49` / cut=51. E15S1 `baseCut=59` / freeze=62 / cut=61. E18S5 `baseCut=27` = cut. The pick is not freeze and not the shipped cut.

### 5. 141(e) — `plan.seed` is back and bound to the film. `seedScore` is free. `seedSkip` is a twin.

`plan.seed` present in **172/172**. Independent parse of every gallery page: **126 seed==hub** (those 126 sit on storage), **46 seed≠hub**, **0 caption mismatches**. Rewrite `plan.seed → 1,1` **BITES** (film channel). Delete `plan.seed` **BITES**. `seedPool` halved **BITES** (terrain). `seedScore := 0` / `+= 999` / negated **ESCAPE**. `meta.seedSkip: 1→0` alone **BITES** the declaration twin; set `meta.seedSkip` and `runtime`/`eco`/`composeOpts` copies to 0, regen, **ESCAPE**.

### 6. `cutAdopted ===` layer-7b adds (empty). The named plant BITES. The field is still a name for a pass that never adopts.

Plant a non-add rampart **BITES**. Plant E13S3's real `layer7-reconcileSeal` add into always-empty `cutAdopted` **BITES** (`layer7b-reconcileSeal adds are []`). 172/172 still ship `[]`. 34 real adoptions live in `cutDrift` under layer 7. The r29 subset-of-empty door is closed. The list is an identity over an empty pass.

---

## MINOR / LOW

### 7. MINOR — 134(a) is still a fleet property, not a theorem.

Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**, 0 core-seal fails, 29 rooms differ from the shipped cut, 34 add + 46 remove, 27 adopt / 29 drift. Same census as r29. Dropping one freeze tile **BITES** (exteriorContract withheld re-derives). A room that shipped a redundant frozen cut tile would still let a forger shrink the anchor. This fleet does not ship one.

### 8. LOW — 134(c) sandwich holds; the named hole is unchanged.

`ec[1].withheld += 1` (plus a junk tile) **BITES**. `ec[2]` zeroed **BITES** (order / sandwich). The four consumers are derived today. A future layer that rents cover between L3 and L6 still has no published contract.

### 9. LOW — 134(d) is still a contract, not a derivation.

Independent road+rampart walk over 172 rooms: **274 = 231 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified**. Agreement with a restated order.

### 10. LOW — `spurred` is a boolean-of-zero, not a count.

Zeroing while `laidByKind.spur > 0` **BITES**. Decrementing 13→12 (keep nonzero) **ESCAPE**.

### 11. LOW — `cutPasses.sealCritical` / prune `ramparts` are derived on this snapshot.

`sealCritical += 999` **BITES**. `sealCritical += 1` **BITES** (single-removal on that invocation's ramparts). `kind` rewrite **BITES**. Prune `ramparts := 0` **BITES**. Prune `ramparts += 8` **BITES**. No room in this fleet has both prune markers deleting (cannot re-test the sum-preserving swap). The r29 `+= 1` inside the bound is closed.

---

## Attacked and held (r28/r29 gates, re-probed)

| attack | result |
|---|---|
| `mineralOffNetworkWhy` append / invert suffix | **BITES** whole-value |
| E5S1 nearest rewrite | **BITES** |
| E2S5 / E5S3 "nearest" regex | ESCAPE (no-op — official census says the seat carries a road) |
| swap-offer `face at 999` | **BITES** |
| swap-offer regen from `minShellDmg` | ESCAPE (correct — that is the derivation) |
| battlement zero count | **BITES** (interior walk) |
| `cutAdopted` plant non-add / plant real L7 add | **BITES** |
| `shippedShellDmg` inflate | **BITES** |
| `mobilityShipped.maxGated → 0` | **BITES** |
| refillBasis blocked-count forged | **BITES** |
| `nukerHubDist` / `observerHubDist` → 1 | **BITES** |
| `refillDistsUnblocked` flatten to 1 | **BITES** |
| `protectRadius := 0` / `priceyWall` cleared / `baseCut := 0` | **BITES** |
| `mineralBubble` / `swampPaved` / `spurred` / `newRoads` zeroed | **BITES** |
| 88 fatter discarded mobility + regen | **BITES** |
| 88 recovery-room discarded 0.5 | **BITES** |
| 98 invent shrink, leave `fullRun` honest | **BITES** |
| 98 delete reserved / delete `fullRun` / 60/0 shallow / erase real shrink | **BITES** |
| 93 invent holder off the board (one copy or both + regen) | **BITES** |
| 93 plant `recovers` back onto taken `fixedHolders` | **BITES** |
| 93 inflate `sealedFloor` pocket `recovers` / `recoversDeep` (+ regen) | **BITES** (flood) |
| 93 inflate remaining `fixedHolders.recovers` on allRefused rooms | **BITES** (onShipped + note twin) |

---

## Sample

`h(room) = fmix32(fnv1a32("round30-mech|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|---|---|---|
| 1 | **E8S2** | 40,151,167 |
| 2 | **E9S5** | 92,955,386 |
| 3 | **E7S8** | 123,124,009 |
| 4 | **E15S1** | 134,440,619 |
| 5 | **E18S5** | 151,024,097 |

Also: **E11S1 E11S2 E11S3 E11S7 E2S7**.

Own D8 exterior flood over shipped ramparts and over the cut, depth from that flood, mineral seat = container cheb≤1 of the mineral. `checkRoom` 0 fails on all ten.

| room | ext/road/ramp/cut/frz | lap | mineral | notes |
|---|---|---|---|---|
| E8S2 | 60/93/36/35/35 | 0 | 43,34 off | **taken**, seed `33,23` ≠ hub `33,21` |
| E9S5 | 60/71/53/51/51 | **3** | 12,27 off | pricey (`baseCut=49≠51`), `protectRadius=10` |
| E7S8 | 60/94/51/44/44 | 0 | 12,18 off | `protectRadius=9`, seed ≠ hub |
| E15S1 | 60/67/67/61/62 | 0 | 45,36 off | pricey 59, **sitter out through cut**, freeze holds, known bubble |
| E18S5 | 60/88/33/27/27 | **1.83** | 26,25 off | `baseCut=27` |
| E11S1 | 60/101/43/32/32 | 0 | 24,8 off | real shrink (`fullRun.reserved` 7 / lane 6), seed `25,39` ≠ hub `24,41` |
| E11S2 | 60/101/46/37/37 | **1.5** | 14,30 **on** | ladder 4 rungs, 88 residue room |
| E11S3 | 60/80/37/32/32 | 0 | 12,37 off | **98 residue room**, plain `fullRun.ran=false` |
| E11S7 | 60/69/53/50/50 | **8.67** | 8,42 off | taken, 0 fixedHolders, recovery ladder, pricey 50 |
| E2S7 | 60/72/21/18/18 | 0 | 32,3 off | golden, small shell |

**No sampled room leaks the sitter or any core structure through the shipped ramparts or the freeze.** E15S1's *cut* does not enclose the sitter (23 core tiles through the cut); the freeze and the shipped wall do. That is the known bubble pair, not a new hole. 0 shallow-bare, 0 D4-blind extensions, 60/60. Film seed coords exist as `plan.seed` and match the page 172/172.

Nothing in the sample looks accidental. The expensive rooms say so (E9S5 lap 3, E11S7 lap 8.67 + take, E18S5 lap 1.83).

---

## Clean re-derivations (terrain + shipped structure lists)

From `_r30-mech/rederive.mjs` (does not import `validate.mjs`):

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

Artifact md5 at probe time: `86d38bdd2b2aef39a79cb8aa134f9b06`. First-read (brief): `7eed9e2c02f0641ec4fc80b4c8a0b496`.

---

## What a closer has to do

1. **98.** `fullRun.reserved` is a walk on this room's floor (or a hash of the composed cap-10 board). Extra COORD strings that still prefix-match are how 156 plain rooms invent a priced shrink. Off-board `99,99` is the smallest witness.
2. **88.** Bind discarded `cutTiles` to the composed enclosure, or stop publishing them. Weigh the last rung or do not print it. `ramparts := cut.length` must not skip the freeze-identity. A last discarded box at lap 0 is the door.
3. Remaining META_DARK presence: derive the cheap flattering ones (`corridorPlaced`, `nukerInWindow`, `mineralSeatNetTiles`, hub-kit bookkeeping that is a walk) or stop shipping them as evidence. Reclassify `baseCut` — the klass still says `presence`.
4. Exact `baseCut`/`protectRadius` or stop publishing them. Enum + `>= 1` is not a pick.
5. **141(e).** `seedScore` is unread. `seedSkip` is a twin, not a board walk. The tile is on the artifact now; the score is not.
6. **134(a)** is a theorem or it is a fleet census. Say which.
7. `spurred` is a count of `laidByKind.spur` or it is a bool.
8. `cutAdopted` is the layer-7b add set (empty). Delete the field or stop printing a pass that never adopts.

Findings 1–3 are the round. r29p4 published the reserved board and closed the *named* 98 forge. The list is still a list. r29p5 dropped taken-room `recovers` (93 closed on this snapshot). A closer who only adds another identity over producer leaves will ship this review again.

---

## Residue for the next implementer

Concrete mutations that still escape on this artifact:

1. **98 extra reserved, prefix held.** On any of the 7 shrink rooms (E11S1 …): `fullRun.reserved.push("99,99")`; push the same key onto `byRound[byRound.length-1]`; `tiles = reserved.length`; `shrunk.wanted = tiles`; copy the twin. `checkRoom` passes. Same with a new trailing round. Same on a plain room if you also set `shrunk.to = lane.rounds`, `ran=true` via `ext<60` or `shallow>0`.
2. **88 last fat rung.** E11S2 needDeep+85: replace `cutTiles` with any list whose `enclosureMobility` you write back, keep `ramparts` either at 50 (freeze check wants `> shipped` **and** freeze identity) or drop it to 37 and use the shipped cut. Last rung is not weighed. A box around the sitter at lap 0 passes.
3. **Presence.** Zero `corridorPlaced` / `nukerInWindow` / `mineralSeatNetTiles` / `stubRoads` / `stitched` / `roadsEaten` / `towerOnly` / `boundHeld` / `floorGated` / `baseOverGated` / `coveredDetourDeclared` / `digRoads` on a single room. Fleet-wide zero of the class minus `baseCut`+`shallowNow` is silent.
4. **`seedScore := 0`** (or `+= 999`) on E12S5 / E11S1. **`seedSkip` + all declaration twins → 0**, regen.
5. **`protectRadius` 10→12** (or any other `RADII_WIDE` swap). **`baseCut -= 1`** staying on the same side of 45.
6. **`spurred` 13→12** while `laidByKind.spur` stays 13.

---

## Could this be a clean round?

**No.** Named 98 forge / 60/0 / delete reserved / 93 plant-back / cutAdopted plant / cutPasses `+= 1` closed. The reserved board is a COORD bag. The last discarded rung is a free enclosure. The presence class still flips. `clean_rounds` is 0. The bar is 2 consecutive all-clean. Boards did not move.
