/**
 * ===========================================================================
 * DECLARATION PROSE IS GENERATED, NOT WRITTEN.
 * ===========================================================================
 *
 * WHAT THIS REPLACES, AND WHY IT IS A MODULE AND NOT A CONVENTION.
 *
 * A declared shortfall has two halves: a structured record the validator
 * re-derives, and a paragraph a human reads. Round 11 made the record true.
 * Round 12 made the paragraph QUOTE the record — `quoted()` asked whether each
 * audited numeral appeared anywhere in `detail`. That is a numeral-presence
 * test, and a reviewer walked straight through it: E7S5's `covered-detour`
 * paragraph was rewritten to say
 *
 *     "the garrison walks 3 tiles inside where the attacker walks 2 outside —
 *      an absolute detour of 1 tile at a ratio of 1.05, comfortably inside the
 *      1.2 target … Nothing is owed here. [audit tokens: 35 2 33 17.5 0 20 91]"
 *
 * against a real 33-tile detour at ratio 17.5 — and it PASSED, because every
 * audited numeral was present, in a bracket, at the end. The paragraph — the
 * thing a reviewer actually reads — asserted the exact opposite of the audit.
 *
 * The same round found the other half of it: only 60 of 293 declarations carried
 * an AUDITED FACTS clause at all, and which ones did was an accident of which
 * kinds a previous reviewer had attacked. Uniformity by hand does not stay
 * uniform.
 *
 * So the paragraph is no longer written. For every AUDITED kind the prose is
 * GENERATED from the structured record by the functions below, the producer
 * calls `renderDecl` to fill `detail`, and the validator calls the SAME function
 * on the record the plan publishes and requires the result to equal the shipped
 * paragraph (whitespace-insensitive). Three consequences, and they are the
 * point:
 *
 *   · A paragraph cannot contradict its record, because it IS its record.
 *   · A record that is corrupted to match a false paragraph still fails, because
 *     the validator re-derives the record's fields from terrain and the shipped
 *     structure lists (that is the round-11 content audit, still there).
 *   · Everything the paragraph says has to be IN the record — so a claim the
 *     producer wants to make in prose has to be a field somebody can check.
 *     Narrative that is not a claim about the room belongs in `meta.notes`,
 *     which excuses nothing and is labelled as narration in every reader.
 *
 * WHITESPACE-INSENSITIVE, AND NOTHING ELSE INSENSITIVE. `normText` collapses
 * runs of whitespace and trims. It does not lowercase, it does not strip
 * punctuation, and it does not do fuzzy matching: a one-word edit to a generated
 * paragraph is a mismatch and fails the room. The tolerance exists because JS
 * template concatenation and JSON round-tripping are not stable about newlines,
 * not because a paragraph is allowed to drift.
 *
 * ADDING AN AUDITED KIND. Write the renderer, register it in RENDERERS, and make
 * the producer set `detail` from `renderDecl(sf)`. `AUDITED_KINDS` below is the
 * list the validator enforces identity on; a kind in RENDERERS but not in
 * AUDITED_KINDS is a renderer nobody checks, so the two are asserted equal at
 * load.
 *
 * ...AND SINCE ROUND 13, "AUDITED WHERE AUDITABLE" IS OVER: RENDERERS COVERS
 * EVERY KIND. The eight-kind version of this module was uniform-by-accident in
 * exactly the way the paragraph above says uniformity-by-hand always is — the
 * eight were the kinds a reviewer had attacked, and the ten nobody had attacked
 * went on shipping hand-written prose that could and did contradict its record.
 * `validate.mjs` now asserts at LOAD that the RENDERERS key set equals its own
 * declaration-kind inventory (OBLIGATION_KINDS + OBLIGATION_EXEMPT), and fails
 * at RUNTIME any shipped declaration whose kind has no renderer. A new kind
 * therefore cannot ship a typed paragraph even once.
 */
import { renderMobility, renderCoveredDetour } from "./declprose-mobility.mjs";
import { renderWeakBattery, renderClump, renderTowerRefill } from "./declprose-towers.mjs";
import {
  renderSpawnFan,
  renderCtrlSeats,
  renderCtrlReleased,
  renderRuntimeSearch,
} from "./declprose-hub.mjs";
import { renderShallowLab, renderLabHaul, renderLabRoadEat } from "./declprose-labs.mjs";
import { renderBattlementsCut, renderUnreachableWall } from "./declprose-shell.mjs";

/** collapse whitespace runs and trim — see the header for what this is NOT */
export const normText = (s) => String(s === null || s === undefined ? "" : s).replace(/\s+/g, " ").trim();

/** two paragraphs are the same paragraph iff they differ only in whitespace */
export const proseMatches = (a, b) => normText(a) === normText(b);

const n = (v, fallback = "?") => (v === null || v === undefined ? fallback : v);
const pt = (t) => (t && Number.isInteger(t.x) ? `${t.x},${t.y}` : "?,?");
const pts = (list) => (list || []).map(pt).join(" ");
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const plural = (v, one, many) => (Number(v) === 1 ? one : many);

/**
 * ---------------------------------------------------------------------------
 * eco — the hauler distance this hub costs, and the floor under it.
 * ---------------------------------------------------------------------------
 * Every input is in `sf.eco`. The two clause-selecting conditions (is the
 * controller walk over its gate, is the source sum over its gate) are RE-DERIVED
 * here from the record's own numbers rather than carried as booleans, so a
 * record cannot claim a clause it has not earned.
 */
export function renderEco(sf) {
  const e = sf.eco || {};
  const hub = (sf.tiles || [])[0] || e.hub || null;
  const overCtrl = Number(e.pathController) > Number(e.ctrlGate);
  const overSrc = Number(e.pathSourcesSum) > Number(e.srcGate);
  const skip = Number(e.seedSkip) || 0;
  const bits = [];
  if (overCtrl) {
    bits.push(
      `the controller is a ${e.pathController}-tile walk ${n(e.ctrlBearing)} of the hub, ` +
        `${e.pathController - e.ctrlMedian} over the fleet median of ${e.ctrlMedian} ` +
        `(${round2(e.pathController / e.ctrlMedian)}x it; the gate is ${e.ctrlGate}, whichever is lower of ` +
        `the absolute ${e.ctrlAbs} and ${e.relMult}x the median) — every upgrader trip and every ` +
        `controller-link haul pays it`,
    );
  }
  if (overSrc) {
    bits.push(
      `the source paths sum to ${e.pathSourcesSum} (${(e.srcBearings || []).join(" + ")}), ` +
        `${e.pathSourcesSum - e.srcMedian} over the fleet median of ${e.srcMedian} ` +
        `(${round2(e.pathSourcesSum / e.srcMedian)}x it; the gate is ${e.srcGate}, whichever is lower of ` +
        `the absolute ${e.srcAbs} and ${e.relMult}x the median) — paid on every miner rotation and every ` +
        `container haul`,
    );
  }
  if (skip > 0) {
    bits.push(
      `the hub sits on seed rank ${skip}: the ${skip} better-scoring ${plural(skip, "confluence", "confluences")} in ` +
        `this room could not hold the RCL8 program at any rung of the shell ladder, so the planner walked ` +
        `down the list and bought the distance instead of shipping a room short on extensions`,
    );
  }
  // THE FLOOR, AND THE METRIC IT IS MEASURED IN. Both branches are derived from
  // the record; the chebyshev one carries its own ring correction in the
  // sentence, because that correction is the round-12 finding and a reader has
  // to be able to see the arithmetic rather than take the number.
  const floorProof =
    e.anchorFloorBasis === "walk"
      ? `the widest separation is ${e.anchorWalkSpread} tiles OF WALK (${e.walkPair}; they are only ` +
        `${e.anchorSpread} apart as the crow flies, and the difference is the terrain between them), and ` +
        `two anchors ${e.anchorWalkSpread} apart on foot cannot both sit within ${e.walkFloor} steps of any ` +
        `tile in the room, so a walk of at least ${e.walkFloor} to the far one is owed by EVERY hub this ` +
        `room admits, not by this one. THE SEPARATION IS MEASURED IN THE SAME METRIC AS THE DISTANCES IT ` +
        `BOUNDS: min over every tile t of (steps from t to the first anchor's work ring + steps from t to ` +
        `the second's), which is exactly the ring-seeded field \`pathController\` and \`pathSourcesSum\` ` +
        `are read off`
      : `the widest separation is ${e.anchorSpread} tiles as the crow flies (${e.spreadPair}), and two ` +
        `anchors ${e.anchorSpread} apart cannot both sit within ${e.chebFloor} of any tile in the room ONCE ` +
        `THE RING IS PAID FOR — the distances this bounds are measured to each anchor's work RING, which ` +
        `saves a step at each end, so the bound is ceil((${e.anchorSpread} - 2) / 2) = ${e.chebFloor} and ` +
        `not ceil(${e.anchorSpread} / 2). A walk of at least ${e.chebFloor} to the far one is owed by EVERY ` +
        `hub this room admits, not by this one` +
        (e.anchorWalkSpread === null || e.anchorWalkSpread === undefined
          ? ` (measured as chebyshev: at least one anchor pair in this room has no walkable path between ` +
            `them at all, so a walk bound is not derivable)`
          : ` (the walk separation is ${e.anchorWalkSpread}, whose floor of ${e.walkFloor} bounds no higher ` +
            `than the chebyshev one here)`);
  const cause =
    skip > 0
      ? `${skip} closer-scoring ${plural(skip, "seat", "seats")} WERE tried and rejected — none of them held ` +
        `the RCL8 program at any rung of the shell ladder — so this distance was bought, not preferred.`
      : `NO closer seat was rejected: this hub is seed rank 0 of ${n(e.seedPool)} scored confluences and it ` +
        `composed the whole RCL8 program on its own ladder, so the eco score was never overruled by ` +
        `anything. The anchors are genuinely far apart in this room — ${floorProof}.`;
  const opener =
    skip > 0
      ? `hauler distances in this room were BOUGHT, not preferred: ${bits.join("; ")}. `
      : `hauler distances in this room are at least ${e.anchorWalkFloor} tiles of terrain verdict — that is ` +
        `the floor the anchor spread proves below, and the rest is the shape of this basin: ` +
        `${bits.join("; ")}. `;
  return (
    opener +
    `The hub sits at ${pt(hub)} on the only basin that holds the program — ${n(e.basin)} tiles reachable ` +
    `from the seed, core pocket ${n(e.coreSize)}. ${cause} Capping this silently is the anti-pattern; the ` +
    `numbers are here so the trade can be argued with. ` +
    `AUDITED FACTS, re-derivable and therefore generated from the record rather than typed beside it: the ` +
    `controller walk from storage is ${e.pathController} ${plural(e.pathController, "tile", "tiles")}, the ` +
    `source path sum is ${e.pathSourcesSum}, the widest anchor separation is ${e.anchorSpread} as the crow ` +
    `flies and ` +
    `${e.anchorWalkSpread === null || e.anchorWalkSpread === undefined ? "not walkable at all" : `${e.anchorWalkSpread} of walk`} ` +
    `in the same ring-seeded metric those two distances are measured in, and the floor that proves below ` +
    `them is ${e.anchorWalkFloor} (basis: ${e.anchorFloorBasis}). This paragraph is generated from that ` +
    `record by one function the validator also runs, so it cannot say anything the record does not.`
  );
}

/**
 * ---------------------------------------------------------------------------
 * extensions|shallow — the slots that stayed in the ranged band, and the whole
 * search that says why, INCLUDING the class the old paragraph claimed to have
 * swept and never reported.
 * ---------------------------------------------------------------------------
 * The opener used to say layer 7b swept for free deep floor "already road-faced
 * OR ONE PAVE AWAY" and then report only the already-faced count. The one-pave
 * class was never counted, never reported and never priced — and in E12S6 it
 * contained a tile the room could have taken for FREE (34,13, paving 35,13),
 * retiring a rampart at zero cost to the lap. A search scope stated in prose and
 * reported by nothing is the defect this whole module exists to end, so both
 * classes are counted, both are printed, and the free one is TAKEN before this
 * declaration is ever written.
 */
export function renderShallowExt(sf) {
  const sh = sf.shallowExt || {};
  const se = sh.search || {};
  const slots = sh.slots || [];
  return (
    `SHALLOW EXTENSIONS DECLARED: ${sh.count} of this room's ${sh.total} ${plural(sh.total, "extension", "extensions")} ` +
    `stand at depth < ${sh.depthSafe} and each rents a personal rampart forever — ` +
    `${round2(sh.count * 0.03)} e/tick of upkeep that never ends, and ${sh.count} ` +
    `${plural(sh.count, "structure", "structures")} a ranged attacker can hit from outside the wall. This is a ` +
    `cost the room took because it could not do better, and here is the search that says so, re-run at the ` +
    `end against the board this room ships. ` +
    `THE CANDIDATE SCAN, BOTH CLASSES, COUNTED SEPARATELY: layer 7b swept all ${n(se.interiorTiles, 2304)} ` +
    `interior positions for free, deep, engine-legal floor and found ${n(se.freeDeepRoadFaced, 0)} already ` +
    `road-faced and ${n(se.freeDeepOnePave, 0)} more that are ONE PLAIN PAVE from the network. Of the ` +
    `road-faced class, ${n(se.spentOnAdds, 0)} went to the backfill (extensions this room did not have at ` +
    `all, which outranks retiring a rampart), ${n(se.spentOnMoves, 0)} took a relocated shallow slot, and ` +
    `${n(se.left, 0)} were still on the table. Of the one-pave class, ${n(se.paveTaken, 0)} were TAKEN — a ` +
    `move to one of them costs a road tile at 0.001 e/tick against a rampart at 0.030, a factor of 30, so ` +
    `any that were free were taken before this paragraph was written — and ${n(se.paveLeft, 0)} were left. ` +
    `PER SLOT, AND THE OUTCOMES ARE DIFFERENT FACTS: ${sh.impossible} ${plural(sh.impossible, "slot", "slots")} ` +
    `had NO deep target of any kind, ${sh.refusedByTest} had targets that the shipped-board acceptance test ` +
    `refused (a structure loses its last walkable face, a road is cut from the sitter, a battlement is ` +
    `stranded, the controller loses a claim seat or a park), and ${sh.priced} had a LEGAL target whose cost ` +
    `is the defender lap. ` +
    slots
      .map(
        (s) =>
          `${s.x},${s.y} (depth ${s.depth}, ${s.targets} ${plural(s.targets, "target", "targets")} offered): ${s.why}`,
      )
      .join(" · ") +
    `. ${
      sh.priced > 1 && sh.sharedTarget
        ? `NOTE ON THE PRICES ABOVE: ${sh.priced} slots quote the same target ${sh.sharedTarget}, so at most ` +
          `one of them could ever take it. The binding constraint on the other ${sh.priced - 1} is SUPPLY, ` +
          `not the lap, and this paragraph does not present them as ${sh.priced} independent trades. `
        : ``
    }WHAT IS NOT CLAIMED: that no arrangement of sixty extensions could ever do better — this is a ` +
    `statement about the completed post-prune search on this enclosure, priced, and it is here so the ` +
    `trade can be argued with instead of capped in silence.`
  );
}

/**
 * ---------------------------------------------------------------------------
 * misc|off-network — the mineral seat that is deliberately not paved.
 * ---------------------------------------------------------------------------
 */
export function renderOffNetwork(sf) {
  const m = sf.offNetwork || {};
  return (
    `THE MINERAL SEAT IS OFF THE ROAD NETWORK, BY DESIGN. The container at ${pts(sf.tiles)} ` +
    `(mineral ${pt(m.mineral)}) has no road and no other container on any of its eight neighbours, ` +
    `re-derived over the FINISHED road set — layer 5's own reading is taken before the extension corridors, ` +
    `the rampart spurs and the swamp paving exist, and in a good part of the fleet one of those runs past ` +
    `the seat and puts it on the network after all (this room is not one of them; ` +
    `meta.misc.mineralSeatNetTiles is the empty list that says so). WHY IT IS NOT PAVED: a mineral is one ` +
    `deposit on a ${n(m.regenTicks, 50000)}-tick regeneration cooldown behind an extractor on a ` +
    `${n(m.extractorCooldown, 5)}-tick cooldown, so the seat is visited a few times an hour, and a road ` +
    `decays whether or not anything walks it. The walk saved does not pay the decay, and the goal ` +
    `document's own rule for the mineral is that its proximity "barely matters". WHAT IS GUARANTEED ANYWAY: ` +
    `the seat is reachable — the mineral work stand is re-derived from the sitter over the engine's ` +
    `obstacles in every room and the validator re-derives it too — and the container is a network NODE for ` +
    `everything else, so nothing else in the room is stranded by it. AUDITED: ${n(m.seats, 1)} seat ` +
    `${plural(n(m.seats, 1), "tile", "tiles")}, ${n(m.netTiles, 0)} of the eight neighbours carrying a road ` +
    `or another container, on a network of ${n(m.roads, 0)} road tiles.`
  );
}

/**
 * ---------------------------------------------------------------------------
 * shell — a link standing ON the wall.
 * ---------------------------------------------------------------------------
 * Re-derived at layer 7 over the wall the room SHIPS. Layer 2 filed this over
 * layer 2's cut, and the prune and the seal reconciliation both move the cut
 * afterwards: twelve rooms shipped a link on the shipped cut with no
 * declaration at all, because the tile only became a cut tile after layer 2 had
 * finished looking. Same defect shape as every other "measured on a wall the
 * room does not have" finding in this planner.
 */
export function renderLinkOnCut(sf) {
  const r = sf.linkOnCut || {};
  return (
    `${r.onCut}/${r.cutTiles} cut tiles carry a link (${pts(sf.tiles)}) — a link is an ` +
    `OBSTACLE_OBJECT_TYPE, so no defender, repairer or battlement can ever occupy those ramparts, and ` +
    `${r.onCut} ${plural(r.onCut, "tile", "tiles")} of this room's garrison line ${plural(r.onCut, "is", "are")} ` +
    `permanently unmanned. ${
      r.forced
        ? `The min-cut was run with every link tile at infinite capacity first and no protect radius in ` +
          `this room produced an enclosure at all under that rule: the link sits on the only isthmus this ` +
          `basin has, and the wall has to go through it.`
        : `The min-cut layer 2 negotiated did NOT run through a link — it routed around every one of them. ` +
          `This tile became wall afterwards, when layer 7's inert prune and the single-removal seal ` +
          `reconciliation moved the cut onto ramparts layers 2-6 had laid as bubbles. That is a wall the ` +
          `enclosure negotiation never scored, and it is declared here rather than at layer 2 because ` +
          `layer 2 could not have known.`
    } AUDITED: measured over the ${r.cutTiles}-tile cut this room SHIPS, not the ${n(r.negotiatedCutTiles, "?")} ` +
    `layer 2 negotiated.`
  );
}

/**
 * ---------------------------------------------------------------------------
 * A REDUNDANT-CUT REFUSAL, PRICED.
 * ---------------------------------------------------------------------------
 * Not a declaration kind — this renders one entry of
 * `meta.shell.redundantCut.reasons`, which shipped as four BYTE-IDENTICAL
 * boilerplate strings asserting that deleting the tile "PROMOTES another rampart
 * into the seal … and every cut-shaped metric in this room would be re-derived
 * over a different wall". No room-specific number appeared in any of them, and
 * when the deltas were actually measured one of the four had a price of ZERO
 * (E16S2 22,32: cut 64->64, weakest face 2670->2670, lap 0.00->0.00, exterior
 * identical at 1812 tiles) and two more moved the cut DOWNWARD, contradicting
 * the boilerplate's own "the wall would move onto tiles bought as bubbles" in
 * the direction it implies.
 *
 * So a reason is now a STRUCTURED object — `{class, pricedDeltas:{cut,
 * weakestFace, lap}}` — rendered to text by this function, and the validator
 * re-derives the deltas by actually deleting the tile. "Naming a reason is not
 * having one" is the document's own sentence; this is what it costs to mean it.
 */
export function renderCutReason(r) {
  if (!r || typeof r !== "object") return String(r || "");
  if (!r.pricedDeltas) {
    // an unpriced class (interior-floor promotion, personal cover, keep-class):
    // these are refusals whose argument is a NAMED TILE rather than a delta, and
    // the tile is the price.
    return `${r.class}${r.tile ? ` — ${r.tile}` : ""}${r.why ? ` — ${r.why}` : ""}`;
  }
  const d = r.pricedDeltas;
  const moved = [
    d.cut && d.cut.before !== d.cut.after ? `the cut goes ${d.cut.before} -> ${d.cut.after}` : null,
    d.weakestFace && d.weakestFace.before !== d.weakestFace.after
      ? `the weakest sealing tile goes ${d.weakestFace.before} -> ${d.weakestFace.after} damage`
      : null,
    d.lap && round2(d.lap.before) !== round2(d.lap.after)
      ? `the gated defender lap goes ${round2(d.lap.before)} -> ${round2(d.lap.after)}`
      : null,
  ].filter(Boolean);
  return (
    `${r.class} — PRICED BY DELETING IT AND RE-DERIVING: ` +
    (moved.length
      ? `${moved.join(", ")}. That is the bill this rampart is buying off, and it is larger than the ` +
        `${round2(0.03)} e/tick the rampart costs.`
      : `the cut stays at ${d.cut.before}, the weakest sealing tile stays at ${d.weakestFace.before} damage ` +
        `and the gated defender lap stays at ${round2(d.lap.before)}. NOTHING MOVES — the price of deleting ` +
        `this rampart is ZERO, so it is not refused, it is pruned.`)
  );
}

/**
 * Every (gate, kind) whose paragraph is generated. The key is
 * `${gate}|${kind ?? ""}`, matching the shape the validator keys everything on.
 */
export const RENDERERS = {
  "eco|": renderEco,
  "extensions|shallow": renderShallowExt,
  "misc|off-network": renderOffNetwork,
  "shell|": renderLinkOnCut,
  "towers|weak-battery": renderWeakBattery,
  "towers|clump": renderClump,
  "mobility|": renderMobility,
  "mobility|covered-detour": renderCoveredDetour,
  // --- round 13: the ten kinds that were still hand-written ----------------
  // Eight of eighteen kinds were generated and audited, and which eight was an
  // accident of which kinds a reviewer had attacked. The other ten shipped 31
  // paragraphs assembled inside their producers out of the producers' own
  // locals, which reads like generation and is not — the validator has no way
  // to run a producer's scope. Four demonstrable lies passed on that gap in one
  // round (E2S8 "3 walk" over a record saying 11; E13S3 "0 cut tiles" over 1;
  // E12S5 "feeds 7" over 5, on a pair that is in DECLARABLE_PAIRS and therefore
  // excuses a hard gate; E13S2 "2 hauler tiles" over 12). The set below is now
  // the WHOLE kind inventory, and validate.mjs asserts that at load.
  "spawnfan|sector": renderSpawnFan,
  "ctrlparks|seats": renderCtrlSeats,
  "ctrlparks|released": renderCtrlReleased,
  "runtime|heavy-search": renderRuntimeSearch,
  "labs|shallow-lab": renderShallowLab,
  "labs|lab-haul": renderLabHaul,
  "labs|lab-road-eat": renderLabRoadEat,
  "battlements|": renderBattlementsCut,
  "battlements|unreachable": renderUnreachableWall,
  "towerrefill|": renderTowerRefill,
};

/**
 * The kinds the validator holds to prose IDENTITY. Equal to the RENDERERS key
 * set by construction — a renderer nobody checks is a renderer that rots, and a
 * checked kind with no renderer would fail every room — and asserted below so
 * the two cannot drift.
 */
export const AUDITED_KINDS = new Set(Object.keys(RENDERERS));
{
  const missing = [...AUDITED_KINDS].filter((k) => typeof RENDERERS[k] !== "function");
  if (missing.length) {
    throw new Error(`declprose.mjs: AUDITED_KINDS names ${missing.join(", ")} with no renderer`);
  }
}

/** the (gate, kind) key this module and the validator both use */
export const declKey = (gate, kind) => `${String(gate || "").toLowerCase()}|${kind ? String(kind) : ""}`;

/**
 * Render the paragraph for a declaration from its own structured record.
 * Returns null when the kind is not audited — the caller then leaves `detail`
 * alone, which is what "audited where auditable" means.
 */
export function renderDecl(sf) {
  if (!sf || typeof sf !== "object") return null;
  const f = RENDERERS[declKey(sf.gate, sf.kind)];
  return f ? f(sf) : null;
}
