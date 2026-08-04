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
  trivially rebuilt), while its container must be bubbled or declared.
- Every extension has a **road on an orthogonal (D4) face** — easily accessible,
  corridor pattern, never a maze, never diagonal-only.
- One connected road network touching every structure. No roads ON ramparts —
  **with one exception, the shell gate**: where an eco road (to a source, the
  controller, the mineral) crosses the cut line, the crossing tile is both road
  and rampart by necessity. That is a gate, not road spam: without it the wall
  has a hole or the haulers have no way out. Re-measured on the 172-room fleet
  (round 10; the "257 / 229 / max 4" figures below this line were a 159-room
  world, and the round-9 "286 / 241 / median 2 / max 6 / 36 bubbles" numbers that
  stood here were wrong on four of five counts — measured on the file whose own
  md5 the same section quoted): **281 road+rampart tiles, 234 of them exactly on
  the shell cut line, median 2 and max 5 per room** — the rest are 38 declared
  eco bubbles and 9 mineral-container bubbles that happen to cover a road.
  **The accounting closes exactly: 234 + 38 + 9 = 281, 0 unclassified.** (Every
  stand-denial rampart that also carries road is itself a cut tile, so it is
  counted once, in the first class it belongs to — the round-9 review's "20
  stand-denial tiles the taxonomy has no class for" is that double count.)
  A gate per eco route, which is the expected shape.
  **A RUN of them is not.** Where the cut turns and follows an eco lane the room
  used to ship two or three consecutive paved rampart tiles — a prepared surface
  along the exact line an attacker who breaks in wants to walk (E14S5 shipped
  42,36 42,37 42,38 with bare interior floor one tile west). Layer 7 stage (5b)
  now offers every such run the interior parallel and takes the swap when the
  network is measurably no worse; a single CROSSING tile is never touched.
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
  flood from the sitter that has to ARRIVE (`MINERAL ENTOMBED`, undeclarable).
- **Nuke dispersion is a soft objective, and it is measured.** A nuke does full
  damage over a 5x5, cannot be intercepted, and is answered only by rampart hit
  points — so "how much of the RCL8 program does ONE warhead reach" is a real
  property of a layout. Counted over spawn/storage/terminal/nuker/tower and
  EXCLUDING the lab diamond (a mandated 4x4 stamp cannot be dispersed), the round-8
  fleet's worst 5x5 window held 12 structures against a median of 8; round 10 ships
  **worst 11 (E6S1 36,23 · E6S9 27,30), mean 7.95, median 8, min 5.**

  **THE FIELD DID NOT COUNT THE NUKER, FOR TWO ROUNDS.** `meta.towers.nukeWindow`
  was produced by layer 3, which runs two layers before layer 5 places the nuker,
  so the array it summed was empty and the published number was the window over
  spawn/storage/terminal/tower only — short by exactly 1 in **145 of 172 rooms**,
  publishing 10 where E6S1 and E6S9 ship 11. The nuker lands inside its own room's
  worst 5x5 in **154 of 172**, so the freedom layer 5 was told to spend on
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
  that has no such swap now DECLARES it with the search counters — **6 rooms put 5
  of their 6 towers inside chebyshev 2 of the sitter (E11S6, E14S1, E1S7, E2S5,
  E3S5, E6S1) and every one of them files a `towers/clump` shortfall** quoting how
  many swaps were examined, how many were score-tied and therefore legal to take,
  and what the window did. In all six the honest answer is still "nothing moved":
  0–6 of 613–910 single swaps were score-tied, and 0 of the pair swaps were.
- No structure on source/controller/mineral tiles (extractor on mineral exempt),
  no illegal stacking, no out-of-bounds, full CONTROLLER_STRUCTURES cap compliance —
  and the validator itself must catch injected mutations of every class it checks.
- Interior connectivity invariant: interior walk region stays one component reaching
  the sitter and a face of every structure, at every placement step.
- Deterministic output — identical plans across runs. Verified by hashing
  `plans-hub.json` over 2 consecutive `--all-claimable` runs of the shipped tree
  on the 172-room world: byte-identical, md5 **`f3457eda8d8f121fff98086289f5dcdb`**,
  sha256 `849ddf7a80b80a62e947e336b92d65dd373acf1753b95a25df590ae7cd937b96`
  (round 10; held across five consecutive runs, not two).
  (The `8b24fd42494f5904…` that stood here matched **no** hash of the artifact it
  claimed to describe — not md5, not sha1, not sha256. A digest is the one figure
  in this document that is worthless when approximately right, so it is quoted in
  full, with the algorithm named, and it is the number `md5sum` prints.) `planMs`
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

  **In-planner 103.5–171.7s; end to end 111.3–202.1s.** Runs 8, 9 and 10 are a
  consecutive determinism triple and differ by 12s of wall clock for
  byte-identical output, exactly as runs 3 and 4 did for 59s — the spread is
  machine load and not planner variance, so quote the range, never a single
  figure. Per room that is 0.60–1.00s against the retired world's 0.60s.

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
- Tower coverage: equalize damage across ALL wall faces (towers fall off hard with
  range), spread, refill-distance weighted; the first-built tower (array order) must
  be the easiest to refill.
- Controller outside the wall: rampart ONLY its adjacent ring (denies claim-attack
  stands) + link + container. Nothing wider. **The ring defends a room OBJECT, not
  a structure of ours** — this is why the layer-7 inert-rampart prune, whose keep
  test only values a rampart for what it does to our own structures' depth and
  exterior flag, deleted 161 ring tiles across 66 rooms while every gate passed.
  Ring tiles are a named keep-class in that pass (`plan.shell.standDenial`) and the
  validator now re-derives the ring independently: a walkable tile D8-adjacent to
  an outside controller that carries no rampart and is in the exterior flood is a
  hard fail on gate `shell`, kind `ctrl-ring`.
- **`meta.shell.cut` must BE the wall.** Every shell metric — battlements, the
  battery's weakest face, links on the wall, mobility endpoints — is computed over
  it, so a cut that has gone stale reports all of them against a wall the room does
  not have. The definition is a mutation and both sides run it: a rampart is part
  of the seal exactly when removing IT ALONE lets the exterior flood reach the
  sitter. Layer 7 adopts whatever that test finds into the cut and re-derives every
  metric over the union; the validator fails any room where the two disagree.

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
  AND layer 7b's, so E12S6 said "3" over 6 steps.

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

## Anti-patterns (auto-fail if a reviewer finds one)

- Sparse checkerboard extensions; solid extension bricks; extensions walled in.
- Road spam / city grids / roads on every rampart / roads serving nothing.
- Towers clumped on the hub; towers or eco within ranged-attacker reach (depth ≤ 3,
  unramparted); safety measured against the wall list instead of the exterior region.
  Measured round 10: **93 of 172 rooms hold 3 of 6 towers inside chebyshev 2 of the
  sitter, 34 hold 4, and 6 hold 5** (E11S6, E14S1, E1S7, E2S5, E3S5, E6S1). Some of
  that is the interior's shape and none of it may be bought back with the weakest
  wall face, so the six worst DECLARE — `towers/clump`, quoting the swap search
  that failed — rather than passing in silence. A clump the room can prove it
  cannot leave is a verdict; one nothing looked at is this anti-pattern.
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

Where the fleet stands after round 10 (172 rooms, the world this doc is now
measured against — the 159-room numbers above are kept as the frozen baseline
they are, not as a description of today):
ext60 172/172 · validator 172/172 fail 0 · ramparts total **8250** · roads median 81 ·
**shallow extensions 27** (31 at round 9, 30 at round 8) · upgrader parks min 4 /
median 8, 0 rooms under the hard 4-seat floor and **3 rooms holding fewer seats
than layer 1 counted, every one of them a priced, declared release that is
strictly better on shallow slots AND on total ramparts** (E9S2, E13S6, E12S5;
`ctrlParkFloor` / `ctrlParks` = 7/7, 4/7 and 2/5 — see criticism 4 below for why
those two numbers are different questions) · road+rampart 281 (234 gates, 38
bubbles, 9 mineral, median 2, max 5, accounting closed) · one mobility
declaration per room, all **75** as-built and independently re-derived, **cause
field and prose agreeing 75/75** · worst 5x5 high-value window 11, mean 7.95,
**now actually counting the nuker** · 0 entombed room objects · every eco terminal
reachable over the RCL3 arterial road set (was 8 rooms short) · two consecutive
`--all-claimable` runs byte-identical (md5 `5ed56dc939a3406c425ff98be3d2969e`).

Known open criticisms, in priority order:
1. ~~**1793 extensions sit shallow and buy personal ramparts**~~ — the owner's top
   new criterion: placement should avoid the depth≤3 band so those ramparts
   vanish. **Down to 27 fleet-wide** (1793 on the retired 159-room world, 31 at
   round 9), every one of them carrying a personal rampart and a declaration that
   reports the post-prune search rather than inferring from layer 6's counters.
   Not closed, because 27 is not 0 and the remaining ones are the genuinely tight
   rooms — but this line is no longer the top of the list.
2. **75 of 172 rooms exceed the 1.2 gated defender-mobility target** — attacker
   out-walks defender somewhere on the wall. The line that stood here read "18
   rooms … worst ~3.2", which was measured on the retired 159-room world with the
   pre-mass, ungated metric; re-derived AS BUILT (extension mass standing, only
   pairs whose absolute detour clears the 4-tile floor judged) the distribution
   is **32 in (1.2, 2] · 13 in (2, 3] · 22 in (3, 5] · 8 above 5**, worst
   **E11S7 14.0**, then E16S4 8.0, E1S6 6.0, E1S8 6.0, E1S9 6.0, E5S4 5.6. That
   is the single largest gap between what this document claimed and what the
   fleet ships, and understating it by 4x is how it stayed open. The suite's own
   fleet summary now prints this reading rather than layer 2's pre-mass one.

   E11S7's 14.0 is 0.5 WORSE than round 9's 13.5, on purpose and priced: the
   relocation pass used to refuse five rampart-retiring moves because taking them
   read 14 against a self-imposed ceiling of 13.5 — five forever-ramparts rented
   to protect a 3.7% change in a number the room misses by 1000%. A room past 2x
   the target may now spend up to 10% of its lap to retire ramparts (never its
   published lane bound, which is a proof and is clipped to). E11S7 went from 5
   shallow extensions to **0** and from 58 ramparts to **53**. Rooms inside 2x —
   E15S2 at 1.67 — keep the strict ceiling and keep refusing, because near the
   gate the difference between making it and not is worth more than the rampart.

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
   which says three rooms sit below their own layer-1 count while this one said
   zero. Both sentences were about different quantities and neither said which:
   `ctrlParkFloor` is how many seats the room RESERVES and `ctrlParks` is how many
   it SHIPS. Three rooms deliberately reserve fewer — E9S2 7, E13S6 4, E12S5 2 —
   because `maybeReleaseParks` re-composed them at a lower cap and that
   composition was strictly better on shallow extensions and total ramparts, and
   each files a `ctrlParks/released` declaration naming the tiles it gave back.
   All three still SHIP at or above the floor (7, 7 and 5). The rule in
   `shared.mjs` — "the floor is what layer 1 measured, capped at PARK_PROTECT" —
   was likewise missing that clause and now states it, `meta.ctrlParkFloorWhy`
   says in words which of the two rules produced the number, and the claim here
   is the one that is true and load-bearing: **0 rooms below the hard floor.**
5. Rampart total should fall overall (8704 on the retired world → **8250** today)
   via deeper packing, not via weaker shells. Still open: the shells are the same
   shells, and the fall is almost entirely personal ramparts retired by the
   post-prune reflow, not min-cut savings.
6. **The RCL BUILD STAGING is a separate contract from the plan, and it had gaps.**
   `src/utils/PlanV2.ts` claimed RCL3 builds "the roads a hauler actually walks";
   re-derived through `roadStageFor`, the stage-3 network never reached 8 eco
   terminals (source containers E14S5 42,39 · E17S5 44,35 · E18S4 27,20 · E21S9
   5,32 · E3S5 16,15, controller containers E15S4 13,14 · E16S6 16,19 · E8S6
   15,25), and **12 RCL2-built containers across 10 rooms** had their serving road
   staged later than the container — E16S6's controller container `16,19` is built
   at RCL2 and waited until RCL4 for `17,20`/`16,20`. Both are now guarantees in
   `push-plan.mjs`: every eco terminal's cheapest chain back to the arterial
   network is promoted into stage 3, and every RCL2 container with a planned D4
   face gets that face at the earliest legal road stage (which is 3 — roads are
   hard-gated off below RCL3, so "staged with it" cannot mean stage 2).

   Re-derived on the shipped artifact: **0 unreachable eco terminals at stage ≤ 3**
   (was 8), **0 stranded RCL2 containers**, road-array prefix invariant **172/172**,
   staging deterministic across two runs. Cost: **49 road tiles moved from a later
   stage into stage 3, across 32 rooms, max 4 in one room** (E17S5), **0 demoted**;
   the pass only ever RE-STAGES roads the planner already placed and never invents
   one. Still open, and outside push-plan's reach: **220 RCL2 containers across
   145 rooms have no planned D4 road face at all** — every one is reachable over
   the stage-3 network (containers conduct, and they are serviced at D8), but a
   re-staging pass cannot create a face the planner did not lay. That is a
   `tools/plan-suite/v2` question and it is the next thing to attack here.

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
- Docker mongo has all room terrain; ~159 claimable rooms is the test fleet.
