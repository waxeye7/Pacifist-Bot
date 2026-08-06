/**
 * Generated prose for the two `mobility` declarations. Split out of
 * declprose.mjs because they are by far the longest paragraphs this planner
 * writes and because the two mobility declarations share every helper.
 *
 * See the header of declprose.mjs for the contract: the producer sets
 * `detail = renderDecl(sf)`, the validator regenerates from the PUBLISHED record
 * and requires equality, so every input these functions read has to be a field
 * on the declaration and nothing may be closed over from the producer's locals.
 *
 * ===========================================================================
 * WHAT A PROSE/RECORD DISAGREEMENT COST THIS PLANNER, IN ONE ROOM.
 * ===========================================================================
 *
 * E7S5 ships the worst wall pair in the fleet: 35 tiles of garrison walk against
 * 2 tiles of attacker walk, an absolute detour of 33 at a ratio of 17.5, excused
 * by `coversStands` because a RampartDefender's ranged attack reaches both ends
 * without moving. Round 10 made the room declare it — `mobility/covered-detour`,
 * with the two walks, the lift test and the coverage argument in the record.
 *
 * Round 12's audit rule was "every audited numeral must be QUOTED in the prose",
 * implemented as a numeral-presence test over `detail`. A reviewer rewrote that
 * paragraph to read
 *
 *     "the garrison walks 3 tiles inside where the attacker walks 2 outside — an
 *      absolute detour of 1 tile at a ratio of 1.05, comfortably inside the 1.2
 *      target … Nothing is owed here. [audit tokens: 35 2 33 17.5 0 20 91]"
 *
 * and the room PASSED. Every audited numeral was present — in a bracket, at the
 * end, attached to nothing. The record still said 35/2/33/17.5. The paragraph, the
 * only part of the declaration a human ever reads, said the exact opposite, and
 * the suite reported `1/1 · fail 0`. A planner that declares its shortfalls and
 * then lets the declaration be edited into a denial has bought itself nothing: the
 * whole value of a shortfall is that a reader can argue with it, and a reader who
 * reads that sentence has no idea there is anything to argue about.
 *
 * That is why these two functions exist and why they take no argument except the
 * record. There is no writer left to rewrite: the paragraph IS the record,
 * rendered, and the validator renders the published record and requires the
 * shipped paragraph to equal it character for character up to whitespace. The
 * numbers themselves are separately re-derived from terrain and the shipped
 * structure lists, so the other direction — corrupt the record until it agrees
 * with a false paragraph — fails too.
 *
 * ===========================================================================
 * THREE RULES THESE TWO RENDERERS ARE HELD TO, AND WHY EACH ONE IS HERE.
 * ===========================================================================
 *
 * (1) PURE FUNCTION OF `sf`, WITH NO IMPORTS. The old prose was assembled inside
 *     `declareMobility` out of a dozen of the producer's locals — `mBuilt`,
 *     `mFree`, `lift`, `lane`, `rep`, `tv`, `neg`, `ship`, plus the module
 *     constants MOBILITY_TARGET, MATERIAL_SHELL_LAP, MASS_SHARE_PCT — and not one
 *     of them was a field anybody could check. A sentence made of things that are
 *     not in the record is a sentence the audit cannot reach, which is exactly the
 *     hole the E7S5 rewrite went through. So every one of those is now a named
 *     field, INCLUDING THE THRESHOLDS: `metric.target`, `metric.detourFloor`,
 *     `metric.massSharePct`, `negotiated.materialLap`, `ladder.perRatio`. A
 *     threshold imported here rather than carried is a number the producer could
 *     change under a shipped paragraph without the paragraph changing, and this
 *     file would then be rendering last week's judgement with this week's line.
 *
 * (2) CONDITIONS ARE RE-DERIVED, NEVER CARRIED AS BOOLEANS. Every `if` below that
 *     selects a clause recomputes its premise from the record's own numbers.
 *     "Does this pair clear the gate" is `din - dout <= detourFloor || din/dout <=
 *     target`, computed here; "did the room miss" is `maxGated > target`, computed
 *     here; "did the battery breach" is `breachesGate` re-implemented here against
 *     the four numbers layer 3 published. A boolean is a claim, and a claim the
 *     reader cannot check is the thing this module exists to abolish. The
 *     historical damage is on file: `meta.worstCaused` — a statement about the
 *     EXTENSION mass and ONE pair — used to select a sentence about every
 *     structure in the room, so E16S5 printed "THE PRIMARY CAUSE IS THE ENCLOSURE
 *     AND THE TERRAIN, not the mass" over a miss that is one observer tile.
 *
 * (3) ...EXCEPT WHERE THE FIELD IS A MEASUREMENT AND NOT A LABEL. `lift.clears`,
 *     `worstCaused` and `rungs[].complete` stay on the record because a reader
 *     wants them and the validator re-derives them independently. They are not
 *     what the sentences below branch on: `clears` is re-read as `liftedLap <=
 *     target`, `worstCaused` is recomputed from `bareDin`/`dout`/`detourFloor`/
 *     `target`, and where a boolean genuinely cannot be recomputed from numbers
 *     (`tower.provedFree`) the clause is selected by the STRUCTURE of the record
 *     instead — layer 3 measures nothing at all when it proves the battery free,
 *     so "no measurement pair is published" is the same fact and it cannot be
 *     asserted, only exhibited.
 */

const n = (v, fallback = "?") => (v === null || v === undefined ? fallback : v);
const round2 = (v) => Math.round(Number(v) * 100) / 100;
/**
 * null and undefined become NaN, NOT 0. `Number(null)` is 0 and 0 is under every
 * threshold in this file — a record that simply forgot to carry its lap would
 * otherwise print "INSIDE the target" with total confidence. Every comparison
 * below goes through here, and NaN compares false in both directions, which is
 * the safe way for a broken record to fail.
 */
const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

/**
 * The reader-facing name of a liftable class. This is a display map and not a
 * threshold: nothing about the room is decided by it, so it lives here rather
 * than on the record. (The covered-detour paragraph deliberately prints the RAW
 * class names instead — see the note there.)
 */
const NAME = {
  extension: "the extension mass",
  tower: "the tower battery",
  lab: "the lab diamond",
  nuker: "the nuker",
  observer: "the observer",
};
const nameOf = (c) => NAME[c] || c;

/** a walk that does not connect is not a number, and is never printed as one */
const say = (d) => (d === null || d === undefined || !isFinite(Number(d)) ? "does not connect at all" : `${d}`);

/**
 * ---------------------------------------------------------------------------
 * THE LADDER, RENDERED HERE AND NOT APPENDED THERE.
 * ---------------------------------------------------------------------------
 * `attachRungProof` used to do `s.detail += " LADDER WALKED: …"`. That is a
 * second writer mutating a finished paragraph, which is the precise shape of the
 * towers/weak-battery disaster (four writers, string concatenation, three
 * structurally different paragraphs under one kind) and it breaks prose identity
 * outright: the validator renders the record and gets a paragraph with no ladder
 * in it, while the plan ships one with a ladder stapled on the end. So the
 * pipeline now fills `s.ladder` and RE-RENDERS, and the section is composed here,
 * where the order of the paragraph is a fact about this file.
 *
 * THE VERDICT IS READ OFF THE TABLE, NOT ASSERTED ABOVE IT — and now it is read
 * off the table THE RECORD PUBLISHES. layer 2's cause template used to end "no
 * cut of this basin can shorten it" whenever it diagnosed terrain, directly above
 * a table in which 30 rooms listed a COMPLETE rung with a materially shorter lap
 * (E14S5 shipped 7.5 at 40 ramparts with rung 1 sitting in its own table at 1.5
 * for 43). The three-way choice below is recomputed from `ladder.rungs` every time
 * this renders, so a record whose table contains a better rung cannot print the
 * "nothing shorter exists" sentence however the pipeline felt about it.
 */
function renderLadder(sf) {
  const L = sf.ladder;
  if (!L) return "";
  const rungs = Array.isArray(L.rungs) ? L.rungs : [];
  const perRatio = num(L.perRatio);
  const cap = num(L.cap);
  const buyFloor = num(L.buyFloor);
  const materialLap = num(L.materialLap);
  const target = num(L.target);
  const shipped = num(L.shippedLap);
  const shippedRamparts = num(L.shippedRamparts);
  /** what a rung may spend, given what it reclaims against the base rung */
  const allowance = (reclaimed) =>
    reclaimed <= 0 ? 0 : Math.min(cap, Math.floor(perRatio * reclaimed));
  // A MATERIALLY SHORTER COMPLETE RUNG, if the table has one. Re-derived, and the
  // materiality line is the record's own copy: below it two enclosures are the
  // same wall with a rounding difference and "a wider cut reaches 3.48 instead of
  // 3.5" is noise, not an alternative.
  const better = rungs
    .filter((r) => r && r.complete && num(r.mobility) < shipped - materialLap)
    .sort((a, b) => num(a.mobility) - num(b.mobility) || num(a.ramparts) - num(b.ramparts))[0];
  // ...and the best of them regardless of completeness. `fallbackBest` is only
  // consulted when this seed contributed no rung at all to the trail, which is
  // the one case the rung table cannot answer from itself.
  const best = rungs.length
    ? rungs.reduce((b, r) => (num(r.mobility) < num(b.mobility) ? r : b))
    : L.fallbackBest || null;
  const verdict = better
    ? `A WIDER CUT DOES SHORTEN IT, and it is in the table above: rung ${n(better.rung)} ` +
      `(needDeep+${n(better.needDeepBonus)}) composed the whole RCL8 program at a lap of ` +
      `${n(better.mobility)} for ${n(better.ramparts)} ramparts, ` +
      `${num(better.ramparts) - shippedRamparts} more than the ${n(L.shippedRamparts)} this room ships. ` +
      `That is over the ${allowance(shipped - num(better.mobility))} rampart(s) the ` +
      `${n(L.perRatio)}-per-1.0 mobility price allows for the ${round2(shipped - num(better.mobility))} ` +
      `of lap it reclaims (cap ${n(L.cap)}` +
      (shipped <= buyFloor
        ? `, and this room's shipped lap of ${n(L.shippedLap)} is not over the ${n(L.buyFloor)} floor ` +
          `below which wall may not be spent on lap at all`
        : ``) +
      `), so it was refused on upkeep-first policy — not on impossibility. The trade is written down ` +
      `here so it can be argued with.`
    : // A LADDER RECORD WITH NO RUNG IN IT CANNOT BE READ, and the honest output is
      // to say so rather than to interpolate `undefined` into a verdict. The old
      // code reduced over an empty array and threw; a throw here fails the room in
      // the validator's render step with a stack trace instead of a sentence.
      !best
      ? `THIS LADDER RECORD NAMES NO RUNG AT ALL — neither a composition on this seed nor a fallback ` +
        `best from the trail — so there is no table for a verdict to be read off and none is asserted.`
      : num(best.mobility) > target
        ? `No rung this room composed measured a materially shorter lap: the best of them is ` +
          `${n(best.mobility)} at ${n(best.ramparts)} ramparts, still over the ${n(L.target)} target. ` +
          `Within the enclosures this room admits at a price it can pay, the lap is what it is.`
        : `The best lap any of them measured is ${n(best.mobility)} at ${n(best.ramparts)} ramparts; it ` +
          `was refused because the ${num(best.ramparts) - shippedRamparts} extra rampart(s) exceed the ` +
          `${n(L.perRatio)}-per-1.0 price mobility is allowed to pay (cap ${n(L.cap)}).`;
  return (
    ` LADDER WALKED: ${rungs.length} rung(s) of this seed` +
    (num(L.trailLength) > rungs.length
      ? ` (plus ${num(L.trailLength) - rungs.length} composition(s) on rejected seeds)`
      : ``) +
    ` — ` +
    rungs
      .map(
        (r) =>
          `rung ${n(r.rung)} (needDeep+${n(r.needDeepBonus)}): ` +
          `mobility ${n(r.mobility)}, ${n(r.ramparts)} ramparts${r.complete ? `` : `, INCOMPLETE`}`,
      )
      .join(" · ") +
    `. ${verdict}`
  );
}

/**
 * ---------------------------------------------------------------------------
 * mobility| — the room's ONE lap declaration, as built.
 * ---------------------------------------------------------------------------
 * Sections, in the order they compose:
 *
 *   HEADLINE    the gated lap against the target, and which side of it the room
 *               is on. `sf.metric`.
 *   THE PAIR    the two wall tiles and their two walks. `sf.worst`.
 *   MASS SHARE  bare terrain against as built, in tiles and as a percentage of
 *               the worst walk. `sf.mass`.
 *   CAUSED      what the same pair does with every EXTENSION removed, gated the
 *               way the verdict is gated. `sf.mass`.
 *   LIFT TEST   what the whole metric does with every structure whose position
 *               this planner chose removed. `sf.lift`.
 *   CAUSE       the verdict, plus the worst pair's own two walks as evidence.
 *               `sf.cause`, `sf.pairCause`, `sf.causeWalks`.
 *   COUNTS      how many pairs are over, gated and ungated. `sf.metric`.
 *   LANE        layer 6's reservation and the bound it claims. `sf.lane`.
 *   REPAIR      what layer 7b and layer 3 actually tried. `sf.repair`.
 *   NEGOTIATION layer 2's declaration, verbatim, demoted to evidence, reconciled
 *               against the wall the room ships. `sf.negotiated`.
 *   LADDER      the rungs, and the verdict read off them. `sf.ladder`.
 */
export function renderMobility(sf) {
  const m = sf.metric || {};
  const mass = sf.mass || {};
  const worst = sf.worst || null;
  const lift = sf.lift || null;
  const target = num(m.target);
  const floor = num(m.detourFloor);
  const lap = num(m.maxGated);
  const din = num(worst ? worst.din : mass.din);
  const dout = num(worst ? worst.dout : mass.dout);
  const bareDin = mass.bareDin === null || mass.bareDin === undefined ? null : num(mass.bareDin);
  const share = mass.adds === null || mass.adds === undefined ? null : num(mass.adds);

  // ------------------------------------------------------------------
  // THE ONE FACT EVERY SENTENCE BELOW HANGS ON, NAMED ONCE AND DERIVED.
  //
  // This declaration fires on the UNION of two triggers — the as-built lap
  // misses, OR layer 2's negotiation missed — so it is filed by rooms that are
  // comfortably INSIDE the target and are only publishing the ladder that priced
  // their enclosure. Every sentence in the attribution block was written for the
  // first kind of room and printed unconditionally for both, and on a room whose
  // gated lap is 0 the result was a paragraph of confident falsehoods: E17S3
  // shipped "THE PRIMARY CAUSE IS THE ENCLOSURE AND THE TERRAIN, not the mass …
  // deleting the whole mass leaves the room failing here" over a headline reading
  // "the defender lap is 0 … INSIDE the 1.2 target", with mass.adds 0, bareLap 0
  // and builtLap 0. E7S9 shipped the same pair of sentences.
  // ------------------------------------------------------------------
  const gatedMiss = lap > target;
  // ...and "the lift test cleared" is the lifted lap against the record's own
  // target, not the `clears` flag beside it. The flag stays on the record because
  // the validator re-derives it against the lifted board; it is not what selects
  // a sentence, because a flag that selects a sentence is a sentence nobody can
  // check.
  const liftClears = !!lift && num(lift.liftedLap) <= target;

  const head = gatedMiss
    ? `AS BUILT the defender lap is ${n(m.maxGated)} over pairs costing more than ` +
      `${n(m.detourFloor)} tiles of detour (target ${n(m.target)}; ungated over every pair it is ` +
      `${n(m.max)})`
    : `AS BUILT the defender lap is ${n(m.maxGated)} over pairs costing more than ` +
      `${n(m.detourFloor)} tiles of detour, INSIDE the ${n(m.target)} target (ungated over ` +
      `every pair it is ${n(m.max)}) — this room is declared because the enclosure it was ` +
      `negotiated from was not, and the ladder that priced it is stapled below`;

  const pairLine = worst
    ? `: between wall tiles ${n(worst.a && worst.a.x)},${n(worst.a && worst.a.y)} and ` +
      `${n(worst.b && worst.b.x)},${n(worst.b && worst.b.y)} the garrison walks ${n(worst.din)} inside ` +
      `while the attacker walks ${n(worst.dout)} outside. `
    : `: no pair of wall tiles detours far enough to be judged, so there is no worst pair to name. `;

  // ------------------------------------------------------------------
  // THE MASS SHARE, STATED — AND A TILE COUNT IS NOT A SHARE.
  //
  // The old template offered a reader exactly one bit ("our mass" or "not our
  // mass") and computed that bit from the UNGATED ratio, so 27 rooms whose own
  // structures add four tiles or more to the worst walk were told that no
  // arrangement of 60 extensions could shorten it. Then the replacement selected
  // on `share >= 4` — an absolute tile count with no denominator — and in six
  // rooms printed "this room's miss is substantially the structures we chose to
  // grow" over its own arithmetic: E9S9, the mass adds 4 tiles of a 37-tile walk,
  // 11%; E11S7, 4 of 27, 15%, in a room whose BARE enclosure already laps 11.5
  // against a 1.2 target with not one extension standing in it. A four-tile add
  // is a large share of a nine-tile walk and a rounding error in a forty-tile
  // one, and the same literal cannot mean both. The selector is the percentage,
  // and the two lines it is compared against are on the record.
  //
  // ...AND THE ENCLOSURE OUTRANKS THE MASS WHEN THE ENCLOSURE ALREADY MISSED. If
  // lifting our whole mass still misses, then no wording that points the next fix
  // at the extension layer is honest, whatever the share is. That test is the
  // lift test, re-read here from `liftedLap`, and it is the same computation as
  // `causedNote` below — which used to be allowed to contradict the sentence
  // immediately preceding it.
  // ------------------------------------------------------------------
  const pct = share !== null && din > 0 ? Math.round((share / din) * 100) : 0;
  const bareAlreadyOver = gatedMiss && share !== null && !liftClears;
  const massShare =
    share === null
      ? `THE MASS SHARE, measured: with the extension mass removed this pair is not connected at all, ` +
        `so every tile of this walk exists because of where we built.`
      : `THE MASS SHARE, measured: bare terrain — this same enclosure with every extension removed — ` +
        `laps ${n(mass.bareLap)} and that pair walks ${n(mass.bareDin)} inside; as built the room laps ` +
        `${n(m.maxGated)} and the same pair walks ${n(worst ? worst.din : mass.din)}. The mass adds ` +
        `${n(mass.adds)} tile(s) to the worst walk — ${pct}% of it` +
        (!gatedMiss
          ? `. THERE IS NO MISS TO ATTRIBUTE: the room's gated lap is ${n(m.maxGated)}, inside the ` +
            `${n(m.target)} target, and this pair is the RECORD's worst, not a failure. Nothing ` +
            `here says whose fault the lap is, because there is no fault — the pair is named so the ` +
            `number can be re-walked, and the ladder below is why the enclosure cost what it did.`
          : bareAlreadyOver
            ? `. THE PRIMARY CAUSE IS THE ENCLOSURE AND THE TERRAIN, not the mass: this pair is over ` +
              `target at ${round2(bareDin / dout)} with every extension removed, so deleting the whole ` +
              `mass leaves the room failing here. The ${n(mass.adds)} tile(s) our structures add are an ` +
              `aggravation on top of a lap the room already owed` +
              (pct >= num(m.massSharePct)
                ? `, and at ${pct}% they are a large one — worth the extension layer's attention SECOND, ` +
                  `after the enclosure.`
                : `.`)
            : pct >= num(m.massSharePct)
              ? `. This room's miss is substantially the structures we chose to grow, not the enclosure ` +
                `and not the terrain — on bare terrain the same pair clears — and the lane reservation ` +
                `did not hold them.`
              : pct >= num(m.massMinorPct)
                ? `: a real share, but the other ${n(mass.bareDin)} tiles are the enclosure and the terrain.`
                : `. The lap is the enclosure and the terrain, not the mass — no arrangement of 60 ` +
                  `extensions shortens it.`);

  // ...and WHY the bare-terrain reading clears, in the gate's own terms: a pair is
  // only judged when its absolute detour exceeds the floor, so "clears" means one
  // of two different things and the reader is told which.
  const freeDetour = share === null ? 0 : bareDin - dout;
  const causedWhy =
    freeDetour <= floor
      ? `its detour there is ${freeDetour} tile(s), not over the ${n(m.detourFloor)}-tile floor, so ` +
        `it is not a real detour at all`
      : `it reads ${round2(bareDin / dout)}, inside the ${n(m.target)} target`;
  // ------------------------------------------------------------------
  // "STILL MISSES" IS A GATED READING OR IT IS NOTHING.
  //
  // The sentence below used to be selected by `meta.worstCaused`, which is false
  // whenever the room is inside the target — so a room that does not miss at all
  // printed "with every EXTENSION removed this pair still misses", quoting the
  // UNGATED ratio over a detour the floor exists to disqualify. E17S3 (detour 4,
  // ratio 1.27) and E7S9 (detour 2, ratio 1.67) shipped exactly that next to a
  // headline reading "INSIDE the target". Both premises are recomputed here from
  // the record's own numbers: `worstCaused` is the room missing AND the mass-free
  // walk clearing the gate, and `freeGatedMiss` is the same two hurdles the
  // verdict itself clears, applied to the mass-free walk before the word "misses"
  // is allowed to be printed. Neither is read off the flag beside them.
  // ------------------------------------------------------------------
  const freeOverGated = bareDin !== null && bareDin - dout > floor && bareDin / dout > target;
  const worstCaused = gatedMiss && bareDin !== null && !freeOverGated;
  const freeGatedMiss = share !== null && bareDin !== null && dout > 0 && freeDetour > floor && bareDin / dout > target;
  const causedNote =
    share === null
      ? ``
      : worstCaused
        ? ` With every EXTENSION removed this pair CLEARS the gate — ${causedWhy} — so the room did ` +
          `not fail here until the mass grew into it.`
        : !freeGatedMiss
          ? ` With every EXTENSION removed this pair is NOT JUDGED AT ALL — ${causedWhy} — so there is ` +
            `no mass-free miss here to blame anything for. (The ungated ratio there is ` +
            `${dout > 0 ? round2(bareDin / dout) : "undefined"}; it is quoted for completeness and it is ` +
            `not a verdict, which is the whole reason the ${n(m.detourFloor)}-tile floor exists.)`
          : ` With every EXTENSION removed this pair still misses (${round2(bareDin / dout)} over ` +
            `${freeDetour} tile(s) of detour, both over the ${n(m.detourFloor)}-tile floor and over ` +
            `the ${n(m.target)} target) — but "extensions" is not the same list as "our ` +
            `structures", and the sentence that used to stand here said the room "was over target ` +
            `before the first extension landed", which is a claim about a board that also had no labs, ` +
            `no towers, no nuker and no observer on it. See THE LIFT TEST below for the one that was ` +
            `actually asked.`;

  // ------------------------------------------------------------------
  // THE LIFT TEST. The sole authority for the `cause` field on this entry, and
  // the same numbers the field is computed from — so the round-8/9 failure
  // (`cause: "structures"` sitting inside a declaration whose prose says "not the
  // mass") cannot recur.
  //
  // ...AND "STILL MISSES" IS NOT "100% THE TERRAIN'S". The sentence that used to
  // stand in the second branch read "the enclosure and the terrain OWN this lap",
  // which is a binary read of a test that produces a number. Six rooms shipped it
  // over their own arithmetic: E13S3 3.33 -> 2.17, E11S7 9.33 -> 7.33, E14S6 6.67
  // -> 5.00, E2S5 3.25 -> 2.63, E15S2 2.13 -> 1.75, E9S9 1.94 -> 1.41 — 18% to
  // 35% of each of those laps comes off when our own mass is lifted, and saying so
  // costs nothing and is simply true. "Still misses" is a claim about WHERE THE
  // NEXT FIX GOES; the share is a claim about who built the lap, and they are
  // different questions. `ownPct` is on the record and is recomputed here from the
  // two laps it is made of.
  // ------------------------------------------------------------------
  const ownPct = lift && lap > 0 ? Math.max(0, Math.round(((lap - num(lift.liftedLap)) / lap) * 100)) : 0;
  const solo = (lift && lift.solo) || [];
  const classes = (lift && lift.classes) || [];
  const present = (lift && lift.present) || [];
  const perClass = (lift && lift.perClass) || {};
  const liftNote = !lift
    ? ``
    : ` THE LIFT TEST: lift every structure whose position this planner chose — ` +
      `${present.length ? present.map(nameOf).join(", ") : "nothing, the room has none"} — ` +
      `leaving only the mandated hub trio and the spawn fan, and re-run the whole metric: the room ` +
      `laps ${n(lift.liftedLap)} over ${n(lift.liftedOverGated)}/${n(lift.liftedGatedPairs)} judged pairs. ` +
      (liftClears
        ? `THAT CLEARS THE ${n(m.target)} TARGET, so this miss is OURS, not the terrain's` +
          (solo.length
            ? ` — and ${solo.length === 1 ? "one class does it alone" : "each of these does it alone"}: ` +
              `lifting ${solo.map(nameOf).join(" or ")} and nothing else takes the room to ` +
              `${solo.map((c) => (perClass[c] || {}).lap).join("/")}. That is where the next fix goes.`
            : classes.length
              ? ` — no single class does it alone; the smallest set measured that does is ` +
                `${classes.map(nameOf).join(" + ")}.`
              : `.`)
        : `THAT STILL MISSES, so no arrangement of the structures we place fixes this room. ` +
          `THE SHARE, since a lift test that moves the number is not a binary: lifting all of it takes ` +
          `the gated lap from ${n(m.maxGated)} to ${n(lift.liftedLap)}, so OUR OWN MASS OWNS ` +
          `${ownPct}% of this lap and the enclosure and the terrain own the other ` +
          `${100 - ownPct}%. ${ownPct === 0 ? "Nothing of ours is measurable in it." : `That ${ownPct}% is real and it is ours; what it is not is ENOUGH — the residue still misses, so the fix is a different enclosure and not a different arrangement of the mass.`}` +
          (lift.residual
            ? ` With the interior's natural walls lifted as well the residual pair walks ` +
              `${lift.residual.dFree === null || lift.residual.dFree === undefined || !isFinite(Number(lift.residual.dFree)) ? "nowhere (it does not connect)" : lift.residual.dFree}, ` +
              `which is what makes the label "${n(lift.cause)}".`
            : ``));

  // ------------------------------------------------------------------
  // THE CAUSE, AND THE WALKS THAT ARE EVIDENCE FOR IT.
  //
  // `sf.cause` is the whole-room lift test's verdict; `sf.pairCause` is the
  // pair-level label, computed on the record's worst pair whether or not that pair
  // is judged. They are different questions and they used to share a name: a room
  // whose gated lap is 0 published `cause: "structures"`, layer 7's finalize
  // copied it over `meta.shell.mobilityBuilt.cause` (correctly "none"), and the
  // room shipped a structured field naming a culprit for a failure it does not
  // have (E17S3, E7S9). `walkVerdict` prints each walk against the SAME two
  // hurdles the gate uses, so "it CLEARS the gate" here means what it means
  // everywhere else in this paragraph.
  // ------------------------------------------------------------------
  const walkVerdict = (d0) => {
    if (d0 === null || d0 === undefined || !isFinite(Number(d0))) return `does not connect at all`;
    const d = Number(d0);
    const detour = d - dout;
    const ratio = dout > 0 ? round2(d / dout) : 0;
    return detour <= 0
      ? `${d} against the attacker's ${dout} — SHORTER than the attacker's own lap, so it CLEARS ` +
          `the gate outright`
      : detour <= floor
        ? `${d} against the attacker's ${dout} — a ${detour}-tile detour, inside the ` +
          `${n(m.detourFloor)}-tile floor, so it CLEARS the gate`
        : ratio <= target
          ? `${d} against the attacker's ${dout} — ratio ${ratio}, inside the ${n(m.target)} target, ` +
            `so it CLEARS the gate`
          : `${d} against the attacker's ${dout} — a ${detour}-tile detour at ratio ${ratio}, which is ` +
            `STILL OVER the ${n(m.target)} target`;
  };
  const walks = sf.causeWalks || {};
  const causeLine = !worst
    ? ``
    : lift
      ? ` CAUSE, as built: ${n(sf.cause)} — the worst pair alone, for evidence: ` +
        `with every structure of ours lifted out it walks ${walkVerdict(walks.noStructures)}, and with ` +
        `the interior's natural walls lifted out as well it walks ${walkVerdict(walks.noWalls)}.` +
        (sf.pairCause !== sf.cause
          ? ` (That PAIR reads "${n(sf.pairCause)}"; the room's verdict is the whole-metric lift test ` +
            `above, which is what the label states — a single pair can be fixed while the room still ` +
            `misses on another one.)`
          : ``)
      : !gatedMiss
        ? ` CAUSE, as built: none — the gated lap is ${n(m.maxGated)}, inside the ${n(m.target)} ` +
          `target, so this room has no miss for anything to be the cause OF and the whole-room lift ` +
          `test was never run (it is only paid for by rooms that miss). The record's worst pair does ` +
          `carry a pair-level label of "${n(sf.pairCause)}" and it is published as \`pairCause\`, not as ` +
          `\`cause\`: with every structure of ours lifted out it walks ${walkVerdict(walks.noStructures)}, ` +
          `and with the interior's natural walls lifted out as well it walks ` +
          `${walkVerdict(walks.noWalls)}. That is evidence about one pair on a passing wall, and it is ` +
          `deliberately not a verdict about the room.`
        : // UNREACHABLE BY CONSTRUCTION AND PRINTED ANYWAY. The lift test is paid
          // for by exactly the rooms that miss, and the validator hard-fails a
          // record that carries one while inside the target. A record that misses
          // and carries NO lift test is the mirror of that, and the sentence above
          // ("inside the target, so this room has no miss") would be a flat lie
          // about it. A branch nobody can reach is cheap; a paragraph that lies
          // when the impossible happens is what this module exists to prevent.
          ` CAUSE, as built: NOT DIAGNOSED. This room's gated lap of ${n(m.maxGated)} is over the ` +
          `${n(m.target)} target and this entry carries no lift test, so the one instrument that ` +
          `produces a verdict was never run and no cause is asserted. The record's worst pair carries ` +
          `a pair-level label of "${n(sf.pairCause)}": with every structure of ours lifted out it walks ` +
          `${walkVerdict(walks.noStructures)}, and with the interior's natural walls lifted out as well ` +
          `it walks ${walkVerdict(walks.noWalls)}.`;

  const counts =
    `${n(m.overGated)}/${n(m.gatedPairs)} real-detour wall pairs are over target against ` +
    `${n(m.bareOverGated)} with no mass in the room (ungated: ${n(m.over)}/${n(m.pairs)} against ` +
    `${n(m.bareOver)}).`;

  // ------------------------------------------------------------------
  // LAYER 6's RESERVATION, AND A BOUND IS ONLY A BOUND IF THE SHIPPED ROOM IS
  // INSIDE IT.
  //
  // This sentence used to print "which bounds the worst mass this room could grow
  // at X" unconditionally, straight out of layer 6's meta, next to an as-built lap
  // that in 7 rooms EXCEEDED X — E4S7 claimed 1.5 and shipped 14. A claim that the
  // very next clause of the same paragraph refutes is worse than no claim. The
  // claim has to hold to be printed, and the holding is recomputed here from
  // `metric.maxGated` and `lane.bounded`; when it does not hold the declaration
  // says so in those words. (After the layer-6 rewrite it holds in 159/159; the
  // branch stays because a bound nobody checks is how the last one rotted.)
  // ------------------------------------------------------------------
  const lane = sf.lane || null;
  const shrunkNote =
    lane && lane.shrunk
      ? ` The full reservation wanted ${n(lane.shrunk.wanted)} tile(s); it was SHRUNK to ` +
        `${n(lane.shrunk.to)} round(s) because the whole of it cost more than the ` +
        `+${n(lane.shrunk.premium)}-rampart premium this room's gain is priced at.`
      : ``;
  // WHAT THE BOUND IS A CLAIM ABOUT, when the relocation pass lifted a stub. The
  // worst-case model reads a corridor stub as permanently walkable floor; layer
  // 6's relocation pass ends by standing extensions on some of them, so the bound
  // is re-derived over the corridor that actually SHIPS. Saying so here is the
  // difference between a bound and a bound-shaped number: E11S7 measured 11.5
  // before its five lifted stubs and 13.5 after, and shipped 13.5.
  const stubNote =
    lane && lane.stubsLifted && lane.boundBeforeStubs !== undefined && lane.boundBeforeStubs !== null
      ? ` This bound is measured over the corridor this room SHIPS: layer 6's relocation pass stood ` +
        `${n(lane.stubsLifted)} extension(s) on tiles the worst-case model had read as permanent corridor ` +
        `stub, so the model was re-derived with them blocked — ${n(lane.boundBeforeStubs)} before, ` +
        `${lane.bounded === null || lane.bounded === undefined ? "no finite bound" : lane.bounded} after.`
      : ``;
  const laneNote = !lane
    ? ``
    : lane.dropped
      ? ` The lane reservation layer 6 wanted (${n(lane.wanted === null || lane.wanted === undefined ? lane.tiles : lane.wanted)} tile(s)) was DROPPED — for ` +
        `${
          lane.droppedFor === "extensions"
            ? "the 60th extension, which outranks the lap"
            : lane.droppedFor === "no-gain"
              ? `buying no measurable lap at all`
              : `${n(lane.cost)} personal rampart(s), over the +${n(lane.premium)} this room's gain of ${n(lane.gain)} is priced at`
        }` +
        ` — the ${n(lane.wantedBound)} it would have bounded this room at is NOT claimed here; what is claimed is ` +
        `${lane.bounded === null || lane.bounded === undefined ? "nothing, because the unreserved worst case still severs a battlement" : `${lane.bounded}, the bound the unreserved mass cannot exceed, against a shipped ${n(m.maxGated)}`}.`
      : lane.bounded === null || lane.bounded === undefined
        ? ` Layer 6 reserved ${n(lane.tiles)} lane tile(s) but measured no finite bound for this room.`
        : lap <= num(lane.bounded) + 1e-9
          ? ` Layer 6 reserved ${n(lane.tiles)} lane tile(s) (${n(lane.deep)} deep) over ${n(lane.rounds)} round(s) ` +
            `(${n(lane.strandRounds, 0)} of them reattaching a battlement the worst case severed), which bounds the ` +
            `worst mass this room could grow at ${n(lane.bounded)} — and the room shipped at ${n(m.maxGated)}, inside it.` +
            stubNote +
            shrunkNote
          : ` THE RESERVATION FAILED TO HOLD: layer 6 reserved ${n(lane.tiles)} lane tile(s) (${n(lane.deep)} deep) over ` +
            `${n(lane.rounds)} round(s) and measured a bound of ${n(lane.bounded)}, and this room SHIPPED AT ` +
            `${n(m.maxGated)}. The bound is wrong, not the room — a model of the mass that the mass beats is a ` +
            `defect in layer 6, and it is printed here rather than quietly dropped.` +
            shrunkNote;

  // ------------------------------------------------------------------
  // WHAT WAS ATTEMPTED, BEFORE ANY OF THIS IS ALLOWED TO BE A DECLARATION.
  //
  // The old closing sentence was "Nothing is relocated to chase this number … a
  // pass that moved finished structures to patch the result would be the repair
  // loop this planner is not allowed to have." That is a good rule about an
  // UNCONDITIONAL repair loop, and it was being used to excuse four rooms whose
  // own lift test named ONE sufficient class and a lifted lap of 0 (E12S3 1.69
  // [extension], E15S2 1.67 [extension], E17S8 1.31 [extension], E4S8 1.50
  // [tower] — one tower, one tile). The rule binds the other way now: when the
  // lift test says the miss is ours, the planner has to try, and the declaration
  // has to say what the attempt cost.
  //
  // `repair.mass.ran` USED TO BE A CARRIED BOOLEAN AND IS NOW DERIVED. layer 7b
  // runs the relocation pass if and only if lifting every extension clears the
  // gate — that is the whole entry condition — so "it ran" is exactly
  // `liftedLap <= target` and it is recomputed here rather than believed. Same
  // for "it moved something" (`moved > 0`) and for layer 3's `breached`, which is
  // `breachesGate` re-implemented against the four numbers layer 3 published.
  // The one thing that cannot be recomputed is layer 3's detour-free PROOF, and
  // that clause is selected by the structure of the record instead: a battery
  // proved free is a battery layer 3 never measured, so it publishes no
  // measurement pair, and the absence is the fact.
  // ------------------------------------------------------------------
  const rep = (sf.repair && sf.repair.mass) || null;
  const tv = (sf.repair && sf.repair.tower) || null;
  const repRan = !!rep && rep.liftedLap !== null && rep.liftedLap !== undefined && num(rep.liftedLap) <= target;
  const tvMeasured = !!tv && tv.baseLap !== null && tv.baseLap !== undefined && tv.lapWithBattery !== null && tv.lapWithBattery !== undefined;
  const tvBreached =
    tvMeasured &&
    ((num(tv.lapWithBattery) > target && num(tv.baseLap) <= target) ||
      num(tv.lapWithBattery) > num(tv.baseLap) + 1e-9 ||
      num(tv.overWithBattery) > num(tv.baseOver));
  const repairNote =
    ` WHAT WAS ATTEMPTED: ` +
    (!repRan
      ? `the extension mass was NOT relocated, and the room's own instrument is why — lifting every ` +
        `extension out of this room leaves the gated lap at ` +
        `${rep && rep.liftedLap !== null && rep.liftedLap !== undefined ? rep.liftedLap : "the same place"}, ` +
        `so the mass is not what is in the way and moving it would be chasing the number. `
      : num(rep.moved) > 0
        ? `layer 7b relocated ${n(rep.moved)} extension(s) to buy this lap back — ${n(rep.lapBefore)} before, ` +
          `${n(rep.lapAfter)} after — over ${n(rep.rounds)} round(s), ${n(rep.trials)} legal one-for-one move(s) ` +
          `measured against the whole metric and not just the worst pair, every target deep and ` +
          `road-faced so not one rampart and not one extension slot was spent. `
        : `layer 7b TRIED and could not: lifting every extension clears this room (${n(rep.liftedLap)}), so ` +
          `the mass owns the lap, and ${n(rep.rounds)} round(s) examined the ${n(rep.blockersSeen)} extension(s) ` +
          `standing on the mass-free route between the worst pair and measured ${n(rep.trials)} legal ` +
          `relocation(s) of them onto deep road-faced floor. None shortened the gated lap. ` +
          `${rep.lastRefusal ? `The last refusal: ${rep.lastRefusal}. ` : ""}`) +
    (!tv
      ? ``
      : !tvMeasured
        ? `The tower battery is provably free of this: blocking its six tiles cannot lengthen any interior ` +
          `walk — every pair of their walkable neighbours is already connected around them — so no seat of ` +
          `it is in the way. `
        : tvBreached
          ? `The tower battery DOES cost this room gated pairs — on layer 2's board the empty room reads ` +
            `${n(tv.baseLap)} over ${n(tv.baseOver)} over-target pair(s) and the battery takes it to ` +
            `${n(tv.lapWithBattery)} over ${n(tv.overWithBattery)}` +
            `${num(tv.lapWithBattery) === num(tv.baseLap) ? " (the same maximum, on more pairs)" : ""} — and layer 3 ` +
            `could not move it: ${n(tv.tried)} single-slot swap(s) examined, ${n(tv.scoreTied)} of them ` +
            `affordable on the weakest wall face and the saturation, ${n(tv.affordable)} of those also ` +
            `non-worsening for the nuke window and the refill walk, and none cleared the gate. `
          : `The tower battery was measured against the lap and does not breach it (${n(tv.baseLap)} over ` +
            `${n(tv.baseOver)} pair(s) without it, ${n(tv.lapWithBattery)} over ${n(tv.overWithBattery)} with)` +
            `${num(tv.moved) > 0 ? `, after ${n(tv.moved)} seat(s) moved to keep it that way` : ""}. `) +
    `Nothing else is relocated to chase this number: layer 6 reserves the defender's lanes before it ` +
    `grows, and an UNCONDITIONAL pass that moved finished structures to patch the result would be the ` +
    `repair loop this planner is not allowed to have. What is allowed is the bounded, lift-directed ` +
    `attempt above — bounded because the instrument that triggers it is a whole-room test this room ` +
    `publishes and a reader can re-run.`;

  // ------------------------------------------------------------------
  // THE NEGOTIATION RECORD — layer 2's declaration, demoted to evidence.
  //
  // It keeps every word it had, VERBATIM and on the record as `negotiated.detail`,
  // because the enclosure was really chosen on these numbers and a record edited
  // to agree with the outcome is not a record. What it loses is the right to be
  // the headline, and what it gains is the two reconciliations it always needed:
  // the same mass-free reading taken over the wall the room SHIPS (layers 2-6 add
  // bubble ramparts, layer 7 prunes and adopts), and the as-built lap above. The
  // materiality line the two are compared against is `negotiated.materialLap`, on
  // the record, so a reader can see what "agrees with it" was allowed to mean.
  // ------------------------------------------------------------------
  const neg = sf.negotiated || null;
  const negBlock = !neg
    ? ``
    : ` — · — THE ENCLOSURE NEGOTIATION, for the record: layer 2 chose this cut against an EMPTY ` +
      `interior (object tiles, the hub trio and the links, nothing else), and what it measured there is ` +
      `not what the garrison walks — it is the evidence the enclosure was bought on. Verbatim: "` +
      n(neg.detail, "") +
      `"` +
      (neg.shippedWallLap !== null && neg.shippedWallLap !== undefined
        ? ` RE-DERIVED ON THE SHIPPED WALL with that same mass-free walk, the negotiated lap of ` +
          `${round2(neg.lap)} reads ${round2(neg.shippedWallLap)} over ` +
          `${n(neg.shippedOverGated)}/${n(neg.shippedGatedPairs)} real-detour pairs` +
          (Math.abs(round2(neg.lap) - round2(neg.shippedWallLap)) >= num(neg.materialLap)
            ? `. THOSE DISAGREE MATERIALLY: the trade layer 2 priced was priced against an incumbent ` +
              `lap this room does not have. The reasoning stands because it is what was decided; the ` +
              `number is corrected here rather than quietly overwritten.`
            : `, which agrees with it to within ${n(neg.materialLap)} of a lap.`)
        : ".") +
      ` The as-built figure at the top of this declaration is the one that describes this room.`;

  return (
    head +
    pairLine +
    (worst ? `${massShare}${causedNote}${liftNote}${causeLine} ` : `${liftNote} `) +
    counts +
    laneNote +
    repairNote +
    negBlock +
    renderLadder(sf)
  );
}

/**
 * ---------------------------------------------------------------------------
 * mobility|covered-detour — the pair the verdict excused.
 * ---------------------------------------------------------------------------
 * `coversStands` (layer-shell, RANGED_RANGE) excuses a pair of wall tiles when a
 * defender standing on either one already covers every exterior tile an attacker
 * can stand on to grind the other: he answers the grind without walking, so the
 * lap is not repositioning work. That argument is sound and it is not the whole
 * truth, because the garrison still has to make that walk to CONSOLIDATE — and
 * until round 10 the pair was deleted before a single statistic was accumulated,
 * so E7S5 shipped `max 1.5 · maxDetour 1 · cause "none"` and no shortfall at all
 * over the worst pair in the fleet: 35 tiles inside against 2 outside, an
 * absolute detour of 33 at a ratio of 17.5.
 *
 * The exclusion stays (it is the right rule for the gate) and the silence does
 * not. This is also the exact paragraph the reviewer rewrote into a denial — see
 * the file header — so of the two renderers in this module it is the one with the
 * clearest reason to be a function of nothing but its record.
 *
 * NOTE ON THE CLASS NAMES: this paragraph prints the RAW liftable class names
 * ("extension, tower, lab") where `renderMobility` prints the prose names ("the
 * extension mass, the tower battery"). That is how the two shipped and the
 * difference is deliberate here: the sentence reads "lift every structure whose
 * position this planner chose (extension, tower, lab)", a parenthetical list of
 * the classes, not a clause. Changing it would be rewriting the paragraph rather
 * than relocating it.
 */
export function renderCoveredDetour(sf) {
  const r = sf.record || {};
  const tiles = sf.tiles || [];
  const a = tiles[0] || {};
  const b = tiles[1] || {};
  const target = num(r.target);
  const din = num(r.din);
  const noStruct = r.noStructures === null || r.noStructures === undefined ? null : num(r.noStructures);
  const noWalls = r.noWalls === null || r.noWalls === undefined ? null : num(r.noWalls);
  const present = Array.isArray(r.present) ? r.present : [];
  // the two tiles' separation, recomputed from the tiles the declaration names
  // rather than carried — a chebyshev the record could disagree with its own tile
  // list about is exactly the kind of free numeral the E7S5 rewrite hid behind
  const cheb =
    Number.isInteger(a.x) && Number.isInteger(b.x)
      ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
      : "?";
  // THE VERDICT'S OWN SIDE OF THE LINE, RE-DERIVED. Not a flag: the gated lap and
  // the target are both on the record and the comparison is one operator.
  const gatedOver = num(r.gatedLap) > target;
  // OUR MASS ADDS NOTHING TO IT — earned, not asserted. The pair walks at least as
  // far with every structure of ours lifted out as it does on the shipped board,
  // so no arrangement of what we place shortens it.
  const massFree = noStruct !== null && noStruct >= din;
  // ...and "what is between these two tiles is a mountain": letting the garrison
  // walk THROUGH the interior's natural walls at least halves the walk.
  const throughWalls = noWalls !== null && noWalls * 2 <= din;

  return (
    `THE WORST PAIR ON THIS WALL IS NOT THE PAIR THE GATE JUDGED, and this is the room saying so. ` +
    `Between cut tiles ${n(a.x)},${n(a.y)} and ${n(b.x)},${n(b.y)} — chebyshev ` +
    `${cheb} apart — the garrison walks ` +
    `${n(r.din)} inside while the attacker walks ${n(r.dout)} outside: an absolute detour of ${n(r.detour)} ` +
    `tiles at a ratio of ${n(r.ratio)}, against a ${n(r.target)} target. ` +
    `WHY IT IS NOT GATED: a RampartDefender's ranged attack reaches 3, and every exterior tile an ` +
    `attacker can stand on to grind either of these two is inside that reach from the other, so nobody ` +
    `has to make this walk to ANSWER a grind — he shoots from where he stands. The walk is real ` +
    `anyway: it is what consolidating the garrison onto one of these two tiles costs. ` +
    `THE VERDICT, for contrast: over the ${n(r.gatedPairs)} pair(s) this room's gate does judge ` +
    `(absolute detour over the ${n(r.detourFloor)}-tile floor, not mutually covered) the lap is ` +
    `${n(r.gatedLap)}${gatedOver ? ", which is over target and declared above" : ", inside the target"}. ` +
    `${n(r.coveredPairs)} of this wall's ${n(r.pairs)} pairs are excused by coverage; this is the ` +
    `worst of them. ` +
    `WHOSE FAULT: lift every structure whose position this planner chose ` +
    `(${present.length ? present.join(", ") : "none — the room has none"}) and re-run the ` +
    `whole metric — the room laps ${n(r.liftedLap)}, and this same pair walks ` +
    `${say(r.noStructures)} with our structures out of the way and ${say(r.noWalls)} with the interior's ` +
    `natural walls lifted out as well. ` +
    (massFree
      ? `Our mass adds NOTHING to it: the enclosure and the terrain own every tile of this walk, and no ` +
        `arrangement of the structures we place shortens it by one step. ` +
        (throughWalls
          ? `Letting the garrison walk THROUGH the interior's natural walls takes the same pair to ` +
            `${n(r.noWalls)}, so what is between these two tiles is a mountain: the only thing that could ` +
            `shorten this walk is a different cut, one that goes round it instead of across it.`
          : `Even with the interior's natural walls lifted the pair walks ` +
            `${noWalls === null ? "nowhere — it does not connect" : n(r.noWalls)}, ` +
            `so this is the shape of the enclosure itself and not one obstacle in it.`) +
        ` Layer 2 negotiated this enclosure on ramparts, and it is not offered the lap of a pair no ` +
        `defender has to walk to answer a grind.`
      : // A WALK THAT DOES NOT CONNECT IS NOT A SUBTRAHEND. This branch used to be
        // reached with `dStruct === null` and printed "Our mass adds NaN tile(s) of
        // it; the remaining null are the enclosure and the terrain" — arithmetic on
        // a pair that does not connect at all with our structures lifted. That is
        // not a smaller share, it is a different fact, and it gets its own
        // sentence rather than a number that means nothing.
        noStruct === null
        ? `Our mass is not measurable against it at all: with every structure of ours lifted out this ` +
          `pair does not connect, so there is no mass-free walk to subtract from the ${n(r.din)} the ` +
          `garrison makes and no share to attribute.`
        : `Our mass adds ${din - noStruct} tile(s) of it; the remaining ${n(r.noStructures)} are the ` +
          `enclosure and the terrain.`)
  );
}

export { n, round2 };
