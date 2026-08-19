# Round 31 owner-voice review

Hostile. Fresh. Re-derived from `plans-hub.json` + `_r28-mech/rooms.json` terrain. Did not trust meta, did not import `validate.mjs` for board facts, did not cherry-pick rooms. `checkRoom` used only on mutated clones.

Artifact md5 `86d38bdd2b2aef39a79cb8aa134f9b06` — matches the brief. Tree HEAD is `7cdc23a` (r29p9, four leftover presence names derived), not the brief's `175ea5d` (the previous r29p9 commit). 172/172 rooms, 0 errors. Fleet physicals re-summed off the structure lists: **10,320 extensions · 14,100 roads · 8,208 ramparts · 300 declarations · 236 notes**. Same numbers as r26–r30. Boards did not move.

**Verdict.** No board defect in the sample. No film-vs-board caption lie in the sample. 134(b) is still 34 adds / 27 rooms. Closed-since-r30 all **BITES** and are not re-filed: 93 recovers plant, 98 named forges (`99,99` / `1,1` / `0,0` / fake-round), 88 last-fat shipped-cut + `ramparts:=cutlen`, 88 8-tile box keep-ramparts, r29p9 `nukerInWindow` / `nukeWindow.center` / `mineralSeatNetTiles` / `coveredDetourDeclared`. The named 98 *residue* is **not** closed: E11S1 `19,27` as a D8-neighbour extra reserved tile **ESCAPE**. The named 88 *residue* is **not** closed: one-tile nudge of the last fat cut (broken-seal lap 0, and a sealing same-lap 2.5) **ESCAPE**. Remaining META_DARK presence still flips 172/172 once `baseCut`+`shallowNow` are left alone. Exact pick and `seedScore` still unread. `cutPasses.rampartsDeleted` split still a log.

Throwaway probes: `tools/plan-suite/v2/_r31-owner/` (not committed).

---

## Sample

`h(room) = fmix32(fnv1a32("round31-owner|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|------|------|---|
| 1 | **E19S3** | 39,996,403 |
| 2 | **E18S8** | 52,163,559 |
| 3 | **E17S1** | 60,048,636 |
| 4 | **E2S6** | 66,695,686 |
| 5 | **E12S2** | 97,151,259 |

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

The 27 adopting rooms (same set as r28–r30):

`E13S3 E13S4 E13S5 E14S9 E15S4 E15S5 E16S2 E17S2 E17S5 E18S6 E18S8 E18S9 E19S8 E1S2 E1S6 E21S2 E21S8 E2S1 E2S5 E2S6 E3S6 E5S7 E6S3 E6S4 E6S5 E8S7 E9S8`

E18S8 (in this hash sample) is a net-minus-one adopter: freeze 32, shipped 31, two removes (`29,12 29,13`) and one add (`28,13`). E2S6 (also hashed) is net-zero-count: freeze 61, shipped 61, two removes (`7,37 7,38`) and two adds (`5,36 6,36`). E15S4 (churn) is the same class as E18S8: one remove `37,7`, one add `36,8`.

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
| `sealCritical += 1` | **BITES** (single-removal on that invocation's ramparts) |
| `sealCritical := adds` | **BITES** |
| `sealCritical := rampN` | **BITES** |
| prune `ramparts += 8` | **BITES** |
| swap the two prune markers' `rampartsDeleted` (sum preserved) | **BITES** (last-prune identity) |
| swap `rampartsDeleted` **and** set last-prune `ramparts = shipped + new deleted` | **ESCAPE** |

`sealCritical` is the single-removal count. Last-prune `ramparts-before` is shipped + its own deletions. The naive swap dies because last-prune `ramparts` no longer matches.

The leftover is the **split**. `rampartsDeleted` per prune marker is free once the sum equals `inertPruned.size`, each marker stays `≥ removes`, and last-prune `ramparts` is rewritten to keep its identity. E11S6: swap the two deleted counts, fix last-prune `ramparts`, pass.

A declaration census would have classed the per-pass deleted set, not the sum. "Derived" is true of `sealCritical` and `ramparts-before`. It is not true of the third column.

**Answer: closer, still no.** Two of the three decorative columns are integers. The split is still a log.

---

## Closed since r30 — re-probed, BITES, not re-filed

**93 recovers.** Taken-room `fixedHolders` ship `{type, x, y}` only. Twelve taken rooms, **0** publish `recovers` / `recoversDeep`. Invent holder `{lab,1,1,99/99}` **BITES**. Plant `recovers=2` / `recoversDeep=2` on E15S6's four labs + note twin **BITES** ("a log of a board that left").

**98 named forges.** Extra reserved `99,99` / `1,1` / `0,0` + fake-round on a real shrink **BITES** (not this room's walkable interior floor). Same forge on a plain 60/0 room inventing a shrink **BITES**. Invent-shrink leaving `fullRun` honest **BITES**. Delete `fullRun` **BITES**. 60/0 `shallow` rewrite **BITES**. Dropped-room `99,99` **BITES**.

**88 r29p7 / r29p8.** Last-fat shipped-cut + `ramparts:=cutlen` on E11S2 needDeep+85 **BITES**. 8-tile box, lap 0, keep `ramparts=50` **BITES** ("would have taken this challenger"). Fatter mobility `2.5 → 0.5` + regen **BITES**.

**r29p9.** `nukerInWindow` flip **BITES**. `nukeWindow.center → 1,1` **BITES**. `mineralSeatNetTiles = ["1,1"]` **BITES**. `coveredDetourDeclared` flip **BITES**.

---

## Per-room (enclosure, cut, shallow, mineral, film, page)

Method, every room: exterior flood over `cut`, over `cutAtFreeze`, over shipped ramparts (own D8 flood, not `shared.mjs`); depth from that flood; mineral seat = the container chebyshev ≤ 1 of the mineral; film rampart captions classified from the board (cut → container+outside/inside+depth against the freeze flood → standDenial → other occupant → unclassified) and compared to every `stage:"ramparts"` cell; page counts / notes / shortfalls read out of the HTML.

**No sampled room leaks the sitter or any spawn/storage/terminal/tower/nuker/lab/extension through the shipped wall.** Freeze-flood holds all 14. Live-wall holds all 14. Cut-flood leaks the sitter only on the two known remove-only rooms (E15S1, E5S6), neither in this sample. The 166 `leaksCut` core tiles in the fleet census are exactly those two rooms' entire cores (60+60 extensions, 10+10 labs, 6+6 towers, …). Live wall holds both.

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

**E19S3.** 33-cut, 36 ramparts, 98 roads, 60/60. Compact NW pocket at sitter `16,13`, seed=hub `15,13`. Labs haul 2. Controller enclosed. Mineral **on** the network. 0 2×2. 0 redundant. 0 sealed leftover. Eco 29-tile source-path tax, declared. Film: 33 crossing / 2 seat.outside / 1 cover. Quiet, intentional. Nicest room in the sample.

**E18S8.** 31-cut, 33 ramparts, 69 roads. Adopter (in the 27): freeze 32 → shipped 31. `baseCut=32`. `protectRadius=7`. Controller enclosed. Mineral `11,36` off-network south, declared. 1 redundant cut tile, depth-promotion, noted. **5 2×2** on a road spine, corridor-flanked, not a brick. 0 road+rampart. Film: 31 crossing / 1 cover / 1 seat.outside. Compact, wall following the terrain.

**E17S1.** 36-cut, 42 ramparts, 81 roads. Controller unenclosed. Mineral `41,18` off-network, declared. Labs haul 3. 0 2×2. 0 redundant. 2 road+rampart, both on the cut. Film: 36 crossing / 3 seat.outside / 2 cover / 1 ring. Quiet.

**E2S6.** 61-cut, 69 ramparts, 76 roads. A basin. Seed `17,29` ≠ hub `18,27`. `baseCut=59`. Mobility **1.29** declared. Controller unenclosed north. 1 unreachable battlement at `6,36` (link on the cut), declared. Eco 21-tile controller walk, declared. Net-zero-count adoption (2+2). 0 2×2. Film: 61 crossing / 2 cover / 2 seat.outside / 3 ring / 1 seat.inside. Same room r29 hashed. Still ugly for a named reason.

**E12S2.** 65-cut, 69 ramparts, 76 roads. `baseCut=65`. `protectRadius=8`. Controller enclosed. Mineral off-network, declared. Labs haul 2. 0 2×2. 0 redundant. Long wall, not a stamp. Film: 65 crossing / 2 seat.outside / 2 cover. The roads are the price of the basin; the room only files `misc`.

### Mandated churn

**E12S1.** Criticism 129's smoking-gun room. Film: 37 crossing / 2 seat.outside / 1 seat.inside / 5 ring / 1 cover. Independent classifier agrees tile for tile. Page 46 ramparts · 91 roads match the lists. Eco 21-tile controller walk, declared. `baseCut=36` ≠ cut 37.

**E15S4.** 29-cut, all 29 singly load-bearing. Adopter (in the 27); net-zero-count (1+1). Weak-battery / spawn-fan declared. Mineral off-network, deep inside, no bubble owed.

**E11S1.** 32-cut, 43 ramparts, 101 roads. Real shrink (`fullRun.ran`, reserved 7 → lane 6). Shallow note: 0 remain. Sealed not recovered, declared. Eco 27-tile controller walk, declared. 3 2×2 on a road spine. 0 D4-blind. Seed `25,39` ≠ hub `24,41`. Reserved board: `18,27 19,28 19,29 | 24,28 25,27 25,29 | 32,46`. `19,27` is D8 of `18,27` and `19,28` and is not in the set.

**E12S7.** 35-cut, 45 ramparts, 116 roads. 5 redundant cut tiles re-derived: `22,19 23,19 23,20 23,21 23,22` — the note's 5. Mineral off-network, declared. Weak-battery 10-step declared. Roads are swamp eco, not a city grid.

**E12S6.** 33-cut, 48 ramparts, 124 roads. 6 shallow re-derived exact, all ramparted, declared. Mineral **on** the network. Weak-battery 9-step declared. 3 2×2 on a spine.

**E7S5.** 14-cut, 19 ramparts, 99 roads. Taken (3 fixed holders, `{type,x,y}` only). Covered-detour declared. Long eco arms, small shell.

**E9S2.** 21-cut, 40 ramparts, 68 roads. 15 shallow re-derived exact. 7 redundant cut tiles re-derived: `22,25 22,26 31,2 35,2 36,2 42,24 47,24`. Lab-road-eat declared. `ctrlParks` 8→7 because `25,23` is an extension. Two 2×2 on a corridor.

**E2S7** (golden). 18-cut, 21 ramparts, 72 roads. Clean pocket. 0 redundant. Mineral `33,4` off-network. Quiet.

**E1S4** (golden). 26-cut, 34 ramparts, 63 roads. West corridor of extensions, long south road to the controller, mineral far SW off-network. 0 sealed. Quiet, intentional.

---

## Visual / intent

No sampled room is a checkerboard, a solid brick, or a maze. Extension mass is corridor-flanked (**0 D4-blind extensions in all 14**). 2×2 squares exist in E18S8 (5), E11S1 (3), E12S6 (3), E9S2 (2) and they sit on a road spine. E2S6 and E12S2 are forced basin walls. E12S7 / E7S5 / E11S1 spend roads on eco, not on a city grid. Towers are not a hub clump (sample clumps 1–4). E18S8 has no road-on-rampart at all.

Nothing in the sample looks accidental. The ugly rooms are ugly for a named, declared reason (E2S6 lap 1.29 + 61-tile basin + unmanned battlement, E9S2 15 shallow, E12S6 6 shallow, E7S5 detour, E11S1 27-tile controller walk). E12S2's 65-cut is the one ugliness the room does not price beyond `misc`.

---

## Findings

### M1 — MAJOR, not board-affecting

**Criticism 98 residue — D8-neighbour extra reserved tile that still prefix-matches. ESCAPE.**

**Exploit.** E11S1 is a real shrink: `fullRun.reserved` 7 tiles / 3 rounds, `shrunk.to=2`, `lane.reserved` 6 tiles. Append `"19,27"` (D8 of `18,27` and `19,28`, walkable interior floor, not an object) to `fullRun.reserved`, push it as a new `byRound` round, increment `tiles`/`rounds`/`used`/`shrunk.wanted`. Prefix of `byRound` still equals `lane.reserved`. `checkRoom` **ESCAPE**. Same if the extra tile is stuffed into an existing later round. Same as an identity-swap of a later-round tile for `19,27`. Same class on a dropped room (E12S5): a D8 neighbour of an existing reserved tile, extra round, **ESCAPE**.

The named forges (`99,99` / `1,1` / `0,0` / fake-round / invent-shrink on a free walk / 60/0 rewrite) **BITES**. r29p6 bound reserved tiles to the room floor. A tile that *is* the room floor and *touches* the walk (cheb ≤ 2 of the reserved set) is still a free suffix.

**Root cause.** A shrink is a prefix test plus a floor bind. Tiles after `to` must exist, be unique, be walkable interior, and touch the walk. They are not required to be the greedy's tiles. r29p6 closed the COORD bag and left the suffix unread.

**Board moved?** No.

### M2 — MAJOR, not board-affecting

**Criticism 88 residue — one-tile nudge of the last fat cut. ESCAPE.**

**Exploit.** E11S2 rungs: `1.56/46/37 ×3`, then `2.5/50/42` (last, eco-capped). Shipped wall 46/37 = freeze, shipped lap 1.56.

| attack | result |
|--------|--------|
| fatter mobility `2.5 → 0.5` + regen | **BITES** |
| last-fat shipped-cut + `ramparts:=cutlen` (r29p7) | **BITES** |
| 8-tile box, lap 0, keep ramparts=50 (r29p8) | **BITES** |
| nudge `20,9 → 19,9` (sitter leaks, lap 0) | **ESCAPE** |
| nudge `29,33 → 28,34` (still seals, lap stays 2.5, 42 tiles) | **ESCAPE** |

r29p8 judges a discarded published cut only when it is the winner's cut, or when it walks a *strictly better* lap at *no extra length*. A 42-tile nudged cut is longer than the shipped 37, so the would-have-taken rule returns before it looks. Mobility is held to `enclosureMobility` of the free list. Any other 42-tile COORD list that walks the claimed lap passes — including one that would have been a different composition, and including one that does not even seal.

**Root cause.** Discarded `cutTiles` are a free list held to `enclosureMobility` of themselves, plus "not freeze/shipped", plus "not shorter-and-prettier". The composed enclosure is not on the board. r29p7 weighed the last rung. r29p8 judged the 8-tile box. The one-tile neighbour of the last fat cut was never a composition.

**Board moved?** No.

### M3 leftover — MEDIUM, not board-affecting

**The ruling's record is still not held to the standard the ruling named, on one column.**

r29p2 derived `sealCritical` and `ramparts-before`. The old slack attacks (`+= 1`, `:= adds`, `:= rampN`, `ramparts += 8`, naive swap) all BITES. The per-pass `rampartsDeleted` split is still free once the sum and the last-prune identity are held.

Evidence: E11S6 swap the two prune markers' `rampartsDeleted` and set last-prune `ramparts = shipped + new deleted` → pass. Controls (why-append, `+= 999`, `ramparts := 0`, kind rewrite, naive swap) bite.

### M4 — MEDIUM, not board-affecting

**Remaining META_DARK `presence` names still flip flattering. 172/172 once `baseCut`+`shallowNow` are left alone.**

**Exploit.** Zeroed every remaining `klass:"presence"` numeric/bool/array leaf across all 172 rooms. 76 presence names, 23 derived. 44 kinds, 4,319 events. `checkRoom`: **fail 172/172**, every first fail is `baseCut := 0`. Exclude `baseCut` and `shallowNow`: **pass 172/172**. 42 kinds, 4,144 events, silent.

Single-room ESCAPE, flattering direction: `corridorPlaced`, `roadsEaten`, `stitched`, `stubRoads`, `deepBudget`, `boundHeld`, `towerOnly` decrement-keep-nonzero / cleared.

r29p3 / r29p9 derived `extractorOffNetwork`, `extractorSeatNetTiles`, `mobilityShippedFree`, `nukerInWindow`, `nukeWindow.center`, `mineralSeatNetTiles`, `coveredDetourDeclared`. Those now BITES. The class is still the class. 76 presence names remain; 23 META_DARK names are `derived`. `protectRadius` is *classified* `derived` and is only an enum.

**Root cause.** Criticism 141(c). The cheap walks they named are derived. The rest are still comments.

**Board moved?** No.

### M5 — MEDIUM, not board-affecting

**Exact `baseCut` / `protectRadius` pick is unread. `seedScore` is free.**

`protectRadius := 0` **BITES** (not in `RADII_WIDE`). `12 → 6` inside the enum **ESCAPE**. `baseCut := 0` **BITES**. `baseCut += 1` keeping `priceyWall` on the same side of `MAX_CUT=45` **ESCAPE**. `seedScore := 0` **ESCAPE**. `seedScore += 999` **ESCAPE**.

Sample: E18S8 `baseCut=32` / freeze=32 / cut=31. E2S6 `baseCut=59` / freeze=61 / cut=61. E12S2 `baseCut=65` = cut. The pick is not freeze and not the shipped cut. `protectRadius` is an enum, not this room's pick. `seedScore` is a finite number, not the confluence walk. 46 rooms still have seed ≠ hub. The coordinates exist. The score does not.

### Named residues, re-probed, not re-filed as new

- **134(a)** still a fleet property. Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**. Absorb-one-add-into-freeze on E13S3 **BITES**. A room that shipped a redundant frozen cut tile would still let a forger shrink the anchor. This fleet does not ship one.
- **134(c)** sandwich holds; `ec[1].withheld += 1` + junk tile **BITES**; `ec[2]` zeroed **BITES**. The named hole (empirical identity, no published contract for a future layer) is unchanged.
- **134(d)** still a contract. Independent road+rampart walk: **274 = 231 + 30 + 13 + 0 + 0**. Agreement with a restated order.
- **cutAdopted** plant real add **BITES**. Plant first rampart **BITES**. The list is layer7b-reconcileSeal adds, which are none. Closed.
- **spurred** decrement 5→4 (keep nonzero) **ESCAPE**. Still a boolean-of-zero.
- **93** inflate `sealedFloor` pocket `recovers` was a no-op on this artifact (`changed: false` — no such number left to inflate). Not a door.

---

## What this is not

- Not a board fail. 60/60, sealed live wall, D4-faced extensions, mandated stamps placed, mineral seats reachable, film taxonomy vs board 0/14.
- Not a 134(b) count fail. 34 adds, 27 rooms, E15S1 and E5S6 remove-only, both cuts leak, both live walls hold.
- Not a 93 leftover. The pre-take number is gone; planting it back bites.
- Not an L1 jam. Not a film/page disagreement on the sample.
- Not an anti-pattern auto-fail. No maze, no brick, no road-on-every-rampart, no silent cap in the sample.
- Not the old 98 COORD-bag forge. Off-board `99,99` / `1,1` / `0,0` and a fake empty round are dead.
- Not the old 88 swap-with-freeze, not the last-rung unweighed, not the 8-tile box keep-ramparts.

---

## What is still a door vs what is actually closed this artifact

**Closed this artifact (do not re-file):**
- 93 recovers on taken `fixedHolders`
- 98 invent-shrink on a free walk / forge without a reserved board / 60/0 shallow rewrite / off-board COORD extras
- 88 fatter-mobility + regen / shipped-cut + `ramparts:=cutlen` / 8-tile box keep-ramparts
- r29p9 `nukerInWindow`, `nukeWindow.center`, `mineralSeatNetTiles`, `coveredDetourDeclared`
- `cutAdopted ===` layer7b adds
- `cutPasses.sealCritical` (single-removal)
- `cutPasses` last-prune `ramparts-before`

**Still a door:**
- 98 suffix of `fullRun.reserved` after `to`, if the extra tile is walkable interior and touches the walk (E11S1 `19,27`)
- 88 any discarded cut that is not freeze, not shorter-and-prettier than shipped, and walks its own lap (including a one-tile neighbour of the last fat cut)
- `cutPasses.rampartsDeleted` split
- Remaining META_DARK presence (76 names, 172/172 silent once `baseCut` is left alone)
- Exact `baseCut` / `protectRadius` pick
- `seedScore`
- 134(a) as a theorem, 134(c) contract, 134(d) as a derivation, `spurred` as a count

---

## Bottom line

Boards are clean. The gallery in the sample is readable and matches the tiles. 134(b) as a **number** stays done. 93, the *stated* 98 floor bind, the *stated* 88 last-rung weigh and 8-tile-box judge, and the four r29p9 presence names are done. The named 98 residue (a D8-neighbour extra reserved tile that prefix-matches) and the named 88 residue (one-tile nudge of the last fat cut) are still open, plus the presence class, plus the exact pick, plus `seedScore`, plus one `cutPasses` column.

I would **not** stand down for a clean round. A clean round is zero findings. The reserved-board suffix and the discarded-rung free list are findings. If the next pass binds `fullRun.reserved` after `to` to the greedy (or hashes it) and binds discarded `cutTiles` to the composed enclosure (or stops publishing them), this reviewer has nothing new from those two — only the residues already on the list.
