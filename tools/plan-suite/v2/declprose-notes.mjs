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
 * Rendered from `meta.sealedRecovery` and nothing else, like every renderer in
 * this file. `outcome` is the record's own branch tag, so the paragraph shape is
 * a field of the record rather than a guess made from which keys happen to be
 * present.
 */
function renderSealedRecovery(r) {
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
      `Across this room's ${r.pockets.length} ${plural(r.pockets.length, "pocket", "pockets")} there ` +
      `are ${r.candidates} distinct movable ${plural(r.candidates, "holder", "holders")}, and EVERY ` +
      `one of them was re-composed from layer 1 and finalized — ${r.tried} ` +
      `${plural(r.tried, "composition", "compositions")}, never a prefix and never one pocket's ` +
      `holders, and each was admitted or refused on the deep floor its own finished board hands back ` +
      `BOARD-WIDE (round 18: this pass used to try three in raster order and then report that every ` +
      `candidate had been examined; round 19: it used to admit on the best single-pocket ` +
      `counterfactual, which cannot see a withdrawal that opens two pockets at once). ` +
      (rivals.length
        ? `${r.accepted} of them cleared the whole panel and this seat won the published tie-break — ` +
          `largest deep recovery, then largest total recovery, then the cheapest panel (least ` +
          `extension tour, then most interior, then strongest face), then raster order — ` +
          `ahead of ${rivals.map((o) => xy(o.withdrawn)).join(" ")}.`
        : `It is the only one that cleared the whole panel.`) +
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
      `(${r.pockets.map((p) => `${xy(p.at)} ${p.tiles}/${p.deep} deep`).join(", ")}) and NOT ONE of ` +
      `their holders is a structure this pass may move ` +
      `(${r.fixedHolders.map((h) => `${h.type} ${xy(h)}=${h.recovers}/${h.recoversDeep}`).join(", ")}). ` +
      `The two classes it does move are ${r.kindsAttempted.join(" and ")}: an extension because the ` +
      `mass is the flexible layer and the seal is its ordering, and the observer because its own ` +
      `placement rule is "the furthest leftover tile" and its position is irrelevant to what it does. ` +
      `A hub structure, a lab of the diamond, a tower or the nuker that is hauled 300k energy by hand ` +
      `is placed against a real constraint by its own layer, and "move it one tile" is not a bounded ` +
      `change to it.`
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
    `(${r.pockets.map((p) => `${xy(p.at)} ${p.tiles}/${p.deep} deep`).join(", ")}) with ` +
    `${r.candidates} distinct movable ${plural(r.candidates, "holder", "holders")} between them, ` +
    `and EVERY one of them was re-composed from layer 1 with the seat withdrawn and finalized — ` +
    `${r.tried} ${plural(r.tried, "composition", "compositions")}, never a prefix and never one ` +
    `pocket's holders, each judged on the deep floor its own finished board hands back BOARD-WIDE ` +
    `(round 18: this pass used to try three in raster order and then report that every candidate had ` +
    `been refused; round 19: it used to look at one pocket's holders only). Each one, and the ` +
    `instrument that refused it: ` +
    tried
      .map(
        (o) =>
          `${o.kind} ${xy(o.withdrawn)} (counterfactual ${o.recoversDeep} deep) — ` +
          `${o.verdict.replace(/^refused: /, "")}` +
          (o.extTourDelta === null || o.extTourDelta === undefined
            ? ``
            : `; extension tour ${deltaWord(o.extTourDelta)}`),
      )
      .join(" · ") +
    `. This room ships the plan it would have shipped without this pass, and its ${sealedDeepNow} ` +
    `deep tile(s) stay sealed — priced, named and refused rather than unexamined.` +
    tourRefused
  );
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
function renderContainerRoad(r) {
  return (
    `ROAD LAID FOR A CONTAINER THAT IS NOT BUILT YET: ${r.added.length} plain road tile(s) ` +
    `(${r.added.map(xy).join(" ")}) were added because this room's road ` +
    `network was joined THROUGH its mineral-seat container, and that container is deferred to ` +
    `RCL 6 (no extractor exists before then, so the box has nothing to fill it). Containers are ` +
    `network nodes — true at RCL 8, false at RCL 3 — and without these tiles the controller ` +
    `container and the roads that serve it are orphaned for three whole RCLs. The tiles are ` +
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
    `(${r.runs.map((t) => `${t.x},${t.y}${t.onCut ? "" : t.seat ? "[bubble seat]" : "[off-cut rampart]"}`).join(" ")}). ` +
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
        `were taken and ${r.search.paveLeft} were left. It rejected ` +
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
