# Round 36 owner-voice review

Hostile. Fresh. Re-derived from `plans-hub.json` + `_r28-mech/rooms.json` terrain. Did not trust meta, did not import `validate.mjs` for board facts, did not cherry-pick rooms. `checkRoom` used only on mutated clones. Fleet-median noise stripped. Docker off.

Artifact md5 `8e5d6725885bd3f3731379bedf408326` — matches the brief. Same bytes as r32–r35. Tree HEAD is `cc96b3f` (r29p14), matching the brief. 172/172 rooms, 0 errors. Fleet physicals re-summed off the structure lists: **10,320 extensions · 14,100 roads · 8,208 ramparts · 300 declarations · 236 notes**. Same numbers as r26–r35. Boards did not move. Baseline `checkRoom` (fleet-median stripped): **pass 172/172**.

**Verdict.** No board defect in the sample. No film-vs-board caption lie in the sample. 134(b) is still 34 adds / 27 rooms. r29p14 closes the *stated* leftover presence walks: `arrayPartner` / `rcl5Pair.picked` / `minDmgArray` / `battlementGap` / `battlementGapTiles` / `boundHeld` / `fillerTiles` / `shallowCost` / `shallowRefused` (and the twin `boundLap`) now **BITES** (fleet 172/172). The p13 three + stitch flag still **BITES**. The p12 five still **BITES**. The named 88 leak + `complete=false` still **BITES**. The named 98 one-list append still **BITES**. They do **not** close the classes. Twin of the named 98 append (also write `lane.reserved`, keep `wanted > tiles`) **ESCAPE**. `wanted += 1` **ESCAPE**. Sealing same-lap nudge `29,33→28,34` **ESCAPE**. Remaining META_DARK presence still flips 172/172 once `baseCut`+`shallowNow` are left alone. Exact pick and `seedScore` still unread. `cutPasses.rampartsDeleted` split still a log.

Throwaway probes: `tools/plan-suite/v2/_r36-owner/` (not committed).

---

## Sample

`h(room) = fmix32(fnv1a32("round36-owner|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|------|------|---|
| 1 | **E2S5** | 17,399,181 |
| 2 | **E17S5** | 40,724,437 |
| 3 | **E12S7** | 49,926,240 |
| 4 | **E2S2** | 63,857,729 |
| 5 | **E19S8** | 89,405,100 |

Also churn-read as required: **E11S1 E2S7 E1S4**. Eight unique rooms.

Terrain dump: 172 rooms, same world the suite used.

---

## 134(b) — 34 adds, 27 rooms. Still true.

Re-walked every `meta.shell.cutDrift` row. Did not read the doc's 27.

- **34 adds**, all `pass: layer7-reconcileSeal`. Zero `layer7b-reconcileSeal` adds.
- **46 removes**, all `pass: layer7-inertPrune`.
- **27 rooms adopt.** 29 rooms drift. Remove-only, still: **E15S1, E5S6**.
- Independent exterior flood: shipped **cut** reaches the sitter in exactly those two. Shipped **ramparts** reach the sitter in **0 of 172**. Freeze flood holds both.
- Independent single-removal seal test on the 34 add tiles: **34/34 fire**.
- `why` vs the producer's `(op, pass)` generator, compared whole: **0 mismatches** in 80 rows.
- Replay identity `cutAtFreeze + adds − removes == shipped cut`: **0 failures** in 172.

The 27 adopting rooms (same set as r28–r35):

`E13S3 E13S4 E13S5 E14S9 E15S4 E15S5 E16S2 E17S2 E17S5 E18S6 E18S8 E18S9 E19S8 E1S2 E1S6 E21S2 E21S8 E2S1 E2S5 E2S6 E3S6 E5S7 E6S3 E6S4 E6S5 E8S7 E9S8`

Three of this hash sample adopt: **E2S5**, **E17S5**, **E19S8**. E2S5 and E17S5 are net-zero-count (1+1). E19S8 is 3 removes / 1 add (freeze 54 → shipped 52).

**134(b) as a count is still closed.**

---

## Is the ruling's record as strong as a declaration?

The ruling's own words: *every leaf re-derived or bounded, every sentence generated.*

`cutDrift` rows (`x y op pass why`) still hold. Why-append BITES. Absorb-one-add-into-freeze BITES (minimality). That half is still a declaration.

`cutPasses` markers: r29p2 claimed leftover leaves were *derived*. Re-attacked.

| attack | result |
|--------|--------|
| `sealCritical += 999` | **BITES** |
| prune `ramparts := 0` | **BITES** |
| `kind` rewritten to `"reviewer"` | **BITES** |
| `cutDrift.why` append | BITES (control) |
| `sealCritical += 1` | **BITES** |
| `sealCritical := adds` | **BITES** |
| `sealCritical := rampN` | **BITES** |
| prune `ramparts += 8` | **BITES** |
| swap the two prune markers' `rampartsDeleted` (sum preserved) | **BITES** |
| swap `rampartsDeleted` **and** set last-prune `ramparts = shipped + new deleted` | **ESCAPE** |

The leftover is the **split**. `rampartsDeleted` per prune marker is free once the sum equals `inertPruned.size`, each marker stays `≥ removes`, and last-prune `ramparts` is rewritten to keep its identity. E11S6: swap the two deleted counts, fix last-prune `ramparts`, pass.

**Answer: closer, still no.** Two of the three decorative columns are integers. The split is still a log.

---

## Closed since r35 — re-probed

**r29p14 / nine leftover presence names (+ `boundLap`).** Mutated on rooms that ship them:

| attack | room | result |
|--------|------|--------|
| `arrayPartner → 1,1` | E11S1 (was 26,42 = towers[swapped?2:1]) | **BITES** |
| `rcl5Pair.picked → 1,1` | E11S1 (was 27,39 = towers[1]) | **BITES** |
| `minDmgArray := 0` | E11S1 (630 vs towers[0]+arrayPartner on freeze) | **BITES** |
| `battlementGap := 1` | E11S1 (0 vs pickBattlements uncovered 0) | **BITES** |
| `battlementGapTiles` plant `1,1` | E11S1 (empty vs pickBattlements `[]`) | **BITES** |
| `boundHeld` flip false | E11S2 (true, lap 1.5 inside lane.bounded 1.56) | **BITES** |
| `boundLap := 0` | E11S2 (1.5 vs as-built gated 1.5) | **BITES** |
| `fillerTiles := 1` | E11S1 (0 vs laidByKind.extFace 0) | **BITES** |
| `shallowCost := 0` | E2S3 (3 vs 1 lab at depth < 4 × 3) | **BITES** |
| `shallowRefused` cleared | E12S6 (6 vs six shipped shallow ext) | **BITES** |

Fleet forge of those ten: **fail 172/172** (`battlementGap` + `battlementGapTiles` + `arrayPartner` + `picked` + `minDmgArray` + `fillerTiles` on every room; `boundHeld` 164; `boundLap` 52; `shallowRefused` 3; `shallowCost` 1). The named close is done. `picked` is towers[1]. `arrayPartner` is towers[swapped ? 2 : 1]. `minDmgArray` is that pair's min on the freeze wall. `battlementGap` / `battlementGapTiles` are `pickBattlements` on the shipped cut (this fleet uncovers 0). `boundHeld` / `boundLap` are the as-built gated lap against `lane.bounded`. `fillerTiles` is `laidByKind.extFace` (this fleet ships 0). `shallowCost` is shallow-lab count × 3. `shallowRefused` is the shipped shallow-extension roster.

The old `boundHeld := 0` path that wrote a numeric `walls.boundHeld` is still a no-op. That is not the leaf. The boolean at `walls.mobility.boundHeld` now fails.

**r29p13 / mineralContainer · minDmgPicked · servedFree · stitched flag.** Still BITES.

| attack | room | result |
|--------|------|--------|
| `mineralContainer := 0` | E11S1 (1 vs 1 cheb-1 container) | **BITES** |
| `minDmgPicked := 0` | E11S1 (720 vs towers[0]+[1] on freeze) | **BITES** |
| `servedFree := 0` | E11S1 (4 vs 4 already-served cut clusters) | **BITES** |
| `stitched := 2` | E11S9 (laid.stitch=1, flag=1) | **BITES** |
| `stitched := 0` | E11S9 | **BITES** |
| `stitched := 2` | E8S4 (laid.stitch=2, flag=1) | **BITES** |

Fleet flatten of the three: **fail 172/172** (`mineralContainer` 172, `minDmgPicked` 172, `servedFree` 171). Fleet `stitched := 2`: **fail 172/172**.

**r29p12 / five leftover presence names.** Still BITES.

| attack | room | result |
|--------|------|--------|
| `stitched := 0` | E11S9 (1 vs laid 1) | **BITES** |
| `stitchTiles := 0` | E11S9 (1 vs laid 1) | **BITES** |
| `roadsEaten := 0` | E9S2 (3 lab-road-eat tiles) | **BITES** |
| `towerOnly := 0` | E11S1 (0 vs fullest 5×5 = 7) | **BITES** |
| `stubRoads := 0` | E11S1 (0 vs 39 layer-6 `roadLayer` tags) | **BITES** |

Fleet flatten of those five: **fail 172/172** (`towerOnly` + `stubRoads` on every room; `stitched`/`stitchTiles` on 5; `roadsEaten` on 1).

**r29p11 / 88 leak skip.** E11S2 last fat has `20,9` and is complete. Nudge `20,9→19,9` (sitter leaks, lap 0) **BITES**. Same nudge **and** `complete=false` + regen **BITES** — first fail is `leaks the sitter` (`complete or not`). Fleet: **0** incomplete discarded rungs, **0** of 327 complete discarded cuts leak the sitter.

**93 recovers.** Taken-room `fixedHolders` ship `{type, x, y}` only. Rooms that publish holders, **0** publish `recovers` / `recoversDeep`. Invent holder `{lab,1,1,99/99}` **BITES**. Plant `recovers=2` / `recoversDeep=2` on E15S6's four labs + note twin **BITES**.

**98 named forges.** Extra reserved `99,99` / `1,1` / `0,0` + fake-round **BITES**. Invent-shrink on a free walk **BITES**. Delete `fullRun` **BITES**. 60/0 `shallow` rewrite **BITES**. Dropped-room `99,99` **BITES**. `wanted := tiles` **BITES**.

**98 r29p10 as written.** E11S1 append `"19,27"` to `fullRun.reserved` only, `tiles`/`wanted` synced to 7. **BITES** (`wanted > tiles` and/or reserved ≠ lane.reserved). This is the named close. It is not the class. See M1.

**88 r29p7 / r29p8 / r29p10 leak.** Fatter mobility `2.5 → 0.5` + regen **BITES**. Last-fat shipped-cut + `ramparts:=cutlen` **BITES**. 8-tile box, lap 0, keep ramparts=50 **BITES**. Leaky nudge `20,9→19,9` (sitter leaks, `complete` stays true) **BITES**.

**r29p9.** `nukerInWindow` flip **BITES**. `nukeWindow.center → 1,1` **BITES**. `mineralSeatNetTiles = ["1,1"]` **BITES**. `coveredDetourDeclared` flip **BITES**.

---

## Per-room (enclosure, cut, shallow, mineral, film, page)

Method, every room: exterior flood over `cut`, over `cutAtFreeze`, over shipped ramparts (own D8 flood, not `shared.mjs`); depth from that flood; mineral seat = the container chebyshev ≤ 1 of the mineral; film rampart captions classified from the board (cut → container+outside/inside+depth against the freeze flood → standDenial → other occupant → unclassified) and compared to every `stage:"ramparts"` cell; page counts / notes / shortfalls read out of the HTML.

**No sampled room leaks the sitter or any spawn/storage/terminal/tower/nuker/lab/extension through the shipped wall.** Freeze-flood holds all 8. Live-wall holds all 8. Cut-flood leaks the sitter only on the two known remove-only rooms (E15S1, E5S6), neither in this sample. The 166 `leaksCut` core tiles in the fleet census are exactly those two rooms' entire cores. Live wall holds both.

**Film vs board rampart captions: 0 disagreements, 0 unpainted shipped ramparts, 0 extra painted tiles**, all 8 rooms.

**Shallow extensions** re-derived against live depth < 4:

| room | derived | published | ramparted |
|------|---------|-----------|-----------|
| E11S1 | 0 | 0 (note is a search note) | — |
| E2S5 | 0 | 0 (note is a search note) | — |
| other 6 | 0 | 0 | — |

**Mineral seat == `meta.mineralSeat` == the shipped container** in all 8. Approach is a walkable D8 neighbour in all 8. Fleet mineral-why vs official census: **172/172 exact**.

**Lab diamond:** 10 labs, 4×4 bbox, 6 holes in all 8. Mandated stamp. Haul cheb 2–5. E11S1 haul 5, E2S2 haul 4, E2S5 / E12S7 / E19S8 / E2S7 / E1S4 haul 3, E17S5 haul 2.

**Hub trio:** storage + terminal + hub-link all cheb ≤ 1 of the sitter in all 8. Spawns fanned (min pairwise cheb ≥ 2).

Road+rampart taxonomy, independent walk: **274 = 231 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified**, 153 rooms, median 2, max 5.

### Hash five

**E2S5.** 28-cut, 33 ramparts, 77 roads, 60/60. Adopter (in the 27): freeze 28 → shipped 28, remove `23,43` / add `22,42`. Dropped reservation: `fullRun.reserved` 6 tiles, `lane.reserved` empty. Mobility **1.92** declared (page and film agree). Controller enclosed. Mineral `28,22` **on** the network (seat `27,23`). Seed=hub `29,31`. **3 2×2** on a road spine. 0 D4-blind. 0 remaining redundant (one already pruned). Labs haul 3. Film: 28 crossing / 2 seat.inside / 1 seat.outside / 2 cover. Fat last rungs `3.83/50/47` against shipped `1.92/33/28`. Hash #1 is an adopter, a drop, and a fat discarded cut. All three residues sit on one board.

**E17S5.** 59-cut, 61 ramparts, 82 roads. Adopter (in the 27): freeze 59 → shipped 59, remove `44,36` / add `43,35`. `baseCut=59` = freeze = cut. `protectRadius=10`. Mobility **4.4** declared. Controller enclosed. Mineral `41,17` **on** the network (seat `40,18`). Seed=hub `32,25`. 0 2×2. 0 remaining redundant (one already pruned). Unmanned cut tile `43,35` (link on the wall) + unreachable battlement, both declared. Thin upgrader seat declared. Labs haul 2. Film: 59 crossing / 1 cover / 1 seat.outside. Fat last rungs `7.33/62/59` against shipped `4.4/61/59`. The 59-tile wall and the 4.4 lap are the ugliness the room names.

**E12S7.** 35-cut, 45 ramparts, 116 roads. `baseCut=32 ≠ 35`. `protectRadius=11`. Mobility 0. Controller unenclosed. Mineral `26,32` off-network, declared (seat `25,32`). Seed=hub `22,36`. **5 redundant** cut tiles re-derived and explained (load-bearing on interior floor `22,20` / `22,21`). Weak-battery 10-step / 1980 declared. Eco source-path tax 64 (gate 52), declared. Labs variant `anti`, haul 3. 0 2×2. 0 D4-blind. Film: 35 crossing / 3 cover / 1 seat.inside / 2 seat.outside / 4 ring. Roads are the basin tax, and the room says so. The pick is 32 against a shipped 35.

**E2S2.** 15-cut, 20 ramparts, 76 roads. `baseCut=15` = freeze = cut. `protectRadius=10`. Mobility 0. Controller enclosed. Mineral `26,9` off-network north, declared (seat `25,8`). Seed `30,31` ≠ hub `28,31`. 0 2×2. 0 redundant. 0 D4-blind. Labs haul 4. Film: 15 crossing / 3 seat.outside / 2 cover. Compact pocket. Quiet board, unread seed score.

**E19S8.** 52-cut, 59 ramparts, 72 roads. Adopter (in the 27): freeze 54 → shipped 52, remove `33,36 34,36 35,34` / add `34,35`. `baseCut=54` = freeze ≠ cut 52. `protectRadius=8`. Mobility **2.67** declared. Controller unenclosed. Mineral `40,44` far SE off-network, declared (seat `39,45`). Seed=hub `25,26`. **3 remaining redundant** (personal cover / walk-region / stand-denial), explained. Unmanned cut tile `34,35` (link) + unreachable battlement, both declared. Covered-detour declared. 0 2×2. Labs haul 3. Film: 52 crossing / 2 seat.outside / 2 cover / 3 ring. Fat last rungs `3.67/83/80` against shipped `2.67/59/52`. The pick is the freeze, not the shipped cut. The last discarded enclosure is a free 80-tile neighbour of the 52.

### Mandated churn

**E11S1.** 32-cut, 43 ramparts, 101 roads. Real shrink: `fullRun.reserved` === `lane.reserved` === 6 tiles / 2 rounds. `wanted=7`, `used=3`, `ext=60`, `shallow=3`. Suffix COORD list is gone. Seed `25,39` ≠ hub `24,41`. Controller unenclosed. Mineral `23,7` off-network, declared (seat `24,8`). Eco 27-tile controller walk, declared. 3 2×2 on a road spine. 0 D4-blind. Labs haul 5. Film: 32 crossing / 4 seat.outside / 3 cover / 4 ring. Reserved board: `18,27 19,28 19,29 | 24,28 25,27 25,29`. `19,27` is D8 of `18,27` and `19,28` and is not in the set. The 98 residue room, mandated.

**E2S7** (golden). 18-cut, 21 ramparts, 72 roads. Clean pocket. 0 redundant. Mineral `33,4` off-network. Quiet.

**E1S4** (golden). 26-cut, 34 ramparts, 63 roads. `baseCut=24 ≠ 26`. West corridor of extensions, long south road to the controller, mineral far SW off-network. 0 sealed. Quiet, intentional.

---

## Visual / intent

No sampled room is a checkerboard, a solid brick, or a maze. Extension mass is corridor-flanked (**0 D4-blind extensions in all 8**). 2×2 squares exist in E2S5 (3) and E11S1 (3) and they sit on a road spine. E2S5 / E17S5 / E19S8 spend a named lap. E12S7 / E11S1 spend roads on eco, not on a city grid. Towers are not a hub clump (sample clumps 1–4).

Nothing in the sample looks accidental. The ugly rooms are ugly for a named, declared reason (E17S5 lap 4.4 + 59-tile wall + unmanned link, E19S8 lap 2.67 + covered-detour + unmanned link, E2S5 lap 1.92, E12S7 116-road eco + 5 explained redundant, E11S1 27-tile controller walk) — except the unread pick on E12S7 (`baseCut=32` against a 35-cut) / E19S8 (`baseCut=54` against a 52-cut) / E1S4 (`baseCut=24` against a 26-cut) and the unread last fats, which the rooms do not price as compositions.

---

## Findings

### M1 — MAJOR, not board-affecting

**Criticism 98 residue — reserved is still a free set of floor-touching tiles. The named append BITES. The class ESCAPE.**

**Exploit.** E11S1 after r29p10/p11/p12/p13/p14: `fullRun.reserved` === `lane.reserved` === 6 tiles / 2 rounds. `wanted=7`. The refused tail is a count.

| attack | result |
|--------|--------|
| append `"19,27"` to `fullRun.reserved` only, `tiles`/`wanted` := 7 (r31 as written) | **BITES** |
| named forges `99,99` / `1,1` / `0,0` / invent-shrink / 60/0 / delete board | **BITES** |
| `wanted := tiles` | **BITES** |
| append `"19,27"` to **both** reserved lists, last round, `tiles=7`, `wanted=8` | **ESCAPE** |
| prefix identity-swap `18,27 → 19,27` on both lists + `byRound` | **ESCAPE** |
| `wanted += 1` / `wanted += 999` | **ESCAPE** |
| `premium += 1` / `fullRun.ext += 1` / `fullRun.shallow += 1` / `fullRun.used += 1` | **ESCAPE** |

r29p14 did not touch this. A tile that *is* this room's floor and *touches* the walk can still be added, or swapped for a kept prefix tile, if both lists stay twins. The refused walk is now four unread integers (`wanted`, `used`, `ext`, `shallow`) plus `premium`. E2S5 in this hash sample is a drop: 6 reserved tiles, empty `lane.reserved`. Same class, different shape.

**Root cause.** A shrink is a prefix test plus a twin-list bind. The prefix is not required to be the greedy's tiles. The refused extra is a count, not a hashed walk.

**Board moved?** No.

### M2 — MAJOR, not board-affecting

**Criticism 88 residue — a discarded cut that leaks now BITES even if `complete=false`. A sealing same-lap neighbour still ESCAPE.**

**Exploit.** E11S2 rungs: `1.56/46/37 ×3`, then `2.5/50/42` (last, eco-capped). Shipped wall 46/37 = freeze, shipped lap 1.56.

| attack | result |
|--------|--------|
| fatter mobility `2.5 → 0.5` + regen | **BITES** |
| last-fat shipped-cut + `ramparts:=cutlen` (r29p7) | **BITES** |
| 8-tile box, lap 0, keep ramparts=50 (r29p8) | **BITES** |
| nudge `20,9 → 19,9` (sitter leaks, `complete` stays true) | **BITES** |
| nudge `20,9 → 19,9` **and** `complete=false` + regen | **BITES** (r29p11) |
| `complete=false` alone on the sealing last fat + regen | **ESCAPE** |
| nudge `29,33 → 28,34` (still seals, lap stays 2.5, 42 tiles) | **ESCAPE** |

`discardedCutSeals` no longer trusts `row.complete`. A leak bites either way. That is the named close. A 42-tile nudged cut that *does* seal is longer than the shipped 37, so the would-have-taken rule returns before it looks. Any other 42-tile COORD list that walks the claimed lap and seals passes. Flipping `complete` on a sealing rung is free. This sample has three more last fats of the same class (E2S5 `3.83/50/47`, E17S5 `7.33/62/59`, E19S8 `3.67/83/80`).

**Root cause.** Discarded `cutTiles` are a free list held to `enclosureMobility` of themselves, plus "not freeze/shipped", plus "not shorter-and-prettier", plus "seals". The composed enclosure is not on the board. r29p11 gated leaks on the flood, not the flag. It did not bind the list. r29p14 did not touch this.

**Board moved?** No.

### M3 leftover — MEDIUM, not board-affecting

**The ruling's record is still not held to the standard the ruling named, on one column.**

r29p2 derived `sealCritical` and `ramparts-before`. The old slack attacks all BITES. The per-pass `rampartsDeleted` split is still free once the sum and the last-prune identity are held.

Evidence: E11S6 swap the two prune markers' `rampartsDeleted` and set last-prune `ramparts = shipped + new deleted` → pass.

### M4 — MEDIUM, not board-affecting

**Remaining META_DARK `presence` names still flip flattering. 172/172 once `baseCut`+`shallowNow` are left alone.**

**Exploit.** Zeroed every remaining `klass:"presence"` numeric/bool/array leaf across all 172 rooms. 58 presence names, 41 derived (r35 was 68 / 31). 33 kinds, 3,401 events. `checkRoom`: **fail 172/172**, every first fail is `baseCut := 0`. Exclude `baseCut` and `shallowNow`: **pass 172/172**. 31 kinds, 3,226 events, silent.

Single-room ESCAPE, flattering direction: `corridorPlaced`, `deepBudget` decrement-keep-nonzero / cleared. `spurred` decrement 5→4 still ESCAPE — and `spurred` is classified `derived`.

r29p3 / r29p9 / r29p12 / r29p13 / r29p14 derived names still BITES. The class is still the class. `protectRadius` is *classified* `derived` and is only an enum.

**Root cause.** Criticism 141(c). The cheap walks they named are derived. The rest are still comments.

**Board moved?** No.

### M5 — MEDIUM, not board-affecting

**Exact `baseCut` / `protectRadius` pick is unread. `seedScore` is free.**

`protectRadius := 0` **BITES** (not in `RADII_WIDE`). `12 → 6` inside the enum **ESCAPE**. `baseCut := 0` **BITES**. `baseCut += 1` keeping `priceyWall` on the same side of `MAX_CUT=45` **ESCAPE**. `seedScore := 0` **ESCAPE**. `seedScore += 999` **ESCAPE**.

Sample: E2S5 `baseCut=28` = cut. E17S5 `baseCut=59` = cut. E12S7 `baseCut=32` / freeze=35 / cut=35. E2S2 `baseCut=15` = cut. E19S8 `baseCut=54` / freeze=54 / cut=52. E1S4 `baseCut=24` / cut=26. The pick is not freeze and not the shipped cut. `protectRadius` is an enum, not this room's pick. `seedScore` is a finite number, not the confluence walk. 46 rooms still have seed ≠ hub. The coordinates exist. The score does not.

### Named residues, re-probed, not re-filed as new

- **134(a)** still a fleet property. Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**. Absorb-one-add-into-freeze on E13S3 **BITES**. A room that shipped a redundant frozen cut tile would still let a forger shrink the anchor. This fleet does not ship one.
- **134(c)** sandwich holds; `ec[1].withheld += 1` + junk tile **BITES**; `ec[2]` zeroed **BITES**. The named hole (empirical identity, no published contract for a future layer) is unchanged.
- **134(d)** still a contract. Independent road+rampart walk: **274 = 231 + 30 + 13 + 0 + 0**. Agreement with a restated order.
- **cutAdopted** plant real add **BITES**. Plant first rampart **BITES**. The list is layer7b-reconcileSeal adds, which are none. Closed.
- **spurred** decrement keep-nonzero **ESCAPE**. Still a boolean-of-zero, now wearing a `derived` badge.

---

## What this is not

- Not a board fail. 60/60, sealed live wall, D4-faced extensions, mandated stamps placed, mineral seats reachable, film taxonomy vs board 0/8.
- Not a 134(b) count fail. 34 adds, 27 rooms, E15S1 and E5S6 remove-only, both cuts leak, both live walls hold.
- Not a 93 leftover. The pre-take number is gone; planting it back bites.
- Not an L1 jam. Not a film/page disagreement on the sample.
- Not an anti-pattern auto-fail. No maze, no brick, no road-on-every-rampart, no silent cap in the sample.
- Not the old 98 COORD-bag forge. Off-board `99,99` / `1,1` / `0,0` and a fake empty round are dead. The *as-written* r31 append (one list, `wanted:=tiles`) is dead.
- Not the old 88 swap-with-freeze, not the last-rung unweighed, not the 8-tile box keep-ramparts, not a discarded cut that leaks the sitter — complete or not.
- Not the r33 leftover on `stitched` / `stitchTiles` / `roadsEaten` / `towerOnly` / `stubRoads`. Zeroing those five still fails.
- Not the r34 leftover on `mineralContainer` / `minDmgPicked` / `servedFree`, and not the p12 stitch polarity hole (`stitched := 2` used to pass). Those four now fail.
- Not the r35 leftover on `arrayPartner` / `rcl5Pair.picked` / `minDmgArray` / `battlementGap` / `battlementGapTiles` / `boundHeld` / `fillerTiles` / `shallowCost` / `shallowRefused`. Moving, zeroing, flipping, or planting those now fails.

---

## What is still a door vs what is actually closed this artifact

**Closed this artifact (do not re-file):**
- 93 recovers on taken `fixedHolders`
- 98 invent-shrink on a free walk / forge without a reserved board / 60/0 shallow rewrite / off-board COORD extras
- 98 append to `fullRun.reserved` *without* keeping `lane.reserved` and `wanted > tiles` in sync
- 88 fatter-mobility + regen / shipped-cut + `ramparts:=cutlen` / 8-tile box keep-ramparts
- 88 discarded cut that leaks the sitter, **including** `complete=false`
- r29p9 `nukerInWindow`, `nukeWindow.center`, `mineralSeatNetTiles`, `coveredDetourDeclared`
- r29p12 `stitched` polarity, `stitchTiles`, `roadsEaten`, `towerOnly`, `stubRoads`
- r29p13 `mineralContainer`, `minDmgPicked`, `servedFree`
- r29p13 `stitched` exact 0/1 flag (`:= 2` fails even when laid ≥ 2)
- r29p14 `arrayPartner`, `rcl5Pair.picked`, `minDmgArray`, `battlementGap`, `battlementGapTiles`, `boundHeld`, `boundLap`, `fillerTiles`, `shallowCost`, `shallowRefused`
- `cutAdopted ===` layer7b adds
- `cutPasses.sealCritical` (single-removal)
- `cutPasses` last-prune `ramparts-before`

**Still a door:**
- 98 kept prefix is any floor-touching twin of `lane.reserved` (E11S1 extra `19,27` on both lists; identity-swap `18,27→19,27`)
- 98 refused walk is unread numbers (`wanted`, `used`, `ext`, `shallow`, `premium`) once `wanted > tiles`
- 88 any discarded cut that is not freeze, not shorter-and-prettier than shipped, and seals (including a one-tile neighbour of the last fat cut)
- `cutPasses.rampartsDeleted` split
- Remaining META_DARK presence (58 names, 172/172 silent once `baseCut` is left alone)
- Exact `baseCut` / `protectRadius` pick
- `seedScore`
- 134(a) as a theorem, 134(c) contract, 134(d) as a derivation, `spurred` as a count

---

## Bottom line

Boards are clean. The gallery in the sample is readable and matches the tiles. 134(b) as a **number** stays done. 93, the *stated* 98 one-list append, the *stated* 88 leak-on-complete **and** leak-on-incomplete, the four r29p9 presence names, the five r29p12 presence names, the four r29p13 walks (`mineralContainer` / `minDmgPicked` / `servedFree` / `stitched` flag), and the nine r29p14 walks (`arrayPartner` / `picked` / `minDmgArray` / `battlementGap` / `battlementGapTiles` / `boundHeld` / `fillerTiles` / `shallowCost` / `shallowRefused`) are done. The 98 class is not done: reserved is still a free set and the refused walk is still a count. The 88 class is not done: a sealing same-lap neighbour still passes. Plus the presence class, plus the exact pick, plus `seedScore`, plus one `cutPasses` column.

I would **not** stand down for a clean round. A clean round is zero findings. If the next pass binds `fullRun.reserved` / `lane.reserved` to the greedy (or hashes it), binds `wanted`/`used`/`ext`/`shallow` to that walk, and binds discarded `cutTiles` to the composed enclosure (or stops publishing them), this reviewer has nothing new from those two — only the residues already on the list.
