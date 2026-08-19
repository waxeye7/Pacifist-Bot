# Round 32 owner-voice review

Hostile. Fresh. Re-derived from `plans-hub.json` + `_r28-mech/rooms.json` terrain. Did not trust meta, did not import `validate.mjs` for board facts, did not cherry-pick rooms. `checkRoom` used only on mutated clones. Fleet-median noise stripped.

Artifact md5 `8e5d6725885bd3f3731379bedf408326` — matches the brief. Tree HEAD is `f1b79ab` (speedrun docs after r29p10), not the brief's `425acbd`. Planner sources and this artifact are unchanged since `425acbd`. 172/172 rooms, 0 errors. Fleet physicals re-summed off the structure lists: **10,320 extensions · 14,100 roads · 8,208 ramparts · 300 declarations · 236 notes**. Same numbers as r26–r31. Boards did not move. Baseline `checkRoom` (fleet-median stripped): **pass 172/172**.

**Verdict.** No board defect in the sample. No film-vs-board caption lie in the sample. 134(b) is still 34 adds / 27 rooms. The *stated* r29p10 closes **BITES as written**: E11S1 append `"19,27"` to `fullRun.reserved` alone, and E11S2 leaky nudge `20,9→19,9` on a complete discarded cut. They do **not** close the class. Twin of the named 98 append (also write `lane.reserved`, keep `wanted > tiles`) **ESCAPE**. Prefix identity-swap `18,27→19,27` **ESCAPE**. `wanted += 1` **ESCAPE**. Sealing same-lap nudge `29,33→28,34` **ESCAPE**. Leaky nudge + `complete=false` + regen **ESCAPE**. Remaining META_DARK presence still flips 172/172 once `baseCut`+`shallowNow` are left alone. Exact pick and `seedScore` still unread. `cutPasses.rampartsDeleted` split still a log.

Throwaway probes: `tools/plan-suite/v2/_r32-owner/` (not committed).

---

## Sample

`h(room) = fmix32(fnv1a32("round32-owner|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|------|------|---|
| 1 | **E6S4** | 8,440,587 |
| 2 | **E3S8** | 12,309,198 |
| 3 | **E15S3** | 46,494,448 |
| 4 | **E5S2** | 107,887,546 |
| 5 | **E15S6** | 185,949,977 |

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

The 27 adopting rooms (same set as r28–r31):

`E13S3 E13S4 E13S5 E14S9 E15S4 E15S5 E16S2 E17S2 E17S5 E18S6 E18S8 E18S9 E19S8 E1S2 E1S6 E21S2 E21S8 E2S1 E2S5 E2S6 E3S6 E5S7 E6S3 E6S4 E6S5 E8S7 E9S8`

E6S4 (in this hash sample) is a net-zero-count adopter: freeze 14, shipped 14, one remove (`14,36`) and one add (`15,37`). E15S4 (churn) is the same class: one remove `37,7`, one add `36,8`.

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

## Closed since r31 — re-probed

**93 recovers.** Taken-room `fixedHolders` ship `{type, x, y}` only. Twelve taken rooms with holders, **0** publish `recovers` / `recoversDeep`. Invent holder `{lab,1,1,99/99}` **BITES**. Plant `recovers=2` / `recoversDeep=2` on E15S6's four labs + note twin **BITES**.

**98 named forges.** Extra reserved `99,99` / `1,1` / `0,0` + fake-round **BITES**. Invent-shrink on a free walk **BITES**. Delete `fullRun` **BITES**. 60/0 `shallow` rewrite **BITES**. Dropped-room `99,99` **BITES**. `wanted := tiles` **BITES**.

**98 r29p10 as written.** E11S1 append `"19,27"` to `fullRun.reserved` only, `tiles`/`wanted` synced to 7. **BITES** (`wanted > tiles` and/or reserved ≠ lane.reserved). This is the named close. It is not the class. See M1.

**88 r29p7 / r29p8 / r29p10 leak.** Fatter mobility `2.5 → 0.5` + regen **BITES**. Last-fat shipped-cut + `ramparts:=cutlen` **BITES**. 8-tile box, lap 0, keep ramparts=50 **BITES**. Leaky nudge `20,9→19,9` (sitter leaks, lap 0, `complete` stays true) **BITES** ("discarded cut leaks the sitter"). Honest fleet: **0** of 327 complete discarded cuts leak the sitter.

**r29p9.** `nukerInWindow` flip **BITES**. `nukeWindow.center → 1,1` **BITES**. `mineralSeatNetTiles = ["1,1"]` **BITES**. `coveredDetourDeclared` flip **BITES**.

---

## Per-room (enclosure, cut, shallow, mineral, film, page)

Method, every room: exterior flood over `cut`, over `cutAtFreeze`, over shipped ramparts (own D8 flood, not `shared.mjs`); depth from that flood; mineral seat = the container chebyshev ≤ 1 of the mineral; film rampart captions classified from the board (cut → container+outside/inside+depth against the freeze flood → standDenial → other occupant → unclassified) and compared to every `stage:"ramparts"` cell; page counts / notes / shortfalls read out of the HTML.

**No sampled room leaks the sitter or any spawn/storage/terminal/tower/nuker/lab/extension through the shipped wall.** Freeze-flood holds all 14. Live-wall holds all 14. Cut-flood leaks the sitter only on the two known remove-only rooms (E15S1, E5S6), neither in this sample. The 166 `leaksCut` core tiles in the fleet census are exactly those two rooms' entire cores. Live wall holds both.

**Film vs board rampart captions: 0 disagreements, 0 unpainted shipped ramparts, 0 extra painted tiles**, all 14 rooms.

**Shallow extensions** re-derived against live depth < 4:

| room | derived | published | ramparted |
|------|---------|-----------|-----------|
| E12S6 | 6 | 6 | 6/6 |
| E9S2 | 15 | 15 | 15/15 |
| E11S1 | 0 | 0 (note is a search note) | — |
| other 11 | 0 | 0 | — |

**Mineral seat == `meta.mineralSeat` == the shipped container** in all 14. Approach is a walkable D8 neighbour in all 14. Fleet mineral-why vs official census: **172/172 exact**.

**Lab diamond:** 10 labs, 4×4 bbox, 6 holes in all 14. Mandated stamp. Haul cheb 2–5. E9S2 declares `labs/lab-road-eat` for 3 displaced road tiles.

**Hub trio:** storage + terminal + hub-link all cheb ≤ 1 of the sitter in all 14. Spawns fanned (min pairwise cheb ≥ 2).

Road+rampart taxonomy, independent walk: **274 = 231 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified**, 153 rooms, median 2, max 5.

### Hash five

**E6S4.** 14-cut, 18 ramparts, 97 roads, 60/60. Compact pocket at sitter `10,29`, seed=hub `9,29`. Adopter (in the 27): freeze 14 → shipped 14, remove `14,36` / add `15,37`. Controller enclosed. Mineral **on** the network. Labs haul 2. 1 2×2 on a spine. 0 D4-blind. 0 redundant. Film: 14 crossing / 2 cover / 2 seat.outside. Quiet, intentional. Nicest room in the sample.

**E3S8.** 40-cut, 45 ramparts, 70 roads. `baseCut=40`. Controller enclosed. Mineral `44,13` off-network, declared. 1 2×2 on a spine. 0 redundant. Film: 40 crossing / 2 cover / 1 seat.inside / 2 seat.outside. Wall following the terrain.

**E15S3.** 56-cut, 61 ramparts, 71 roads. `baseCut=54 ≠ 56`. `protectRadius=9`. Controller enclosed. Mineral far south off-network, declared. **7 2×2** on a road spine, corridor-flanked, not a brick. 0 D4-blind. 0 redundant. Labs variant `anti`, haul 2. Film: 56 crossing / 2 cover / 1 seat.inside / 2 seat.outside. Long wall, only `misc` declared. The 56-cut is the ugliness the room does not price beyond the off-network note.

**E5S2.** 60-cut, 67 ramparts, 70 roads. A basin. Mobility **1.5** declared (page and film agree). Controller unenclosed. Mineral off-network, declared. 0 2×2. 0 D4-blind. Fat ladder: `1.5/67/60 ×2`, then `3/74/70`, last `2.75/86/83`. Film: 60 crossing / 3 ring / 2 cover / 2 seat.outside. Ugly for a named reason.

**E15S6.** 16-cut, 18 ramparts, 81 roads. Taken (4 lab holders, `{type,x,y}` only). Seed=hub `38,26`. Controller enclosed. Mineral **on** the network. 0 2×2. 0 redundant. Film: 16 crossing / 1 seat.outside / 1 cover. Small shell, sealed-recovery notes, quiet.

### Mandated churn

**E12S1.** Criticism 129's smoking-gun room. Film: 37 crossing / 2 seat.outside / 1 seat.inside / 5 ring / 1 cover. Independent classifier agrees tile for tile. Page 46 ramparts · 91 roads match the lists. Eco 21-tile controller walk, declared. `baseCut=36` ≠ cut 37.

**E15S4.** 29-cut, all 29 singly load-bearing. Adopter (in the 27); net-zero-count (1+1). Weak-battery / spawn-fan declared. Mineral off-network, deep inside, no bubble owed.

**E11S1.** 32-cut, 43 ramparts, 101 roads. Real shrink: `fullRun.reserved` is now the kept prefix (6 tiles / 2 rounds === `lane.reserved`). `wanted=7`, `used=3`, `ext=60`, `shallow=3`. Suffix COORD list is gone. Shallow note: 0 remain. Sealed not recovered, declared. Eco 27-tile controller walk, declared. 3 2×2 on a road spine. 0 D4-blind. Seed `25,39` ≠ hub `24,41`. Reserved board: `18,27 19,28 19,29 | 24,28 25,27 25,29`. `19,27` is D8 of `18,27` and `19,28` and is not in the set.

**E12S7.** 35-cut, 45 ramparts, 116 roads. 5 redundant cut tiles re-derived: `22,19 23,19 23,20 23,21 23,22` — the note's 5. Mineral off-network, declared. Weak-battery 10-step declared. Roads are swamp eco, not a city grid.

**E12S6.** 33-cut, 48 ramparts, 124 roads. 6 shallow re-derived exact, all ramparted, declared. Mineral **on** the network. Weak-battery 9-step declared. 3 2×2 on a spine.

**E7S5.** 14-cut, 19 ramparts, 99 roads. Taken (3 fixed holders, `{type,x,y}` only). Covered-detour declared. Long eco arms, small shell.

**E9S2.** 21-cut, 40 ramparts, 68 roads. 15 shallow re-derived exact. 7 redundant cut tiles re-derived: `22,25 22,26 31,2 35,2 36,2 42,24 47,24`. Lab-road-eat declared. `ctrlParks` 8→7 because `25,23` is an extension. Two 2×2 on a corridor.

**E2S7** (golden). 18-cut, 21 ramparts, 72 roads. Clean pocket. 0 redundant. Mineral off-network. Quiet.

**E1S4** (golden). 26-cut, 34 ramparts, 63 roads. West corridor of extensions, long south road to the controller, mineral far SW off-network. 0 sealed. Quiet, intentional.

---

## Visual / intent

No sampled room is a checkerboard, a solid brick, or a maze. Extension mass is corridor-flanked (**0 D4-blind extensions in all 14**). 2×2 squares exist in E15S3 (7), E11S1 (3), E12S6 (3), E9S2 (2), E6S4 (1), E3S8 (1) and they sit on a road spine. E5S2 is a forced 60-tile basin wall. E12S7 / E7S5 / E11S1 spend roads on eco, not on a city grid. Towers are not a hub clump (sample clumps 1–4).

Nothing in the sample looks accidental. The ugly rooms are ugly for a named, declared reason (E5S2 lap 1.5 + 60-tile basin, E9S2 15 shallow, E12S6 6 shallow, E7S5 detour, E11S1 27-tile controller walk). E15S3's 56-cut is the one ugliness the room does not price beyond `misc`.

---

## Findings

### M1 — MAJOR, not board-affecting

**Criticism 98 residue — reserved is still a free set of floor-touching tiles. The named append BITES. The class ESCAPE.**

**Exploit.** E11S1 after r29p10: `fullRun.reserved` === `lane.reserved` === 6 tiles / 2 rounds. `wanted=7`. The refused tail is a count.

| attack | result |
|--------|--------|
| append `"19,27"` to `fullRun.reserved` only, `tiles`/`wanted` := 7 (r31 as written) | **BITES** |
| named forges `99,99` / `1,1` / `0,0` / invent-shrink / 60/0 / delete board | **BITES** |
| `wanted := tiles` | **BITES** |
| append `"19,27"` to **both** reserved lists, last round, `tiles=7`, `wanted=8` | **ESCAPE** |
| prefix identity-swap `18,27 → 19,27` on both lists + `byRound` | **ESCAPE** |
| `wanted += 1` / `wanted += 999` | **ESCAPE** |
| `premium += 1` / `fullRun.ext += 1` / `fullRun.shallow += 1` / `fullRun.used += 1` | **ESCAPE** |

r29p10 dropped the suffix COORD list and required `fullRun.reserved === lane.reserved` and `wanted > tiles`. A tile that *is* this room's floor and *touches* the walk can still be added, or swapped for a kept prefix tile, if both lists stay twins. The refused walk is now four unread integers (`wanted`, `used`, `ext`, `shallow`) plus `premium`.

**Root cause.** A shrink is a prefix test plus a twin-list bind. The prefix is not required to be the greedy's tiles. The refused extra is a count, not a hashed walk.

**Board moved?** No.

### M2 — MAJOR, not board-affecting

**Criticism 88 residue — a complete discarded cut that leaks now BITES. A sealing same-lap neighbour, or a leak with `complete=false` + regen, ESCAPE.**

**Exploit.** E11S2 rungs: `1.56/46/37 ×3`, then `2.5/50/42` (last, eco-capped). Shipped wall 46/37 = freeze, shipped lap 1.56.

| attack | result |
|--------|--------|
| fatter mobility `2.5 → 0.5` + regen | **BITES** |
| last-fat shipped-cut + `ramparts:=cutlen` (r29p7) | **BITES** |
| 8-tile box, lap 0, keep ramparts=50 (r29p8) | **BITES** |
| nudge `20,9 → 19,9` (sitter leaks, lap 0, `complete` stays true) | **BITES** |
| nudge `20,9 → 19,9` **and** `complete=false` + regen | **ESCAPE** |
| nudge `29,33 → 28,34` (still seals, lap stays 2.5, 42 tiles) | **ESCAPE** |

`discardedCutSeals` runs only when `row.complete === true`. The last discarded rung may be marked incomplete (nothing after it). Regen the paragraph. The leak close does not fire. A 42-tile nudged cut that *does* seal is longer than the shipped 37, so the would-have-taken rule returns before it looks. Any other 42-tile COORD list that walks the claimed lap and seals (or is marked incomplete) passes.

**Root cause.** Discarded `cutTiles` are a free list held to `enclosureMobility` of themselves, plus "not freeze/shipped", plus "not shorter-and-prettier", plus "seals if complete". The composed enclosure is not on the board. r29p10 gated leaks on a flag the forger sets.

**Board moved?** No.

### M3 leftover — MEDIUM, not board-affecting

**The ruling's record is still not held to the standard the ruling named, on one column.**

r29p2 derived `sealCritical` and `ramparts-before`. The old slack attacks all BITES. The per-pass `rampartsDeleted` split is still free once the sum and the last-prune identity are held.

Evidence: E11S6 swap the two prune markers' `rampartsDeleted` and set last-prune `ramparts = shipped + new deleted` → pass.

### M4 — MEDIUM, not board-affecting

**Remaining META_DARK `presence` names still flip flattering. 172/172 once `baseCut`+`shallowNow` are left alone.**

**Exploit.** Zeroed every remaining `klass:"presence"` numeric/bool/array leaf across all 172 rooms. 76 presence names, 23 derived. 44 kinds, 4,319 events. `checkRoom`: **fail 172/172**, every first fail is `baseCut := 0`. Exclude `baseCut` and `shallowNow`: **pass 172/172**. 42 kinds, 4,144 events, silent.

Single-room ESCAPE, flattering direction: `corridorPlaced`, `roadsEaten`, `stitched`, `stubRoads`, `deepBudget`, `boundHeld`, `towerOnly` decrement-keep-nonzero / cleared. `spurred` decrement 5→4 still ESCAPE — and `spurred` is now *classified* `derived`.

r29p3 / r29p9 derived names still BITES. The class is still the class. `protectRadius` is *classified* `derived` and is only an enum.

**Root cause.** Criticism 141(c). The cheap walks they named are derived. The rest are still comments.

**Board moved?** No.

### M5 — MEDIUM, not board-affecting

**Exact `baseCut` / `protectRadius` pick is unread. `seedScore` is free.**

`protectRadius := 0` **BITES** (not in `RADII_WIDE`). `12 → 6` inside the enum **ESCAPE**. `baseCut := 0` **BITES**. `baseCut += 1` keeping `priceyWall` on the same side of `MAX_CUT=45` **ESCAPE**. `seedScore := 0` **ESCAPE**. `seedScore += 999` **ESCAPE**.

Sample: E6S4 `baseCut=14` = freeze = cut. E15S3 `baseCut=54` / freeze=56 / cut=56. E5S2 `baseCut=60` = cut. The pick is not freeze and not the shipped cut. `protectRadius` is an enum, not this room's pick. `seedScore` is a finite number, not the confluence walk. 46 rooms still have seed ≠ hub. The coordinates exist. The score does not.

### Named residues, re-probed, not re-filed as new

- **134(a)** still a fleet property. Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**. Absorb-one-add-into-freeze on E13S3 **BITES**. A room that shipped a redundant frozen cut tile would still let a forger shrink the anchor. This fleet does not ship one.
- **134(c)** sandwich holds; `ec[1].withheld += 1` + junk tile **BITES**; `ec[2]` zeroed **BITES**. The named hole (empirical identity, no published contract for a future layer) is unchanged.
- **134(d)** still a contract. Independent road+rampart walk: **274 = 231 + 30 + 13 + 0 + 0**. Agreement with a restated order.
- **cutAdopted** plant real add **BITES**. Plant first rampart **BITES**. The list is layer7b-reconcileSeal adds, which are none. Closed.
- **spurred** decrement keep-nonzero **ESCAPE**. Still a boolean-of-zero, now wearing a `derived` badge.

---

## What this is not

- Not a board fail. 60/60, sealed live wall, D4-faced extensions, mandated stamps placed, mineral seats reachable, film taxonomy vs board 0/14.
- Not a 134(b) count fail. 34 adds, 27 rooms, E15S1 and E5S6 remove-only, both cuts leak, both live walls hold.
- Not a 93 leftover. The pre-take number is gone; planting it back bites.
- Not an L1 jam. Not a film/page disagreement on the sample.
- Not an anti-pattern auto-fail. No maze, no brick, no road-on-every-rampart, no silent cap in the sample.
- Not the old 98 COORD-bag forge. Off-board `99,99` / `1,1` / `0,0` and a fake empty round are dead. The *as-written* r31 append (one list, `wanted:=tiles`) is dead.
- Not the old 88 swap-with-freeze, not the last-rung unweighed, not the 8-tile box keep-ramparts, not a *complete* discarded cut that leaks the sitter.

---

## What is still a door vs what is actually closed this artifact

**Closed this artifact (do not re-file):**
- 93 recovers on taken `fixedHolders`
- 98 invent-shrink on a free walk / forge without a reserved board / 60/0 shallow rewrite / off-board COORD extras
- 98 append to `fullRun.reserved` *without* keeping `lane.reserved` and `wanted > tiles` in sync
- 88 fatter-mobility + regen / shipped-cut + `ramparts:=cutlen` / 8-tile box keep-ramparts
- 88 complete discarded cut that leaks the sitter
- r29p9 `nukerInWindow`, `nukeWindow.center`, `mineralSeatNetTiles`, `coveredDetourDeclared`
- `cutAdopted ===` layer7b adds
- `cutPasses.sealCritical` (single-removal)
- `cutPasses` last-prune `ramparts-before`

**Still a door:**
- 98 kept prefix is any floor-touching twin of `lane.reserved` (E11S1 extra `19,27` on both lists; identity-swap `18,27→19,27`)
- 98 refused walk is unread numbers (`wanted`, `used`, `ext`, `shallow`, `premium`) once `wanted > tiles`
- 88 any discarded cut that is not freeze, not shorter-and-prettier than shipped, and either seals or is marked `complete=false` (including a one-tile neighbour of the last fat cut)
- `cutPasses.rampartsDeleted` split
- Remaining META_DARK presence (76 names, 172/172 silent once `baseCut` is left alone)
- Exact `baseCut` / `protectRadius` pick
- `seedScore`
- 134(a) as a theorem, 134(c) contract, 134(d) as a derivation, `spurred` as a count

---

## Bottom line

Boards are clean. The gallery in the sample is readable and matches the tiles. 134(b) as a **number** stays done. 93, the *stated* 98 one-list append, the *stated* 88 leak-on-complete, and the four r29p9 presence names are done. The 98 class is not done: reserved is still a free set and the refused walk is still a count. The 88 class is not done: a sealing same-lap neighbour still passes, and the leak close is a `complete` flag plus a regen. Plus the presence class, plus the exact pick, plus `seedScore`, plus one `cutPasses` column.

I would **not** stand down for a clean round. A clean round is zero findings. If the next pass binds `fullRun.reserved` / `lane.reserved` to the greedy (or hashes it), binds `wanted`/`used`/`ext`/`shallow` to that walk, and binds discarded `cutTiles` to the composed enclosure (or stops publishing them — and stops letting `complete=false` skip the leak), this reviewer has nothing new from those two — only the residues already on the list.
