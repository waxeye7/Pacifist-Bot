/**
 * Generated prose for the four declarations layer 1 and the pipeline file about
 * the HUB's own choices — the spawn fan, the controller seat (in both its
 * flavours), the seats the room gave back, and the search that would not settle.
 * See the header of declprose.mjs for the contract: the producer sets
 * `detail = renderDecl(sf)`, the validator regenerates from the PUBLISHED record
 * and requires equality, so every input these functions read has to be a field
 * on the declaration and nothing may be closed over from the producer's locals.
 *
 * ===========================================================================
 * WHY THESE FOUR WERE STILL HAND-WRITTEN, AND WHAT IT COST.
 * ===========================================================================
 * Round 12 generated eight kinds and audited eight kinds, and the eight were the
 * ones a reviewer had happened to attack. The other ten shipped a paragraph
 * assembled inside the producer out of the producer's OWN LOCALS — which reads
 * like generation and is not, because the validator has no way to run it. The
 * difference is not stylistic: `ctrlParks/seats` was in DECLARABLE_PAIRS, so its
 * paragraph could excuse a hard gate, and a round-13 reviewer rewrote E12S5's
 * "AS BUILT this link feeds 5" to "feeds 7" — the number the search WANTED — and
 * the room passed `1/1 · fail 0`. The record still said 5. Nothing compared them.
 *
 * THE THREE CONSTANTS THAT ARE NOW FIELDS. Every number the old paragraphs read
 * off a module-level `const` (SECTOR_TARGET, SECTOR_WEIGHT, MIN_PARKS,
 * PARK_FLOOR_HARD, the ladder width) is a field on the record now, for the same
 * reason the tower thresholds are: a threshold quoted from the producer's scope
 * is a number the reader cannot check and the validator cannot re-derive.
 */

const n = (v, fallback = "?") => (v === null || v === undefined ? fallback : v);
const pt = (t) => (t && Number.isInteger(t.x) ? `${t.x},${t.y}` : "?,?");
const plural = (v, one, many) => (Number(v) === 1 ? one : many);

/**
 * ---------------------------------------------------------------------------
 * spawnFan|sector — the fan that missed, and the census that says why.
 * ---------------------------------------------------------------------------
 * `fanned:false` used to be the whole story. The paragraph is the receipt for a
 * decision the plan has already made: what the pocket offered, what each hard
 * filter took away, how few sectors the survivors covered, and WHICH of the
 * three failure shapes this was — outbid, empty, or fallback. All three branches
 * are selected from the census's own numbers rather than from a producer
 * boolean, so a record cannot print a failure it did not have.
 */
export function renderSpawnFan(sf) {
  const f = sf.spawnFan || {};
  const c = f.census || {};
  const target = Number(f.target);
  const short = Math.max(0, target - f.minAngle);
  const rejected = c.rejClaimed + c.rejHubRing + c.rejWalk + c.rejStorageFace + c.rejExits;
  const where = (sf.tiles || []).map(pt).join(" / ");
  const parts = [];
  parts.push(
    `spawn fan short by ${short}°: the best legal triple around the hub at ` +
      `${pt(f.hub)} separates its three spawns (${where}) by only ` +
      `${f.minAngle}° at the worst pair, against the ${target}° sector target — ` +
      `achieved ${f.minAngle}° vs target ${target}°, filler leash used ` +
      `${f.walkMax} of ${c.walkCap} walk steps, shallowest spawn at proxy depth ` +
      `${f.proxyDepthMin} (floor ${c.depthSafe}).`,
  );
  parts.push(
    `Candidate census: ${c.pool} tiles were considered (${c.poolCore} in the grown core, ${c.poolRing} in the ring just outside it); ` +
      `${rejected} were struck out in order — ${c.rejClaimed} already claimed by the hub trio or ` +
      `an object tile, ${c.rejHubRing} inside storage's own 2-tile ring, ${c.rejWalk} past the ` +
      `${c.walkCap}-step filler leash, ${c.rejStorageFace} that would have cut storage below two ` +
      `free faces, ${c.rejExits} with fewer than 3 free exits for a creep to leave by — leaving ` +
      `${c.viable} viable seats (${c.viableCore} of them inside the core pocket, ` +
      `${c.viableShallow} of them proven shallow below depth ${c.depthSafe} on the pre-shell ` +
      `proxy), spread over ${c.viableSectors} of the ${c.sectorBins} ${c.sectorDeg}° sectors ` +
      `around storage. ${c.shortlist} of those were shortlisted across ${c.shortlistSectors} ` +
      `sectors and ${c.triples} pairwise-non-adjacent triples were enumerated from them ` +
      `(${c.triplesAdjacent} more discarded because two spawns touched), of which ` +
      `${c.fannedTriples} reached the ${target}° target; ${c.triplesJointRejected} ` +
      `better-scoring triples failed the joint feasibility test before this one was taken, and ` +
      `the winner spans ${c.winnerSectors} sector${c.winnerSectors === 1 ? "" : "s"}.`,
  );
  // WHICH failure this was. A miss because the pocket has no daylight in it is
  // a different admission from a miss because the fan was outbid, and reporting
  // the first when the second happened would be a comfortable lie.
  if (c.fallback) {
    parts.push(
      `Not one triple survived the joint feasibility test — storage's own free faces and the ` +
        `3-exit rule could not be satisfied by any three of them at once — so the sequential ` +
        `fallback placed the spawns one at a time and the fan is whatever the leftovers allowed.`,
    );
  } else if (!c.fannedTriples) {
    parts.push(
      `Why it failed: not one of the ${c.triples} triples reached ${target}°. The pocket ` +
        `offered ${c.viable} seats in ${c.viableSectors} sectors and no three of them, mutually ` +
        `non-adjacent, stand ${target}° apart around storage — this is the terrain's ` +
        `answer, not a scoring preference, and no reweighting reaches a tile that is not there.`,
    );
  } else if (c.fannedAvailable) {
    const a = c.fannedAvailable;
    parts.push(
      `Why it failed: the fan WAS on the table and lost on score. ${c.fannedTriples} triples ` +
        `reached the target, the best of them ${a.minAngle}° at ` +
        `${(a.tiles || []).map(pt).join(" / ")}` +
        (a.jointlyFeasible ? ` (jointly feasible)` : ` (and not even jointly feasible)`) +
        `, but it scored ${a.scoreGap} points below the winner: the sector term pays ` +
        `${f.sectorWeight} points per degree and saturates at ${target}°, so the extra ` +
        `angle was worth ${a.sectorGain} points while the fanned triple gave up ` +
        `${a.tileQualityGap} points of tile quality — exits, pocket hug and proxy depth. That is ` +
        `a deliberate trade, priced by SECTOR_WEIGHT, and this is where it is being declared ` +
        `rather than hidden behind a boolean.`,
    );
  }
  // THE CONSEQUENCE IS READ OFF THE CENSUS, NOT PRINTED FROM A TEMPLATE. This
  // paragraph used to open "three spawns inside one sector" unconditionally — in
  // 8 rooms directly contradicting the sentence above it, which had just
  // reported `winnerSectors: 3`.
  const ws = c.winnerSectors;
  parts.push(
    `Consequence: ` +
      (ws <= 1
        ? `all three spawns sit in ONE ${c.sectorDeg}° sector, so the room's spawn-adjacent parking and ` +
          `the fill routes crowd a single face of the hub — the fillers queue on one side instead of ` +
          `touring three, and one breach, one nuke or one blocked corridor on that side reaches every ` +
          `spawn the room has.`
        : ws === 2
          ? `the three spawns cover ${ws} of the ${c.sectorBins} ${c.sectorDeg}° sectors, so two of them ` +
            `share a face: the parking and fill routes fan across two sides rather than three, and a ` +
            `breach on the shared side reaches two of the room's three spawns at once.`
          : `the three spawns DO sit in ${ws} different ${c.sectorDeg}° sectors — this is a spread that ` +
            `misses the ${target}° separation target, not a bunch. The cost is proportionate: the ` +
            `closest pair is ${f.minAngle}° apart, so their parking and fill routes overlap and the ` +
            `filler tour saves less than a fully fanned trio would, but no single face carries the room.`) +
      ` At ${f.minAngle}° the worst pair here is ${short}° short of the target, and the parking, roads ` +
      `and rampart spend follow them.`,
  );
  return parts.join(" ");
}

/**
 * ---------------------------------------------------------------------------
 * ctrlParks|seats — ONE kind, two facts, and they used to be two paragraphs
 * written by two files.
 * ---------------------------------------------------------------------------
 * Layer 1 files this when the seat search lands at or under THIN_PARKS, with the
 * search census behind it. The pipeline RE-COUNTS the seats on the finished
 * board, and when the extension mass has eaten some it either appends a sentence
 * to layer 1's declaration or — when layer 1 never filed one, because the search
 * count cleared the thin line — files the same kind on its own.
 *
 * That is three shapes for one kind, assembled by string concatenation across
 * two files, which is precisely the arrangement that let E12S5 ship "AS BUILT
 * this link feeds 7" over a record saying 5. So the composition lives HERE: the
 * search half prints when the record carries a `census`, the as-built half
 * prints when it carries a `built`, and a room with both gets both in the order
 * this function fixes rather than the order the layers happened to run in.
 */
export function renderCtrlSeats(sf) {
  const r = sf.ctrlParks || {};
  const c = r.census || null;
  const floor = Number(r.floor);
  const parts = [];
  if (c) {
    const ru = c.runnerUp;
    const rel =
      r.parks < floor
        ? `${floor - r.parks} BELOW the ${floor}-seat floor`
        : r.parks === floor
          ? `exactly ON the ${floor}-seat floor`
          : `${r.parks - floor} above the ${floor}-seat floor`;
    parts.push(
      `thin upgrader seat: the controller link at ${pt(r.link)} feeds ${r.parks} walkable ` +
        `parking tiles within range 3 of the controller at ${pt(r.controller)} — ` +
        `${rel}, which is a constraint and not a margin: lose one seat to a rampart, a road ` +
        `repair or a creep standing still and the upgrader fleet throttles.`,
    );
    parts.push(
      `Seat search, in numbers: ${c.considered} buildable link tiles at chebyshev 2–3 from the ` +
        `controller were reachable from the hub and considered` +
        (c.sealing
          ? `, of which ${c.sealing} were set aside for sealing a pocket off the basin` +
            (c.forcedOntoSealingPool
              ? ` — and every candidate did, so the seat had to come from the sealing pool anyway`
              : ``)
          : `, none of which sealed a pocket off the basin`) +
        `. The winner offered ${r.parks} seats at ${c.chosen.hubWalk} walk steps from the hub ` +
        `(ladder score ${c.chosen.score} on park×2 − hubWalk÷2), and was taken as ` +
        (c.tookFirstAboveFloor
          ? `the highest-scoring tile that clears the ${floor}-seat floor`
          : `the roomiest tile on offer — no candidate cleared the ${floor}-seat floor at all`) +
        `.`,
    );
    if (!ru) {
      parts.push(
        `There was no runner-up: the ring produced exactly one legal link tile, so ${r.parks} ` +
          `seats is not a choice the planner made but the only seat the terrain sells.`,
      );
    } else if (ru.parks > r.parks) {
      parts.push(
        `The trade: a roomier seat existed — ${ru.x},${ru.y} feeds ${ru.parks} tiles, ` +
          `${ru.parks - r.parks} more — but it sits ${ru.hubWalk - c.chosen.hubWalk} walk steps ` +
          `further from the hub (${ru.hubWalk} vs ${c.chosen.hubWalk}) and scores ${ru.score} against ` +
          `${c.chosen.score}. That detour is paid on every pre-link hauler round trip and every ` +
          `repair walk to the controller for the life of the room, so the chosen seat won anyway; ` +
          `the seat count is what the room paid for the shorter haul.`,
      );
    } else {
      parts.push(
        `The trade was not available: the best alternative, ${ru.x},${ru.y}, feeds ${ru.parks} ` +
          (ru.parks === r.parks ? `— the same count — ` : `— ${r.parks - ru.parks} fewer — `) +
          `at ${ru.hubWalk} walk steps against the winner's ${c.chosen.hubWalk} (score ${ru.score} vs ` +
          `${c.chosen.score}), and no tile anywhere in the ring fed more than ${c.maxParks}. ` +
          `${r.parks} seats is therefore the room's ceiling, not a preference — the chosen tile ` +
          `won on hub distance among equals.`,
      );
    }
  }
  // THE AS-BUILT HALF. `built` is the seat count re-taken over the finished
  // board; `eaters` names the structures standing on the ring, because "8 became
  // 3" with no culprit is not a measurement anybody can act on.
  if (r.built !== null && r.built !== undefined) {
    const eaters = r.eaters || [];
    const sentence =
      `AS BUILT this link feeds ${r.built} parking tile(s), not the ${r.parks} the layer-1 seat ` +
      `search counted: ${eaters.length ? eaters.join(" ") : "no structure"} stand(s) on the ring now. ` +
      `The layer-1 number is what the search DECIDED on — it is kept above for that reason — but the ` +
      `upgrader fleet parks on the shipped number` +
      (r.built < floor
        ? `, and ${r.built} is BELOW the ${floor}-seat floor this planner treats as hard. That is a ` +
          `throttle on the upgrader fleet for the life of the room, caused by our own mass rather than ` +
          `by the controller's terrain.`
        : `.`);
    parts.push(
      c
        ? sentence
        : `UPGRADER SEATS, RE-COUNTED ON THE FINISHED ROOM: the controller link at ${pt(r.link)} ` +
          `was chosen because it fed ${r.parks} parking tile(s) within range 3 of the controller at ` +
          `${pt(r.controller)}. ${sentence}`,
    );
  }
  return parts.join(" ");
}

/**
 * ---------------------------------------------------------------------------
 * ctrlParks|released — the seats the room gave back to the extension mass.
 * ---------------------------------------------------------------------------
 * Both columns of the trade are in the record: what holding the full
 * reservation costs in shallow extensions and ramparts, what releasing costs in
 * seats, and the deep-tile count underneath both. The floor is a field, not a
 * constant, for the same reason every other threshold in this module is.
 */
/**
 * THE SENTENCE ABOUT THE WALK, GENERATED FROM THE WALK.
 *
 * This used to read "Every cap from ${held-1} down to 0 was composed IN FULL and
 * measured" — derived from `held`, which is the size of the RESERVATION, and not
 * from anything the loop reported. The loop broke early (see maybeReleaseParks),
 * so the claim was false whenever the break fired, and the break itself was wrong
 * on the tie-break the same function uses. The loop now runs to the bottom and
 * records the rungs; this reads them, and where the record is absent it says the
 * claim cannot be made rather than reconstructing it from `held` again.
 */
function releasedSearch(r) {
  const caps = Array.isArray(r.composedCaps) ? r.composedCaps : null;
  if (!caps) {
    return (
      `THIS RECORD DOES NOT SAY WHICH CAPS WERE COMPOSED, so the claim that the walk covered all of ` +
      `them is not made here; what is below is the winner and the two columns it was chosen on. `
    );
  }
  const lo = caps.length ? caps[caps.length - 1] : null;
  const hi = caps.length ? caps[0] : null;
  const thrown =
    (r.rejectedError || 0) + (r.rejectedIncomplete || 0) + (r.rejectedUnderFloor || 0);
  return (
    `${caps.length} ${plural(caps.length, "cap", "caps")} ${plural(caps.length, "was", "were")} composed ` +
    `IN FULL and measured` +
    (caps.length ? ` — ${hi} down to ${lo}, every rung, no early exit` : ``) +
    (thrown
      ? ` — of which ${thrown} ${plural(thrown, "was", "were")} thrown out before being ranked ` +
        `(${n(r.rejectedError, 0)} failed to compose, ${n(r.rejectedIncomplete, 0)} did not hold the whole ` +
        `RCL8 program, ${n(r.rejectedUnderFloor, 0)} shipped fewer than ${r.floor} parks)`
      : ` — every one of them a complete room above the floor`) +
    `. The walk does NOT stop at the first composition that reaches zero shallow extensions, and that ` +
    `is not thoroughness for its own sake: the ranking below zero shallow is more parks and then fewer ` +
    `ramparts, so a lower cap can still beat a zero-shallow winner on a tie` +
    (Number.isFinite(Number(r.winningCap))
      ? `. Cap ${n(r.winningCap, 0)} is the best of them` : `. This is the best of them`) +
    `, judged on what it ships and never on what it reserves. `
  );
}

export function renderCtrlReleased(sf) {
  const r = sf.ctrlParks || {};
  const gave = (sf.tiles || []).map(pt).join(" ");
  return (
    `UPGRADER SEATS RELEASED, PRICED: this room HOLDS ${r.kept} of the ${r.held} parking tile(s) ` +
    `layer 1 counted at the controller link and gave ${r.released} back to the extension mass ` +
    `(${gave}) — and it still SHIPS ${r.parksShipped} free ` +
    `seat(s), because the mass only took the ones it needed. Holding all ${r.held} costs this room ` +
    `${r.shallowHolding} shallow extension(s) — ${r.shallowHolding} personal rampart(s) repaired forever, and ` +
    `${r.shallowHolding} structure(s) a ranged attacker can hit from outside the wall — against ` +
    `${r.shallowReleasing} here, at ${r.rampartsReleasing} total ramparts against ` +
    `${r.rampartsHolding}. ${releasedSearch(r)}` +
    `${r.floor} is the floor no composition may go under because that is where the upgrader ` +
    `fleet starts being throttled by parking rather than by energy — the same number layer 1's seat ` +
    `search and the validator both treat as hard. The room being short of deep floor is the fact ` +
    `underneath both columns: ${n(r.deepTiles)} deep tiles inside the widest enclosure ` +
    `it admits.`
  );
}

/**
 * ---------------------------------------------------------------------------
 * runtime|heavy-search — the room the seed search would not settle on.
 * ---------------------------------------------------------------------------
 * NO WALL-CLOCK READING APPEARS HERE ON PURPOSE, and the paragraph says so: a
 * millisecond count differs on every run, and a plan that hashes differently on
 * every run cannot be checked for determinism at all.
 */
export function renderRuntimeSearch(sf) {
  const r = sf.runtime || {};
  return (
    `THIS ROOM COMPOSED ${r.compositions} COMPLETE PLANS across ${r.seeds} seed(s) — more than the ` +
    `${r.ladder}-rung ladder a single seed is allowed, which is the line the suite ` +
    `declares at. ${r.complete} of them held the whole RCL8 program, and it shipped from seed rank ` +
    `${n(r.seedSkip, 0)}. Each composition is a complete shell negotiation plus the whole ` +
    `structure program, kept only if it measurably beat the incumbent — that proof is exactly what the ` +
    `old sub-200ms budget was trading away, and it makes this one of the fleet's slowest rooms to plan. ` +
    `The planner runs offline, so this is a note about developer patience, not about CPU in-game; it is ` +
    `declared rather than hidden because a search that cannot settle on the best-scoring seat is worth ` +
    `seeing. No wall-clock reading is quoted here on purpose: it differs on every run, and a plan that ` +
    `hashes differently on every run cannot be checked for determinism at all. The suite prints the ` +
    `milliseconds.`
  );
}
