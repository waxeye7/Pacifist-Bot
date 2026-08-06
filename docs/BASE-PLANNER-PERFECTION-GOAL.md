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
  (round 12, unchanged from round 11 and re-derived from the shipped artifact
  rather than carried; the "257 / 229 / max 4" figures below this line were a 159-room
  world, and the round-9 "286 / 241 / median 2 / max 6 / 36 bubbles" numbers that
  stood here were wrong on four of five counts — measured on the file whose own
  md5 the same section quoted): **277 road+rampart tiles, 235 of them exactly on
  the shell cut line, median 2 and max 5 per room**. The full taxonomy, five
  classes and every one of them decided by its own positive test:
  **235 wall crossings on the cut + 29 bubble seats (a container) + 13 controller
  stand-denial RING tiles + 0 personal cover + 0 unclassified = 277.**

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
  also fell 281 → 277 because layer 7's inert prune now deletes 8 ring ramparts
  that carried road and defended nothing — see the ring-rampart paragraph under
  the controller bullet below.
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

  **AND WHEN IT DECLINED, IT PUBLISHED A ZERO.** Five rooms still ship two
  consecutive paved cut tiles (E15S1, E18S9, E19S9, E7S9, E9S8) — the
  anti-pattern by its own name — and the only
  thing stage 5b said about them was the counter `alongCutMoved: 0`. A count of
  moves TAKEN is not an argument about the moves NOT taken: from a zero a reader
  cannot tell "there was nothing to do" from "there was something to do and it
  was refused," which is silent capping with a number in front of it. Stage 5b
  now records a **REFUSAL PER TILE**, with the reason that applies to that tile —
  no interior parallel exists, and which neighbour failed and why; or the swap
  breaks the road network — and every room that ships a run states it, re-derived
  by the validator on the board the room actually ships rather than on stage 5b's
  working copy.
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
  that has no such swap now DECLARES it with the search counters — **5 rooms put 5
  of their 6 towers inside chebyshev 2 of the sitter (E11S6, E14S1, E1S7, E3S5,
  E6S1) and every one of them files a `towers/clump` shortfall** quoting how
  many swaps were examined, how many were score-tied and therefore legal to take,
  and what the window did. In all five the honest answer is still "nothing moved":
  0–6 of 613–910 single swaps were score-tied, and 0 of the pair swaps were.
  (It was six through round 11. E2S5 left the list in round 12 without anyone
  aiming at it: the bubble keep-class waiver of finding F2/m3 changed what layer
  7's prune deleted, `composePlan` therefore scored a different rung best, and
  the room recomposed to a cut of 28 from 39, 33 ramparts from 43 and a clump of
  3 from 5. Strictly better on all three, and it is recorded here as luck that
  was measured rather than as a fix that was designed.)
- No structure on source/controller/mineral tiles (extractor on mineral exempt),
  no illegal stacking, no out-of-bounds, full CONTROLLER_STRUCTURES cap compliance —
  and the validator itself must catch injected mutations of every class it checks.
  The mutation suite is at **170/170 caught** (90/90 at round 11, 64/64 at round
  10), against a 172/172 clean baseline on the unmutated artifact; every one of
  them was written because a reviewer landed the mutation first. Round 12 added
  **80**, and the block is grouped by the finding that produced it: C1 8/8 ·
  C2 14/14 · M3 16/16 · M4 17/17 · M5 17/17 · M1 3/3 · M2 3/3 · F1 2/2.
  The suite lives outside the repo tree — it is a splice into a scratch runner
  that reads the shipped artifact through `PLANS_FILE` — so **the count is not
  printed by any committed tool**, which is exactly the rot m1 and m2 below are
  about, and it is named here as an open gap rather than dressed up.
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
  equality. Eight audited kinds. The paragraph cannot say anything the record
  does not, because nobody writes the paragraph. See criticism 17.
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
- **AND `meta.towers.maxRefill` WAS READ ONLY INSIDE A MESSAGE STRING.** It was
  interpolated into the text of a warning and never compared with anything, so
  setting E7S5's to 99 against a real 5 passed. It is re-derived and compared now,
  as are `shippedMinShellDmg` and `shippedCutTiles` — three published numbers that
  existed only to be printed.
- Interior connectivity invariant: interior walk region stays one component reaching
  the sitter and a face of every structure, at every placement step.
- Deterministic output — identical plans across runs. Verified by hashing
  `plans-hub.json` over consecutive `--all-claimable` runs of the shipped tree
  on the 172-room world: two consecutive full-fleet runs byte-identical, md5
  **`c9ac380797f5eecadd4dc78bb890cc96`** (round 12, as shipped — this is the
  number `md5sum tools/plan-suite/out-v2/plans-hub.json` prints today).
  (`391686904ebdc39c2745ae5a741c6726` was round 11 and is retired with it, as
  `4cd61bc629797fc7859d2573b90bc119` — the round-11 pre-fix artifact — was
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

  Row 13 is what the suite's own `SUITE WALL CLOCK` line printed on the round-12
  shipping run, and nothing more. The per-room quantiles are dashes for a reason
  that is worth saying rather than hiding: `planMs` is deliberately not
  serialised (see the determinism bullet), so the p50/p90/max columns exist ONLY
  in the console output of the run that produced them and **cannot be re-derived
  from the artifact afterwards**. Anyone re-checking this row has to re-run
  `plan.mjs --all-claimable` and read its last three lines; there is no second
  source. Round 12 adds one measured pass per audited declaration kind — the
  validator now regenerates eight kinds of declaration prose from the record and
  compares (finding M3/M4/F2/F5) — and that cost is on the VALIDATOR's clock,
  not the planner's. The in-planner total moved 92.0s → 99.6s, which is inside
  the 91.8–171.7s band this table has been quoting since round 9; no attribution
  of that 7.6s is offered here, because none was measured, and a guessed cause
  in this table is the same defect as a guessed metric anywhere else in it.

  Round 11 adds two measured passes to the planner — layer 3 now reads the
  defender lap before it settles the battery, and re-measures its refill walk
  with the battery standing in it — and the in-planner total went DOWN, because
  removing the arrive bias took 19 rooms out of the over-target set and with them
  the escalation rungs they were composing.

  **In-planner 91.8–171.7s; end to end 99.4–202.1s.** Runs 8, 9 and 10 are a
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

  (`layer-shell.mjs`'s `MOBILITY_EXACT_MAX = 90` — the cut size above which the
  all-pairs metric samples instead of enumerating — carried the justification
  "largest cut 75". The largest reachable cut on the shipped artifact is **80**.
  The constant's conclusion is unchanged, 0 rooms sample, but a headroom argument
  quoting the wrong headroom is one relocation away from being wrong about the
  conclusion too. Corrected.)
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

## Anti-patterns (auto-fail if a reviewer finds one)

- Sparse checkerboard extensions; solid extension bricks; extensions walled in.
- Road spam / city grids / roads on every rampart / roads serving nothing.
- Towers clumped on the hub; towers or eco within ranged-attacker reach (depth ≤ 3,
  unramparted); safety measured against the wall list instead of the exterior region.
  Measured round 12, and **printed by the suite** (`tower clump within chebyshev 2
  of the sitter`) rather than transcribed, which is the only reason it is allowed
  in prose: exact histogram **{0:12 1:14 2:53 3:60 4:28 5:5 6:0}**, i.e.
  **cumulative ≥3 = 93, ≥4 = 33, ≥5 = 5** of 172 (round 11 shipped 3:59 / 5:6,
  ≥4 = 34, ≥5 = 6; E2S5 recomposed to a clump of 3). The round-10 wording — "93 …
  hold 3 …, 34 hold 4, and 6 hold 5" — was ambiguous between the exact and
  cumulative readings and, on the artifact it was written against, its 93 was a
  transcription of neither (the cumulative there was 91). Both numbers are stated
  now and the suite prints them. Some of that clumping is the interior's shape and
  none of it may be bought back with the weakest wall face, so the five worst
  DECLARE — `towers/clump`, quoting the swap search that failed — rather than
  passing in silence. A clump the room can prove it cannot leave is a verdict; one
  nothing looked at is this anti-pattern.
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

Where the fleet stands after round 12 (172 rooms, the world this doc is now
measured against — the 159-room numbers above are kept as the frozen baseline
they are, not as a description of today). **Every number in this block is printed
by one of exactly three commands — `plan.mjs --all-claimable`, `validate.mjs` or
`push-plan.mjs --census` — and that sentence is true for the first time.** It
stood here through round 11 as an assertion rather than a fact: three of the
figures below (the fleet rampart total, the fleet shallow-extension total and the
count of declared shortfalls) were printed by nothing at all and were
re-transcribed by hand out of `plans-hub.json` every round, which is the exact
condition m1 and m2 caught rotting. The suite now prints all three, plus the
notes and the road total, on one line:

  `FLEET TOTALS: ramparts 8208 · shallow extensions 25 (E12S6:6 E2S3:4 E9S2:15) · declared shortfalls 303 · planner notes 170 · roads 14102`

**And the reason that line names `declared shortfalls` explicitly is that a
number which looked like it was already printed was a different quantity.**
`validate.mjs` ends on `declared-shortfall 121`, and 121 is the count of **ROOMS
that pass carrying a note** — its own heading says so, `121 room(s) pass with a
note` — not the count of declarations, which is 303 across 157 rooms. Reading one
as the other is how the wrong number would have survived, and the two are kept
visibly distinct. The digest is quoted once, in the
determinism bullet above, and not repeated here:
ext60 172/172 (suite) · validator 172/172 fail 0 (validator) ·
ramparts total **8208** (suite, FLEET TOTALS) ·
roads median 81 of **14,102** total (suite prints the median, the distribution
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
**277 = 235 crossings + 29 bubble seats + 13 stand-denial ring + 0 personal cover
+ 0 unclassified** (median 2, max 5; `unclassified` printed whether or not it is
zero, which is the fix — see the road bullet) · one mobility declaration per room,
**55 rooms over the 1.2 gated target** and 57 declarations (two rooms declare a
negotiation their mass then fixed), and the `cause` field is now derived from the
same lift test as the prose beside it rather than overwritten after it, with a
room inside the target carrying `cause: "none"` — see the cause paragraph under
criticism 2 · the COMPLETE mobility record, which is not the verdict: worst ratio
**17.5** and worst absolute detour **33 tiles**, both E7S5, both excused from the
gate by coverage and both DECLARED (`mobility/covered-detour`, 8 rooms) · furthest
tower refill AS BUILT median 4 / max 11, **16 rooms over the 8-step note and all
16 declared** · worst 5x5 high-value window 11 (E6S1 36,23 · E6S9 27,30), mean
7.98, counting the nuker · 0 entombed room objects · **0 staged road orphans and
0 eco terminals a creep cannot reach, at every one of RCL 3, 4, 5, 6, 7 and 8**,
re-derived over a graph in which spawns and storage are the obstacles the engine
says they are, and printed as a per-level table by `push-plan.mjs --census` —
with the honest scope stated where it belongs, and PRINTED rather than only
stated: **1 room PAVED its RCL-deferred join (E5S1 `28,30`) and 2 rooms publish
an unpaveable PAVING GAP — E2S5 `27,23` with 11 road tiles behind it and E5S3
`32,11` with 5** — a join whose only tile is the
mineral container's own, which no arrangement of roads can pave before RCL6; a
creep walks it at 2 ticks instead of 1, nothing is unreachable, and the tile
conducts in the audit because the plan names it and the validator re-derives it
from terrain · arterial **7,919 of 14,102** road tiles (census) · **303 declared
shortfalls** (suite, FLEET TOTALS — and NOT the `declared-shortfall 121` the
validator ends on, which counts rooms, per the note above), of which 133 are the
per-room mineral-seat off-network exception the road gate used to grant silently
in the checker's own source, and **170 planner notes** beside them (suite, same
line).

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
   arterial set **7,919 of 14,102**
   road tiles, container-face pass **30 tiles across 28 rooms**, eco-reach chains
   **6 tiles across 3 rooms**, the two together **36 tiles across 31 rooms, max 3
   in one room** (E14S5), **0 demoted**; the pass only ever RE-STAGES roads the
   planner already placed and never invents one.

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

   **The honest scope, stated rather than rounded off:** "0 orphans" is true with
   two named PAVING GAPS conducting — E5S3 `32,11` and E2S5 `27,23`, each the
   single tile on which a pocket of the network meets the rest, and each the tile
   the mineral container occupies. The engine allows one structure per tile, so no
   arrangement of roads closes either before RCL6. A creep still walks it —
   containers are not obstacles and neither is bare floor — so the cost is one
   extra tick per crossing and nothing is unreachable. That is a different fact
   from an orphan, so it is published as one, in the plan's own
   `meta.walls.conductBridge.gapTiles`, and the validator re-derives it from
   terrain and fails the room if it is not true. The alternative is a guarantee
   that says "0 orphans" by quietly meaning something narrower.
   (`push-plan.mjs`'s own comment still says "One room in the fleet has a join
   that cannot be paved by anybody"; E2S5's recomposition this round made it two,
   and that comment is stale.)

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
   365/168 and no reading gives 220/145. The wrong pair was in TWO places, here
   and in a comment in `src/utils/PlanV2.ts`, and both are corrected. It survived
   two rounds for exactly one reason: **`--census` never printed the figure.** It
   does now. A number in prose that no tool re-derives rots exactly like a metric
   no gate re-derives, and the fix for both is the same — make something print
   it.)
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
   impossible rather than merely detected. 14 mutations, all bite.
15. **(M1/F3) THE AUDIT SHARED ITS GRAPH WITH THE PASS IT AUDITS — AGAIN.** This
   is criticism 6's defect a second time, in the same file, on a different axis.
   The RCL3 conduct graph walked THROUGH the RCL6-deferred mineral container,
   because it built its conductor set from the plan's unfiltered container array,
   and `stagedOrphans` — the check written to catch exactly that — built its set
   from the same unfiltered array. An audit that shares its graph with the pass it
   audits reports zero BY CONSTRUCTION; it is not a weak check, it is not a check.
   All three sites now call `plannedTilesFor` at the RCL being audited, so a
   container that does not exist yet cannot conduct; `stagedOrphans` sweeps RCL
   3 through 8 rather than only 3; **E5S1 is PAVED at `28,30`**; and E5S3's join
   cannot be paved by anybody — it is the mineral container's own tile — so it
   publishes a verified PAVING GAP instead (see criticism 6 for the scope, and
   for E2S5, which became a second one this round). A new validator gate
   re-derives the whole thing from terrain, and it was proved by re-running it
   against the PREVIOUS artifact, where it bites. 3 mutations, all bite.
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
   and requires EQUALITY. Eight audited kinds. A paragraph can no longer say
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
   against a real 7,919 of 14,102), and **E13S6 was named as a released-parks room
   in four separate places** — this document, `pipeline.mjs`'s `PARK_PROTECT`
   comment, criticism 4 and the released-parks prose — when it holds all 8 of the
   8 seats its search counted, eats 0, ships 0 shallow extensions and never enters
   the release pass at all. Its own two quoted figures disagreed with each other,
   which was the tell nobody pulled. Both are corrected, and **both are now
   PRINTED** — the arterial pair by `push-plan.mjs --census`, the released rooms
   by the suite's `upgrader parks: … released in N room(s): …` line, which names
   E12S5 and E9S2 and nothing else. A number in prose that no tool re-derives rots
   exactly like a metric no gate re-derives, and the fix for both is the same:
   make something print it. **That principle is not yet fully applied to this
   document** — see the `[artifact only]` markers in the status block above, which
   are the three figures still standing on nothing but a script someone ran once.

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
- Docker mongo has all room terrain; **172** claimable rooms is the test fleet
  (the "~159" that stood here was the retired world, and it was the same stale
  figure the frozen baseline above is deliberately kept as — one of them is a
  frozen record and the other was just wrong).
