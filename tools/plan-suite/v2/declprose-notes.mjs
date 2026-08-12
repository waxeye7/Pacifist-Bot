/**
 * ===========================================================================
 * THE PLANNER-NOTE RENDERERS — the last hand-written prose channel, closed.
 * ===========================================================================
 *
 * Round 13 moved the DECLARATION paragraphs into `declprose*.mjs`: a shortfall
 * carries a structured record, the sentence is generated from that record, and
 * the validator re-renders and demands string equality. Round 15 did the same
 * for `mobility.negotiated`. `meta.notes` was the one channel left where a
 * layer typed a paragraph directly into an array, and the round-16 mechanical
 * review took it apart in the way that predicts:
 *
 *   · a note whose HEADING nothing recognises passes (200 fabricated
 *     "PERFECT ROOM" notes shipped clean),
 *   · a true note with a lie appended to the end passes,
 *   · a note with its prose REVERSED but its numerals kept passes,
 *   · a note with one tile of a named ring swapped passes.
 *
 * Every one of those is the same hole: the checks were anchored regexes over
 * free text, so anything outside the anchors was unexamined. Regexes cannot be
 * made complete over prose. Rendering can.
 *
 * So this module is the closed class inventory. A note is a `{cls, rec}` pair;
 * `renderNote` turns the pair into the exact string the room publishes, and
 * NOTHING else may write into `plan.meta.notes`. A room's notes and its
 * `meta.noteRecords` are parallel arrays by construction (`pushNote` writes
 * both, in the same call), so the validator's gate is three lines: every class
 * is in `NOTE_CLASSES`, the two arrays are the same length, and
 * `renderNote(rec[i]) === notes[i]` byte for byte. Appended lies, reversed
 * prose, fabricated classes and swapped tiles all stop existing rather than
 * being hunted.
 *
 * THE RULE FOR A RENDERER IN HERE: it reads its record and nothing else. No
 * plan, no terrain, no module-level mutable state. If a sentence wants a
 * number, that number is a field of the record — which is what makes the
 * record, and not the paragraph, the thing a reviewer argues with.
 */
import { renderCutReason } from "./declprose.mjs";

const round2 = (v) => Math.round(v * 100) / 100;
/**
 * AN UPKEEP FIGURE ROUNDED TO NOTHING IS A FIGURE THAT SAYS THE COST IS FREE
 * (O10, round 19). Road decay is 0.001 e/tick per tile, so `round2` printed the
 * container-road note's whole cost as "0 e/tick" — a paragraph whose entire
 * point is that the tiles are cheap, saying instead that they are free. Three
 * decimals is the resolution of the quantity being described (a road tile), so
 * that is the resolution the sentence is written at; trailing zeros go, because
 * "0.09" and "0.090" are the same number and only one of them reads like a
 * measurement.
 */
const eTick = (v) => String(Math.round(v * 1000) / 1000);
const xy = (t) => `${t.x},${t.y}`;
const plural = (v, one, many) => (Number(v) === 1 ? one : many);

// ---------------------------------------------------------------------------
// SEALED INTERIOR FLOOR
// ---------------------------------------------------------------------------
/**
 * The reachability sentence is measured with the OWN-CREEP flood over the whole
 * board (see `ownCreepWalk` in layer-shell), not with the defended-region flood.
 * Round 16: E12S7 published seven "cannot be reached" tiles of which six are 53
 * steps away with 32 of those steps outside the wall — our own ramparts are
 * passable to our own creeps, so a hauler may leave the wall and re-enter. The
 * sentence now says which flood it means, because the distinction is the whole
 * content of the claim.
 */
function renderSealedFloor(r) {
  return (
    `SEALED INTERIOR FLOOR: ${r.tiles} tile(s) sit inside the wall, carry nothing, and cannot be ` +
    `reached by an own creep from the sitter AT ALL — not inside the wall, and not by walking OUT ` +
    `through our own ramparts, round the outside and back in, which is a route our own creeps may ` +
    `take and which this measurement allows them ` +
    `(${r.named.map(xy).join(" ")}${r.tiles > r.named.length ? " …" : ""}). ` +
    `${r.deep} of them are deep (>= ${r.depthSafe}) and inside the buildable band, i.e. floor the ` +
    `program could have used; this room ships ${r.shallowStructs} shallow extension(s). ` +
    `${r.ourFault} of the ${r.tiles} come back if OUR OWN blocking structures are removed and the ` +
    `enclosure is left as it is — that is the ceiling on what any re-ordering inside the placement ` +
    `layers could recover, and the remaining ${r.tiles - r.ourFault} are the enclosure's shape, which ` +
    `no ordering reaches. ` +
    // O3 (round 17): the ceiling above was published for two rounds with nothing
    // asking how close ONE move gets to it. It is per-POCKET and per-STRUCTURE
    // now, priced by deleting each candidate and re-flooding — see
    // counterfactualBasis on the record.
    `AND HOW MUCH OF IT IS ONE STRUCTURE: the seal is ${r.pocketCount} ` +
    `${plural(r.pocketCount, "pocket", "pockets")}, and removing the single best-placed structure ` +
    `on each pocket's boundary returns ${r.singleStructureTiles} of the ${r.tiles} ` +
    `(${r.singleStructureDeep} of the ${r.deep} deep). ` +
    r.pockets
      .map(
        (p) =>
          `${xy(p.at)}+${p.tiles - 1} (${p.deep} deep) is behind ` +
          (p.best
            ? `${p.holders.length} ${plural(p.holders.length, "structure", "structures")}, any one of ` +
              `which returns ${p.best.recovers}: ` +
              p.holders
                .slice(0, 6)
                .map((h) => `${h.type} ${xy(h)}=${h.recovers}/${h.recoversDeep}`)
                .join(", ") +
              (p.holders.length > 6 ? ` …` : ``)
            : `no single structure of ours — this pocket is the enclosure's own shape`),
      )
      .join(" · ") +
    `.`
  );
}

// ---------------------------------------------------------------------------
// THE SEALED-FLOOR RECOVERY — TAKEN, OR REFUSED WITH THE CANDIDATES NAMED
// ---------------------------------------------------------------------------
/**
 * OF3 (round 18): the recovery pass had NO reader channel at all.
 *
 * `maybeTakeSealedRecovery` re-composes the room with a seat withdrawn, and in
 * every room whose record below reads `outcome: "taken"` it REPLACED the shipped
 * plan — a structure moved, a pocket of deep floor handed back — with the only
 * trace a `meta.sealedRecovery`
 * object nothing rendered. No declaration, no note, no gallery line, no film
 * caption. A pass that silently edits the board it ships is the same defect as a
 * cap that silently truncates its own search (OF1 above): the room stops being
 * able to say what it did.
 *
 * Worse for the refusals. "Every candidate above was re-composed and the panel
 * refused it" was a sentence in a JSON field, and in E11S7 it was false — three
 * of eight holders were tried. A refusal a reader cannot see is a refusal nobody
 * can check, so this note publishes BOTH branches and, on the refusal branch,
 * the candidate census the honesty of the sentence depends on: how many movable
 * holders the room's pockets have between them, how many were composed (all of
 * them), and the instrument that refused each one.
 *
 * O1 (round 19) widened both branches from a pocket to the BOARD. The admission
 * test was the best per-pocket counterfactual and the gain is measured board-wide,
 * so a refusal could be true of the pocket it named and false of the room it was
 * printed in. Every sentence here now names the room's whole seal, the pockets a
 * take actually opened are read off the after board, and the only refusal made
 * without composing anything quotes a ceiling that cannot be wrong.
 *
 * OM1 (round 20) widened the CANDIDATES from the pocket holders to every movable
 * seat the room ships. So the census this paragraph publishes changed shape with
 * it: "how many movable holders the pockets have between them" is now one number
 * inside a larger one — the seats the counterfactual points at, out of the seats
 * that were actually composed — and the per-candidate list says of each seat
 * whether it stood beside a pocket at all. A refusal that means "every seat in
 * the room" is a stronger sentence than one that meant "every seat beside a
 * pocket", and it is the sentence this pass can now honestly make.
 *
 * OL5 (round 20) made the pass run to a fixpoint, so a record can carry a `next`
 * — the run that judged the board this take produced. This renderer recurses on
 * it, which is why a take's paragraph can be followed by a refusal's: they are
 * two runs of one pass over two boards, and the room shipped the second.
 *
 * Rendered from `meta.sealedRecovery` and nothing else, like every renderer in
 * this file. `outcome` is the record's own branch tag, so the paragraph shape is
 * a field of the record rather than a guess made from which keys happen to be
 * present.
 */
function renderSealedRecovery(r) {
  return renderSealedRecoveryRun(r) + renderSealedRecoveryTail(r);
}
/**
 * The residual the take left, and the run that judged it (OL5, round 20).
 *
 * Every take says what its OWN re-composed board still seals and whether that
 * was enough to run the pass again — the two halves of a fixpoint claim. A room
 * that took six deep tiles back and left four behind used to publish the four
 * under a SEALED INTERIOR FLOOR note calling them "the ceiling on what any
 * re-ordering inside the placement layers could recover", with nothing anywhere
 * having attempted them.
 */
function renderSealedRecoveryTail(r) {
  let out = "";
  if (r.residual) {
    out +=
      ` THE PASS RUNS TO A FIXPOINT (OL5): ${r.residual.why}.` +
      (r.residual.reran ? `` : ` No further run was needed here.`);
  }
  if (r.next) {
    out +=
      ` AND THEN, ON THE BOARD THIS TAKE PRODUCED — the same pass, run again with the withdrawal above ` +
      `held, so this second answer is about the board the room actually ships: ` +
      renderSealedRecovery(r.next);
  }
  return out;
}
/**
 * OBLIGATION (ii) OF THE ROUND-21 RULING (criticism 95).
 *
 * The ruling that made a room's DECLARED quantities keys in its own tie-breaks
 * ships with three obligations, and this is the reader-facing one: a tie-break
 * a declared quantity actually DECIDED has to say so, name the candidate the
 * pass would otherwise have taken, and give the margin on BOTH axes — the
 * declared one the winner won and the priced one it paid. A rule you only hear
 * about when it flatters the board is not a rule, and a rule you never hear
 * about at all is a preference with better lawyers.
 *
 * Rendered from `record.decidedBy`, which the pass writes only when the rule
 * changed the pick — see DECLARED_KEY_RULE in pipeline.mjs. The runner-up there
 * is the winner under the pass's OWN pre-ruling order, so this sentence is a
 * counterfactual the record carries rather than one the prose invents.
 */
const DECLARED_INSTRUMENT_PROSE = {
  lap: "its as-built gated defender lap",
  shallowExts: "how many of its sixty extensions stand shallower than the safe depth",
  refill: "the furthest of its per-tower filler walks",
  clump: "how many towers stand within chebyshev 2 of the sitter",
  offNetwork: "the owned structures its own road network does not reach",
};
function declaredDecided(r) {
  const db = r.decidedBy;
  if (!db) return "";
  const what = DECLARED_INSTRUMENT_PROSE[db.instrument] || `\`${db.instrument}\``;
  const gap = Math.abs(db.margin.declared);
  const price = db.margin.priced;
  const step = (v) => (v === null || v === undefined ? "not measured" : v > 0 ? `+${v}` : `${v}`);
  return (
    ` A DECLARED QUANTITY DECIDED THIS TIE-BREAK (round 21, the RULING on criticism 95) — which is a ` +
    `DIFFERENT question from the one just answered, and the two can both be true: the sentence above ` +
    `names what separated the winner from the candidate that came SECOND under the rule, and this one ` +
    `says the rule changed WHICH CANDIDATE WON AT ALL. This room ` +
    `DECLARES ${what} — \`${db.source}\` = ${db.declared}, filed in meta.shortfalls on the board this ` +
    `pass judged — and a quantity a room has to publish is a KEY in that room's tie-breaks: ranked ` +
    `immediately after the pass's admission quantities, ahead of every priced preference, and never a ` +
    `veto over what gets in. WITHOUT IT this pass would have taken the ${db.runnerUp.kind} seat at ` +
    `${xy(db.runnerUp.withdrawn)}, which ties this one on both admission quantities ` +
    `(${db.tiedOn.gainedDeep} deep tile(s) back, ${db.tiedOn.gainedTiles} in total) and beats it on ` +
    `the price: extension tour ${step(db.runnerUp.extTourDelta)} steps against this seat's ` +
    `${step(db.taken.extTourDelta)}. It loses on the declared one: ${db.instrument} ` +
    `${db.runnerUp.value} against ${db.taken.value}, a margin of ${gap} ` +
    `(${db.direction === "up" ? "more" : "less"} is better). ` +
    (price > 0
      ? `So this room pays ${price} step(s) of a filler tour that nothing outside this record reads, ` +
        `to keep ${gap} of a number it has to stand behind in front of every reader of its own ` +
        `declaration channel. `
      : `The two are level on the filler tour and the priced order separated them further down it, on ` +
        `interior, then face, then raster. `) +
    `Both margins are on \`decidedBy\` — the declared axis and the priced one — because a decision ` +
    `published only on the axis it won is a decision the reader cannot argue with.`
  );
}
/**
 * OM5 (round 22) — THE SENTENCE THAT NAMES WHAT ACTUALLY DECIDED.
 *
 * The winning paragraph recited the room's declared quantities inside the
 * clause that explains the win — "this seat won the published tie-break: largest
 * deep recovery, then ..., then THIS ROOM'S DECLARED QUANTITIES (lap, declared
 * at 9.33 by `mobility.metric.maxGated`), then the cheapest panel ... — ahead of
 * 15,8 24,20" — which is a true description of the ORDER and reads, to anybody
 * who is not holding the record, as the REASON. In eleven of this fleet's twelve
 * takes the key that actually discriminated was named nowhere; in three of them
 * no tie-break ran at all, because exactly one candidate cleared the panel, and
 * the room still recited the keys.
 *
 * So the note names the decider, from `record.decider` — derived by the pass by
 * walking its own published `ranking` against the candidate it placed second and
 * naming the first key the two differ on. It is allowed to say the unflattering
 * answers, and it says them in the same words the record does: "raster order"
 * means every ranked key tied, and "no tie-break ran" means there was nothing to
 * rank. The "ahead of" list stays — it is a different fact (who else cleared the
 * panel) and worth having.
 */
function decidedSentence(r) {
  const dd = r.decider;
  if (!dd) return "";
  if (dd.key === "single-candidate") {
    return (
      ` WHAT DECIDED IT (OM5): nothing did — no tie-break ran here. Exactly one candidate cleared the ` +
      `panel, so not one of the ranked keys above was ever read, and this room's declared quantities ` +
      `did not pick this one: there was nothing to pick it against. The ranking is published anyway ` +
      `because it is a property of the board this pass judged and not of the answer it reached.`
    );
  }
  const who = dd.runnerUp
    ? dd.runnerUp.withdrawn
      ? `the ${dd.runnerUp.kind} seat at ${xy(dd.runnerUp.withdrawn)}`
      : `${xy(dd.runnerUp.from)} -> ${xy(dd.runnerUp.to)} (${dd.runnerUp.why})`
    : `the runner-up`;
  const tail =
    ` It is key ${dd.rank + 1} of this record's published \`ranking\` and it is the FIRST key the two ` +
    `differ on, so every key ranked above it — including this room's declared quantities, where it has ` +
    `any — is TIED between them and decided nothing here.`;
  if (dd.key === "raster") {
    return (
      ` WHAT DECIDED IT (OM5): ${dd.label}. ${dd.candidates} candidates cleared the panel and this one ` +
      `and ${who} are level on every ranked key there is, so the pick came down to reading order: ` +
      `${dd.values.taken} comes before ${dd.values.runnerUp}. That is not a reason, it is a ` +
      `tie-break of last resort, and the room says so rather than letting the recital of its declared ` +
      `quantities stand in for one.`
    );
  }
  return (
    ` WHAT DECIDED IT (OM5): ${dd.label} — this one reads ${dd.values.taken}, ${who} reads ` +
    `${dd.values.runnerUp}.` +
    tail
  );
}
/**
 * OM2 (round 22) — THE TOWER-SWAP PASS GETS A READER CHANNEL.
 *
 * `maybeTakeTowerSwap` MOVES A TOWER on the shipped board — three rooms in this
 * fleet — and it was invisible in every channel a reader has. The film's towers
 * stage captions the tile the swap moved the tower TO as layer 3's own set-cover
 * pick and never paints the tile it came from; no declaration mentions the pass;
 * two of the four rooms it runs in ship ZERO notes and an empty
 * `meta.noteObligations`. The obligation machinery had a class for
 * `sealedRecovery` and no class for this pass at all, so the record was not only
 * unspoken, it was deletable: withdrawing `meta.towers.acrossPriorTake` from a
 * room whose `towerSwapTaken` still says a tower moved passed 172/172.
 *
 * Both branches ship, for the same reason the recovery's do: a priced REFUSAL is
 * as much a decision as a take, and E3S1's — a lift of one falloff step on one
 * cut tile, refused because it would have pushed a third tower over the 8-step
 * line the room DECLARES at — is the better paragraph of the two.
 *
 * Rendered from `meta.towers.acrossPriorTake` and nothing else.
 */
function renderTowerSwap(r) {
  const panel = (b, a) =>
    `the weakest cut face ${b.face} -> ${a.face}, the towers within chebyshev 2 of the sitter ` +
    `${b.clump} -> ${a.clump}, the filler's per-tower walks ${(b.refillWalks || []).join("/")} -> ` +
    `${(a.refillWalks || []).join("/")} (total ${b.refillTotal} -> ${a.refillTotal}), the interior walk ` +
    `${b.interior} -> ${a.interior}, the as-built gated lap ${b.lap} -> ${a.lap}`;
  // ------------------------------------------------------------------
  // OM3 (round 23) — THE TENSE, BECAUSE THE PARAGRAPH CONTRADICTED ITSELF.
  //
  // `declaredKeys` is documented as the PRE-TAKE declaration set: the quantities
  // the room was publishing on the board this pass judged. This sentence
  // rendered it in the PRESENT — "This room DECLARES clump (towers/clump,
  // `towers/clump.clump.within` = 5)" — forty words after the same note said the
  // take "RETIRES the room's clump declaration ... and 4 stand there now".
  // E14S1 and E3S5 ship both sentences; their shipped `meta.shortfalls` is
  // ["misc/off-network"] and carries no clump entry at all, so the present-tense
  // half is simply false about the room the reader is looking at.
  //
  // The fix is not a hedge, it is the tense the record already justifies: these
  // were the keys ON THE PRE-TAKE BOARD, and where the take retired one, the
  // note says which one and what the room files now. E4S3 gets the other half of
  // the same honesty — it declares `eco`, the record's own `declaredSkipped`
  // says why the panel cannot rank on it, and the renderer used to drop that on
  // the floor and print a list the reader could not reconcile with the room's
  // two shipped declarations.
  // ------------------------------------------------------------------
  const retired = (r.declaredKeys || []).filter(
    (k) => r.retiresClumpDeclaration && k.gate === "towers" && k.kind === "clump",
  );
  const kept = (r.declaredKeys || []).filter((k) => !retired.includes(k));
  const keyText = (k) => `${k.instrument} (${k.gate}${k.kind ? `/${k.kind}` : ``}, \`${k.source}\` = ${k.declared})`;
  const skipped = (r.declaredSkipped || []).length
    ? `It files ${r.declaredSkipped
        .map((s) => `\`${s.gate}${s.kind ? `/${s.kind}` : ``}\``)
        .join(" and ")} as well, and ${plural(r.declaredSkipped.length, "that one is", "those are")} NOT a ` +
      `key here: ${r.declaredSkipped.map((s) => s.why).join(" · ")}. `
    : ``;
  const keys = (r.declaredKeys || []).length
    ? `ON THE BOARD THIS PASS JUDGED — before the take, which is the board a tie-break is decided on — ` +
      `this room DECLARED ${r.declaredKeys.map(keyText).join(" and ")}, and every one of those is a KEY ` +
      `in this tie-break ahead of the offer order — round 21's RULING on criticism 95, stated in full ` +
      `under \`declaredKeyRule\`. ` +
      (retired.length
        ? `\`declaredKeys\` on this record is therefore the PRE-TAKE set and not what the room ships: the ` +
          `take RETIRED ${retired.map((k) => `\`${k.gate}/${k.kind}\``).join(" and ")}, so the shipped ` +
          `\`meta.shortfalls\` files ${
            kept.length ? kept.map((k) => `\`${k.gate}${k.kind ? `/${k.kind}` : ``}\``).join(" and ") : `none of them`
          } and no longer files ${plural(retired.length, "it", "them")} at all. `
        : ``) +
      skipped
    : `This room declares no quantity this pass's panel measures, so no declared key applies here. ` + skipped;
  if (r.taken) {
    const t = r.taken;
    const bought = r.retiresClumpDeclaration
      ? `it RETIRES the room's clump declaration: ${r.before.clump} towers stood within chebyshev 2 of ` +
        `the sitter, which is at the ${r.clumpNote} line the declaration fires at, and ${r.after.clump} ` +
        `stand there now`
      : `it LIFTS the weakest cut face, ${r.before.face} -> ${r.after.face} damage on the thinnest tile ` +
        `of the wall`;
    return (
      `TOWER MOVED ACROSS THE PRIOR: this room moved a tower from ${xy(t.from)} to ${xy(t.to)} AFTER ` +
      `layer 3 had finished — the tile at ${xy(t.to)} is this pass's pick and not the set-cover's — and ` +
      `${bought}. The room was RE-COMPOSED from layer 1 with the swap held (opts.takeTowerSwap, applied ` +
      `inside layer 3 after every one of its own searches has run) and finalized, so both panels are ` +
      `read off FINISHED boards: ${panel(r.before, r.after)}. Every instrument holds — a swap that ` +
      `moved one the wrong way would have been refused whatever it bought. ` +
      `${r.offered.length} ${plural(r.offered.length, "offer was", "offers were")} composed and priced, ` +
      `${r.accepted} cleared the panel` +
      ((r.offered || []).filter((o) => o.verdict !== "TAKEN").length
        ? `, and the ${plural(r.offered.length - 1, "other", "others")} ${(r.offered || [])
            .filter((o) => o.verdict !== "TAKEN")
            .map((o) => `${xy(o.from)} -> ${xy(o.to)} (${o.verdict})`)
            .join("; ")}`
        : ` — round 21: this pass used to take the first offer that cleared, so its offer order was ` +
          `deciding a tie-break with nothing published about it`) +
      `. ${keys.trimEnd()}` +
      decidedSentence(r) +
      declaredDecided(r)
    );
  }
  const refused = (r.offered || []).filter((o) => o.from);
  return (
    `A TOWER SWAP OFFERED AND REFUSED: this room composed ${refused.length} ` +
    `${plural(refused.length, "candidate swap", "candidate swaps")} that would have moved a tower after ` +
    `layer 3 had finished, and the finished board refused ` +
    `${plural(refused.length, "it", "every one of them")}: ` +
    refused.map((o) => `${xy(o.from)} -> ${xy(o.to)} (offered to ${o.why}) — ${o.verdict}`).join("; ") +
    `. The panel this room ships reads ${(r.before.refillWalks || []).join("/")} on the filler's ` +
    `per-tower walks (total ${r.before.refillTotal}, ${r.before.refillAtCap} at the hard cap, ` +
    `${r.before.refillOverNote} over the line a weak-battery declaration fires at), a weakest cut face ` +
    `of ${r.before.face} and ${r.before.clump} towers within chebyshev 2 of the sitter. ` +
    `${keys}Nothing reached the tie-break, so \`ranking\` and \`declaredKeys\` on this record describe ` +
    `the order this pass WOULD have used rather than one it ran — published anyway, because the ` +
    `derivation is a property of the board and not of the branch. This room ships the towers layer 3 ` +
    `chose, and the offer it turned down is on the record rather than absent from it.`
  );
}
/**
 * OL2 (round 22) — THE SEALING-CURVE AMENDMENT REACHES A READER.
 *
 * `meta.shell.closures` (OM6, round 21) measures, in every room, whether the
 * DECLARED CUT is a sealing curve on its own — and in two of them it is not.
 * The finding was published, correct and complete in the record, and it reached
 * no reader: the two rooms print the single-removal redundancy note whose blind
 * spot IS the finding ("no cut tile is redundant" is a one-at-a-time test, and a
 * hole plugged twice is invisible to a one-at-a-time test), and nothing anywhere
 * said the cut alone lets the flood in.
 *
 * Fires only where `needed` is true, because "the cut seals on its own" is the
 * uninteresting case and a note printed in 172 rooms to say nothing happened is
 * how a channel stops being read. Rendered from `meta.shell.closures`.
 */
function renderShellClosure(r) {
  const tiles = (r.tiles || []).map(xy).join(" ");
  const kinds = Object.entries(r.kinds || {})
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");
  const solo = (r.soloClosers || []).map(xy);
  return (
    `THE CUT IS NOT A SEALING CURVE ON ITS OWN HERE: blocked at meta.shell.cut and nothing else, the ` +
    `exterior flood walks into this room's garrison and reaches ${r.leaked} of the core structures ` +
    `standing in it. What closes the curve is the cut PLUS ${(r.tiles || []).length} rampart(s) outside ` +
    `it — ${tiles}${kinds ? ` (${kinds})` : ``} — and that set is MINIMAL, re-measured rather than ` +
    `asserted: drop any one of them and the flood walks back in. It is NOT the room's only closure. ` +
    `${(r.candidates || []).length} rampart(s) stand in the region the open cut lets the flood into, and ` +
    `${solo.length} of them close the curve SINGLE-HANDED (${solo.join(" ")}), so \`tiles\` is A ` +
    `minimal closure and not THE one — \`candidates\` and \`soloClosers\` are published beside it so the ` +
    `substitution is visible instead of implied. ` +
    `THIS IS WHY THE REDUNDANCY NOTE COULD NOT SEE IT. \`sealCritical\` asks whether a tile is ` +
    `NECESSARY — take it alone off the shipped wall and does the room open — and these tiles are ` +
    `individually SUFFICIENT and mutually redundant: removing any ONE opens nothing, removing ALL of ` +
    `them (which is what "the cut alone" means) opens the room. A one-at-a-time test cannot see a hole ` +
    `that is plugged twice, which is exactly how the published \`sealCritical ⊆ cut\` invariant holds ` +
    `over a curve with a hole in it. ` +
    `IT IS NOT A SAFETY DEFECT, and the difference matters: the flood over this room's WHOLE rampart ` +
    `set — the wall it actually ships, and the one the validator runs — leaks nothing at all. What is ` +
    `wrong is a DESCRIPTION. Every cut-shaped figure in this plan is computed as though the cut sealed ` +
    `by itself, and in this room it does not; the amendment is published per room so a reader of those ` +
    `figures knows which of the two curves they are reading.`
  );
}
function renderSealedRecoveryRun(r) {
  const deltaWord = (v) =>
    v === null || v === undefined ? "not measured" : v === 0 ? "unchanged" : v > 0 ? `+${v}` : `${v}`;
  const tourTaken =
    r.extTourBefore === null || r.extTourBefore === undefined
      ? ""
      : ` THE FILLER'S OTHER WALK, PRICED (OF6): the total extension tour — for each extension, the ` +
        `walk from the sitter across the finished interior to the tile the filler stands on to fill ` +
        `it, summed — reads ${r.extTourBefore} steps before and ${r.extTourAfter} after, ` +
        `${deltaWord(r.extTourDelta)} against a stated ceiling of ${r.tourSlack} extra steps. It is a ` +
        `price, not a veto: deep buildable floor handed back forever is worth a step of tour, and the ` +
        `number is published either way so the trade can be argued with rather than assumed free.`;
  const tourRefused =
    r.extTourBefore === null || r.extTourBefore === undefined
      ? ""
      : ` The extension tour this room ships is ${r.extTourBefore} steps and every candidate above was ` +
        `priced against it, with a ceiling of ${r.tourSlack} extra steps (OF6) — the walk the ` +
        `instrument panel could not see, now read on both boards.`;
  if (r.outcome === "taken") {
    const t = r.taken;
    // the ones that ALSO cleared the whole panel and lost on the tie-break —
    // not the refused ones, which are a different fact and are counted above
    const rivals = (r.offered || []).filter(
      (o) => o.withdrawn && o.verdict !== "TAKEN" && o.verdict.startsWith("accepted"),
    );
    // THE POCKETS THE WITHDRAWAL ACTUALLY OPENED, ALL OF THEM (O1, round 19).
    // This sentence used to name the one pocket the admission filter had ranked
    // first, so E7S2's four recovered tiles would have been reported as coming
    // "out of the pocket at 22,46 (3 tile(s), 3 deep)". A withdrawal re-seats
    // sixty extensions; which pockets fell open is a measurement on the after
    // board and the record carries it per pocket.
    const opened = t.pockets || [];
    const openedSum = opened.reduce((s, p) => s + p.recoveredTiles, 0);
    return (
      `SEALED FLOOR RECOVERED: this room withdrew the ${t.kind} seat at ${xy(t.withdrawn)} and was ` +
      `RE-COMPOSED from layer 1 without it, and the finished board gives back ${r.recoveredTiles} ` +
      `sealed tile(s), ${r.recoveredDeep} of them deep buildable floor, out of ` +
      `${opened.length} ${plural(opened.length, "pocket", "pockets")}: ` +
      opened
        .map(
          (p) =>
            `${xy(p.at)} (${p.tiles} tile(s), ${p.deep} deep) gave back ${p.recoveredTiles}` +
            (p.recoveredTiles === p.tiles ? ` — all of it` : ``),
        )
        .join(", ") +
      `. ` +
      (r.sealedNew
        ? `The re-composed board seals ${r.sealedNew} tile(s) that were not sealed before, so the net ` +
          `${r.recoveredTiles} is those ${openedSum} recovered less ${r.sealedNew} newly sealed — the ` +
          `pass is priced on the NET, never on the gross. `
        : `The re-composed board seals nothing that was not sealed before, so the net ` +
          `${r.recoveredTiles} is the whole of what those pockets gave back. `) +
      `The seat is WITHDRAWN, never teleported: the tile stopped being offered and the layer that ` +
      `owns it placed its mass again with the corridor open. ` +
      `Every instrument of the shipped-board panel holds — the weakest cut face ${r.before.face} -> ` +
      `${r.after.face}, the interior walk ${r.before.interior} -> ${r.after.interior}, the as-built ` +
      `gated lap ${r.before.lap} -> ${r.after.lap}, the sealed floor ${r.before.sealedTiles} -> ` +
      `${r.after.sealedTiles} (${r.before.sealedDeep} -> ${r.after.sealedDeep} deep) — measured on two ` +
      `FINISHED rooms rather than on a promise. ` +
      seatCensus(r) +
      ` EVERY one of them was re-composed from layer 1 and finalized — ${r.tried} ` +
      `${plural(r.tried, "composition", "compositions")}, never a prefix — and each was admitted or ` +
      `refused on the deep floor its own finished board hands back BOARD-WIDE (round 18: this pass used ` +
      `to try three holders in raster order and then report that every candidate had been examined; ` +
      `round 19: it used to admit on the best single-pocket counterfactual, which cannot see a ` +
      `withdrawal that opens two pockets at once; round 20: it used to PROPOSE only the seats standing ` +
      `beside a pocket, which cannot see that re-seating sixty extensions moves floor the withdrawn ` +
      `seat never touched). ` +
      (rivals.length
        ? `${r.accepted} of them cleared the whole panel and this seat won the published tie-break — ` +
          `largest deep recovery, then largest total recovery, then ` +
          ((r.declaredKeys || []).length
            ? `THIS ROOM'S DECLARED QUANTITIES in declaration order (${r.declaredKeys
                .map((k) => `${k.instrument}, declared at ${k.declared} by \`${k.source}\``)
                .join("; ")}), then `
            : ``) +
          `the cheapest panel (least extension tour, then most interior, then strongest face), then ` +
          `raster order — ahead of ${rivals.map((o) => xy(o.withdrawn)).join(" ")}.`
        : `It is the only one that cleared the whole panel.`) +
      decidedSentence(r) +
      declaredDecided(r) +
      tourTaken
    );
  }
  if (r.outcome === "belowThreshold") {
    return (
      `SEALED FLOOR NOT RECOVERED: this room's ENTIRE sealed floor is ${r.sealedTiles} tile(s), ` +
      `${r.sealedDeep} of them deep, across ${r.pockets.length} ` +
      `${plural(r.pockets.length, "pocket", "pockets")} ` +
      `(${r.pockets.map((p) => `${xy(p.at)} ${p.tiles}/${p.deep} deep`).join(", ")}) — fewer deep tiles ` +
      `than the ${r.threshold} this pass requires, so no withdrawal of any structure in this room can ` +
      `clear the threshold and none was composed. That is a CEILING ON THE BOARD, not a prediction ` +
      `about a pocket: the recovery is measured as the sealed deep floor before the withdrawal minus ` +
      `the sealed deep floor after it, and no room can give back more deep floor than it seals. ` +
      `(Round 19: this refusal used to read "no pocket in this room is held shut by a single structure ` +
      `returning ${r.threshold} or more DEEP tiles — the largest single-structure recovery here is ` +
      `${r.bestDeepAnywhere}", which is a statement about the per-structure counterfactual and was ` +
      `FALSE OF THE BOARD in the two rooms where withdrawing one seat re-seated the mass and opened a ` +
      `second pocket as well. That counterfactual is still measured and still published on ` +
      `meta.sealedFloor; it no longer decides anything.) The threshold is stated rather than tuned: a ` +
      `pocket of one or two tiles is not worth re-composing the room for, and a pass that fires on ` +
      `everything is a pass with no rule.`
    );
  }
  if (r.outcome === "fixedGeometry") {
    return (
      `SEALED FLOOR NOT RECOVERED: this room seals ${r.pockets.length} ` +
      `${plural(r.pockets.length, "pocket", "pockets")} ` +
      `(${r.pockets.map((p) => `${xy(p.at)} ${p.tiles}/${p.deep} deep`).join(", ")}) and ships NO seat ` +
      `this pass may withdraw — no ${r.kindsAttempted.join(" and no ")} — while its pockets are held by ` +
      `${(r.fixedHolders || []).map((h) => `${h.type} ${xy(h)}=${h.recovers}/${h.recoversDeep}`).join(", ")}. ` +
      `The two classes it does move are ${r.kindsAttempted.join(" and ")}: an extension because the ` +
      `mass is the flexible layer and the seal is its ordering, and the observer because its own ` +
      `placement rule is "the furthest leftover tile" and its position is irrelevant to what it does. ` +
      `A hub structure, a lab of the diamond, a tower or the nuker that is hauled 300k energy by hand ` +
      `is placed against a real constraint by its own layer, and "move it one tile" is not a bounded ` +
      `change to it. (Round 20: this branch used to fire when every HOLDER was fixed geometry, which ` +
      `stopped being a reason to refuse when the candidates became every movable seat — a seat that ` +
      `holds nothing can still open a pocket, because withdrawing it re-seats the whole mass.)`
    );
  }
  const tried = (r.offered || []).filter((o) => o.withdrawn);
  // the seal this room ships, summed off its own pocket inventory — the
  // refusal branch changes no board, so the pockets it was judged over are the
  // pockets it ships
  const sealedDeepNow = r.pockets.reduce((s, p) => s + p.deep, 0);
  return (
    `SEALED FLOOR NOT RECOVERED: this room seals ${r.pockets.length} ` +
    `${plural(r.pockets.length, "pocket", "pockets")} ` +
    `(${r.pockets.map((p) => `${xy(p.at)} ${p.tiles}/${p.deep} deep`).join(", ")}).` +
    seatCensus(r) +
    ` EVERY one of them was re-composed from layer 1 with the seat withdrawn and finalized — ` +
    `${r.tried} ${plural(r.tried, "composition", "compositions")}, never a prefix — each judged on the ` +
    `deep floor its own finished board hands back BOARD-WIDE (round 18: this pass used to try three ` +
    `holders in raster order and then report that every candidate had been refused; round 19: it used ` +
    `to look at one pocket's holders only; round 20: it used to propose only holders at all). ` +
    `Every seat, grouped by the instrument or the shortfall that refused it: ` +
    refusalGroups(r, tried) +
    `. This room ships the plan it would have shipped without this pass, and its ${sealedDeepNow} ` +
    `deep tile(s) stay sealed — priced, named and refused rather than unexamined.` +
    tourRefused
  );
}
/**
 * THE CANDIDATE CENSUS, IN THE SHAPE OM1 (round 20) GAVE IT.
 *
 * Two numbers, and the relationship between them is the whole point: the pass
 * composed every movable seat the room ships, and the per-structure
 * counterfactual — the thing that used to BE the candidate list — points at some
 * subset of them. Printing only the second is how "every candidate was refused"
 * came to mean "every candidate the counterfactual proposed".
 */
function seatCensus(r) {
  const seats = r.seats || {};
  const parts = Object.keys(seats).map((t) => `${seats[t]} ${t}`);
  // ------------------------------------------------------------------
  // OM2 (round 25) — THE PRE-TAKE BOARD, IN THE SHIPPED BOARD'S PRESENT TENSE.
  //
  // "The candidates are EVERY MOVABLE SEAT THIS ROOM SHIPS — 61 of them … of
  // which 3 stand D8 of one of ITS 2 pockets" is a sentence about a board that
  // no longer exists in every room where this pass took something: a withdrawal
  // re-composes the room from layer 1, so the seat inventory that was judged and
  // the pocket list it was judged against are both PRE-TAKE. Fleet-wide the
  // seat count is false for 114 seats and the pocket clause is false in 11 of
  // the 12 rooms — four of which assert pockets in the same paragraph that says
  // "sealed floor 4 -> 0", i.e. they ship no sealed floor at all.
  //
  // `towerSwap` had this exact finding one round earlier and states the tense it
  // means ("ON THE BOARD THIS PASS JUDGED — before the take, which is the board
  // a tie-break is decided on"). This is the same sentence in the same artifact,
  // so it is the same words: the census is of the board the decision was made
  // on, which is the only board a decision CAN be made on, and where that board
  // is not the shipped one the paragraph says so instead of leaving the reader
  // to reconcile it against a room that no longer looks like this.
  // ------------------------------------------------------------------
  const took = r.outcome === "taken";
  return (
    ` The candidates are EVERY MOVABLE SEAT ON THE BOARD THIS PASS JUDGED — ${r.candidates} of them` +
    (parts.length ? ` (${parts.join(" + ")})` : ``) +
    `, of which ${r.movableHolders ?? 0} stand D8 of one of that board's ` +
    `${r.pockets.length} ${plural(r.pockets.length, "pocket", "pockets")} and the rest hold nothing ` +
    `shut at all. ` +
    (took
      ? `THAT IS THE PRE-TAKE BOARD AND NOT WHAT THE ROOM SHIPS: the withdrawal this note records ` +
        `re-composed the room from layer 1, so both the seat inventory and the pocket list above are ` +
        `the ones the decision was taken against — read the panel deltas for what the room ships. `
      : `This run took nothing, so that board is also the one the room ships. `) +
    `Both are composed: a withdrawal re-seats the whole extension mass, so a seat that ` +
    `touches no pocket can still be the tile whose removal lets the mass flow into one.` +
    ((r.fixedHolders || []).length
      ? ` ${r.fixedHolders.length} further ${plural(r.fixedHolders.length, "holder", "holders")} ` +
        `${plural(r.fixedHolders.length, "is", "are")} fixed geometry and out of this pass's reach ` +
        `(${r.fixedHolders.map((h) => `${h.type} ${xy(h)}`).join(", ")}).`
      : ``)
  );
}
/**
 * EVERY SEAT NAMED, GROUPED BY WHY IT LOST (OM1, round 20).
 *
 * The refusal list used to be one clause per candidate, which was readable at
 * eight or ten candidates and is not at sixty-one. It is grouped instead of
 * truncated, deliberately: a list that drops entries to stay short is the
 * silently-truncated-search defect wearing a different hat. Every seat still
 * appears exactly once, under the reason its own finished board earned.
 */
function refusalGroups(r, tried) {
  const reasonOf = (o) => {
    const v = String(o.verdict || "");
    if (/did not produce a complete room/.test(v)) return "the re-composition did not produce a complete room";
    const m = /only recovers (-?\d+) deep/.exec(v);
    if (m) return `every instrument holds, ${m[1]} deep tile(s) back against a threshold of ${r.threshold}`;
    if (/filler's TOTAL extension tour/.test(v)) {
      return `every instrument holds and enough floor comes back, but the filler's total extension tour breaks its ${r.tourSlack}-step ceiling`;
    }
    return v.replace(/^refused: /, "");
  };
  const groups = new Map();
  for (const o of tried) {
    const k = reasonOf(o);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  return [...groups.entries()]
    .map(
      ([reason, list]) =>
        `${reason} — ${list.length} ${plural(list.length, "seat", "seats")}: ` +
        list
          .map((o) => `${o.kind} ${xy(o.withdrawn)}${o.holder ? ` (holder, counterfactual ${o.recoversDeep} deep)` : ``}`)
          .join(" · "),
    )
    .join("; ");
}

// ---------------------------------------------------------------------------
// CUT TILES THAT ARE NOT SINGLY LOAD-BEARING / NO CUT TILE IS REDUNDANT
// ---------------------------------------------------------------------------
function renderRedundantCut(r) {
  if (r.redundant === 0) {
    return (
      `NO CUT TILE IS REDUNDANT: every one of this room's ${r.cut} cut tile(s) is singly ` +
      `load-bearing — remove any one of them alone and the exterior flood reaches the sitter — and ` +
      `${r.inertPruned} further rampart(s) that were not already came off in layer 7's inert ` +
      `prune this run, re-run to a fixpoint on the board the room ships. There is no double shell here.`
    );
  }
  const lines = r.named.map(
    (e) => `${e.k} — ${e.reason ? renderCutReason(e.reason) : "held by an earlier layer's declared purpose"}`,
  );
  return (
    `CUT TILES THAT ARE NOT SINGLY LOAD-BEARING: ${r.redundant} of this room's ${r.cut} cut ` +
    `tile(s) can each be removed on their own without letting the exterior flood reach the sitter, and ` +
    `${r.inertPruned} more already were — layer 7's inert prune deleted them this run. The ` +
    `${r.redundant} that remain are NOT double shell and each one has a named reason, measured ` +
    `on the post-reflow board this room ships: ` +
    `${lines.join(" · ")}${r.redundant > r.named.length ? ` · …and ${r.redundant - r.named.length} more` : ""}. ` +
    `At ${round2(r.redundant * 0.03)} e/tick of forever-upkeep this is the price of the wall that ` +
    `holds floor the single-removal test cannot see it holding.`
  );
}

// ---------------------------------------------------------------------------
// ROAD LAID FOR A CONTAINER THAT IS NOT BUILT YET
// ---------------------------------------------------------------------------
/**
 * OM9 (round 23) — THE SENTENCE THAT NAMED THE WRONG BENEFICIARY.
 *
 * This note used to end on a string constant: "without these tiles the
 * controller container and the roads that serve it are orphaned for three whole
 * RCLs". True in E5S1 — the room the pass was written for — and FALSE in the
 * other two rooms that ship the note. E5S3's controller container (40,42) and
 * E2S5's (31,32) both stay connected without the added tile; what falls off
 * there is a spur running out past the mineral seat, serving no seat at all.
 * Same class as criticism 102's prose casualty: a sentence true of one room
 * shipped as a fact about every room.
 *
 * Nothing caught it because the clause had NO RECORD LEAF — outside
 * RECORD_LEAVES, outside the declared-key machinery, unreachable by any
 * mutation. `orphanedByRemoval` (layer-walls, at the pushNote) is that leaf: the
 * pre-RCL6 component recomputed with the added tiles deleted, the tiles that
 * fall off, the controller container and whether it is one of them. The sentence
 * below now states whichever of the two is true in the room it is printed in,
 * and prices the spend honestly in both — the road IS worth its 0.001 e/tick in
 * all three rooms, because a real piece of network does fall off; it is just not
 * always the controller's.
 */
function renderContainerRoad(r) {
  const o = r.orphanedByRemoval;
  const consequence = !o
    ? `and these tiles are what joins the two halves of it`
    : o.ctrlContainerOrphaned
      ? `and without these tiles THE CONTROLLER CONTAINER at ${xy(o.ctrlContainer)} and the rest of ` +
        `the ${o.tiles.length} tile(s) that fall off with it (${o.tiles.map(xy).join(" ")}) are orphaned ` +
        `for three whole RCLs`
      : o.tiles.length
        ? `and without these tiles ${o.tiles.length} tile(s) of this room's pre-RCL 6 network fall off ` +
          `(${o.tiles.map(xy).join(" ")}). THAT IS NOT THE CONTROLLER LANE — this room's controller ` +
          `container${o.ctrlContainer ? ` at ${xy(o.ctrlContainer)}` : ``} stays connected without them, ` +
          `and saying otherwise would be borrowing a sentence from a different room. What falls off is ` +
          `the spur that runs out past the mineral seat` +
          `${o.mineralSeat.length ? ` at ${o.mineralSeat.map(xy).join(" ")}` : ``}, and it serves ` +
          `${
            o.containersOrphaned.length
              ? `${o.containersOrphaned.length} container seat(s) (${o.containersOrphaned.map(xy).join(" ")})`
              : `no container seat at all`
          }` +
          `. The tiles are worth laying anyway — a real piece of network is a real piece of network — ` +
          `but the beneficiary is named rather than assumed`
        : `and nothing measurably falls off without these tiles: the removal test leaves the pre-RCL 6 ` +
          `component whole, so they buy staging tidiness and not a join`;
  return (
    `ROAD LAID FOR A CONTAINER THAT IS NOT BUILT YET: ${r.added.length} plain road tile(s) ` +
    `(${r.added.map(xy).join(" ")}) were added because this room's road ` +
    `network was joined THROUGH its mineral-seat container, and that container is deferred to ` +
    `RCL 6 (no extractor exists before then, so the box has nothing to fill it). Containers are ` +
    `network nodes — true at RCL 8, false at RCL 3 — ${consequence}` +
    `${o ? ` (${o.basis})` : ``}. The tiles are ` +
    `floor the base already walks, so the only cost is ${eTick(r.added.length * 0.001)} ` +
    `e/tick of road decay, against a staged network that does not connect.` +
    (r.sharing.length
      ? ` ${r.sharing.length} of them (${r.sharing.map(xy).join(" ")}) ` +
        `is the container's OWN tile: a road and a container legally share a square in this ` +
        `engine (only OBSTACLE_OBJECT_TYPES may not be doubled up, and a container is not one ` +
        `of them), so the road is built at RCL 3, conducts from RCL 3, and is still there ` +
        `when the box lands on top of it at RCL 6. Counting this one, this room ships ` +
        `${r.containersOnRoads} ` +
        `container tile(s) that carry a road.`
      : ``)
  );
}

// ---------------------------------------------------------------------------
// A PAVING GAP UNTIL RCL 6, NAMED
// ---------------------------------------------------------------------------
function renderPavingGap(r) {
  return (
    `A PAVING GAP UNTIL RCL 6, NAMED: ${r.stranded.length} road tile(s) ` +
    `(${r.stranded.map(xy).join(" ")}) join the rest of this room's ` +
    `network only across the mineral-seat container, which is not built until RCL 6, and the ` +
    `join CANNOT be paved — the tile(s) the route crosses ` +
    `(${r.gapTiles.map((t) => `${t.x},${t.y} (${t.holds})`).join(" ") || "none"}) each ` +
    `carry an OBSTACLE structure or are terrain wall, and no road may be built on those. ` +
    `A container is NOT one of them — road and container share a tile, so a bare container ` +
    `tile would simply have been paved above rather than named here. ` +
    `${r.footReachable ? "A CREEP CAN STILL WALK IT" : "NO WALK EXISTS AT ALL"}: containers ` +
    `and bare floor are not obstacles, so ` +
    `${r.footReachable ? `this costs one extra tick per crossing (2 ticks on plain instead of 1) until RCL 6 closes it, and nothing is unreachable` : `these tiles are genuinely cut off before RCL 6 and that is a real break, not a paving cost`}. ` +
    `It is named here because the guarantee this room is sold on is "0 staged orphans", and the ` +
    `honest version of that sentence has ${r.stranded.length} tile(s) in it.`
  );
}

// ---------------------------------------------------------------------------
// A PAVED RUN ALONG THE WALL, AND WHY IT IS STILL HERE
// ---------------------------------------------------------------------------
function renderPavedRun(r) {
  return (
    `A PAVED RUN ALONG THE WALL, AND WHY IT IS STILL HERE: this room ships ${r.runs.length} ` +
    `ramparted tile(s) that carry a road and have a D8 neighbour which is also a paved rampart ` +
    // "[bubble seat]" until round 26: the tag is set from the tile carrying a
    // CONTAINER, which is what it now says. Bubble membership is a different
    // fact and reading one off the other is the defect OB1 closed in the film.
    `(${r.runs.map((t) => `${t.x},${t.y}${t.onCut ? "" : t.seat ? "[container seat]" : "[off-cut rampart]"}`).join(" ")}). ` +
    `The roster is every road+rampart tile and not only the ones on the cut: a creep walking a ` +
    `prepared surface does not know which rampart class it is standing on. A single crossing is a ` +
    `gate and is fine; ` +
    `a RUN is a prepared surface laid along the line an attacker would want to walk, and stage 5b ` +
    `exists to move it one tile inboard. It ran on this room and moved ${r.moved} tile(s). Per tile ` +
    `still in a run, the interior-parallel census taken on the board this room SHIPS: ` +
    r.runs
      .map(
        (s) =>
          `${s.x},${s.y} — ` +
          (s.free.length
            ? `${s.free.length} free interior tile(s) (${s.free.map(xy).join(" ")}), ` +
              `so the swap was offered and ${s.refused ? `refused: ${s.refused}` : `either taken for a neighbour in the same run (which is why this tile is still here and the run is one shorter) or the tile entered the run after 5b had passed it`}`
            : `NO free interior parallel exists — every D8 neighbour is spoken for: ${s.held.join(" · ")}`),
      )
      .join(" · ") +
    `. The swap is refused rather than forced because the alternative is a road network that is ` +
    `no longer one component from the sitter, or a container or extension that loses the face the ` +
    `haulers use — a worse room bought to make one metric look better.`
  );
}

// ---------------------------------------------------------------------------
// ROAD ON RAMPART, CLASSIFIED
// ---------------------------------------------------------------------------
function renderRoadRampart(r) {
  return (
    `ROAD ON RAMPART, CLASSIFIED: ${r.total} tile(s) in this room carry both a road and a ` +
    `rampart — ${r.crossing} wall CROSSING(s) on the cut line, ${r.seat} bubble ` +
    `SEAT(s) (a miner's container outside the shell, on the road that exists to reach it), ` +
    `${r.ring} CONTROLLER STAND-DENIAL RING tile(s) ` +
    `(${r.ringTiles.map(xy).join(" ")}), ${r.cover} personal-cover tile(s) ` +
    `and ${r.unclassified} unclassified. The ring class is the one the published ` +
    `taxonomy did not have: these tiles are not on meta.shell.cut and carry no structure, so the ` +
    `old classifier folded them into "wall crossing" and the accounting closed over a hole. They ` +
    `are ramparted because a hostile claim creep standing D8 of the controller is the threat the ` +
    `ring exists to deny, and they are paved because the eco lane to the controller has to reach ` +
    `the controller and there is no way to the middle of a ring except across it. Same argument ` +
    `as a crossing, different geometry, and it is now said rather than absorbed.`
  );
}

// ---------------------------------------------------------------------------
// SHALLOW EXTENSIONS
// ---------------------------------------------------------------------------
/**
 * OF10 (round 16): the sweep is 48x48 = 2304 POSITIONS of the buildable band,
 * and both channels called them "interior tiles" in rooms that hold 178. The
 * count was never wrong; the noun was, by an order of magnitude, in the note
 * attached to the owner's top criterion. Both numbers are now printed and each
 * is called what it is — the band the sweep covered, and the walkable floor
 * this particular room has inside its own wall.
 */
function renderShallowExtNote(r) {
  const l6note = r.l6
    ? `Layer 6's own end-of-layer pass moved ${r.l6.moved} slot(s) onto deep floor whose road face ` +
      `already existed (${r.l6.tiles.map((m) => `${xy(m.from)}->${xy(m.to)}`).join(" ")}). `
    : "";
  const l7note = r.l7
    ? `Layer 7b then re-ran the search over the board the room SHIPS — the dead-end prune had by ` +
      `then handed back ${r.search.freeDeepRoadFaced} free deep road-faced tile(s) and ` +
      `${r.search.freeDeepOnePave} more that are one plain pave from the conducting network, none ` +
      `of which existed as usable floor when layer 6 looked — and moved ${r.l7.moved} more ` +
      `(${r.l7.tiles.map((m) => `${m.from.x},${m.from.y}(d${m.fromDepth})->${m.to.x},${m.to.y}(d${m.toDepth})`).join(" ")})` +
      `${r.l7.rampartsRetired ? `, retiring ${r.l7.rampartsRetired} personal rampart(s)` : ""}. `
    : "";
  const cause = !r.shallowNow
    ? `every shallow slot this room laid was relocated onto deep floor; it ships none`
    : r.search
      ? `layer 7b scanned all ${r.search.interiorTiles} positions of the ${r.search.bandSide}x${r.search.bandSide} ` +
        `buildable band tile by tile — ${r.search.interiorWalkable} of them are walkable floor inside this ` +
        `room's own wall, which is the number "interior" means here — and found ` +
        `${r.search.freeDeepRoadFaced} free deep road-faced tile(s) and ` +
        `${r.search.freeDeepOnePave} one plain pave from the conducting network — BOTH CLASSES, ` +
        `counted separately, which is the round-12 correction: this note reported only the ` +
        `road-faced one while claiming to have swept for both, and the class it did not report ` +
        `held a tile E12S6 could have taken for free. ${r.search.paveTaken} of the one-pave tiles ` +
        `were taken and ${r.search.paveLeft} were left — AND THOSE THREE NUMBERS DO NOT SUBTRACT, ` +
        `WHICH IS THE POINT: "left" is the class RE-SCANNED against the board this room ships, not ` +
        `${r.search.freeDeepOnePave} minus ${r.search.paveTaken}. A candidate can leave the one-pave ` +
        `class without anybody taking it, and the commonest way is that a neighbour took it as ITS ` +
        `pave — the tile is on the network now, so it is no longer one pave from it (E12S6's 35,13 is ` +
        `the tile that named this). A "left" figure that closed against the other two would be ` +
        `reporting a subtraction instead of a search. It rejected ` +
        `${r.search.refusedCount} distinct tile(s) for a stated reason each ` +
        `(${r.search.refusedExaminations} examinations — a tile re-offered on a later round is ` +
        `logged again and counted once). ` +
        (r.search.freeDeepRoadFaced === 0 && r.search.freeDeepOnePave === 0
          ? `There is no deep tile left in this enclosure that is free, inside the wall, ` +
            `engine-legal, reachable by a builder and either road-faced or one pave from the ` +
            `network — that is a statement about a completed scan of all ` +
            `${r.search.interiorTiles} band positions, not about a budget`
          : (r.search.spentOnAdds || r.search.spentOnMoves
              ? `Of those, ${r.search.spentOnAdds} became extension(s) this room did not have at all ` +
                `— the backfill to ${r.extTarget}/${r.extTarget}, which outranks retiring a rampart — and ` +
                `${r.search.spentOnMoves} took a relocated shallow slot. `
              : "") +
            (r.search.left === 0 && r.search.paveLeft === 0
              ? `NONE of either class were left by the time the ${r.shallowNow} remaining shallow ` +
                `slot(s) were offered them: this room did not refuse the trade, it never had it. The ` +
                `deep floor the prune handed back went on the extension count first`
              : `The ${r.search.left} road-faced and ${r.search.paveLeft} one-pave tile(s) still on ` +
                `the table could not be taken by the ${r.shallowNow} that remain without failing the ` +
                `acceptance test or the lap ceiling: a structure would lose its last walkable face, a ` +
                `road would be cut off from the sitter, a battlement would be stranded, the ` +
                `controller would lose a claim seat or an upgrader park, or the move would take the ` +
                `gated defender lap past this room's ceiling. The declaration beside this note prices ` +
                `each one per slot`))
      : `the placement invariant refused the remaining deep tiles (each would strand a ` +
        `structure face, a road or the wall)`;
  const lap = r.lap;
  const whichCeiling = !lap
    ? ""
    : lap.ceilingSlack !== null && lap.ceilingSlack !== undefined
      ? lap.bound !== null && lap.bound !== undefined && lap.ceiling === lap.bound
        ? ` — and that ceiling is layer 6's BOUND (${lap.bound}), not this room's incumbent lap: at ` +
          `${lap.before} against a ${r.mobilityTarget} target this room is past ` +
          `${lap.ceilingStrictBand}x the target, so it was entitled to worsen its lap by ` +
          `${lap.ceilingSlackPct}% (to ${lap.ceilingSlack}) to retire ramparts — and the bound ` +
          `clipped it back, because a bound is a proof about the mass and buying upkeep with a claim ` +
          `is worse than buying it with a lap`
        : ` — the relaxed ceiling this room was entitled to (${lap.ceilingSlack}, i.e. ` +
          `${lap.ceilingSlackPct}% worse than the ${lap.before} it already had, which a room ` +
          `past ${lap.ceilingStrictBand}x the target may spend on retiring ramparts)`
      : lap.bound !== null && lap.bound !== undefined && lap.ceiling === lap.bound
        ? ` — the bound layer 6 reserved lanes to prove`
        : ` — the lap the room already had with all 60 extensions standing. This room is inside ` +
          `${lap.ceilingStrictBand}x the ${r.mobilityTarget} target, where the strict rule ` +
          `applies: near the gate the difference between making it and not is worth more than the ` +
          `rampart, and an upkeep pass may not spend the garrison's legs to buy upkeep`;
  const tradeNote = lap && lap.rollback.length
    ? ` TRADE REFUSED, PRICED: ${lap.rollback.length} of the shallow slot(s) this room STILL SHIPS ` +
      `could have moved onto free deep floor — ${lap.rollback.map((m) => `${xy(m.from)}->${xy(m.to)}`).join(" ")} ` +
      `— retiring ${lap.rollback.length} personal rampart(s) at ` +
      `${eTick(lap.rollback.length * 0.03)} e/tick of forever-upkeep. Taking them would have moved the ` +
      `as-built gated defender lap from ${lap.before} to ${lap.rollback[0].wouldLap}, past this room's ` +
      `ceiling of ${lap.ceiling}` +
      whichCeiling +
      `. The room keeps the ramparts and keeps the lap. The trade is written down so it can be ` +
      `argued with. (Round 19: this clause priced every move the lap ceiling ever threw away, ` +
      `including slots a later pass then moved anyway — three rooms published a refusal over tiles ` +
      `carrying no extension and no rampart, in the same paragraph as "it ships none". A slot is ` +
      `priced as refused here only if the shipped board still has it, shallow.)`
    : lap && lap.ceilingSlack !== null && lap.ceilingSlack !== undefined && lap.slackSpent
      ? ` LAP SLACK SPENT, PRICED: this room laps ${lap.before} against a ` +
        `${r.mobilityTarget} target — past ${lap.ceilingStrictBand}x it, i.e. failed rather ` +
        `than tight — so the relocation pass was allowed to worsen the lap by up to ` +
        `${lap.ceilingSlackPct}% of it, ${lap.ceilingSlack}, in exchange for retiring personal ` +
        `ramparts` +
        (lap.ceilingBound !== null && lap.ceilingBound !== undefined && lap.ceiling < lap.ceilingSlack
          ? `, CLIPPED to ${lap.ceiling} by layer 6's published bound — the slack is spendable ` +
            `against this room's own incumbent lap and never against a proof`
          : ` (ceiling ${lap.ceiling})`) +
        `, and it shipped at ${lap.after}. Refusing that trade is how a room ends up renting ` +
        `forever-ramparts to protect a few percent of a number it already misses by an order of ` +
        `magnitude.`
      : "";
  return (
    `SHALLOW EXTENSIONS: ${r.shallowNow} of ${r.total} sit at depth < 4 and rent a personal rampart ` +
    `forever. ${l6note}${l7note}` +
    (r.shallowNow ? `Cause of the ${r.shallowNow} that remain: ` : `Outcome: `) +
    cause +
    `.` +
    tradeNote
  );
}

/**
 * THE CLOSED INVENTORY. A note whose class is not a key of this object cannot
 * be produced (pushNote throws) and cannot be accepted (the validator's gate
 * reads the same table). `headings` is what the class is allowed to start with,
 * so a reader — and a reviewer's grep — can go from a heading to the record
 * that owes it without reading the renderer.
 */
export const NOTE_CLASSES = {
  sealedFloor: {
    headings: ["SEALED INTERIOR FLOOR"],
    render: renderSealedFloor,
  },
  // OF3 (round 18) — the recovery pass's reader channel. Two headings for the
  // two branches, like redundantCut: the room either moved a seat and got floor
  // back, or it did not and owes the candidate census.
  sealedRecovery: {
    headings: ["SEALED FLOOR RECOVERED", "SEALED FLOOR NOT RECOVERED"],
    render: renderSealedRecovery,
  },
  // OM2 (round 22) — the across-prior tower swap's reader channel. Two
  // headings for the two branches, like the recovery's: the room either moved a
  // tower after layer 3 had finished, or it priced the offer and turned it down.
  towerSwap: {
    headings: ["TOWER MOVED ACROSS THE PRIOR", "A TOWER SWAP OFFERED AND REFUSED"],
    render: renderTowerSwap,
  },
  // OL2 (round 22) — the sealing-curve amendment, in the two rooms it applies
  // to. One heading: the class only exists for the case where the answer is no.
  shellClosure: {
    headings: ["THE CUT IS NOT A SEALING CURVE ON ITS OWN HERE"],
    render: renderShellClosure,
  },
  redundantCut: {
    headings: ["NO CUT TILE IS REDUNDANT", "CUT TILES THAT ARE NOT SINGLY LOAD-BEARING"],
    render: renderRedundantCut,
  },
  containerRoad: {
    headings: ["ROAD LAID FOR A CONTAINER THAT IS NOT BUILT YET"],
    render: renderContainerRoad,
  },
  pavingGap: {
    headings: ["A PAVING GAP UNTIL RCL 6, NAMED"],
    render: renderPavingGap,
  },
  pavedRun: {
    headings: ["A PAVED RUN ALONG THE WALL, AND WHY IT IS STILL HERE"],
    render: renderPavedRun,
  },
  roadRampart: {
    headings: ["ROAD ON RAMPART, CLASSIFIED"],
    render: renderRoadRampart,
  },
  shallowExt: {
    headings: ["SHALLOW EXTENSIONS"],
    render: renderShallowExtNote,
  },
};

/** render a `{cls, rec}` note entry. Throws on a class the inventory lacks. */
export function renderNote(entry) {
  const c = NOTE_CLASSES[entry?.cls];
  if (!c) throw new Error(`note class not in the inventory: ${JSON.stringify(entry?.cls)}`);
  const text = c.render(entry.rec);
  // the heading is part of the contract, not a coincidence of the template
  if (!c.headings.some((h) => text.startsWith(h + ":"))) {
    throw new Error(`note class ${entry.cls} rendered a heading outside its inventory: ${text.slice(0, 60)}`);
  }
  return text;
}

/**
 * The ONLY writer of `plan.meta.notes`. It appends the rendered paragraph and
 * the record that produced it, in the same call, so the two arrays cannot drift
 * — which is exactly how a validator gets to compare them by string equality
 * instead of by regex.
 */
export function pushNote(plan, cls, rec) {
  if (!plan.meta) return null;
  const text = renderNote({ cls, rec });
  plan.meta.notes = plan.meta.notes || [];
  plan.meta.noteRecords = plan.meta.noteRecords || [];
  plan.meta.notes.push(text);
  plan.meta.noteRecords.push({ cls, rec });
  return text;
}
