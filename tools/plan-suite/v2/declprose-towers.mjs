/**
 * Generated prose for the two `towers` declarations. See the header of
 * declprose.mjs for the contract: the producer sets `detail = renderDecl(sf)`,
 * the validator regenerates from the PUBLISHED record and requires equality, so
 * every input these functions read has to be a field on the declaration and
 * nothing may be closed over from the producer's locals.
 *
 * ===========================================================================
 * WHY THESE TWO PARAGRAPHS WERE THE WORST OFFENDERS IN THE FLEET.
 * ===========================================================================
 *
 * The `towers/weak-battery` paragraph was not written in one place. It was
 * assembled by FOUR writers across two layers, each of which reached in and
 * mutated the string the previous one had left:
 *
 *   1. layer-towers.mjs built the "THIS BATTERY IS LEGAL, NOT GOOD" body from
 *      layer 3's own locals — over the cut LAYER 2 handed it.
 *   2. layer-walls.mjs declareShippedBattery PREPENDED an "AS SHIPPED" reading
 *      and then quoted layer 3's paragraph back inside a pair of quote marks,
 *      because layer 3's numbers are about a wall the room no longer has.
 *   3. layer-walls.mjs declareShippedRefill PREPENDED an "AS BUILT" refill
 *      reading in front of THAT.
 *   4. finalizeRoom APPENDED an "AUDITED FACTS" clause on the end.
 *
 * Four writers, string concatenation, and two of them able to push a whole
 * declaration of their own when the earlier ones had not — which is why the
 * fleet shipped three structurally different paragraphs under one kind, why
 * E15S5 could open with "the weakest wall face sees 1350 damage ... 0/20 cut
 * tiles" over a wall that is 19 tiles and weakest at 1410, and why the
 * correction sat six sentences down behind a wall of search prose. Nothing in
 * that pipeline could state an invariant about the finished paragraph, because
 * no single place ever held it.
 *
 * So the paragraph is now a pure function of TWO records and the composition is
 * here, in one function, where the order of the sections is a fact about this
 * file rather than a fact about which layer happened to run last:
 *
 *   `sf.towers`  — LAYER 3's SEARCH RECORD. What the battery was over the cut
 *                  layer 2 handed layer 3, which seats the room offered, what
 *                  the hill-climb reached, what the escalation and the refill
 *                  repair actually tried. Absent when layer 3 did not declare,
 *                  and its absence is a fact the paragraph states out loud.
 *   `sf.battery` — THE AS-SHIPPED RECORD. The wall the room actually has, the
 *                  walk the filler actually makes around the finished base, and
 *                  the thresholds both are judged against. Written last, by
 *                  finalizeRoom, when every number is final.
 *
 * THE TWO CONDITIONAL CLAUSES ARE RE-DERIVED, NOT CARRIED. The declaration
 * fires on either a weak face or a far refill, and the old code decided which
 * clause to print from the producer's own `if`. A boolean is a claim, and a
 * claim the reader cannot check is exactly what this module exists to abolish,
 * so the thresholds (`targetMin`, `weakShellDmg`, `refillNote`, `maxRefillHard`)
 * are FIELDS ON THE RECORD and the clauses are selected by comparing the
 * record's own numbers against them. A record that carries a 2400-damage
 * weakest face cannot print the weak-face sentence however much its producer
 * wants to, and a record that omits a threshold prints neither clause and says
 * so — NaN comparisons are false in both directions, which is the safe way to
 * fail.
 */

const n = (v, fallback = "?") => (v === null || v === undefined ? fallback : v);
const plural = (v, one, many) => (Number(v) === 1 ? one : many);
const pt = (t) => (t && Number.isInteger(t.x) ? `${t.x},${t.y}` : "?,?");
const pts = (list) => (list || []).map(pt).join(" · ");
/** walks, nearest first — the same shape layer 7's own reader printed */
const dstr = (a) => (Array.isArray(a) ? a.slice().sort((x, y) => x - y).join("/") : "?");
/**
 * null and undefined become NaN, NOT 0. `Number(null)` is 0, and 0 is under
 * every damage threshold in this file, so a record that simply forgot to carry
 * its weakest face would have printed the weak-face clause with total
 * confidence. Every comparison in this module goes through here.
 */
const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
/**
 * "a 11-step walk" is what string concatenation gives you and it is what the old
 * inline prose shipped. These paragraphs are read by a person deciding whether
 * to argue with a trade, and prose that reads like a template makes the argument
 * easier to wave away, so the indefinite article agrees with how the numeral is
 * SPOKEN: eight, eleven and eighteen (and their decades) open on a vowel sound
 * and take "an". Walks are single digits and low teens in every room in the
 * fleet, so the rule does not need to be more general than this.
 */
const art = (v) => {
  const s = String(v);
  if (s === "11" || s === "18") return "an";
  return s.startsWith("8") ? "an" : "a";
};

/**
 * ---------------------------------------------------------------------------
 * towers|weak-battery
 * ---------------------------------------------------------------------------
 * Sections, in the order they are composed, each present only when the record
 * that feeds it is:
 *
 *   OPENER      — which of the two lines this room crosses, re-derived from the
 *                 reading of record (`sf.battery` where there is one, layer 3's
 *                 otherwise) against the thresholds on that same record.
 *   AS SHIPPED  — the wall the room has: weakest sealing tile, average, how
 *                 many under the hard floor, and what the prune did to get
 *                 there. `sf.battery`.
 *   AS BUILT    — the filler's walk around the finished base, against layer 3's
 *                 reading of the same battery. `sf.battery`.
 *   THE SEARCH  — layer 3's record, explicitly labelled as being about a
 *                 different wall, because that is the whole of round-9 finding
 *                 #6. `sf.towers`.
 *   AUDITED     — the handful of numerals the validator re-derives from terrain
 *                 and the shipped structure lists. `sf.battery`.
 */
export function renderWeakBattery(sf) {
  // WHICH RECORDS ARE REALLY HERE, and the test is a field only the real record
  // has rather than mere object-presence. declareShippedBattery used to hang a
  // three-field `{shippedMinShellDmg, declaredMinShellDmg, weakTiles}` block on
  // `sf.towers` when it pushed a declaration layer 3 had never made — an object
  // that is truthy, is named `towers`, and is not a search record at all. Keying
  // the search section on `candidates` (the size of the seat list the hill-climb
  // ran over, which only layer 3 can know) means a room that never searched
  // cannot accidentally render a paragraph about a search.
  const b = sf.battery && Number.isFinite(num(sf.battery.cutTiles)) ? sf.battery : null;
  const t = sf.towers && Number.isFinite(num(sf.towers.candidates)) ? sf.towers : null;

  // THE READING OF RECORD. The shipped wall where the room has one, layer 3's
  // cut otherwise — and the two are never blended, because conflating them is
  // the defect this whole declaration has a second half to correct. `wall` and
  // `face` carry the denominator into the sentence so a reader is never left to
  // guess which board a numeral is over.
  const rec = b
    ? {
        min: b.minShellDmg,
        weak: b.weakTiles,
        cut: b.cutTiles,
        maxRefill: b.maxRefill,
        targetMin: b.targetMin,
        weakDmg: b.weakShellDmg,
        note: b.refillNote,
        hard: b.maxRefillHard,
        face: "sealing tile",
        wall: "the cut tiles this room ships",
      }
    : t
      ? {
          min: t.minShellDmg,
          weak: t.weakTiles,
          cut: t.declaredCutTiles,
          maxRefill: t.maxRefill,
          targetMin: t.targetMin,
          weakDmg: t.weakShellDmg,
          note: t.refillNote,
          hard: t.maxRefillHard,
          face: "wall face",
          wall: "the cut tiles layer 2 handed layer 3",
        }
      : null;

  // A DECLARATION WITH NO RECORD AT ALL IS A DECLARATION THAT CANNOT BE READ,
  // and the honest output is to say that rather than to interpolate `undefined`
  // into six confident sentences. The validator renders the same string from the
  // same empty record, so this does not fail the room by itself — the round-11
  // content audit is what fails it, which is the layer that should.
  if (!rec) {
    return (
      `THIS BATTERY DECLARATION CARRIES NO RECORD. Neither the as-shipped block (\`battery\`) nor layer ` +
      `3's search block (\`towers\`) is present on this entry, so there is nothing to generate a paragraph ` +
      `from and nothing for a reader to check. An unbacked declaration is an excuse, and it is printed as ` +
      `one.`
    );
  }

  const gated =
    Number.isFinite(num(rec.min)) &&
    Number.isFinite(num(rec.weakDmg)) &&
    Number.isFinite(num(rec.maxRefill)) &&
    Number.isFinite(num(rec.note));

  // THE TWO CLAUSES, EARNED FROM THE RECORD'S OWN ARITHMETIC. See the file
  // header: neither of these is a flag the producer sets.
  const weakFace = gated && num(rec.min) < num(rec.weakDmg);
  const farRefill = gated && num(rec.maxRefill) > num(rec.note);
  const trig = [];
  if (weakFace) {
    trig.push(
      `the weakest ${rec.face} sees ${n(rec.min)} damage — legal (the hard floor is ` +
        `${n(rec.targetMin)}) but under the ${n(rec.weakDmg)} the fleet reaches almost everywhere, with ` +
        `${n(rec.weak)}/${n(rec.cut)} of ${rec.wall} under the floor`,
    );
  }
  if (farRefill) {
    trig.push(
      `the furthest tower is ${art(rec.maxRefill)} ${n(rec.maxRefill)}-step refill walk from the sitter — ` +
        `legal (the hard cap is ${n(rec.hard)}) but far enough that a refill trip costs more than the ` +
        `tower's own reload`,
    );
  }

  let opener;
  if (!gated) {
    // A record that does not carry the lines it is judged against cannot select
    // a clause, and pretending otherwise is how a paragraph starts asserting
    // things nobody can check. It says what is missing instead.
    opener =
      `THIS BATTERY DECLARATION CANNOT SELECT ITS OWN CLAUSES: the record is missing at least one of the ` +
      `weakest-face reading, the furthest refill walk, the ${n(rec.weakDmg)} fleet damage line or the ` +
      `${n(rec.note)}-step refill note, so neither of the two sentences this declaration exists to print ` +
      `can be earned from it. `;
  } else if (trig.length) {
    opener = `THIS BATTERY IS LEGAL, NOT GOOD: ${trig.join("; ")}. `;
  } else {
    // AND THIS BRANCH IS NOT DEAD CODE — it is the case the old prose could not
    // express at all. Layer 3 declares over layer 2's cut; layer 7's prune and
    // the seal reconciliation then move the wall, sometimes UPWARD. The room
    // ends up shipping a battery that clears both lines while carrying a
    // declaration that says it does not. Deleting the declaration would be
    // rewriting the record to agree with the outcome, so it stands and states
    // its own obsolescence.
    opener =
      `THIS BATTERY IS LEGAL, AND ON THE BOARD THIS ROOM SHIPS IT IS ALSO GOOD: the weakest ${rec.face} ` +
      `takes ${n(rec.min)} damage, at or over the ${n(rec.weakDmg)} the fleet reaches almost ` +
      `everywhere, and the furthest tower is ${art(rec.maxRefill)} ${n(rec.maxRefill)}-step walk, at or ` +
      `inside the ${n(rec.note)}-step note. The declaration stands anyway because layer 3 measured a ` +
      `different wall ` +
      `— see below — and a record deleted when the number improves is not a record. `;
  }

  // ------------------------------------------------------------------
  // AS SHIPPED. This block LEADS, and that ordering is round-9 finding #6: it
  // used to be appended, so every number a reader met first was a number about
  // a wall the room does not have.
  // ------------------------------------------------------------------
  const shipped = b
    ? `AS SHIPPED, on the wall this room actually has: the weakest sealing tile takes ${n(b.minShellDmg)} ` +
      `damage${b.worst ? ` (${pt(b.worst)})` : ``} over ${n(b.cutTiles)} cut ` +
      `${plural(b.cutTiles, "tile", "tiles")}, averaging ${n(b.avgShellDmg)}, with ${n(b.weakTiles)} of ` +
      `them under the ${n(b.targetMin)} hard floor. THAT IS THE NUMBER OF RECORD — re-derived after layer ` +
      `7's inert prune and the single-removal seal reconciliation have both changed which tiles are the ` +
      `wall` +
      (num(b.inertPruned) > 0
        ? `: the prune deleted ${n(b.inertPruned)} ${plural(b.inertPruned, "tile", "tiles")} of doubled ` +
          `inner wall, which merges a walled-off lobe into the garrison's region and hands that side of ` +
          `the seal to the lobe's own eco bubbles — tiles the battery was never scored against, because ` +
          `when it was scored they were not in the cut`
        : ` (the prune deleted nothing in this room, so the shipped wall differs from the negotiated one ` +
          `only where the seal reconciliation moved it)`) +
      `. ` +
      (b.worstOnLink
        ? `The weakest of them carries a LINK, which is an OBSTACLE_OBJECT_TYPE, so no defender and no ` +
          `repairer can ever stand on that rampart to help it. `
        : ``)
    : ``;

  // ------------------------------------------------------------------
  // AS BUILT, THE FILLER'S WALK. Layer 3 measures a board with no labs, no
  // nuker, no observer and no sixty extensions on it; every one of those is an
  // obstacle, and the gap between the two readings is not an error in either.
  // Both are printed, and which one grew is derived from the two numbers.
  // ------------------------------------------------------------------
  const grewFrom = num(b && b.maxRefillAtPlacement);
  const builtNow = num(b && b.maxRefill);
  const placementCmp = !b
    ? ``
    : !Number.isFinite(grewFrom)
      ? `Layer 3 published no reading of its own for this battery, so there is nothing to compare the ` +
        `as-built walk against here; the seat list it searched is below.`
      : builtNow > grewFrom
        ? `Layer 3 measured ${n(b.maxRefillAtPlacement)} for the same battery and was not wrong about its ` +
          `own board: it runs before the labs, the nuker, the observer and sixty extensions exist, and ` +
          `all of those are obstacles. The ${n(b.maxRefill)} is what the filler walks around the finished ` +
          `base (${dstr(b.refillDistsAtPlacement)} at placement).`
        : builtNow === grewFrom
          ? `Layer 3 measured the same ${n(b.maxRefillAtPlacement)} with the battery standing in its own ` +
            `way, and the finished mass adds nothing to it.`
          : `Layer 3 measured ${n(b.maxRefillAtPlacement)} with the battery standing in its own way and ` +
            `the finished base walks SHORTER at ${n(b.maxRefill)} — the roads this planner lays after ` +
            `layer 3 opened a way round the battery that layer 3 could not see.`;
  const built = b
    ? `THE FILLER'S WALK, AS BUILT: the furthest tower is ${art(b.maxRefill)} ${n(b.maxRefill)}-step walk ` +
      `from the sitter` +
      (num(b.refillUnreachable) > 0
        ? ` (${n(b.refillUnreachable)} ${plural(b.refillUnreachable, "tower", "towers")} the filler ` +
          `cannot reach at all)`
        : ``) +
      `, against the ${n(b.refillNote)}-step line at which a refill trip costs more than the tower's own ` +
      `reload and a hard cap of ${n(b.maxRefillHard)}. Walks, nearest first: ${dstr(b.refillDists)}. ` +
      `${placementCmp} Nothing is relocated HERE: moving a tower after the wall, the roads and the nuke ` +
      `window have all been measured against it would invalidate three declarations to fix one, so the ` +
      `only repair search that was ever affordable is layer 3's, and it is quoted below where there is ` +
      `one. `
    : ``;

  // ------------------------------------------------------------------
  // THE SEARCH, AND THE WALL IT IS ABOUT. Demoted behind the shipped reading,
  // never rewritten to agree with it: a record edited to match the outcome is
  // not a record of anything.
  // ------------------------------------------------------------------
  let search;
  if (!t) {
    search =
      `LAYER 3 FILED NOTHING, AND THAT IS ITSELF THE FINDING: over the cut it was handed this battery ` +
      `cleared both lines, so the layer that can explain the search had no reason to speak, and this ` +
      `declaration exists only because a later layer moved the wall or the mass under it. There is ` +
      `therefore no seat list, no hill-climb and no repair attempt to quote — nobody ran one, because ` +
      `when the towers were placed there was nothing to repair. `;
  } else {
    // LAYER 3's OWN CLAUSES, re-derived from layer 3's OWN numbers against layer
    // 3's OWN thresholds. Same rule as the opener, different record: the
    // producer does not get to choose which of these prints either.
    //
    // ...AND THEY ONLY PRINT WHEN THERE IS A SHIPPED READING TO CONTRAST WITH.
    // The opener is already generated from `rec`, which IS layer 3's record when
    // no as-shipped block has been attached yet, so printing them
    // unconditionally made the layer-3-only paragraph say the same two sentences
    // twice, ten words apart, with identical numerals. Repetition is how a
    // reader learns to skim a channel, and a skimmed declaration is a
    // declaration nobody argues with — which is the entire failure mode this
    // module was built against. When the two readings differ (which is the
    // interesting case, and the reason the section exists) both are printed and
    // both are labelled with the wall they are over.
    const l3Gated =
      Number.isFinite(num(t.minShellDmg)) &&
      Number.isFinite(num(t.weakShellDmg)) &&
      Number.isFinite(num(t.maxRefill)) &&
      Number.isFinite(num(t.refillNote));
    const l3FarRefill = l3Gated && num(t.maxRefill) > num(t.refillNote);
    const l3Bits = [];
    if (b && l3Gated && num(t.minShellDmg) < num(t.weakShellDmg)) {
      l3Bits.push(
        `the weakest wall face saw ${n(t.minShellDmg)} damage — over the ${n(t.targetMin)} hard floor and ` +
          `under the ${n(t.weakShellDmg)} fleet line — with ${n(t.weakTiles)}/${n(t.declaredCutTiles)} of ` +
          `those cut tiles under the floor`,
      );
    }
    if (b && l3FarRefill) {
      l3Bits.push(
        `the furthest tower was ${art(t.maxRefill)} ${n(t.maxRefill)}-step refill walk from the sitter`,
      );
    }
    // THE REPAIR ATTEMPT IS NOT A CLAUSE, IT IS THE EVIDENCE, so it stands on
    // its own sentence and prints whenever layer 3 crossed the refill line —
    // with or without a shipped reading beside it. "I tried and there was
    // nothing" is a claim about a search, and the counters are the only thing
    // that makes it one.
    const rs = t.refillSearch || {};
    const repairText = l3FarRefill
      ? `THAT WALK WAS MEASURED WITH THE BATTERY STANDING IN IT — the other five towers are obstacles, ` +
        `and over the pre-mass field this layer gathers candidates on the same six seats read ` +
        `${n(t.maxRefillUnblocked)} — and a repair was ATTEMPTED: ` +
        (num(rs.rounds) > 0
          ? `${n(rs.rounds)} round(s) over this room's ${n(t.candidates)} legal seat(s), ${n(rs.tried)} ` +
            `single-slot swap(s) examined, ${n(rs.scoreTied)} of them score-tied and therefore ` +
            `affordable, ${n(rs.dispersionOk)} of those also non-worsening for the nuke window — ` +
            (num(rs.moved) > 0
              ? `${n(rs.moved)} seat(s) moved, taking the walk from ${n(rs.before)} to ${n(rs.after)}, ` +
                `and this is where it stopped. `
              : `and not one of them shortened the walk without costing the weakest wall face, which is ` +
                `the trade this layer may not make. `)
          : `none was needed at this layer — it measured ${n(rs.before)} here, and a later layer's ` +
            `re-derivation over the finished board is what pushed it over. `)
      : ``;
    const esc = t.search || {};
    const escRan = Number.isFinite(num(esc.starts)) && Number.isFinite(num(esc.rounds));
    const escText = escRan
      ? ` re-entered on ALL ${n(esc.starts)} of those optima plus ${n(esc.restarts)} ` +
        `deterministically-seeded random legal batteries, and run to ` +
        `${esc.converged ? `convergence` : `the ${n(t.escRounds)}-round bound WITHOUT converging`} with ` +
        `the partner list widened to ${n(esc.pairK)} — ${n(esc.rounds)} swap round(s) in total, which ` +
        (num(esc.improvedTo) > num(esc.improvedFrom)
          ? `lifted the weakest face from ${n(esc.improvedFrom)} to ${n(esc.improvedTo)}`
          : `found nothing better than the ${n(esc.improvedFrom)} the cheap search had already settled ` +
            `on`) +
        `. That escalation runs precisely because the room was about to make this declaration`
      : ` for 3 rounds on the winner (partner list ${n(t.pairK)})`;
    // The heading and the contrast clause both depend on whether there is a
    // shipped reading above them to be different FROM. Saying "a different wall
    // from the one above" when nothing is above is the same species of untrue
    // sentence as everything else this module deletes, so it is derived rather
    // than typed once and left to rot.
    const l3Intro = !b
      ? `THE SEARCH THAT CHOSE THIS BATTERY, measured over the ${n(t.declaredCutTiles)}-tile cut layer 2 ` +
        `handed layer 3 — which is the only wall this paragraph has, because the as-shipped block is ` +
        `not attached yet. `
      : `THE SEARCH THAT CHOSE THIS BATTERY, measured over the ${n(t.declaredCutTiles)}-tile cut layer 2 ` +
        `handed layer 3, which is a DIFFERENT WALL from the one above and is not restated to agree with ` +
        `it. ` +
        (l3Bits.length
          ? `At that layer, ${l3Bits.join("; ")}. `
          : `At that layer the battery crossed neither line over the cut it was given, so the trigger ` +
            `for this declaration is entirely a later layer's reading. `);
    search =
      l3Intro +
      repairText +
      `The search that produced it: ${n(t.candidates)} legal seat(s) offered in this room ` +
      `(depth >= ${n(t.depthSafe)}, refill walk <= ${n(t.refillCap)}), the six chosen spread to a radius ` +
      `of ${n(t.spreadRadius)} to cover a ${n(t.declaredCutTiles)}-tile shell, average face damage ` +
      `${n(t.avgShellDmg)}. Refill walks at placement, nearest first: ${dstr(t.refillDists)}. ` +
      `WHAT WAS SEARCHED (this is a bounded hill-climb over ${n(t.candidates)} seats, not a proof of ` +
      `optimality): greedy from ${n(t.starts)} distinct start(s), each descended by single-slot steepest ` +
      `descent to a local optimum, then pairwise ejection${escText}. No set the search REACHED covers ` +
      `this shell better inside falloff range (150 damage past chebyshev 20); the room is long or ` +
      `two-lobed, and this is the price. `;
  }

  // ------------------------------------------------------------------
  // AUDITED. The short list the validator re-derives from terrain and the
  // shipped structure lists — and the sentence that says this paragraph has no
  // freedom to disagree with it.
  // ------------------------------------------------------------------
  const audited = b
    ? `AUDITED FACTS, re-derivable and therefore generated from the record rather than typed beside it: ` +
      `the furthest tower refill walk on the shipped board is ${n(b.maxRefill)}, the whole walk is ` +
      `${dstr(b.refillDists)}, and the wall this room ships is ${n(b.cutTiles)} cut ` +
      `${plural(b.cutTiles, "tile", "tiles")} whose weakest takes ${n(b.minShellDmg)} damage and whose ` +
      `average is ${n(b.avgShellDmg)}. Every one of those is re-derived by the validator from terrain and ` +
      `the shipped structure lists, and this paragraph is generated from that record by one function the ` +
      `validator also runs, so it cannot say anything the record does not.`
    : `NOT YET AUDITED: this paragraph is layer 3's reading alone. The as-shipped block is attached at ` +
      `finalizeRoom, after the prune, the seal reconciliation and the whole structure mass are final, and ` +
      `this text is regenerated from it there.`;

  return opener + shipped + built + search + audited;
}

/**
 * ---------------------------------------------------------------------------
 * towers|clump
 * ---------------------------------------------------------------------------
 * Two records again, same split and for the same reason:
 *
 *   `sf.clump`      — the AS-SHIPPED huddle: `{within, total, cheb, sitter,
 *                     note}`, re-derived tile by tile at finalizeRoom and
 *                     re-derived AGAIN by the validator off the shipped tower
 *                     list. This is the reading of record.
 *   `sf.dispersion` — LAYER 3's record: what it read on its own board, what the
 *                     non-worsening dispersion post-pass tried, and what it
 *                     took the worst 5x5 window from and to.
 *
 * The "did it move" sentence used to be chosen by `nukeSearch.improvedBy > 0`,
 * a counter the producer set beside a paragraph it also wrote. It is now
 * re-derived by comparing the before and after windows that the record itself
 * publishes, so a room cannot claim it moved while shipping two equal numbers —
 * which is precisely the pairing the round-8 finding was about: six rooms put
 * five of six towers in one huddle and every one of them reported `before ==
 * after` while the prose said the pass had run.
 */
export function renderClump(sf) {
  const c = sf.clump && Number.isFinite(num(sf.clump.within)) ? sf.clump : null;
  const d = sf.dispersion && Number.isFinite(num(sf.dispersion.windowBefore)) ? sf.dispersion : null;

  if (!c) {
    return (
      `THIS CLUMP DECLARATION CARRIES NO RECORD. There is no \`clump\` block on this entry — no count, no ` +
      `total and no sitter — so there is nothing to generate a paragraph from and nothing for a reader to ` +
      `check. An unbacked declaration is an excuse, and it is printed as one.`
    );
  }

  // THE NOTE LINE, RE-DERIVED. Five of six, not four: 93 of 172 rooms hold 3 of
  // 6 inside chebyshev 2 and 34 hold 4, and at those densities the shape is the
  // interior rather than a choice. Whether THIS room is over the line is a
  // comparison of the record's own two numbers, not a flag.
  const over = Number.isFinite(num(c.note)) && num(c.within) >= num(c.note);
  const lineText = !Number.isFinite(num(c.note))
    ? `This record does not carry the line this channel speaks at, so whether the huddle is over it ` +
      `cannot be derived here and is not asserted. `
    : over
      ? `That is at or over the ${n(c.note)}-tower line this channel speaks at — three and four of six ` +
        `are the shape of the interior rather than a choice, and a channel that fires on those is noise ` +
        `competing with the eco and mobility declarations for the same reader. `
      : `That is UNDER the ${n(c.note)}-tower line this channel speaks at` +
        (d && Number.isFinite(num(d.withinAtLayer3))
          ? `: layer 3 read ${n(d.withinAtLayer3)} of ${n(d.totalAtLayer3)} on its own board and declared, ` +
            `and a later layer moved a tower. The declaration stands, because deleting a record when the ` +
            `number improves is how a record stops being one. `
          : `, and this entry does not carry the earlier reading that triggered it. `);

  const searchText = d
    ? `THE DISPERSION POST-PASS, AND WHAT IT WAS ALLOWED TO SPEND: it is a strictly non-worsening swap ` +
      `search — the weakest wall face and the saturation are compared EXACTLY, and only the tie-break may ` +
      `move, by at most one ${n(d.tiebreakBudget)}-point damage step, which is the granularity tower ` +
      `damage lands in anyway. On this room it ran ${n((d.search || {}).rounds)} single-swap round(s) over ` +
      `${n((d.search || {}).singleSwapsTried)} candidate swap(s), of which ` +
      `${n((d.search || {}).singleSwapsScoreTied)} were score-tied and therefore legal to take, plus ` +
      `${n((d.search || {}).pairSwapsTried)} two-slot swap(s) ` +
      `(${n((d.search || {}).pairSwapsScoreTied)} score-tied) for the clumps no single tower can leave ` +
      `alone. It took the fullest 5x5 window from ${n(d.windowBefore)} to ${n(d.windowAfter)} over this ` +
      `layer's own set (${(d.counted || []).join(" / ") || "?"} — the nuker does not exist yet, and the ` +
      `true window is recomputed after layer 5 over a set that includes it). ` +
      // RE-DERIVED, not read off a counter the producer also wrote the prose from.
      (num(d.windowBefore) > num(d.windowAfter)
        ? `The room DID move: ${num(d.windowBefore) - num(d.windowAfter)} structure(s) came off the ` +
          `fullest window, and the huddle above is what was left once the price was paid. `
        : `NOTHING MOVED: every legal swap either left the window where it was or cost the wall damage, ` +
          `and buying dispersion with the weakest face is the one trade this layer may not make. The ` +
          `battery is where the wall put it. `)
    : `NO DISPERSION RECORD IS ATTACHED to this entry, so what the post-pass tried on this room cannot be ` +
      `stated here. "I looked and there was nothing" is a claim about a search, and a claim about a ` +
      `search with no counters behind it is not made. `;

  return (
    `A SINGLE NUKE IS CHEAPEST AGAINST A HUDDLE: ${n(c.within)} of ${n(c.total)} ` +
    `${plural(c.total, "tower", "towers")} stand within chebyshev ${n(c.cheb)} of the sitter ` +
    `${pt(c.sitter)} on the board this room ships (${pts(sf.tiles) || "no tiles named"}). A nuke does full ` +
    `damage over a 5x5 and half over an 11x11, it cannot be shot down, and the only counter is a rampart ` +
    `thick enough to eat it — so six towers inside one such window is one landing away from a room with ` +
    `no battery at all. ${lineText}${searchText}` +
    `AUDITED FACTS, re-derivable and therefore generated from the record rather than typed beside it: ` +
    `${n(c.within)} of ${n(c.total)} ${plural(c.total, "tower", "towers")} are within chebyshev ` +
    `${n(c.cheb)} of the sitter ${pt(c.sitter)} on the board this room ships — re-derived by the ` +
    `validator, tile by tile, off the shipped tower list, and this paragraph is generated from that ` +
    `record by one function the validator also runs, so it cannot say anything the record does not.`
  );
}

export { n, plural };

/**
 * ---------------------------------------------------------------------------
 * towerRefill| — the HARD limit, as opposed to the soft one above.
 * ---------------------------------------------------------------------------
 * `towers|weak-battery` is the band between "legal" and "good". This is what
 * fires when the room is not even legal: the furthest tower is past MAX_REFILL
 * walk from the sitter and the room has no six deep tiles that would fix it.
 *
 * It is the shortest paragraph in the channel, and it was the last one still
 * hand-written — which is exactly how E2S8 came to pass a reviewer's rewrite of
 * "11 walk" to "3 walk", a number INSIDE the limit the same sentence quotes.
 * Two numerals, both from the record, neither of them typed beside it.
 */
export function renderTowerRefill(sf) {
  const r = sf.towerRefill || {};
  return (
    `furthest tower is ${n(r.maxRefill)} walk from the sitter (want <= ${n(r.cap)}); ` +
    `the room has no six legal deep tiles inside that radius`
  );
}
