# Round 30 owner-voice review

Hostile. Fresh. Re-derived from `plans-hub.json` + `_r28-mech/rooms.json` terrain. Did not trust meta, did not import `validate.mjs` for board facts, did not cherry-pick rooms. `checkRoom` used only on mutated clones.

Artifact md5 `7eed9e2c02f0641ec4fc80b4c8a0b496` — matches the brief. 172/172 rooms, 0 errors. Fleet physicals re-summed off the structure lists: **10,320 extensions · 14,100 roads · 8,208 ramparts · 300 declarations · 236 notes**. Same numbers as r26–r29. Boards did not move.

**Verdict.** No board defect in the sample. No film-vs-board caption lie in the sample. 134(b) is still 34 adds / 27 rooms. 93 is **closed** (taken `fixedHolders` dropped `recovers`; planting it back BITES). 141(e) seed is **closed** (tile is on the artifact; moving it BITES the film caption). `cutPasses.sealCritical` and last-prune `ramparts-before` are **closed**. The named 98 forge is **closed**. The named 98 *residue* is **not**: invent extra `fullRun.reserved` tiles that still prefix-match **ESCAPE**. 88 swap-with-freeze is **closed**. 88 invent a discarded cut that walks a prettier lap (8-tile box, lap 0, regen) **ESCAPE**. Remaining META_DARK presence still flips 172/172 once `baseCut` is left alone. Exact pick and `seedScore` still unread.

Throwaway probes: `tools/plan-suite/v2/_r30-owner/` (not committed).

---

## Sample

`h(room) = fmix32(fnv1a32("round30-owner|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|------|------|---|
| 1 | **E13S5** | 27,838,235 |
| 2 | **E15S2** | 50,591,017 |
| 3 | **E11S9** | 81,208,677 |
| 4 | **E3S4** | 185,439,022 |
| 5 | **E6S5** | 190,236,863 |

Also churn-read as required: **E12S1 E15S4 E11S1 E12S7 E12S6 E7S5 E9S2** and golden **E2S7 E1S4**.

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

The 27 adopting rooms (same set as r28/r29):

`E13S3 E13S4 E13S5 E14S9 E15S4 E15S5 E16S2 E17S2 E17S5 E18S6 E18S8 E18S9 E19S8 E1S2 E1S6 E21S2 E21S8 E2S1 E2S5 E2S6 E3S6 E5S7 E6S3 E6S4 E6S5 E8S7 E9S8`

E13S5 (in this hash sample) is a net-zero-count adopter: freeze 21, shipped 21, two removes (`6,13 6,14`) and two adds (`7,12 7,13`). Different tiles. E6S5 (also hashed) is the same class: one remove `23,5`, one add `22,6`.

**134(b) as a count is still closed.**

---

## Is the ruling's record as strong as a declaration?

The ruling's own words: *every leaf re-derived or bounded, every sentence generated.*

`cutDrift` rows (`x y op pass why`) still hold. Why-append BITES. Absorb-one-add-into-freeze BITES (minimality). That half is still a declaration.

`cutPasses` markers: r29p2 claimed the three leftover leaves were *derived*. Re-attacked.

| attack | result |
|--------|--------|
| `sealCritical += 999` | **BITES** |
| prune `ramparts := 0` | **BITES** |
| `kind` rewritten to `"reviewer"` | **BITES** |
| `cutDrift.why` append | BITES (control) |
| `sealCritical += 1` | **BITES** (single-removal on that invocation's ramparts) |
| `sealCritical := adds` | **BITES** |
| `sealCritical := rampN` | **BITES** |
| prune `ramparts += 8` | **BITES** |
| swap the two prune markers' `rampartsDeleted` (sum preserved) | **BITES** (last-prune identity) |
| swap `rampartsDeleted` **and** set last-prune `ramparts = shipped + new deleted` | **ESCAPE** |

`sealCritical` is the single-removal count. Last-prune `ramparts-before` is shipped + its own deletions. First-prune `ramparts-before` reconstructs. The naive swap dies because last-prune `ramparts` no longer matches.

The leftover is the **split**. `rampartsDeleted` per prune marker is free once the sum equals `inertPruned.size`, each marker stays `≥ removes`, and last-prune `ramparts` is rewritten to keep its identity. E11S6: swap the two deleted counts, fix last-prune `ramparts`, pass.

A declaration census would have classed the per-pass deleted set, not the sum. "Derived" is what the ledger wrote for `sealCritical` and `ramparts-before`. It is true of those two. It is not true of the third column.

**Answer: closer, still no.** Two of the three decorative columns are now integers. The split is still a log.

---

## 93 — taken-room `recovers`. Closed.

Taken-room `sealedRecovery.fixedHolders` now ship `{type, x, y}` only. Fleet: 12 taken rooms, **0** publish `recovers` / `recoversDeep` on that list.

| attack | result |
|--------|--------|
| invent holder `{lab,1,1,99/99}` | **BITES** |
| plant `recovers=2` / `recoversDeep=2` on the four E15S6 labs + note twin | **BITES** ("a log of a board that left") |
| inflate `sealedFloor.pockets[].holders.recovers` + regen | **BITES** (current-board flood) |
| inflate `offered[].recoversDeep` + twins | **BITES** (refusal twin) |
| invent holder on a `sealedFloor` pocket | **BITES** |

The r29 exploit (inflate existing `recovers` inside `[1, cap]` + regen the note) has no number left to inflate. Planting the number back is rejected. Do not re-file.

---

## 141(e) seed. Half-closed.

`plan.seed` is present in **172/172**. Film/page `NOTES.seed` is generated from it. Moving the seed BITES. `seedPool` halved BITES.

`seedScore := 0` **ESCAPE**. `seedScore += 999` **ESCAPE**. Why that seed won is still a free finite number. Already filed as the leftover of 141(e).

`seedSkip := 0` (meta only, or meta+runtime+eco) **BITES** on E12S5. The twin door is shut.

46 rooms still have seed ≠ hub. The coordinates exist. The score does not.

---

## Per-room (enclosure, cut, shallow, mineral, film, page)

Method, every room: exterior flood over `cut`, over `cutAtFreeze`, over shipped ramparts (own D8 flood, not `shared.mjs`); depth from that flood; mineral seat = the container chebyshev ≤ 1 of the mineral; film rampart captions classified from the board (cut → container+outside/inside+depth → standDenial → other occupant → unclassified) and compared to every `stage:"ramparts"` cell; page counts / notes / shortfalls read out of the HTML.

**No sampled room leaks the sitter or any spawn/storage/terminal/tower/nuker/lab/extension through the shipped wall.** Freeze-flood holds all 14. Live-wall holds all 14. Cut-flood leaks the sitter only on the two known remove-only rooms (E15S1, E5S6), neither in this sample.

**Film vs board rampart captions: 0 disagreements, 0 unpainted shipped ramparts, 0 extra painted tiles**, all 14 rooms.

**Shallow extensions** re-derived against live depth < 4:

| room | derived | published | ramparted |
|------|---------|-----------|-----------|
| E12S6 | 6 | 6 | 6/6 |
| E9S2 | 15 | 15 | 15/15 |
| E11S1 | 0 | 0 (note is a search note) | — |
| E15S2 | 0 | 0 (shallowExt note, 0 remain) | — |
| other 10 | 0 | 0 | — |

**Mineral seat == `meta.mineralSeat` == the shipped container** in all 14. Approach is a walkable D8 neighbour in all 14. Fleet mineral-why vs official census: **172/172 exact**.

**Lab diamond:** 10 labs, 4×4 bbox, 6 holes in all 14. Mandated stamp. Haul cheb 2–5 except **E15S2 haul 7** (undeclared; E9S9 at the same cheb *is* declared `labs/lab-haul` — different metric, walk vs cheb, so this is a visual note not a silent shortfall). E9S2 declares `labs/lab-road-eat` for 3 displaced road tiles.

**Hub trio:** storage + terminal + hub-link all cheb ≤ 1 of the sitter in all 14. Spawns fanned (min pairwise cheb ≥ 2).

Road+rampart taxonomy, independent walk: **274 = 231 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified**, 153 rooms, median 2, max 5.

### Hash five

**E13S5.** 21-cut, 22 ramparts, 83 roads, 60/60. Compact pocket at sitter `18,22`, seed=hub `18,23`. Labs haul 3. Controller enclosed south. 0 road+rampart. Net-zero-count adoption (2+2). 1 unreachable battlement at `7,13` (link on the cut), declared. 0 sealed leftover. 0 2×2. Film: 21 crossing / 1 seat.outside. Quiet, intentional.

**E15S2.** 18-cut, 30 ramparts, 91 roads. Hub `17,21`, seed `17,23`. Controller unenclosed NE. Mineral `23,38` off-network south, bubbled. Labs sit a corridor west (cheb 7). 1 2×2 on a spine. 2 road+rampart, both on the cut. Film: 18 crossing / 3 cover / 1 seat.inside / 5 ring / 3 seat.outside. Only `misc/off-network` declared. The far diamond is the ugliness; the room does not price a walk.

**E11S9.** 9-cut, 16 ramparts, 104 roads. Tiny shell, long eco. `baseCut=7 ≠ 9`. Seed `18,37` ≠ hub `17,35`. Spawn fan 53° vs 60°, declared. Weak-battery 1560, declared. Eco 22-tile controller walk, declared. Towers not a hub clump (0). 1 2×2. Film: 9 crossing / 3 cover / 3 seat.outside / 1 seat.inside. The roads are the price of the basin, and the room says so.

**E3S4.** 23-cut, 27 ramparts, 79 roads. Mobility **2.83** declared (page and film agree). Controller enclosed. Mineral `31,7` off-network. 0 sealed. 0 redundant. Core is tight; the cost is the lap, and the room says so. Same room r28 hashed. Still ugly for a named reason.

**E6S5.** 36-cut, 38 ramparts, 75 roads. Net-zero-count adoption (1+1). `baseCut=34 ≠ 36`. 0 road+rampart. Towers not clumped. Mineral `25,24` off-network. Only `misc` declared. Wall following the terrain, not a stamp.

### Mandated churn

**E12S1.** Criticism 129's smoking-gun room. Film: 37 crossing / 2 seat.outside / 1 seat.inside / 5 ring / 1 cover. Independent classifier agrees tile for tile. Page 46 ramparts · 91 roads match the lists. Eco 21-tile controller walk, declared.

**E15S4.** 29-cut, all 29 singly load-bearing. Adopter (in the 27); net count freeze=shipped because it also prunes. Weak-battery / spawn-fan declared. Mineral `23,6` off-network, deep inside, no bubble owed.

**E11S1.** 32-cut, 43 ramparts, 101 roads. Real shrink (`fullRun.ran`, reserved 7 → lane 6). Shallow note: 0 remain. Sealed not recovered, declared. Eco 27-tile controller walk, declared. 3 2×2 on a road spine. 0 D4-blind. Seed `25,39` ≠ hub `24,41`.

**E12S7.** 35-cut, 45 ramparts, 116 roads. 5 redundant cut tiles re-derived: `22,19 23,19 23,20 23,21 23,22` — the note's 5. Mineral off-network, declared. Weak-battery 10-step declared. Roads are swamp eco, not a city grid.

**E12S6.** 33-cut, 48 ramparts, 124 roads. 6 shallow re-derived exact, all ramparted, declared. Mineral **on** the network. Weak-battery 9-step declared. 3 2×2 on a spine.

**E7S5.** 14-cut, 19 ramparts, 99 roads. Taken (3 fixed holders, no `recovers` published). Covered-detour declared. Long eco arms, small shell.

**E9S2.** 21-cut, 40 ramparts, 68 roads. 15 shallow re-derived exact. 7 redundant cut tiles re-derived: `22,25 22,26 31,2 35,2 36,2 42,24 47,24`. Lab-road-eat declared. `ctrlParks` 8→7 because `25,23` is an extension. Two 2×2 on a corridor.

**E2S7** (golden). 18-cut, 21 ramparts, 72 roads. Clean pocket. 0 redundant. Mineral `32,3` off-network. Quiet.

**E1S4** (golden). 26-cut, 34 ramparts, 63 roads. West corridor of extensions, long south road to the controller, mineral far SW off-network. 0 sealed. Quiet, intentional.

---

## Visual / intent

No sampled room is a checkerboard, a solid brick, or a maze. Extension mass is corridor-flanked (**0 D4-blind extensions in all 14**). 2×2 squares exist in E15S2 (1), E11S9 (1), E11S1 (3), E12S6 (3), E9S2 (2) and they sit on a road spine. E11S9 is a forced tiny shell with a 104-road eco tax. E3S4 is a forced lap. E12S7 / E7S5 / E11S1 / E11S9 spend roads on eco, not on a city grid. Towers are not a hub clump (sample clumps 0–4). E13S5 and E6S5 have no road-on-rampart at all.

Nothing in the sample looks accidental. The ugly rooms are ugly for a named, declared reason (E3S4 lap 2.83, E9S2 15 shallow, E11S9 fan 53° + 22-tile controller walk, E7S5 detour, E12S6 6 shallow). E15S2's far diamond is the one ugliness the room does not price.

---

## Findings

### M1 — MAJOR, not board-affecting

**Criticism 98 residue — invent extra reserved tiles that still prefix-match. ESCAPE.**

**Exploit.** E11S1 is a real shrink: `fullRun.reserved` 7 tiles / 3 rounds, `shrunk.to=2`, `lane.reserved` 6 tiles. Append `"0,0","0,1","49,49"` to `fullRun.reserved`, push them as a new `byRound` round, increment `tiles`/`rounds`/`used`/`shrunk.wanted`. Prefix of `byRound` still equals `lane.reserved`. `checkRoom` **ESCAPE**. Same if the extra tile is stuffed into an existing later round. Same on a dropped room (E12S5): invent extra tiles on the refused walk. Swap the *identity* of a later-round tile for `"0,0"` (keep counts) — **ESCAPE**.

The old forge (invent a costly `fullRun` then a consistent shrink, no reserved board) **BITES**. Deleting `fullRun` **BITES**. Invent-shrink on a free walk **BITES**. 60/0 `fullRun.shallow` rewrite **BITES**. Extra reserved on a *kept* room, with `to`/`used` desynced, **BITES**. The suffix of the reserved board is a free list of coordinates.

**Root cause.** A shrink is a prefix test. Tiles after `to` are required to exist, be unique, and flatten onto `reserved`. They are not required to be the greedy's tiles. r29p4 published the board and left the suffix unread.

**Board moved?** No.

### M2 — MAJOR, not board-affecting

**Criticism 88 residue — invent a discarded-rung cut that walks a prettier lap. ESCAPE.**

**Exploit.** E11S2 rungs: `1.56/46/37, 1.56/46/37, 1.56/46/37, 2.5/50/42`. Shipped wall 37/1.56. Setting rung-3 mobility `2.5 → 0.5` + regen **BITES** (`enclosureMobility` of its published cut is 2.5). Swap the fatter cut for `cutAtFreeze` and keep `ramparts=50` + regen **BITES** (fatter discarded cut is not the winner's cut).

Replace the fatter discarded cut with an 8-tile box around the sitter, set mobility to `enclosureMobility(box)=0`, regen the paragraph. **ESCAPE**. Lap 0 would have beaten the incumbent 1.56. The gate that did not fire is "this is the cut the producer composed" and also "the escalation would have taken this challenger".

**Root cause.** Discarded `cutTiles` are a free list held to `enclosureMobility` of themselves, plus a special-case "fatter + equals freeze" reject. Any other cut that walks the claimed lap passes. The composed enclosure is not on the board.

**Board moved?** No.

### M3 leftover — MEDIUM, not board-affecting

**The ruling's record is still not held to the standard the ruling named, on one column.**

r29p2 derived `sealCritical` and `ramparts-before`. The old slack attacks (`+= 1`, `:= adds`, `:= rampN`, `ramparts += 8`, naive swap) all BITES. The per-pass `rampartsDeleted` split is still free once the sum and the last-prune identity are held.

Evidence: E11S6 swap the two prune markers' `rampartsDeleted` and set last-prune `ramparts = shipped + new deleted` → pass. Controls (why-append, `+= 999`, `ramparts := 0`, kind rewrite, naive swap) bite.

### M4 — MEDIUM, not board-affecting

**Remaining META_DARK `presence` names still flip flattering. 172/172 once `baseCut` is left alone.**

**Exploit.** Zeroed every remaining `klass:"presence"` numeric/bool/array leaf except `baseCut` and `shallowNow` across all 172 rooms. 45 names, 4,343 events. `checkRoom`: **pass 172/172**. Including `baseCut := 0` fails the fleet on the floor (`baseCut < 1`) — that is not a derivation of the pick.

Single-room ESCAPE, flattering direction: `corridorPlaced`, `roadsEaten`, `mineralSeatNetTiles`, `nukerInWindow`, `stitched`, `stubRoads`, `deepBudget`, `boundHeld`, `towerOnly`, `spurred` decrement-keep-nonzero.

r29p3 derived `extractorOffNetwork`, `extractorSeatNetTiles`, `mobilityShippedFree`. Those three now BITES. The class is still the class. 80 presence names remain; 19 META_DARK names are `derived`. `protectRadius` is *classified* `derived` and is only an enum.

**Root cause.** Criticism 141(c). The cheap walks they named are derived. The rest are still comments.

**Board moved?** No.

### M5 — MEDIUM, not board-affecting

**Exact `baseCut` / `protectRadius` pick is unread. `seedScore` is free.**

`protectRadius := 0` **BITES** (not in `RADII_WIDE`). `12 → 6` inside the enum **ESCAPE**. `baseCut := 0` **BITES**. `baseCut += 1` keeping `priceyWall` on the same side of `MAX_CUT=45` **ESCAPE**. `seedScore := 0` **ESCAPE**. `seedScore += 999` **ESCAPE**.

Sample: E11S9 `baseCut=7` / freeze=9 / cut=9. E6S5 `baseCut=34` / freeze=36. The pick is not freeze and not the shipped cut. `protectRadius` is an enum, not this room's pick. `seedScore` is a finite number, not the confluence walk.

### Named residues, re-probed, not re-filed as new

- **134(a)** still a fleet property. Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**. Absorb-one-add-into-freeze on E13S3 **BITES**. A room that shipped a redundant frozen cut tile would still let a forger shrink the anchor. This fleet does not ship one.
- **134(c)** sandwich holds; `ec[1].withheld += 1` + junk tile **BITES**; `ec[2]` zeroed **BITES**. The named hole (empirical identity, no published contract for a future layer) is unchanged.
- **134(d)** still a contract. Independent road+rampart walk: **274 = 231 + 30 + 13 + 0 + 0**. Agreement with a restated order.
- **cutAdopted** plant real add **BITES**. Plant first rampart **BITES**. The list is layer7b-reconcileSeal adds, which are none. Closed.
- **spurred** decrement 5→4 (keep nonzero) **ESCAPE**. Still a boolean-of-zero.

---

## What this is not

- Not a board fail. 60/60, sealed live wall, D4-faced extensions, mandated stamps placed, mineral seats reachable, film taxonomy vs board 0/14.
- Not a 134(b) count fail. 34 adds, 27 rooms, E15S1 and E5S6 remove-only, both cuts leak, both live walls hold.
- Not a 93 leftover. The pre-take number is gone; planting it back bites.
- Not a 141(e) seed-dropped leftover. The tile is on the artifact; the film caption is generated from it.
- Not an L1 jam. Not a film/page disagreement on the sample.
- Not an anti-pattern auto-fail. No maze, no brick, no road-on-every-rampart, no silent cap in the sample.
- Not the old 98 forge. Internal consistency of a fake `fullRun` without a reserved board is dead. 60/0 cannot publish a costly walk.
- Not the old 88 swap-with-freeze.

---

## What is still a door vs what is actually closed this artifact

**Closed this artifact (do not re-file):**
- 93 recovers on taken `fixedHolders`
- 141(e) seed tile + film caption
- `cutAdopted ===` layer7b adds
- `cutPasses.sealCritical` (single-removal)
- `cutPasses` last-prune `ramparts-before`
- 98 invent-shrink on a free walk / forge without a reserved board / 60/0 shallow rewrite
- 88 fatter-mobility + regen / swap discarded cut with freeze
- r29p3 cheap META_DARK (`extractorOffNetwork`, `extractorSeatNetTiles`, `mobilityShippedFree`)

**Still a door:**
- 98 suffix of `fullRun.reserved` / later-round identity
- 88 any discarded cut that is not freeze and walks its own lap (including one that would have won)
- `cutPasses.rampartsDeleted` split
- Remaining META_DARK presence (45 names, 172/172 silent)
- Exact `baseCut` / `protectRadius` pick
- `seedScore`
- 134(a) as a theorem, 134(c) contract, 134(d) as a derivation, `spurred` as a count

---

## Bottom line

Boards are clean. The gallery in the sample is readable and matches the tiles. 134(b) as a **number** stays done. 93, seed-on-artifact, `cutAdopted`, `sealCritical`, last-prune `ramparts-before`, the *stated* 98 forge, and the *stated* 88 swap are done. The named 98 residue (extra reserved tiles that prefix-match) and the named 88 residue (invent a prettier discarded cut) are still open, plus the presence class, plus the exact pick, plus `seedScore`, plus one `cutPasses` column.

I would **not** stand down for a clean round. A clean round is zero findings. The reserved-board suffix and the discarded-rung free list are findings. If the next pass binds `fullRun.reserved` after `to` to the greedy (or hashes it) and binds discarded `cutTiles` to the composed enclosure (or stops publishing them), this reviewer has nothing new from those two — only the residues already on the list.
