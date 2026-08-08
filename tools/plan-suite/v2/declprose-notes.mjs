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
    `floor the base already walks, so the only cost is ${round2(r.added.length * 0.001)} ` +
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
    ? ` TRADE REFUSED, PRICED: ${lap.rollback.length} further shallow slot(s) could have moved onto free deep ` +
      `floor — ${lap.rollback.map((m) => `${xy(m.from)}->${xy(m.to)}`).join(" ")} — retiring ` +
      `${lap.rollback.length} personal rampart(s) at ` +
      `${Math.round(lap.rollback.length * 3) / 100} e/tick of forever-upkeep. Taking them would have moved the ` +
      `as-built gated defender lap from ${lap.before} to ${lap.rollback[0].wouldLap}, past this room's ` +
      `ceiling of ${lap.ceiling}` +
      whichCeiling +
      `. The room keeps the ramparts and keeps the lap. The trade is written down so it can be ` +
      `argued with.`
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
