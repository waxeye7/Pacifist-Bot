# Round 28 mechanical review

Artifact `tools/plan-suite/out-v2/plans-hub.json` md5 `239f4e43331181cf4484d462003ff6b5` (matches expected). Mongo up. Node `fnm exec --using 22`. Probes in `tools/plan-suite/v2/_r28-mech/`. No suite source committed. No board moved.

A gate that agrees with itself is not a gate. Three still do.

---

## BLOCKING

### 1. `mineralOffNetworkWhy` is not whole-value. Suffix + seat + a named nearest road is the whole check. The 3-room residue is a fleet-wide door.

**Exploit.** `r27-gates.mjs` exact-matches the official census, then falls through to: `includes(OFF|ON basis) && includes("the mineral seat at X,Y") && (named nearest road matches derived, or "seat tile itself carries a road")`. Everything else is free text.

| forgery | rooms | result |
|---|---|---|
| append `" THE WALL IS FREE."` after last character | E11S1 E1S1 E12S7 E9S9 E7S5 E4S3 (all exact-match rooms) | ESCAPE 6/6 |
| replace `MINERAL_OFF_NETWORK_BASIS` with `MINERAL_ON_NETWORK_BASIS` | E11S1 (off-network, official census exact) | ESCAPE |
| invert suffix **and** append `"THIS SEAT IS ON THE NETWORK AND THE EXEMPTION IS A LIE."` | E11S1 | ESCAPE |
| keep nearest-road clause, rewrite ring to `"ALL EMPTY — so 0 of them put it on the network"` | E2S5 E5S1 E5S3 | ESCAPE 3/3 |
| rewrite nearest to `1,1` (the r28 mutate case) | E2S5 | BITES (nearest bind) |
| rewrite ring **and** drop the nearest clause | E2S5 | BITES (nearest bind) |

`includes()` of either constant is how append and invert both live. `endsWith` is dead because the producer always appends `" Measured over the FINISHED road set…"`.

**Root cause.** Criticism 141(d) carved a 3-room fallback for ring-wording disagreement. The fallback is a **presence** check, not a render. 172/172 rooms satisfy it (133 OFF + 39 ON). The official census **exact-matches** 169 rooms (E11S1, E12S7, E9S9, E1S1 measured exact). Those 169 still take the fallback the moment the sentence is no longer byte-identical — so a lie that keeps seat + suffix + nearest is a passing room. E5S1's shipped ring says `28,30 (nothing of ours)` against a derived `28,30 (road)` (the conduct-bridge tile). That is the residue. The door it opened is the fleet.

The mid-review nearest-road bind closed one clause (mutate `r28/MF5-X-mineralWhy-residue-nearest-rewritten` now bites). It did not close the class.

**Board moved?** No.

---

## MAJOR

### 2. `towerSwapOffer.basis` face/sat is parsed out of the sentence it is supposed to check.

**Exploit.** Gate:

```js
const faceHit = /face at (\d+) and its saturation at (\d+)/.exec(off.basis);
const mn = faceHit ? +faceHit[1] : tw.minShellDmg;
const sat = faceHit ? +faceHit[2] : …;
want = renderSwapOfferBasis({ … face: { min: mn, sat }, … });
```

E11S1 ships `"face at 2250 and its saturation at 2250"` (`minShellDmg` is 2250). Replace with `"face at 999 and its saturation at 999"`. Re-render uses 999/999. `checkRoom` ESCAPE. Same if the whole sentence is regenerated from `face: {min:1, sat:1}`.

**Root cause.** Agreement test. The second term of the comparison is read from the first. `minShellDmg` is sitting one field over and is independently derived; the regex match means it is never consulted.

**Board moved?** No.

### 3. MF6 "presence" names: fleet-wide flattering flip, `pass 172/172`, summary byte-identical.

**Exploit.** Mutated all 172 rooms in a `PLANS_FILE` copy. Left `mobilityShipped` and `shippedShellDmg` alone (those two are derived on the current tree). Flipped:

| field | E11S1 before → after | fleet non-flattering |
|---|---|---|
| `protectRadius` | 12 → 0 | 172 |
| `baseCut` | 32 → 0 | 172 |
| `observerHubDist` | 11 → 1 | 172 |
| `refillDistsUnblocked` | `[1,3,2,3,4,4]` → all 1 | 172 |
| `nukerHubDist` | 2 → 1 | 56 |
| `priceyWall` | (73 rooms truthy) → 0 | 73 |
| `spurred` | 1 → 0 | 87 |
| `swampPaved` | (38 rooms) → 0 | 38 |
| `newRoads` | 5 → 0 | — |
| `mineralBubble` | 1 → 0 | numeric, not boolean |
| `cutAdopted` | `[]` → first rampart tile | 0 rooms ship a non-empty list |

`validate.mjs` on that file: **`pass 172/172 · fail 0 · declared-shortfall 122`**, every physical total 0, and the four derived fleet lines character-identical to the clean run (layer-7 outside 3 · offers 14/14 · refusals `23 = 9+10+4` · noWalls `16 of 57, floor -9` · roads median 81).

A first combined flip that **also** zeroed `mobilityShipped.maxGated` failed **55/172** — exactly the 55 rooms whose as-built lap is not already 0. That one is a twin to `walls.mobility.builtGated` (derived). Retracted as a hole. E11S1's single-room "escape" was because its lap is already 0.

**Root cause.** `META_DARK` `klass: "presence"` with a `why` is a comment. Criticism 141(c) named `nukerHubDist` / `observerHubDist` and "most of the 105". The class is still the class.

**Board moved?** No.

### 4. `battlementUnreachable` is a twin, not a derivation.

**Exploit.** E13S3 ships count 1 + a one-tile roster. Zero the count alone → BITES (`count vs tiles.length`). Zero **both** → ESCAPE. The only reader in `validate.mjs` is:

```js
if (Array.isArray(buT27) && sh27.battlementUnreachable !== buT27.length)
```

No flood, no ring, no standability test. Two producer fields agree about a roster nobody rebuilt. 12 rooms carry a non-zero count (the r27 flattering-direction roster).

**Root cause.** Validator circularity. Criticism 139 claimed the four enclosure claims plus `battlementUnreachable` were derived. Three of four are. This one compares two leaves.

**Board moved?** No.

### 5. `cutAdopted` is classified `derived` and is a rampart-presence check on an always-empty list.

**Exploit.** 172/172 rooms ship `cutAdopted: []` (layer-7b overwrite, criticism 130). `checkR27` only runs when `length > 0`, and then only asks "does this tile wear a rampart?". Plant `{x,y}` of any shipped rampart → ESCAPE. Clear `[]` → no-op. The 34 real adoptions live only in `cutDrift`.

**Root cause.** A later pass erased the roster. The gate was written against the name, not against the drift log the ruling said would stand in for the declaration.

**Board moved?** No.

---

## MAJOR (residues re-confirmed by exploit)

### 6. Criticism 88 — fatter discarded-rung `mobility` + regen still escapes.

E11S2 rungs: `1.56/46, 1.56/46, 1.56/46, 2.5/50`. Shipped wall 46. Set rung 3 mobility `2.5 → 0.5`, `detail = renderDecl(sf)`. ESCAPE. Same-cost better-lap (`0.01` at 46) BITES — that half is closed. The residue is still the rung with **more** ramparts than shipped.

### 7. Criticism 93 — pre-take sealed-floor holders still free.

E11S7: append `{type:"extension", x:1, y:1, recovers:99, recoversDeep:99}` onto `sealedRecovery.pockets[].holders`. ESCAPE.

### 8. Criticism 98 — invent a shrink on a plain room.

E11S3: write `shrunk: {from:10, to:rounds, wanted:12, premium:0}` and `roundCap := rounds` into **both** `walls.mobility.lanes` and `extensions.laneMeta`. ESCAPE. (Writing only one copy now BITES the twin — that is not a close of the invent direction.)

---

## MINOR / LOW

### 9. MINOR — 134(a) is still a fleet property, not a theorem. No exploit on these 172.

Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**, 0 core-seal fails, 29 rooms differ from the shipped cut, 34 adds / 46 removes, 27 rooms adopt / 29 drift. Absorb-one-add, grow-by-interior-tile, erase-adds, rewrite-why, repoint-at-shipped all **BITES** (minimality / `cutPasses` / `inertPruned` completeness). A room that shipped a redundant frozen cut tile would still let a forger shrink, log a matching add, and inflate withheld. This fleet does not ship one.

### 10. LOW — numeral-audit census in the goal doc is already stale.

Live: **208 claims · 149 re-derived · 59 waived at 36 sites · 0 unowned · 0 WRONG**. Doc still writes 192/131/61. Four `DEAD-WAIVER` tags. Harness itself is clean. Criticism 105, again.

---

## Attacked and held

| attack | result |
|---|---|
| `enclosureBasis` invented prefix, keep `ENCLOSURE_BASIS` | BITES (census from terrain + shipped ramparts) |
| `enclosedSources` / `enclosedController` flattered, with and without sentence | BITES (flood) + film-note tail |
| `deepTilesBasis` leaf ± sentence | BITES (`shippedFreeDeep` board-derived; note tail) |
| `prunedBasis` leaf + sentence | BITES (`prunedTiles` vs `pruned`) |
| `counterfactualBasis` append / leaf+sentence | BITES (note-record bind) |
| `noteObligationBasis` append | BITES |
| `remeasured` append | BITES |
| `shippedShellDmg` inflate ± twins | BITES (board derivation; r28 patch) |
| `mobilityShipped.maxGated → 0` on a non-zero room | BITES (twin to derived `builtGated`; 55/55) |
| `cutAtFreeze` absorb / grow / erase / rewrite / repoint / shrink | BITES |
| film `emptyBecause` swap two absence reasons | BITES |
| film `emptyBecause` plant another facet's rendered reason | BITES |
| `NOTES.ramparts` append after last character | BITES |
| `meta.mineralSeat` moved onto a source container | BITES |
| `refillBasis` blocked count parsed from the sentence | **BITES now.** First probe ESCAPED (`91` → `999` / regen-from-parsed-`1`). A board derivation of `blocked.size` landed before `mutate.mjs` ran; `r28/MF5-X-refillBasis-blocked-count-forged-in-the-sentence` bites. Closed on the tree this report is written against. The shape — parse the claim out of the sentence — is still live in finding 2. |

---

## Clean re-derivations (terrain + shipped structure lists, no producer meta trusted)

From `_r28-mech/rederive.mjs` + `validate.mjs` + `numeral-audit.mjs` + `mutate.mjs`:

| quantity | derived |
|---|---|
| rooms | 172, 0 missing terrain |
| extensions | **10,320** (60/60 × 172), 0 short |
| roads | **14,100** (median 81, mean 82.0, min 53, max 124) |
| ramparts | **8,208** |
| containers / links / towers / labs / spawns | 688 / 688 / 1,032 / 1,720 / 516 |
| declarations / notes / noteRecords | 300 / 236 / 236 |
| road+rampart | **274 = 231 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified**, 153 rooms, median 2, max 5 |
| `roadKind` | 491 = 370 spur + 82 swampPave + 21 reflow + 11 alongCutMoved + 4 stitch + 3 conductBridge |
| tower clump (cheb≤2 of sitter) | `{0:12, 1:14, 2:53, 3:60, 4:30, 5:3}` |
| leaks / bare extractor-outside / shallow eco without rampart / ext without D4 road | **0 / 0 / 0 / 0** |
| `cutAtFreeze` | 7,246 tiles, **0 loose**, 0 seal-fail, 29 rooms ≠ shipped cut, 34 add + 46 remove, 27 adopt / 29 drift |
| validate | `pass 172/172 · fail 0 · declared-shortfall 122`, every physical total 0 |
| layer-7 roads outside wall | 3 |
| along-cut offers | 14 priced · 13 road-axis · 4 taken-parallel · **14/14** reproduce |
| along-cut refusals | **23 = 9 + 10 + 4** |
| noWalls detour | 16 of 57 negative · floor −9 (E9S9) |
| numeral-audit | 208 / 149 / 59 / 0 / 0, exit 0 |
| mutate | baseline 172/172 · **1262/1262** bite (doc still says 1258) |

Artifact md5 re-derived: `239f4e43331181cf4484d462003ff6b5`.

---

## What a closer has to do

1. Delete the mineralWhy fallback. The 3 rooms that disagree with `mineralSeatCensus` need a **named, derived** exception (which ring tiles the producer does not count as "ours", and why), or the producer has to count them the same way. `includes(suffix) && includes(seat)` is how eleven unread fields used to ship.
2. `renderSwapOfferBasis` face/sat from `minShellDmg` / `MIN_SAT` (or a board walk), never from a regex over the sentence.
3. Either derive the MF6 presence names that are cheap (protectRadius, baseCut, hub walks, unblocked refill, spurred/swampPaved) or stop publishing them as evidence. A `why` string is not a gate.
4. Re-derive `battlementUnreachableTiles` from the flood + ring, or drop the field.
5. Bind `cutAdopted` to the `cutDrift` add rows (or delete the field). "Has a rampart" is not an adoption test.
6. 88 / 93 / 98 still need the unpublished boards. No validator-side tightening will close invent-on-a-missing-board.

Findings 1 and 2 are the round. A rendered channel whose second term is parsed from the first is the defect this campaign named in criticism 129, 132 and 138, shipped again beside the inventory that was supposed to make it impossible.
