# Round 28 owner-voice review

Hostile. Fresh. Re-derived from `plans-hub.json` + mongo terrain dump. Did not trust meta, did not import `validate.mjs` for board facts, did not cherry-pick rooms.

Artifact md5 `239f4e43331181cf4484d462003ff6b5` — matches the brief and `_LOOP-STATE.txt`. 172/172 rooms, 0 errors. Fleet physicals re-summed off the structure lists: **10,320 extensions · 14,100 roads · 8,208 ramparts · 300 declarations · 236 notes**. Boards did not move since the round-26/27 freeze.

**Verdict.** No board defect in the sample. No film-vs-board caption lie in the sample. Criticism 134(b) is arithmetically true (34 adds, 27 rooms). The ruling's *record* is **not** as strong as a declaration: three `cutPasses` leaves are free numbers. The three mineral-why rooms 141(d) named do **lie about the board**, and the exemption that holds them still lets a forged nearest-road magnitude through. Everything else that fired is a 141 residue.

Throwaway probes: `tools/plan-suite/v2/_r28-owner/` (not committed).

---

## Sample

`h(room) = fmix32(fnv1a32("round28-owner|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|------|------|---|
| 1 | **E15S8** | 11,209,278 |
| 2 | **E21S7** | 31,412,702 |
| 3 | **E3S4** | 59,728,870 |
| 4 | **E2S7** | 64,333,111 |
| 5 | **E1S4** | 83,960,003 |

Also churn-read as required: **E12S1 E15S4 E11S1 E12S7 E12S6 E7S5 E9S2**.

Terrain dump: 172 rooms, same world the suite used.

---

## 134(b) — 34 adds, how many rooms?

Re-walked every `meta.shell.cutDrift` row. Did not read the doc's 27.

- **34 adds**, all `pass: layer7-reconcileSeal`. Zero `layer7b-reconcileSeal` adds.
- **46 removes**, all `pass: layer7-inertPrune`.
- **27 rooms adopt.** 29 rooms drift. The two that remove and do not add: **E15S1, E5S6**.
- Independent exterior flood over the **shipped cut** reaches the sitter in exactly those two. Flood over the **shipped ramparts** reaches the sitter in **0 of 172 in the sample**, and in 0 of those two. The doc's parenthetical is true: they are the two rooms whose shipped cut does not seal.
- Independent single-removal seal test (delete that one rampart, re-flood, does the exterior reach the sitter): **34/34 fire**. The evidence the ruling named is on the board.
- `why` vs the producer's `(op, pass)` generator, compared whole: **0 mismatches** in 80 rows.

The 27 adopting rooms:

`E13S3 E13S4 E13S5 E14S9 E15S4 E15S5 E16S2 E17S2 E17S5 E18S6 E18S8 E18S9 E19S8 E1S2 E1S6 E21S2 E21S8 E2S1 E2S5 E2S6 E3S6 E5S7 E6S3 E6S4 E6S5 E8S7 E9S8`

**134(b) as a count is closed.** The room-count correction (29 → 27) is real, not a tidy-up.

---

## Is the ruling's record as strong as a declaration?

The ruling's own words: *every leaf re-derived or bounded, every sentence generated.*

`cutDrift` rows have five leaves: `x y op pass why`.

- `pass` is a closed enum. Invented pass / wrong-op-for-pass / appended clause all bite (reproduced the why-append: BITES).
- `op` is a function of `pass`.
- `why` is generated from `(op, pass)` and compared whole.
- Adds are bound to the single-removal seal test (re-derived 34/34).
- Removes are bound to `inertPruned`.
- Replay identity `cutAtFreeze + adds − removes == shipped cut` holds in the rooms walked.
- No net-zero churn in the artifact.

That half is a declaration.

`cutPasses` markers have seven leaves: `pass kind ramparts rampartsDeleted adds removes sealCritical`.

Mutated clones, ran `checkRoom`, ignored fleet-median noise:

| attack | result |
|--------|--------|
| `cutPasses[].sealCritical += 999` on E13S3 | **ESCAPE** |
| prune-marker `ramparts := 0` | **ESCAPE** |
| swap `rampartsDeleted` between the two prune markers (sum preserved) | **ESCAPE** |
| rewrite `kind` to `"reviewer"` | BITES — only because the sum filter is `kind === "inertPrune"`, so the rewrite zeroes the sum. Not an enum gate. |
| append a clause to every `cutDrift.why` | BITES (control) |

`adds`/`removes` bind to the drift rows. The prune-markers' `rampartsDeleted` **sum** binds to `inertPruned.size`. The other three leaves — per-pass `sealCritical`, per-pass `ramparts`, per-pass `rampartsDeleted` once the sum is held — are free integers. A declaration census would have classed them or refused to start. They are the shape 141(c) already named, arriving **on the record the ruling pointed at**.

`why` is also weaker than a declaration paragraph: it is a constant per `(op, pass)`. It names no tile and no room. That is what the ruling asked for. It is generated. It is not evidence of the tile; the seal test is.

**Answer: no.** The row is held. The marker is a log with three decorative columns.

---

## 141(d) — E2S5 E5S1 E5S3, does the published why lie?

Yes. All three. Not a census-definition quibble. False of the shipped structure lists.

Independent ring census: `holds` = every structure type on the tile, `net` = roads ∪ containers minus the seat, nearest road = min chebyshev over `structures.road` with the documented tie-break.

**E2S5** seat `27,23`. The seat tile **itself carries a road**. Official renderer would say *"the seat tile itself carries a road"*. Published why: *"the nearest road tile this room ships is 28,23, 1 step(s) away."* Ring otherwise matches. Suffix is the on-network sentence, which is the right suffix.

**E5S3** seat `32,11`. Same class. Seat carries a road. Published: *"nearest road … 33,10, 1 step(s)"*. Ring otherwise matches.

**E5S1** seat `29,30`. Published ring says `28,30 (nothing of ours)`. The board has a **road** there (the conduct-bridge tile this document has found twice from opposite ends). Derived touch is `{28,30, 28,31, 28,29}` (3). Published touch is 2 and omits `28,30`. Nearest-road `28,29 @ 1` happens to be true as a minimum only because `28,30` is also 1; the lie is the ring slot.

Fleet sweep of the same two predicates: **exactly these three rooms**. No fourth.

The gate that was supposed to hold them to "suffix + seat, not whole-value" is live: rewriting E2S5's `"1 step(s)"` → `"99 step(s)"` while keeping the seat coords and the on-network suffix **ESCAPES**. A forged magnitude about a road the room actually ships is still a passing room.

141(d) filed this as *"disagree with the official census on whether a road on the seat or its ring is 'ours.'"* That is the flattering residue this list has been writing for five rounds. The seat **is** a road. `28,30` **is** a road. "Ours" is not the question.

Not a new class. Not board-affecting. The exemption is.

---

## Other 141 residues, re-probed

**(a)** Unproved as a theorem. On this fleet the freeze-cut is a minimal seal in the rooms I dropped tiles from (the 34 adds all make a neighbour droppable; 0 of 34 fail the seal test). I did not drop all 7,246 freeze tiles. Accept the fleet property as stated.

**(c)** `nukerHubDist := 1` ESCAPE. `protectRadius := 0` ESCAPE. Presence-with-reason, as filed.

**(e)** `seed` unre-derivable in 46 rooms — not re-opened. Film `seed (x,y) → hub (x,y)` captions in the sample are coordinates that exist on the plan (`hub` / storage), not a re-derivation of why that seed won.

**(b)** 134(c)/(d)/(e) / 88 / 93 / 98 — not in this brief's board sample. Left standing.

---

## Per-room (enclosure, cut, shallow, mineral, film, page)

Method, every room: exterior flood over `cut`, over `cutAtFreeze`, over shipped ramparts (own D8 flood, not `shared.mjs`); depth from that flood; mineral seat = the container chebyshev ≤ 1 of the mineral; film rampart captions classified from the board (cut → container+outside/inside+depth → standDenial → other occupant → unclassified) and compared to every `stage:"ramparts"` cell; page counts / notes / shortfalls read out of the HTML.

**No sampled room leaks the sitter or any spawn/storage/terminal/tower/nuker/lab/extension through the shipped wall.** Freeze-flood "leaks" on remote links are the bubbles — those tiles are outside the cut and under a personal rampart. Not a leak.

**Film vs board rampart captions: 0 disagreements, 0 unpainted shipped ramparts, 0 extra painted tiles**, all 12 rooms.

**Shallow extensions** re-derived against live depth < 4:

| room | derived | published | ramparted |
|------|---------|-----------|-----------|
| E12S6 | 6 | 6 | 6/6 |
| E9S2 | 15 | 15 | 15/15 |
| E11S1 | 0 | 0 (note says so) | — |
| other 9 | 0 | 0 | — |

**Mineral seat == `meta.mineralSeat` == the shipped container** in all 12. E12S7 is `25,32` (the r27 rename). Approach is a walkable D8 neighbour in all 12.

**Lab diamond:** 10 labs, 4×4 bbox, 6 holes (4 corners + 2 interior hauler tiles) in all 12. That is the mandated stamp. Placement is adjacent to the hub (haul cheb 2–5). E9S2 declares `labs/lab-road-eat` for 3 displaced road tiles; the holes include that class. Not a finding against the stamp.

**Hub trio:** storage + terminal + hub-link all cheb ≤ 1 of the sitter in all 12. Spawns fanned (min pairwise cheb ≥ 2). E15S4 declares `spawnFan/sector` 58° vs 60° — re-computed around `hub`/`storage` `23,21`: min sep **57.53°**. True.

### Hash five

**E15S8.** 19-cut, 24 ramparts, 78 roads, 60/60. Compact diamond at `25,18–28,21`, corridor extensions, mineral entombed in a wall pocket at `12,12` with the container at `11,11` off-network (declared). Controller isolated with a bubble. Film: 19 crossing / 2 seat.outside / 0 inside / 2 ring / 1 cover. Sealed floor `28,31 29,31` re-derived exact (2 deep, unreachable even walking out through own ramparts). Looks grown from a cramped room, not stamped. No maze. One road+rampart (the gate).

**E21S7.** 67-cut, 73 ramparts, 66 roads. A north–south canyon: one long 2-wide extension corridor down the only deep strip. Wall is huge because the terrain is a hallway, not because the planner drew a second shell. Mobility 1.24 over target 1.2, declared, film ladder note agrees. Mineral `25,33` off-network, declared. 0 sealed. Visual is a corridor, not a brick (0 2×2 all-extension squares, every ext has a D4 road).

**E3S4.** 23-cut, 27 ramparts, 79 roads. Mobility **2.83** declared (10 judged pairs). Film ladder note agrees. Controller enclosed. Mineral `32,8` off-network. 0 sealed. One container sits **on the cut** at `38,40` (rampart+container, on freeze and on shipped cut) — crossing absorbs it; `seat.inside` emptyBecause names that tile. True of the test order. Core is tight; the cost is the lap, and the room says so.

**E2S7** (golden). 18-cut, 21 ramparts, 72 roads. Clean pocket, diamond west of the hub, extensions filling, controller south. 1 sealed tile `18,31` re-derived exact. Mineral `32,3` off-network. Film/page `roadsPrune` caption: *"10 tiles deleted … meta.walls.pruned = 11"*. The board: `prunedGhosts 10 · pruned 11 · prunedTransient 1`. Both numbers are real and they are **different counts**. The caption prints them as one sentence. See finding L1.

**E1S4** (golden). 26-cut, 34 ramparts, 63 roads. West corridor of extensions, long south road to the controller, mineral far SW off-network. 0 sealed. Quiet, intentional.

### Mandated churn

**E12S1.** Criticism 129's smoking-gun room. Film now: 37 crossing / 2 seat.outside / 1 seat.inside / 5 ring / 1 cover. Independent classifier agrees tile for tile. `36,24` is the inside seat (source container, interior, shallow). `22,40` is the mineral seat, outside. Page counts 46 ramparts · 91 roads match the lists. Eco shortfall is a long controller walk and the room says so.

**E15S4.** 29-cut, all 29 singly load-bearing (independent drop-one: 0 redundant). Note *"NO CUT TILE IS REDUNDANT"* is true of the shipped cut. This room **does** adopt (it is in the 27). Weak-battery 9-step declared. Spawn fan 58° declared and re-derived. Mineral `23,6` off-network.

**E11S1.** 32-cut, 43 ramparts, 101 roads. Shallow note: *"0 of 60 sit at depth < 4"* — re-derived 0. The note exists because layer 7b moved 3 slots after the prune handed floor back; that is a search note, not a remaining-shallow claim. Sealed `26,32 31,42 31,43` re-derived exact. Eco is a 27-tile controller walk, declared.

**E12S7.** 35-cut, 45 ramparts, 116 roads. 5 redundant cut tiles re-derived: `22,19 23,19 23,20 23,21 23,22` — the note's 5. Paved run `23,23 24,24` re-derived (D8 diagonal pair, the class D4 used to miss). Film `roadsLate`: *"3 swamp holes pre-paved"* — `shippedByKind.swampPave === 3`, 0 spurs. Mineral seat `25,32`; `25,33` is now a tower (the reservation the field used to name). Off-network, declared. Weak-battery 10-step declared. A lot of road, almost all of it the swamp eco. Not a city grid.

**E12S6.** 33-cut, 48 ramparts, 124 roads. 6 shallow re-derived exact, all ramparted, declared. Film `extGhost` says 6 remain. Mineral `18,8` **on** the network (roads at `19,8` and `18,7`); why and flag agree. Weak-battery 9-step declared.

**E7S5.** 14-cut, 19 ramparts, 99 roads. Covered-detour: pair `27,19` / `29,18` **are on the cut**. Page and film unjudged sentence match: worst absolute detour 33, every gated pair covered. Sealed recovery note describes a take (`16,10` withdrawn, 4 deep returned); the shipped board seals nothing leftover. Long eco arms, small shell. The roads are the sources, not spam.

**E9S2.** 21-cut, 40 ramparts, 68 roads. 15 shallow re-derived exact. 7 redundant cut tiles re-derived: `22,25 22,26 31,2 35,2 36,2 42,24 47,24`. Sealed `36,10` re-derived. Lab-road-eat declared. `ctrlParks` 8→7 because `25,23` is now an extension — the tile is an extension. Film says *"6 placed road-blind (fallback)"* — `corridorFallback === 6`, and every shipped extension has a D4 road **now**. Placement history, not a shipped D4-blind set. Two 2×2 extension squares; both have corridor roads. Ruled pattern, not a brick.

---

## Visual / intent

No sampled room is a checkerboard, a solid brick, or a maze. Extension mass is corridor-flanked (0 D4-blind extensions in all 12). 2×2 squares exist in E11S1 (3), E12S6 (3), E9S2 (2) and they sit on a road spine. E21S7 is a forced hallway. E12S7 / E7S5 / E11S1 spend roads on eco, not on a city grid. Towers are not a hub clump (sample clumps 1–4; the three fleet-worst still declare).

Nothing in the sample looks accidental. The ugly rooms are ugly for a named, declared reason (E3S4 lap 2.83, E9S2 15 shallow, E7S5 detour 33, E21S7 a 67-tile canyon wall).

---

## Findings

### M1 — MEDIUM, not board-affecting

**The ruling's record is not held to the standard the ruling named.**

`cutPasses.{sealCritical, ramparts}` and per-marker `rampartsDeleted` (sum held, parts free) mutate in silence. `kind` is not an enum; it is a filter the sum happens to use. Three leaves of the record that stands in for the undeclared adoptions are decorative.

Evidence: E13S3 `sealCritical += 999` → pass; prune `ramparts := 0` → pass; swap the two prune markers' `rampartsDeleted` → pass. Control (why-append) bites.

This is 141(c)'s class on the object criticism 134(b) spent a round making load-bearing. A residue list that does not name these three leaves is too flattering to the ruling.

### 141(d) confirmed, restated — MEDIUM narration, not board-affecting, already filed

E2S5 / E5S1 / E5S3 published `mineralOffNetworkWhy` is **false of the board**. The exemption still passes a `1 → 99` nearest-road rewrite on E2S5. See the mineral section. Do not re-file as new; do not leave the "census disagreement" wording standing.

### L1 — LOW, not board-affecting

**Film `roadsPrune` caption prints two prune counts that are defined to differ.**

`plan.mjs` composes `NOTES.roadsPrune` as `` `${ghosts} tiles deleted … meta.walls.pruned = ${pruned}` ``. In 7 rooms `prunedGhosts ≠ pruned` because of the 12-tile transient class:

`E11S2 12/13 · E13S3 8/10 · E18S3 14/15 · E2S5 13/16 · E2S7 10/11 · E5S3 10/12 · E9S8 16/18`

E2S7 is in this round's hash sample. Both numbers are true of different identities. The sentence does not say they are different identities. Criticism 27 named the identities; the film still jams them into one clause. Not a new class.

---

## What this is not

- Not a board fail. 60/60, sealed live wall, D4-faced extensions, mandated stamps placed, mineral seats reachable, film taxonomy vs board 0/12.
- Not a 134(b) count fail. 34 adds, 27 rooms, E15S1 and E5S6 remove-only, both cuts leak, both live walls hold.
- Not a film/page disagreement on mobility unjudged text in E7S5 or the 117-class rooms in the sample. The three channels that I read (film `NOTES.ramparts`, page `mob-sub`, declaration) say the same reason.
- Not an anti-pattern auto-fail. No maze, no brick, no road-on-every-rampart, no silent cap in the sample.

---

## Bottom line

Boards are clean. The gallery in the sample is readable and matches the tiles. 134(b) as a **number** is done. 134(b) as a **ruling** over-claimed the record. 141(d) is a board-lie held by an exemption, not a definitional residue. One film caption still wears criticism 27's two counts as if they were one.

If the next round only closes M1's three leaves and restates 141(d) as "the why is false of the structure lists, and the suffix+seat door still opens," this reviewer has nothing else to stand on from this sample.
