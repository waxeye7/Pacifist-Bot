# BASE PLANNER PERFECTION GOAL

**Paste this whole document as the goal prompt.** It is the distilled criteria from the
owner's design sessions. The bar is: **every base plan is genuinely perfect — a harsh
reviewer finds NOTHING to criticize.** Not "gates pass." Nothing to criticize.

## Mission

Iterate the v2 base planner (`tools/plan-suite/v2/`) through build → validate →
adversarial-review → fix cycles until **two consecutive adversarial review rounds by
fresh hostile reviewers produce zero confirmed findings of any severity**, all hard
gates hold on all rooms, and the gallery reads as intentional, elegant, and unique
per room. Rise to the bar; do not lower it.

## Process (non-negotiable)

1. **Fable curates, Opus implements.** Each cycle: a tightly specified implementation
   batch (Opus), then the full suite + validator, then **fresh adversarial reviewers**
   (Opus) who must actively try to BREAK the result with their own code and data —
   never trust the planner's own meta, always re-derive. Confirmed findings become the
   next batch's spec. Repeat.
2. Reviewers must cover, every round: game-rule legality, validator circularity
   (mutation-test it), the gates below, the judgment criteria below, and 5 randomly
   sampled rooms inspected visually (render → describe → criticize like the owner would).
3. Live verification each cycle: re-push plans to the live test rooms, watch them build,
   zero console errors, no regressions on legacy rooms.
4. Terminate only on: 2 consecutive all-clean adversarial rounds + gates green +
   golden-room visual pass. If a criterion is physically impossible in a specific room,
   the plan must SAY so in its meta (honest shortfall), and the reviewer must agree it
   is genuinely impossible — that is the only accepted exception.

## Hard gates (validator-enforced, 100% of claimable 2-source rooms)

- **60/60 extensions at RCL8. Always.** (Honest-impossible exception per above.)
- Full program: 10 labs (diamond, both inputs within range 2 of every output, hauler
  access), 6 towers, 3 spawns, storage+terminal+hub trio on a sitter tile, 4+ links
  (hub, per-source, controller), source containers, controller container, mineral
  container + extractor, nuker, observer. **No factory. No power spawn. Never power.**
- Shell: distance-weighted min-cut, all ramparts, no openings, no double shell.
  Protect region sealed — zero leaks (re-derived exterior flood, not trusted meta).
- Safety re-derived: every eco structure at chebyshev depth ≥ 4 from the exterior
  region **or** carrying a personal rampart. Towers depth ≥ 4, no exceptions.
  One declared physics exemption: the extractor is built ON the mineral by rule and
  therefore cannot be moved deep — it is exempt (nothing is stored in it and it is
  trivially rebuilt), while its container must be bubbled or declared. Its OTHER
  exemption, from the road-network rule, was a hardcoded omission in the checker
  until round 14 and is now the plan's own declaration in **133/133** rooms —
  criticism 31, and the argument is stronger than the seat's.
- Every extension has a **road on an orthogonal (D4) face** — easily accessible,
  corridor pattern, never a maze, never diagonal-only.
- One connected road network touching every structure. No roads ON ramparts —
  **with one exception, the shell gate**: where an eco road (to a source, the
  controller, the mineral) crosses the cut line, the crossing tile is both road
  and rampart by necessity. That is a gate, not road spam: without it the wall
  has a hole or the haulers have no way out. Re-measured on the 172-room fleet
  (round 12, unchanged from round 11 and re-derived from the shipped artifact
  rather than carried; the "257 / 229 / max 4" figures below this line were a 159-room
  world, and the round-9 "286 / 241 / median 2 / max 6 / 36 bubbles" numbers that
  stood here were wrong on four of five counts — measured on the file whose own
  md5 the same section quoted): **278 road+rampart tiles, 235 of them exactly on
  the shell cut line, median 2 and max 5 per room**. The full taxonomy, five
  classes and every one of them decided by its own positive test:
  **235 wall crossings on the cut + 30 bubble seats (a container) + 13 controller
  stand-denial RING tiles + 0 personal cover + 0 unclassified = 278.**

  **AND THIS DOCUMENT SHIPPED THE PREVIOUS SUM FOR A ROUND, IN TWO PLACES, WHILE
  THE SUITE PRINTED THE RIGHT ONE.** The line above and its copy in the status
  block both read `277 = 235 + 29 + 13` through round 13, and the board they
  described had been `278 = 235 + 30 + 13` since round 13's own fix: paving E2S5's
  RCL-deferred join at `27,23` (criticism 23) put a road on a mineral-container
  tile that already carried a rampart, which is a **thirtieth bubble seat** — the
  taxonomy classed it correctly the moment it existed, `plan.mjs` printed the new
  total on the `road+rampart:` line, and the round that created the tile did not
  re-read the sentence it invalidated. Nothing was mis-built and nothing was
  mis-classified; the defect is entirely that a hand-carried sum sat beside a
  printed one and disagreed with it, in the same document that says a number no
  tool re-derives rots exactly like a metric no gate re-derives. Both copies are
  the printed figure now, and the fix for the class is the one criticism 22
  already names: the number a reader checks has to be the number a command
  prints.

  **THE ACCOUNTING USED TO "CLOSE" BECAUSE THE RESIDUE WAS SWEPT INTO THE LARGEST
  CLASS.** The line that stood here — "281 … 235 on the cut … 37 declared eco
  bubbles and 9 mineral-container bubbles … 235 + 37 + 9 = 281, 0 unclassified" —
  was produced by a classifier whose last branch was a catch-all `else cross++`.
  A tile that was on neither the cut nor a container was therefore *counted as a
  wall crossing*, and 17 tiles on the board that sentence described were exactly
  that. A sum is only evidence when nothing is allowed to fall into it: "0
  unclassified" was not a measurement, it was a restatement of the fact that the
  code had nowhere else to put a tile. The 17 are controller stand-denial ring
  tiles that the eco lane to the controller happens to cross — a legitimate,
  expected class, which is the whole point. The defect was never a bad tile; it
  was a taxonomy with no word for what it was looking at, hiding behind the one
  class big enough to absorb the error unnoticed. Each class now has to claim its
  own tiles, `unclassified` is printed **whether or not it is zero**, the
  breakdown is emitted by `plan.mjs --all-claimable` on the line
  `road+rampart: ...` and stored per room in `meta.walls.roadRampart`. The total
  also fell 281 → 277 in that round because layer 7's inert prune now deletes 8
  ring ramparts that carried road and defended nothing — see the ring-rampart
  paragraph under the controller bullet below — and it is 278 today, for the one
  seat the paragraph above explains.
  (A stand-denial rampart that is ALSO a cut tile is still counted once, in the
  crossing class — the round-9 review's "20 stand-denial tiles the taxonomy has
  no class for" is that double count, and it is a different question from the 17,
  which are not on the cut at all.)

  **A gate per eco route is the expected shape. A RUN of them is not.** Where the
  cut turns and follows an eco lane the room
  used to ship two or three consecutive paved rampart tiles — a prepared surface
  along the exact line an attacker who breaks in wants to walk (E14S5 shipped
  42,36 42,37 42,38 with bare interior floor one tile west). Layer 7 stage (5b)
  now offers every such run the interior parallel and takes the swap when the
  network is measurably no worse; a single CROSSING tile is never touched.

  **AND WHEN IT DECLINED, IT PUBLISHED A ZERO.** Rooms still ship runs of
  consecutive paved cut tiles — the anti-pattern by its own name — and the only
  thing stage 5b said about them was the counter `alongCutMoved: 0`. A count of
  moves TAKEN is not an argument about the moves NOT taken: from a zero a reader
  cannot tell "there was nothing to do" from "there was something to do and it
  was refused," which is silent capping with a number in front of it. Stage 5b
  now records a **REFUSAL PER TILE**, with the reason that applies to that tile —
  no interior parallel exists, and which neighbour failed and why; or the swap
  breaks the road network — and every room that ships a run states it. **27
  refusals** stand today against **7 moves taken** (`alongCutRefused: 27`,
  `alongCutMoved: 7` summed over the fleet), and the 7 are pinned tile by tile as
  the `alongCutMoved` entries of the provenance enum in the film bullet below —
  a witness LIST rather than the bare integer this paragraph exists to complain
  about. E2S1 is the case that makes "per candidate" load-bearing: free
  interior parallels DO exist there, and every single swap drops road tiles off
  the network, so its refusals name that per candidate instead of claiming there
  was nothing to look at.

  **AND THE DETECTOR WAS D4 IN A GAME THAT MOVES D8.** Screeps creeps step
  diagonally and are not stopped by a corner, so two tiles touching only at a
  corner are one step apart and a run that turns is still a run. The run
  detector, the interior-parallel search and the roster quoted in this paragraph
  all used ORTHOGONAL adjacency, so a diagonal run was not merely under-counted,
  it was invisible. "Five rooms" was never the fleet's answer; it was the
  detector's. All three are D8 now and the roster went to **seven rooms, 14 tiles
  — E12S7, E15S1, E18S9, E19S9, E2S1, E7S9, E9S8**, of which E12S7 and E2S1 are
  the diagonal pair the D4 reading never saw.

  **AND THEN THE D8 ROSTER WAS STILL SCOPED TO THE CLASS THAT WAS EASY TO SEE.**
  Fixing the adjacency left the SET the detector iterates untouched: it walked the
  cut, so a paved rampart that is a bubble seat or a stand-denial ring tile — the
  other two classes of the taxonomy at the top of this bullet, and the same
  prepared surface to an attacker who is already inside — was never a candidate
  for a run, never offered a parallel and never owed a refusal. The anti-pattern
  is "a RUN of paved ramparts", and nothing in that sentence says cut. The scope
  is now every tile carrying a road and a rampart (`meta.walls.alongCutScope`),
  and the roster is **TWELVE rooms, 26 tiles — E12S7, E14S3, E15S1, E18S9,
  E19S9, E21S3 (a four-tile run of stand-denial ring), E2S1, E4S1, E5S5, E5S9,
  E7S9, E9S8**. The five rooms the cut-only reading could not see are why planner
  notes went **172 → 177**. Nothing moved — `alongCutMoved` is still 7 — and every
  one of the 26 tiles now carries a named refusal or was moved. The **27 refusals
  fleet-wide** break down 16 `breaks-network` · 7 `no-parallel` · 4 `seat`, that
  last one being the class the old scope had no word for (a bubble seat's road IS
  the seat, so moving it inboard leaves the container with a road beside it
  instead of under it — refused by name rather than by
  silence). **E5S9 `22,19` is the one the owner-voice reviewer landed**: a free
  interior parallel at `22,20` that had never been offered. It is offered now and
  refused with the count — moving the road there drops **9 road tiles** off the
  network — which is the difference between a refusal and a blind spot.

  **AND THE REASON THIS DOCUMENT GAVE FOR THAT BLIND SPOT WAS FALSE FOR A
  ROUND.** The sentence above ended "because 22,19 is not on the cut" — and
  `22,19` **IS** on the cut. The room publishes `onCut: true` for it and a
  re-derivation over `meta.shell.cut` agrees, so the mechanism this document
  offered could not have produced the effect it was offered to explain. The real
  one is one tile over: `22,19`'s only D8 neighbour carrying both a road and a
  rampart is `22,18`, a bubble SEAT that is **not** on the cut, so the cut-only
  detector walked `22,19`, found no run PARTNER inside its scope, and never
  called it a run at all. The rescope was still the right fix and the 9 tiles are
  still the refusal; what was wrong is the account of WHY the tile was invisible,
  which is the worse half — a correct fix explained by a mechanism that does not
  exist leaves a reader with no way to predict the next instance of the class,
  and the next instance is exactly what a scope finding is for.

  **AND "RE-DERIVED BY THE VALIDATOR ON THE BOARD THE ROOM ACTUALLY SHIPS" WAS
  ASPIRATION.** That clause closed the refusal paragraph above through round 12,
  and there was
  no such gate behind it: a round-13 reviewer deleted a room's ENTIRE along-cut
  record and the run passed clean, which is this document describing a check into
  existence — the same defect as the shallow declaration that lived only in the
  sentence announcing it. There is a gate now. The validator re-derives the roster
  from the SHIPPED board over D8 adjacency and over the FULL scope above — every
  rampart carrying a road whose D8 neighbour is another rampart carrying a road,
  not the cut subset — requires a refusal for every tile in
  it, and re-checks the NAMED FACTS of each refusal against terrain, the exterior
  region, the cut, the structure lists and the road network with all-8-neighbour
  coverage — a refusal that says "no interior parallel exists" fails if one does,
  and a refusal that says a neighbour is "OUTSIDE the wall" fails if that
  neighbour carries a rampart (which is how four of E21S3's and one of E5S9's
  first-cut refusals re-derived FALSE: layer 2's exterior flood and the shipped
  flood disagree about bubble seats, and the true class was the one beside it,
  "is itself a ramparted tile"). The record is published as
  `meta.walls.alongCutRuns` (`{x, y, free[], held[], onCut, seat}` per tile,
  refusals carrying `kind` and `offered[]` so the gate can dispatch on a field
  rather than on prose) and the PAVED RUN note must be present exactly when runs
  exist and absent when they do not.
  Every OTHER road/rampart coincidence is still the anti-pattern. Spur
  roads TO rampart clusters allowed. Roads exist only for: hub kit, eco paths,
  lab road, tower faces, extension corridors, rampart spurs, shell gates. Dead
  ends pruned.
- **Every ROOM OBJECT keeps a work seat a creep can reach.** The controller has had
  this since the claim-seat work (one reserved range-1 tile plus one reserved
  approach); round 9 extends it to the mineral, which is the other object a creep
  has to stand beside. E9S9 shipped an extractor and a mineral container that NO
  CREEP COULD EVER REACH — the mineral's only walkable neighbour was left free by
  the lab guard and then had all eight of its OWN neighbours taken by three labs, a
  tower and a spawn. The mineral was unharvestable forever, both structures decayed
  forever, and the RCL6 extractor build order stalled on a site no builder could
  stand beside. Producer side: `mineralSeat` + `mineralApproach`, reserved at layer 1
  and honoured through `reservedTiles` by every layer that places a blocking
  structure, plus the local `mineralSeatHolds` invariant. Validator side: a real
  flood from the sitter that has to ARRIVE (`MINERAL ENTOMBED`).

  **THIS DOCUMENT CALLED THAT FAILURE "UNDECLARABLE" AND IT WAS NOT.** The
  undeclarable list is keyed on `gate|kind` PAIRS, and only the pair is
  meaningful: gate `misc` is emphatically not blanket-undeclarable, because 133
  rooms legitimately file `misc/off-network` for their mineral seat (criticism 11).
  The pair `misc|mineral-seat` was simply missing. A round-11 reviewer entombed
  E11S4's mineral, filed `{gate:"misc", kind:"mineral-seat"}` with the seat ring
  in `tiles`, and watched the entombment disappear from the fail list — the run
  printed **`pass 1/1 · fail 0` on the same line that printed `minerals entombed
  1`**. A hard gate that a room can excuse itself from by naming it is not a gate,
  and the word "undeclarable" in prose does nothing; only membership in
  `UNDECLARABLE_PAIRS` does. `misc|mineral-seat` is in it now, and so are ten more
  pairs found by re-reading every message this validator raises against its own
  words about that message: `shell|stale-cut`, `shell|cut-not-rampart`,
  `shell|cut-rampart-rejected`, `shell|ctrl-ring`, `ctrlparks|no-ctrl-link`,
  `ctrlparks|ctrl-link-disagreement`, `count|over-cap`, `count|unknown-type`,
  `extensions|unreachable`, `road|off-network`. Every one of them describes
  something the plan got WRONG rather than something the room cannot have, which
  is the only test that matters for the list.

  **AND HAND-EXTENDING A DENY-LIST IS NOT A FIX, IT IS THE SAME BUG DEFERRED.**
  A round-12 reviewer excused the SEAL — `rampart|leak` and `rampart|shallow`,
  `pass 1/1 · fail 0` printed on the same line as `leaks 1, shallow 1` — by the
  identical route, one list entry over, because an enumeration of what may not be
  excused defaults to PERMITTED for everything nobody thought of, and this list
  had been extended by whoever remembered. The polarity is inverted now: the
  authoritative list is `DECLARABLE_PAIRS`, it is CLOSED, a violation class
  nobody has classified is REFUSED by default, and a load-time
  `assertPairInventory()` walks every pair this validator can raise and refuses
  to start if one of them is on neither list. `UNDECLARABLE_PAIRS` survives as
  the explicit half of the same inventory and the two may not overlap. See
  criticism 13.
- **Nuke dispersion is a soft objective, and it is measured.** A nuke does full
  damage over a 5x5, cannot be intercepted, and is answered only by rampart hit
  points — so "how much of the RCL8 program does ONE warhead reach" is a real
  property of a layout. Counted over spawn/storage/terminal/nuker/tower and
  EXCLUDING the lab diamond (a mandated 4x4 stamp cannot be dispersed), the round-8
  fleet's worst 5x5 window held 12 structures against a median of 8; round 12 ships
  **worst 11 (E6S1 36,23 · E6S9 27,30), mean 7.98, median 8, min 5.**

  **THE FIELD DID NOT COUNT THE NUKER, FOR TWO ROUNDS.** `meta.towers.nukeWindow`
  was produced by layer 3, which runs two layers before layer 5 places the nuker,
  so the array it summed was empty and the published number was the window over
  spawn/storage/terminal/tower only — short by exactly 1 in **145 of 172 rooms**,
  publishing 10 where E6S1 and E6S9 ship 11. The nuker lands inside its own room's
  worst 5x5 in **153 of 172**, so the freedom layer 5 was told to spend on
  dispersion was being spent blind, and this document's own fleet headline (the
  TRUE 11 / 7.97) contradicted the per-room field it claimed to summarise (max 10,
  mean 7.13). It survived two rounds for one reason: **the validator never read
  the key.** Fixed on both sides — the field is now written at `finalizeRoom` from
  the shipped structure lists, and `validate.mjs` re-derives it and FAILS a room
  whose published value disagrees (proved by mutation: off-by-one, deleted value,
  deleted object and inflated value all bite). Layer 3's own before/after survives
  as `meta.towers.towerDispersion`, named for the set it actually measures, and
  the validator additionally fails any room where that subset reading exceeds the
  superset one.

  The hub trio and the spawn fan are mandated geometry; what is free is where the
  towers and the nuker go, and both layers spend that freedom on dispersion —
  layer 3 as a strictly non-worsening search (the weakest wall face and the
  saturation are compared EXACTLY and may not move; only the tie-break may fall,
  by at most one 30-point damage step), layer 5 as a tie-break among tiles at
  equal haul distance, over the same set the metric uses. Round 10 makes layer 3's
  search worth the claim it makes: **best-improvement** single swaps rather than
  first-improvement, then a bounded **pairwise** pass for the clumps no single
  tower can leave alone. It is never bought at the cost of a hard gate, and a room
  that has no such swap now DECLARES it with the search counters — ~~**5 rooms put 5
  of their 6 towers inside chebyshev 2 of the sitter (E11S6, E14S1, E1S7, E3S5,
  E6S1) and every one of them files a `towers/clump` shortfall**~~ quoting how
  many swaps were examined, how many were score-tied and therefore legal to take,
  and what the window did. ~~In all five the honest answer is still "nothing moved":
  0–6 of 613–910 single swaps were score-tied, and 0 of the pair swaps were.~~
  (It was six through round 11. E2S5 left the list in round 12 without anyone
  aiming at it: the bubble keep-class waiver of finding F2/m3 changed what layer
  7's prune deleted, `composePlan` therefore scored a different rung best, and
  the room recomposed to a cut of 28 from 39, 33 ramparts from 43 and a clump of
  3 from 5. Strictly better on all three, and it is recorded here as luck that
  was measured rather than as a fix that was designed.)

  **AND THE SEARCH BEHIND THAT DECLARATION NEVER MEASURED THE THING THE
  DECLARATION IS ABOUT.** Two independent bugs, and the shortfall sat on top of
  both. The pass ranked its swaps on `windowMax`, the WHOLE-MASS 5x5 — a window
  that sits on the hub trio in 170 of 172 rooms and is blind to a battery
  collapsing underneath it, which is the same blindness the refill-repair
  crossing had to add a tower-only instrument to fix — while the shortfall it
  files is about the CLUMP. "No legal swap improved it" was therefore a true
  statement about a number nobody was optimising. And the seat list was thinned
  before the search ever saw it: `spatialPrune` keeps one seat per 2x2 block
  above `MAX_CANDS`, which takes E14S1's **370 legal deep seats down to 115**,
  and the tile that retires that room's declaration was among the 255 dropped.
  A declaration is evidence, so a search that produces one has to have looked at
  the thing it says it could not find. The objective is the tuple
  **`[window5x5, towerWindow5x5, clumpCheb2]`** read lexicographically, all five
  instruments accept tiles as well as candidate indices (one definition, two
  callers), and the **offer scan runs over the UNTHINNED census** — the descent
  still runs on the thinned list, which is what keeps it inside the compose
  budget, and the two are now different questions rather than one shortcut.
  Re-scanned, **two of the five had an offer all along and three genuinely do
  not**: E14S1 `[8,5,5] → [8,4,4]` and E3S5 `[9,5,5] → [9,4,4]`, against **0 of
  755, 0 of 690 and 0 of 910 scanned swaps holding face and saturation exactly**
  in E11S6, E1S7 and E6S1. Both offers were taken and both declarations are
  retired. **The roster is three rooms — E11S6, E1S7, E6S1 — and those three are
  EARNED**, which is the first time that sentence has been backed by a search
  that measured the clump.

  **AND THE SCAN OFFERS RATHER THAN TAKES, FOR A REASON THAT WAS BUILT AND
  MEASURED RATHER THAN ARGUED.** The obvious move is to rank the whole dispersion
  pass on the enriched tuple and let layer 3 keep the winner. That was built and
  run over the fleet: **56 of 172 rooms move a tower**, and among them E11S1's
  as-built refill walk goes **4 → 7**, E8S7's **4 → 8**, E18S4's shipped nuke
  window **9 → 10** and E11S1's whole-mass window 8 → 9. Those are precisely the
  two instruments layer 3 cannot read — the nuker does not exist until layer 5
  and the self-blocked walk needs sixty extensions, ten labs and the observer
  standing — so a tuple-ranked descent spends freedom it cannot price, which is
  the same argument this document already makes for not crossing the adjacency
  prior on a soft note. The design is therefore: **layer 3 OFFERS
  (`meta.towers.towerSwapOffer`, published in every room — whole census,
  thinned census, swaps scanned, how many held face and saturation, and the
  before/best tuples), and `pipeline.mjs` PRICES the offer by re-composing the
  room with it and re-reading twelve as-built instruments on the finished
  board.** **58 rooms hold a dispersion offer today and 2 of them clear the take
  rule — E14S1 and E3S5, the two clump declarations that are now retired**; the
  fleet's other two takes come through the across-prior channel in the
  tower-coverage bullet, for four moved towers in total. Every offer, taken or
  refused, ships with both instrument panels in
  `meta.towers.acrossPriorTake.offered`, so a refusal is a priced verdict rather
  than a counter.
- No structure on source/controller/mineral tiles (extractor on mineral exempt),
  no illegal stacking, no out-of-bounds, full CONTROLLER_STRUCTURES cap compliance —
  and the validator itself must catch injected mutations of every class it checks.
  The mutation suite is at **603/603 caught** (465/465 at round 15, 338/338 at
  round 14, 260/260 at round 13, 189/189 at round 12, 90/90 at round 11, 64/64 at round
  10), against a 172/172 clean baseline on the unmutated artifact; every one of
  them was written because a reviewer landed the mutation first. Round 12 added
  **81**, and the block is grouped by the finding that produced it: C1 8/8 ·
  C2 14/14 · M3 16/16 · M4 17/17 · M5 17/17 · M1 4/4 · M2 3/3 · F1 2/2.
  Round 13 added **74** live cases in the same grouping and retired 3.
  Forty-eight of the new ones gate this round's validator work — F2
  `redundantCut` coverage plus per-class re-derivation 12/12 · M1 `alongCut`
  11/11 · M3 `cause` 7/7 · F8 2/2 · F1 4/4 synthetic · `roadKind` 6/6 ·
  `alongCutRuns` 6/6 — and **26 attack the PROSE channel**: the four lies a
  reviewer landed in paragraphs, reproduced by PROPERTY rather than as the exact
  strings he happened to type, 20 generic prose rewrites spread over the 10
  newly-rendered kinds, and 2 renderer bypasses. The 3 retired are round 12's
  paving-gap cases, which this round's own fix made dead — the gap they mutate no
  longer exists on any board in the fleet — and the four synthetic F1 cases
  replace that coverage permanently, which is the only reason retiring them is a
  cleanup rather than a coverage cut.
  (C2 was quoted as 15 here through round 13 — the eight figures summed to 82
  against a stated total of 81, and committing the harness is what made the
  discrepancy checkable. The harness counts 14.)
  Round 14 carries **83 cases tagged `r14`** for a net add of **78**, and the
  difference is the honest part: five earlier cases were RE-POINTED rather than
  kept, because the fixes moved the board out from under them — B1 moved the tower
  the fleet's only `towerRefill` declaration belonged to, so both cases now
  SYNTHESISE that declaration and catch it on its own re-derived content instead
  of hunting for a room that carries one, and the spur cases moved off the three
  rooms whose counts differ (see the dormant-identity note in criticism 27). The
  grouping, by the fix that produced it: A1 record-leaf inventory 45/45 ·
  A10 spur reconciliation 6/6 · A9 `towerClump` 5/5 · A4 `roadKind` 5/5 ·
  A8 `pairCause` 4/4 · A6 `srcEnclosed` 4/4 · A5 delete-escapes 4/4 ·
  A3 extractor 3/3 · A2 paving gap 3/3 · A7 `ctrlParks` presence 2/2 ·
  A11 roster scope 2/2.
  Round 15 adds **127 cases tagged `r15`**, a net add of 127 with nothing
  retired and nothing re-pointed, and the grouping says where the round's attack
  surface was — it is almost all one thing: B1 witnessed-bound arithmetic
  **58/58** (a count of things tried smaller than the count that moved, a subset
  larger than its superset, a ratio that is not the quotient, spread over the
  battery, lane, clump, shallow, eco, lab and negotiation censuses) ·
  B3 `meta.towers.adjacency` and `satAcrossPrior` 19/19 · B6 planner-note classes
  14/14 · B7 `negotiated.detail` 10/10 · B4 the per-kind late-road books and the
  spur lists 10/10 · B5 refusal `kind`/`offered`, `alongCutScope` and
  `conductBridge.relaid` 8/8 · B8 `composedCaps` 6/6 · B9 the lab-network
  dormant identity 1/1 · B2 1/1.
  **B2 is not a plan mutation at all**, and it is the only case in the harness
  that is not: it hands the validator a leaf class of exactly the description its
  own load-time rule refuses — a stated bound with nothing behind it, and a
  closure-less leaf that does not admit to being one — because that rule is a
  property of the CHECKER and cannot be tested by breaking a room.
  Round 16 adds **138**, a net add of 138 with nothing retired: **137 tagged
  `r16`** — C1 table-iteration presence **34/34** · OF11 mirrors, array elements,
  census room-binding and `ranBespoke` 28/28 · M3 two-sided witnessed bounds
  19/19 · M4 planner-note inventory and `renderNote` equality 15/15 ·
  OF1 `sealedFloor`/`inertPruned` 12/12 · M2 `negotiated.detail` string equality
  10/10 · m6 tile-level road books 6/6 · OF7 prune bookkeeping 6/6 ·
  OF4 the across-prior take 3/3 · M5 `satAcrossPrior.basis` 3/3 ·
  OF3 seat occupancy 1/1 — plus **one case tagged `r17`**, and that one is worth
  the sentence: `r17/C1-weak-battery-wall-arm-forged` was written by the fixer
  that CLOSED the hole, against its own fix, on the same day. The round-16
  validator left one exploit standing and said so in the rule's own `why` (a
  record that deletes its placement census and claims the wall arm takes that arm
  legitimately, because on the shipped board nothing distinguished the two);
  closing it needed a producer change, and the mutation that proves it closed is
  carried in the harness rather than in a checkpoint nobody runs. The whole
  round's grouping is one theme — 34 + 28 + 12 of the 137 attack PRESENCE and
  PROVENANCE rather than value, which is where the round's escapes were.
  **The harness is now committed at `tools/plan-suite/v2/mutate.mjs`** — run it
  with `fnm exec --using 22 node tools/plan-suite/v2/mutate.mjs` (~4s; honours
  `PLANS_FILE`, never writes the artifact, exits 1 on any escape or on a dirty
  baseline, 2 on a short mongo dump). It replaces the scratchpad splice this
  section used to name as an open gap: the count above is printed by a committed
  tool. The 189 it stood at in round 12 were the 171 that splice carried plus
  **18 recovered** from the
  round-8, round-10 and round-13 side harnesses, which the consolidation had
  silently dropped — four `nukeWindow` cases (off-by-one, deleted value, deleted
  object, and the nuker moved with the published value carried forward),
  `towerDispersion` inconsistent with the strictly larger set it is a subset of,
  the mobility declaration's own `metric.target` falsified and its paragraph
  APPENDED to rather than re-rendered, and eleven structural ones
  (container/extractor/tower counts, a `labInputs` entry that is not a lab, the
  `x=49` bound, the engine border rule on the `y=48` edge, a sitter on natural
  wall, the cut's own rampart deleted, a shallow structure's personal rampart
  deleted, an unramparted container at attacker depth, and a shallow tower given
  its own rampart plus a `towers` declaration — the laundering that a personal
  rampart is a depth argument).
  Consolidating it was itself the finding: the count in a doc is not a gate, and
  three rounds of harness lived only in scratch directories.
- **A DECLARATION IS EVIDENCE, SO ITS CONTENT IS A GATE.** Through round 10 the
  evidence rule was a SHAPE rule — at least 40 characters of prose, at least two
  distinct numbers — and any numbers at all satisfied it. Three reviewer edits
  passed clean: E2S8's weak-battery entry was rewritten to claim a 2-step refill
  walk "1/1/1/1/1/2" against a room that walks **7/8/8/9/10/11**; E7S5's
  covered-detour numbers went from 33/17 at ratio 17.5 to **4/999 at 0.11**, i.e.
  the fleet's worst pair rewritten into its best; and a bogus `misc/off-network`
  exemption naming a container that is ON the network passed in silence. The whole
  honest-shortfall contract rests on declarations being true, and nothing was
  reading them. The validator now **RE-DERIVES DECLARATION CONTENT**: the full
  defender-mobility metric transcribed from its definition in this document rather
  than imported from the producer (an imported metric checks the transcription and
  not the claim), the refill walk, the weakest sealing tile, the clump counter, the
  off-network truth, the eco anchor walks and the shallow-extension census. A
  material mismatch fails the room. ~~It **also requires every audited number to be
  QUOTED in the prose**, so correcting the structured block while the paragraph
  goes on lying does not pass either — the paragraph is what a reviewer reads.~~

  **THAT LAST SENTENCE WAS A SHAPE RULE WEARING A CONTENT RULE'S CLOTHES, WHICH
  IS THE SAME DEFECT THE BULLET OPENS BY DESCRIBING.** "Every audited number is
  quoted in the prose" was implemented as numeral presence, so a round-12
  reviewer rewrote a paragraph to assert **the exact opposite of its own audited
  record**, appended `[audit tokens: 35 2 33 17.5 0 20 91]`, and passed. There is
  no rule that makes a hand-written paragraph agree with a record. Declaration
  prose is now **GENERATED** from the structured record by a shared template
  (`declprose.mjs`, `-mobility`, `-towers`) that the producer and the validator
  BOTH call, and the validator regenerates from the published record and requires
  equality. ~~Eight audited kinds.~~ The paragraph cannot say anything the record
  does not, because nobody writes the paragraph. See criticism 17.

  **EIGHT OF EIGHTEEN IS THE ROUND-11 OBLIGATION BUG WEARING THE ROUND-12 FIX.**
  Round 12 replaced hand-written prose with generated prose for the eight kinds
  someone got to, and the other ten kept the old contract — a paragraph a human
  typed, checked by nothing — so the architecture that "makes it impossible" was
  in force over 8 of the 18 kinds and the sentence above did not say which 8.
  **RENDERERS covers all 18 kinds now, and all 300 declarations in the fleet
  carry generated prose** (302 on the round-13 artifact this sentence was written
  against; the two that left are E14S1's and E3S5's `towers/clump` entries, which
  round 16 retired by taking the swaps that made them false — see the dispersion
  bullet). The regeneration was also the audit: the 31 paragraphs
  that had been hand-written under the ten unrendered kinds came back
  **byte-identical**, so the fleet was in fact honest — but it was honest by
  luck-and-diligence and nothing had ever checked it, and "we looked and it was
  fine" is a measurement only once something looks every run. `assertProseInventory()`
  asserts at load that `RENDERERS == OBLIGATION_KINDS ∪ OBLIGATION_EXEMPT`, so a
  kind that renders nothing FAILS instead of quietly falling back to whatever the
  producer wrote — the same completeness assertion `assertPairInventory()` gives
  the declarable lists, applied to the channel a reviewer actually reads.

  **AND THE ONE STRUCTURED AUDIT THAT DID EXIST WAS OPT-IN.** The `redundantCut`
  re-derivation ran over the reasons a room PUBLISHED, so a room that published
  none was audited over nothing and an empty map passed. Closed enum, exact
  coverage, per-class re-derivation by deletion — the full account is under the
  `meta.shell.cut` bullet, where the record is defined.

  **AND WITH THE PARAGRAPH NAILED TO THE RECORD, THE LIE MOVED INTO THE RECORD.**
  That is the whole shape of round 14. Generated prose means a declaration can no
  longer say anything its record does not — so what a reviewer plants is the
  record, and the paragraph then renders the lie faithfully and passes the
  equality check. Two fresh reviewers landed it independently: of the leaves under
  the ten kinds round 13 newly rendered, **100% were unchecked**, and across all
  eighteen kinds **472 of 536 leaves were falsifiable** — nine planted numbers in
  one round, including `towerRefill.maxRefill`, `battlements.unreachable`,
  `labs.haulDist`, `ctrlParks.deepTiles` and `spawnFan.viable`. Re-deriving "the
  numbers this document happens to name" is the round-10 shape again: a list
  someone maintained. The rule is a CENSUS instead. **Every leaf of every
  declaration record is now classed, and the inventory is asserted at load:
  `RECORD_LEAVES` held 394 leaves across all 18 kinds at round 14 — 221
  RE-DERIVED from the board and the terrain, 173 PRODUCER-WITNESSED with a stated
  consistency bound, 0 unclassified; the paragraph below this one carries today's
  inventory and what happened to the word "enforces".** A record leaf the table does not name
  FAILS the room (so a new producer field cannot be born unaudited, which is how
  ten kinds' worth of leaves got in), and a leaf the table promises to re-derive
  whose derivation does not run FAILS the room too (so the table cannot lie about
  itself either). The declarable-pair inventory, the prose inventory and now the
  leaf inventory are the same assertion applied to three channels, and this is the
  third round in a row where the completeness assertion, not the check, was the
  fix. 45 mutations.

  **AND "WITH A STATED CONSISTENCY BOUND THE VALIDATOR ENFORCES" WAS TRUE OF THE
  TABLE AND FALSE OF THE FILE.** The census closed the derived half honestly and
  shipped the witnessed half as PROSE: 173 leaves each carrying a hand-written
  `why` that PROMISED an arithmetic bound, with seven generic closures behind all
  of them. Swept one (kind, leaf) pair at a time — mutate a single leaf, see
  whether anything bites — it escaped in **123 of 375 cases**, and a batch of 26
  arithmetic impossibilities passed clean: a search that moved more tiles than it
  tried, a subset larger than its superset, a ratio that is not its own quotient.
  A promise nobody evaluates is this bullet's own subject one indirection deeper,
  and it is worse than an unclassified leaf, because the table SAYS the bound is
  enforced. The witnessed half is a small closure DSL now — **16 ops**
  (`CLOSURE_OPS`, from `le`/`ge`/`eq` up to `sumeq`, `quot` and the `bespoke`
  escape hatch), `W(why, bound, closures)` — and the load-bearing detail is not the ops but that
  **the `why` TEXT IS GENERATED FROM THE CLOSURES**, so the promise a reader
  reads and the arithmetic the file runs cannot drift apart by construction.
  Two load-time self-checks mirror the derived half's: a `why` that states a
  bound with no closure behind it THROWS — it caught `labs.eatAnchors` live —
  and a closure-less leaf that does not SAY it is type-only THROWS, which caught
  13. ~~Today the inventory reads **427 leaves — 221 re-derived · 206 witnessed, of
  which 177 carry an implemented closure and 10 are covered by bespoke blocks
  that must stamp per room that they RAN · 29 honestly type-only · 0
  unclassified**, and the sweep is at **12 escapes, from 123**.~~ The largest
  single win was not a closure at all: some thirty leaves the table had called witnessed
  turned out to be CROSS-COPIES of numbers `meta.towers.*` publishes
  unconditionally beside them, so they are re-derived by comparison and were
  never witness-only in the first place — the table had been conceding a bound it
  did not have to concede. 127 mutations.

  **AND THE WHOLE MACHINE WAS READING THE RECORD INSTEAD OF THE TABLE, SO THE
  CHEAPEST ATTACK ON IT WAS DELETION.** This is round 16's CRITICAL and it is the
  same sentence as the two above, one indirection further in. The leaf engine
  iterated `recordLeaves(sf)` — the leaves the RECORD happens to carry — so a leaf
  the table names and the record omits was never looked for at all. **347 of 420
  leaf instances delete-escaped**, whole sub-records with them
  (`mobility.negotiated` in all 57 rooms, paragraph included — the entire subject
  of round 15's finding 37; `mobility.lift`; `shallowExt.search`), and **all five
  numbers round-14 reviewers had PLANTED re-landed by deletion instead of by
  falsification** (`labs.haulDist`, `ctrlParks.deepTiles`,
  `battlements.unreachable`, `towers.maxRefill`, `spawnFan.viable`). Two of those
  five leave the reader-facing paragraph visibly broken and still pass —
  E12S5 shipping "**?** deep tiles inside the widest enclosure it admits", E13S3
  "**undefined** cut tile(s) — 14,35 — carry a rampart" — which is the tell that
  nothing downstream was reading the record either. An inventory that is
  authoritative about what MAY exist and permissive about what MUST is half a
  census, and the half it drops is the half a producer controls for free.
  **The engine iterates the TABLE now, per (gate, kind): every classed leaf must
  be PRESENT.** Optionality was MEASURED before it was encoded rather than
  blanket-waived — 14 of the 18 kinds turn out to have exactly ONE leaf signature
  — so the excusals are a short, named list rather than a permission: one generic
  rule (a child is excused iff a CLASSED ancestor is published as exactly `null`),
  **4 `BRANCH` rules** each carrying its condition and its reason, and
  **2 `NEVER_SHIPPED` entries**. A branch that takes NO arm fails, so "arm A
  excuses arm B" cannot be made to excuse both. Two smaller closures came with
  it: a derivation counts as a presence witness for dynamic-segment leaves, and a
  dynamic MAP's key set is itself re-derived — which is what finally closed the
  last 53 `lift.perClass` escapes.
  **Re-swept on the shipped artifact: 11,553 single-leaf deletions, 0 escapes;
  2,139 whole-sub-record deletions, 0 escapes.**

  **AND THE SWEEP THAT SAID "12 ESCAPES, FROM 123" WAS MEASURING THE PROSE GATE,
  NOT THE BOUNDS.** The owner-voice reviewer landed this one with a three-way
  contrast rather than an argument, and it is the most useful thing anyone did to
  this file all round: on E12S6, the CONTROL passes; the leaf edit with the
  paragraph LEFT ALONE bites; **the identical leaf edit with `detail =
  renderDecl(decl)` regenerated — which is exactly what a producer does —
  ESCAPES.** Round 15's sweep only ever ran the middle case, so it scored a
  paragraph-identity trip as a content check and credited bounds that do not
  exist. **12 was a FLOOR, not a ceiling**, and the honest reading of the round-15
  line above is that it measured a different gate than the one it named. This is
  criticism 22's principle applied to a harness instead of a document: a number
  produced by a measurement nobody re-derived is the same liability whether a
  human or a script wrote it down. Four structural causes, each closed:
  **(1) `MIRROR_*` was never a second witness** — both copies are the same
  producer's second assignment, so single-copy edits bit and mirrored pairs
  walked. There is a **`#board` closure channel** now: 12 quantities re-derived
  from THIS room's terrain and shipped structures, with the mirrored censuses
  bound to them, and `dispersion.search.clumpAfter` and `.towerWindowAfter`
  promoted out of the witnessed half entirely — they are class **D**, re-derived
  off the shipped towers. **(2) Arrays were opaque single leaves** —
  `recordLeaves()` did not descend, so `shallowExt.slots[].why` was producer free
  text rendered verbatim into the paragraph `declprose.mjs` exists to abolish, and
  E12S6's **six priced, legal, lap-ceiling-refused trades laundered into "6 slots
  had NO deep target of any kind" PASSED** — criticism 12's whole argument
  inverted, in the channel criticism 17 was supposed to have closed.
  `RECORD_ARRAY_LEAVES` is a closed per-element field inventory: 6 arrays, **25
  classed element fields**, and **render-or-die on `slots[].why` and
  `refused[].why`**. **(3) Closures were scale- and provenance-blind** — a whole
  measurement family could be rescaled and two rooms' entire dispersion censuses
  swapped, both internally legal. At least one leaf per census is bound to a
  room-derived quantity now (`shallowExt.search.interiorWalkable` is class D and
  the swap censuses are capped at 6 × this room's own interior floor).
  **(4) `ranBespoke` stamped BRANCH ENTRY, not predicate execution** — deleting
  `ctrlParks.composedCaps` fired the stamp with nothing run. The stamp is a
  PREDICATE COUNT now, so a block entered with every check skipped credits zero
  and fails.
  Today the inventory reads **434 leaves — 226 re-derived · 208 witnessed, of
  which 193 carry an implemented closure (10 bespoke blocks that must stamp per
  room that they RAN) and 15 are honestly type-only · 0 unclassified**, beside
  **25 array-element fields** and **73 leaves excusable by name** under the
  presence rule. And the sweeps are re-run the way the contrast says they have to
  be — every mutation with the paragraph REGENERATED from the mutated record:
  **sign-impossible 9,305 bite / 8 escape, and the 8 are two leaves, `lane.cost`
  and `lane.gain`, both on the three-name honest signed-exception list**
  (the third, `causeWalks.*.detour`, is named there too and ships no instance the
  sweep can reach); **gross-value 9,313 bite / 0 escape**; and the gentle ±50%
  nudge, characterised rather than rounded off, **10,835 bite / 718 escape across
  34 distinct leaves — 0 of them class D, 31 of them carrying 1–3 closures the
  nudge simply stays inside** (board-derived ceilings are generous by
  construction, because layer 3 looks at a board with fewer things standing on it
  than the shipped one), **and 1 is `lane.gain`, whose two-sided range IS its
  bound**. Every one of the 34 that is not a named signed exception dies on the
  sign sweep, and every one of the 34 without exception dies on the gross sweep —
  which is the honest way to state it, because `lane.gain` is on that list
  precisely because its range is what it has instead of a sign. The
  three-way contrast is itself in the harness: **controls clean 12/12, edit+regen
  bites 12/12, prose-trip-only 0.** 81 mutations across the three fixes in this
  paragraph, plus the one tagged `r17`.
- **AND THE NARRATION GATES WERE OBLIGATIONS NOBODY ENFORCED.** Deleting E7S5's
  `mobility/covered-detour` declaration outright — the fleet's worst pair, 33
  tiles of detour at ratio 17.5 — cost nothing at all; the same held for the
  mobility declaration on the worst over-target room in the fleet and for a
  `towers/clump` entry. Every "and it DECLARES it" sentence in this document was,
  until round 11, a description of what the producer happened to emit, not a
  requirement on what the room may ship. A room whose RE-DERIVED state demands a
  declaration now FAILS without it: ~~over-target gated mobility, a complete record
  worse than the verdict, a weak or far battery, five towers inside chebyshev 2 of
  the sitter, an off-network mineral seat, and shallow extensions.~~

  **THAT LIST IS THE PROBLEM: IT WAS FIVE RULES WIDE AGAINST EIGHTEEN DECLARATION
  KINDS.** Thirteen kinds could still be deleted for free, so round 11 narrowed
  the round-10 finding rather than closing it — and narrowing a hole while
  writing the sentence that says it is shut is worse than leaving it, because the
  sentence stops anyone looking. **Every kind has a trigger now**, and the
  completeness is asserted against the kind inventory rather than trusted to a
  list someone maintained. It found a live one on the first run: **12 rooms
  shipping a link on the SHIPPED cut with no declaration**, because layer 2 files
  that shortfall over LAYER 2's cut and the prune plus the seal reconciliation
  then move the cut underneath it. `shell|` declarations went **1 → 12**. See
  criticism 18.

  **AND ALL OF THAT WAS ABOUT DECLARATIONS, WHILE THE OTHER NARRATION CHANNEL —
  THE PLANNER NOTES — HAD NO GATE OF ANY KIND.** 177 notes ship beside the 300
  declarations; they are what the gallery page and the film's ticker read, and
  **165 of the 177 were unchecked.** Six whole classes carried neither an
  obligation nor a content check (NO CUT TILE IS REDUNDANT, SHALLOW EXTENSIONS,
  SEALED INTERIOR FLOOR, CUT TILES NOT SINGLY LOAD-BEARING, ROAD ON RAMPART
  CLASSIFIED, ROAD LAID FOR A CONTAINER), so `meta.notes = []` passed on every
  room in the fleet and a present note could contradict the record it is written
  about — halve the sealed-floor count, move the road+rampart taxonomy's
  headline, name the wrong container tile. This is criticism 18's finding in the
  channel nobody had thought to call a declaration, and the reason it lasted is
  worth naming: notes are the channel a HUMAN reads and declarations are the
  channel a GATE reads, so the unchecked one is precisely the one a reviewer is
  shown. All six classes derive-or-die on both halves now — a room whose
  re-derived record demands the note fails without it, and the note's content is
  re-derived against that record. 14 mutations.

  **AND "DERIVE-OR-DIE ON BOTH HALVES" MEANT SIX ANCHORED REGEXES OVER PROSE A
  HUMAN STILL WROTE.** Round 15 gave the notes an obligation and a content check
  and left them HAND-WRITTEN, so the checks were content-shaped rather than
  content: 5 of 10 mutants walked. A fabricated class passed because **there was
  no class inventory at all** — the one completeness assertion this document has
  applied to the declarable pairs, the renderers, the cut reasons and the record
  leaves was missing from the channel a human actually reads, and **200 invented
  "PERFECT ROOM" notes passed in one run**. An appended lie passed with the
  numerals untouched. A note whose PROSE was reversed while its anchored numerals
  were kept passed — "every one of this room's 27 cut tile(s) is REDUNDANT and
  could be deleted for free … This room ships a DOUBLE SHELL", under the heading
  `NO CUT TILE IS REDUNDANT`. And the ROAD ON RAMPART note's ring tile was moved
  to `49,49` because the tile LISTS were never checked, only the counts. This is
  criticism 17 in the last channel that had escaped it, and it is closed the same
  way: **`declprose-notes.mjs` — a closed 7-class inventory, `renderNote({cls,
  rec})`, and `pushNote()` as the ONLY writer of `plan.meta.notes`**, which
  writes `meta.noteRecords` in the same call so the two arrays are parallel by
  construction rather than by discipline (`grep -c "meta.notes.push"` across every
  layer file and `pipeline.mjs` is **0**). The renderer throws on a class outside
  the inventory and on a heading its class does not declare. The gate is three
  lines — class in `NOTE_CLASSES`, arrays the same length,
  `renderNote(noteRecords[i]) === notes[i]` — and it holds in **172/172 rooms,
  177 of 177 notes byte-exact**. The obligation half is derived from the RECORDS
  and never from the notes (`meta.noteObligations`, in `REQUIRED_META`), checked
  in both directions: **177 obligations === 177 records === 177 notes.** The
  census by class is `sealedFloor 62 · redundantCut 53 (19 "CUT TILES THAT ARE NOT
  SINGLY LOAD-BEARING" + 34 "NO CUT TILE IS REDUNDANT") · shallowExt 36 ·
  pavedRun 12 · roadRampart 11 · containerRoad 3`, plus `pavingGap`, which has 0
  instances today and is in the inventory anyway — for the reason criticism 30
  gives about gates with nothing in them.
  Deriving the obligation from records rather than from notes is also what found
  the last free deletion: **10 of the 177 notes could be deleted for nothing**,
  all of them `SHALLOW EXTENSIONS` notes recording LAYER 6's relocation in rooms
  with 0 shallow extensions and an empty layer-7b reflow — a note whose trigger
  nobody owned, because the obligation was keyed on the shallow count and the note
  was about the relocation. `meta.extensions.relocatedCount` is the missing owner
  and it is 1–3 in exactly those ten rooms. 15 mutations.
- **AND `meta.towers.maxRefill` WAS READ ONLY INSIDE A MESSAGE STRING.** It was
  interpolated into the text of a warning and never compared with anything, so
  setting E7S5's to 99 against a real 5 passed. It is re-derived and compared now,
  as are `shippedMinShellDmg` and `shippedCutTiles` — three published numbers that
  existed only to be printed.

  **AND THE SIBLING DEFECT IS DELETION, WHICH ROUND 12 FIXED FOR FOURTEEN KEYS AND
  NOT FOR THE NEXT FIVE.** A re-derivation that runs only when the key is present
  is switched off by deleting the key — criticism 14's finding — and the schema
  presence gate that closed it is a LIST, so every key added since inherited the
  old escape. A round-14 reviewer deleted `meta.towers.towerDispersion`,
  `meta.towers.shippedMinShellDmg`, `meta.walls.roadKind`,
  `meta.ctrlParksAtSeatSearch` and `meta.ctrlParkFloor` and the rooms passed. All
  five are in `REQUIRED_META`, and `roadKind`
  additionally carries an exact COVERAGE identity rather than a presence test: its
  key set must EQUAL the set of tiles with `roadLayer == 7` carrying a live road,
  so a kind cannot be dropped from the map either. The list is still a list; what
  makes it not the same bug a third time is that the two keys most likely to be
  added next — the ones a producer writes for a reader rather than for a gate —
  are exactly the ones the record-leaf census above now refuses to leave
  unclassified.

  **AND THE LIST TOOK SIX MORE ENTRIES IN ROUND 15, WHICH IS THE HONEST WAY TO
  READ "19 PATHS" — IT WAS 19 BECAUSE 19 WAS AS FAR AS ANYONE HAD LOOKED.** It
  stood at **25** after that round: `meta.towers.adjacency`, `meta.walls.spurTiles`,
  `meta.walls.spurTilesShipped`, `meta.walls.laidByKind`,
  `meta.walls.shippedByKind` and `meta.walls.lostByKind` joined it, and every one
  of the six was a delete-escape a round-15 reviewer landed — the spur block and
  the per-kind road books both ran `if (key) { … }`, so criticism 27's whole
  reconciliation, the identity this document praises for running in 172/172
  rooms rather than only the three interesting ones, could be switched off by
  deleting the counter it reconciles. An identity that runs everywhere and is
  guarded by a presence test runs nowhere on demand.

  **AND THREE MORE IN ROUND 16, TWO OF THEM UNDER A NOTE CLASS THIS DOCUMENT HAD
  ALREADY CALLED "DERIVE-OR-DIE ON BOTH HALVES".** It stands at **28**:
  `meta.sealedFloor`, `meta.walls.inertPruned` and `meta.noteObligations` joined
  it. The first two are the same finding from both reviewers: neither was in the
  list and **neither was ever re-derived** — the gate cross-checked the note text
  against the producer's own record and called that a derivation, so nine live
  escapes stood on one record (delete it and the note goes unchecked; delete
  record AND note and a room that seals 12 tiles says nothing; `tiles` as a
  STRING; a coordinated deflate 12→1; `deep`→0; `ourFault` 11→0, which is a room
  absolving its own mass; a coordinated INFLATE naming eight invented tiles that
  are interior, empty and fully reachable). Deleting `meta.walls.inertPruned`
  with its note took 37 rooms' prune out of the record entirely. Both are fully
  derivable from floods the checker already runs, and both are fully re-derived
  now — the sealed floor including its `named` tile list, under the own-creep
  whole-board flood criticism 43 turned out to need. The pattern is the one this
  bullet keeps restating: the list is still a list, and what saves it from being
  the same bug a fourth time is that a `meta` record which owns a NOTE class is
  now reachable from the note inventory, so it cannot be added without an owner.
- Interior connectivity invariant: interior walk region stays one component reaching
  the sitter and a face of every structure, at every placement step.
- Deterministic output — identical plans across runs. Verified by hashing
  `plans-hub.json` over consecutive `--all-claimable` runs of the shipped tree
  on the 172-room world: the round-16 artifact was rebuilt **twice,
  byte-identical** (round 12 ran the triple), md5
  **`c9849ee611bff811142c69297b8d16b7`** (round 16, as shipped — this is the
  number `md5sum tools/plan-suite/out-v2/plans-hub.json` prints today; a third run
  after `export-anim.mjs --all` produced the same md5 again, which is the check
  that the film export does not touch the plan).
  **Round 16 is the first round where that chain has THREE links inside one
  round, and each of them is stated rather than smoothed into one number**, because
  the middle one is what makes the last one checkable:
  `0e656c1e1d453197f82b36b912d2a31c` (round 15, the artifact both reviewers
  attacked) → `02f7dcfb960ec0ba9e8f840d15de471b` (the producer cluster's rebuild:
  four boards moved, the sealed floor re-flooded, the notes re-rendered — and the
  two `plan.mjs --all-claimable` runs behind it left all **529** files under
  `out-v2/` byte-identical to each other, after which `export-anim.mjs --all`
  rewrote exactly the **4** stale films and left the other 168 alone, which is
  the check that a board change and only a board change reached the gallery) →
  `c9849ee611bff811142c69297b8d16b7` (the `towers|weak-battery` `source` fix).
  The last hop is the one worth a reader's attention: it is proved to be
  **byte-identical to its predecessor plus `"source": "towers"` inserted after
  `"kind"` in exactly 15 layer-3 records** — same 13,417,517-byte length, +450 =
  15 × 30, re-serialised with the producer's own `JSON.stringify(x, null, 2)` —
  so "no board moved, no paragraph moved, no other record was touched" is an
  identity rather than a claim. A digest is only worth quoting if the thing it
  digests is described exactly, and a round with an intra-round rebuild is
  precisely where that stops being pedantry.
  (`a11d30fe5292c54be0bcb691f9ecce3e` was round 14 and is retired with it, as
  `a0c94198bea96d832ad3e342774076c8` was round 13, as
  `c9ac380797f5eecadd4dc78bb890cc96` — round 12 — and
  `391686904ebdc39c2745ae5a741c6726` — round 11 — and
  `4cd61bc629797fc7859d2573b90bc119` — the round-11 pre-fix artifact — were
  before that; the sha256 that used to stand beside them is deleted rather than
  carried forward, because a digest of a file that no longer exists is worse than
  no digest — it reads as corroboration and corroborates nothing.)
  (The `8b24fd42494f5904…` that once stood here matched **no** hash of the artifact
  it claimed to describe — not md5, not sha1, not sha256. A digest is the one
  figure in this document that is worthless when approximately right, so it is
  quoted in full, with the algorithm named, and it is the number `md5sum` prints.
  **THIS DOCUMENT QUOTED TWO DIFFERENT md5s FOR THE SAME ARTIFACT** through all of
  round 10 — this line and the status block below — one of them an intermediate
  run that never shipped. There is now exactly ONE hash in this file, here, and
  the status block points at it instead of repeating it.) `planMs`
  is deliberately not serialised, or the hash would differ on every run for
  reasons that have nothing to do with the planner.
- **Runtime, re-measured 2026-08-02 on THIS world (172 rooms), because the
  previous table described the retired 159-room one.** Four full-fleet runs:

  | run | suite wall clock | in-planner total | planRoom p50 | p90 | max |
  |---|---|---|---|---|---|
  | 1 (round 9) | 134.9s | 123.5s | 588.8ms | 1215.9ms | 4209.7ms (E8S4) |
  | 2 (round 9) | 152.6s | 124.9s | 624.4ms | 1278.8ms | 4053.5ms (E8S4) |
  | 3 (round 9) | 144.1s | 112.6s | 552.9ms | 1120.9ms | 4022.8ms (E8S4) |
  | 4 (round 9) | 202.1s | 171.7s | 832.1ms | 1740.0ms | 7653.3ms (E1S8) |
  | 5 (round 10) | 163.0s | 138.5s | 551.9ms | 1235.5ms | 12361.8ms (E1S8) |
  | 6 (round 10) | 146.7s | 122.1s | 458.6ms | 1159.1ms | 8718.4ms (E12S6) |
  | 7 (round 10) | 111.9s | 106.8s | 430.2ms | 932.5ms | 8026.8ms (E1S8) |
  | 8 (round 10) | 120.7s | 108.3s | 439.2ms | 951.7ms | 8153.2ms (E1S8) |
  | 9 (round 10) | 123.1s | 112.7s | 473.1ms | 1071.8ms | 8871.1ms (E1S8) |
  | 10 (round 10) | 111.3s | 103.5s | — | — | — |
  | 11 (round 11) | 116.2s | 91.8s | 350.7ms | 840.3ms | 7398.1ms (E1S8) |
  | 12 (round 11) | 99.4s | 92.0s | 350.7ms | 840.3ms | 7398.1ms (E1S8) |
  | 13 (round 12) | 106.0s | 99.6s | — | — | — |
  | 14 (round 12) | 94.1s | 88.5s | — | — | — |
  | 15 (round 15, box A) | 92.4s | 85.8s | — | — | — |
  | 16 (round 15, box B) | 131.7s | 106.2s | — | — | — |
  | 17 (round 15, box B) | 100.8s | 93.0s | — | — | — |
  | 18 (round 16) | 94.1s | 87.0s | — | — | — |
  | 19 (round 16, post-rebuild) | 94.8s | 88.0s | — | — | — |

  Rows 13 and 14 are what the suite's own `SUITE WALL CLOCK` line printed on
  round-12 runs, and nothing more; the two differ by 12s of
  wall clock for byte-identical output in the same way runs 8–10 did, which is
  the point the paragraph below this table has been making since round 9.
  Rows 15–17 are round 15's three kept clocks and they are on **two different
  machines**, which is stated in the row rather than smoothed away: 15 is the
  mechanical reviewer's box, 16 and 17 are the producer rebuild's, run 16 carries
  a 25.5s cold mongo fetch inside its wall clock, and runs 16 and 17 are the
  determinism pair — **identical code, byte-identical output, 13.2s apart
  in-planner on the same box.** That pair is the single most useful number in
  this table and it is not a measurement of the planner at all.
  Rows 18 and 19 are round 16's two kept clocks and they straddle the round's
  producer work: 18 is the mechanical reviewer's control run on the round-15 tree,
  19 is the rebuild that shipped four moved towers, a re-flooded sealed floor, a
  new note renderer and the offer scan running over an unthinned seat census.
  **0.7s of wall clock and 1.0s in-planner separate them**, which is inside the
  machine-load spread rows 8–10 and 16–17 already measured, so the round's honest
  claim is that its producer work is not visible above the noise — not that it is
  free. Both sit inside the band below.
  The per-room quantiles are dashes for a reason
  that is worth saying rather than hiding: `planMs` is deliberately not
  serialised (see the determinism bullet), so the p50/p90/max columns exist ONLY
  in the console output of the run that produced them and **cannot be re-derived
  from the artifact afterwards**. Anyone re-checking this row has to re-run
  `plan.mjs --all-claimable` and read its last three lines; there is no second
  source. Round 12 adds one measured pass per audited declaration kind — the
  validator regenerated eight kinds of declaration prose from the record and
  compared (finding M3/M4/F2/F5), and round 13 took that to all 18 — and that
  cost is on the VALIDATOR's clock, not the planner's. **The table got no
  round-13 row and no round-14 row**: both artifacts were rebuilt twice for
  the determinism check and
  no `SUITE WALL CLOCK` figure from those runs was kept, so there was
  nothing to enter — and an entry reconstructed after the fact is exactly the
  kind of figure the rest of this table refuses. Two consecutive rounds of that is
  worth naming rather than repeating: the determinism harness reads the md5 and
  throws the clock away, so the only figure this table wants is the one the check
  it runs beside does not keep. **Round 15 fixed that by keeping the clock, and
  the first thing three kept clocks did was break the band this table had quoted
  since round 9** — see the re-banded paragraph below.
  The in-planner total read 99.6s and then 88.5s across two
  round-12 runs of byte-identical output, straddling round 11's 92.0s and, at the
  time, exactly on the floor of the 88.5–171.7s band this table then quoted; no
  attribution of the difference is offered here, because none was measured, and a
  guessed cause in this table is the same defect as a guessed metric anywhere
  else in it.

  Round 11 adds two measured passes to the planner — layer 3 now reads the
  defender lap before it settles the battery, and re-measures its refill walk
  with the battery standing in it — and the in-planner total went DOWN, because
  removing the arrive bias took 19 rooms out of the over-target set and with them
  the escalation rungs they were composing.

  ~~**In-planner 88.5–171.7s; end to end 94.1–202.1s.**~~ **AND THAT BAND STOPPED
  CONTAINING THE MEASUREMENTS, WHICH IS THE ONE THING A BAND HAS TO DO.** It was
  built from the round-9 and round-10 rows and quoted unchanged for five rounds
  while the planner got faster; round 15's three kept clocks sit at 85.8s, 106.2s
  and 93.0s in-planner, and **the fastest is BELOW the band's floor**. A range
  that excludes the latest measurement is not conservative and it is not stale in
  the harmless direction — it is a claim the artifact refutes, and it survived
  because rounds 13 and 14 kept no clock at all, so nothing was ever compared
  against it. Re-banded on every figure this table actually holds, and stated
  wide because that is what the figures say: **in-planner 85.8–171.7s, end to end
  92.4–202.1s**, with the honest reading of the recent rows being **85.8–106.2s
  in-planner across round 15's three clocks on two boxes**. Runs 8, 9 and 10 are
  a consecutive determinism triple and differ by 12s of wall clock for
  byte-identical output, exactly as runs 3 and 4 did for 59s and as runs 16 and
  17 did for 13.2s this round — the spread is machine load and not planner
  variance, so quote the range, never a single
  figure. Per room that is 0.50–1.00s against the retired world's 0.60s.

  Round 10 adds three measured passes and pays for them inside that range: the
  MOBILITY LIFT TEST at layer 7 (one extra all-pairs metric per over-target room,
  plus at most one per liftable class, each behind a single-BFS prefilter), the
  PLACEMENT VETO at layers 4 and 5 (255 all-pairs re-derivations across the whole
  fleet, because `detourFreeTile` proves most candidates change no distance at
  all from their eight neighbours alone), and layer 3's best-improvement plus
  pairwise dispersion search. The tail moved more than the median: E1S8 and E12S6
  compose four escalation rungs each and now pay the lift test on every one.

  The previous table's "93.1–97.7s … ~95s ± 2s", p90 ~1.1s and worst ~4.3s (E4S7)
  were all measured on the 159-room world and are superseded. The end-to-end
  figure grew for three reasons that are all deliberate: 13 more rooms, the
  unconditional shell re-measure (layer 7 no longer skips it when the cut happens
  not to have changed), and layer 7b, the post-prune extension reflow. The last of
  those is what buys 60/60 in 172/172 and halves the fleet's shallow extensions,
  and it costs roughly one exterior flood plus one walk region per candidate
  tile examined.

  The old "≤ ~200ms per room" budget stays retired for the same reason it was
  retired before, restated below.

  The old "≤ ~200ms per room" budget stays retired deliberately: the planner
  composes up to 4 proof-carrying escalation rungs per room — each rung a full
  shell+program re-plan whose result is kept only if it measurably wins — and that
  proof is precisely what 200ms was silently trading away. The planner runs
  offline, so this is a claim about developer patience, not in-game CPU; the point
  of the table is that the claim is now checkable.

## Optimization objectives (minimize / maximize — reviewer judges trade-offs)

- **MINIMIZE total rampart count** (shell + personal). Ramparts decay; every rampart
  is forever-upkeep. NEW EMPHASIS from the owner: place buildings deep enough
  (depth ≥ 4) that they don't need personal ramparts at all — a layout that pushes
  buildings into the shallow band and papers over it with personal ramparts is a
  WORSE layout even if "safe." Treat each personal rampart as a real cost inside
  placement scoring, not an afterthought. Shallow-structure count per room should
  trend toward zero except where the room genuinely has no deep space.
- Minimize road count (fleet median < 90 held; fewer if it costs nothing else).
- Minimize eco distances: hub↔sources, hub↔controller, with **controller proximity
  weighted slightly ABOVE source proximity**; mineral proximity barely matters.
  A room whose eco walk cannot be shortened declares it, and the declaration's
  whole force is a FLOOR: "no hub position in this room could have done better
  than N."

  **AND THE FLOOR WAS MEASURED IN A DIFFERENT METRIC FROM THE DISTANCES IT
  BOUNDS.** `pathController` and `pathSourcesSum` come from a ring-seeded field —
  every tile of the anchor's work ring is a source of the flood. The floor was
  computed from a single-neighbour-to-single-neighbour path, which is strictly
  larger, because it forbids the two concessions the measured distances are
  allowed. A bound in the wrong metric is not conservative in a useful direction:
  it is simply a claim about a different quantity, and **15 of 38 eco declarations
  stated a floor ABOVE what their own geometry supports** — E17S3 quoted a
  separation of 39 where the ring metric gives 36 (floor 20 vs 18), E2S3 60 vs 56
  (30 vs 28), and 13 more off by one. A room can be made to look optimal by
  measuring its lower bound with a heavier ruler. The separation is now the min
  over every tile t of (steps from t to anchor A's work ring + steps from t to
  anchor B's), which is exactly the metric the two printed distances are in, and
  the resulting bound is both correct AND tighter — a floor that is harder to
  clear, which is the direction an honest floor should move.

  **AND THE CHEBYSHEV HALF OF THE SAME MISTAKE WAS LEFT STANDING FOR A ROUND.**
  Round 11 fixed the ring-vs-point metric for the WALK floor and did not look at
  the chebyshev one, which has the identical flaw for the identical reason: the
  anchor separation is measured between anchor TILES while the distances it
  bounds are ring-seeded, so a step is saved at each end and the correct bound is
  `ceil((d-2)/2)`, not `ceil(d/2)`. It was one too high in **7 rooms**.
  **E13S4 told its owner "no hub position in this room could have done better
  than 19" while tile `26,21` sits at 18 and 18** — a floor a tile on the board
  clears is not a floor, it is the planner taking credit for optimality it has
  not got. Re-derived on the shipped artifact: **E12S1 14 → 13 · E13S4 19 → 18 ·
  E15S9 16 → 15 · E16S5 18 → 17 · E19S5 19 → 18 · E2S6 17 → 16 · E7S5 18 → 17**,
  and E12S5's and E21S1's `anchorFloorBasis` flips `chebyshev` → `walk` because
  the walk bound is now the binding one there. Every one of them moved the
  direction an honest floor moves. See criticism 16.
- Maximize anchors inside the wall: enclose sources/controller when the cut cost is
  small ("it's good to have stuff inside — it's all about defence"). The core may sit
  OFF-center, hugging a source or the controller, when that buys enclosure. Layouts
  need not be square or centered.
- Defender mobility: internal wall-to-wall paths must not exceed attacker external
  paths ("attacker walks 10, I refuse to walk 20") — target max ratio ≤ 1.2 per room,
  and the reviewer flags every room above 1.0 with a judgment call.
  **The detour floor.** The owner's sentence is about a real detour, not about
  arithmetic. A pair where the defender walks 3 and the attacker walks 2 reads
  1.5 and costs the garrison one tick; 64 rooms "failed" the target that way. So
  a pair only counts AGAINST the 1.2 target — for the negotiation's verdicts and
  for declarations — when its absolute detour (inside − outside) exceeds 4 tiles.
  Nothing is hidden: the exact metric still records `max`, `maxStrict`,
  `maxDetour` and the full over-count over every pair, and the declaration prints
  both readings. The escalation trigger deliberately still reads the ungated
  number — that is a heuristic about where to look, and gating it was measured to
  cost 14 shallow extensions and 39 ramparts for a 20s runtime win.

  **AND THE PROSE THEN JUDGED PAIRS THE FLOOR HAD ALREADY DISQUALIFIED.** Two
  rooms shipped declarations asserting that a named pair "still misses" over
  absolute detours of **4 and 2 tiles** — at and under the very floor that exists
  to disqualify exactly those pairs. The verdict cleared two hurdles (detour over
  the floor AND ratio over the target) and the sentence beside it cleared none, so
  the room's own paragraph re-litigated a pair its own gate had thrown out. The
  sentence is now gated on the same two hurdles the verdict is; where they are not
  both met the declaration says the pair is **NOT JUDGED AT ALL** and quotes the
  ungated ratio explicitly as a non-verdict, which is the only honest thing a
  number below the floor can be.

  **AND "THE TERRAIN OWNS THIS LAP" WAS A BINARY CLAIM OVER A CONTINUOUS FACT.**
  Six over-target rooms said the terrain owns the lap while their own lift test
  moved the number: E13S3 3.33→2.17, E11S7 9.33→7.33, E14S6 6.67→5.00,
  E2S5 3.25→2.63, E15S2 2.13→1.75, E9S9 1.94→1.41. That is **18% to 35% of each
  lap that is ours**, described in prose as none of it. The lift test's verdict is
  "does lifting our mass CLEAR the gate," and "no" was being read as "our mass
  contributes nothing" — two different sentences, and the second one is an excuse.
  Binary ownership prose is gone: the declaration prints the SHARE as a percentage
  (`lift.ownPct`) and states that "still misses" marks **where the next fix goes**,
  not that the planner is blameless there. Five of the six ship today at
  `ownPct` **21–35** — E13S3 35, E9S9 27, E2S5 26, E14S6 25, E11S7 21 (E15S2 is
  the sixth and has since gone to a clean lap of 0, which is the point — its 18%
  was never terrain).

  **AND THE LONGEST PARAGRAPH IN THE WHOLE ARTIFACT WAS THE LAST HAND-WRITTEN
  ONE.** `negotiated.detail` — layer 2's negotiation-time account of the lap, 57
  of them, the densest prose a reviewer reads — predates the generated-prose
  architecture and was never brought into it, so criticism 17's finding survived
  in the one place it would do the most damage: a paragraph quoting a dozen
  numbers, checked by nothing, sitting inside a record every other leaf of which
  is gated. It is not rewritten — it is a historical record of what layer 2
  measured and rewriting it would destroy the thing it is for — so instead
  **every number it quotes is now published as a leaf beside it** (15 new ones:
  the eight `metric.*` readings the paragraph names, the worst pair's two walks,
  the two counterfactual re-walks the CAUSE clause quotes with their detours and
  ratios, the measured floor with its candidate count and tie-break budget, the
  eco clause's four figures, and `worstDetour`), and the validator gates the
  paragraph **clause by clause with a zero-residue rule**: it accounts for every
  numeral in the text against a leaf, and a numeral no clause accounts for FAILS
  the room. The producer proves the same thing from the other end — all 57
  paragraphs rebuild **byte-exactly from the leaves alone**. One thing the gate
  found on its way in is worth a reader's attention rather than a silent fix:
  **the pair in the paragraph's closing parenthetical is not the pair in its
  middle.** The middle names the worst GATED pair; the parenthetical names the
  LONGEST-DETOUR pair, and in **8 rooms they are different tiles** (E11S7 E14S6
  E19S5 E19S8 E1S6 E1S9 E2S6 E9S5). Both are legitimate answers to "which pair",
  the sentence was always reporting them honestly, and a gate that assumed one
  reading would have failed 8 correct rooms — which is why the parenthetical is
  bound to its own leaf, `negotiated.worstDetour`, and why the distinction is
  written here instead of being resolved by picking a winner.

  (`layer-shell.mjs`'s `MOBILITY_EXACT_MAX = 90` — the cut size above which the
  all-pairs metric samples instead of enumerating — carried the justification
  "largest cut 75". The largest reachable cut on the shipped artifact is **80**.
  The constant's conclusion is unchanged, 0 rooms sample, but a headroom argument
  quoting the wrong headroom is one relocation away from being wrong about the
  conclusion too. Corrected.)
- Tower coverage: equalize damage across ALL wall faces (towers fall off hard with
  range), spread, refill-distance weighted; the first-built tower (array order) must
  be the easiest to refill.

  **AND ONE OF THE BATTERY'S CONSTRAINTS WAS A DOCTRINE THAT OUTLIVED ITS
  EVIDENCE.** `conflicts()` — "no two towers D8-adjacent" — was written as a hard
  rule for two stated consequences: one nuke takes the pair, and the pair blocks
  each other's refill face. Both of those are now MEASURED exactly, by instruments
  added after the rule (the 5x5 window sweep, round 9; the self-blocked filler
  walk, round 11). A constraint whose entire content is reproduced by two
  instruments that run every plan is not evidence any more, it is a PRIOR — and it
  was refusing improvements those same instruments certified as free. It still
  holds through the whole seed search, where it earns its keep by keeping a
  mean-with-upkeep objective out of a blob. It yields **per trial**, in the refill
  repair pass only, only while the room is over the HARD `MAX_REFILL` ceiling
  (never to shave the soft note), and only on a trial that proves ALL of: weakest
  face and saturation held exactly, whole-mass 5x5 window non-worsening,
  TOWER-ONLY 5x5 window non-worsening (new — the whole-mass max sits on the hub
  trio in 170 of 172 rooms and is blind to a battery collapsing underneath it),
  the self-blocked filler walk strictly falling, and the interior floor still
  whole. Exactly one room in the fleet crosses it: **E2S8, tower `20,18` →
  `20,15`** — refill `[7,8,8,9,10,11]` → `[7,8,8,9,10,10]`, the fleet's furthest
  refill 11 → **10, the hard cap exactly**, weakest face 3570 and nuke window 5
  both unchanged. `meta.towers.adjacency` publishes `priorHeld`, the pairs and
  their tiles (re-derivable from `structures.tower` alone), every crossing with
  the readings it proved, and `satAcrossPrior` — what the prior is still costing
  this room. **Why hard-ceiling only, measured rather than reasoned:** layer 3's
  self-blocked walk is not the number of record — `finalizeRoom` re-derives it
  over the whole as-built board — and letting the crossing run on the soft note
  was built and measured, sending E12S4's AS-BUILT walk 7 → 10 while layer 3's own
  reading fell. A prior is crossed to stop a breach, never to improve a reading
  the crossing layer cannot see.

  **AND `satAcrossPrior` — THE FIELD WHOSE WHOLE JOB IS TO SAY WHAT THE PRIOR
  COSTS — WAS MEASURED ON A BOARD THE ROOM DOES NOT SHIP.** Its `held` was
  `scoreOf(best).sat`, layer 3's own reading, published under a field doc that
  read "what the room ships": in **172 of 172 rooms** it equalled
  `meta.towers.minShellDmg` and never `shippedMinShellDmg`, and layer 7 moves the
  line under both. `reachable` came off layer 3's board too, so the advertised
  gap was the difference between two numbers taken on the same STALE wall — which
  is internally consistent, and that is exactly why nothing caught it. All four
  readings are re-derived at `finalizeRoom` over `meta.shell.cut` × the shipped
  battery with the engine falloff (600 inside chebyshev 5, −30 a tile to 150 at
  20, capped at the 3600 saturation ceiling — the same call that produces
  `shippedMinShellDmg`, so `held === sat(shippedMinShellDmg)` by construction),
  the layer-3 offer is re-read on the shipped wall as `offerOnShipped`,
  `reachable = max(held, offerOnShipped)` and `forgone = reachable − held ≥ 0`.
  Layer 3's reading survives beside them as `atLayer3` — a REFUSAL is only
  explicable against the board that saw it — and a `basis` string states in words
  which board each number is on, because the defect was never a bad arithmetic,
  it was two boards wearing one label. **Five rooms move, exactly the five where
  the two shell readings differ**: E15S5 1350→1410, E21S8 2550→2460,
  E2S6 2520→2310, E3S6 2670→2550, E6S4 3090→3030. What the fix costs and what it
  buys is criticism 34, which is refigured on the shipped board and comes out
  smaller and differently distributed than the prediction. The whole `adjacency`
  object is re-derived by the validator now — pairs, pair tiles, crossings,
  `priorHeld` (false in 1 of 172, and the one is E2S8), `refillTo` and the four
  sat fields — and it is in `REQUIRED_META`, which is the part that matters: it
  had been published for a round with **no reader at all**, the same position
  `maxRefill`, `srcEnclosed` and `roadRampart` were each in on the round it
  turned out each of them was wrong. 19 mutations.

  **AND REBINDING THE BOARD LEFT THE OTHER AXIS MIXED: NOTHING ASKED WHETHER THE
  SEAT WAS EMPTY.** Round 15 fixed WHICH WALL each reading is taken on and did
  not ask what is standing on the tile the room is being told it could move a
  tower to. On the shipped board **7 of the 9 offered seats are OCCUPIED — 4 by
  the nuker, 3 by an extension** — structures that land at layer 5, after the
  offer was made and by a layer that never read it. A number labelled "what the
  adjacency prior is costing this room" that is in fact the cost of a nuker
  arriving later is the same defect as `held` on the wrong wall, one field over,
  and it survived the round that was about exactly this because the fix was aimed
  at the board and not at the tile. The record carries
  **`seatOccupancy {x, y, free, on[], counted[]}`** now — 13 structure kinds plus
  the room objects, with a rampart and a road explicitly NOT occupants, because a
  tower shares a tile with either — and the loss is split at the source into
  **`forgoneToPrior`** and **`forgoneToOccupant`**. The `basis` sentence is
  generated from those same fields (`renderSatBasis`, string-equal — it had been a
  40-character LENGTH check, so a 200-character basis asserting the exact opposite
  of which board each reading was on passed), and it branches on whether an offer
  exists at all, on whether the shipped re-read beats `held`, and on whether the
  seat is free. **Fleet-wide today: `forgoneToPrior` 0, `forgoneToOccupant` 270.**
  What the prior itself still costs this fleet is nothing, and that sentence is
  now a derivation rather than a hope — see criticism 34, which closes on it.
- Controller outside the wall: rampart ONLY its adjacent ring (denies claim-attack
  stands) + link + container. Nothing wider. **The ring defends a room OBJECT, not
  a structure of ours** — this is why the layer-7 inert-rampart prune, whose keep
  test only values a rampart for what it does to our own structures' depth and
  exterior flag, deleted 161 ring tiles across 66 rooms while every gate passed.
  Ring tiles are a named keep-class in that pass (`plan.shell.standDenial`) and the
  validator now re-derives the ring independently: a walkable tile D8-adjacent to
  an outside controller that carries no rampart and is in the exterior flood is a
  hard fail on gate `shell`, kind `ctrl-ring`.

  **AND THE KEEP-CLASS NEVER CHECKED ITS OWN PREMISE.** The ring denies an
  attacker a STAND. Round 11 measured whether the stand exists: **12 ramparts
  across 10 rooms were non-sealing, carried no structure, and were provably
  unreachable by the exterior even when deleted alone** — a rampart forbidding a
  tile no attacker can ever occupy, i.e. pure forever-upkeep against a threat that
  cannot arrive, which is precisely the cost the rampart bullet above calls the
  worst kind. They survived because layer 7's prune held the stand-denial ring
  UNCONDITIONALLY: it was a named keep-class and a named keep-class was never
  asked to justify itself. Naming a reason is not having one. The keep test now
  proves the premise it asserts, and the proof is cheap — a tile joins the
  exterior when its own rampart is deleted **exactly when** it is D8-adjacent to
  the exterior, so the fast reject the pass already ran IS the reachability proof.
  The ring is additionally subtracted from the declared-bubble keep-class, which
  had been holding these same tiles alive on an argument that belongs to a
  different structure entirely.

  ~~**8 of the 12 delete cleanly. The other 4 are KEPT, and they say why.**~~
  **9 of the 12 delete cleanly. THREE are kept, and the fourth was never priced
  at all** — see finding F2/m3 below. Deleting a kept tile promotes an eco bubble
  into the seal, which MOVES THE CUT, and every cut-shaped metric in this
  document is computed over the cut, so the room's battlements, weakest face,
  mobility endpoints and lane bounds all change with it. Re-derived in round 12
  by actually deleting each rampart and re-measuring, one price per tile rather
  than one sentence for all of them:
  **E7S9 `40,44` — cut 59 → 61, weakest face 2700 → 2700, gated lap 0 → 2.50.
  E21S3 `23,24` and `23,25` — cut 29 → 29, weakest sealing tile 2850 → 2670,
  lap 0 → 0.** Trading a sealed enclosure or 180 hit points of the weakest face
  for a rampart of inert upkeep is the wrong side of that trade, so the waiver is
  explicit about what it buys: **inert upkeep, not a new enclosure.** Three
  refusals, individually priced, on the record — and `E16S2 22,32`, which shipped
  the same boilerplate for two rounds, is PRUNED, because its true price was
  nothing.
- **`meta.shell.cut` must BE the wall.** Every shell metric — battlements, the
  battery's weakest face, links on the wall, mobility endpoints — is computed over
  it, so a cut that has gone stale reports all of them against a wall the room does
  not have. The definition is a mutation and both sides run it: a rampart is part
  of the seal exactly when removing IT ALONE lets the exterior flood reach the
  sitter. Layer 7 adopts whatever that test finds into the cut and re-derives every
  metric over the union.

  **AND THE VALIDATOR'S OWN COMMENT CLAIMED A CHECK IT DID NOT RUN.** It said, in
  words, "BE is an equality, not a superset" — while checking one direction only,
  and the shipped fleet has **19 rooms whose cut is a strict superset of the
  singly seal-critical tiles, 43 tiles in total** (20 and 44 at round 11; round
  12's re-priced keep-classes pruned one). So the comment described a
  stricter rule than the code, and the code described a looser rule than the
  comment claimed to enforce, and the fleet violated the comment. Equality is
  also, on inspection, the WRONG bar: single-removal criticality is blind to a
  doubled corner that is load-bearing only as a PAIR — remove either tile alone
  and the flood still fails, remove both and the room is open — so a cut held to
  equality would be forced to drop tiles the wall genuinely needs. The rule is now
  stated as what it is and what is actually enforced: a **SUPERSET WITH PER-TILE
  JUSTIFICATION.** Every singly seal-critical rampart is in the cut; every extra
  tile is a rampart the engine will really build; and every extra tile carries a
  named reason in the room's own `redundantCut` record — **43 of 43 explained
  today**, across 19 rooms, with 6 more tiles pruned outright this run. The
  validator fails any room where the first two do not hold or where an extra tile
  has no reason.

  **AND "A NAMED REASON" WAS ONE STRING FOUR TILES DEEP.** Through round 11 the
  reason was a free-text `class` and nothing re-derived it, so four kept ramparts
  in three rooms shipped a byte-identical boilerplate sentence over four
  different prices — one of which was no price at all (finding F2/m3). The reason
  is now a STRUCTURED record, `{class, pricedDeltas:{cut, weakestFace, lap}}`,
  and the validator **re-derives every delta by actually deleting the rampart and
  re-measuring the room**. A tile whose deltas are all zero is not a refusal, it
  is a rampart nobody looked at, and it now gets pruned instead of explained.

  **AND THAT RE-DERIVATION WAS OPT-IN, WHICH IS THE SAME AS ABSENT.** It ran over
  the reasons a room PUBLISHED, so a room that published none was audited over
  nothing: a round-13 reviewer emptied the reasons map on a room carrying extra
  cut tiles and the run passed clean. "43 of 43 explained today" was a
  description of the artifact, not a property of the gate. `class` is a **CLOSED
  6-CLASS ENUM** now, the reason set must EQUAL the extra-cut set — not be
  contained in it, which is the direction an opt-in check tests — and each tile's
  class is re-derived by deletion, so an empty map fails, a mislabelled class
  fails, and a reason attached to a tile that is not extra fails. 12 mutations.

## Judgment criteria (the owner's voice — reviewer applies these to sampled rooms)

- **Owner-spec ruling: two stamps are fixed and are not up for review.** The hub
  trio (storage + terminal + link, all within range 1 of the sitter) and the
  10-lab diamond are OWNER-MANDATED. A reviewer judges where they were put and
  which way they face — hauler distance, fan clearance, depth, whether the
  diamond plugs a doorway — and never whether they should exist or whether some
  other internal shape would be cleverer. "The trio is a rigid stamp" and "the
  lab diamond is a rigid 4x4" are premises of this goal, not findings against it.
- "Placed with intent, elegant" — nothing that looks accidental, no spam, no filler.
- "Hyper dynamic, grown from the room" — layouts must differ meaningfully across
  terrain; identical-looking rooms on different terrain = fail.
- "Dense but walkable" — extensions flank corridors; a filler tour is short and obvious.
- "Easily defensible, low actions to maintain in late game" — small shell, low upkeep,
  link-based logistics, minimal moving parts.
- Storage is the center of gravity; spawns spread around it, easy to refill, fanned
  into different sectors (never clumped — adjacency has no mechanical value).
- Battlement metadata present where defenders should stand.
- The plan gallery page + animation must make the reasoning legible ("watch the
  planner think") and match the plan tile-for-tile. **The film has to carry the
  bad news too.** Round 9 found the gallery PAGE carrying every declared shortfall
  verbatim while `animNotes()` built an entirely independent caption set that
  never read `meta.shortfalls` — a viewer who only watched the animation saw zero
  of them. The film now ends on a compact shortfalls ticker, one clipped line per
  declaration, driven purely by the data (a room with no shortfalls shows
  nothing). Two more of the same class, both fixed: `extAdd` was in `STAGE_INFO`
  but in neither `STAGE_KIND` nor `EXPAND`, so 21 layer-7b backfill extensions in
  E5S3/E9S2/E9S7 rendered as flat yellow rectangles in the FINAL frame, under a
  HUD line asserting that frame is the shipped plan tile for tile; and the
  relocation captions counted only layer 6's moves while the film played layer 6's
  AND layer 7b's, so E12S6 said "3" over 6 steps. **A third instance landed in
  round 12: `seed` was in `STAGE_INFO` and missing from `EXPAND` (finding F4).**
  Fixed — and three stages falling out of the same three parallel tables in three
  consecutive rounds is not three mistakes, it is a table that needs a
  completeness assertion of the kind `assertPairInventory()` gives the declaration
  lists. It does not have one yet, and that is stated here rather than filed as
  done.

  **AND THE FILM CAN GO STALE WITHOUT ANYONE BEING TOLD — found while fixing the
  above.** `plan.mjs` does not write the animations; `export-anim.mjs --all`
  does, from its own re-plan. Nothing compared the two, so a planner change
  between the two commands leaves the gallery playing a film of a base that no
  longer exists. Measured mid-round-10: an independent final-frame check read
  **152/172**, with 20 rooms painting an observer, five roads and several
  extensions the shipped plan does not have. mtime is not a usable check —
  `plans-hub.json` is rewritten every run, so the films read "older" even when
  two runs are byte-identical, and an alarm that fires on every clean run is an
  alarm nobody reads. So each film now carries `planHash`, a digest of the plan's
  structure types and tiles (`planStructureHash` in `shared.mjs`, sorted, build
  order deliberately excluded), and the suite re-derives it from the plan it just
  wrote and says `animations: 172/172 carry this plan's structure digest` — or
  names the stale rooms. **Running the suite without then running
  `export-anim.mjs --all` is now a loud line, not a silent lie.**

  **AND THE LAYER-7 CAPTION NAMED SOMETHING THE ROOM NEVER LAID.** That caption
  was one sentence about rampart spurs, written once against the rooms that have
  them, and every room whose layer 7 lays no spur tile played it anyway — **85
  rooms ship not one spur tile**, and 20 of those ship other layer-7 road tiles
  and therefore a layer-7 stage, so the caption was naming the single job that
  stage did not do.
  A caption that is true of the fleet and false of the room is the film asserting
  something the plan does not say — the same class as the flat-rectangle stages
  above, arrived at from the prose side instead of the table side. The caption is
  **COMPOSED from per-tile provenance** now: the planner records why each layer-7
  road tile exists as it lays it, in `meta.walls.roadKind`, a **CLOSED 7-kind
  enum** — **spur 370 · swampPave 82 · reflow 20 · alongCutMoved 7 · stitch 4 ·
  conductBridge 3 of the 486 layer-7 road tiles the fleet ships, 0 unclassified**
  (printed whether or not it is zero, for the reason the road+rampart taxonomy
  gives above: a residue class that can absorb anything is not a taxonomy). The
  enum is validator-gated and re-derived from the shipped board — every one of
  the 486 keys is a road tile the room really ships, and the 3 `conductBridge`
  tiles are exactly the three joins criticism 6 paved — so a room's caption can
  only name kinds that room actually laid, and a tile the enum has no word for
  fails the room rather than joining the largest class.

  **THE "487" THIS LINE CARRIED FOR A ROUND WAS 486 KEYS AND ONE GHOST.** The enum
  was gated against the board and never against `roadLayer`, so the two
  layer-7 sets — "tiles the enum names" and "tiles the roadLayer map calls
  layer 7" — were 487 and 486 and nothing compared them. The odd one out was
  **E5S1 `28,30`**, and its root cause is a two-line asymmetry:
  `bridgeDeferredConduct` wrote `roadKind` unconditionally but `roadLayer` only
  `if (roadLayer[k] == null)`. That tile was laid at layer 1, DELETED by layer 7's
  dead-end prune — which leaves the `roadLayer` entry behind on purpose — and then
  re-laid by the bridge, so a stale layer-1 tag survived underneath a layer-7
  sub-kind. The bridge writes `roadLayer = 7` unconditionally now and records the
  supersession (`meta.walls.conductBridge.relaid`), and the validator requires
  **exact equality** between the two sets rather than containment: `roadKind` keys
  `==` `{roadLayer == 7}`, 486 `==` 486. Both sets moving to 486 is two changes,
  not one — E5S1's tile joins layer 7 (+1) and E2S8 loses a stitch tile that
  served the tower the paragraph above moved (−1) — which is the sort of
  coincidence a containment check would have swallowed whole.

  **AND THE ENUM WAS RIGHT WHILE THE BOOKS BESIDE IT WERE NOT.** `roadKind` says
  what SHIPPED; `laidByKind` / `shippedByKind` / `lostByKind` are supposed to say
  what each of the seven passes laid, kept and lost, and they are the whole
  reader-facing truth channel for the late-road stage. On the shipped artifact
  they were wrong for two kinds and silent about a third. **`reflow` published
  laid 0 against shipped 20 and lost 5, across 7 rooms** — the laid map was built
  from five hand-listed locals and stage 7b was not one of them, so the pass that
  lays the most tiles after the spurs recorded none of them. **E18S8's
  `swampPave` published laid 3 / shipped 2 / lost 0**, an arithmetic that cannot
  be true, and the root cause is a distinction the counter never had: `swampPaved`
  counts HOLES CLOSED, and E18S8's third hole was closed by UN-DELETING a road
  layer 1 had laid and the prune had taken, which closes a hole and lays nothing.
  **`conductBridge`'s 3 tiles were in neither map at all**, because it runs in
  `finalizeRoom` after `planWallRoads` has already returned its census. Fixed at
  the source rather than by deriving laid from the tile map — all three maps are
  pre-seeded with all seven kinds, so an unused pass is `0`/`[]` rather than
  absent; reflow keeps its own counter; the restore case is named rather than
  absorbed, in a new `restoredByKind` (swampPave 1 · reflow 6). Fleet laid totals
  today: **spur 375 · swampPave 82 · reflow 25 · alongCutMoved 7 · stitch 6 ·
  conductBridge 3 · extFace 0**, against shipped **370 · 82 · 20 · 7 · 4 · 3 ·
  0** and lost **5 · 0 · 5 · 0 · 2 · 0 · 0**. The lesson is the one criticism 27
  already wrote down and this round had to learn twice: a counter written at the
  moment of intent does not describe an outcome, and `swampPaved` was the same
  defect wearing a different unit.

  **AND THE COUNTER SITTING TEN TOKENS AWAY FROM ALL OF THAT WAS THE SAME BUG A
  THIRD TIME.** `plan.mjs` printed `pruned 2007 dead-end road tiles` on the line
  directly below the one that prints spur laid-versus-shipped correctly, and
  `meta.walls.pruned` was `pruned.size` read at the moment `planWallRoads`
  returned — an EVENT count wearing a TILE label, which is criticism 27's
  sentence verbatim in the room next door. **13 tiles were counted as pruned and
  ship as roads**, and the reviewer's 13 resolves into two entirely different
  facts, which is why "off by 13" would have been the wrong repair: **exactly 1**
  is a tile that was deleted and then RE-LAID (E5S1 `28,30`, the conduct bridge —
  the same tile that was the 487th ghost in the paragraph above, found for the
  second time from the other end), and the other **12** — E2S5 `30,23`/`32,23`/
  `34,23` · E13S3 `20,15`/`21,16` · E5S3 `33,8`/`35,10` · E9S8 `20,38`/`21,39` ·
  E11S2 `42,13` · E18S3 `22,38` · E2S7 `12,24` — were laid by layer 7 AND deleted
  by layer 7 before the pipeline tagged the kept set, so they never entered
  `meta.roadLayer` and the film has nothing to erase for them. Every one of the 12
  is in its room's `laidTilesByKind` and its `lostByKind`, which is how they are
  identified rather than assumed. Both counts were honest; publishing one under
  the other's name was the whole defect. Published as five figures with their tile
  lists, and the two identities are gated:
  **`prunedAtPass 2007 === pruned 2006 + prunedRelaid 1`** and
  **`pruned 2006 === prunedGhosts 1994 + prunedTransient 12`**, plus the board
  checks that make them mean something — every `prunedTiles` entry absent from
  `structures.road`, every `prunedRelaid` entry present in it. The fleet line
  prints all four and names the re-laid tile.

  **AND THE FIX FOR THAT CAPTION WAS APPLIED TO ONE OF ITS TWO COPIES.** The
  composed caption went into `STAGE_TEXT`, the panel beside the film. The FRAME
  BANNER — `ROAD_STAGE[7]` in `export-anim.mjs`, the line burned into the layer-7
  frames themselves — kept the hardcoded "rampart spurs and the ext-face net", so
  for two rounds **20 rooms played a frame banner contradicting the correct
  sentence rendered next to it**: E1S6's layer 7 is the swamp pre-pave, E12S6's is
  reflow faces, E14S5's is roads moved off the cut, and all three announced spurs
  they never laid. Two copies of one caption in two files is why: the tally
  (`LATE_KINDS` / `LATE_ORDER` / `lateRoadDecomp`) lived in `plan.mjs` and
  `export-anim.mjs` had its own string. The tally has MOVED to `layer-walls.mjs`,
  beside the pass that writes `roadKind`, and is exported — one copy, three
  readers — and the banner is composed from it per room. This is the same lesson
  as the three stages that fell out of three parallel tables above, arrived at
  from the other end: the table there had no completeness assertion, and the
  sentence here had no single source.

## Anti-patterns (auto-fail if a reviewer finds one)

- Sparse checkerboard extensions; solid extension bricks; extensions walled in.
- Road spam / city grids / roads on every rampart / roads serving nothing.
- Towers clumped on the hub; towers or eco within ranged-attacker reach (depth ≤ 3,
  unramparted); safety measured against the wall list instead of the exterior region.
  Measured round 12, and **printed by the suite** (`tower clump within chebyshev 2
  of the sitter`) rather than transcribed, which is the only reason it is allowed
  in prose: exact histogram **{0:12 1:14 2:53 3:60 4:30 5:3 6:0}**, i.e.
  **cumulative ≥3 = 93, ≥4 = 33, ≥5 = 3** of 172 (round 15 shipped 4:28 / 5:5,
  round 11 shipped 3:59 / 5:6 with ≥4 = 34, ≥5 = 6; E2S5 recomposed to a clump of
  3, and E14S1 and E3S5 went 5 → 4 in round 16 on the swap their own search had
  been thinned out of seeing). **The two rooms that moved traded 5 for 4 and
  nothing else** — the ≥3 and ≥4 cumulatives are unchanged at 93 and 33, which is
  the shape a strictly non-worsening swap is supposed to have and is worth stating
  because it is the check that the improvement was not bought somewhere off this
  line. The round-10 wording — "93 …
  hold 3 …, 34 hold 4, and 6 hold 5" — was ambiguous between the exact and
  cumulative readings and, on the artifact it was written against, its 93 was a
  transcription of neither (the cumulative there was 91). Both numbers are stated
  now and the suite prints them. Some of that clumping is the interior's shape and
  none of it may be bought back with the weakest wall face, so the **three** worst
  DECLARE — `towers/clump`, quoting the swap search that failed — rather than
  passing in silence. A clump the room can prove it cannot leave is a verdict; one
  nothing looked at is this anti-pattern — and for two rounds two of these five
  were the second thing while reading as the first, because the search behind the
  verdict ranked a different statistic and never saw 255 of the seats it claimed
  to have rejected. See the dispersion bullet.
- Score-chasing: optimizing a number while the layout worsens. The gallery is the
  final judge, not the score. **This cuts both ways and round 9 found the other
  edge:** E11S7 refused to retire five forever-ramparts because doing so moved a
  defender lap it already misses by 1000% from 13.5 to 14 — protecting the number
  while the layout got worse. A veto whose power GROWS with how badly a room is
  already failing is inverted; see criticism 2.
- Silent failure or silent capping — every shortfall must be loud and explained.
- Repair-loop architecture: a layer that "fixes" a previous layer's output instead of
  the previous layer being corrected at the source.

## Baseline + known weaknesses (attack these first)

Frozen fleet metrics: `docs/PLANNER-BASELINE-2026-08-01.json`
(159 rooms · ext60 159/159 · roads median 81 · ramparts total 8704 / median 55 ·
**shallow-rampart extensions 1793** · cut median 38 · eco median 39 ·
enclosed ctrl 88 / sources 170 · mobility>1 in 18 rooms · parks min 5).
Every cycle must move at least one number the right way without regressing others.

Where the fleet stands after round 16 (172 rooms, the world this doc is now
measured against — the 159-room numbers above are kept as the frozen baseline
they are, not as a description of today). Round 15 moved no board and this block
did not move with it. **Round 16 moved four**, and the discipline is the same one
stated the other way round: exactly the figures a four-tower move can touch have
moved, and every other figure in the block is byte-for-byte what it was. **Four
rooms ship one tower on a different tile — E3S1, E4S3, E14S1, E3S5 — and the
fleet's roads (14,104), ramparts (8208), extensions (60/60 in 172/172), road+rampart
taxonomy, `roadKind` enum and every road book are unchanged by them**, which is
what a strictly non-worsening swap is supposed to look like from the outside and
is the reason those totals are listed here rather than re-derived in a footnote.
What did move: **declarations 302 → 300**, the clump histogram's top two buckets,
the sealed-floor total, and criticism 34's whole census. **Every number in it is printed
by one of exactly three commands — `plan.mjs --all-claimable`, `validate.mjs` or
`push-plan.mjs --census` — and that sentence is true for the first time.** It
stood here through round 11 as an assertion rather than a fact: three of the
figures below (the fleet rampart total, the fleet shallow-extension total and the
count of declared shortfalls) were printed by nothing at all and were
re-transcribed by hand out of `plans-hub.json` every round, which is the exact
condition m1 and m2 caught rotting. The suite now prints all three, plus the
notes and the road total, on one line:

  `FLEET TOTALS: ramparts 8208 · shallow extensions 25 (E12S6:6 E2S3:4 E9S2:15) · declared shortfalls 300 · planner notes 177 · roads 14104`

**And the reason that line names `declared shortfalls` explicitly is that a
number which looked like it was already printed was a different quantity.**
`validate.mjs` ends on `declared-shortfall 122`, and 122 is the count of **ROOMS
that pass carrying a note** — its own heading says so, `122 room(s) pass with a
note` — not the count of declarations, which is 300 across 157 rooms. Reading one
as the other is how the wrong number would have survived, and the two are kept
visibly distinct — and in round 14 they moved in OPPOSITE directions, which is the
clearest demonstration yet that they are three quantities and not one: the
along-cut rescope gave five rooms a new planner note (**172 → 177 notes**, in
E14S3 E21S3 E4S1 E5S5 E5S9) of which exactly one, **E4S1**, had carried no note at
all before and so is the whole of **121 → 122 rooms**, while E2S8's tower move
retired the fleet's only `towerRefill` entry (**303 → 302 declarations**).
Round 16 is the cleanest case of the same point: two `towers/clump` declarations
were retired (**302 → 300**) and **none of the other three moved** — 122 rooms
still pass with a note, 157 rooms still carry a declaration, and the 177 notes
are still 177, because a tower moving one seat inside its own room changes what
the room has to declare and nothing about how many rooms have something to say.
The digest is quoted once, in the
determinism bullet above, and not repeated here:
ext60 172/172 (suite) · validator 172/172 fail 0 (validator) ·
ramparts total **8208** (suite, FLEET TOTALS) ·
roads median 81 of **14,104** total (suite prints the median, the distribution
and the total; the census prints the total again beside the arterial
set) · **shallow extensions 25 in three
rooms** (E9S2 15, E12S6 6, E2S3 4 — every one of them declared and every one
named on the FLEET TOTALS line; 26 earlier in
round 12, 28 and then 26 in round 11, 27 at round 10, 31 at round 9) ·
upgrader parks min 4 /
median 8, 0 rooms under the hard 4-seat floor and **2 rooms holding fewer seats
than layer 1 counted — E12S5 and E9S2, both named on the suite's own
`upgrader parks: … released in 2 room(s)` line since round 12 — every one of them
a priced, declared release that is strictly better on shallow slots AND on total
ramparts** (see criticism 4 below
for why `ctrlParkFloor` and `ctrlParks` are different questions) · road+rampart
**278 = 235 crossings + 30 bubble seats + 13 stand-denial ring + 0 personal cover
+ 0 unclassified** (median 2, max 5; `unclassified` printed whether or not it is
zero, which is the fix — see the road bullet, and the 30th seat is round 13's own
paved join, which this document went a round without re-reading) · one mobility declaration per room,
**55 rooms over the 1.2 gated target** and 57 declarations (two rooms declare a
negotiation their mass then fixed), and the `cause` field is now derived from the
same lift test as the prose beside it rather than overwritten after it, with a
room inside the target carrying `cause: "none"`, its VALUE re-derived rather than
merely its presence — see the cause paragraph under
criticism 2 · the COMPLETE mobility record, which is not the verdict: worst ratio
**17.5** and worst absolute detour **33 tiles**, both E7S5, both excused from the
gate by coverage and both DECLARED (`mobility/covered-detour`, 8 rooms) · furthest
tower refill AS BUILT median 4 / **max 10, which is the hard cap and not one step
over it** (E2S8 was the 11 and is the one room whose battery crossed the
adjacency prior to get there), **16 rooms over the 8-step note and all
16 declared** · worst 5x5 high-value window 11 (E6S1 36,23 · E6S9 27,30), mean
7.98, counting the nuker · 0 entombed room objects · **0 staged road orphans and
0 eco terminals a creep cannot reach, at every one of RCL 3, 4, 5, 6, 7 and 8**,
re-derived over a graph in which spawns and storage are the obstacles the engine
says they are, and printed as a per-level table by `push-plan.mjs --census` —
with the honest scope stated where it belongs, and PRINTED rather than only
stated: **3 rooms PAVED their RCL-deferred join — E2S5 `27,23`, E5S1 `28,30`,
E5S3 `32,11` — and 0 rooms publish a PAVING GAP.** Round 12 shipped two of those
three as "unpaveable" against a rule it had invented, and the two roads that
closed them are the whole of round 13's +2 on the fleet road total; the gap gate
does not "survive with nothing in it" any more — it REFUSES every gap claim, for
the reason the census now prints beside the zero: walkable-and-unpaveable is the
empty set in Screeps (criticism 6, and criticism 30 for why "nothing in it" was
the wrong shape) · arterial **7,920 of 14,104** road tiles (census — neither
number moved in round 16, which is the interesting half: four towers changed
tile and no road changed stage, so the staging really is a function of the eco
skeleton and not of where the battery happens to sit. Round 14 moved the
numerator by one, E2S8 having swapped a stitch tile it no longer needs for an
arterial one when its battery moved, so the two rounds together say the
dependency exists and is small) · **300 declared
shortfalls** (suite, FLEET TOTALS — and NOT the `declared-shortfall 122` the
validator ends on, which counts rooms, per the note above), of which 133 are the
per-room mineral-seat-AND-EXTRACTOR off-network exception the road gate used to
grant silently in the checker's own source — both structures named in the
declaration now, the extractor on the stronger argument (criticism 11) — and
**177 planner notes** beside them (suite, same
line), every one of them rendered from a record and obligated by a record
(**177 notes === 177 note records === 177 note obligations**, checked both ways) ·
**sealed interior floor 257 tiles across 62 rooms**, re-derived by the validator
under the own-creep whole-board flood rather than the interior-confined one that
made criticism 43 look like a one-tile wording problem · **`forgoneToPrior` 0
fleet-wide** — the adjacency prior costs this fleet nothing that anybody can
name, and the 270 damage that is still forgone is forgone to a structure standing
on the seat (criticism 34).

Known open criticisms, in priority order:
1. ~~**1793 extensions sit shallow and buy personal ramparts**~~ — the owner's top
   new criterion: placement should avoid the depth≤3 band so those ramparts
   vanish. **Down to 25 fleet-wide, in three rooms** (1793 on the retired 159-room
   world, 31 at round 9, 27 at round 10, 28 then 26 in round 11), every one of them
   carrying a personal rampart. The mid-round-11 +1 was bought, not lost: removing
   the arrive-bias from the gated reading (criticism 7) re-drew every lane bound
   tighter, and E12S6 — which had refused five rampart-retiring relocations to
   hold a lap of 0 at exactly 0 — now trades under a ceiling that may never be
   tighter than the 1.2 target it serves.

   **CLOSED: E1S8'S LAST SHALLOW SLOT WAS FREE AND THE PLANNER DECLINED IT.** The
   room shipped one extension at `4,11` — depth 3, renting a personal rampart
   forever — while `18,16` sat open at depth 5 with **two already-paved D4 faces**,
   and taking it left the gated lap unchanged at 4.00. Nothing was traded for that
   rampart; it was simply not picked up. The cause was a control-flow shortcut in
   layer 7b's relocation: it stopped at the FIRST target its acceptance test took,
   and when the lap ceiling then rolled that move back it threw away **the whole
   trade** instead of trying the next candidate in an order it had already built.
   A first-fit search plus a rollback is not a search; it is a search that a single
   veto can silence. A rolled-back slot is now offered the rest of the candidate
   order and takes any target whose MEASURED lap is inside the same ceiling.
   E1S8 and E15S2 both went to zero shallow, and the fleet went 28 → 26.

   **CLOSED, AND THIS DOCUMENT WAS THE THING THAT WAS WRONG: ALL 28 SHIPPED WITH
   ZERO DECLARATIONS.** The line that stood here said each shallow extension
   "carries a declaration that reports the post-prune search". There was no
   `extensions/shallow` declaration kind anywhere in the planner and not one
   instance anywhere in the fleet. That is silent capping — this document's own
   named auto-fail — and it survived because the sentence describing the
   declaration was the only place the declaration existed. There is now an
   `extensions|shallow` kind carrying a per-slot post-search record **re-run
   against the shipped board**: how many deep targets existed, how many were
   examined, and per slot either the cheapest LEGAL target with the lap it would
   cost, or the fact that no legal target exists at all. The validator FAILS any
   room that ships a shallow extension without it. Three rooms declare: E9S2 (15),
   E12S6 (6), E2S3 (4).

   **AND THAT DECLARATION THEN SWEPT FOR TWO CLASSES AND REPORTED ONE.** See
   finding F1 below: the sentence promised free deep floor "already road-faced OR
   ONE PAVE AWAY" and only ever counted the road-faced class, because the
   producer's `paveableFor` demanded a ROAD adjacent to the pave tile while the
   validator's own network conducts over roads AND containers. The stricter
   invented rule emptied the class fleet-wide. Both classes are counted and
   reported now, and E12S6 took the free move it had been hiding: **shallow
   7 → 6, ramparts 49 → 48, roads 123 → 124, gated lap bit-identical.**

   Still open, because 25 is not 0 — see the new entry at the bottom of this list.
2. **55 of 172 rooms exceed the 1.2 gated defender-mobility target** — attacker
   out-walks defender somewhere on the wall. The line that stood here read "18
   rooms … worst ~3.2", which was measured on the retired 159-room world with the
   pre-mass, ungated metric; re-derived AS BUILT (extension mass standing, only
   pairs whose absolute detour clears the 4-tile floor judged, and — from round
   11 — with the exterior lap measured by the same rule as the interior one) the
   distribution is **24 in (1.2, 2] · 16 in (2, 3] · 12 in (3, 5] · 3 above 5**,
   worst **E11S7 9.33**, then E14S6 6.67, E16S4 5.33, E5S4 4.67, E17S5 4.4. That
   was the single largest gap between what this document claimed and what the
   fleet ships, and understating it by 4x is how it stayed open. The suite's own
   fleet summary now prints this reading rather than layer 2's pre-mass one.

   E11S7's lap is above its round-9 number on purpose and priced: the relocation
   pass used to refuse five rampart-retiring moves because taking them read 14
   against a self-imposed ceiling of 13.5 — five forever-ramparts rented to
   protect a 3.7% change in a number the room misses by 1000%. A room past 2x the
   target may now spend up to 10% of its lap to retire ramparts. E11S7 went from 5
   shallow extensions to **0** and from 58 ramparts to **53**.

   **Round 11 closed two more holes in that ceiling.** (a) It could be TIGHTER
   THAN THE GATE: a room lapping 0 had a ceiling of 0, so E12S6 refused five
   rampart retirements to keep a number a hundred percent inside the target. A
   ceiling may not be tighter than the gate it serves. (b) The layer-6 lane bound
   was CLIPPED TO rather than re-derived, which re-imported the same inversion
   through a different door — a room whose bound equals its incumbent lap can
   never trade at all. Layer 7b now does what layer 6 already does when its own
   relocation pass invalidates its model: it re-measures the bound over the worst
   case PLUS its own moved-to tiles, which is still a strict superset of the mass
   the room ships, so `boundHeld` in layer 7 means exactly what it meant before.
   (c) The rollback was LIFO — it undid the most recent move until the lap came
   back under the ceiling, and moves are independent. E12S6 threw away two
   innocent rampart retirements to reach the one guilty move. It now measures what
   removing each surviving move would give and undoes the dearest.

   **The cause attribution behind this number was also wrong, and that was worse
   than the number.** Four rooms (E16S5, E12S3, E15S4, E4S8) shipped the sentence
   "THE PRIMARY CAUSE IS THE ENCLOSURE AND THE TERRAIN, not the mass" over a miss
   that was entirely ours — E16S5's whole 2.25 was ONE OBSERVER TILE at 24,32, in
   a room with 79 free deep tiles, 16 of which clear the target and the nearest of
   which is one step away; E12S3's was its lab diamond. The old test compared one
   pair's walks with a 15% relative threshold, which cannot see the 4-tile detour
   floor it is being judged against, and three of the four simultaneously carried
   `cause: "structures"` in the same object whose prose said "not the mass".
   Replaced by the LIFT TEST: lift every structure whose position this planner
   chose (extensions, towers, labs, nuker, observer — never the mandated hub trio
   or the spawn fan), re-run the WHOLE metric, and if the gate clears then the
   miss is ours and the guilty class is named by lifting classes one at a time.
   One computation now feeds both the `cause` field and the sentence, so they
   cannot disagree. Layers 4 and 5 also gained a veto — a lab anchor, nuker or
   observer that creates or worsens a gated-over-target pair loses — which moved
   8 structures and took E16S5 and E15S4 to a clean lap of 0.

   **"ONE COMPUTATION FEEDS BOTH, SO THEY CANNOT DISAGREE" WAS FALSE ON THE VERY
   NEXT ARTIFACT, AND SO WAS THIS DOCUMENT'S "cause field and prose agreeing on
   all of them".** One computation did feed both — and then layer 7 OVERWROTE
   `meta.shell.mobilityBuilt.cause` with a pre-mass PAIR-level label whenever the
   room did not miss. A single writer downstream of the single source of truth is
   the same defect as two sources, and it is harder to see. The result: E17S3 and
   E7S9 shipped `cause: "structures"` on rooms whose own headline sentence reads
   "the defender lap is 0 … INSIDE the 1.2 target" — a named culprit for a crime
   the room did not commit — and E17S3 shipped **"THE PRIMARY CAUSE IS THE
   ENCLOSURE AND THE TERRAIN, not the mass" and "CAUSE, as built: structures" in
   one declaration**, which is the exact self-contradiction the lift test was
   built to end, resurrected through a different door. Fixed at the definition
   rather than at the two symptoms: the whole-room lift test is the ONLY source of
   the verdict, it runs ONLY on rooms that miss, and a room inside the target
   carries `cause: "none"`. The pair-level label still exists and is still useful,
   published separately and honestly named as `pairCause`. The validator
   re-derives both and fails a room that publishes a cause — or a lift record —
   **it has not earned**, which is the check that would have caught this the first
   time.

   **AND IT RE-DERIVED WHETHER THE ROOM MAY HAVE A CAUSE, NOT WHICH CAUSE IT
   HAS.** A room that legitimately misses could therefore relabel itself: the
   gate proved a cause was owed and then accepted whichever of the three words
   the producer wrote. The VALUE is re-derived now — the lift test's `clears` is
   the whole of the `structures` verdict (it clears exactly when the cause is
   ours), and the terrain-versus-shape split is re-derived on the LIFTED board
   rather than read off the shipped one — and the two published copies, the one
   in `meta` and the one inside the declaration, must agree with each other and
   with the re-derivation. 7 mutations cover it.

   **AND `pairCause`, THE LABEL THAT WAS SPLIT OFF TO MAKE THE VERDICT HONEST, WAS
   THEN THE ONE NOBODY RE-DERIVED FOR TWO ROUNDS.** Round 12 separated the two
   labels and gated the verdict; the pair label kept the exemption it had inherited
   from being the same field. It is re-derived now, over the same lift-board logic
   the verdict uses — and the re-derivation turned up something worth transcribing
   rather than smoothing over: the fleet ships **two coexisting definitions** of
   it. `meta.shell.mobilityBuilt` labels the WORST GATED pair and writes `"none"`
   for a room inside the target; the declaration's copy labels
   `worstGated || worst`, so an inside-target room's declaration can name the label
   of a pair the verdict does not judge. Both are admissible readings of "which
   pair"; what is not admissible is a gate that quietly picks one and calls the
   other a lie. The validator accepts either, per field, against the definition
   that field is written to, and this paragraph is where the divergence is on the
   record instead of in two functions. 4 mutations.

   **AND THEN THE LIFT TEST'S OWN VERDICT WAS IGNORED FOR A ROUND.** Four rooms
   shipped a mobility DECLARATION whose evidence, in the same object, read
   `lift.clears: true` with ONE sufficient class and a lifted lap of 0 —
   E12S3 1.69 `[extension]`, E15S2 1.67 `[extension]`, E17S8 1.31 `[extension]`,
   **E4S8 1.50 `[tower]`: one tower, one tile**, in a layer that already
   enumerates 600–1400 tower swaps per room for nuke dispersion and had simply
   never read a lap. Three of the four measured 0 at layer 2 and were broken by
   this planner's own placement layers. A declaration is an accepted exception
   only when the criterion is genuinely impossible in that room, and the plan
   itself said it was not. **The verdict now binds:**
   - **THE BATTERY.** Layer 3 reads the lap the way layers 4 and 5 already read it
     — `detourFreeSet` proves for free that six tiles cannot lengthen any interior
     walk, and only the batteries that fail that proof are measured — and then
     swaps seats inside its own non-negotiable price (weakest wall face and
     saturation compared exactly, nuke window and refill walk non-worsening).
     `meta.towers.mobilityVeto` publishes the whole search.
   - **THE MASS.** Layer 7b gained a bounded, lift-directed relocation: it runs
     ONLY when lifting every extension takes the room inside the target, it aims
     only at extensions standing on the mass-free route between the worst gated
     pair, every move is one-for-one onto deep road-faced floor (so no slot and no
     rampart is spent), and every accepted move must strictly lower the whole
     metric — not just the pair. `reflow.mobilityRepair` publishes it.
   - **AND THE DECLARATION SAYS WHAT WAS TRIED.** The old closing sentence
     ("Nothing is relocated to chase this number …") now reads WHAT WAS ATTEMPTED
     and quotes both searches, including when they stood down and why.

   Outcome: **one room in the fleet still ships a `lift.clears` declaration
   (E11S6), and it has no single sufficient class** — its minimal set is
   extension + tower, its tower veto tried and could not move inside the price,
   and its extension pass correctly stood down because lifting the mass alone does
   not clear it. E21S6 (1.53 → 0) and E17S8 (1.27 → 0) are the two the fix caught.
3. Escalated rooms (seed-skip) accept worse eco; the 1.6x cap is loose.
4. ~~Controller parks min 5 (want comfortable ≥6 where terrain allows).~~
   **CLOSED, round 9, and the number in this line was never the real one.**
   `ctrlParks` was measured at layer 1 and then eaten by five later layers that
   had never heard of it: re-derived AS BUILT the fleet ran min **3** / median 7,
   and four rooms (E14S2 8→3, E16S3 8→3, E18S8 8→3, E17S5 5→3) shipped under the
   4-seat floor this planner calls hard, passing the validator only on a
   ctrlParks declaration the pipeline had generated for them out of their own
   damage. Layer 1 now RESERVES every seat it counts (`parkReserve`, read through
   `reservedTiles`), so the shipped fleet is min **4** (E8S2, whose controller
   only ever offered four) / median 8 and **0 rooms below the hard 4-seat floor**.
   Cost, measured: zero — identical ramparts, identical 60/60, identical road
   median.

   **AND THIS PARAGRAPH USED TO CONTRADICT THE STATUS BLOCK TEN LINES ABOVE IT**,
   which says two rooms sit below their own layer-1 count while this one said
   zero. Both sentences were about different quantities and neither said which:
   `ctrlParkFloor` is how many seats the room RESERVES and `ctrlParks` is how many
   it SHIPS. Two rooms deliberately reserve fewer — E9S2 7 of the 8 layer 1
   counted, E12S5 2 of 7 — because `maybeReleaseParks` re-composed them at a
   lower cap and that composition was strictly better on shallow extensions and
   total ramparts, and each files a `ctrlParks/released` declaration naming the
   tiles it gave back. Both still SHIP at or above the floor (7 and 5). The rule in
   `shared.mjs` — "the floor is what layer 1 measured, capped at PARK_PROTECT" —
   was likewise missing that clause and now states it, `meta.ctrlParkFloorWhy`
   says in words which of the two rules produced the number, and the claim here
   is the one that is true and load-bearing: **0 rooms below the hard floor.**

   **AND THE RELEASE'S OWN PARAGRAPH SAID "COMPOSED IN FULL" ABOUT A LOOP THAT
   BROKE EARLY.** `renderCtrlReleased` derived the sentence "every cap from H-1
   down to 0 was composed and measured" from `held`, i.e. from the range the
   search was ASKED to walk, while `maybeReleaseParks` carried
   `if (altShallow === 0) break;` — and the comment on that break ("nothing below
   this can do better") was false on the function's own tie-break, which ranks
   more parks then fewer ramparts once shallow ties at zero, so a LOWER cap can
   win a tie the break never let it contest. A sentence derived from the intent of
   a loop is not a description of the loop. The break is gone, `composedCaps[]`
   `composedFrom` `composedTo` `winningCap` and the three rejection counters are
   recorded, and the sentence is generated from what RAN — E12S5 now says seven
   caps were composed in full, 6 down to 0, every rung, no early exit — and says
   the claim cannot be made at all when the record lacks `composedCaps`. The
   boards did not move: E12S5 still winning cap 2 (keeps 2 of 7, ships 5), E9S2
   still 7 (keeps 7 of 8), which is the outcome that makes this a paperwork
   finding rather than a placement one.

   **AND THE RECORD THAT REPLACED THE SENTENCE WAS THEN BELIEVED FOR A ROUND.**
   Round 14 made the claim derive from `composedCaps` and checked that the array
   was PRESENT — so a room could publish `[2]` and still render "every rung, no
   early exit", which is the early break with a witness list attached. The array's
   CONTENT is bound now: it must descend contiguously from `composedFrom` to
   `composedTo` with no rung skipped, its endpoints must be those two fields,
   `winningCap` must be a member of it, `composedTo` must agree with the trail,
   and the three rejection counters may not exceed the walk. One ordering bound
   came with it — `rampartsHolding >= rampartsReleasing`, because a release that
   costs ramparts is not a release — and it bites on the inversion (42 → 10) that
   would otherwise read as a spectacular saving. 6 mutations.
5. Rampart total should fall overall (8704 on the retired world → **8208** today,
   8222 at round 11) via deeper packing, not via weaker shells. Still open: the
   shells are the same shells, and the fall is almost entirely personal ramparts
   retired by the post-prune reflow plus the 8 inert stand-denial ring tiles round
   11 proved no attacker can ever stand on, not min-cut savings. Round 12's −14
   is the same story a third time and it should be read that way: the bubble
   keep-class was made to prove its premise (F2/m3), which released E16S6 `15,19`
   and E6S7 `18,17`; the fourth stand-denial refusal E16S2 `22,32` was re-priced
   at nothing and pruned; E12S6 took a free deep slot (F1); and E2S5 recomposed to
   33 ramparts from 43. **Not one of those tiles came off a min-cut.** Until a
   round moves this number by moving the WALL, this criticism stays open no matter
   what the total reads.
6. **The RCL BUILD STAGING is a separate contract from the plan, and it had gaps.**
   `src/utils/PlanV2.ts` claimed RCL3 builds "the roads a hauler actually walks";
   re-derived through `roadStageFor`, the stage-3 network never reached 8 eco
   terminals, and RCL2-built containers had their serving road staged later than
   the container — E16S6's controller container `16,19` is built at RCL2 and
   waited until RCL4 for `17,20`/`16,20`. Both are now guarantees in
   `push-plan.mjs`: every eco terminal's cheapest chain back to the arterial
   network is promoted into stage 3, and every RCL2 container with a planned D4
   face gets that face at the earliest legal road stage (which is 3 — roads are
   hard-gated off below RCL3, so "staged with it" cannot mean stage 2).

   **AND THE GRAPH THOSE GUARANTEES WERE MEASURED ON LET A CREEP WALK THROUGH THE
   SPAWN.** `roadStageFor` and its own check `stagedOrphans` both built their
   conducting set from `["storage", "spawn", "container"]` — described in the
   source as "the generous reading, so we only ever bridge a gap the bot would
   also call a gap". `STRUCTURE_SPAWN` and `STRUCTURE_STORAGE` are in the engine's
   `OBSTACLE_OBJECT_TYPES`. The bridge pass and the check that audits it shared
   the same wrong graph, so the check could never catch the pass, and the bot's
   own `auditRoadPrefix` in `PlanV2.ts` used the identical set — three places
   agreeing with each other and none of them with the game. Re-derived over
   walkable conductors only (road + container), seeded at the SITTER rather than
   at the storage a creep cannot stand on: **57 stage-3 road tiles across 18 rooms
   sat behind a 1–2 tile unpaved gap**, and one of them was an eco terminal —
   E7S4's source container `37,12`, with the spawn at `31,17` between the stage-3
   roads at `30,17` and `32,17`. The claim published off it, "0 unreachable eco
   terminals at stage ≤ 3", was **1**. All three sites now use the walkable graph.

   Re-derived on the shipped artifact, over that corrected graph and printed by
   `node tools/server/push-plan.mjs --census`: **0 eco terminals a creep cannot
   reach and 0 staged road orphans at EVERY ONE of RCL 3, 4, 5, 6, 7 and 8**,
   arterial set **7,920 of 14,104**
   road tiles, container-face pass **30 tiles across 28 rooms**, eco-reach chains
   **6 tiles across 3 rooms**, the two together **36 tiles across 31 rooms, max 3
   in one room** (E14S5); the pass only ever RE-STAGES roads the
   planner already placed and never invents one, and the census now ends that
   sentence with the arithmetic instead of the assurance — **`924 tiles promoted,
   0 demoted`**. The `0 demoted` in this paragraph was quoted as a printed figure
   for a round while nothing printed it, which is m1/m2 committed by the fix for
   m1/m2; it is printed now.

   **AND UNTIL ROUND 12 THAT SWEEP ONLY EVER RAN AT RCL 3.** One line reading
   "0 tiles in 0 rooms" was the entire published evidence that this staging was
   sound, and it was 0 for two reasons at once: it was measured on the pass's own
   graph (finding M1/F3), and nobody had asked about RCL 4 through 8 at all. A
   single green tick over one level, produced by the code being audited, is not
   evidence — it is the shape of the defect this whole audit exists to catch,
   reproduced inside the audit. The sweep now runs at every level and prints a
   per-level table naming the rooms and the tiles, which cannot be summarised into
   a tick by accident. What it found when it was first run honestly: **3 orphans
   + 1 unreachable terminal at RCL3, 8 + 1 at RCL4 and RCL5, and 133 false
   positives at RCL6-8** from containers the audit was counting before they were
   built. All at 0 today, at all six levels.

   **The honest scope, stated rather than rounded off — AND PRINTED, which is the
   only version of "stated" this document accepts any more.** `--census` ends on:

   `RCL-deferred conduct: 3 room(s) PAVED the join — E2S5(27,23) E5S1(28,30) E5S3(32,11); 0 room(s) publish a PAVING GAP`

   So "0 orphans at RCL 3 through 8" is true with **three rooms paving their join
   and no room conducting over a gap at all.**

   **AND THE TWO THAT WERE CALLED UNPAVEABLE WERE NOT. THE RULE WAS INVENTED.**
   Through round 12 this passage said E2S5 `27,23` and E5S3 `32,11` were joins
   "the engine will not let you pave", because each is the tile the mineral
   container occupies and "the engine allows one structure per tile". **The
   engine does not say that about roads.** A road and a container legally share a
   tile — this very fleet ships **62 tiles carrying both, across 55 rooms**, and
   the audit's own conductor set has always contained both kinds — so the
   sentence was contradicted by the artifact it was written about, and by the
   graph in the paragraph above it. Two rooms were excused from paving by a rule
   nobody could have found in the game, and the excuse was airtight precisely
   because it sounded like physics. Both joins are **PAVED** now, one road each,
   releasing **11** pre-RCL6 stranded conductors in E2S5 and **5** in E5S3 — the
   same 11 and 5 this document had been quoting as the size of the loss it was
   accepting. That is the whole of the fleet road total's +2.

   ~~**THE GATE STAYS, WITH NOTHING IN IT, BECAUSE A GAP IS STILL AN EXCUSE.**~~ A
   tile named as a paving gap CONDUCTS in the audit — that is what naming it buys
   — so a room could publish a stretch of BARE FLOOR as a gap and have its
   orphans conduct away, which is a room declining to pave and calling it
   geometry. The rule was re-derived from the ENGINE'S OWN obstacle set rather
   than from prose: a tile is unpaveable when it carries an obstacle structure or
   is terrain wall, and **nothing else counts** — which is exactly the check that
   would have refused the two gaps round 13 deleted. Zero rooms publish a gap
   today. It was kept enforced anyway, and the census prints the zero, because the
   next room that wants one will want it for a reason that sounds just as good.

   **AND THAT RULE, WRITTEN OUT, IS THE EMPTY SET — SO THE GATE HAD IT BACKWARDS.**
   A gap tile is the claim "a creep walks this tile and no road can be built on
   it". Intersect the two halves against the engine and nothing is left: the
   engine refuses a road only on natural wall, which is not walkable, and every
   obstacle structure that forbids the road also forbids the creep. Round 13
   tightened the rule to "obstacle structure or terrain wall" and shipped a gate
   whose PASSING branch granted exactly the obstacle tiles — so the fix for
   "a room could name bare floor" was to accept only the tiles that make the gap a
   conductor through a spawn. The same shape sat in `push-plan.mjs`'s
   `verifiedGapTiles`, by design and documented as such. Both are inverted now:
   **any nonempty `gapTiles` FAILS the room (`PAVING GAP REFUSED`), and
   `verifiedGapTiles` returns the empty list unconditionally**, warning per tile
   with the reason that tile is not a gap. The census prints the zero with the
   argument attached rather than the count alone. What makes this the right shape
   and "a gate with nothing in it" the wrong one: the old gate was waiting for a
   legitimate gap that cannot exist, and a gate waiting for the impossible spends
   its whole life deciding which impossible thing to allow. 3 mutations.
   (The stale `push-plan.mjs` header comment that said "One room in the fleet has
   a join that cannot be paved by anybody" — written when E5S3 was the only one,
   and left standing when E2S5's recomposition made it two — was corrected in
   round 12 and is now gone with the claim it repeated: no room in the fleet has
   such a join, and the rule that said two did was invented.)

   **The "road-array prefix invariant 172/172" line that used to stand here was
   false in the literal reading and true in the one that matters.** A strict
   prefix holds in **0/172** — `PlanV2.ts` itself says so, in words, at the road
   branch of the placement loop: "the RCL selection is a staged subsequence, not a
   prefix". What holds in 172/172 is the property the staging is actually sold on:
   **monotone subset — the stage-3 set is contained in the stage-4 set and nothing
   ever un-builds.** That is what is claimed now.

   Still open, and outside push-plan's reach: **218 RCL2 containers across 143
   rooms have no planned D4 road face at all** — every one is reachable over the
   stage-3 network and D8-adjacent to a road, but a re-staging pass cannot create
   a face the planner did not lay. That is a `tools/plan-suite/v2` question and it
   is the next thing to attack here. (This line said **220 across 145** for two
   rounds. Re-derived twice against the shipped artifact using push-plan's own
   `rcl2Containers()` — source seats plus the controller container, the mineral
   one deferred to RCL6 — it is 218/143; the all-four-containers reading gives
   **363 across 168 rooms** and no reading gives 220/145. The wrong pair was in
   TWO places, here
   and in a comment in `src/utils/PlanV2.ts`, and both are corrected. It survived
   two rounds for exactly one reason: **`--census` never printed the figure.** It
   does now. A number in prose that no tool re-derives rots exactly like a metric
   no gate re-derives, and the fix for both is the same — make something print
   it.)

   **AND THE SECOND FIGURE IN THAT PARENTHESIS WAS WRONG AGAIN, WHICH IS THE
   POINT IT WAS MAKING.** The all-four-containers reading stood there as
   **365/168**; the artifact says **363 across 168 rooms — 218 RCL2 containers
   plus 145 mineral-only ones**. So the paragraph written to explain how a
   hand-copied number rots was itself carrying a hand-copied number, wrong in the
   round that corrected the figure beside it. The 218/143 pair was right for
   exactly the reason the paragraph gives — `--census` prints it — and the 365 was
   wrong for exactly the same reason inverted, because nothing printed it.
   `--census` prints both readings now, with the 218 + 145 split named, and
   `924 tiles promoted, 0 demoted` on the line under them.
7. **THE ARRIVE BIAS RE-IMPORTED THE NOISE THE DETOUR FLOOR WAS BUILT TO REMOVE.**
   Both laps of the mobility ratio are measured tile-to-tile with the same
   primitive. The defender occupies both wall tiles so his walk is exact; the
   attacker occupies neither, so his raw reading carries one phantom step at each
   end. The gate used `raw - 1` — the half-measure — and that is one tile BELOW
   the 4-tile detour floor's own granularity, so it inflated every pair's absolute
   detour by exactly one and promoted pairs at a TRUE detour of 4 (this document's
   own definition of "arithmetic noise wearing the costume of a defect") over the
   floor. Nine rooms carried a full declaration for one such pair; E8S9 published
   8 in / 3 out at 2.67 over a detour of 5 that is really 8 in / 4 out and does not
   clear. The gated verdict now uses the true tile-to-tile lap on both sides —
   a strict LOWER bound on the defender's disadvantage, so the gate can never fire
   on an artefact of the measurement — and `maxStrict` (`din / (raw - 2)`, the
   harshest reading) stays published on every measurement so the strict truth is
   always on the record. Fleet effect: rooms over target **75 → 56**.
8. **THE WORST PAIR IN THE FLEET WAS DELETED BEFORE IT WAS MEASURED.** A pair of
   wall tiles is excused from the gate when a defender standing on either one
   already covers every exterior tile an attacker can stand on to grind the other
   — he answers the grind without walking. That argument is sound about
   REPOSITIONING and it is not an argument about the wall, because consolidating
   the garrison still costs the walk. The exclusion `continue`d the pair **before a
   single statistic was accumulated**, while two comments in the same function
   asserted the opposite in so many words ("`max` above stays the complete
   record"). E7S5 shipped `max 1.5 · maxGated 0 · maxDetour 1 · cause "none"` and
   **no shortfall of any kind** over 35 tiles inside against 2 outside — an
   absolute detour of 33 at a ratio of 17.5, the worst pair in the fleet, on a
   board where the doc's headline said the worst was 14.0. The exclusion now
   applies to the VERDICT and never to the RECORD: `max`, `maxStrict`, `maxDetour`,
   `over`, `pairs`, `worst` and `worstDetour` cover every connected pair, the size
   of the difference is published (`coveredPairs` / `maxCovered` / `worstCovered`),
   the lane machinery can see the excused pair and price it like any other, and a
   room whose record beats its verdict files `mobility/covered-detour` with both
   walks, the coverage argument, and the lift test that says whose fault it is.
   **8 rooms declare it.** E7S5's is pure enclosure — lift every structure this
   planner placed and the same pair still walks 35 — so it declares as the fleet's
   record worst rather than being fixed, and it says so with the numbers.
9. **`refillDists` WAS A PRE-MASS NUMBER NOBODY RE-DERIVED, AND ITS CHECK WAS
   WRITTEN TO REPRODUCE THE PRODUCER'S BOARD.** Layer 3 measures the filler's walk
   to each tower on a board that blocks storage/terminal/link/spawn and the room
   objects — and not the other five towers, which do not exist yet, nor the labs,
   nuker, observer and sixty extensions, which are all obstacles. `validate.mjs`
   copied that same board on purpose ("they are not in the planner's field
   either"), so it confirmed the arithmetic and could never question the premise.
   Re-derived on the AS-BUILT RCL8 board, 15 of 172 rooms walked further than they
   published and the count over the 8-step "legal, not good" line went 15 → 17 —
   with **two rooms (E12S4 7→9, E18S3 6→9) over it in silence** while E8S4, at the
   same as-built number, declared. Three fixes: layer 3's own reading is now
   SELF-BLOCKED (the battery is measured with the battery standing in it) and
   carries a bounded repair search over its own candidate seats under the same
   non-negotiable price — that alone took E12S4 to 7 at zero cost to the weakest
   wall face; layer 7 re-derives the walk over the whole shipped base and THAT is
   the number of record, with layer 3's kept beside it; and the validator measures
   it on the shipped board and fails `towers/refill-stale` — an UNDECLARABLE gate —
   on any disagreement. **16 rooms are over the note as built and all 16 declare.**
   Round 14 took the last room that was over the HARD cap rather than the note —
   E2S8, 11 → 10 — so the fleet's furthest refill walk is now the cap exactly, and
   the fleet's one `towerRefill` declaration went with it (303 → 302 declarations).
   The 16 over the soft note are unchanged and stay declared: E2S8's own
   weak-battery entry survives the fix and is now TRUE AT THE CAP rather than over
   it, which is the outcome, not the one the brief predicted — see criticism 29.
10. **`srcEnclosed` WAS A STALE SHELL METRIC, AND ONE ROOM OVER-CLAIMED WITH IT.**
   The source-enclosure verdicts were computed by layer 2 against layer 2's
   exterior, before one eco bubble or adopted seal tile existed — while
   `meta.shell.remeasured`'s own sentence promised that "the exterior, and every
   metric taken against it, is re-derived over the union rather than over the
   min-cut ring layer 2 negotiated". They were not. Understated, the fleet read 176
   strict sources against an as-built 215; over-stated, **E13S4's source 19,3
   declared `srcEnclosed: true` while shipping a bare, unramparted, exterior tile
   at 19,2 directly adjacent to the source** — an attacker standing next to our
   miner. Re-derived at `finalizeRoom` over the shipped rampart union: E13S4 now
   reads `[false, true]`, the fleet reads **215/344**, and layer 2's verdict is
   kept as `shell.enclosedAtNegotiation` because that is what the enclosure was
   bought on. `enclosedController` and the works-only source reading are
   deliberately NOT re-derived on that basis and the code says why: against the
   union they are tautologies, because the controller's stand-denial ring and
   every source work are made of ramparts by the time the room ships.

   **AND FOR THREE ROUNDS THE FIXED FIELD HAD NO READER.** Moving the computation
   to `finalizeRoom` made the published verdicts true and left them exactly as
   checkable as they were when they were false — nothing in `validate.mjs` ever
   read `srcEnclosed`, so the mutation "flip a source's enclosure verdict" had no
   gate to bite. This is the same class as `maxRefill` living inside a message
   string and `roadRampart` being summed by its own producer: a number whose only
   consumer is the sentence quoting it. It is re-derived FLEET-WIDE now — exterior
   flood plus the ring test, per source — and the re-derivation reproduces
   **215/344 with 0 mismatches**, which is the first evidence that the round-11
   number was right rather than merely newer. 4 mutations.
11. **AN EXEMPTION THAT LIVES ONLY IN THE CHECKER IS NOT AN EXEMPTION.** The road
   gate reads "one connected road network touching every structure" and enumerates
   its exceptions. The mineral seat's was not among them: it existed as one
   hardcoded `continue` in `validate.mjs`, and **133 of 172 rooms shipped an
   undeclared exception to a hard gate**, excused by the checker's own source. The
   decision is right — a mineral is one deposit on a 50,000-tick regeneration
   cooldown, and road decay does not pay for the walk it saves — and it is the
   PLAN's decision, so the plan now files `{gate:"misc", kind:"off-network"}`
   naming the seat tile and arguing it, and the validator's exemption READS the
   declaration. A room that ships an off-network mineral seat in silence now fails
   the road gate like anything else (two mutations cover it).

   **AND THE EXTRACTOR STANDING ON THE SAME TILE PAIR WAS STILL EXCUSED BY THE
   CHECKER'S OWN SOURCE.** The fix moved the SEAT into the declaration channel and
   left the structure beside it where it was: `OWNED` in `validate.mjs` simply
   omitted `"extractor"`, so the road gate never asked the question in **133 of
   172 rooms** and not one declaration in the fleet named the tile. That is this
   criticism's own headline, one structure over, surviving three rounds inside the
   fix for it — an omission from a list is even quieter than a `continue`, because
   there is no line to read. `"extractor"` is in `OWNED` now, the exemption is
   keyed on the declaration, and the plan argues it — on a case STRONGER than the
   seat's, which is why it is worth a paragraph rather than a list entry: a mineral
   is in `OBSTACLE_OBJECT_TYPES`, so no creep can ever stand on the tile the
   extractor occupies. It is the only owned structure in the RCL8 program that is
   never entered, never filled and never emptied, and the road rule — which exists
   so a hauler can service a structure — has no content for it at all. The miner
   stands on the seat and harvests at range 1; the extractor's entire interface is
   a cooldown. **133/133 rooms name both tiles** (and `offNetwork.seats` stays 1,
   because the extractor is on the tile list and is not a seat); in the other 39
   the seat is a live network node the extractor touches, so no claim is made.
   3 mutations.
12. **STILL OPEN: THREE ROOMS SHIP 25 SHALLOW EXTENSIONS BETWEEN THEM** —
   E9S2 15, E12S6 6, E2S3 4, each renting a personal rampart forever (26 at the
   start of round 12). Round 11
   turned this from a silence into an argument: every one of the 25 is now priced
   and declared, with the cheapest LEGAL deep target and the gated lap it would
   cost, re-derived on the shipped board and enforced by the validator (see
   criticism 1). An argument is strictly better than a silence and it is not the
   same thing as zero. Round 12 then found that the argument had been made in a
   metric of its own invention (F1) and that the one free move on the board had
   been invisible because of it; E12S6 took it. The three rooms are the fleet's
   tightest, so the next attack
   is on what makes a deep target ILLEGAL in them — the lap ceiling, the road-face
   requirement and the slot count — rather than on the search that is now correctly
   reporting that it found nothing it may take. **And one thing this round did NOT
   fix and should be attacked next: the shallow declaration's `sharedTarget`
   problem.** All 6 of E12S6's remaining slots quote the SAME single tile `22,7`
   at the same lap of 1.63 as their cheapest legal target, so **five of them are
   bound by SUPPLY and not by the lap at all** — even if the ceiling moved, one
   tile relocates one slot. The declaration publishes `sharedTarget` now and says
   so; naming it is not solving it. A per-slot price six slots can all claim is a
   price five of them can never pay. (E9S2's 15 and E2S3's 4 are a different and
   harder case: `targets 0` in BOTH classes over all 2304 interior tiles — those
   rooms have nowhere to go at any price, so the ceiling is not what binds them.)

Round-12 findings. Every one of these was landed as a working exploit by a
fresh hostile reviewer against the round-11 artifact, and every one names what
now makes it impossible rather than what was patched:

13. **CRITICAL (C1): THE `rampart` GATE WAS DECLARABLE, AND SO WERE SIX MORE.**
   The undeclarable list was built in round 11 by re-reading every message the
   validator raises against its own words about that message (criticism 11
   above), and it was built by HAND, which means it was built by whoever
   remembered. It missed the seal. A reviewer moved a structure into the exterior
   flood, filed `{gate:"rampart",kind:"leak"}` and `{gate:"rampart",kind:"shallow"}`
   beside it, and the run printed **`pass 1/1 · fail 0` on the same summary line
   that printed `leaks 1, shallow 1`** — a room excusing itself from the wall.
   The identical trick worked on container/storage/tower placement. This is the
   round-11 finding word for word, one list entry over, which is the tell that the
   fix was the wrong shape: an enumeration of what may NOT be excused defaults to
   PERMITTED for anything nobody enumerated, and a hard gate whose default is
   permitted is not a gate. It is inverted now. `DECLARABLE_PAIRS` is a **CLOSED
   LIST** — a violation class nobody has classified is REFUSED, not allowed — and
   a load-time `assertPairInventory()` walks every pair the validator can raise
   against that list so a new message cannot be born undecided. `rampart|leak`,
   `rampart|shallow`, `extractor|placement`, `extensions|diag-only`,
   `extensions|off-road`, `road|orphan-road` and `ctrlseat|seat-unreachable` are
   all outside it. Two more holes in the same machinery closed with it:
   **duplicate declarations** (filing the same pair twice used to excuse twice;
   both copies are now VOIDED, because a room that files a thing twice has not
   told you anything twice) and a **budget cap** — a declaration carrying no tiles
   and a `count` over 32 is inadmissible, which is the wildcard written as an
   integer. 8 mutations, all bite.
14. **CRITICAL (C2): DELETING ONE META KEY SWITCHED OFF SIX GATES AT ONCE.**
   Every audit in `validate.mjs` is written `plan.meta?.x?.y || []`, which is
   correct defensive JavaScript and catastrophic as a contract: **an absent key
   reads exactly like a passing check.** Deleting `meta.shell.cut` took six gates
   down silently and the room passed. Nothing about this is subtle and it survived
   every round because the failure mode of `|| []` is to look like success, and
   nobody writes a test for a key being there. There is now a **SCHEMA PRESENCE
   GATE**: 14 required meta paths, absence is a HARD FAIL, and it runs BEFORE
   anything reads them, so the order of operations makes the substitution
   impossible rather than merely detected. 15 mutations, all bite.
   **And a list of paths inherits the bug for every path added after it** — round
   14 deleted five keys the list did not know about (`towerDispersion`,
   `shippedMinShellDmg`, `roadKind`, `ctrlParksAtSeatSearch`, `ctrlParkFloor`) and
   the rooms passed. `REQUIRED_META` is **19 paths** now, and `roadKind` carries an
   exact coverage identity on top of presence; the general answer to
   "list maintained by whoever remembered" is the record-leaf census in the
   declaration bullet above, which is a completeness assertion rather than a list.
   4 more mutations.
15. **(M1/F3) THE AUDIT SHARED ITS GRAPH WITH THE PASS IT AUDITS — AGAIN.** This
   is criticism 6's defect a second time, in the same file, on a different axis.
   The RCL3 conduct graph walked THROUGH the RCL6-deferred mineral container,
   because it built its conductor set from the plan's unfiltered container array,
   and `stagedOrphans` — the check written to catch exactly that — built its set
   from the same unfiltered array. An audit that shares its graph with the pass it
   audits reports zero BY CONSTRUCTION; it is not a weak check, it is not a check.
   All three sites now call `plannedTilesFor` at the RCL being audited, so a
   container that does not exist yet cannot conduct; `stagedOrphans` sweeps RCL
   3 through 8 rather than only 3; **E5S1 is PAVED at `28,30`**; ~~and E5S3's join
   cannot be paved by anybody — it is the mineral container's own tile — so it
   publishes a verified PAVING GAP instead (see criticism 6 for the scope, and
   for E2S5, which became a second one this round).~~ **That clause was false and
   round 13 deleted it along with both gaps: a road may share a tile with a
   container, so E2S5 `27,23` and E5S3 `32,11` are PAVED too and the fleet
   publishes zero gaps — see criticism 6 and criticism 23.** A new validator gate
   re-derives the whole thing from terrain, and it was proved by re-running it
   against the PREVIOUS artifact, where it bites. **And the gap is itself gated,
   because a gap that conducts is an excuse that conducts**: a gap tile ~~must be
   one the ENGINE refuses to pave — an obstacle structure or terrain wall — and
   not merely one the planner did not~~ **is now refused outright, because that
   test's passing branch was the obstacle tiles and an obstacle tile is one a
   creep cannot stand on either — criticism 30.** The census prints the whole
   census, now 3 rooms paved and 0 gapped. 4 mutations, of which the 3 that mutate
   a gap are retired as dead with the gaps themselves (criticism 23).
16. **(M2) THE ECO FLOOR WAS ONE TOO HIGH IN SEVEN ROOMS, AND IT WAS THE SAME
   MISTAKE THIS DOCUMENT ALREADY WROTE UP ONCE.** The optimization bullet above
   says it in full: a floor measured in a different metric from the distances it
   bounds is not conservative, it is a claim about a different quantity. Round 11
   fixed the ring-vs-point half of that and left the chebyshev half standing. The
   anchor SEPARATION is measured between anchor TILES, while the distances it
   bounds are RING-SEEDED — a step is saved at each end — so the correct bound is
   `ceil((d-2)/2)` and the shipped one was `ceil(d/2)`. **E13S4 told its owner "no
   hub in this room could have been within 19" while tile `26,21` sits at 18 and
   18.** A floor that a tile on the board clears is not a floor; it is the planner
   claiming credit for optimality it has not got. Corrected, and every one
   re-derived on the shipped artifact: **E12S1 14 → 13 · E13S4 19 → 18 ·
   E15S9 16 → 15 · E16S5 18 → 17 · E19S5 19 → 18 · E2S6 17 → 16 · E7S5 18 → 17**,
   and E12S5 and E21S1's basis flips from `chebyshev` to `walk` because the walk
   bound is now the binding one in those two. Every corrected floor is TIGHTER —
   harder to clear — which is the direction an honest floor moves. 3 mutations,
   all bite.
17. **(M3/M4/F2/F5) NUMERAL-PRESENCE WAS NEVER A CONTENT GATE. ONE ARCHITECTURE
   REPLACES IT.** Round 11's rule was "every audited number must be QUOTED in the
   prose", and it was implemented as numeral presence. So a reviewer rewrote a
   declaration's paragraph to assert **the exact opposite of its own audited
   record**, appended `[audit tokens: 35 2 33 17.5 0 20 91]` to the end of it, and
   it passed clean. That is the round-10 defect — a SHAPE rule standing in for a
   content rule — surviving one round further because the shape got more
   elaborate. There is no rule that makes a hand-written paragraph agree with a
   record; the only fix is to stop hand-writing it. **`tools/plan-suite/v2/
   declprose.mjs`** (plus `-mobility` and `-towers`) GENERATES declaration prose
   from the structured record via a shared template that **the producer and the
   validator both call**, and the validator regenerates from the published record
   and requires EQUALITY. Eight audited kinds — **which was 8 of 18, and round 13
   raised it to all 18; see criticism 25.** A paragraph can no longer say
   anything its record does not, because nobody writes the paragraph. Landed with
   it, in the same architecture:
   - `mobilityBuilt` is compared **field by field** against the validator's own
     re-derivation — 14 fields plus 4 worst-pair records — rather than spot-checked.
   - the LIFT TEST is **RE-RUN** whenever a record is present, including proving
     each `solo` class it names. A published verdict nobody re-runs is a claim.
   - the `roadRampart` taxonomy is re-derived rather than read.
   - `redundantCut` reasons became structured `{class, pricedDeltas}` whose deltas
     the validator re-derives **by actually deleting the rampart** — see the
     `meta.shell.cut` bullet above.
   16 + 17 mutations, all bite.
18. **(M5) THE OBLIGATION SET WAS FIVE RULES WIDE AGAINST EIGHTEEN DECLARATION
   KINDS.** Round 11's headline was that a room whose re-derived state DEMANDS a
   declaration now fails without it — and it shipped five triggers. Thirteen kinds
   could therefore still be deleted for free, which is the round-11 finding
   ("deleting E7S5's covered-detour cost nothing at all") reduced in scope rather
   than closed. Every kind has a trigger now, and the completeness is asserted
   against the kind inventory rather than believed. It found a live one
   immediately: **12 rooms were shipping a link on the SHIPPED cut with no
   declaration at all.** Layer 2 files that shortfall over LAYER 2's cut, and then
   the inert prune and the seal reconciliation MOVE the cut underneath it — so the
   room ends up with a link on a wall tile it never declared, which is the
   `meta.shell.cut` staleness bullet reappearing in the declaration channel.
   `shell|` declarations went **1 → 12**. 17 mutations, all bite.
19. **(F1) THE SHALLOW DECLARATION INVENTED A STRICTER RULE THAN THE ONE
   ENFORCED, AND THE RULE IT INVENTED EMPTIED A CLASS FLEET-WIDE.** The
   `extensions|shallow` declaration — round 11's own fix for silent capping —
   said it swept for free deep floor "already road-faced OR ONE PAVE AWAY" and
   then reported only the road-faced class. Root cause: `paveableFor` required a
   ROAD to be D8-adjacent to the pave tile, while the validator's network conducts
   over roads AND CONTAINERS. The producer was holding itself to a rule nobody
   enforces, which sounds conservative and is not: it made the second class empty
   in every room in the fleet, so a declaration that promised two searches
   reported one and read as though the other had found nothing. The test mirrors
   the validator now, both classes are counted and reported separately, and the
   free move that had been sitting invisible got taken: **E12S6 shallow 7 → 6,
   ramparts 49 → 48, roads 123 → 124, gated lap bit-identical.** E9S2 (15) and
   E2S3 (4) are unchanged — both had already spent their one-pave tile. The
   declaration also now names the **shared-target** problem it had been hiding
   (see criticism 12). 2 mutations, both bite.
20. **(F2/m3) FOUR REFUSALS, ONE SENTENCE, FOUR DIFFERENT PRICES — AND ONE OF
   THEM WAS FREE.** The stand-denial keep-class shipped a byte-identical
   boilerplate string over four kept ramparts whose real costs were not the same
   and in one case were nothing at all: **E16S2 `22,32` costs cut 64 → 64, weakest
   face 2670 → 2670, lap 0 → 0** — a rampart of forever-upkeep bought for zero,
   held alive by a paragraph that had been written once and copied. It is PRUNED.
   E21S3 `23,24`/`23,25` and E7S9 `40,44` keep, at their true individual prices,
   printed above under the `meta.shell.cut` bullet. **And the BUBBLE keep-class
   had never proved its premise either** — the identical defect as round 11's
   stand-denial finding, one class over, which is the second time in this document
   a named keep-class turned out to be a name. Its argument is personal cover for
   something inside the ranged band; **E16S6 `15,19` and E6S7 `18,17` sat on a
   controller link at DEPTH 4, unreachable by any attacker.** Both pruned. The
   bubble class now proves its premise the way the ring class was made to in round
   11, and both prices are re-derived by the validator by deletion.
21. **(F4) `seed` WAS MISSING FROM THE ANIMATION'S `EXPAND` TABLE** — the third
   instance of the `extAdd` defect the film bullet above already documents
   (in `STAGE_INFO` but not in `EXPAND`, so the stage renders as flat rectangles
   under a HUD line asserting the frame is the shipped plan). Fixed. A table that
   three separate stages have now fallen out of is a table that wants a
   completeness assertion, and it does not have one yet.
22. **(m1/m2) TWO FIGURES IN THIS DOCUMENT HAD SIMPLY ROTTED, AND THE FIX FOR
   BOTH IS THE SAME FIX.** The arterial figures were stale (7,921 of 14,101
   against a real 7,919 of 14,102 on that artifact; the pair reads **7,920 of
   14,104** today — the denominator carried round 13's two paved joins and the
   numerator moved by one in round 14, E2S8 having swapped a stitch tile for an
   arterial one when its battery moved), and **E13S6 was named as a released-parks room
   in four separate places** — this document, `pipeline.mjs`'s `PARK_PROTECT`
   comment, criticism 4 and the released-parks prose — when it holds all 8 of the
   8 seats its search counted, eats 0, ships 0 shallow extensions and never enters
   the release pass at all. Its own two quoted figures disagreed with each other,
   which was the tell nobody pulled. Both are corrected, and **both are now
   PRINTED** — the arterial pair by `push-plan.mjs --census`, the released rooms
   by the suite's `upgrader parks: … released in N room(s): …` line, which names
   E12S5 and E9S2 and nothing else. A number in prose that no tool re-derives rots
   exactly like a metric no gate re-derives, and the fix for both is the same:
   make something print it.

   **AND THE PRINCIPLE WAS THEN APPLIED TO THE REST OF THE BLOCK, WHICH IS WHERE
   IT SHOULD HAVE STARTED.** Auditing this document against the three commands
   found that its own opening claim — "every number in this block is printed by
   `plan.mjs --all-claimable`, `validate.mjs` or `push-plan.mjs --census`" — was
   false for the fleet **rampart total**, the fleet **shallow-extension total**
   and the count of **declared shortfalls**, all three of which were hand-copied
   out of the artifact every round by whoever was writing that round's doc. Worse
   than un-printed: the third one LOOKED printed, because `validate.mjs` ended on
   `declared-shortfall 121` (122 today) and that figure counts ROOMS that pass
   carrying a note, not
   declarations, so a reader checking the doc against the tool would have found a
   number, compared it to the 303 declarations of the day, and had no way to know
   which of them was wrong.
   All three are now printed — by the `FLEET TOTALS:` line the fleet summary in
   `plan.mjs` ends on, which carries all five figures (ramparts, shallow
   extensions, declared shortfalls, planner notes, roads) — the census prints the
   paving-gap census, and the claim at the head of the status block is true as
   written for the first time. **THE SENTENCE THAT USED TO CLOSE THIS PARAGRAPH
   WAS ITSELF UNCHECKED PROSE**, which is what a round-13 reviewer pulled on it:
   it claimed every remaining figure a tool does NOT print "is now named as such
   where it stands", pointing at in-place markers that were never written. Two
   figures in this file genuinely are not printed and neither carries a marker —
   the runtime table's per-room quantiles, which are dashes with a paragraph
   under the table saying `planMs` is deliberately not serialised, and E16S2
   `22,32`'s "after" deltas in criticism 20, which cannot be re-derived from an
   artifact the pruned tile no longer appears in. Saying so here, once, is
   cheaper than a marker convention nobody maintains.
   **A THIRD HAS BEEN THERE SINCE THE REFUSAL RECORD WAS BUILT AND THIS PARAGRAPH
   DID NOT NOTICE IT:** the
   along-cut roster and refusal totals in the road bullet — 7 rooms / 14 tiles /
   16 refusals a round ago, **12 rooms / 26 tiles / 27 refusals** now — are quoted by this
   document and printed by nothing. They are not in the same class as the two
   above, because they ARE re-derivable from the shipped artifact
   (`meta.walls.alongCutRuns` and `alongCutRefused`, and the validator re-derives
   the roster from the board every run), so a reader can check them; what they lack
   is a command that prints the fleet sum, which is the condition m1 and m2 caught
   rotting and the reason both of those numbers were wrong once already. They are
   deliberately NOT in the status block above, whose opening claim stays true as
   written. ~~Printing them is a round-15 line of code.~~ **AND ROUND 15 DID NOT
   WRITE IT.** The line of code is still one line, `plan.mjs` still has zero
   occurrences of `alongCut`, and the round that named the fix spent its whole
   budget one channel over, on the checking machinery. That is worth leaving
   visible rather than re-promising for round 16: the cheapest item on the list
   is the one that keeps losing to the interesting ones, which is precisely how
   the arterial pair and the released-parks room rotted in the first place.
   **AND ROUND 16 DID NOT WRITE IT EITHER — THIRD ROUND, SAME LINE, AND THE ROUND
   THAT SKIPPED IT ADDED A FLEET PRINT FOR SOMETHING ELSE.** `grep -c alongCut
   tools/plan-suite/v2/plan.mjs` is still **0**, while the same round taught that
   same fleet summary to print four new prune figures and name the re-laid tile
   (criticism 52) — so the budget was there and the item lost again, this time to
   an item found in the same file on the same day. That is the honest shape of it:
   the cheapest fix does not lose to a lack of time, it loses to whatever a
   reviewer happened to file, and nothing in this process ranks by cost. Recorded
   without a round number, per the rule this paragraph's neighbour adopted.
   The
   **mutation count** was on that list too —
   the harness was a scratchpad splice and nothing committed ran it. It is now
   `tools/plan-suite/v2/mutate.mjs`, it prints
   `BASELINE 172/172 clean · MUTATIONS 603/603 bite`, and that gap is closed.

Round-13 findings. **Two fresh reviewers, 11 confirmed findings between them** —
the owner-voice reviewer filed 3 BLOCKING, 1 MEDIUM and 4 LOW, the mechanical
reviewer 1 MAJOR and 2 MINOR — and all 11 were fixed the same day, in three
waves, against the round-12 artifact. The pattern of the round is worth naming
before the list: **four of the five headline findings are this document's own
sentences failing to be true**, not the planner failing to be good. A rule
nobody could find in the game, a gate that existed only in the clause announcing
it, an architecture applied to 8 of 18 cases while the prose said it was applied,
and an audit that only audited what a room volunteered. The planner was, in every
one of those four, either already right or one road tile away from right.

23. **THE WORD "UNPAVEABLE" WAS A RULE THIS PROJECT INVENTED.** Round 12 ruled
   that E2S5 `27,23` and E5S3 `32,11` could not be paved by anybody, because
   each is the mineral container's own tile and "the engine allows one structure
   per tile". Screeps allows a road and a container on one tile, and **this fleet
   ships 62 such tiles across 55 rooms** — the counter-example was in the artifact
   the claim was written about, and in the conductor set of the audit two
   paragraphs above it. Both joins are PAVED now, one road each, releasing **11**
   pre-RCL6 stranded conductors in E2S5 and **5** in E5S3, which are the same two
   numbers this document had been publishing as the size of the loss it accepted.
   The gate survives with nothing in it and its rule is re-derived from the
   ENGINE'S obstacle set rather than from prose — unpaveable means an obstacle
   structure or terrain wall, and nothing else — so the next invented rule fails
   instead of persuading. `--census` prints `3 room(s) PAVED the join … 0 room(s)
   publish a PAVING GAP`. The 3 round-12 gap mutations are retired as dead; 4
   synthetic F1 cases replace their coverage.
24. **THE ALONG-CUT REFUSAL RECORD HAD NO GATE, AND THIS DOCUMENT SAID IT DID.**
   The road bullet ended on "re-derived by the validator on the board the room
   actually ships rather than on stage 5b's working copy". No such check existed:
   a reviewer DELETED a room's entire along-cut record and the run passed clean.
   This is the shallow-declaration failure of round 11 exactly — a mechanism whose
   only implementation was the sentence claiming it — and it is the third time
   this document has written a check into existence, which is why the sentence is
   left standing above with its own correction beside it rather than quietly
   edited out. The gate is real now: roster re-derived from the shipped board,
   a refusal required per tile, and each refusal's NAMED FACTS re-checked against
   terrain, the exterior region, the cut, the structure lists and the roads with
   all-8-neighbour coverage, published as `meta.walls.alongCutRuns`. 11 mutations.
25. **TEN OF EIGHTEEN DECLARATION KINDS RENDERED NOTHING, AND THE ONE STRUCTURED
   AUDIT WAS OPT-IN.** Round 12's answer to hand-written prose was to generate it,
   and it generated eight kinds. The other ten kept the round-10 contract — a
   paragraph a human typed, checked by nothing — while this document described the
   architecture as though it covered the channel. **RENDERERS is all 18 kinds now
   and all 300 declarations carry generated prose** (302 when this entry was
   written; round 16 retired two); the 31 hand-written
   paragraphs under the ten unrendered kinds regenerated **byte-identical**, so
   the fleet turns out to have been honest, and that is a fact the audit produced
   rather than a defence the audit was spared. `assertProseInventory()` asserts
   `RENDERERS == OBLIGATION_KINDS ∪ OBLIGATION_EXEMPT` at load and an unrendered
   kind FAILS. The same round found the `redundantCut` audit was opt-in — it
   re-derived the reasons a room published, so a room publishing none was audited
   over nothing, and an EMPTY reasons map passed. Closed 6-class enum, coverage
   must EQUAL the extra-cut set, per-class re-derivation by deletion. 12 + 26
   mutations.
26. **A D4 DETECTOR IN A D8 GAME.** The paved-run detector along the cut, the
   interior-parallel search that tries to move those tiles, and the roster this
   document quotes all used orthogonal adjacency in a game whose creeps move
   diagonally and are not stopped by corners. A diagonal run was not
   under-counted, it was invisible, and "five rooms" was the detector's answer
   rather than the fleet's. All three went D8: **seven rooms, 14 tiles**, with
   E12S7 and E2S1 the pair that had never appeared. Neither of them moves — E2S1's
   free interior parallels all drop road tiles off the network, and its refusals
   now say so per candidate — so the correction buys no swap and only truth, which
   is the point of publishing the roster at all. 6 mutations on `alongCutRuns`.
   **The roster is 12 rooms / 26 tiles today**: fixing the adjacency left the SET
   the detector walks — the cut — untouched, and round 14 rescoped it to every
   road-and-rampart tile. See criticism 32; that is two consecutive rounds in which
   this roster was wrong in a different dimension, which is the argument for
   publishing the scope (`meta.walls.alongCutScope`) beside the count.
27. ~~**STILL OPEN: `spurTiles` SUMS TO 375 AND ONLY 370 TILES SHIP AS SPURS.**~~
   **CLOSED, round 14.** `meta.walls.spurTiles` totalled **375** fleet-wide while
   the shipped per-tile
   provenance enum counted **370** tiles of kind `spur` — the same five tiles
   counted as laid and not shipped, because a later prune deletes them and the
   counter is never re-read. "Laid" and "shipped" are two different quantities
   published as one number, which is the defect the `mobilityBuilt.cause`
   overwrite was and the defect `alongCutMoved: 0` was: a figure written at the
   moment of intent and left to describe an outcome it never saw. Nothing was
   mis-BUILT — the board is the 370 — but a reader reconciling the two counts
   could not, and the roadKind enum was gated against the board and not against the
   counter, so `spurTiles *= 10` passed clean.
   They are published as three lists now — `spurTilesLaidList`,
   `spurTilesShippedList` (which must equal the `roadKind` spur set EXACTLY) and
   `spurTilesLost` — with `laid === shipped + lost` and `shipped ⊆ laid` and
   `|laid| === spurTiles` re-derived, plus a per-tile re-check that nothing on the
   lost list is a live spur today. **375 laid / 370 shipped**, the difference named
   tile by tile in the three rooms that have one (E11S2 13/12, E13S3 14/12,
   E9S8 8/6), and the same treatment given to the other four late-road passes
   (`laidByKind` / `shippedByKind` / `lostByKind`; stitch 6/4, swampPave 83/82).
   **The lesson is in HOW it is checked, not that it is:** the obvious gate is two
   counters compared in the three rooms where they differ, and that gate is
   dormant in 169 rooms — an identity tested only where it is already known to be
   interesting is an identity nobody tests, and it would have gone stale exactly
   like the counter it replaced. The whole reconciliation runs in **172/172 rooms**
   and holds in 172/172. 6 mutations, two of them written specifically because the
   first version of the check was the dormant one.

   **REOPENED AND RE-CLOSED, round 15: THE SPUR HALF WAS RIGHT AND THE "SAME
   TREATMENT GIVEN TO THE OTHER FOUR PASSES" WAS NOT.** Two things were wrong with
   the sentence above. First, the per-kind books it credits were WRONG ON THE
   SHIPPED ARTIFACT for two kinds and absent for a third — reflow laid 0 against
   shipped 20, E18S8's swampPave laid 3 against shipped 2 and lost 0,
   conductBridge's 3 tiles in neither map — and the round-14 check ran per ROOM
   totals rather than per kind, so a book that is wrong in two kinds that cancel
   passes. The whole account of the root causes is under the `roadKind` enum in
   the film bullet, and one of them is a genuinely nice bug: a swamp hole can be
   closed by UN-DELETING a road the prune took, which closes a hole and lays
   nothing, so `swampPaved` and "tiles laid" were never the same quantity and
   nothing had ever said so (`restoredByKind` names the difference now). Second,
   the identity was written `if (key) { … }` — a **delete-escape**, so the
   dormancy this entry is proud of having designed away could be reintroduced by
   deleting the counter. It runs unconditionally now, per kind, over all seven,
   with `laidByKind`/`shippedByKind`/`lostByKind`/`spurTiles`/`spurTilesShipped`
   in `REQUIRED_META`; `laid === shipped + lost === |laidTiles|` and
   `shipped === the roadKind count for that kind` hold in **172/172 rooms, seven
   kinds each**. The lesson this entry already states, one level up: an identity
   that runs everywhere and is guarded by a presence test runs nowhere on demand.
   10 more mutations. (The `stitch 6/4, swampPave 83/82` in the sentence above was
   the counter's reading; the books say stitch 6/4 and swampPave **82**/82, and
   the 83 was the holes-closed figure standing in for a laid count.)

Round-14 findings. **Two fresh reviewers, 20 confirmed findings between them** —
the mechanical reviewer 0 CRITICAL, 7 MAJOR, 2 MINOR and 3 LOW; the owner-voice
reviewer 2 BLOCKING, 4 MEDIUM and 2 LOW — all fixed the same day, in two parallel
clusters (validator + mutations; producers + presentation) and this document's
pass. **The theme is one sentence: the boards are excellent and the paperwork is
not.** Round 13 stopped the paragraph from lying and left the record it renders
unchecked, so every landed exploit this round is a planted RECORD, a deleted KEY,
a roster scoped to the easy class, or a figure in this file that no longer
matched the artifact. Exactly one finding is about a base — and it is a good one,
because the constraint it blames is a rule this project believed rather than
measured. The rest of the round's work is bookkeeping, and the bookkeeping is the
product: an honest shortfall is the only exception this goal accepts, so the
channel that carries it is not a side-channel.
Findings whose mechanism belongs beside the machinery it fixed are written up
there and named here only: `towerDispersion` / `shippedMinShellDmg` /
`ctrlParksAtSeatSearch` / `ctrlParkFloor` delete-escapes (criticism 14),
`srcEnclosed` re-derived fleet-wide (criticism 10), `pairCause` and its two
coexisting definitions (criticism 2), `towerClump.withinCheb2OfSitter`
re-derived, the released-caps early break (criticism 4), the derived-or-dies
rewrite of `renderTowerRefill`'s hardcoded "no six legal deep tiles" clause and
the `legal (the hard cap is N)` clause that never compared (criticism 29), and
the layer-7 frame banner (the film bullet).

28. **BLOCKING (M1/F2): THE PARAGRAPH COULD NOT LIE ANY MORE, SO THE RECORD DID.**
   Round 13's architecture — prose generated from the record, regenerated by the
   validator, equality required — moved the attack surface one layer down and this
   document described the result as though the channel were closed. Both reviewers
   found the same hole independently: **of the record leaves under the ten kinds
   round 13 newly rendered, 100% were unchecked, and across all eighteen kinds 472
   of 536 leaves were falsifiable.** Nine planted numbers passed in one round —
   `towerRefill.maxRefill`, `battlements.unreachable` and `.strandedByMass`,
   `labs.haulDist` / `.eatAnchors` / `.fallbackAnchors`, `ctrlParks.deepTiles`,
   `spawnFan.viable`, `offNetwork.roads` — each of them rendering into a perfectly
   consistent, perfectly false paragraph. Re-deriving "the numbers this document
   names" is the round-10 shape again: a list someone maintained. The answer is a
   CENSUS. **`RECORD_LEAVES` classes every leaf of every record — 394 leaves
   across all 18 kinds at the time, 221 re-derived from board and terrain, 173
   producer-witnessed with a stated bound, 0
   unclassified — and `assertRecordInventory()` refuses to start if a kind has no
   table, a leaf has no class, or a witnessed leaf has no stated reason.** An
   unnamed leaf fails the room; a leaf the table promises to re-derive whose
   derivation does not run fails the room. That second rule is the one that makes
   this different from the previous three fixes of this shape: the inventory can
   no longer lie about itself. 45 mutations. (**The words "with a stated bound
   the validator enforces" were doing more work than the file was**: seven
   generic closures stood behind all 173, and a one-leaf-at-a-time sweep escaped
   in 123 of 375 cases — see criticism 36. **And the census itself was iterating
   the RECORD rather than the table, so 347 of 420 leaf instances could simply be
   DELETED — criticism 44, which is this footnote's own subject a third time.**
   The inventory is **434 leaves** today, the witnessed half is executable, and
   presence is required rather than assumed.)
29. **BLOCKING (F1): E2S8's DECLARATION SAID THERE WAS NOTHING TO FIND, AND THE
   SEARCH THAT LOOKED WAS OBEYING A PRIOR.** The room shipped a filler walk of
   `[7,8,8,9,10,11]` — one step over the hard `MAX_REFILL` ceiling — under a
   `towerRefill` declaration asserting "the room has no six legal deep tiles inside
   that radius". **That was false: 243 legal seats existed.** The sentence was
   hardcoded in `declprose-towers.mjs` and derived from nothing, which is round
   12's finding in the one file the round-13 sweep left a literal in. Behind it,
   the search counters were honest — `{tried: 1350, scoreTied: 1, moved: 0}` — and
   the cause was neither mispricing nor a narrow candidate set: of the 47 single
   swaps that clear the full price, **46 are refused by the "no two towers
   D8-adjacent" rule and by nothing else**. That rule is a PRIOR whose two stated
   consequences are both measured exactly by instruments added after it, so it is
   now crossable per trial under the conditions set out in the tower-coverage
   bullet above. **Exactly one room in the fleet changes: E2S8 tower `20,18` →
   `20,15`, refill max 11 → 10 (the cap), weakest face 3570 and nuke window 5 both
   unchanged, roads and ramparts +0 fleet-wide.** Two honest corrections to what
   was expected: the brief predicted both of E2S8's tower declarations would
   vanish; the `towerRefill` one does (**303 → 302**) and the **weak-battery one
   cannot and remains** — it fires above the 8-step note, 10 > 8, and E2S8's sitter
   at `12,14` is far enough from every seat that puts 600 damage on all four cut
   tiles (all of which need x ≥ 20) that no legal six-set walks under 8. The
   surviving declaration is now true AT the cap instead of over it, which is a
   better room and one declaration fewer, not two. And the hardcoded clause is
   derived-or-dies: `towerRefill` publishes `seatsInsideCap`, `needSeats`,
   `gatheredAt`, `candidatesSearched` and the search block, with three rendered
   branches including one that refuses to make the claim when the census is
   absent.
30. **(M2) THE PAVING-GAP GATE GRANTED EXACTLY THE TILES A GAP MAY NEVER BE.**
   Round 13 tightened "unpaveable" to the engine's own obstacle set and shipped the
   gate with its polarity intact: a published gap tile still CONDUCTS in the
   staging audit, and the tightened test accepted precisely the obstacle tiles —
   so the audit would walk an orphan through a spawn on the strength of a
   declaration. `push-plan.mjs`'s `verifiedGapTiles` had the same shape, documented
   as intentional. The right rule is the one written out in criticism 6: walkable
   AND unpaveable is the EMPTY SET in Screeps, so no gap can ever legitimately
   conduct, and both sides refuse all of them now. Zero rooms publish one; the
   census prints the zero with the argument rather than the count. 3 mutations.
31. **(M3) AN EXEMPTION THAT LIVES ONLY IN THE CHECKER, PART TWO: THE EXTRACTOR.**
   Criticism 11 moved the mineral SEAT's silent exemption into the plan and left
   the structure on the next tile inside `validate.mjs`, as an omission from the
   `OWNED` list — 133 rooms, 0 declarations, no line to read. Closed the same way
   and on a stronger argument, since the extractor is the one owned structure a
   creep can never stand on or service: **133/133 rooms now name both tiles**, and
   the exemption is keyed on the declaration. Full account under criticism 11.
   3 mutations.
32. **(m1) THE PAVED-RUN ROSTER WAS SCOPED TO THE CLASS THAT WAS EASY TO SEE.**
   Round 13 fixed the run detector's adjacency (criticism 26) and did not touch
   the set it iterates: the cut. A bubble seat or a stand-denial ring tile carrying
   road is the same prepared surface to an attacker already inside, and none of
   them were candidates, offered parallels or owed refusals. Rescoped to every
   road-and-rampart tile: **12 rooms / 26 tiles** (from 7 / 14), **27 refusals**
   against the same 7 moves, every refusal carrying `kind` and what it was
   `offered`. The reviewer's exhibit was **E5S9 `22,19`, whose free interior
   parallel `22,20` had never been offered** — it is offered and refused now, with
   the count that refuses it (9 road tiles fall off the network). **The reason
   this document gave for that tile being invisible was itself wrong for a round
   and is corrected in the road bullet**: `22,19` IS on the cut; what it lacked
   under the old scope was a run PARTNER, its only paved-rampart neighbour being
   the bubble seat `22,18`. Two rooms' worth
   of first-cut refusals then re-derived FALSE and were rewritten: layer 2's
   exterior flood and the shipped flood disagree about bubble seats, so
   "is OUTSIDE the wall" was the wrong class for four tiles of E21S3's ring run and
   one of E5S9's — they are ramparted tiles, which is the class beside it. Planner
   notes **172 → 177**. 2 mutations on the gate, plus the roster re-derivation
   itself.
33. **(F3/L1/L2) AND THIS DOCUMENT'S OWN FIGURES WERE WRONG IN THREE PLACES,
   WHICH IS THE FINDING THE REST OF THE ROUND IS ABOUT.** The road+rampart sum stood at
   `277 = 235 + 29 + 13` **in two places** against a board that has read
   `278 = 235 + 30 + 13` since round 13 created the thirtieth bubble seat by paving
   E2S5's join — the round that made the tile did not re-read the line it
   invalidated, and the suite had been printing the right number the whole time.
   The layer-7 provenance line said **487** tiles where the enum holds **486**, and
   the 487th was not a tile at all but a stale `roadLayer` tag on E5S1 `28,30` that
   nothing compared against the enum. The first is a doc defect with a printed
   counter-example; the second is a doc defect that was ALSO a missing identity,
   and it is fixed on both ends (exact set equality, and the bridge writing its own
   layer tag unconditionally — see the film bullet). This is criticism 22's
   principle failing in the file that states it: a number a tool prints and a
   number a human carries will diverge, and the only question is how many rounds it
   takes to notice.
34. ~~**STILL OPEN, AND DELIBERATELY UNSPENT: THE ADJACENCY PRIOR IS HOLDING NINE
   ROOMS ONE FALLOFF STEP UNDER WHAT THEY CAN REACH.**~~ **CLOSED, round 16, and
   it closed to ZERO on the axis this entry was actually about.** The entry is
   kept whole, with each round's reading under the correction that superseded it,
   because it was wrong twice in two different ways and the sequence is the
   lesson. As filed: now that the prior is
   measurable, the measurement is published per room
   (`meta.towers.adjacency.satAcrossPrior`): on the round-15 board, **9 rooms held
   a weakest-face improvement they could take by crossing it — 330 damage in
   total, E11S7 30 · E11S9 60 · E15S5 60 · E17S3 30 · E19S8 30 · E2S8 30 ·
   E3S1 30 · E4S3 30 · E8S6 30**, each of them a single
   swap that clears every instrument layer 3 owns. Taking them was built and
   measured rather than argued: over the 18 rooms the pre-dispersion board offers,
   the fleet's layer-3 weakest-face sum goes **418770 → 419370 (+600)** — and the
   SHIPPED nuke window rises in 7 rooms (E8S6 8→10, E18S4 9→10, and E17S2, E19S9,
   E5S2, E7S8, E9S3 each 8→9) and E12S4's as-built refill walk goes 7 → 10. Neither
   cost is visible from layer 3: the nuker lands at layer 5 and the as-built walk
   needs the labs, the extensions and the observer standing. So the trade is real
   and it is not layer 3's to make — closing it means lifting the nuker and the
   as-built walk into the same decision, which is a layer-5 change. **Round 15 did
   not make it either**, and the honest reason is that the round went into the
   checking channel. It stays open with **no round number attached this time** —
   round 14 wrote "a round-15 item" here and the item did not move, which is the
   pattern criticism 35 ends on, and a dated promise nobody keeps is worth less
   than an undated one nobody has to discount. What round 14 bought is that the loss is a
   published per-room number instead of a silence. (The 18-room list is the
   experiment's own reading on its own board and is not re-derivable from the
   shipped artifact; the 330 and the nine rooms are.)

   **AND "10 ROOMS / 360" WAS THE MIXED READING THIS ENTRY EXISTS TO COMPLAIN
   ABOUT.** It was `held` from the shipped board against `reachable` from layer
   3's — see the `satAcrossPrior` paragraph in the tower-coverage bullet — so the
   headline number of a criticism about measuring a prior honestly was itself
   taken across two boards. Re-derived wholly on the wall the fleet shipped at
   round 15 it was **9 rooms / 330** (and 9/330 is where this entry stood for one
   round; the round-16 addendum below takes it apart on a second axis), and the
   interesting part is that BOTH predictions made from
   the mixed reading were wrong, in opposite directions:
   - **E15S5 STAYS IN**, where the owner review predicted it would drop. Its
     shipped face is 1410, and the offered seat measures **1470** on the shipped
     cut — not the 1410 the mixed reading implied. Still +60.
   - **E21S8 DROPS OUT**, where the same review predicted its gap would WIDEN to
     120. Shipped face 2460; the offered seat measures **2430** on the shipped
     cut, so the layer-3 crossing is *worse* on the board that ships.
     `offerOnShipped` carries the 2430 and `forgone` is 0.
   A prediction made on a stale board can be wrong in the direction that looks
   conservative just as easily as in the other one, which is the argument for
   re-deriving rather than adjusting.

   **AND THE +660 WAS +600.** The producer comment that carried the experiment
   priced E3S1 and E8S6 at +60 each; both are +30, and the shipped record agrees
   (E3S1 1200→1230, E8S6 2670→2700). The per-room list — 18 rooms, +30 each
   except E11S9 and E15S5 at +60 — sums to **600**, so the list and the total in
   the same comment disagreed with each other by 60 for a round. The internal
   contradiction is what was fixed and the two mis-priced rooms are named; the
   18-room "take them all" experiment is a round-11 measurement and has NOT been
   re-run, which is stated here rather than implied by a fresh-looking number.

   **AND "9 ROOMS / 330" WAS STILL A MIXED READING, ON THE AXIS NOBODY HAD
   THOUGHT TO SEPARATE.** Round 15 fixed which WALL each number is taken on and
   this entry re-headlined itself on the result. It never asked what is STANDING
   on the seat being offered. On the shipped board **7 of the 9 seats are
   occupied — 4 by the nuker, 3 by an extension** — so seven of those nine rooms
   are not being held under by the adjacency prior at all; they are being held
   under by a structure layer 5 put on the tile after layer 3 made the offer, and
   an entry titled "the adjacency prior is holding nine rooms" was, for two
   rounds and two different reasons, a number about something else. This is the
   same defect twice in the same field, which is the argument for publishing the
   AXES rather than the total: the record now carries `seatOccupancy` per room and
   splits the loss into `forgoneToPrior` and `forgoneToOccupant`.
   **`forgoneToPrior` is 0 fleet-wide.**

   **AND THE TWO SEATS THAT WERE GENUINELY FREE WERE FREE, SO THEY ARE TAKEN.**
   Once the occupancy axis is separated, the residue this entry has been deferring
   since round 11 is two rooms, and both of them cost NOTHING on every instrument
   the entry names as the reason not to take them. Verified the only way that
   claim can be made honestly — by RE-COMPOSING the room with the swap and
   re-reading twelve as-built instruments on the finished board, not by trusting
   layer 3: **E3S1 `23,23 → 22,19`, weakest face 1200 → 1230** and **E4S3
   `25,26 → 24,25`, 2580 → 2610**, with saturated cut tiles, shipped nuke window,
   tower-only 5x5, as-built refill walk, unreachable towers, interior walk region,
   clump, extensions, shallow extensions, ramparts and the gated defender lap all
   unchanged in both. That is the layer-5-reads-the-record pass this entry
   predicted would be needed, built as an OFFER from layer 3 priced by a
   re-composition in `pipeline.mjs`, gated on every as-built instrument
   non-worsening AND a strict improvement somewhere — the shape `maybeReleaseParks`
   already established, applied to a second decision.
   **Criticism 34 therefore closes at: 7 rooms / 270 damage still forgone,
   `forgoneToPrior` 0, `forgoneToOccupant` 270, and nothing forgone for free
   anywhere in the fleet.** The +600 experiment is NOT what was taken and this is
   worth being exact about, because taking all 18 was always the wrong trade:
   ranking the whole dispersion pass on the enriched tuple moves **56 of 172
   rooms** and regresses as-built refill in E11S1 (4 → 7) and E8S7 (4 → 8) and the
   shipped nuke window in E18S4 (9 → 10) — measured, on the fleet, this round.
   Two priced takes and sixteen priced refusals is the answer; "+600 across 18
   rooms" was the size of a bet nobody had costed.
35. **STILL OPEN: `meta.compositions.total` UNDERCOUNTS IN THE ROOMS THAT RELEASE
   PARKS.** `maybeReleaseParks` composes a full plan per candidate cap and never
   pushes any of them onto `trail`, so the published composition count describes
   the search that ran before the release pass rather than the search the room
   actually did: **E12S5 publishes `total: 7` while its own `composedCaps` names 7
   more full compositions, E9S2 publishes 3 against 8.** Nothing is mis-built and
   no gate depends on it — it is producer bookkeeping, and it is exactly the shape
   of `spurTiles` (criticism 27) and `alongCutMoved: 0` before them: a counter
   written at one moment and read as a description of another. Found by the
   validator cluster while classing record leaves, not by a reviewer, and left
   unfixed on purpose so it is attacked with the next batch rather than
   patched at the end of the round that found it.
   **AND THE NEXT BATCH DID NOT ATTACK IT.** Round 15 bound the CONTENT of
   `composedCaps` (criticism 4), which makes the second of the two counts
   falsification-proof and does nothing
   at all about the fact that they disagree; the figures are unchanged on the
   round-15 artifact (E12S5 `total: 7` beside 7 composed caps, E9S2 3 beside 8).
   Deferring a known-open item with a round number attached and then not spending
   it is the same failure as the along-cut print line in criticism 22, twice in
   one round, and it is recorded here as such rather than re-promised for
   round 16.
   **AND ROUND 16 DID NOT ATTACK IT EITHER.** Re-read on the round-16 artifact:
   **E12S5 `total: 7` beside 7 composed caps, E9S2 `total: 3` beside 8** —
   identical to the round-15 reading, digit for digit, which is the only thing
   worth adding, because it says the item is genuinely untouched rather than
   quietly changed. Two rounds of no movement on a producer-bookkeeping item
   nobody's gate depends on is not a scandal; what it is, is the second data point
   for the pattern criticism 22 now states outright — an item's cost has never
   been what decides whether it gets spent.

Round-15 findings. **Two fresh reviewers, 12 confirmed findings between them** —
the owner-voice reviewer 2 BLOCKING, 3 MEDIUM and 0 LOW; the mechanical reviewer
0 CRITICAL, 5 MAJOR, 2 MINOR and 2 LOW — with **both reviewers' board sweeps
clean, 17 of 17 rooms each**, and all 12 fixed the same day in two parallel
clusters (producers + artifact rebuild; validator + mutations) and this
document's pass. **The theme is one indirection deeper than round 14's: the
witnessed half, and the un-inventoried meta records.** Round 14 refused to let a
record leaf be unclassified; round 15 found that classifying a leaf as
"witnessed with a stated bound" was, for 173 leaves, a sentence — and that the
records nothing had ever inventoried (`meta.towers.adjacency`, the per-kind road
books, the 177 planner notes, `negotiated.detail`) were where the round's whole
attack surface was. Not one finding is about a base. The boards did not move:
**0 structure diffs, 0 declaration-text diffs, 0 note-text diffs and 172/172
byte-identical films** between the round-14 and round-15 artifacts, which is
what makes this a paperwork round in the strict sense rather than the flattering
one.
Findings whose mechanism belongs beside the machinery it fixed are written up
there and named here only: `satAcrossPrior` rebound to the shipped board and the
`meta.towers.adjacency` reader (the tower-coverage bullet), the per-kind
late-road books (the film bullet's `roadKind` paragraph), the six unchecked
planner-note classes (the obligation bullet), `negotiated.detail` and the
worst-gated-versus-longest-detour pair (the defender-mobility bullet), the six
new `REQUIRED_META` paths (the delete-escape bullet), `composedCaps` content
(criticism 4), the runtime re-band (the runtime table) and the E5S9 `22,19`
correction (the road bullet, and criticism 32).

36. **BLOCKING/MAJOR: THE WITNESSED HALF OF THE RECORD CENSUS WAS A PROMISE, NOT
   A CHECK.** Both reviewers landed it from opposite ends. `RECORD_LEAVES`
   classed 173 leaves as "producer-witnessed with a stated consistency bound the
   validator enforces" and the bound was a hand-written English sentence with
   seven generic closures behind the lot; a (kind, leaf) sweep escaped in **123
   of 375 cases**, and 26 hand-built arithmetic impossibilities — a search that
   moved more tiles than it tried, a subset larger than its superset, a ratio
   that is not its own quotient — all passed. This is round 14's own finding
   (a table that could not lie about itself) failing on the half of the table
   that was harder to implement, which is the half a completeness assertion is
   least able to police: the inventory was complete and the enforcement was not,
   and "0 unclassified" reads identically in both worlds. Closed with a 16-op
   closure DSL whose `why` text is GENERATED from the closures, plus two
   load-time self-checks that refuse a stated-but-unimplemented bound and a
   closure-less leaf that does not admit to being one. **427 leaves — 221
   re-derived · 206 witnessed (177 closured, 10 bespoke, 29 type-only) · 0
   unclassified**, ~~sweep escapes **123 → 12**~~. Full account in the declaration
   bullet. 58 + 1 mutations.
   **AND THE "123 → 12" WAS THE WRONG MEASUREMENT, WHICH ROUND 16 PROVED WITH A
   THREE-WAY CONTRAST** — the sweep mutated a leaf and left the paragraph alone,
   so it tripped the prose-identity gate and credited bounds that do not exist.
   **12 was a floor.** Re-swept the way a producer actually behaves, the honest
   residue is 34 leaves against a gentle nudge, 0 of them class D; the inventory
   is **434 leaves** today. See criticisms 42 and 45.
37. **BLOCKING: `negotiated.detail`, THE LAST HAND-WRITTEN PARAGRAPH, WAS
   UNCHECKED — AND IT IS THE DENSEST ONE.** 57 rooms ship it, it quotes a dozen
   numbers, and criticism 17's generated-prose architecture had never been
   applied to it because it is a HISTORICAL record of what layer 2 measured
   rather than a description of the shipped board. That distinction is real and
   it was doing the wrong job: it excused the paragraph from the channel instead
   of from the regeneration. History is kept verbatim and gated anyway — 15 new
   leaves carry every number the text quotes, the validator accounts for every
   numeral clause by clause and FAILS on any numeral no clause accounts for, and
   the producer proves the same identity from the other side by rebuilding all
   57 paragraphs **byte-exactly from the leaves alone**. Full account in the
   defender-mobility bullet, including the 8 rooms where the paragraph's closing
   pair legitimately differs from its middle pair. 10 mutations.
38. **MAJOR: `meta.towers.adjacency` WAS PUBLISHED FOR A ROUND WITH NO READER,
   AND ITS HEADLINE FIELD WAS ON THE WRONG BOARD.** Nine escapes in one sweep —
   delete the object, empty the pairs, invent pairs on a room with none, flip
   `priorHeld`, falsify `held`/`reachable`/`refillTo` — every one of them passed.
   `satAcrossPrior.held` was layer 3's reading under a field doc reading "what
   the room ships". Both halves closed: full re-derivation of the object from the
   shipped board, `REQUIRED_META`, and the four sat fields rebound with
   `atLayer3` and a `basis` string kept beside them. Criticism 34 is refigured on
   the honest board and comes out **9 rooms / 330**, not 10 / 360. 19 mutations.
   (And round 16 refigured it a third time on the axis this round never checked —
   what is STANDING on the offered seat — closing it at **7 rooms / 270 with
   `forgoneToPrior` 0**. Two consecutive rounds of "the headline number of a
   criticism about measuring honestly was itself mixed" is the argument for
   publishing the axes rather than the total; see criticism 34.)
39. **MAJOR/MEDIUM: THE 177 PLANNER NOTES WERE THE UNGATED CHANNEL, AND THEY ARE
   THE ONE A REVIEWER READS.** `meta.notes = []` passed on every room in the
   fleet; 165 of 177 notes were unchecked across six classes. Derive-or-die on
   obligation and content now. Full account in the obligation bullet.
   14 mutations.
40. **MAJOR: THE PER-KIND LATE-ROAD BOOKS WERE WRONG FOR TWO KINDS, BLIND TO A
   THIRD, AND SWITCHED OFF BY DELETING A KEY.** Criticism 27 is reopened and
   re-closed there; the root causes are worth the read (reflow never recorded
   what it laid; a swamp hole closed by un-deleting a pruned road lays nothing;
   `conductBridge` writes after the census it belongs in). 10 mutations.
41. **MINOR/LOW, AND ALL FOUR ARE THIS DOCUMENT: E5S9's ROAD SENTENCE NAMED THE
   WRONG MECHANISM, THE RUNTIME BANDS NO LONGER CONTAINED THE MEASUREMENTS, THE
   MUTATION AND md5 FIGURES WERE A ROUND OLD, AND TWO DEFERRED ITEMS CARRIED A
   ROUND NUMBER THAT HAS NOW PASSED.** Each is fixed where it stands and each is
   left with its correction visible. The pattern across rounds 13, 14 and 15 is
   stable enough to state plainly: **the planner is found wrong roughly once a
   round and this file is found wrong three or four times**, and the reason is
   the one criticism 22 gives — the artifact is re-derived by a command every
   run and the prose is re-derived by whoever is writing that round's pass.
42. ~~**STILL OPEN: 12 RECORD LEAVES ARE BOUNDED ONLY BY TYPE, AND THEY SAY SO.**~~
   **RE-OPENED AND RE-CLOSED AT A DIFFERENT NUMBER, BECAUSE THE 12 WAS MEASURED
   BY A HARNESS THAT WAS NOT DOING WHAT IT SAID.** Round 16's owner-voice reviewer
   showed with a three-way contrast that round 15's sweep mutated a leaf WITHOUT
   regenerating the paragraph, so it was scoring prose-identity trips as content
   checks: **12 was a floor, not a ceiling** (the mechanism, and the four
   structural causes it exposed, are in the declaration bullet). Re-swept with the
   paragraph regenerated from the mutated record — what a producer actually does —
   the honest residue is **34 distinct leaves that a gentle ±50% nudge walks past,
   of which 0 are class D and 31 carry one to three closures the nudge simply
   stays inside**, on 10,835 bites against 718 escaping instances. That is a
   larger number than 12 and a much smaller claim, and the reason to prefer it is
   the whole of criticism 22: it was produced by a harness whose own behaviour was
   re-derived. **The unbounded set proper is the one this entry always described**
   — the eleven `lane.*` and `shallowExt.search.*` counterfactuals below, plus the
   named signed exceptions — and everything in the 34 dies on the sign and gross
   sweeps, which bite 9,305 and 9,313 with 8 and 0 escapes respectively. The
   original text stands as filed:
   The witnessed-bounds sweep drove escapes to 12 and stopped there, honestly:
   `lane.{stubsLifted, boundBeforeStubs, wanted, wantedBound, cost, premium,
   gain, droppedFor, shrunk.premium}` and
   `shallowExt.search.{freeDeepRoadFaced, paveLeft}` — that is eleven, and the
   twelfth is `lift.solo`, which is not a type-only leaf at all: it is re-derived,
   and it "escapes" only because the sweep harness generates no mutation for its
   value type, which is a gap in the SWEEP and is named here so the 12 is not
   read as twelve unbounded leaves. Every one of the eleven carries a `why`
   that promises NOTHING — which the load-time check now enforces, so they cannot
   quietly re-acquire a promise — and the reason they are hard is worth stating
   rather than filing as work: they are **counterfactuals about reservations
   never taken, on boards never shipped.** There is nothing on the artifact to
   compare a layer-6 lane premium against, because the lane it prices was not
   laid; and `lane.cost` takes a NEGATIVE value somewhere in the fleet, so even
   an ordering bound would be a coincidence rather than a derivation. A leaf that
   can only be bounded by inventing a second producer to check the first is a
   leaf this document should say is unbounded, which is what it now does.
43. ~~**STILL OPEN, AND A JUDGMENT CALL RULED THE HARD WAY:**~~ **RESOLVED,
   round 16 — AND AS A PRODUCER BUG, WHICH IS WHY THE JUDGMENT CALL WAS THE WRONG
   FRAME. E5S5's SEALED INTERIOR
   FLOOR NOTE DESCRIBES A TILE THE ROOM PAVED AND AN UPGRADER STANDS ON.** The
   note lists 12 tiles that "sit inside the wall, carry nothing, and cannot be
   reached from the sitter", and the first of them is **`21,10`, which carries a
   ROAD and is in `meta.ctrlParkTiles`, `meta.ctrlParkReserve` and
   `meta.ctrlParksBuiltTiles` — one of the six upgrader seats this room reserves
   at its controller.** The validator cluster read "carries nothing" as "carries
   no program structure" and excluded roads from the gate, which is a defensible
   reading and is the one that shipped. **The ruling is that it is NOT written
   into this document as a definition; it is filed here as an open producer-text
   defect**, because defining "carries nothing" to fit the artifact would be
   criticism 23's invented rule in the channel criticism 25 was supposed to have
   closed — and because the tile falsifies the sentence's OTHER half too: it is
   reachable, by the route the upgrader actually walks (out over the exterior
   tile `19,10` and across our own ring rampart at `20,10`), and only the note's
   interior-confined flood calls it sealed. The number the note is really
   reporting for that tile is "not reachable without leaving the wall", which is
   a different and much less alarming claim, and the fix is to make the sentence
   say it. The other 11 tiles re-derive as genuinely sealed and genuinely empty,
   ~~so `sealedFloor.tiles` is wrong by exactly one in one room — which is the
   size of defect this project has learned to treat as the interesting kind.~~

   **AND "WRONG BY EXACTLY ONE IN ONE ROOM" WAS THE SCOPE THIS ENTRY PUT ON A
   DEFECT IT HAD ALREADY DIAGNOSED CORRECTLY.** The paragraph above names the
   cause — an interior-confined flood, where the word "sealed" means "our own
   creeps cannot get there" and our own creeps walk through our own ramparts and
   may leave the wall and come back. Having said that, the entry then filed the
   symptom as one tile in the room it happened to be looking at. Swept properly,
   the room that was actually wrong is **E12S7, which publishes 7 sealed tiles of
   which exactly 1 is genuinely sealed** — the pocket `43,20 43,21 43,22 44,22
   43,23 44,23` is own-creep reachable by a 53-step route with 32 steps OUTSIDE
   the wall, which is precisely the route an interior-confined flood cannot see.
   Six wrong tiles in a room nobody filed, beside the one in the room everybody
   did. A judgment call about what "carries nothing" ought to mean was the wrong
   frame for a flood that was measuring the wrong region, and the tell was in the
   entry's own second half all along.
   The producer's `noteSealedFloor` uses a new exported `ownCreepWalk` now —
   the whole board from the sitter, blocked only by terrain wall, room objects and
   our own OBSTACLE structures, with roads, containers and our own ramparts
   passable and no confinement to the interior. **Full-fleet sweep: exactly two
   rooms shrink and no room leaves the note — E12S7 7 → 1, E5S5 12 → 11, fleet
   264 → 257 tiles across the same 62 rooms**, and the other 60 rooms' tile sets
   are identical, which is the check that a re-definition this broad did not
   quietly re-classify anything else. The record gained `named`, `depthSafe` and a
   `basis` that says in words which flood it means; `meta.sealedFloor` is in
   `REQUIRED_META` and fully re-derived, including the named list; and the note
   sentence says which flood it is reporting rather than leaving a reader to
   assume the alarming reading. **Criticism 43 closes as a producer fix, not as a
   definition** — which is the outcome the entry itself argued for when it refused
   to write the convenient definition into this document.

Round-16 findings. **Two fresh reviewers, 20 confirmed findings between them** —
the mechanical reviewer 1 CRITICAL, 4 MAJOR, 3 MINOR and 1 LOW; the owner-voice
reviewer 2 BLOCKING, 5 MEDIUM and 4 LOW — with **zero hard-gate breaches, zero
rooms failing, and both board sweeps clean over 17 rooms each**, and all 20 fixed
the same day in two parallel clusters plus a third pass on the one item that
turned out to need a producer and a validator change in the same commit. **The
theme is the checking channel again, one indirection deeper than round 15's, and
it is the same sentence a third time: the round-14 census refused to let a leaf
be UNCLASSIFIED, round 15 found that "witnessed with a stated bound" was a
sentence for 173 of them, and round 16 found that the machine reading the table
was iterating the RECORD** — so every bound the last two rounds bought could be
switched off by deleting the field it was about. The most valuable single act of
the round was not a fix: it was the owner-voice reviewer's three-way contrast,
which showed that round 15's headline "escapes 123 → 12" had been measured by a
harness that mutated a leaf and left the paragraph alone, so it was scoring the
prose-identity gate and crediting bounds that did not exist. **A project that
re-derives its artifact every run and does not re-derive its own harnesses has
moved criticism 22's defect one level up the stack**, and that is the sentence
this round is really about.
Unlike round 15, **the boards moved**: four rooms ship one tower on a different
tile, and every one of the four was found by a reviewer pointing at a search that
was not measuring what its declaration claimed. Findings whose mechanism belongs
beside the machinery it fixed are written up there and named here only: the
table-iteration presence engine and the closure channel (the declaration bullet),
the note renderer (the obligation bullet), the offer-and-price tower swap (the
dispersion bullet and the tower-coverage bullet), `sealedFloor` under the
own-creep flood (criticism 43), the prune books (the film bullet's `roadKind`
paragraph), and the three new `REQUIRED_META` paths (the delete-escape bullet).

44. **CRITICAL: THE LEAF ENGINE ITERATED THE RECORD, NOT THE TABLE, SO EVERY
   BOUND IN IT WAS OPTIONAL.** `validate.mjs` walked `recordLeaves(sf)` — the
   leaves a record HAPPENS to carry — and the table of 420 classed leaves was
   therefore an authority on what MAY exist and silent on what MUST. **347 of 420
   leaf instances delete-escaped**, whole sub-records with them
   (`mobility.negotiated` in all 57 rooms, which is the entire subject of round
   15's finding 37, paragraph included; `mobility.lift`; `shallowExt.search`), and
   **all five numbers round-14 reviewers planted re-landed by DELETION**. Two of
   them leave the reader-facing paragraph visibly broken and still passing — "**?**
   deep tiles", "**undefined** cut tile(s)" — which is how you know nothing
   downstream was reading it either. The obligation layer was intact throughout
   (14/14 declaration deletions caught); the hole was strictly inside a
   declaration that is present, which is why three rounds of reviewers aiming at
   the outside of the record never touched it. Closed by iterating the TABLE per
   (gate, kind), with optionality MEASURED before it was encoded — 14 of 18 kinds
   have exactly one leaf signature — and expressed as one generic null-ancestor
   rule, 4 named `BRANCH` rules and 2 `NEVER_SHIPPED` entries rather than a
   blanket waiver. **Re-swept: 11,553 single-leaf deletions and 2,139 whole
   sub-record deletions, 0 escapes.** 34 mutations.

   **AND ONE OF THE FOUR BRANCH RULES SHIPPED WITH A HOLE IN IT, WHICH THE FILE
   SAID OUT LOUD AND THEN A THIRD PASS CLOSED.** `towers|weak-battery` is filed by
   two different layers — layer 3 when the placement search settles a weak or far
   battery, layer 7's wall pass when the as-built refill walk crosses the note
   line — and the branch picked the arm by the ABSENCE of the placement census.
   So a record that deleted `towers.*` **and** claimed `source: "walls"` **and**
   regenerated its paragraph took the wall arm legitimately, dropping 34 audited
   leaves off the audit, and nothing on the board distinguished it from E18S3, the
   fleet's one genuine wall-arm room. The validator stated this in the rule's own
   `why` rather than hiding it, which is the only reason it got fixed rather than
   forgotten. It needed a producer change and a validator change **in the same
   commit**, because either alone turns the fleet red: layer 3 now publishes
   `source: "towers"` unconditionally (15 records gained the field; the artifact is
   provably byte-identical otherwise), and the validator's derivation — which had
   been the hardcoded constant `"walls"`, correct only for as long as exactly one
   room published the field — is layer 3's own trigger transcribed off
   `meta.towers`, which layer 3 writes for every room whether it declares or not.
   **The transcription has one trap and it is worth the sentence: it must read
   `maxRefillAtPlacement`, not `maxRefill`, because `layer-walls.mjs` overwrites
   `maxRefill` with the as-built walk** — using the overwritten field mis-derives
   exactly one room, and it is E18S3, the one room the rule exists to tell apart.
   Verified over all 172 rooms including the 156 that file nothing: **172/172, zero
   mismatches.** The forged mutant now dies on a derivation, and the case that
   proves it is in the harness as `r17/C1-weak-battery-wall-arm-forged`.
45. **BLOCKING: THE CLOSURE DSL WAS AN INTRA-RECORD SHAPE CHECKER, AND THE NUMBER
   THAT SAID OTHERWISE WAS MEASURED BY THE WRONG EXPERIMENT.** 17 coordinated
   escapes over 28 attacks, every one re-confirmed at `pass 172/172 · fail 0`
   against a clean control. The three-way contrast is the finding: control passes,
   leaf edit with prose LEFT ALONE bites, **the identical edit with the paragraph
   REGENERATED escapes** — so round 15's sweep was measuring the prose gate and
   **12 was a floor**. Four structural causes, all closed: `MIRROR_*` was the same
   producer's second assignment rather than a second witness; arrays were opaque
   single leaves, which is how **E12S6's six priced, legal, lap-refused trades
   were laundered into "6 slots had NO deep target of any kind"** — criticism 12
   inverted, in the channel criticism 17 was supposed to have closed; closures
   were scale- and provenance-blind, so whole per-room censuses could be permuted
   between rooms; and `ranBespoke` stamped branch entry rather than predicate
   execution. Mirrors are bound to a 12-quantity `#board` channel re-derived from
   this room's terrain and structures (two of them promoted to class D outright),
   arrays get a closed 25-field element inventory with render-or-die on the two
   `why` fields, censuses are capped against a room-derived quantity, and the
   bespoke stamp counts predicates. 28 mutations, plus the contrast itself, which
   is in the harness: **controls 12/12 clean, edit+regen 12/12 biting.**
46. **MAJOR: THE 177 PLANNER NOTES WERE FOUND UNGATED FOR THE SECOND ROUND
   RUNNING, ONE LAYER IN.** Round 15 gave them an obligation and a content check
   and left the prose HAND-WRITTEN, so 5 of 10 mutants walked: a fabricated class
   passed because **there was no class inventory** — 200 invented "PERFECT ROOM"
   notes in one run — an appended lie passed, a note whose prose was REVERSED
   under an unchanged heading passed with its numerals intact, and a ring tile
   moved to `49,49` passed because tile LISTS were never checked. This is the last
   hand-written prose channel in the artifact and it is closed the same way the
   declarations were in round 13: a shared renderer, a closed 7-class inventory,
   `pushNote()` as the only writer, and string equality — **177/177 byte-exact in
   172/172 rooms**, with obligations derived from records and checked both ways.
   15 mutations.
47. **MAJOR: THE `negotiated.detail` RESIDUE PARSER WAS ASCII-ONLY, AND THE FIX
   WAS TO STOP PARSING.** Round 15 gated the fleet's densest paragraph by
   accounting for every numeral against a leaf. 7 of 9 mutants escaped it:
   a numeral-free reversal (round 15's own landed exploit with the digits
   removed), the claim written in number-WORDS, fullwidth and Arabic-Indic digits
   (`\d` without `/u` is ASCII), roman numerals, numerals glued to a letter and
   numerals preceded by a dot — the last two on the lookbehind. Hardening the
   regex was the obvious repair and the wrong one: round 15's producer half had
   already proved the paragraph rebuilds **byte-exactly from its leaves in all 57
   rooms**, so the gate is now full **string equality against
   `renderNegotiated(neg)`** and unicode, words, glue and leading dots all die
   together in one move. The residue parser is kept as a second opinion rather
   than as the check. 10 mutations.
48. **MAJOR: ONE-SIDED WITNESSED BOUNDS ADMIT SIGN-IMPOSSIBLE VALUES.** 14 of 14
   hand-built impossibilities passed — a negotiated lap of **−2.5**, a lifted lap
   of −2.5, an unblocked refill of −10, 830 declared cut tiles in a room whose
   shipped cut is 38 — and an independent value sweep found 41 of 200 witnessed
   instances accepting a falsification against a document claiming 12. `le`
   without `ge` is half a bound and the table had been writing it as a whole one.
   Every numeric witnessed leaf is two-sided now: NON-NEGATIVE by default, with
   **three signed exceptions named in the file** (`lane.cost`, `lane.gain`,
   `causeWalks.*.detour`) carrying two-sided ranges, and ~30 board-derived
   ceilings added. **Re-swept: sign 9,305 bite / 8 escape — and the 8 are the two
   named signed leaves; gross 9,313 bite / 0 escape.** 19 mutations.
49. **MAJOR: `satAcrossPrior.basis` — THE SENTENCE THAT SAYS WHICH BOARD EACH
   READING IS ON — WAS A 40-CHARACTER LENGTH CHECK.** A 200-character basis
   asserting the exact opposite passed. Round 15 added that string *because* the
   defect it was fixing was two boards wearing one label, so the one field whose
   entire job is to prevent a recurrence was gated on being long. Generated from
   the record now (`renderSatBasis`, string-equal), branching on whether an offer
   exists, whether the shipped re-read beats `held`, and whether the seat is free.
   3 mutations.
50. **BLOCKING/MINOR: `meta.sealedFloor` AND `meta.walls.inertPruned` WERE NEVER
   RE-DERIVED, AND ONE OF THEM OWNS A NOTE CLASS THIS DOCUMENT CALLED
   "DERIVE-OR-DIE ON BOTH HALVES".** Nine live escapes on one record, from
   deleting it outright to a coordinated inflate naming eight invented tiles that
   are interior, empty and fully reachable; deleting `inertPruned` with its note
   took 37 rooms' prune out of the record. Both in `REQUIRED_META` and both fully
   re-derived. The producer half is the more interesting one and it resolved
   criticism 43 in a direction nobody predicted — see that entry. 12 mutations.
51. **MEDIUM: TWO `towers/clump` DECLARATIONS QUOTED A SEARCH THAT NEVER MEASURED
   THE CLUMP.** The dispersion pass ranked on the whole-mass 5x5 while the
   shortfall it files is about the clump, and `spatialPrune` had already thinned
   E14S1's 370 legal deep seats to 115 with the retiring tile among the dropped —
   so "no legal swap improved it" was true of a statistic nobody was optimising,
   over a third of the seats. **E14S1 `34,25 → 34,24` and E3S5 `26,26 → 27,26`
   each take the tower-only 5x5 and the clump 5 → 4 while holding the weakest face
   exactly**, and both declarations are retired. The other three (E11S6, E1S7,
   E6S1) are earned on a re-scan of the unthinned census: **0 of 755, 0 of 690 and
   0 of 910 swaps hold face and saturation**. This is the round-14 E2S8 class
   again — an instrument added to a search after the search's own claim was
   written — and it is the second finding in two rounds where the fix was to make
   the search measure the thing its declaration is about. Full account in the
   dispersion bullet. 3 mutations, with the take gated.
52. **MEDIUM: THE PRUNE COUNTER WAS AN EVENT COUNT WEARING A TILE LABEL, TEN
   TOKENS FROM THE LINE THAT PRINTS SPUR LAID-VERSUS-SHIPPED CORRECTLY.**
   `plan.mjs` printed `pruned 2007 dead-end road tiles`; **13 tiles counted as
   pruned ship as roads**. This is criticism 27 verbatim, in the neighbouring
   statement, and the reason it is worth its own entry rather than a footnote is
   that the 13 resolve into two unrelated facts: **1** re-laid tile (E5S1 `28,30`,
   the same tile that was the 487th ghost in criticism 33 — found twice, from
   opposite ends, two rounds apart) and **12** laid-and-deleted-inside-layer-7
   tiles that never entered `meta.roadLayer` at all. Five figures published with
   their tile lists and two closing identities gated. Full account in the film
   bullet. 6 mutations.
53. **MINOR: THE PER-KIND ROAD BOOKS WERE COUNT-LEVEL, SO THREE-WAY LIES BALANCED.**
   A fabricated 40-tile `reflow` pass with invented tiles passed; lost tiles at
   off-grid `(-9,-9)` passed; a shipped road re-attributed between passes with all
   four books kept consistent passed; `restoredByKind` could claim 20 arbitrary
   shipped roads. Round 15 closed these books' ARITHMETIC and this is the same
   record one level down — the identities were over counts and the lies were over
   tiles. Bound to the board and to provenance now: laid-minus-lost must EQUAL the
   `roadKind` key set per kind, lost tiles may not be shipped roads at all,
   restored tiles must be shipped roads carrying `roadLayer < 7` evidence, and
   off-grid or on-wall dies. 6 mutations.
54. **AND THE LOW SHELF, WHICH IS SIX ITEMS AND FOUR OF THEM ARE PROSE THIS
   PROJECT WROTE ABOUT ITSELF.** **(a)** 10 of the 177 notes were deletable for
   free — layer 6's relocation record, whose obligation nobody owned;
   `meta.extensions.relocatedCount` is the owner and it is 1–3 in exactly those
   ten rooms. **(b)** Five source-comment figures the artifact refutes, including
   **E20S3 cited twice in a room list it is not a member of** — the fleet has not
   contained that room for several worlds; `grep E20S3` across the v2 tree is now
   one hit and that hit says out loud that the room is retired. Also corrected:
   "114 of 172 rooms carry a shortfall" (**157**), "79 rooms carry one note"
   (**118**), "four shortfall rows" (**five, in six rooms**), E11S7's lap quoted
   as 13.5 twice (**9.33**), and a film comment's "1,659 tiles … 12 in E20S3"
   (**1994 ghosts, 13 in E11S3**). **(c)** `STAGE_INFO`/`STAGE_KIND` drift still
   failed silently; the three tables live in a template string, so they are
   asserted as TEXT — the emitted player is parsed once per run and the partitions
   checked exactly (**STAGE_INFO 24 · STAGE_KIND 19 · EXPAND 20**), with a negative
   test proving it throws. **(d)** A 48x48 band sweep was narrated as "2304
   interior tiles" in rooms whose interior floor is **178** (E9S2; E2S3 221,
   E12S6 255); the per-room figure is published and fixed in all three channels
   that quoted it. **(e)** `validate.mjs`'s `/s+/g` was missing its backslash and
   had been shipping mangled `why` text — "so it is never smaller" reading as "o
   it i never maller" — and the file was grepped for siblings; there are none.
   **(f)** `eco.basin`'s generated `why` was false in the safe direction and
   unbounded upward; the generator now enumerates inbound closures too, which
   found **three more instances of the same bug**, and the leaf gets a real
   ceiling. Every one of (a)–(f) is the class this document has been describing
   since criticism 22: a figure re-derived by a command stays true, and a figure
   carried by a human does not.
55. **STILL OPEN, AND STATED AS THE SMALL THING IT IS: `ladder.rungs[].mobility`
   IS BOUNDED, NOT CLOSED.** A rung is a counterfactual — an enclosure the room
   composed, scored and did not build — so there is no board to re-derive its lap
   against, which puts it in the same family as the `lane.*` leaves of criticism
   42 rather than in the family the round-16 array-element inventory closed. What
   IS closed is the part that touches the artifact: the SHIPPED rung must be on
   the trail, the index and the bonus schedule are class D, `fallbackBest` must be
   a lap on the trail, and the bespoke block's mutations bite on all of those. The
   reason this gets an entry instead of a silence is that the reviewer landed a
   real exploit through it — three rung laps moved, and because the renderer
   recomputes the verdict from the table, E14S6's paragraph flipped from "A WIDER
   CUT DOES SHORTEN IT … refused on upkeep-first policy" to "No rung this room
   composed measured a materially shorter lap", with **13 fleet rooms exposed to
   the same rewrite**. The renderer is doing exactly what it should; the leaf
   under it has nothing behind it. Round 16 closed the *reachable* half and is
   saying so rather than counting the bespoke stamp as a bound.

## Environment bootstrap (context gets compacted — everything you need)

- Repo: `C:\Users\stemm\Documents\GitHub\screeps\Pacifist-Bot`. Planner code:
  `tools/plan-suite/v2/` (plain .mjs ES modules). Live bot: `src/` (TypeScript,
  `npx tsc --noEmit` must pass).
- Node: repo default resolves to fnm v12 — use `fnm exec --using 22 node` for
  planner scripts and `"C:/Program Files/nodejs/node.exe"` for fetch-based scripts.
- Local server: docker `local-screeps-server-*`, API http://127.0.0.1:23456,
  mongo has all terrain. Bot users: pacifist (token in redis key
  `auth_local-pacifist-user-token-001`), pacifist-race, waxeye.
  Push code: `npm run push-pserver && npm run push-pacifist && npm run push-waxeye`.
  **Docker does not auto-start after a host reboot, and round 16 lost 29 hours to
  that.** The host restarted mid-round, Docker did not come back, and the local
  server was down until someone noticed — which is worth a line here rather than
  a shrug, because the failure is silent in exactly the way this document
  complains about elsewhere: `validate.mjs`'s own `main()` cannot fetch without
  mongo, so the round's harnesses ran off a cached room dump
  (`ROOMS_FILE`/`PLANS_FILE`, which every harness in `tools/plan-suite/v2/`
  honours) and reproduced the summary line exactly. **The world was intact on
  restart and the VPS was unaffected**; nothing was lost but the wall clock.
  If the API is dead, check `docker ps` before debugging anything else.
- Live rooms E11S2/E11S5 are HYBRIDS (legacy structures hold some caps — storage/
  tower positions can't match plan there; that is known, not a planner bug).
  Rooms claimed by auto-expand (E9S2, E17S4, ...) are pure-plan rooms.
- Gallery served by `python -m http.server 8766` from `tools/plan-suite/out-v2/`
  (run detached if dead). Delegate implementation/review to Opus subagents with
  tightly curated specs; run adversarial reviewers as separate fresh agents.

## Process addendum

- **Commit after every clean cycle** (small conventional commits) — never let more
  than one cycle of work sit uncommitted.
- Update `docs/PLANNER-BASELINE-*.json` snapshots as metrics improve; keep the old
  ones for the trend line.

## After termination: the next campaign chains automatically

When THIS goal terminates (2 consecutive all-clean adversarial rounds + gates +
golden visual pass), do not stop. The owner has chained the next long-running
goal: **the early-game speedrun campaign** — `docs/EARLY-GAME-SPEEDRUN-CAMPAIGN.md`.
Read that document and begin it immediately, with the same process discipline
(Fable curates, Opus implements, adversarial verification, commit every clean
cycle). It is expected to take far longer than this goal; that is intended.
The owner's words: "keep going for ages … until nothing left to improve."

## Tooling (already built — use it)

- Suite: `fnm exec --using 22 node tools/plan-suite/v2/plan.mjs --all-claimable`
- Validator: `.../validate.mjs` (extend it whenever a reviewer finds an unchecked class
  — then mutation-test the new check)
- Anims: `.../export-anim.mjs --all` — **run it after every suite run.** The suite
  does not write the films and now says so when they no longer match the plan
  (`planHash`); a gallery whose player claims "this last frame IS the shipped
  plan" while showing an older base is the exact class of defect this goal calls
  an auto-fail. · Gallery: http://127.0.0.1:8766/
- Live: `push-plan.mjs <room> --user pacifist --adopt`, live view at /live/,
  spawn-in / expansion pack tooling under `tools/server/`
- Docker mongo has all room terrain; **172** claimable rooms is the test fleet
  (the "~159" that stood here was the retired world, and it was the same stale
  figure the frozen baseline above is deliberately kept as — one of them is a
  frozen record and the other was just wrong).
