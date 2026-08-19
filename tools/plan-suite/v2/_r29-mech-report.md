# Round 29 mechanical review

Artifact `tools/plan-suite/out-v2/plans-hub.json` md5 `c2e6039a7ac5816c1c6c40161685354a` (matches expected). Rooms dump `tools/plan-suite/v2/_r28-mech/rooms.json` (172/172, 0 missing). Node `fnm exec --using 22`. Probes in `tools/plan-suite/v2/_r29-mech/`. No suite source committed. Artifact not written. **No board moved.**

A gate that agrees with itself is not a gate. Round 28 closed the *named mutations*. The three unpublished boards are still unpublished. The remaining presence class still flips.

---

## BLOCKING

None on the board. None of the r28 BLOCKING doors (mineral-why suffix+seat, swap-offer face parsed from its sentence) still open.

The three named residues below are the round. They are validator holes about walks nobody published, not tile defects.

---

## MAJOR

### 1. Criticism 98 residue — forge the whole `fullRun`, invent a consistent shrink. ESCAPE.

**Exploit.** E11S3 is a plain room: `fullRun.ran=false`, `ext=60`, `shallow=0`, `tiles=3`, `rounds=2`, no `shrunk`. The r28 invent (slap `shrunk` on, leave `fullRun` honest) **BITES** (`cap-10 walk was free`). Deleting `fullRun` **BITES**. Erasing E11S1's real shrink **BITES** (stranded stubs).

Forge the *walk* and the *outcome* together, keep the two lane copies identical:

```
fullRun = { tiles: wanted, rounds: 10, shallow: 2, ext: 58, ran: true, used: 10, to: 4 }
shrunk  = { from: 10, to: 4, wanted: tiles+12, premium: 0 }
rounds = roundCap = 4
```

`checkRoom` **ESCAPE**. Same if `to` is the room's existing `rounds` (2) and only `fullRun` is rewritten to look costly. 156 plain rooms.

**Root cause.** `ran` is a predicate of `fullRun.{tiles,ext,shallow}`, which are producer leaves. `shrunk.to`/`roundCap`/`rounds`/`wanted` are identities over those leaves. There is no cap-10 board. A priced refusal of a search that never ran is still a passing room once the log agrees with itself.

**Board moved?** No.

### 2. Criticism 88 residue — invent a discarded-rung cut that walks a prettier lap. ESCAPE.

**Exploit.** E11S2 rungs: `1.56/46/37, 1.56/46/37, 1.56/46/37, 2.5/50/42`. Shipped wall 46/37. Setting rung-3 mobility `2.5 → 0.5` and regen **BITES** (`enclosureMobility of its published cut is 2.5`). Zeroing mobility and leaving the cut **BITES**.

Replace the fatter discarded cut (`needDeep+85`, 42 tiles, lap 2.5) with the **shipped** 37-tile cut and set mobility to `enclosureMobility(shipped)=1.56`. Regen the paragraph. **ESCAPE**.

A random 8-tile box that walks lap 0 **BITES** — not because the cut is fake, but because a discarded rung at 0/46 would have beaten the incumbent 1.56/46. The gate that fired is "the escalation would have taken this challenger", not "this is the cut the producer composed".

**Root cause.** Discarded `cutTiles` are a free list held to `enclosureMobility` of themselves. Any cut that walks the claimed lap and is not a strict improvement over the winner passes. The composed enclosure is not on the board.

**Board moved?** No.

### 3. Criticism 93 residue — `recovers`/`recoversDeep` on taken rooms still pre-take. ESCAPE.

**Exploit.** Inventing `{lab,1,1,99/99}` on E11S7 (taken, 0 fixed holders) **BITES** (not a shipped unmovable + note twin + cap). Appending a fake holder onto a pre-take `sealedFloor.pockets[].holders` **BITES** (flood re-derives the roster).

E15S6 is taken and ships four lab holders `2/2, 2/2, 1/1, 1/1` over pockets totalling 72 tiles. Inflate `recovers` by 1 on `sealedRecovery.fixedHolders` **and** the note record, regen `notes[i]`. **ESCAPE**. The only bite on the one-sided inflate was the note twin.

**Root cause.** On a taken room the mass moved. r28 bound *identity* (must be a shipped unmovable, recovers in `[1, cap]`). The counterfactual numbers are still a log of a board that is gone. Regenerating the note is not a derivation.

**Board moved?** No.

### 4. Remaining META_DARK `presence` names still flip flattering. 169/172.

**Exploit.** Zeroed every remaining `klass:"presence"` numeric/bool leaf except `baseCut` (r28 bounded) across all 172 rooms. 43 names, 4,426 events. `checkRoom`: **pass 169/172**. The three fails (E12S6, E2S3, E9S2) are note-identity on `shallowNow` — `renderNote` then says "0 of 60 sit at depth < 4" against a shipped 6/4/15. Not a board gate on `shallowNow`. Exclude that leaf and the fleet is silent.

Single-room ESCAPE, flattering direction: `extractorOffNetwork` (133 rooms), `mobilityShippedFree.maxGated`, `corridorFallback`, `corridorPlaced`, `roadsEaten`, `stitched`, `mineralSeatNetTiles`, `extractorSeatNetTiles`, `baseOverGated`, `nukerInWindow`, `towerOnly`, `stubRoads`, `deepBudget`, `boundHeld`, `floorGated`, …

`baseCut` is still *classified* `presence` in `META_DARK` and is only bounded (`>= 1` + `priceyWall` sync). The klass lies.

**Root cause.** Criticism 141(c). r28 derived the cheap walks the last review named. The class is still the class. 83 presence names remain; 16 are `derived`.

**Board moved?** No.

---

## MEDIUM

### 5. `cutAdopted ⊆ cutDrift` adds, not `===`. Plant a real add. ESCAPE.

Plant a non-add rampart on E11S1 **BITES**. Plant E13S3's actual `cutDrift` add tile into the always-empty `cutAdopted` **ESCAPE**. 172/172 still ship `[]`. The 34 real adoptions live only in `cutDrift`. The gate is a subset check on an empty list.

### 6. `cutPasses.sealCritical` is bounded, not derived.

`+= 999` **BITES** (`> ramparts`). `kind` rewrite **BITES**. Prune `ramparts := 0` while `rampartsDeleted > 0` **BITES**. `sealCritical += 1` staying `≤ ramparts` on E11S1 **ESCAPE**. No room in this fleet has both prune markers deleting (cannot re-test the sum-preserving swap). The three decorative columns r28 "bounded" are still free inside the bound.

### 7. Exact `baseCut` / `protectRadius` pick is unread.

`protectRadius := 0` **BITES** (not in `RADII_WIDE`). `12 ↔ 6` inside the enum **ESCAPE**. `baseCut := 0` **BITES**. `baseCut -= 1` keeping `priceyWall` on the same side of `MAX_CUT=45` **ESCAPE**.

Sample: E6S3 `baseCut=60` / freeze=64 / cut=64 (1 add + 1 rem). E21S3 `baseCut=27` / freeze=29. E14S7 `baseCut=52` / freeze=56. The pick is not freeze and not the shipped cut.

### 8. 141(e) — dropped `seed` is still unre-derivable in the same 46 rooms. `seedScore` is free. `seedSkip` is a twin.

`plan.seed` is gone from the artifact in **172/172**. Film/page still print `seed (x,y) → hub (x,y)` from the export-time object. Independent parse of every gallery page: **126 seed==hub** (those 126 sit on storage), **46 seed≠hub**. Same 46. `seedPool` re-derives from terrain (halving **BITES**). `seedScore := 0` on E12S5 **ESCAPE**. `meta.seedSkip: 1→0` alone **BITES** the declaration twin; set `meta.seedSkip` **and** `runtime.seedSkip`/`eco.seedSkip` to 0, regen, **ESCAPE**. The "re-derived from this room's own board" sentence is a twin of a producer leaf.

---

## MINOR / LOW

### 9. MINOR — 134(a) is still a fleet property, not a theorem.

Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**, 0 core-seal fails, 29 rooms differ from the shipped cut, 34 add + 46 remove, 27 adopt / 29 drift. A room that shipped a redundant frozen cut tile would still let a forger shrink the anchor, log a matching add, and inflate withheld. This fleet does not ship one.

### 10. LOW — 134(c) sandwich holds; the named hole is unchanged.

`ec[1].withheld += 1` (plus a junk tile) **BITES**. `ec[2]` zeroed **BITES** (order / sandwich). The four consumers are derived today. The criticism is that `ec[1]`/`ec[2]` reconstruct tower/lab cover as an empirical identity. A future layer that rents cover between L3 and L6 still has no published contract. Loud false-fail, not a silent hole. Unchanged.

### 11. LOW — 134(d) is still a contract, not a derivation.

The census re-implements the classifier test order (`crossing → seat → ring → cover → unclassified`) rather than importing `rampartClassifier`. Independent road+rampart walk over 172 rooms: **274 = 231 + 30 + 13 + 0 + 0**. That is agreement with a restated order, which is what the criticism asked a reader to know.

### 12. LOW — `spurred` is a boolean-of-zero, not a count.

Zeroing while `laidByKind.spur > 0` **BITES**. Decrementing 5→4 (keep nonzero) **ESCAPE**.

---

## Attacked and held (r28 gates, re-probed)

| attack | result |
|---|---|
| `mineralOffNetworkWhy` append / invented sentence / invert suffix | **BITES** whole-value |
| E11S1 nearest `18,27 19` → `1,1 1` | **BITES** |
| E2S5 / E5S3 rewrite "seat tile itself carries a road" | **BITES** (the r28 "nearest" regex was a no-op here — official census now *says* the seat carries a road; 172/172 exact) |
| E5S1 nearest rewrite | **BITES** |
| residue ring-rewrite keep suffix+seat | **BITES** 3/3 |
| swap-offer `face at 999` / regen from `{min:1,sat:1}` | **BITES** |
| swap-offer regen from `minShellDmg` | ESCAPE (correct — that is the derivation) |
| battlement zero count / zero both / rewrite roster | **BITES** (interior walk) |
| `cutAdopted` plant non-add rampart | **BITES** |
| `shippedShellDmg` inflate with twins | **BITES** (`shellDamage(towers, cut)`) |
| `mobilityShipped.maxGated → 0` | **BITES** (twin to `builtGated`) |
| refillBasis blocked-count forged in the sentence | **BITES** |
| `nukerHubDist` / `observerHubDist` → 1 | **BITES** (layer-5 hub walk) |
| `refillDistsUnblocked` flatten to 1 | **BITES** |
| `protectRadius := 0` / `priceyWall` cleared / `baseCut := 0` | **BITES** |
| `mineralBubble` / `swampPaved` / `spurred` / `newRoads` zeroed | **BITES** |
| 88 fatter discarded mobility + regen | **BITES** |
| 88 recovery-room discarded 0.5 | **BITES** |
| 98 invent shrink, leave `fullRun` honest | **BITES** |
| 98 delete `fullRun` / erase real shrink | **BITES** |
| 93 invent holder off the board | **BITES** |

---

## Sample

`h(room) = fmix32(fnv1a32("round29-mech|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|---|---|---|
| 1 | **E18S7** | 778,406 |
| 2 | **E6S2** | 54,698,231 |
| 3 | **E6S3** | 113,713,646 |
| 4 | **E21S3** | 148,954,485 |
| 5 | **E14S7** | 181,070,856 |

Also: **E11S1 E11S2 E11S3 E11S7 E2S7**.

Own D8 exterior flood over shipped ramparts and over the cut, depth from that flood, mineral seat = container cheb≤1 of the mineral, independent ring. `checkRoom` 0 fails on all ten.

| room | ext/road/ramp/cut/frz | lap | mineral | notes |
|---|---|---|---|---|
| E18S7 | 60/67/88/79/79 | 0 | 12,24 off, bubble | pricey (`baseCut=79`), ctrl unenclosed, 1/2 src |
| E6S2 | 60/72/57/48/48 | 0 | 28,6 off, bubble | pricey, `protectRadius=10` |
| E6S3 | 60/90/68/64/64 | 0 | 42,41 off, bubble | **1 add+1 rem**, `baseCut=60≠64`, covered-detour declared, ctrl enclosed |
| E21S3 | 60/68/37/29/29 | 0 | 37,41 off | `baseCut=27≠29`, `protectRadius=7` |
| E14S7 | 60/85/61/56/56 | **3** declared | 4,13 off | `baseCut=52≠56`, seed film `14,30` ≠ hub `15,30` |
| E11S1 | 60/101/43/32/32 | 0 | 24,8 off | real shrink (`fullRun.ran`), eco declared, seed film `25,39` ≠ hub `24,41` |
| E11S2 | 60/101/46/37/37 | **1.5** declared | 14,30 **on** (seat is a road) | ladder 4 rungs, 88 residue room |
| E11S3 | 60/80/37/32/32 | 0 | 12,37 off | **98 residue room**, plain `fullRun.ran=false` |
| E11S7 | 60/69/53/50/50 | **8.67** declared | 8,42 off | taken, 0 fixedHolders, recovery ladder, pricey 50 |
| E2S7 | 60/72/21/18/18 | 0 | 32,3 off | golden, small shell |

**No sampled room leaks the sitter or any core structure through the shipped wall or the freeze.** 0 shallow-bare, 0 D4-blind extensions, 60/60, mineral seat == `meta.mineralSeat` == the shipped container. E11S2's on-network why matches the board (seat carries a road, 2 ring touches). Film seed coords exist as pixels; they are not in the artifact.

Nothing in the sample looks accidental. The expensive rooms say so (E14S7 lap 3, E11S7 lap 8.67 + take, E18S7 a 79-tile pricey wall).

---

## Clean re-derivations (terrain + shipped structure lists)

From `_r29-mech/rederive.mjs` (does not import `validate.mjs`):

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
| `mineralOffNetworkWhy` vs official census | **172/172 exact** (the three r28 liars were re-rendered) |
| `fullRun` | 172 rooms ship it · 17 `ran` · 7 shrunk · 9 dropped · **156 plain** |
| ladders | 57, all 57 have `cutTiles` (54 with `shellEscalation`, 3 recovery-only) |
| taken rooms | 12 (E11S7 E15S6 E18S3 E19S2 E2S1 E4S6 E5S5 E7S2 E7S5 E8S2 E9S1 E9S9) |
| `checkRoom` baseline (rooms dump, fleet-median noise stripped) | **pass 172/172 · fail 0 · declared 300**, every physical total 0 |
| film seed ≠ hub | **46** (same 46) |

Artifact md5 re-derived: `c2e6039a7ac5816c1c6c40161685354a`.

---

## What a closer has to do

1. **98.** Publish the cap-10 walk as a board (the reserved tiles, or a hash of them), or refuse to start a shrink claim without one. Internal consistency of `fullRun`+`shrunk` is how 156 rooms invent a priced refusal.
2. **88.** Bind discarded `cutTiles` to the composed enclosure, or stop publishing them. `enclosureMobility` of a free list is an agreement test. A prettier discarded cut that does not beat the winner is the door.
3. **93.** Re-derive `recovers`/`recoversDeep` on taken rooms from a named board, or drop the numbers. "Shipped unmovable + in `[1,cap]` + note regen" is a log of a board that left.
4. `cutAdopted ===` the `cutDrift` add set, or delete the field. Subset of an empty list is a comment.
5. `cutPasses.sealCritical` is the single-removal count at that pass, or it is not a column.
6. Exact `baseCut`/`protectRadius` or stop publishing them. Enum + `>= 1` is not a pick.
7. Remaining META_DARK presence: derive the cheap flattering ones (`extractorOffNetwork`, `mobilityShippedFree`, hub-kit bookkeeping that is a walk) or stop shipping them as evidence. Reclassify `baseCut` — the klass still says `presence`.
8. **141(e).** Keep `seed` on the artifact and hold the film caption to it, or drop the caption. `seedScore` is unread. `seedSkip` is a twin, not a board walk.
9. **134(a)** is a theorem or it is a fleet census. Say which.
10. `spurred` is a count of `laidByKind.spur` or it is a bool.

Findings 1–3 are the round. r28 closed the *named mutations* of 88/93/98 and left the unpublished boards unpublished. A closer who only adds another identity over producer leaves will ship this review again.

---

## Could this be a clean round?

**No.** `clean_rounds` is 0. The bar is 2 consecutive all-clean. This round closed the r28 doors it claimed to close and left every named residue standing, plus the presence class, plus the exact pick, plus 141(e). Boards did not move. The artifact is a reader-channel commit on an unchanged 10,320 / 14,100 / 8,208 board.
