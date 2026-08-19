# Round 39 owner-voice review

Hostile. Fresh. Re-derived from `plans-hub.json` + `_r28-mech/rooms.json` terrain. Did not trust meta, did not import `validate.mjs` for board facts, did not cherry-pick rooms. `checkRoom` used only on mutated clones. Fleet-median noise stripped. Docker off.

Artifact md5 `8e5d6725885bd3f3731379bedf408326` — matches the brief. Same bytes as r32–r38. Tree HEAD is `80601a0` (r29p17: `stubCap` rich/poor walk / `floorUngated` freeze mass-free / `radii` `parkCap` `takeTowerSwap` composeOpts), parent `0b81233` (r29p16 hubDistCap ladder). 172/172 rooms, 0 errors. Fleet physicals re-summed off the structure lists: **10,320 extensions · 14,100 roads · 8,208 ramparts · 300 declarations · 236 notes**. Same numbers as r26–r38. Boards did not move. Baseline `checkRoom` (fleet-median stripped): **pass 172/172**.

**Verdict.** No board defect in the sample. No film-vs-board caption lie in the sample. 134(b) is still 34 adds / 27 rooms. r29p17 closes the *stated* leftover flattens: `stubCap` 43↔51 **BITES** (fleet 12/12 of the poor rooms, 160/160 of the rich), `floorUngated := 0` **BITES** (fleet 172/172, both reflow copies), `radii` rewrite / plant **BITES** (10 present + the absent-plant), `parkCap := 0` **BITES** (2/2), `takeTowerSwap.to → 1,1` **BITES** (3/3). `seedScore` still **BITES**. The p16 four + p15 ten + p14 nine + p12 five still **BITES**. The named 88 leak + `complete=false` still **BITES**. The named 98 one-list append still **BITES**. They do **not** close the classes. Twin of the named 98 append (also write `lane.reserved`, keep `wanted > tiles`) **ESCAPE**. `wanted += 1` **ESCAPE**. Sealing same-lap nudge `29,33→28,34` **ESCAPE**. `hubDistCap` 16→19 in-enum **ESCAPE** (fleet 170/170). Remaining META_DARK presence still flips 172/172 silent once `baseCut`+`shallowNow` are left alone. Exact pick still unread. `protectRadius` is still an enum. `hubDistCap` is still an enum. `stubCap` is now the pool walk. `parkCap` is `ctrlParkFloorCap`. `radii` is the bonus table. `takeTowerSwap.to` is a shipped tower. `cutPasses.rampartsDeleted` split still a log.

Throwaway probes: `tools/plan-suite/v2/_r39-owner/` (not committed).

---

## Sample

`h(room) = fmix32(fnv1a32("round39-owner|" + room))` over the 172 names. Lowest five (not cherry-picked):

| rank | room | h |
|------|------|---|
| 1 | **E18S4** | 32,476,881 |
| 2 | **E14S6** | 64,628,679 |
| 3 | **E2S7** | 127,474,597 |
| 4 | **E15S5** | 151,850,140 |
| 5 | **E1S3** | 160,683,097 |

Also churn-read as required: **E11S1 E2S7 E1S4**. Seven unique rooms (E2S7 is both #3 and mandated).

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

The 27 adopting rooms (same set as r28–r38):

`E13S3 E13S4 E13S5 E14S9 E15S4 E15S5 E16S2 E17S2 E17S5 E18S6 E18S8 E18S9 E19S8 E1S2 E1S6 E21S2 E21S8 E2S1 E2S5 E2S6 E3S6 E5S7 E6S3 E6S4 E6S5 E8S7 E9S8`

One of this hash sample adopts: **E15S5** (remove `15,25` / `16,25`, add `17,24`).

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

## Closed since r38 — re-probed

**r29p17 / five leftover presence names.** Mutated on rooms that ship them:

| attack | room | result |
|--------|------|--------|
| `stubCap` 43 → 51 | E11S1 (pool wants 43) | **BITES** |
| `stubCap` 51 → 43 | E11S2 (pool wants 51) | **BITES** |
| `floorUngated := 0` both copies | E11S1 (1 vs freeze mass-free) | **BITES** |
| `radii` rewritten `[1,2,3]` | E13S8 (bonus 25 → WIDE) | **BITES** |
| `radii` planted on absent | E11S1 (bonus none) | **BITES** |
| `parkCap := 0` | E12S5 (2 vs `ctrlParkFloorCap` 2) | **BITES** |
| `takeTowerSwap.to → 1,1` | E14S1 | **BITES** |

Fleet: `stubCap` 43→51 **fail 12**, pass 160 (the 160 already-51 rooms were not mutated). `stubCap` 51→43 **fail 160**, pass 12. `floorUngated := 0` **fail 172/172** (344 events; both reflow copies). `radii` rewritten on the 10 rooms that ship a list: **fail 10**. `parkCap := 0` **fail 2** (E12S5, E9S2). `takeTowerSwap.to → 1,1` **fail 3** (E14S1, E3S5, E4S3). The named flatten is done.

Residues of the named close, not the named flatten:

| attack | result |
|--------|--------|
| `parkCap` is `ctrlParkFloorCap` (2 rooms; identity) | named close, not the reservation walk |
| `radii` is the escalation table for `needDeepBonus` (8× WIDE, 2× late) | named close, not the bonus pick |
| `takeTowerSwap.to` is a shipped tower | named close, not the take |

`stubCap` is no longer an enum. 12 rooms ship 43, 160 ship 51. The pool is deep ext-capable tiles / 60 ≥ 1.5, cohesion-capped at 18, so it does not depend on the unread `hubDistCap` pick. `floorUngated` is the freeze mass-free ungated walk with extensions not yet placed. Those two are walks. The other three are identities.

**r29p16 / three leftover presence names.** Still BITES.

| attack | room | result |
|--------|------|--------|
| `hubDistCap := 17` (off-ladder) | E11S1 (was 16) | **BITES** |
| `hubDistCap := 0` | E11S1 | **BITES** (`deepReach` vs `min(2,18)`) |
| `lapCeilingFloor := 0` | E11S1 (1.2 vs `MOBILITY_TARGET`) | **BITES** |
| `corridorPlaced := 0` keep `fallback=0` | E11S1 (60/0) | **BITES** |

Fleet: `hubDistCap := 17` **fail 172/172**. `lapCeilingFloor := 0` **fail 172/172** (344 events). `corridorPlaced := 0` on the 168 rooms that ship 60/0: **fail 168**, pass 4. `hubDistCap` 16→19 on all 170: **pass 172/172**. `corridorPlaced := 0` **and** `fallback := 1` **ESCAPE**.

**r29p15 / ten leftover presence names + `seedScore`.** Still BITES.

| attack | room | result |
|--------|------|--------|
| `floorGated := 0` | E11S2 (1.5 vs mass-free `maxGated`) | **BITES** |
| `floorOver := 0` | E11S2 (15 vs mass-free ungated over-target pairs) | **BITES** |
| `floorOverGated := 0` | E11S2 (3 vs mass-free gated over-target pairs) | **BITES** |
| `worst.freeDin := 0` | E11S1 (1 vs mass-free walk of the published worst pair) | **BITES** |
| `massAdds := 0` both copies | E11S7 (3 vs built − mass-free of that pair) | **BITES** |
| `roadOrder.maxDist := 0` | E11S1 (32 vs sitter-to-road BFS) | **BITES** |
| `deepReach := 0` | E11S1 (18 vs `min(hubDistCap+2, 18)`) | **BITES** |
| `stubCap := 0` | E11S1 (43 vs the pool walk) | **BITES** |
| `mineralSeatAtReservation → 1,1` | E11S1 (was 24,8, mineral 23,7) | **BITES** |
| `mineralApproachAtReservation → 1,1` | E11S1 (was 25,9, seat 24,8) | **BITES** |
| `seedScore := 0` | E11S1 (−92.9) | **BITES** |
| `seedScore += 999` | E11S1 | **BITES** |

Fleet forge of those ten: **fail 172/172**. Fleet `seedScore := 0`: **fail 172/172**. Seat+approach moved together to another cheb-1 / D8 pair still **ESCAPE**. Approach to another D8 of the same seat still **ESCAPE**.

**r29p14 / nine leftover presence names (+ `boundLap`).** Still BITES. Fleet **fail 172/172**.

**r29p13 / mineralContainer · minDmgPicked · servedFree · stitched flag.** Still BITES. Fleet flatten of the three: **fail 172/172**. Fleet `stitched := 2`: **fail 172/172**.

**r29p12 / five leftover presence names.** Still BITES. Fleet flatten of those five: **fail 172/172**.

**r29p11 / 88 leak skip.** E11S2 last fat has `20,9` and is complete. Nudge `20,9→19,9` (sitter leaks, lap 0) **BITES**. Same nudge **and** `complete=false` + regen **BITES** — first fail is `leaks the sitter` (`complete or not`). Fleet: **0** incomplete discarded rungs, **0** of 327 complete discarded cuts leak the sitter.

**93 recovers.** Taken-room `fixedHolders` ship `{type, x, y}` only. Invent holder `{lab,1,1,99/99}` **BITES**. Plant `recovers=2` / `recoversDeep=2` on E15S6's four labs + note twin **BITES**.

**98 named forges.** Extra reserved `99,99` / `1,1` / `0,0` + fake-round **BITES**. Invent-shrink on a free walk **BITES**. Delete `fullRun` **BITES**. 60/0 `shallow` rewrite **BITES**. Dropped-room `99,99` **BITES**. `wanted := tiles` **BITES**.

**98 r29p10 as written.** E11S1 append `"19,27"` to `fullRun.reserved` only, `tiles`/`wanted` synced to 7. **BITES**. This is the named close. It is not the class. See M1.

**88 r29p7 / r29p8 / r29p10 leak.** Fatter mobility `2.5 → 0.5` + regen **BITES**. Last-fat shipped-cut + `ramparts:=cutlen` **BITES**. 8-tile box, lap 0, keep ramparts=50 **BITES**. Leaky nudge `20,9→19,9` (sitter leaks, `complete` stays true) **BITES**.

**r29p9.** `nukerInWindow` flip **BITES**. `nukeWindow.center → 1,1` **BITES**. `mineralSeatNetTiles = ["1,1"]` **BITES**. `coveredDetourDeclared` flip **BITES**.

---

## Per-room (enclosure, cut, shallow, mineral, film, page)

Method, every room: exterior flood over `cut`, over `cutAtFreeze`, over shipped ramparts (own D8 flood, not `shared.mjs`); depth from that flood; mineral seat = the container chebyshev ≤ 1 of the mineral; film rampart captions classified from the board (cut → container+outside/inside+depth against the freeze flood → standDenial → other occupant → unclassified) and compared to every `stage:"ramparts"` cell; page counts / notes / shortfalls read out of the HTML.

**No sampled room leaks the sitter or any spawn/storage/terminal/tower/nuker/lab/extension through the shipped wall.** Freeze-flood holds all 7. Live-wall holds all 7. Cut-flood leaks the sitter only on the two known remove-only rooms (E15S1, E5S6), neither in this sample. The 166 `leaksCut` core tiles in the fleet census are exactly those two rooms' entire cores. Live wall holds both.

**Film vs board rampart captions: 0 disagreements, 0 unpainted shipped ramparts, 0 extra painted tiles**, all 7 rooms.

**Shallow extensions** re-derived against live depth < 4: **0** in all 7. Published 0. E11S1's `shallowExt` note is a search note. E14S6's `shallowExt` note is a search note.

**Mineral seat == `meta.mineralSeat` == the shipped container** in all 7. Approach is a walkable D8 neighbour in all 7. Fleet mineral-why vs official census: **172/172 exact**.

**Lab diamond:** 10 labs, 4×4 bbox, 6 holes in all 7. Mandated stamp. Haul cheb 2–5. E11S1 haul 5, E18S4 / E14S6 / E2S7 / E1S3 / E1S4 haul 3, E15S5 haul 2.

**Hub trio:** storage + terminal + hub-link all cheb ≤ 1 of the sitter in all 7. Spawns fanned (min pairwise cheb ≥ 2).

Road+rampart taxonomy, independent walk: **274 = 231 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified**, 153 rooms, median 2, max 5.

### Hash five

**E18S4.** 53-cut, 63 ramparts, 88 roads. `baseCut=51 ≠ 53`. `protectRadius=8`. As-built gated lap **2.5**, declared. Controller unenclosed. Mineral `36,29` off-network, declared (seat `35,30`). Seed=hub `27,27`. `seedScore=-26.7`. **4 2×2** on a road spine. 0 D4-blind. Labs haul 3. Film: 53 crossing / 2 cover / 2 seat.outside / 2 seat.inside / 4 ring. Fat last rungs `3.67/68/59` ×2, then `2.4/74/66` against shipped `2.5/63/53`. The last discarded 66-tile neighbour is prettier than the shipped 2.5 and the room does not take it. The pick is 51 against a freeze and a shipped cut of 53. Hash #1 is a 53-wall, a declared 2.5 lap, and an unread last fat.

**E14S6.** 64-cut, 73 ramparts, 78 roads. `baseCut=64` = freeze = cut (pricey). `protectRadius=9`. As-built gated lap **6.67**, declared (covered-detour named). Controller unenclosed. Mineral `20,19` off-network, declared (seat `19,20`). Seed=hub `22,32`. `seedScore=-19.4`. **2 2×2** on a road spine. 0 D4-blind. Labs haul 3. Film: 64 crossing / 4 ring / 3 seat.outside / 2 cover. Fat last rungs `3.17/81/75` ×2, then `4/88/84` against shipped `5/73/64` (built 6.67). The 64-tile wall and the 6.67 lap are the basin tax, and the room says so. The last discarded 84-tile neighbour is still free.

**E2S7** (golden, and hash #3). 18-cut, 21 ramparts, 72 roads. `baseCut=18` = freeze = cut. `protectRadius=12`. Clean pocket. 0 redundant. Mineral `33,4` off-network (seat `32,3`). Seed=hub `13,27`. `seedScore=-21.5`. Labs haul 3. Quiet.

**E15S5.** 19-cut, 23 ramparts, 87 roads. Adopter (in the 27): freeze 20 → shipped 19, remove `15,25` / `16,25`, add `17,24`. `baseCut=20` = freeze ≠ cut. `protectRadius=12`. Mobility 0. Controller enclosed. Mineral `4,29` off-network, declared (seat `5,30`). Seed `37,12` ≠ hub `37,11`. `seedScore=-41.8`. Labs variant `anti`, haul 2. Weak-battery 10-step / 1410 declared. Unreachable wall `17,24` declared (the add). 0 2×2. 0 D4-blind. Film: 19 crossing / 2 seat.outside / 1 cover / 1 seat.inside. Hash #4 is an adopter and an unread pick (20 against a 19-cut). The add is declared as unmanned.

**E1S3.** 58-cut, 60 ramparts, 76 roads. `baseCut=58` = freeze = cut (pricey). `protectRadius=11`. Mobility 0. Controller enclosed. Mineral `25,17` **on** the network (seat `26,16`). Seed=hub `34,14`. `seedScore=-28`. **0 shortfalls.** 0 2×2. 0 redundant. 0 D4-blind. Labs haul 3. Film: 58 crossing / 1 cover / 1 seat.outside. The 58-tile wall is the ugliness the room does not price. The mineral being on-network is the one thing this sample does not have to excuse.

### Mandated churn

**E11S1.** 32-cut, 43 ramparts, 101 roads. Real shrink: `fullRun.reserved` === `lane.reserved` === 6 tiles / 2 rounds. `wanted=7`, `used=3`, `ext=60`, `shallow=3`. Suffix COORD list is gone. Seed `25,39` ≠ hub `24,41`. `seedScore=-92.9`. Controller unenclosed. Mineral `23,7` off-network, declared (seat `24,8`). Eco 27-tile controller walk, declared. 3 2×2 on a road spine. 0 D4-blind. Labs haul 5. Film: 32 crossing / 4 seat.outside / 3 cover / 4 ring. Reserved board: `18,27 19,28 19,29 | 24,28 25,27 25,29`. `19,27` is D8 of `18,27` and `19,28` and is not in the set. The 98 residue room, mandated. `stubCap=43` — the p17 witness.

**E1S4** (golden). 26-cut, 34 ramparts, 63 roads. `baseCut=24 ≠ 26`. West corridor of extensions, long south road to the controller, mineral far SW off-network (seat `11,38`). 0 sealed. Quiet, intentional. The pick is 24 against a freeze and a shipped cut of 26.

---

## Visual / intent

No sampled room is a checkerboard, a solid brick, or a maze. Extension mass is corridor-flanked (**0 D4-blind extensions in all 7**). 2×2 squares exist in E18S4 (4), E14S6 (2), E11S1 (3) and they sit on a road spine. E18S4 / E14S6 / E11S1 spend roads on eco, not on a city grid. Towers are not a hub clump except E18S4 (clump 4); the rest of the sample clumps 1–3.

Nothing in the sample looks accidental. The ugly rooms are ugly for a named, declared reason (E18S4 53-tile wall + 2.5 lap, E14S6 64-tile pricey wall + 6.67 lap, E1S3 58-tile pricey wall, E11S1 27-tile controller walk, E15S5 weak-battery + unmanned add) — except the unread pick on E18S4 (`baseCut=51` against a 53-cut) / E15S5 (`baseCut=20` against a 19-cut) / E1S4 (`baseCut=24` against a 26-cut) and the unread last fats on E18S4 (`2.4/74/66` against a shipped 53) and E14S6 (`4/88/84` against a shipped 64), which the rooms do not price as compositions.

---

## Findings

### M1 — MAJOR, not board-affecting

**Criticism 98 residue — reserved is still a free set of floor-touching tiles. The named append BITES. The class ESCAPE.**

**Exploit.** E11S1 after r29p10/p11/p12/p13/p14/p15/p16/p17: `fullRun.reserved` === `lane.reserved` === 6 tiles / 2 rounds. `wanted=7`. The refused tail is a count.

| attack | result |
|--------|--------|
| append `"19,27"` to `fullRun.reserved` only, `tiles`/`wanted` := 7 (r31 as written) | **BITES** |
| named forges `99,99` / `1,1` / `0,0` / invent-shrink / 60/0 / delete board | **BITES** |
| `wanted := tiles` | **BITES** |
| append `"19,27"` to **both** reserved lists, last round, `tiles=7`, `wanted=8` | **ESCAPE** |
| prefix identity-swap `18,27 → 19,27` on both lists + `byRound` | **ESCAPE** |
| `wanted += 1` / `wanted += 999` | **ESCAPE** |
| `premium += 1` / `fullRun.ext += 1` / `fullRun.shallow += 1` / `fullRun.used += 1` | **ESCAPE** |

r29p17 did not touch this. A tile that *is* this room's floor and *touches* the walk can still be added, or swapped for a kept prefix tile, if both lists stay twins. The refused walk is now four unread integers (`wanted`, `used`, `ext`, `shallow`) plus `premium`.

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

`discardedCutSeals` no longer trusts `row.complete`. A leak bites either way. That is the named close. A 42-tile nudged cut that *does* seal is longer than the shipped 37, so the would-have-taken rule returns before it looks. Any other 42-tile COORD list that walks the claimed lap and seals passes. Flipping `complete` on a sealing rung is free. This sample has two more last fats of the same class (E18S4 `2.4/74/66`, E14S6 `4/88/84`).

**Root cause.** Discarded `cutTiles` are a free list held to `enclosureMobility` of themselves, plus "not freeze/shipped", plus "not shorter-and-prettier", plus "seals". The composed enclosure is not on the board. r29p11 gated leaks on the flood, not the flag. It did not bind the list. r29p17 did not touch this.

**Board moved?** No.

### M3 leftover — MEDIUM, not board-affecting

**The ruling's record is still not held to the standard the ruling named, on one column.**

r29p2 derived `sealCritical` and `ramparts-before`. The old slack attacks all BITES. The per-pass `rampartsDeleted` split is still free once the sum and the last-prune identity are held.

Evidence: E11S6 swap the two prune markers' `rampartsDeleted` and set last-prune `ramparts = shipped + new deleted` → pass.

### M4 — MEDIUM, not board-affecting

**Remaining META_DARK `presence` names still flip flattering. 172/172 once `baseCut`+`shallowNow` are left alone.**

**Exploit.** Zeroed every remaining `klass:"presence"` numeric/bool/array leaf across all 172 rooms. 40 presence names, 59 derived (r38 was 44 / 55; p17 moved `floorUngated` / `radii` / `parkCap` / `takeTowerSwap`; `stubCap` was already derived and is now the pool walk). 18 kinds, 1,422 events. `checkRoom`: **fail 172/172**, every first fail is `baseCut := 0`.

Exclude `baseCut` and `shallowNow`: **pass 172/172**. 16 kinds, 1,247 events, silent. Same 172/172 if those two plus all newly derived names (p12–p17) are skipped. The r38 "minus those two is silent" door is still open — p17 reclassified four leaves, it did not derive the class.

Single-room ESCAPE, flattering direction: `deepBudget` decrement-keep-nonzero / cleared. `spurred` decrement 5→4 still ESCAPE — and `spurred` is classified `derived`. `hubDistCap` 16→19 **ESCAPE** — classified `derived`, only an enum. `corridorPlaced := 0` + `fallback := 1` **ESCAPE** — classified `derived`, only an iff. `parkCap` / `radii` / `takeTowerSwap.to` are classified `derived` and are identities.

r29p3 / r29p9 / r29p12 / r29p13 / r29p14 / r29p15 / r29p16 / r29p17 derived names still BITES. The class is still the class. `protectRadius` is *classified* `derived` and is only an enum. `hubDistCap` is *classified* `derived` and is only an enum.

**Root cause.** Criticism 141(c). They derived the five cheap identities this review named. Two of them (`stubCap`, `floorUngated`) are real walks. Three of them are comments that now agree with a sibling. The rest are still comments.

**Board moved?** No.

### M5 — MEDIUM, not board-affecting

**Exact `baseCut` / `protectRadius` / `hubDistCap` pick is unread. `seedScore` is not. `stubCap` is not.**

`protectRadius := 0` **BITES** (not in `RADII_WIDE`). `12 → 6` inside the enum **ESCAPE**. `baseCut := 0` **BITES**. `baseCut += 1` keeping `priceyWall` on the same side of `MAX_CUT=45` **ESCAPE**. `hubDistCap := 17` **BITES** (not in `[16,19,23,999]`). `16 → 19` inside the enum **ESCAPE**. `seedScore := 0` **BITES**. `seedScore += 999` **BITES**. `stubCap` 43→51 **BITES** (the pool walk).

Sample: E18S4 `baseCut=51` / cut=53. E14S6 `baseCut=64` = cut (pricey). E2S7 `baseCut=18` = cut. E15S5 `baseCut=20` / freeze=20 / cut=19. E1S3 `baseCut=58` = cut (pricey). E1S4 `baseCut=24` / cut=26. The pick is not freeze and not the shipped cut. `protectRadius` is an enum, not this room's pick. `hubDistCap` is an enum, not this room's cohesion rung. `seedScore` is the window max. `stubCap` is now the pool. 46 rooms still have seed ≠ hub. The coordinates exist. The score is the walk. The cap is four legal integers.

### Named residues, re-probed, not re-filed as new

- **134(a)** still a fleet property. Independent single-removal over all **7,246** `cutAtFreeze` tiles: **0 loose**. Absorb-one-add-into-freeze on E13S3 **BITES**. A room that shipped a redundant frozen cut tile would still let a forger shrink the anchor. This fleet does not ship one.
- **134(c)** sandwich holds; `ec[1].withheld += 1` + junk tile **BITES**; `ec[2]` zeroed **BITES**. The named hole (empirical identity, no published contract for a future layer) is unchanged.
- **134(d)** still a contract. Independent road+rampart walk: **274 = 231 + 30 + 13 + 0 + 0**. Agreement with a restated order.
- **cutAdopted** plant real add **BITES**. Plant first rampart **BITES**. The list is layer7b-reconcileSeal adds, which are none. Closed.
- **spurred** decrement keep-nonzero **ESCAPE**. Still a boolean-of-zero, now wearing a `derived` badge.
- **p15 reserved seat** is cheb-1 of the mineral, not the shipped container. Seat+approach moved together **ESCAPE**.
- **p16 corridorPlaced** 0 + fallback 1 **ESCAPE**. Iff, not the count.
- **p17 parkCap** is `ctrlParkFloorCap`, not the reservation walk.
- **p17 radii** is the bonus table, not the bonus pick.
- **p17 takeTowerSwap.to** is a shipped tower, not the take.

---

## What this is not

- Not a board fail. 60/60, sealed live wall, D4-faced extensions, mandated stamps placed, mineral seats reachable, film taxonomy vs board 0/7.
- Not a 134(b) count fail. 34 adds, 27 rooms, E15S1 and E5S6 remove-only, both cuts leak, both live walls hold.
- Not a 93 leftover. The pre-take number is gone; planting it back bites.
- Not an L1 jam. Not a film/page disagreement on the sample.
- Not an anti-pattern auto-fail. No maze, no brick, no road-on-every-rampart, no silent cap in the sample.
- Not the old 98 COORD-bag forge. Off-board `99,99` / `1,1` / `0,0` and a fake empty round are dead. The *as-written* r31 append (one list, `wanted:=tiles`) is dead.
- Not the old 88 swap-with-freeze, not the last-rung unweighed, not the 8-tile box keep-ramparts, not a discarded cut that leaks the sitter — complete or not.
- Not the r33 leftover on `stitched` / `stitchTiles` / `roadsEaten` / `towerOnly` / `stubRoads`. Zeroing those five still fails.
- Not the r34 leftover on `mineralContainer` / `minDmgPicked` / `servedFree`, and not the p12 stitch polarity hole (`stitched := 2` used to pass). Those four now fail.
- Not the r35 leftover on `arrayPartner` / `rcl5Pair.picked` / `minDmgArray` / `battlementGap` / `battlementGapTiles` / `boundHeld` / `fillerTiles` / `shallowCost` / `shallowRefused`. Moving, zeroing, flipping, or planting those now fails.
- Not the r36 leftover on `floorGated` / `floorOver` / `floorOverGated` / `freeDin` / `massAdds` / `maxDist` / `deepReach` / `stubCap` / `mineralSeatAtReservation` / `mineralApproachAtReservation`. Zeroing or moving those off the mineral now fails. Swapping 43 for 51 now fails too.
- Not 141(e) `seedScore` as a free integer. Zeroing it, or adding 999, now fails.
- Not the r37 leftover on `hubDistCap` as a free integer, `lapCeilingFloor` as a comment, or `corridorPlaced` as a free count against `fallback=0`. Off-ladder / flatten / break-the-iff now fails.
- Not the r38 leftover on `stubCap` as `{43,51}`, `floorUngated` as a comment, `radii` as a free list, `parkCap` as a free integer, or `takeTowerSwap.to` as an off-board COORD.

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
- r29p15 `floorGated`, `floorOver`, `floorOverGated`, `freeDin`, `massAdds`, `maxDist`, `deepReach` (as a formula), `stubCap` (as the pool walk), `mineralSeatAtReservation` (as cheb-1 of the mineral), `mineralApproachAtReservation` (as D8 of that seat)
- 141(e) `seedScore` = fullest confluence score in the seed window
- r29p16 `hubDistCap` off the cohesion ladder `[16,19,23,999]`
- r29p16 `lapCeilingFloor` ≠ `MOBILITY_TARGET` (1.2)
- r29p16 `corridorPlaced === 60` iff `corridorFallback === 0`
- r29p17 `stubCap` 43↔51 (the deep-pool / 60 ≥ 1.5 walk)
- r29p17 `floorUngated` = freeze mass-free ungated lap (extensions not yet placed)
- r29p17 `radii` = the escalation table for `needDeepBonus`
- r29p17 `parkCap` = `ctrlParkFloorCap`
- r29p17 `takeTowerSwap.to` is a shipped tower
- `cutAdopted ===` layer7b adds
- `cutPasses.sealCritical` (single-removal)
- `cutPasses` last-prune `ramparts-before`

**Still a door:**
- 98 kept prefix is any floor-touching twin of `lane.reserved` (E11S1 extra `19,27` on both lists; identity-swap `18,27→19,27`)
- 98 refused walk is unread numbers (`wanted`, `used`, `ext`, `shallow`, `premium`) once `wanted > tiles`
- 88 any discarded cut that is not freeze, not shorter-and-prettier than shipped, and seals (including a one-tile neighbour of the last fat cut)
- `cutPasses.rampartsDeleted` split
- Remaining META_DARK presence (40 names, 172/172 silent once `baseCut`+`shallowNow` are left alone)
- Exact `baseCut` / `protectRadius` / `hubDistCap` pick
- reserved mineral seat as the shipped container (any other cheb-1 + matching D8 approach)
- `corridorPlaced` as this room's count (0 + fallback 1 keeps the iff)
- `parkCap` as the reservation walk (the sibling integer is enough)
- `radii` as this room's bonus pick (the table follows the bonus)
- `takeTowerSwap.to` as the take (any shipped tower)
- 134(a) as a theorem, 134(c) contract, 134(d) as a derivation, `spurred` as a count

---

## Bottom line

Boards are clean. The gallery in the sample is readable and matches the tiles. 134(b) as a **number** stays done. 93, the *stated* 98 one-list append, the *stated* 88 leak-on-complete **and** leak-on-incomplete, the four r29p9 presence names, the five r29p12 presence names, the four r29p13 walks, the nine r29p14 walks, the ten r29p15 walks, `seedScore` as the rank-1 confluence walk, the three r29p16 identities (`hubDistCap` ladder / `lapCeilingFloor=1.2` / `corridorPlaced` iff fallback), and the five r29p17 identities (`stubCap` pool walk / `floorUngated` freeze mass-free / `radii` table / `parkCap` sibling / `takeTowerSwap.to` a tower) are done. The 98 class is not done: reserved is still a free set and the refused walk is still a count. The 88 class is not done: a sealing same-lap neighbour still passes. Plus the presence class, plus the exact pick (still including in-enum `hubDistCap`), plus one `cutPasses` column.

I would **not** stand down for a clean round. A clean round is zero findings. If the next pass binds `fullRun.reserved` / `lane.reserved` to the greedy (or hashes it), binds `wanted`/`used`/`ext`/`shallow` to that walk, and binds discarded `cutTiles` to the composed enclosure (or stops publishing them), this reviewer has nothing new from those two — only the residues already on the list.
