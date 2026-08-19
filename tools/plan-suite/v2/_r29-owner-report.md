# Round 29 owner-voice review

Hostile. Fresh. Re-derived from `plans-hub.json` + `_r28-mech/rooms.json` terrain. Did not trust meta, did not import `validate.mjs` for board facts, did not cherry-pick rooms. `checkRoom` used only on mutated clones.

Artifact md5 `c2e6039a7ac5816c1c6c40161685354a` — matches the brief. 172/172 rooms, 0 errors. Fleet physicals re-summed off the structure lists: **10,320 extensions · 14,100 roads · 8,208 ramparts · 300 declarations · 236 notes**. Same numbers as r26–r28. Boards did not move.

**Verdict.** No board defect in the sample. No film-vs-board caption lie in the sample. 134(b) is still 34 adds / 27 rooms. 141(d) is **closed**: the three rooms now tell the truth of the structure lists, and the suffix+seat door is dead. L1 is closed. The ruling's *record* is **still not** as strong as a declaration: `cutPasses` leaves are bounded, not derived — `sealCritical += 1`, `sealCritical := adds`, `sealCritical := rampN`, prune `ramparts += 8`, and a sum-preserving `rampartsDeleted` swap all **ESCAPE**. Named residues 93 recovers / 98 forge-`fullRun` / exact pick are still doors.

Throwaway probes: `tools/plan-suite/v2/_r29-owner/` (not committed).

---

## Sample

`h(room) = fmix32(fnv1a32("round29-owner|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|------|------|---|
| 1 | **E21S4** | 15,283,637 |
| 2 | **E2S6** | 23,981,009 |
| 3 | **E3S4** | 67,217,903 |
| 4 | **E9S9** | 68,811,244 |
| 5 | **E1S1** | 77,583,057 |

Also churn-read as required: **E12S1 E15S4 E11S1 E12S7 E12S6 E7S5 E9S2** and golden **E2S7 E1S4**.

Terrain dump: 172 rooms, same world the suite used. Mongo was up; the dump was enough.

---

## 134(b) — 34 adds, 27 rooms. Still true.

Re-walked every `meta.shell.cutDrift` row. Did not read the doc's 27.

- **34 adds**, all `pass: layer7-reconcileSeal`. Zero `layer7b-reconcileSeal` adds.
- **46 removes**, all `pass: layer7-inertPrune`.
- **27 rooms adopt.** 29 rooms drift. Remove-only, still: **E15S1, E5S6**.
- Independent exterior flood: shipped **cut** reaches the sitter in exactly those two. Shipped **ramparts** reach the sitter in **0 of 172 in the sample**, and in 0 of those two. Freeze flood holds both (E15S1 freeze 62, cut 61; E5S6 freeze 26, cut 23).
- Independent single-removal seal test on the 34 add tiles: **34/34 fire**.
- `why` vs the producer's `(op, pass)` generator, compared whole: **0 mismatches** in 80 rows.
- Replay identity `cutAtFreeze + adds − removes == shipped cut`: **0 failures** in 172.

The 27 adopting rooms (same set as r28):

`E13S3 E13S4 E13S5 E14S9 E15S4 E15S5 E16S2 E17S2 E17S5 E18S6 E18S8 E18S9 E19S8 E1S2 E1S6 E21S2 E21S8 E2S1 E2S5 E2S6 E3S6 E5S7 E6S3 E6S4 E6S5 E8S7 E9S8`

E2S6 (in this hash sample) is a net-zero-count adopter: freeze 61, shipped 61, two removes (`7,37 7,38`) and two adds (`5,36 6,36`). Different tiles. Not churn of the same tile.

**134(b) as a count is still closed.**

---

## Is the ruling's record as strong as a declaration?

The ruling's own words: *every leaf re-derived or bounded, every sentence generated.* Round 28 claimed the leftover leaves were bounded. They are.

`cutDrift` rows (`x y op pass why`) still hold. Why-append BITES. Absorb-one-add-into-freeze BITES (minimality). That half is still a declaration.

`cutPasses` markers still have seven leaves: `pass kind ramparts rampartsDeleted adds removes sealCritical`.

Mutated clones, ran `checkRoom`, ignored fleet-median noise:

| attack | result |
|--------|--------|
| `sealCritical += 999` | **BITES** (now over `rampN`) |
| prune `ramparts := 0` | **BITES** (`deleted > ramparts`) |
| `kind` rewritten to `"reviewer"` | **BITES** (kind is a function of pass) |
| `cutDrift.why` append | BITES (control) |
| `sealCritical += 1` inside `[adds, rampN]` | **ESCAPE** |
| `sealCritical := adds` (lower bound) | **ESCAPE** |
| `sealCritical := rampN` (upper bound) | **ESCAPE** |
| prune `ramparts += 8` (deleted held) | **ESCAPE** |
| swap the two prune markers' `rampartsDeleted` (sum preserved, each `≥ removes`) | **ESCAPE** |

Slack is fleet-wide. E11S1's reconcile markers ship `sealCritical=32` over 43 ramparts and 0 adds — eleven free integers up, thirty-two down. Every room in the slack sample has the same shape.

`adds`/`removes` still bind to the drift rows. The prune-markers' `rampartsDeleted` **sum** still binds to `inertPruned.size`. `kind` is now an enum of the pass name. The other three leaves — per-pass `sealCritical` anywhere in `[adds, rampN]`, per-pass `ramparts` anywhere `≥ deleted`, per-pass `rampartsDeleted` once the sum and the `≥ removes` floor are held — are free integers inside a range.

A declaration census would have classed the exact numbers or refused to start. "Bounded" is what the ledger wrote. It is not the standard the ruling named for a record standing in for a declaration.

**Answer: no.** The row is held. The unbounded exploits are dead. The marker is still a log with three decorative columns.

---

## 141(d) — E2S5 E5S1 E5S3. Closed.

Independent ring census: `holds` = every structure type on the tile, `net` = roads ∪ containers minus the seat, nearest road = min chebyshev over `structures.road` with the documented tie-break. Fleet: **172/172 exact**. 133 OFF, 39 ON. Zero ring mismatches. Zero seat-road lies.

**E2S5** seat `27,23`. The seat tile **itself carries a road**. Published why now says so. Ring matches. Suffix is the on-network sentence.

**E5S3** seat `32,11`. Same class. Seat carries a road. Published says so. Ring matches.

**E5S1** seat `29,30`. Published ring now says `28,30 (road)` — the conduct-bridge tile r28 called a lie. Derived touch `{28,30, 28,31, 28,29}` (3). Published touch 3. Nearest `28,29 @ 1` is the official tie-break, not a dodge.

Mutations:

| attack | result |
|--------|--------|
| E5S1 append `" THE WALL IS FREE."` | **BITES** (whole-value) |
| E5S3 swap in E5S1's sentence | **BITES** |
| E11S1 invert suffix, keep seat | **BITES** |
| E5S1 `"1 step(s)" → "99 step(s)"` | **BITES** |
| E2S5 `"1 step(s)" → "99 step(s)"` | no-op (clause gone; seat-road phrase has no steps) |

The exemption is gone. The three rooms no longer lie. Do not re-file.

---

## Other 141 residues, re-probed

**(a)** Unproved as a theorem. Absorb-one-add-into-freeze on E13S3 **BITES** (two freeze tiles become droppable). On this fleet the freeze-cut is a minimal seal. I did not drop all 7,246 freeze tiles. Accept the fleet property as stated.

**(c)** Cheap presence the r28 mech flipped: `nukerHubDist := 1` BITES. `protectRadius := 0` BITES. `battlementUnreachable` count+tiles zeroed together BITES (interior walk). `cutAdopted` planted rampart BITES (`⊆ cutDrift` adds). That half of 141(c) is closed.

**Exact pick** is the leftover they named: `protectRadius` flipped E11S1 `12 → 8` (legal enum) **ESCAPE**. `baseCut += 1` with `priceyWall` kept consistent **ESCAPE**. `protectRadius` is an enum, not this room's pick. `baseCut` is `integer ≥ 1`, not layer 2's cut. Already filed.

**(e)** `seed` is absent in **0/172** rooms (`meta.shell.seed` and `meta.seed` both empty). Inventing one BITES (unknown leaf). Film captions still print `seed (x,y) → hub (x,y)` (E2S7: `seed (13,27) → hub (13,27)`). The coordinates exist. Why that seed won is still unre-derivable. Already filed.

**(b)** 134(c)/(d) untouched. 88 **BITES** (fatter discarded-rung mobility + regen on E11S2). 98 invent-shrink on a plain room **BITES**. 98 residue — forge the whole `fullRun` then invent a consistent shrink — **ESCAPE** on E11S3. 93 invent-holder **BITES**. 93 `recovers := pocket-cap` on taken E15S6, both `sealedRecovery` and the note-record copy, **ESCAPE**. Already filed.

---

## Per-room (enclosure, cut, shallow, mineral, film, page)

Method, every room: exterior flood over `cut`, over `cutAtFreeze`, over shipped ramparts (own D8 flood, not `shared.mjs`); depth from that flood; mineral seat = the container chebyshev ≤ 1 of the mineral; film rampart captions classified from the board (cut → container+outside/inside+depth → standDenial → other occupant → unclassified) and compared to every `stage:"ramparts"` cell; page counts / notes / shortfalls read out of the HTML.

**No sampled room leaks the sitter or any spawn/storage/terminal/tower/nuker/lab/extension through the shipped wall.** Freeze-flood "leaks" on remote links are the bubbles — those tiles are outside the cut and under a personal rampart. Not a leak.

**Film vs board rampart captions: 0 disagreements, 0 unpainted shipped ramparts, 0 extra painted tiles**, all 14 rooms.

**Shallow extensions** re-derived against live depth < 4:

| room | derived | published | ramparted |
|------|---------|-----------|-----------|
| E12S6 | 6 | 6 | 6/6 |
| E9S2 | 15 | 15 | 15/15 |
| E11S1 | 0 | 0 (note is a search note: `shallowNow=0`) | — |
| E9S9 | 0 | 0 (note is a search note: `shallowNow=0`, l6 moved 1, l7 moved 5) | — |
| other 10 | 0 | 0 | — |

**Mineral seat == `meta.mineralSeat` == the shipped container** in all 14. Approach is a walkable D8 neighbour in all 14. E15S4 seat `23,6` is **inside** at live depth 11, no rampart, `mineralBubble=0` — correct; the film's empty seat facets match.

**Lab diamond:** 10 labs, 4×4 bbox, 6 holes in all 14. Mandated stamp. Haul cheb 2–5 except **E9S9 haul 7**, declared `labs/lab-haul` (17 hauler tiles, anti orientation). E9S2 declares `labs/lab-road-eat` for 3 displaced road tiles. Not a finding against the stamp.

**Hub trio:** storage + terminal + hub-link all cheb ≤ 1 of the sitter in all 14. Spawns fanned (min pairwise cheb ≥ 2). E15S4 declares `spawnFan/sector` 58° vs 60° — re-computed around hub `23,21`: min sep **57.53°**. True.

L1 film caption, E2S7 HTML: `"10 tiles erased — roadLayer tags with no shipped road, the set this stage deletes · 11 tiles ship no road (10 ghosts this film erases + 1 transient, laid and deleted inside layer 7 so no layer tagged them)"`. Both identities named. Jamming `prunedGhosts := pruned` BITES. Zeroing `prunedTransient` BITES.

### Hash five

**E21S4.** 34-cut, 36 ramparts, 69 roads, 60/60. Compact NE pocket at sitter `41,12`. Labs haul 2. Controller enclosed east. Both sources inside. Mineral `33,27` off-network south, declared. **0 road+rampart** — nothing eco has to cross the wall. 0 sealed. 0 redundant. 0 2×2. Film: 34 crossing / 1 seat.outside / 1 cover (link). Quiet, intentional. The nicest room in the sample.

**E2S6.** 61-cut, 69 ramparts, 76 roads. A basin: long wall, controller north outside, sources in opposite corners. Mobility 1.29 over 1.2, declared; film/page agree. 1 unreachable battlement at `6,36` (link on the cut), declared. Eco 21-tile controller walk, declared. Net-zero-count adoption (2+2). 0 sealed. Visual is a canyon wall, not a second shell. 0 2×2. 1 road+rampart.

**E3S4.** 23-cut, 27 ramparts, 79 roads. Mobility **2.83** declared (page and film agree). Controller enclosed. Mineral `32,8` off-network. 0 sealed. 0 redundant. Core is tight; the cost is the lap, and the room says so. Same room r28 hashed. Still ugly for a named reason.

**E9S9.** 49-cut, 52 ramparts, 90 roads. Mineral `42,19` **on** the network (roads at `41,19 43,20 43,18`); why and flag agree. Labs 17 hauler tiles from the hub, declared. Mobility 1.94 declared. Shallow *note* is a relocation log (`shallowNow=0`); 0 remain. One 2×2 extension square on a road spine. Sealed-floor recovered, declared. The far diamond is the ugliness, and it is priced.

**E1S1.** 45-cut, 54 ramparts, 83 roads. Controller 31-tile walk NE, declared eco. Mineral `15,17` off-network. Sealed floor not recovered, declared. 0 shallow. 0 2×2. Hub SW, wall following the terrain, not a stamp.

### Mandated churn

**E12S1.** Criticism 129's smoking-gun room. Film: 37 crossing / 2 seat.outside / 1 seat.inside / 5 ring / 1 cover. Independent classifier agrees tile for tile. `22,40` mineral seat outside. Page 46 ramparts · 91 roads match the lists. Eco is a 21-tile controller walk, declared.

**E15S4.** 29-cut, all 29 singly load-bearing. Note *"NO CUT TILE IS REDUNDANT"* is true of the shipped cut. This room **does** adopt (it is in the 27); net count freeze=shipped because it also prunes. Weak-battery 9-step declared. Spawn fan 58° declared and re-derived. Mineral `23,6` off-network, deep inside, no bubble owed.

**E11S1.** 32-cut, 43 ramparts, 101 roads. Shallow note: `shallowNow=0` of 60. Sealed not recovered, declared. Eco 27-tile controller walk, declared. 3 2×2 squares on a road spine. 0 D4-blind.

**E12S7.** 35-cut, 45 ramparts, 116 roads. 5 redundant cut tiles re-derived: `22,19 23,19 23,20 23,21 23,22` — the note's 5. Mineral seat `25,32`; `25,33` is a tower. Off-network, declared. Weak-battery 10-step declared. Roads are swamp eco, not a city grid.

**E12S6.** 33-cut, 48 ramparts, 124 roads. 6 shallow re-derived exact, all ramparted, declared. Mineral `18,8` **on** the network; why and flag agree. Weak-battery 9-step declared. 3 2×2 on a spine.

**E7S5.** 14-cut, 19 ramparts, 99 roads. Covered-detour: pair `27,19` / `29,18` **are on the cut**. Page unjudged sentence matches: worst absolute detour 33, every gated pair covered. Sealed recovery took; shipped board seals nothing leftover. Long eco arms, small shell.

**E9S2.** 21-cut, 40 ramparts, 68 roads. 15 shallow re-derived exact. 7 redundant cut tiles re-derived: `22,25 22,26 31,2 35,2 36,2 42,24 47,24`. Lab-road-eat declared. `ctrlParks` 8→7 because `25,23` is an extension. Two 2×2 squares on a corridor. Ruled pattern, not a brick.

**E2S7** (golden). 18-cut, 21 ramparts, 72 roads. Clean pocket. 0 redundant. Mineral `32,3` off-network. RoadsPrune caption now names ghosts 10 and pruned 11 as different sets. Quiet.

**E1S4** (golden). 26-cut, 34 ramparts, 63 roads. West corridor of extensions, long south road to the controller, mineral far SW off-network. 0 sealed. Quiet, intentional.

---

## Visual / intent

No sampled room is a checkerboard, a solid brick, or a maze. Extension mass is corridor-flanked (**0 D4-blind extensions in all 14**). 2×2 squares exist in E11S1 (3), E12S6 (3), E9S2 (2), E9S9 (1) and they sit on a road spine. E2S6 is a forced basin wall. E12S7 / E7S5 / E11S1 / E1S1 spend roads on eco, not on a city grid. Towers are not a hub clump (sample clumps 1–4). E21S4 has no road-on-rampart at all, and that is because nothing has to leave.

Nothing in the sample looks accidental. The ugly rooms are ugly for a named, declared reason (E3S4 lap 2.83, E9S2 15 shallow, E7S5 detour 33, E2S6 a 61-tile basin, E9S9 labs at haul 7, E1S1 a 31-tile controller walk).

---

## Findings

### M1 leftover — MEDIUM, not board-affecting

**The ruling's record is still not held to the standard the ruling named.**

Round 28 closed the unbounded exploits (`+= 999`, `ramparts := 0`, kind rewrite). The three leaves are now *bounded*. They are not *derived*. `sealCritical` is any integer in `[adds, rampN]`. Prune `ramparts` is any integer `≥ deleted`. Per-marker `rampartsDeleted` is free once the sum equals `inertPruned` and each marker stays `≥ removes`.

Evidence: E11S1 `sealCritical += 1` → pass; `:= adds` → pass; `:= rampN` → pass; prune `ramparts += 8` → pass; E11S6 swap the two prune markers' `rampartsDeleted` → pass. Controls (why-append, `+= 999`, `ramparts := 0`, kind rewrite) bite.

This is the leftover the brief asked about. A residue list that writes "leaves are bounded" and stops is too flattering to the ruling.

### Named residues, confirmed, not re-filed

- **93 recovers** on a taken room: E15S6 `fixedHolders.recovers := pocket-cap` (2→72) on both copies **ESCAPE**. Invent-holder BITES. Residue is the pre-take number inside `[1, cap]`.
- **98 forge-`fullRun`** then invent a consistent shrink: E11S3 **ESCAPE**. Invent-on-a-free-walk BITES.
- **Exact pick:** `protectRadius` 12→8 ESCAPE; `baseCut += 1` ESCAPE.
- **134(a)** still a fleet property. **141(e)** seed dropped, not derived. **134(c)/(d)** untouched.

---

## What this is not

- Not a board fail. 60/60, sealed live wall, D4-faced extensions, mandated stamps placed, mineral seats reachable, film taxonomy vs board 0/14.
- Not a 134(b) count fail. 34 adds, 27 rooms, E15S1 and E5S6 remove-only, both cuts leak, both live walls hold.
- Not a 141(d) lie. The three rooms match the official census. The door is shut.
- Not an L1 jam. The prune caption names both identities; jamming them bites.
- Not a film/page disagreement on mobility unjudged text in E7S5 or the sample. Film `NOTES.ramparts`, page `mob-sub`, declaration say the same reason.
- Not an anti-pattern auto-fail. No maze, no brick, no road-on-every-rampart, no silent cap in the sample.

---

## Bottom line

Boards are clean. The gallery in the sample is readable and matches the tiles. 134(b) as a **number** stays done. 141(d) and L1 and the cheap MF6 flips and 88 and the *stated* 93/98 are done. 134(b) as a **ruling** still over-claims the record: three `cutPasses` leaves are free integers inside a range. The named residues (93 recovers, 98 forge-`fullRun`, exact pick, 134(a,c,d), 141(e)) are still doors.

I would **not** stand down for a clean round. A clean round is zero findings. The leftover on the ruling's own record is a finding, and the named residues are still open. If the next pass derives the three `cutPasses` leaves from the board (seal-critical count of that invocation, ramparts-before, per-pass deleted) instead of bounding them, this reviewer has nothing new from this sample — only the residues already on the list.
