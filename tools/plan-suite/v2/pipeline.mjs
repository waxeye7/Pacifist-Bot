/**
 * Plan v2 — the layer pipeline itself.
 *
 * Lives apart from plan.mjs (gallery) and export-anim.mjs (frames) so both
 * consumers run the EXACT same stack. An animation that disagrees with the
 * gallery is worse than no animation.
 *
 * Layer order and why:
 *   1 hub        grow from the room (anchors → seed → core → claims)
 *   2 shell      min-cut BEFORE contents, so nothing can be placed outside
 *   3 towers     pure optimisation over a finished shell
 *   4 labs       the one justified stamp
 *   5 misc       nuker + observer + extractor/mineral works
 *                (never factory, never power spawn)
 *   6 extensions the flexible mass — flows into whatever space is left
 *   7 late roads  rampart spurs + extension-face net + dead-end prune, last
 *                so they never steal a tile from the 60 extensions
 */
import { D4, D8, PARK_PROTECT, invalidateExterior, isWall, key, walkable } from "./shared.mjs";
import { planHub, distField } from "./layer-hub.mjs";
import { BUILT_OBSTACLES, interiorWalk, planShell, RADII_WIDE } from "./layer-shell.mjs";
import { CLUMP_NOTE, MAX_REFILL, MIN_SAT, REFILL_NOTE, planTowers } from "./layer-towers.mjs";
import { planLabs } from "./layer-labs.mjs";
import { mineralSeatCensus, planMisc, renderMineralOffNetworkWhy } from "./layer-misc.mjs";
import { planExtensions } from "./layer-ext.mjs";
import { finalizeRoom, planWallRoads } from "./layer-walls.mjs";
import { renderDecl } from "./declprose.mjs";
import { renderSatBasis } from "./declprose-towers.mjs";
import { pushNote } from "./declprose-notes.mjs";
// NOTE: layer-ext's RAMPARTS_PER_RATIO / MOBILITY_RAMPART_CAP are deliberately
// NOT imported any more. They price a defender LANE; the enclosure trade below
// has its own published price and its own reasons — see MOBILITY_ENCLOSURE_*.

export const EXT_TARGET = 60;
/** a structure shallower than this is inside a ranged attacker's reach from the wall */
export const DEPTH_SAFE = 4;

/**
 * One full layer stack on a fresh hub plan. Deterministic, so it can be
 * re-run under different shell options — which is how the 60/60 extension
 * guarantee works: if the tight shell cannot hold the program, we buy a
 * bigger bubble rather than ship a room that is short on extensions.
 */
export function composePlan(d, shellOpts = {}) {
  const hub = planHub(d.terrain, d.objects, shellOpts);
  if (hub.error) return { room: d.room, error: hub.error };
  const plan = { room: d.room, terrain: d.terrain, ...hub };
  // meta.shortfalls — the honest-shortfall channel. Layer 1 may already have
  // filled it (boxed-in source links); every later layer appends. The
  // validator PASSES a declared shortfall with a loud note and FAILS the same
  // violation when it is undeclared.
  plan.meta.shortfalls = [...(plan.meta.shortfalls || [])];

  // ------------------------------------------------------------------
  // WHICH LAYER LAID WHICH ROAD.
  //
  // The animation exporter drew every road in one "LAYER 1 — THE ROADS"
  // stage, before the wall, the towers, the labs and the extensions. That is
  // not when they happen: the eco kit's roads are layer 1, but the tower
  // spurs are layer 3, the lab access is layer 4, the mineral run is layer 5,
  // the extension corridors are layer 6 and the rampart spurs are layer 7.
  // A reviewer trying to check E2S3's lab declaration ("0 anchors with all ten
  // labs deep", which is gated on labs being off the road network) could
  // not recover the mid-pipeline road set from any published artifact,
  // because the artifact asserted a road set that never existed at that
  // moment.
  //
  // Provenance is recorded per TILE rather than as index ranges, because the
  // array is re-sorted into network-BFS order at the end of this function
  // (see the road-order block) and layer 7 deletes dead-end roads out of the
  // middle of it. A tile key survives both; an index does not.
  plan.meta.roadLayer = {};
  const tagRoads = (layer, roads) => {
    for (const r of roads || []) plan.meta.roadLayer[`${r.x},${r.y}`] = layer;
  };
  tagRoads(1, plan.structures.road); // the hub kit's own eco roads

  const shell = planShell(d.terrain, plan, shellOpts);
  if (shell.error) {
    plan.shellError = shell.error;
    return plan;
  }
  plan.structures.rampart = shell.rampart;
  // EVERY SITE THAT MOVES THE RAMPART LIST SAYS SO. `liveExterior`'s memo key
  // would catch all three of this file's sites on its own (the array changes
  // identity here and length at the two pushes below), and that is exactly the
  // "correct by luck" the contract in shared.mjs exists to replace: the key is
  // the belt, these calls are the braces, and a reader looking for "what can
  // invalidate the flood" finds one grep instead of an argument.
  invalidateExterior(plan);
  plan.shell = shell.shell;
  plan.exterior = shell.exterior;
  plan.depth = shell.depth;
  plan.meta.counts.rampart = shell.rampart.length;
  plan.meta.shell = shell.shell;
  // ------------------------------------------------------------------
  // MM2 (round 25) — THE CUT THE FROZEN FLOOD WAS TAKEN AGAINST.
  //
  // `plan.exterior` is frozen here, once, and it is exactly
  // `exteriorFlood(terrain, <this cut>)` — layer 2 keeps `cut` and the flood in
  // lockstep through the expansion and the useless-cut prune, and nothing
  // re-freezes it afterwards. Layers 3-6 read that frozen enclosure and publish
  // what it withheld from them (see checkEnclosureContract in shared.mjs), and
  // a reader re-deriving those readings needs the flood, which means needing
  // this cut.
  //
  // `meta.shell.cut` is NOT this cut in every room: layer 7's inert prune
  // deletes tiles from it and `reconcileSeal` adopts new ones into it, in 29 of
  // this fleet's rooms (34 tiles in, 46 out — read `meta.shell.cutDrift`, which
  // names the pass responsible for each one, rather than this sentence).
  // Deriving the withheld set off the SHIPPED cut therefore reproduces 165 of
  // 172 rooms and silently misses the ones where the answer matters most. The
  // snapshot is taken here, before any of that, because "the list as it was at
  // this instant" is not recoverable from a mutated array however it is
  // reasoned about.
  //
  // (Round 25 typed "seven" here, in shared.mjs and in validate.mjs, from the
  // round-24 measurement of a DIFFERENT question — 7 is how many rooms the
  // withheld derivation gets WRONG off the shipped cut, not how many rooms move
  // the cut. Criticism 123 published the right figure, 29, in the same round.
  // The numeral audit could not see any of the three because all three were
  // spelled out; it parses word-numbers now. MM4, round 26.)
  //
  // It is a plain copy of the tiles, not the array: both later mutations REPLACE
  // `shell.cut` with a new array, so a shared reference would survive by luck
  // and stop surviving the day one of them splices in place.
  // ------------------------------------------------------------------
  plan.meta.shell.cutAtFreeze = (shell.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
  // ...AND THE DRIFT AWAY FROM IT IS A DECLARED LIST, EMPTY OR NOT. Layer 7
  // appends one entry per tile it adds to or removes from the cut (see
  // noteCutDrift, layer-walls.mjs); the list is created here so that a room that
  // never moves its cut publishes `[]` and not `undefined` — "no drift" and "no
  // record of drift" are the two answers this record exists to tell apart.
  plan.meta.shell.cutDrift = [];
  // ...AND WHICH PASSES RAN AT ALL, WHETHER OR NOT THEY MOVED A TILE (MF1,
  // round 27). An empty `cutDrift` is two different rooms: one whose layer-7
  // passes looked and found nothing to do, and one whose evidence was deleted
  // and whose tiles were absorbed into the anchor. The markers tell them apart —
  // four entries per room, one per invocation, each carrying its own add/remove
  // counters taken off the cut list — so "this pass moved N tiles" is a claim
  // the drift rows must satisfy rather than a silence anyone can produce.
  plan.meta.shell.cutPasses = [];
  // a wall segment the interior cannot walk to is the room beating the planner,
  // the same way a far lobe no tower can cover is — same channel, same rules
  plan.meta.shortfalls.push(...(shell.shortfalls || []));
  for (const b of shell.bubbleRejected || []) {
    plan.meta.shortfalls.push({
      gate: "rampart",
      detail:
        `${b.x},${b.y} wants a personal rampart but sits on the border band ` +
        `(x/y 1 or 48) with a non-wall edge triple — engine returns ` +
        `ERR_INVALID_TARGET (utils.js:120-143)`,
      tiles: [{ x: b.x, y: b.y }],
    });
  }

  reserveParkSeats(d.terrain, plan, shellOpts.parkCap);
  // the exact options this composition was built with, so the park-release retry
  // below can re-compose THIS room and nothing else — see maybeReleaseParks
  plan.meta.composeOpts = { ...shellOpts, shellCache: undefined };

  const tw = planTowers(d.terrain, plan, shellOpts);
  if (tw.error) plan.towerError = tw.error;
  else {
    plan.structures.tower = tw.tower;
    plan.structures.road.push(...tw.roads);
    tagRoads(3, tw.roads);
    plan.meta.counts.tower = tw.tower.length;
    plan.meta.towers = tw.towersMeta;
    // a shell whose far lobe no legal deep tile can reach is the room beating
    // the planner, not the planner being sloppy — declare it, loudly
    plan.meta.shortfalls.push(...(tw.shortfalls || []));
  }

  const lb = planLabs(d.terrain, plan);
  if (lb.error) plan.labError = lb.error;
  else {
    plan.structures.lab = lb.lab;
    plan.labInputs = lb.labInputs;
    // In a cramped room the diamond is allowed to sit on eco road (layer-labs
    // pass 3/4, guarded by a re-derivation of the whole network). A road tile
    // under a lab conducts nothing, so it comes OUT of the plan and out of the
    // provenance map — leaving it in would ship a road the validator counts,
    // the renderer draws, and no creep can ever walk.
    if (lb.removeRoads?.length) {
      const gone = new Set(lb.removeRoads.map((r) => `${r.x},${r.y}`));
      plan.structures.road = plan.structures.road.filter((r) => !gone.has(`${r.x},${r.y}`));
      for (const k of gone) delete plan.meta.roadLayer[k];
    }
    plan.structures.road.push(...lb.roads);
    tagRoads(4, lb.roads);
    if (lb.shallowLabs.length) {
      plan.structures.rampart.push(...lb.shallowLabs);
      invalidateExterior(plan); // lab cover moves the wall — see planShell above
    }
    plan.meta.counts.lab = lb.lab.length;
    plan.meta.labs = lb.labsMeta;
  }

  const ms = planMisc(d.terrain, plan);
  if (ms.error) plan.miscError = ms.error;
  else {
    plan.structures.nuker = ms.nuker;
    plan.structures.observer = ms.observer;
    // m11: the extractor is the one structure allowed on an object tile
    if (ms.extractor.length) plan.structures.extractor = ms.extractor;
    if (ms.mineralContainer.length) plan.structures.container.push(...ms.mineralContainer);
    if (ms.bubbles.length && plan.structures.rampart) {
      plan.structures.rampart.push(...ms.bubbles);
      invalidateExterior(plan); // the mineral seat's bubble, same reason
    }
    plan.meta.shortfalls.push(...(ms.shortfalls || []));
    for (const b of ms.bubbleRejected || []) {
      plan.meta.shortfalls.push({
        gate: "rampart",
        detail:
          `mineral seat ${b.x},${b.y} is on the border band with a non-wall ` +
          `edge triple — its rampart bubble can never be built`,
        tiles: [{ x: b.x, y: b.y }],
      });
    }
    plan.structures.road.push(...ms.roads);
    tagRoads(5, ms.roads);
    plan.meta.counts.nuker = ms.nuker.length;
    plan.meta.counts.observer = ms.observer.length;
    plan.meta.counts.extractor = ms.extractor.length;
    plan.meta.counts.container = plan.structures.container.length;
    plan.meta.misc = ms.miscMeta;
  }

  const ex = planExtensions(d.terrain, plan);
  if (ex.error) plan.extError = ex.error;
  else {
    plan.structures.extension = ex.extension;
    // corridor stubs: the roads the extension mass grew along
    if (ex.roads?.length) plan.structures.road.push(...ex.roads);
    tagRoads(6, ex.roads);
    if (ex.shallowExts.length && plan.structures.rampart) {
      plan.structures.rampart.push(...ex.shallowExts);
      invalidateExterior(plan); // shallow-extension cover, same reason
    }
    plan.meta.counts.extension = ex.extension.length;
    plan.meta.extensions = ex.extMeta;
  }

  // ------------------------------------------------------------------
  // WHY THIS ROOM WENT SHALLOW — SAID AFTER LAYER 7, NOT BEFORE IT.
  //
  // This block used to sit here, inside the layer-6 branch, and that is a
  // measurable lie in every room layer 7 changes. E3S7's note read "SHALLOW
  // EXTENSIONS: 6 of 60 sit at depth < 4 and rent a personal rampart forever";
  // the shipped room has exactly ONE shallow extension and exactly one
  // extension carrying a rampart. The gap of five is that room's
  // `inertPruned: 5` — the note was published before the prune it describes,
  // about a board that stopped existing one layer later.
  //
  // Worse than the arithmetic: the CAUSE sentence. "The deep skeleton ran out
  // of diggable deep floor" is a true statement about layer 6's board and a
  // false one about the room, because layer 7 hands back deep, road-faced floor
  // that layer 6 never saw. So the note is now generated below, after layer 7b
  // has actually gone looking, and it reports what that search FOUND rather
  // than what layer 6's counters INFERRED.
  // ------------------------------------------------------------------
  const noteExtensions = (ex, reflow) => {
    if (!ex || ex.error) return;
    //
    // A shallow extension is a personal rampart forever, so a room that ships
    // one owes an explanation. Two earlier versions of this sentence were
    // checked by reviewers and both were refuted by the room's own tiles:
    // "deep floor with no road face and no budget left to give it one" (false
    // in six rooms), and then "the deep skeleton ran out of diggable deep
    // floor" (false in every room layer 7's prune hands floor back to). The
    // rule that survived both is that this note may only REPORT a search, and
    // the search it reports has to have been run against the shipped board.
    // Layer 7b is that search. Its census is the evidence.
    const rf = reflow || null;
    const shallowNow = rf ? rf.shallow.length : ex.extMeta.shallow;
    const total = plan.structures.extension.length;
    const l6moved = ex.extMeta.relocatedCount || 0;
    const l7moved = rf ? rf.moved.length : 0;
    if (shallowNow > 0 || l6moved > 0 || l7moved > 0) {
      // ------------------------------------------------------------------
      // THE RECORD FIRST, THE PARAGRAPH SECOND. Round 16 moved this paragraph
      // — the longest hand-written note in the planner, with three nested
      // branch families and thirty interpolated locals — into
      // declprose-notes.mjs, for the same reason declarations moved in round 13
      // and `negotiated` moved in round 15: prose a producer TYPES cannot be
      // checked by a validator, and anchored regexes over it leave everything
      // outside the anchors unexamined. Every figure below is a field of the
      // record; the sentence is a function of the record and nothing else.
      // ------------------------------------------------------------------
      const rec = {
        shallowNow,
        total,
        extTarget: EXT_TARGET,
        mobilityTarget: MOBILITY_TARGET,
        l6: l6moved
          ? {
              moved: l6moved,
              tiles: (ex.extMeta.relocated || []).map((m) => ({
                from: { x: m.from.x, y: m.from.y },
                to: { x: m.to.x, y: m.to.y },
              })),
            }
          : null,
        l7: l7moved
          ? {
              moved: l7moved,
              tiles: rf.moved.map((m) => ({
                from: { x: m.from.x, y: m.from.y },
                fromDepth: m.fromDepth,
                to: { x: m.to.x, y: m.to.y },
                toDepth: m.toDepth,
              })),
              rampartsRetired: rf.rampartsRetired.length,
            }
          : null,
        // WHAT IS LEFT, AND WHY — quoted from the post-prune search, never
        // inferred from layer 6's counters. `freeDeepRoadFaced` is the number of
        // tiles that passed every hard filter (deep, free, inside the wall,
        // engine-legal, already road-faced, reachable by a builder);
        // `refusedCount` is how many were examined and rejected, and the first
        // of those reasons are carried in the shortfall's evidence so the claim
        // can be argued with tile by tile.
        search: rf
          ? {
              interiorTiles: rf.search.interiorTiles,
              // OF10: the sweep is a 48x48 BAND, and both channels called its
              // 2304 positions "interior tiles" in rooms that hold 178 of them.
              // Both figures are printed now and each is called what it is.
              bandSide: rf.search.bandSide,
              interiorWalkable: rf.search.interiorWalkable,
              freeDeepRoadFaced: rf.search.freeDeepRoadFaced,
              freeDeepOnePave: rf.search.freeDeepOnePave,
              paveTaken: rf.search.paveTaken,
              paveLeft: rf.search.paveLeft,
              // OM2 (round 27) — the opening one-pave class followed forward,
              // so the note's worked example is a tile of THIS room's that
              // really did leave the class untaken. The parenthetical used to
              // name E12S6's 35,13, which the same paragraph lists as MOVED.
              openingTaken: rf.search.openingTaken,
              openingStill: rf.search.openingStill,
              openingExited: rf.search.openingExited,
              refusedCount: rf.search.refusedCount,
              refusedExaminations: rf.search.refusedExaminations,
              spentOnAdds: rf.search.spentOnAdds,
              spentOnMoves: rf.search.spentOnMoves,
              left: rf.search.left,
            }
          : null,
        // THE TRADE THIS ROOM REFUSED, PRICED. A relocation retires a
        // forever-rampart and can lengthen the garrison's lap; layer 7b will not
        // spend the second to buy the first, and the ones it therefore did NOT
        // take are stated with both numbers rather than dropped silently. This
        // is the E11S7 shape a reviewer had to reconstruct by hand: "10
        // forever-ramparts for 0.5 of a lap the room already declares as failed
        // at 13.5 ... the plan never states it."
        //
        // WHICH CEILING BOUND is in the record too, because there are three and
        // a reader needs to know which one refused the trade: the lap the room
        // already had, the RELAXED version a badly-failing room is entitled to
        // (CEILING_STRICT_BAND in layer-ext — the E11S7 fix), and layer 6's
        // published bound, which is a proof and is never relaxed.
        lap: rf
          ? {
              before: rf.lapBeforeMoves,
              after: rf.lapAfterMoves,
              ceiling: rf.lapCeiling,
              ceilingSlack: rf.lapCeilingSlack,
              ceilingSlackPct: rf.lapCeilingSlackPct,
              ceilingStrictBand: rf.lapCeilingStrictBand,
              ceilingBound: rf.lapCeilingBound,
              bound:
                plan.meta.extensions?.laneMeta?.bounded === undefined
                  ? null
                  : plan.meta.extensions.laneMeta.bounded,
              slackSpent: !!rf.moved?.length,
              // ONLY A SLOT THIS ROOM STILL SHIPS SHALLOW MAY BE PRICED AS
              // REFUSED (O7, round 19). `boundRollback` is layer 7b's log of
              // moves the lap ceiling threw away — and pass (2b2) then offers
              // every rolled-back slot the REST of the target order, so a slot
              // refused here is very often moved a few lines later. The record
              // carried the whole log, so the note priced trades the room had
              // already taken: E15S2 published "3 further shallow slot(s) could
              // have moved onto free deep floor — 20,17->16,22 8,22->18,26
              // 11,26->17,25 — retiring 3 personal rampart(s)" in the same
              // paragraph as "every shallow slot this room laid was relocated
              // onto deep floor; it ships none", with no extension and no
              // rampart on any of the three named tiles. Same in E13S6 and
              // E1S8. `rf.shallow` is the post-7b census — the slots the room
              // actually ships shallow — so the refusal is filtered against the
              // SHIPPED board and a trade that was reopened and taken stops
              // being reported as refused.
              rollback: (rf.boundRollback || [])
                .filter((m) => (rf.shallow || []).some((s) => s.x === m.from.x && s.y === m.from.y))
                .map((m) => ({
                  from: { x: m.from.x, y: m.from.y },
                  to: { x: m.to.x, y: m.to.y },
                  wouldLap: m.wouldLap,
                })),
            }
          : null,
      };
      pushNote(plan, "shallowExt", rec);
      // ------------------------------------------------------------------
      // ...AND A SHALLOW EXTENSION IS A DECLARATION, NOT A NOTE.
      //
      // [r22-waived: the state of the fleet BEFORE this declaration existed —
      // the defect it was added to close, not a reading of the shipped board.]
      // 28 shallow extensions shipped across 5 rooms with ZERO entries in the
      // shortfall channel — no `extensions|shallow` kind existed fleet-wide —
      // while the goal document claimed each one "carries a declaration that
      // reports the post-prune search". A note excuses nothing and nothing
      // reads it; a shallow extension is a real, permanent cost (a personal
      // rampart repaired for the life of the base, and a structure a ranged
      // attacker can hit from outside the wall) taken because the room could
      // not do better. That is precisely what the shortfall channel is for, and
      // the validator now FAILS a room that ships one without this entry.
      //
      // The evidence is the per-slot post-search record layer 7b re-runs
      // against the shipped board (`reflow.shallowRefused`), so every number
      // here is re-derivable: how many deep targets existed, how many were
      // examined, and for each slot either the cheapest legal target with the
      // lap it would cost, or the fact that there is no legal target at all.
      // ------------------------------------------------------------------
      if (shallowNow) {
        const sr = (rf && rf.shallowRefused) || [];
        const tiles = sr.length
          ? sr.map((s) => ({ x: s.x, y: s.y }))
          : (rf?.shallow || []).map((s) => ({ x: s.x, y: s.y }));
        const impossible = sr.filter((s) => !s.targets).length;
        const priced = sr.filter((s) => s.bestLegal).length;
        const refusedByTest = sr.filter((s) => s.targets && !s.bestLegal).length;
        // THE PARAGRAPH IS GENERATED — see declprose.mjs. The opener used to
        // claim layer 7b swept for free deep floor "already road-faced OR ONE
        // PAVE AWAY" and then report only the already-faced count; the one-pave
        // class was never counted, never reported and never priced, and in
        // E12S6 it held a tile the room could have taken for free. A search
        // scope stated in prose and reported by nothing is exactly what a
        // generated paragraph makes impossible: the template prints the fields,
        // so a field that does not exist is a sentence that cannot be written.
        const sfShallow = {
          gate: "extensions",
          kind: "shallow",
          tiles,
          count: shallowNow,
          // the structured form the validator re-derives against, and the sole
          // source of every word of the paragraph
          shallowExt: {
            count: shallowNow,
            total,
            depthSafe: DEPTH_SAFE,
            impossible,
            refusedByTest,
            priced,
            slots: sr,
            search: (rf && rf.search) || {},
            // when several surviving slots quote the SAME cheapest legal
            // target, at most one of them can ever take it — the binding
            // constraint on the rest is supply, not the lap, and a paragraph
            // that prints N independent prices for one opportunity is
            // overstating its own case
            sharedTarget: (rf && rf.sharedTarget) || null,
          },
        };
        sfShallow.detail = renderDecl(sfShallow);
        plan.meta.shortfalls.push(sfShallow);
      }
    }
    if (total < EXT_TARGET) {
      plan.meta.shortfalls.push({
        gate: "extension",
        detail:
          `only ${total}/${EXT_TARGET} extensions fit — the widest shell the escalation ladder would ` +
          // O4: layer 2's negotiation free-deep count, named for the board it
          // came off. This clause IS about that board (it is the supply the
          // ladder bought), so the figure stays and the label changes.
          `pay for was negotiated over ${plan.shell?.deepTiles ?? "?"} free deep tiles on layer 2's ` +
          `own board, and the post-prune ` +
          `reflow then scanned the finished interior and found ` +
          `${rf ? rf.search.freeDeepRoadFaced : "?"} free deep road-faced tile(s), rejecting ` +
          `${rf ? rf.search.refusedCount : "?"} more for a stated reason each`,
        tiles: [],
      });
    }
  };

  // late roads LAST — rampart spurs, the extension-face safety net and the
  // dead-end prune, which is the only pass allowed to DELETE earlier roads
  const wr = planWallRoads(d.terrain, plan);
  if (wr.error) plan.wallRoadError = wr.error;
  else {
    if (wr.removeRoads?.length) {
      const gone = new Set(wr.removeRoads.map((r) => `${r.x},${r.y}`));
      plan.structures.road = plan.structures.road.filter((r) => !gone.has(`${r.x},${r.y}`));
    }
    plan.structures.road.push(...wr.roads);
    tagRoads(7, wr.roads);
    plan.meta.walls = wr.wallMeta;
    // layer 7b moved and added extensions; the arrays and the counts are its
    // output, and the layer-6 meta is amended to describe the shipped room
    // rather than the board layer 6 saw.
    if (wr.wallMeta?.reflow && plan.meta.extensions) {
      const rf = wr.wallMeta.reflow;
      plan.meta.extensions.placed = rf.placed;
      plan.meta.extensions.full = rf.placed >= EXT_TARGET;
      plan.meta.extensions.shallow = rf.shallow.length;
      plan.meta.extensions.reflow = {
        added: rf.added,
        moved: rf.moved,
        rampartsRetired: rf.rampartsRetired,
        freeDeepRoadFaced: rf.search.freeDeepRoadFaced,
        // WHERE THE FREE TILES WENT — the census the shallow note argues from.
        // Publishing the headline without it left a reader unable to check the
        // one sentence in that note that had been wrong (E9S2's "could not take
        // any of them", about three tiles the backfill had already spent).
        spentOnAdds: rf.search.spentOnAdds,
        spentOnMoves: rf.search.spentOnMoves,
        freeLeft: rf.search.left,
        refusedCount: rf.search.refusedCount,
        refusedExaminations: rf.search.refusedExaminations,
        refused: rf.search.refused,
        boundRollback: rf.boundRollback,
        lapCeiling: rf.lapCeiling,
        // ...and WHICH ceiling that was. A published number a reader cannot
        // trace back to a rule is how the E11S7 refusal stayed invisible for two
        // rounds: `lapCeiling: 13.5` next to a target of 1.2 looks like a typo
        // until you know it is the room's own incumbent lap. See the ceiling cap
        // note in layer-ext.
        lapCeilingSlack: rf.lapCeilingSlack,
        lapCeilingStrictBand: rf.lapCeilingStrictBand,
        lapCeilingSlackPct: rf.lapCeilingSlackPct,
        lapCeilingBound: rf.lapCeilingBound,
        // ...and the floor under every ceiling: 1.2 is the gate, so 1.2 is also
        // the least a ceiling may be. See the ceiling-floor note in layer-ext —
        // E12S6 refused five forever-ramparts to hold a lap of 0 at 0.
        lapCeilingFloor: rf.lapCeilingFloor,
        // when the pass beat layer 6's bound, the bound it RE-DERIVED over the
        // worst case plus its own moved-to tiles (never spent, re-earned)
        boundRederived: rf.boundRederived,
        lapBeforeMoves: rf.lapBeforeMoves,
        lapAfterMoves: rf.lapAfterMoves,
        // the lift test's verdict acted on, or the reason it was not — layer 7's
        // mobility declaration quotes this rather than asserting that nothing is
        // ever relocated to chase the number
        mobilityRepair: rf.mobilityRepair,
      };
      plan.meta.counts.extension = plan.structures.extension.length;
    }
  }
  // ...and only now is there a room to describe. See noteExtensions.
  noteExtensions(ex, wr.wallMeta?.reflow);

  // m7 (final pass): every layer that places a shallow structure appends its
  // own personal rampart, and those can land on a tile the shell already
  // walls. One rampart per tile, always — counts and upkeep read off this.
  if (plan.structures.rampart) {
    const seen = new Set();
    plan.structures.rampart = plan.structures.rampart.filter((r) => {
      const k = `${r.x},${r.y}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // the deduped list is the same SET of tiles, so this one cannot move the
    // flood — but it does move the array, and the contract is about sites and
    // not about which of them happen to matter. See shared.mjs.
    invalidateExterior(plan);
    if (plan.shell) {
      plan.shell.upkeepPerTick = Math.round(plan.structures.rampart.length * 3) / 100;
    }
  }

  // ------------------------------------------------------------------
  // THE ROAD ARRAY IS A BUILD ORDER, SO IT HAS TO BE ONE.
  // ------------------------------------------------------------------
  // The live bot's roadBudget() takes the first N entries of this array at
  // RCL3 and its doc-comment called the array "priority-ordered". It was not
  // ordered at all — roads were pushed in whatever order the layers happened
  // to generate them (hub kit, then tower spurs, then lab access, then the
  // mineral run, then extension corridors, then layer 7's late roads), and
  // generation order has nothing to do with what a young room can walk to.
  //
  // Measured on the shipped fleet of the round the defect was found in — a
  // 159-room world, before this pass existed, and these are that measurement
  // rather than a live reading: 1272 of the RCL3 road tiles were
  // disconnected from the sitter in 148 of those 159 rooms. E5S1's twenty included
  // `9,10 8,11 8,12 7,13 6,14 5,15 4,16 3,17 3,18 3,19 3,20 3,21 3,22` — a
  // thirteen-tile ribbon starting thirty tiles from the hub, with no path of
  // built road joining any of it to the room. An RCL3 room spent its entire
  // road allowance, and the builder trips to lay it, on pavement nothing
  // could reach.
  //
  // The fix belongs here and not in the bot: the bot cannot re-sort 129 tiles
  // every fifteen ticks, and a consumer working around its producer's broken
  // contract is how the contract stays broken. So the array is emitted in
  // BFS order outward from the sitter over the road network itself, which
  // makes EVERY prefix a connected network — the property roadBudget always
  // assumed and never had. Containers conduct, because creeps walk them and
  // they are built at RCL2, one level before the first road.
  //
  // Ties break on reading order, so the emission is deterministic. Any road
  // the network cannot reach at all (there are none, and layer 7 asserts it)
  // sorts last rather than being dropped — this pass reorders, it never
  // decides what exists.
  if (plan.structures.road && plan.structures.road.length && plan.sitter) {
    const roads = plan.structures.road;
    const rk = (p) => `${p.x},${p.y}`;
    const conduct = new Set(roads.map(rk));
    for (const c of plan.structures.container || []) conduct.add(rk(c));
    conduct.add(rk(plan.sitter));
    const dist = new Map([[rk(plan.sitter), 0]]);
    const q = [plan.sitter];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi];
      const d = dist.get(rk(cur));
      for (const [dx, dy] of D8) {
        const nx = cur.x + dx,
          ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        const k = `${nx},${ny}`;
        if (dist.has(k) || !conduct.has(k)) continue;
        dist.set(k, d + 1);
        q.push({ x: nx, y: ny });
      }
    }
    const INF = 1 << 20;
    plan.structures.road = roads
      .map((r, i) => ({ r, i, d: dist.has(rk(r)) ? dist.get(rk(r)) : INF }))
      .sort((a, b) => a.d - b.d || a.r.y - b.r.y || a.r.x - b.r.x || a.i - b.i)
      .map((e) => e.r);
    plan.meta.roadOrder = {
      by: "network-BFS from the sitter, containers conducting",
      unreachable: plan.structures.road.filter((r) => !dist.has(rk(r))).length,
      maxDist: Math.max(0, ...plan.structures.road.map((r) => dist.get(rk(r)) ?? 0).filter((d) => d < INF)),
    };
  }

  plan.meta.counts.road = plan.structures.road.length;
  plan.meta.counts.rampart = plan.structures.rampart ? plan.structures.rampart.length : 0;

  // DEFENDER MOBILITY, RE-MEASURED ON THE FINISHED BASE, belongs to the winning
  // composition and to nothing else — see finalizeRoom in layer-walls, which is
  // where it and every other re-derivation now happen. It used to run here, once
  // per rung, and an all-pairs BFS over the whole wall is not a per-rung price:
  // moving the whole truth pass onto the winner took the fleet's in-planner time
  // from 486s back to the same order as before it existed.
  remeasureCtrlParks(d.terrain, plan);
  remeasureMineralNetwork(plan);
  declareEcoTax(plan);
  return plan;
}

/**
 * ------------------------------------------------------------------
 * WHICH UPGRADER SEATS THE ROOM HOLDS, AND WHY THESE ONES.
 * ------------------------------------------------------------------
 * Layer 1 counts the controller link's parking seats, declares the number and
 * used to hand them to five later layers that had never heard of it: 80 rooms
 * ate 159 seats and four shipped under the 4-seat floor this planner calls hard.
 * The fix is a reservation, and the reservation is free ONLY if it takes the
 * tiles the extension mass wants least — otherwise it buys the controller a seat
 * by renting a personal rampart forever somewhere else.
 *
 * That is a depth question, so it cannot be answered in layer 1: reserving the
 * seats there (by hub distance, the only ordering available before the wall
 * exists) cost E9S2 two shallow extensions and E12S5 three. (This used to name a
 * third room, E13S6, and it was wrong in four separate places across the repo
 * and the goal document: E13S6 ships 8 parks against a floor of 8 with 0 eaten
 * and 0 shallow extensions — it never enters the release pass at all. The
 * counterfactual itself is unverifiable by construction, since nothing in a
 * finished plan records what a differently-ordered layer 1 would have cost, so
 * treat the two numbers that remain as the historical note they are.) Here, one
 * layer later, the shell is drawn and the ordering can be the honest one:
 *
 *   1. SHALLOW seats first. A tile at depth < 4 is one the mass can only use by
 *      bolting a personal rampart to it, so reserving it costs nothing at all —
 *      and it is a perfectly good place for an upgrader to stand, because an
 *      upgrader is a creep and creeps are not depth-limited.
 *   2. then seats with NO D4 road face, for the same reason one step weaker: an
 *      extension there costs the corridor a tile.
 *   3. then the furthest from the hub, because the fill grows outward and wants
 *      the near ones.
 *   4. then reading order, so two runs on one terrain reserve one set.
 *
 * The floor is min(seats layer 1 counted, PARK_PROTECT), and PARK_PROTECT is the
 * ring's own maximum — so in every room that can afford it, every seat the
 * declaration counts is a seat the room keeps.
 */
function reserveParkSeats(terrain, plan, cap) {
  // `ctrlParkSeatSearchTiles` (renamed from `ctrlParkTiles` by OL4, round 20) is
  // layer 1's SEAT SEARCH — every tile the controller-link kit looked at — and
  // the parks this room actually builds are a subset of it. The count beside it
  // was already called `ctrlParksAtSeatSearch` for that reason; the list was
  // still named as though it were the built parks, which is what a reader of
  // "ctrlParkTiles" would reasonably take it for.
  const tiles = plan.meta?.ctrlParkSeatSearchTiles || [];
  plan.parkReserve = [];
  plan.meta.ctrlParkReserve = [];
  plan.meta.ctrlParkFloor = 0;
  if (!tiles.length || !plan.depth) return;
  const roadSet = new Set((plan.structures.road || []).map((r) => `${r.x},${r.y}`));
  const hub = plan.hub || plan.sitter;
  const rank = (p) => {
    const i = p.x + p.y * 50;
    const deep = plan.depth[i] >= 4 ? 1 : 0;
    const faced = D4.some(([dx, dy]) => roadSet.has(`${p.x + dx},${p.y + dy}`)) ? 1 : 0;
    const far = hub ? Math.max(Math.abs(p.x - hub.x), Math.abs(p.y - hub.y)) : 0;
    return [deep, faced, -far, p.y, p.x];
  };
  const pool = tiles
    .map((p) => ({ p, r: rank(p) }))
    .sort((a, b) => {
      for (let i = 0; i < a.r.length; i++) if (a.r[i] !== b.r[i]) return a.r[i] - b.r[i];
      return 0;
    });
  const n = Math.min(pool.length, typeof cap === "number" ? cap : PARK_PROTECT);
  plan.parkReserve = pool.slice(0, n).map((e) => ({ x: e.p.x, y: e.p.y }));
  plan.meta.ctrlParkReserve = plan.parkReserve;
  plan.meta.ctrlParkFloor = n;
  // ------------------------------------------------------------------
  // THE NUMBER SAYS WHICH RULE MADE IT.
  //
  // `ctrlParkFloor` had exactly one documented rule — "what layer 1 measured,
  // capped at PARK_PROTECT" (shared.mjs) — and E12S5 ships 2, because
  // maybeReleaseParks re-composed the room with a lower cap and that
  // composition was better on every axis including the one the cap protects.
  // Both facts were published and neither field said which was which, so the
  // pair read as a contradiction. It is written down now instead.
  // ------------------------------------------------------------------
  plan.meta.ctrlParkFloorCap = typeof cap === "number" ? cap : PARK_PROTECT;
  plan.meta.ctrlParkFloorWhy =
    typeof cap === "number" && cap < PARK_PROTECT
      ? `${n} = the seat-release pass's cap of ${cap}${
          pool.length < cap ? ` clipped to the ${pool.length} seat(s) the ring actually offers` : ""
        } — this room was RE-COMPOSED at a lower reservation because holding the full count cost it ` +
        `shallow extensions (see the ctrlParks 'released' declaration; the hard 4-seat floor is on what ` +
        `the room SHIPS and is never lowered)`
      : `${n} = ${
          pool.length <= PARK_PROTECT
            ? `every one of the ${pool.length} seat(s) layer 1 counted at the controller link`
            : `PARK_PROTECT, the ring's own maximum, out of the ${pool.length} seat(s) layer 1 counted`
        } — the default rule, unreduced`;
}

// ------------------------------------------------------------------
// ...AND THE SAME TREATMENT FOR THE MINER'S SEAT.
//
// `meta.misc.mineralOffNetwork` is computed in layer 5 against layer 5's road
// set, and layers 6 and 7 lay the extension corridors, the rampart spurs and
// the swamp paving afterwards. A seat that layer 5 correctly called off-network
// can be on it by the time the room ships, so the flag is re-derived here for
// the same reason `ctrlParks` and the shell metrics are: the field describes
// the shipped room or it describes nothing.
//
// The claim itself was the original defect — it was set from
// `mineralContainer.length > 0`, i.e. asserted without measuring, and was
// therefore false in every room where the seat happens to touch road. See the
// block in layer-misc for the rest of that story.
// ------------------------------------------------------------------
function remeasureMineralNetwork(plan) {
  const misc = plan.meta?.misc;
  if (!misc || !plan.mineral) return;
  const seat = (plan.structures.container || []).find(
    (c) => Math.max(Math.abs(c.x - plan.mineral.x), Math.abs(c.y - plan.mineral.y)) <= 1,
  );
  if (!seat) return;
  const net = new Set((plan.structures.road || []).map((r) => `${r.x},${r.y}`));
  for (const c of plan.structures.container || []) net.add(`${c.x},${c.y}`);
  net.delete(`${seat.x},${seat.y}`); // the seat does not put itself on the network
  const touching = [];
  for (const [dx, dy] of D8) {
    const k = `${seat.x + dx},${seat.y + dy}`;
    if (net.has(k)) touching.push(k);
  }
  // ------------------------------------------------------------------
  // OL5 (round 27) — THE FIELD NAMED FOR AN OUTCOME WAS HOLDING AN INTENT.
  //
  // `meta.mineralSeat` is described, in the validator's own REQUIRED_META
  // table, as "the mineral container's seat", and its value was layer 1's
  // RESERVATION: the ring tile that layer picked on approach breadth and held
  // for the miner, before layers 2-7 existed. Layer 5 PREFERS that tile
  // (a -100 bias) and is allowed to place elsewhere, so the two can differ —
  // in E12S7 the reservation says 25,33 and the container ships at 25,32, with
  // `mineralApproach` at 24,34 pointing at the approach to a tile nothing
  // stands on, two steps from the seat that exists. Nothing broke, because
  // every gate and every sentence in the suite derives the seat from the
  // CONTAINER; the field was simply false, which is criticism 27's class — an
  // intent wearing an outcome's label.
  //
  // So the outcome-named pair names the outcome, and layer 1's decision keeps
  // its own name beside it, the same shape as `enclosedAtNegotiation`,
  // `refillDistsAtPlacement` and `ctrlParksAtSeatSearch`. THE APPROACH FOLLOWS
  // THE SEAT, and it is held to a property rather than to a provenance: it must
  // be a walkable D8 neighbour of the shipped seat that carries no obstacle on
  // the board this room ships. Layer 1's tile is kept wherever it satisfies
  // that (it does in 171/172), and re-derived from the shipped board where it
  // does not — widest approach first, then reading order, both stated here and
  // both re-derivable by a reader holding the artifact and the terrain.
  // ------------------------------------------------------------------
  {
    const res = plan.meta.mineralSeat || null;
    plan.meta.mineralSeatAtReservation = res ? { x: res.x, y: res.y } : null;
    plan.meta.mineralApproachAtReservation = plan.meta.mineralApproach
      ? { x: plan.meta.mineralApproach.x, y: plan.meta.mineralApproach.y }
      : null;
    plan.meta.mineralSeat = { x: seat.x, y: seat.y };
    const terrain = plan.terrain;
    const blocked = new Set(plan.objectTiles || []);
    for (const t of BUILT_OBSTACLES) {
      for (const p of plan.structures[t] || []) blocked.add(`${p.x},${p.y}`);
    }
    const standable = (x, y) =>
      x >= 0 && y >= 0 && x <= 49 && y <= 49 && walkable(terrain, x, y) && !blocked.has(`${x},${y}`);
    const appr = plan.meta.mineralApproach;
    const adjacent =
      appr && Math.max(Math.abs(appr.x - seat.x), Math.abs(appr.y - seat.y)) === 1;
    if (!adjacent || !standable(appr.x, appr.y)) {
      const cmp = (a, b) => {
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
        return 0;
      };
      let best = null;
      for (const [dx, dy] of D8) {
        const x = seat.x + dx,
          y = seat.y + dy;
        if (!standable(x, y)) continue;
        let nbrs = 0;
        for (const [ex, ey] of D8) if (standable(x + ex, y + ey)) nbrs++;
        const sc = [-nbrs, y, x];
        if (!best || cmp(sc, best.sc) < 0) best = { x, y, sc };
      }
      plan.meta.mineralApproach = best ? { x: best.x, y: best.y } : null;
    }
  }
  misc.mineralSeatNetTiles = touching;
  misc.mineralOffNetwork = touching.length === 0;
  // MF5 (round 27) — the verdict is rendered from the seat's own ring census.
  // See renderMineralOffNetworkWhy: 133 rooms shipped one constant sentence
  // about a measurement none of them printed.
  misc.mineralOffNetworkWhy = renderMineralOffNetworkWhy({
    ...mineralSeatCensus(plan.structures, seat, net),
    when: "the FINISHED road set, not layer 5's",
  });
  // ------------------------------------------------------------------
  // ...AND AN EXEMPTION THAT LIVES ONLY IN THE CHECKER IS NOT AN EXEMPTION.
  //
  // The road gate reads "one connected road network touching every structure",
  // and it enumerates its exceptions. This one was not among them: it existed as
  // a single hardcoded line in validate.mjs ("the mineral seat is deliberately
  // off-network (no road by design)") and NO plan's meta.shortfalls said a word,
  // in any of the 133 rooms it applies to. The decision is defensible — that is
  // what `mineralOffNetworkWhy` above argues, and the argument holds — but a
  // decision the artifact does not declare is one a reader has to find in the
  // checker's source, and a checker that exempts a class the plan never claims
  // is a checker writing the plan's declarations for it.
  //
  // So the room declares it, per room, and the validator's exemption READS the
  // declaration instead of asserting it.
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // ...AND THE SEAT IS NOT THE ONLY STRUCTURE OUT THERE.
  //
  // The EXTRACTOR stands on the mineral tile, one step from the seat, and it is
  // off the road network in exactly the same 133 rooms and for exactly the same
  // reason — its only network neighbour is the seat, and the seat is the tile
  // this declaration is about. It escaped notice because the validator's OWNED
  // list simply does not contain "extractor": the structure was never checked, so
  // it never needed excusing, so nothing ever said why it does not need a road.
  // That is a weaker position than the seat's was — the seat at least had a
  // hardcoded line in the checker. This one had nothing anywhere.
  //
  // Its argument is also STRONGER than the seat's, which is why it is worth
  // stating rather than quietly bundling. A mineral is in OBSTACLE_OBJECT_TYPES,
  // so no creep can ever stand on the tile the extractor occupies: it is the only
  // owned structure in the RCL8 program that is never entered, never filled and
  // never emptied. The rule "every structure must touch the road network" exists
  // so a hauler can service it, and there is nothing here to service — the miner
  // stands on the seat and harvests at range 1, and the extractor's whole
  // interface is a cooldown. It is not an off-network structure that got away
  // with it; it is a structure the rule has no content for.
  // ------------------------------------------------------------------
  const extractor = (plan.structures.extractor || [])[0] || null;
  const extractorNet = [];
  if (extractor) {
    for (const [dx, dy] of D8) {
      const k = `${extractor.x + dx},${extractor.y + dy}`;
      if (net.has(k)) extractorNet.push(k);
    }
    misc.extractorSeatNetTiles = extractorNet;
    // "off network" for the extractor means: nothing D8 of it carries road or
    // container OTHER than the mineral seat, whose own status is the line above.
    misc.extractorOffNetwork = extractorNet.length === 0 && misc.mineralOffNetwork;
  }
  if (misc.mineralOffNetwork) {
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    // GENERATED — see declprose.mjs. The paragraph was one of 233 that carried
    // no machine-checkable clause at all; it now prints its own record and the
    // validator regenerates it.
    const sfMineral = {
      gate: "misc",
      kind: "off-network",
      // BOTH TILES ARE NAMED. The declaration excuses two structures from the
      // road gate, so it lists two tiles: the seat, and the extractor standing on
      // the mineral beside it. A declaration that excuses a structure it does not
      // name is the shape this whole channel exists to prevent.
      tiles: extractor
        ? [
            { x: seat.x, y: seat.y },
            { x: extractor.x, y: extractor.y },
          ]
        : [{ x: seat.x, y: seat.y }],
      offNetwork: {
        mineral: { x: plan.mineral.x, y: plan.mineral.y },
        seats: 1,
        netTiles: (misc.mineralSeatNetTiles || []).length,
        roads: (plan.structures.road || []).length,
        regenTicks: MINERAL_COOLDOWN_NOTE,
        extractorCooldown: EXTRACTOR_COOLDOWN_NOTE,
        // the second structure this declaration covers — see the block above
        extractor: extractor ? { x: extractor.x, y: extractor.y } : null,
        extractorNetTiles: extractorNet.length,
        extractorStands: false,
        extractorObstacle: "mineral",
      },
    };
    sfMineral.detail = renderDecl(sfMineral);
    plan.meta.shortfalls.push(sfMineral);
  }
}
/** MINERAL_REGEN_TIME, quoted so the sentence above cannot drift from the game */
const MINERAL_COOLDOWN_NOTE = 50000;
/** EXTRACTOR_COOLDOWN, same reason — the paragraph reads it out of the record */
const EXTRACTOR_COOLDOWN_NOTE = 5;

// ------------------------------------------------------------------
// THE UPGRADER SEATS, COUNTED ON THE FINISHED ROOM.
//
// `meta.ctrlParks` is measured in layer 1 (claimControllerWorks), against an
// `impassable` set that is object tiles plus the hub trio plus the spawns plus
// the links — and nothing else, because nothing else exists yet. Towers, labs,
// the nuker, the observer and the whole extension mass all land afterwards and
// eat counted seats. Nothing re-counted, and nothing protected them.
//
// Re-derived as built when the defect was found — on the 172-room fleet of that
// round, and what follows is that measurement and not a live reading of the
// fleet: 86 of those 172 rooms shipped fewer seats than they claimed;
// the fleet ran min 3 / median 7 while the suite printed "min 4 · median 8";
// and `MIN_PARKS = 4` — echoed as `minParksFloor: 4` in every census and
// treated as a hard floor — was breached by four rooms with no declaration at
// all (E13S9, E14S2 and E18S8 claimed 7/8/8 and shipped 3; E17S5 claimed 5 and
// shipped 3). E17S5's own shortfall said its link "feeds 5 walkable parking
// tiles ... 1 above the 4-seat floor, which is a constraint and not a margin:
// lose one seat..." — it had already lost two, to two of our own extensions,
// and the declaration did not know.
//
// So the layer-1 number is kept as what the seat search DECIDED on, and the
// as-built number is published beside it. The declaration is amended, not
// rewritten, for the same reason the shell mobility one is: the decision was
// really made on the layer-1 count.
// ------------------------------------------------------------------
function remeasureCtrlParks(terrain, plan) {
  const ctrl = plan.controller;
  if (!ctrl || !plan.meta) return;
  // WHICH LINK IS THE CONTROLLER'S — the producer's own convention, which is
  // positional and not geometric: layer 1 builds `link: [hub, ...source, ctrl]`
  // so the controller link is the LAST entry, and layer-shell reads it exactly
  // that way (`plan.structures.link[plan.structures.link.length - 1]`).
  // Deriving it as "the nearest link at chebyshev 2-3" is wrong in five rooms,
  // because a SOURCE link can also sit at chebyshev 2 of the controller and win
  // the tie: E13S6 has 17,39 and 15,36 both at 2, E18S3 has 16,42 and 12,42.
  // Counting seats around the wrong link produced a "stale" reading that was
  // really a disagreement about which structure was being measured.
  const links = plan.structures.link || [];
  const last = links[links.length - 1];
  if (!last) return;
  const dLast = Math.max(Math.abs(last.x - ctrl.x), Math.abs(last.y - ctrl.y));
  if (dLast < 2 || dLast > 3) return; // not a controller link at all
  const link = { x: last.x, y: last.y, d: dLast };
  // published so every consumer measures the same structure
  plan.meta.ctrlLink = { x: link.x, y: link.y };
  const blocked = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures[t] || []) blocked.add(`${p.x},${p.y}`);
  }
  const seats = [];
  for (const [dx, dy] of D8) {
    const x = link.x + dx,
      y = link.y + dy;
    if (x < 0 || y < 0 || x > 49 || y > 49) continue;
    if (isWall(terrain, x, y)) continue;
    if (Math.max(Math.abs(x - ctrl.x), Math.abs(y - ctrl.y)) > 3) continue;
    if (blocked.has(`${x},${y}`)) continue;
    seats.push({ x, y });
  }
  const claimed = plan.meta.ctrlParks ?? 0;
  // THE PUBLISHED FIELD BECOMES THE SHIPPED ONE. `meta.ctrlParks` is what the
  // gallery prints, what the fleet census medians, and what a reviewer reads as
  // "this room's upgrader seats" — so it has to be the count the room ships.
  // The layer-1 figure is not deleted, because it is the number the seat search
  // chose on and the declaration below argues from it; it moves to a field that
  // says so in its name.
  plan.meta.ctrlParksAtSeatSearch = claimed;
  plan.meta.ctrlParks = seats.length;
  plan.meta.ctrlParksBuiltTiles = seats;
  plan.meta.ctrlParksEaten = Math.max(0, claimed - seats.length);
  if (seats.length === claimed) return;

  // WHO TOOK THEM — named, because "8 became 3" with no culprit is not a
  // measurement anybody can act on.
  const eaters = [];
  for (const [dx, dy] of D8) {
    const x = link.x + dx,
      y = link.y + dy;
    if (x < 0 || y < 0 || x > 49 || y > 49) continue;
    if (isWall(terrain, x, y)) continue;
    if (Math.max(Math.abs(x - ctrl.x), Math.abs(y - ctrl.y)) > 3) continue;
    if (!blocked.has(`${x},${y}`)) continue;
    if ((plan.objectTiles || new Set()).has && plan.objectTiles.has(`${x},${y}`)) continue;
    for (const t of BUILT_OBSTACLES) {
      if ((plan.structures[t] || []).some((p) => p.x === x && p.y === y)) {
        eaters.push(`${x},${y}=${t}`);
        break;
      }
    }
  }
  plan.meta.shortfalls = plan.meta.shortfalls || [];
  // ...and the lookup is on the KIND too. Matching on the gate alone would let
  // this half of the paragraph be merged into a `ctrlParks/released` record,
  // which is a different declaration about a different decision; nothing has hit
  // that today only because `released` is written after this runs.
  const existing = plan.meta.shortfalls.find(
    (sf) => sf && sf.gate === "ctrlParks" && sf.kind === "seats",
  );
  // ONE KIND, ONE TEMPLATE, AND THE STRING CONCATENATION IS OVER.
  //
  // This used to APPEND a sentence to layer 1's paragraph — a second writer
  // mutating a string a first writer had left — or compose its own opener when
  // layer 1 had filed nothing. Three shapes for one kind across two files, and
  // no single place holding the result, which is why E12S5 could ship "AS BUILT
  // this link feeds 7" against a record saying 5 and pass. Now both halves come
  // out of `renderCtrlSeats`: this function's job is to finish the RECORD and
  // RE-RENDER, never to concatenate.
  const rebuilt = {
    built: seats.length,
    eaten: plan.meta.ctrlParksEaten,
    eaters,
    link: { x: link.x, y: link.y },
    controller: { x: ctrl.x, y: ctrl.y },
  };
  if (existing) {
    existing.ctrlParks = { ...(existing.ctrlParks || {}), ...rebuilt };
    existing.detail = renderDecl(existing);
  } else {
    const sfSeats = {
      gate: "ctrlParks",
      kind: "seats",
      detail: "",
      tiles: [{ x: link.x, y: link.y }, ...seats].slice(0, 32),
      ctrlParks: { parks: claimed, floor: 4, ...rebuilt },
    };
    sfSeats.detail = renderDecl(sfSeats);
    plan.meta.shortfalls.push(sfSeats);
  }
}

// ------------------------------------------------------------------
// ECO SHORTFALLS ARE SHORTFALLS TOO.
//
// The escalation ladder has always had a price ceiling (ECO_TOLERANCE) and it
// has always been enforced silently: a room whose hub ends up 27 tiles from its
// controller, or 84 tiles of round trip from its sources, or three seeds down
// the ranked list, simply shipped that plan and said nothing. "Silent capping"
// is on the anti-pattern list by name, and this is the last place doing it.
//
// The thresholds are read off the fleet, not invented. The distribution they
// were derived from was measured in the 159-room world of that round, and these
// are that reading rather than a live one: pathController ran min 4 / median 10
// / p90 25 / max 75 there, and pathSourcesSum min 8 / median 27 / p90 45 /
// max 84 (re-measured that round; the p90 for source sum had been quoted as 46
// and was 45). Nothing keeps a copied distribution true — the block below
// records the source-sum median having already drifted off 27 by the time
// anyone checked, and the fleet summary prints the live pair every run on its
// "eco medians (measured this run, N rooms)" line, which is the only reading
// that governs anything. (Round 20 past-tensed this and named its world; the
// two passages in this file were quoting different medians for the same
// quantity. Criticism 80.) The absolute lines >25 and >60 each marked
// roughly the worst decile — the rooms where the hauler bill is a terrain
// verdict rather than a planner choice — and any seedSkip at all means the
// top-ranked confluence was rejected outright. The wording below is generated
// from the room's own numbers.
//
// ...AND AN ABSOLUTE CLIFF IS THE WRONG SHAPE FOR A FLEET STATISTIC.
//
// The two absolute gates were derived from the fleet distribution once and then
// frozen as bare numbers, and a bare number cuts wherever it happens to land.
// It landed badly, in that same 159-room world: E11S10 hauled 58 and E5S1
// hauled 55 — 2.15x and 2.04x that fleet's median, 4th and 5th worst in those
// 159 rooms — and both were SILENT, because
// 58 and 55 are under 60. E19S6 at 62 declared. Two tiles of terrain is the
// entire difference between "the hauler bill is a terrain verdict worth a
// paragraph" and "nothing to see here", which is not a distinction the room
// shape supports. The controller-walk gate had the same defect and 9 more
// silent rooms above 2x its median (E12S9 and E6S2 sat at exactly 25, one tile
// under a strict >).
//
// So each gate now fires on the ABSOLUTE line OR on twice the fleet median,
// whichever is lower. Twice-the-median is the relative form of the same
// judgement the absolute number was reaching for, it moves with the fleet
// instead of with a literal, and it is stated as a multiple so the next
// reviewer can argue with the multiple rather than reverse-engineer a cliff.
// The medians below are measured, not assumed; the suite re-prints them every
// run, and if they drift the gates drift with them.
// ...AND A "MEASURED" MEDIAN THAT IS A LITERAL IS AN ASSUMED MEDIAN.
//
// The paragraph above promises that "the medians below are measured, not
// assumed; the suite re-prints them every run, and if they drift the gates
// drift with them". Every clause of that was false. They were hand-set
// literals; the suite printed no eco median at all (grep the run log: zero
// hits); and they had drifted — the true median of `pathSourcesSum` over the
// 172 rooms shipped at the moment this was checked was 26, not 27, by every
// convention, which put the source
// gate at 54 instead of 52 and left E21S5 (53) and E7S5 (54) above the
// rule-as-written with no eco declaration. (That 26 is a reading taken at a
// moment too, and it is not what the gate uses: the gate uses whatever
// `setFleetMedians` measures on the run, printed on the "eco medians (measured
// this run, N rooms)" line. Criticism 80.) Meanwhile the file contradicted
// itself: the ECO_TOLERANCE doc block says "median 11" for the controller walk
// where the constant said 10, and layer-shell says "p50 6" for the same
// quantity. Three hand-copied readings, all frozen at different moments.
//
// So the constants are gone. `setFleetMedians` is called once by the suite,
// after every room in the run has been planned and before any room page is
// written, and the eco declaration is then re-derived for every plan against
// the fleet it actually shipped with. The values below are the SEED for a
// single-room or partial run, where there is no fleet to measure — a room
// planned on its own has no business inventing a fleet statistic, and it says
// which case it is in the declaration it prints.
let FLEET_CTRL_WALK_MEDIAN = 10;
let FLEET_SRC_SUM_MEDIAN = 26;
let FLEET_MEDIANS_MEASURED = null;
const ECO_CTRL_ABS = 25;
const ECO_SRC_ABS = 60;
const ECO_REL_MULT = 2;
let ECO_CTRL_WALK_GATE = Math.min(ECO_CTRL_ABS, ECO_REL_MULT * FLEET_CTRL_WALK_MEDIAN);
let ECO_SRC_SUM_GATE = Math.min(ECO_SRC_ABS, ECO_REL_MULT * FLEET_SRC_SUM_MEDIAN);

/**
 * Called by the suite once the whole run is planned. `rooms` is the shipped
 * set. Returns what it measured so the caller can print it — the printing is
 * half the point, because a gate nobody can see move is a gate nobody checks.
 */
export function setFleetMedians(plans) {
  const ok = (plans || []).filter((p) => p && !p.error && p.meta);
  if (ok.length < ECO_MEDIAN_MIN_ROOMS) return null;
  const med = (a) => {
    const s = a.slice().sort((x, y) => x - y);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const ctrlWalk = med(ok.map((p) => p.meta.pathController ?? 0));
  const srcSum = med(ok.map((p) => p.meta.pathSourcesSum ?? 0));
  FLEET_CTRL_WALK_MEDIAN = ctrlWalk;
  FLEET_SRC_SUM_MEDIAN = srcSum;
  ECO_CTRL_WALK_GATE = Math.min(ECO_CTRL_ABS, ECO_REL_MULT * ctrlWalk);
  ECO_SRC_SUM_GATE = Math.min(ECO_SRC_ABS, ECO_REL_MULT * srcSum);
  FLEET_MEDIANS_MEASURED = { rooms: ok.length, ctrlWalk, srcSum };
  return {
    rooms: ok.length,
    ctrlWalk,
    srcSum,
    ctrlGate: ECO_CTRL_WALK_GATE,
    srcGate: ECO_SRC_SUM_GATE,
  };
}

/**
 * Re-run the eco declaration against the measured medians. `composePlan` files
 * one per composition; only the winner's array survives, so this strips the
 * single `gate:"eco"` entry and re-derives it. Nothing else in the shortfalls
 * array is touched — attachRungProof, declareRuntime and declareExtShortfall
 * all write to the same array and none of them is a function of the fleet.
 */
export function redeclareEcoTax(plan) {
  if (!plan || plan.error || !plan.meta?.shortfalls) return;
  plan.meta.shortfalls = plan.meta.shortfalls.filter((sf) => !(sf && sf.gate === "eco"));
  declareEcoTax(plan);
}

/** below this a "fleet median" is one room's opinion, so the seed stands */
const ECO_MEDIAN_MIN_ROOMS = 30;

const OCTANT = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
function bearing(from, to) {
  const a = Math.atan2(to.y - from.y, to.x - from.x); // screeps y grows south
  return OCTANT[(Math.round((a * 4) / Math.PI) + 8) % 8];
}

function declareEcoTax(plan) {
  const pc = plan.meta?.pathController ?? 0;
  const ps = plan.meta?.pathSourcesSum ?? 0;
  const skip = plan.meta?.seedSkip ?? 0;
  if (pc <= ECO_CTRL_WALK_GATE && ps <= ECO_SRC_SUM_GATE && skip <= 0) return;
  const hub = plan.hub;
  // NOTE: the three over-the-gate clauses used to be assembled here as strings.
  // They are generated by `renderEco` now, and the conditions that SELECT them
  // are re-derived there from the record's own numbers rather than carried as
  // booleans — a record must not be able to claim a clause it has not earned.
  const basin = plan.basin?.length ?? 0;
  // ------------------------------------------------------------------
  // THE CAUSAL CLAUSE IS GENERATED, NOT ASSERTED.
  //
  // This used to end, unconditionally, with "the closer seats were rejected by
  // the space budget or by the enclosure, not by the eco score". In 14 of the
  // 20 rooms that print it, seedSkip is 0 — the hub IS the top-ranked
  // confluence and it composed the full RCL8 program on its first rung. Nothing
  // was rejected. The sentence invented a search that never ran, to explain a
  // distance that has a much simpler and entirely checkable cause: the anchors
  // in these rooms are far apart, and no hub anywhere in the room can be near
  // all of them at once.
  //
  // So the clause now comes off the room's own numbers. When a closer seat
  // really did fail (seedSkip > 0) it says so and counts them. When none did,
  // it says THAT, and backs the "genuinely far apart" claim with a bound
  // anybody can re-derive: two anchors chebyshev d apart cannot both be closer
  // than d/2 to any tile in the room, so ceil(d/2) is a floor on the walk this
  // room owes the far one no matter where the hub goes.
  // ------------------------------------------------------------------
  const anchors = [
    ...(plan.controller ? [{ n: "controller", p: plan.controller }] : []),
    ...(plan.sources || []).map((s, i) => ({ n: `source ${i + 1}`, p: s })),
  ];
  let spread = 0;
  let spreadPair = "";
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const d = Math.max(
        Math.abs(anchors[i].p.x - anchors[j].p.x),
        Math.abs(anchors[i].p.y - anchors[j].p.y),
      );
      if (d > spread) {
        spread = d;
        spreadPair = `${anchors[i].n} ${anchors[i].p.x},${anchors[i].p.y} and ${anchors[j].n} ${anchors[j].p.x},${anchors[j].p.y}`;
      }
    }
  }
  // ------------------------------------------------------------------
  // ...AND CHEBYSHEV IS THE WEAKEST BOUND AVAILABLE, IN THE ROOMS THAT MOST
  // NEED A STRONG ONE.
  //
  // The bound above is real — chebyshev separation is always <= walk distance,
  // so ceil(cheb/2) is a genuine floor — but it throws away every wall between
  // the two anchors, and a room only reaches this paragraph BECAUSE its anchors
  // are awkwardly placed, which usually means there is a ridge in the way.
  // E13S2 declared "the widest separation is 27 tiles (controller 9,34 and
  // source 1 36,29) ... so a walk of at least 14 to the far one is owed by
  // EVERY hub": the WALK separation of that pair is 56, so the true floor is 28
  // and the room's shipped 27 is essentially optimal. The declaration told the
  // owner it was 13 tiles over a floor it was already sitting on. E17S3 is the
  // same shape (declared floor 16 from cheb 32; walk spread 38, floor 19).
  //
  // The walk is measured here rather than inherited, because layer 1 computes
  // the anchor distance fields and then discards them. Cost is one D8 BFS per
  // anchor pair on the widest pair only, in the ~20% of rooms that declare at
  // all. Where the walk is unreachable (an anchor behind a wall the room cannot
  // cross without tunnelling) the chebyshev bound stands and says so.
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // ...AND THE FLOOR HAS TO BE MEASURED IN THE METRIC OF THE DISTANCES IT
  // BOUNDS. THIS IS THE ROUND-11 CORRECTION.
  //
  // `pathController` and `pathSourcesSum` are read off `distField`, which seeds
  // the anchor's WHOLE walkable ring at zero — so "the controller is 27 away"
  // means 27 steps from the hub tile to the nearest tile a creep can work the
  // controller from. The spread above was measured with `pathLen`, which routes
  // through `approachTile`: ONE fixed neighbour at each end, chosen by a
  // tie-break that knows nothing about which side the hub is on. The two are
  // different quantities, `pathLen` is the larger of them, and the floor
  // derived from it therefore bounded the published distances from ABOVE their
  // own geometry in 15 of the 38 declaring rooms — by 2 in E17S3 (39 vs 36, so
  // floor 20 vs 18) and E2S3 (60 vs 56, floor 30 vs 28), by 1 in thirteen more.
  // A floor that overstates is not a conservative error: it tells the owner a
  // room is closer to optimal than it is, which is the flattering direction.
  //
  // The bound is now derived exactly, in the right metric and tighter than
  // before. For anchors A and B and ANY tile t in the room,
  //     distA(t) + distB(t) >= D,   D = min over all t of (distA + distB)
  // — D is a property of the terrain alone — and therefore
  //     max(distA(t), distB(t)) >= ceil(D / 2)
  // for every hub tile the room admits. D is exactly "how far apart these two
  // anchors are, walked, in the units `pathController` is printed in", and it
  // costs one BFS per anchor plus one 2500-tile scan per pair.
  // ------------------------------------------------------------------
  let walkSpread = null;
  let walkPair = "";
  {
    const fields = anchors.map((a) => distField(plan.terrain, [a.p]));
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        const fi = fields[i];
        const fj = fields[j];
        let best = null;
        for (let t = 0; t < 2500; t++) {
          const a = fi[t];
          const b = fj[t];
          if (a >= 30000 || b >= 30000) continue; // INF sentinel / unreachable
          const s = a + b;
          if (best === null || s < best) best = s;
        }
        if (best === null) continue; // the two anchors do not share a component
        if (walkSpread === null || best > walkSpread) {
          walkSpread = best;
          walkPair = `${anchors[i].n} ${anchors[i].p.x},${anchors[i].p.y} and ${anchors[j].n} ${anchors[j].p.x},${anchors[j].p.y}`;
        }
      }
    }
  }
  // ------------------------------------------------------------------
  // ...AND SO WAS THE CHEBYSHEV BRANCH. THIS IS THE ROUND-12 CORRECTION.
  //
  // Round 11 fixed the WALK branch and left this one alone, and the same defect
  // was sitting in it the whole time: the separation is measured between anchor
  // TILES while the distances it bounds are RING-SEEDED — `distField` seeds the
  // anchor's whole walkable ring at zero — so a step is saved at each end and
  // the honest bound is ceil((d - 2) / 2), not ceil(d / 2).
  //
  // Seven rooms took this branch and every one of them declared a floor one
  // tile above what its geometry supports: E12S1 14, E13S4 19, E15S9 16,
  // E16S5 18, E19S5 19, E2S6 17, E7S5 18. E13S4's is the one that proves it —
  // it told the owner "two anchors 37 apart cannot both sit within 19 of any
  // tile in the room" while 26,21 is plain walkable floor with a ring walk of
  // 18 to the controller AND 18 to source 0. A floor that overstates is not a
  // conservative error; it tells the owner the room is closer to optimal than it
  // is, which is the flattering direction, and it is the exact sentence the eco
  // bullet claims to have closed.
  // ------------------------------------------------------------------
  const chebFloor = Math.ceil(Math.max(0, spread - 2) / 2);
  const walkFloor = walkSpread === null ? null : Math.ceil(walkSpread / 2);
  const useWalk = walkFloor !== null && walkFloor > chebFloor;
  const anchorFloor = useWalk ? walkFloor : chebFloor;
  // NOTE: the floor proof and the causal clause used to be built here as
  // strings. They now live in `renderEco` (declprose.mjs), generated from the
  // `eco` record below, because a paragraph assembled beside a record is a
  // paragraph that can disagree with it — see the block above the push.
  // ------------------------------------------------------------------
  // THE OPENER CLAIMS ONLY WHAT THE CLOSER PROVES.
  //
  // It used to open "hauler distances in this room are a terrain verdict, not a
  // preference" — a claim about the whole distance, in every room that prints
  // it. What the paragraph actually establishes is narrower and is stated at the
  // end of it: two anchors `spread` apart cannot both sit within ceil(spread/2)
  // of any tile, so a walk of at least that much is owed by every hub the room
  // admits. That is a FLOOR under part of the distance, not a verdict on all of
  // it — a hub 27 tiles from its controller in a room whose anchor floor is 12
  // is 12 tiles of terrain and 15 tiles of everything else. The opener now says
  // that, and the seedSkip case (where closer seats really were composed and
  // rejected) keeps its stronger wording because there the search is the proof.
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // THE PARAGRAPH IS GENERATED FROM THE RECORD BELOW, NOT WRITTEN HERE.
  //
  // Everything the sentence used to say — the two bearing clauses, the seed-rank
  // clause, the basin, the floor proof and its basis — is a field on `eco` now,
  // and `renderDecl` turns those fields into the paragraph. The validator calls
  // the SAME function on the record this plan publishes and fails the room if
  // the shipped paragraph is not what it produces.
  //
  // WHY. The old rule was that every audited number had to be QUOTED in the
  // prose, and `quoted()` asked only whether the numeral occurred anywhere in
  // the string. A reviewer rewrote a declaration's paragraph to assert the
  // opposite of its own audit and appended "[audit tokens: ...]" with the
  // numerals in it; the room passed. A paragraph that merely CONTAINS its
  // numbers is not a paragraph that says them.
  // ------------------------------------------------------------------
  const sf = {
    gate: "eco",
    tiles: [{ x: hub.x, y: hub.y }],
    eco: {
      pathController: pc,
      pathSourcesSum: ps,
      seedSkip: skip,
      basin,
      coreSize: plan.meta.coreSize ?? null,
      seedPool: plan.meta.seedPool ?? null,
      anchorSpread: spread,
      anchorWalkSpread: walkSpread,
      anchorFloorBasis: useWalk ? "walk" : "chebyshev",
      fleetMediansMeasured: FLEET_MEDIANS_MEASURED,
      anchorWalkFloor: anchorFloor,
      // ...and the inputs the PROSE needs, which used to live only in this
      // function's locals. A claim the paragraph makes has to be a field
      // somebody can check; that is the whole contract of declprose.mjs.
      chebFloor,
      walkFloor,
      spreadPair,
      walkPair,
      ctrlBearing: plan.controller ? bearing(hub, plan.controller) : null,
      srcBearings: (plan.sources || []).map((src) => bearing(hub, src)),
      ctrlMedian: FLEET_CTRL_WALK_MEDIAN,
      srcMedian: FLEET_SRC_SUM_MEDIAN,
      ctrlGate: ECO_CTRL_WALK_GATE,
      srcGate: ECO_SRC_SUM_GATE,
      ctrlAbs: ECO_CTRL_ABS,
      srcAbs: ECO_SRC_ABS,
      relMult: ECO_REL_MULT,
    },
  };
  sf.detail = renderDecl(sf);
  plan.meta.shortfalls.push(sf);
}

export const extCount = (p) => p?.structures?.extension?.length ?? 0;

/**
 * The RCL8 program a finished room owes: 60 extensions, 10 labs, 6 towers,
 * a nuker and an observer. `rank` is what the escalation maximises — the
 * scarce pieces (labs are a rigid 4x4 stamp, towers need deep tiles) are
 * worth several extensions each, because a room can always shuffle an
 * extension somewhere and can't shuffle a lab diamond.
 */
function grade(p) {
  const s = p?.structures || {};
  const n = (t) => (s[t] || []).length;
  const ext = Math.min(n("extension"), EXT_TARGET);
  const lab = Math.min(n("lab"), 10);
  const tower = Math.min(n("tower"), 6);
  const nuker = Math.min(n("nuker"), 1);
  const obs = Math.min(n("observer"), 1);
  return {
    complete: ext === EXT_TARGET && lab === 10 && tower === 6 && nuker === 1 && obs === 1,
    rank: ext + lab * 4 + tower * 4 + nuker * 4 + obs * 4,
    cut: p?.shell?.cut.length ?? 1e9,
  };
}

/**
 * 60/60 extensions is a hard requirement — a room short on extensions is
 * permanently short on spawn throughput, forever, and no amount of clever
 * hauling buys it back. Two escalation axes, cheapest first:
 *
 *   1. SHELL   wider protect radii + a bigger deep-interior demand. A
 *              bigger bubble is more wall upkeep but more room inside.
 *   2. SEED    if even the widest shell around this hub is too cramped,
 *              the hub itself is in the wrong pocket — walk down the
 *              ranked seed list and re-plan the whole room.
 *
 * Almost every room settles on the first try; the ladder exists for the
 * handful of rooms whose best-scoring confluence sits in a dead end.
 */
/**
 * The rungs are OFFSETS on top of the shell's own demand estimate, never
 * absolutes. layer-shell derives its base floor from the program it still has
 * to place (78 tiles) plus the measured corridor overhead (~45); an absolute
 * rung would silently become a DOWNGRADE the moment that estimate moved, which
 * is exactly what happened when the base floor was the static 85 and the first
 * rung was 110. Offsets keep the ladder monotone by construction.
 *
 * The spacing (+25 / +55 / +85) is the spacing the old absolute ladder had and
 * it was measured, not guessed — see the note below on why an intermediate rung
 * buys nothing.
 */
const SHELL_ESCALATION = [
  {},
  { radii: RADII_WIDE, needDeepBonus: 25 },
  { radii: RADII_WIDE, needDeepBonus: 55 },
  { radii: [10, 11, 12, 13, 14], needDeepBonus: 85 },
];
const MAX_SEED_SKIP = 8;

/**
 * M6 — the escalation also has to pay for itself in UPKEEP, not just in
 * checkboxes.
 *
 * The ladder above was written to answer one question: "can this room fit
 * the program at all?" A room that fits 60 extensions at the tightest shell
 * therefore stopped on the first try — and looked finished. It wasn't. The
 * default shell used to guarantee a static 85 deep tiles while real demand is
 * ~115 (78 structures plus the road net that feeds them), so around 35 rooms
 * enclosed literally zero spare deep space and paid for the shortfall in
 * PERSONAL RAMPARTS: every extension, lab or tower forced onto a depth<=3 tile
 * buys its own rampart and repairs it forever. That floor is now COUNTED from
 * the program (layer-shell PROGRAM_TILES + measured corridor overhead), so the
 * FIRST composition is already the right one in most rooms and this ladder is
 * back to being what it was meant to be: a safety net, not the main mechanism.
 *
 * A personal rampart and a cut tile are the same currency. Ten extra cut
 * tiles that delete twenty personal ramparts is a net win — the wall is
 * longer, the bill is smaller, and the extensions sit in deep space where a
 * ranged attacker cannot reach them at all. So once a room is known to be
 * buildable we keep walking the ladder and buy the shell with the SMALLEST
 * TOTAL rampart count, cut plus personal, rather than the smallest cut.
 *
 * Two guards keep this from becoming a fleet-wide re-plan:
 *   ESCALATE_MIN  a room with almost no shallow structures has nothing to
 *                 win; it returns on the first complete plan as before.
 *                 Most rooms take this exit and never pay a second compose.
 *   the prune     the cut grows monotonically with needDeep while personal
 *                 ramparts fall, so the total is near-convex — the first
 *                 step that does not improve is the last one worth trying.
 *
 * The ladder SPACING is unchanged, and that was measured rather than assumed:
 * back when the rungs were absolute, an intermediate rung between them looked
 * obvious and wasn't — inserted, it won 7 rooms off the next rung and bought
 * the fleet of the round it was tried in 2 ramparts and 7 shallow extensions
 * while adding 4 cut tiles and
 * pushing one more room's defender-mobility ratio over 1.0. Those are the
 * numbers that experiment returned on that board, kept as the record of why the
 * rungs are where they are and not as a reading of anything current. That is noise
 * bought with a compose per escalating room. The reason coarse rungs suffice:
 * needDeep is a FLOOR on the negotiation, not a target — the shell picks the
 * smallest cut clearing it, and the cut that clears the floor in a real room
 * usually encloses far more anyway. The rungs only have to be far enough apart
 * to change which cut wins.
 */
const ESCALATE_MIN = 3;
/** how many flat rungs the ladder walks past before it believes the bill has turned */
const NO_GAIN_PATIENCE = 1;

const rampartsOf = (p) => p?.meta?.counts?.rampart ?? 1e9;
const roadsOf = (p) => p?.meta?.counts?.road ?? 1e9;
const cutOf = (p) => p?.shell?.cut?.length ?? 1e9;
/**
 * THE LADDER READS THE GATED LAP, because that is the reading everything else
 * in the fleet is judged on: layer 2's own tiebreak, layer 2's declaration,
 * layer 7's verdict and the suite's OVER-TARGET flag all take `maxGated` — the
 * maximum over wall pairs whose ABSOLUTE detour clears MOBILITY_DETOUR_FLOOR.
 * This one function read the ungated `max`, so the rung table stapled to a gated
 * declaration quoted a different statistic than the sentence above it, and the
 * ladder spent its premium on pairs the gate does not even look at.
 */
const mobOf = (p) => p?.shell?.mobility?.maxGated ?? 0;
const mobCauseOf = (p) => p?.shell?.mobility?.cause ?? "none";
// layer-shell's own target, restated here so the ladder can read it without
// importing a constant that means something slightly different one day
const MOBILITY_TARGET = 1.2;

/**
 * Ladder-local comparator: total forever-upkeep first. When two shells cost
 * the same number of ramparts the upkeep question is already settled — every
 * cut tile the wider bubble added, it took back off the personal pile — so
 * what is left to decide is build cost and defender mobility, and both track
 * WALL LENGTH. Hence cut before roads here: a swap that buys six cut tiles to
 * shed four road tiles is churn, and it was measurably worse (E15S2 went
 * 33->39 cut and its mobility ratio crossed 1.0 for nothing). Roads still
 * break the remaining tie, and an exact tie keeps the incumbent — the tighter
 * shell, since this walk only ever moves outward.
 *
 * Deliberately NOT better(): that one arbitrates across seeds and must keep
 * maximising the program.
 */
function cheaperUpkeep(a, b) {
  if (!b) return true;
  if (rampartsOf(a) !== rampartsOf(b)) return rampartsOf(a) < rampartsOf(b);
  if (cutOf(a) !== cutOf(b)) return cutOf(a) < cutOf(b);
  // same wall, same length: take the one the garrison can lap faster. Free —
  // by this point the upkeep question is settled and nothing else is at stake.
  if (mobOf(a) !== mobOf(b)) return mobOf(a) < mobOf(b);
  return roadsOf(a) < roadsOf(b);
}

/**
 * Given the plan the pipeline would have shipped today, walk what is left of
 * the ladder and keep the cheapest. The hub is untouched (planHub reads only
 * seedSkip), so every candidate here has the exact same economy — this trades
 * wall for personal ramparts and nothing else.
 */
/**
 * WHAT A SHORTER LAP IS WORTH, IN RAMPARTS.
 *
 * This used to be a single number (2) behind a single condition: a rung could
 * spend it ONLY if that rung landed the room inside the 1.2 target. The
 * condition, not the number, was the defect. It made the premium worthless
 * exactly where a lap is worst — a room at 7.5 whose next rung reaches 1.5 for
 * three ramparts is refused, because 1.5 is not 1.2, while a room at 1.25 whose
 * next rung reaches 1.2 for two ramparts is bought. E14S5 is the standing
 * example: rung 1 measures 1.5 against the shipped 7.5, three ramparts dearer,
 * and the ladder walked past it for a whole review cycle.
 *
 * The rule is now a price: permanent ramparts per 1.0 of gated lap reclaimed,
 * never more than a cap in total, and only ever while the incumbent is still
 * badly over target.
 *
 * ------------------------------------------------------------------------
 * ...AND THE PRICE WAS MIS-SET. THIS IS WHAT IT COST.
 * ------------------------------------------------------------------------
 * At 2-per-1.0 with a cap of 6, TWENTY-TWO rooms declared — correctly, in
 * their own rung tables — that a wider cut composed the WHOLE RCL8 program at
 * a materially shorter lap and was refused on price. The refusals were not
 * marginal: E5S8 ships 11.5 and could ship 2.75 for +7 ramparts. E17S1 ships
 * 8 and could ship 2.25 for +18. E20S4 ships 7 and could ship 0 for +8. E9S6
 * ships 6 and could ship 0 for +14. E8S5 ships 2.67 and could ship 0 for +12.
 *
 * Put in the currency the cap is denominated in: at this planner's own quoted
 * 0.03 e/tick per rampart, +12 ramparts is 0.36 e/tick against a room earning
 * on the order of 20 e/tick — under 2% of income to erase the worst defensive
 * geometry in the fleet. A cap of 6 was pricing the trade as if ramparts were
 * the scarce thing; on a shard where the defender's lap decides whether a
 * breach is contained or walked around, they are not.
 *
 * So the enclosure trade is repriced: 3 ramparts per 1.0 of gated lap, cap 12
 * — and, in the other direction, the purchase is now reserved for rooms that
 * are genuinely badly off. The old gate was "still over the 1.2 target", which
 * let a room at 1.25 spend wall to reach 1.2; that is buying a prettier ratio,
 * which is exactly what the header above says a room may not do. A lap has to
 * be over MOBILITY_BUY_FLOOR before a single extra rampart is available to it.
 *
 * WHY THIS IS NO LONGER THE SAME NUMBER LAYER 6 PAYS. layer-ext prices a
 * defender LANE at 2-per-1.0 / cap 6 and that stays, because the two are not
 * the same purchase and pretending they were is what froze this one. A rung
 * buys a lap MEASURED on the shell it is about to ship, for the whole
 * garrison, permanently, in shell ramparts. A lane buys a BOUND on the worst
 * mass layer 6 could grow, paid in PERSONAL ramparts over shallow structures
 * — layer-ext's own header records that pricing lanes at the rung's rate put
 * 40 extra personal ramparts on the fleet to tighten worst cases that never
 * materialised. Two purchases, two prices, both published here and there.
 */
const MOBILITY_ENCLOSURE_PER_RATIO = 3;
const MOBILITY_ENCLOSURE_CAP = 12;
/** a lap has to be at least this bad before wall may be spent shortening it */
const MOBILITY_BUY_FLOOR = 2;
/** what this rung may spend, given what it reclaims against the base rung */
const mobilityAllowance = (reclaimed) =>
  reclaimed <= 0
    ? 0
    : Math.min(MOBILITY_ENCLOSURE_CAP, Math.floor(MOBILITY_ENCLOSURE_PER_RATIO * reclaimed));
/**
 * How much shorter a rung's lap has to be before the declaration calls it an
 * alternative. Below this the two enclosures are the same wall with a rounding
 * difference, and reporting "a wider cut reaches 3.48 instead of 3.5" is noise.
 */
const MATERIAL_LAP = 0.25;
const round2 = (v) => Math.round(v * 100) / 100;

const cutTilesOf = (p) =>
  (p?.meta?.shell?.cutAtFreeze || p?.shell?.cut || []).map((t) => ({ x: t.x, y: t.y }));
const rungRecord = (p, seedSkip, si) => ({
  seedSkip,
  rung: si,
  needDeepBonus: SHELL_ESCALATION[si].needDeepBonus ?? 0,
  needDeep: p?.meta?.shell?.needDeep ?? null,
  mobility: mobOf(p),
  ramparts: rampartsOf(p),
  cut: cutOf(p),
  // criticism 88 — the discarded rung's enclosure. Mobility is re-derived
  // from these tiles; without them a fatter rung's lap is a free number.
  cutTiles: cutTilesOf(p),
  complete: p?.shell ? grade(p).complete : false,
  ecoCost: ecoCost(p),
  // the program this composition actually held — the evidence behind an
  // extension shortfall (see declareExtShortfall). Counted, never inferred.
  ext: (p?.structures?.extension || []).length,
  lab: (p?.structures?.lab || []).length,
  tower: (p?.structures?.tower || []).length,
});

/**
 * PROOF-CARRYING MOBILITY DECLARATIONS.
 *
 * "No enclosure this room admits is faster" is a claim about a search, and a
 * claim about a search that does not show the search is just an assertion. It
 * was also, for 30 rooms, FALSE: the ladder only walked when the room was short
 * on deep space or when the shell layer happened to blame the detour on the
 * enclosure's shape, so rooms like E11S4 shipped a 2.4 lap while rung 1 of the
 * very same seed reached 1.0 with FEWER ramparts and nobody ever composed it.
 *
 * So: layer 2 files the declaration, and the pipeline — which owns the ladder —
 * staples the rung table to it. Every rung this room actually composed, with the
 * mobility and the rampart bill it measured. A shell-mobility declaration that
 * reaches the plan without `rungs` is a bug, not a shortfall.
 */
function attachRungProof(plan, trail) {
  if (!plan?.meta?.shortfalls) return plan;
  for (const s of plan.meta.shortfalls) {
    // ONE MOBILITY ENTRY PER ROOM NOW, and the ladder goes under the one that
    // carries a negotiation record — a room whose enclosure never missed the
    // target composed no rungs and has nothing to staple. See declareMobility in
    // layer-walls for why the two entries became one.
    if (s.gate !== "mobility" || !s.negotiated || s.ladder) continue;
    // ------------------------------------------------------------------
    // MF4 (round 18) — THE SECOND RUNGS ARRAY IS GONE.
    //
    // This wrote `s.rungs` — every composition of every seed, 228 numbers across
    // 57 rooms [r22-waived: the size of the DELETED array, measured on the build
    // it was deleted from — 228 numbers across 57 rooms is a count of something
    // this artifact deliberately no longer publishes] — beside `s.ladder.rungs`,
    // which is the table the paragraph is
    // actually rendered from. `rungs` is in the declaration ENVELOPE
    // (validate.mjs RECORD_ENVELOPE), so the leaf inventory walked straight past
    // it: a wholly unaudited numeric array, published as evidence
    // (`admitDeclaration` accepts a well-formed `rungs` AS the evidence a
    // declaration needs), sitting next to an audited one that says almost the
    // same thing. Two copies of a fact is one copy that can drift, and the
    // unaudited copy is the one a reviewer would be misled by.
    //
    // Nothing rendered from it — `renderMobility` reads `ladder.rungs` and
    // `ladder.trailLength`, and trailLength is the whole-trail count this array
    // was the only other record of. So it is deleted rather than bound: the
    // cheapest audit is the one with no second object in it. The idempotency
    // guard above moved to `s.ladder`, which is the field this function now
    // writes.
    // ------------------------------------------------------------------
    const skip = plan.meta.seedSkip ?? 0;
    const mine = trail.filter((r) => r.seedSkip === skip);
    const shipped = mobOf(plan);
    const shippedRamparts = rampartsOf(plan);
    // ------------------------------------------------------------------
    // THE VERDICT IS READ OFF THE TABLE, NOT ASSERTED ABOVE IT — AND THE TABLE IS
    // NOW A FIELD, NOT A CLOSURE.
    //
    // layer 2's cause template used to end "no cut of this basin can shorten it"
    // whenever it diagnosed terrain — a claim about every enclosure the room
    // admits, printed directly above a table of enclosures this room actually
    // composed, 30 of which listed a COMPLETE rung with a materially shorter lap.
    // E14S5 shipped 7.5 at 40 ramparts with rung 1 sitting in its own table at 1.5
    // for 43. The impossibility claim is gone from layer 2 and this replaced it:
    // whatever the rungs say.
    //
    // What this function then did was `s.detail += " LADDER WALKED: …"`, and that
    // is the defect being closed here. A second writer appending to a finished
    // paragraph is exactly the shape that produced three structurally different
    // `towers/weak-battery` paragraphs under one kind, and under the generated-
    // prose contract it is not merely untidy, it is a hard failure: the validator
    // renders the published record and gets a paragraph with NO ladder in it,
    // while the plan ships one with a ladder concatenated on the end, so every
    // room that walked a ladder fails prose identity. The four numbers the verdict
    // was chosen from — the shipped lap, the shipped rampart bill, the rung table
    // and the trail length — plus the four thresholds it prices with, were all
    // closures over this function and appeared in the shipped plan nowhere.
    //
    // So the pipeline publishes `s.ladder` and RE-RENDERS. `renderMobility`
    // recomputes `better` and `best` from `ladder.rungs` every time, so a record
    // whose own table contains a materially shorter complete rung cannot print the
    // "nothing shorter exists" sentence, whatever this function believed.
    // ------------------------------------------------------------------
    s.ladder = {
      // the rungs of the SHIPPED seed — the ones that were a real alternative.
      // `trailLength` below is how many compositions the whole search paid for
      // across every seed, which is the only other thing the deleted `s.rungs`
      // array said (MF4).
      rungs: mine.map((r) => ({
        rung: r.rung,
        needDeepBonus: r.needDeepBonus,
        mobility: r.mobility,
        ramparts: r.ramparts,
        complete: r.complete,
      })),
      trailLength: trail.length,
      shippedLap: shipped,
      shippedRamparts,
      // the four prices the verdict is argued with, carried rather than imported
      // for the same reason `metric.target` is: this planner reprices the
      // enclosure trade, and a paragraph rendered after a reprice must not
      // silently restate it in today's currency.
      perRatio: MOBILITY_ENCLOSURE_PER_RATIO,
      cap: MOBILITY_ENCLOSURE_CAP,
      buyFloor: MOBILITY_BUY_FLOOR,
      materialLap: MATERIAL_LAP,
      target: MOBILITY_TARGET,
      // ...and the trail-wide best, which is the ONLY thing the rung table above
      // cannot answer from itself: when this seed contributed no rung at all,
      // `best` came from the whole trail. One source per situation, never blended.
      fallbackBest: mine.length
        ? null
        : trail.length
          ? (() => {
              const r = trail.reduce((b, x) => (x.mobility < b.mobility ? x : b));
              return {
                rung: r.rung,
                needDeepBonus: r.needDeepBonus,
                mobility: r.mobility,
                ramparts: r.ramparts,
                complete: r.complete,
              };
            })()
          : null,
    };
    // RE-RENDER, do not append. `renderDecl` is a pure function of `s`, and `s`
    // is only now complete.
    s.detail = renderDecl(s);
  }
  return plan;
}

/**
 * A SEARCH THAT WILL NOT CONVERGE IS A SHORTFALL LIKE ANY OTHER.
 *
 * The stated budget was "~200ms per room offline" and the fleet's real p50 is
 * around 450ms, because every room now composes up to four proof-carrying rungs
 * instead of one unexamined plan. That trade is defensible and it is written
 * down (docs/BASE-PLANNER-PERFECTION-GOAL.md). A room that composes MORE THAN
 * ONE SEED'S WORTH of them is a different thing: no enclosure of the
 * best-scoring confluence held the RCL8 program at any rung, so the planner
 * walked down the ranked seed list, and every step of that walk is a complete
 * shell negotiation plus the whole structure program. E4S7 is the standing
 * example at 32 compositions across 8 seeds.
 *
 * WHY THIS IS NOT TRIGGERED ON THE CLOCK ANY MORE. It used to fire above 1000ms
 * of wall time, and a wall clock is the one thing about a plan that is different
 * on every run — so the declaration APPEARED AND DISAPPEARED between runs, the
 * artifact never hashed the same twice, and "the planner is deterministic" was
 * an unfalsifiable claim. Bucketing the prose did not fix that; the TRIGGER was
 * the problem. The declaration is now keyed on the thing it was always actually
 * about, which the planner controls and which is identical on every run: how
 * many full compositions this room paid for. The stopwatch survives where it
 * belongs — in the suite's own timing report and in the validator's note, both
 * of which are console output that nothing hashes.
 *
 * A note, never a failure: the planner runs offline, so a slow room costs a
 * developer's patience and nothing in-game.
 */
const RUNTIME_DECLARE_COMPOSES = SHELL_ESCALATION.length;
function declareRuntime(plan, trail) {
  // ------------------------------------------------------------------
  // THE COUNT IS PUBLISHED WHETHER OR NOT IT IS DECLARED, and that is the
  // difference between an obligation and a courtesy.
  //
  // The validator's runtime obligation used to fall back to
  // `meta.shellEscalation.steps` when no declaration was present — and that
  // field counts the rungs of ONE seed, while this declaration is about every
  // composition the room paid for across all of them. E12S5 composed 7 plans
  // over 2 seeds and its shipped seed walked 1 rung, so deleting the
  // declaration took the re-derived trigger from 7 to 1 and the obligation
  // stopped firing: the only witness to the number was the declaration the
  // check was supposed to be able to demand. A trigger that reads the thing it
  // is auditing is not a trigger.
  //
  // So the count is published unconditionally, before the threshold is applied,
  // and the schema gate makes its absence a hard fail. The declaration then
  // carries the same number in its own record, where the content audit compares
  // the two.
  // ------------------------------------------------------------------
  const seeds = new Set(trail.map((r) => r.seedSkip)).size;
  const complete = trail.filter((r) => r.complete).length;
  plan.meta.compositions = { total: trail.length, seeds, complete };
  if (trail.length <= RUNTIME_DECLARE_COMPOSES) return;
  plan.meta.shortfalls = plan.meta.shortfalls || [];
  const sfRuntime = {
    gate: "runtime",
    kind: "heavy-search",
    detail: "",
    // `ladder` is the line this declaration fires at, and it was a module
    // constant quoted inside the sentence: the paragraph could name any
    // threshold at all and the record could not contradict it.
    runtime: {
      compositions: trail.length,
      seeds,
      complete,
      seedSkip: plan.meta.seedSkip ?? 0,
      ladder: RUNTIME_DECLARE_COMPOSES,
    },
  };
  sfRuntime.detail = renderDecl(sfRuntime);
  plan.meta.shortfalls.push(sfRuntime);
}

/**
 * A ROOM SHORT ON EXTENSIONS SAYS SO, WITH THE SEARCH ATTACHED.
 *
 * 60/60 is the standing requirement and until this world every claimable room
 * met it, so the planner had never had to file the declaration the validator
 * has always been willing to accept. `extensions|count` is deliberately NOT in
 * the validator's UNDECLARABLE_PAIRS — extensions are a CAPACITY, a genuinely
 * cramped room can fit 56 and no more — while `labs|count`, `towers|count` and
 * `spawn|count` are. That asymmetry is the whole design: the exact-program
 * pieces are what every other system in this repo is written against, so when a
 * room cannot hold everything, the piece that gives is the one the doctrine
 * says may give.
 *
 * E9S2 in the new world is the first room to need it: 175 walkable tiles inside
 * the best enclosure it admits, and the RCL8 program wants ~87 blocking
 * structures plus the corridor that services them. It ships ten labs and 56
 * extensions. The alternative the planner used to ship — 60 extensions and NO
 * LABS — is not the better room, it is the same shortfall moved onto a gate that
 * is not allowed to carry it.
 *
 * The declaration is refused by the validator's evidence rule unless it
 * quantifies something, so it carries the whole ladder: every composition this
 * room paid for, what program each held, and the best extension count reached
 * anywhere in the search together with what that composition gave up for it.
 */
function declareExtShortfall(plan, trail) {
  if (!plan || !plan.meta || plan.error) return;
  const got = extCount(plan);
  if (got >= EXT_TARGET) return;
  const labs = (plan.structures?.lab || []).length;
  // the whole search, best-extensions first — including the compositions that
  // bought extensions by dropping a piece that is not allowed to be dropped
  const ranked = trail.slice().sort((a, b) => b.ext - a.ext || b.lab - a.lab);
  const bestExt = ranked[0];
  const seeds = new Set(trail.map((r) => r.seedSkip)).size;
  // what the room actually has to work with, re-counted here rather than taken
  // from any layer's own bookkeeping
  let interior = 0;
  let deep = 0;
  if (plan.exterior && plan.depth && plan.terrain) {
    for (let y = 1; y <= 48; y++) {
      for (let x = 1; x <= 48; x++) {
        const i = x + y * 50;
        if (Number(plan.terrain.charAt(i)) & 1) continue; // wall
        if (plan.exterior[i]) continue;
        interior++;
        if (plan.depth[i] >= 4) deep++;
      }
    }
  }
  const s = plan.structures || {};
  const blocking = ["extension", "lab", "tower", "spawn", "storage", "terminal", "nuker", "observer", "link"]
    .reduce((n, t) => n + (s[t] || []).length, 0);
  const roads = (s.road || []).length;
  const tradeoff =
    bestExt && bestExt.ext > got
      ? `The best extension count this search REACHED anywhere is ${bestExt.ext} (seed rank ` +
        `${bestExt.seedSkip}, rung ${bestExt.rung}) — and that composition held ${bestExt.lab} lab(s) and ` +
        `${bestExt.tower} tower(s). Labs and towers are exact-program pieces the validator will not let a ` +
        `note excuse (UNDECLARABLE_PAIRS), and rightly: a room with no lab diamond cannot boost, ever. So ` +
        `that plan is not a better room, it is this same shortfall moved onto a gate that may not carry it.`
      : `No composition in this search reached more than ${got} extensions at any seed or any rung.`;
  plan.meta.shortfalls = plan.meta.shortfalls || [];
  plan.meta.shortfalls.push({
    gate: "extensions",
    kind: "count",
    source: "pipeline",
    detail:
      `EXTENSIONS SHORT: this room ships ${got} of ${EXT_TARGET}. The enclosure it admits holds ` +
      `${interior} walkable interior tile(s), ${deep} of them at depth >= 4, and the RCL8 program it DID ` +
      `place already occupies ${blocking} blocking tile(s) plus ${roads} road tile(s) — the corridor is ` +
      `not optional, every extension owes a D4 road face. ${trail.length} complete composition(s) were ` +
      `paid for across ${seeds} seed(s) and all four rungs of the shell ladder (a wider bubble is the one ` +
      `lever that buys interior, and it was pulled to the end). ${tradeoff} The ${labs} lab(s), ` +
      `${(s.tower || []).length} tower(s), ${(s.spawn || []).length} spawn(s), storage, terminal, nuker ` +
      `and observer are all present, so nothing was quietly dropped to make this number smaller; the ` +
      `${EXT_TARGET - got} missing extension(s) are the room, not a placement that gave up early.`,
    count: got,
    rungs: trail.map((r) => ({
      seedSkip: r.seedSkip,
      rung: r.rung,
      needDeepBonus: r.needDeepBonus,
      ext: r.ext,
      lab: r.lab,
      tower: r.tower,
      ramparts: r.ramparts,
      cut: r.cut,
    })),
  });
}

function minUpkeepShell(d, first, firstIdx, ecoCap, seedSkip, trail, shellCache) {
  let win = first;
  let winIdx = firstIdx;
  let steps = firstIdx + 1;
  // WHY THE LADDER IS WALKED. Three reasons, and the first one used to be
  // wrong.
  //
  //   mobility  the shipped lap is over target. The old rule additionally
  //             demanded mobilityCause === "shape", on the theory that a wider
  //             bubble can only swallow a bay. That theory is false: the cause
  //             is diagnosed on the CURRENT enclosure, and a different rung is
  //             a different enclosure with a different diagnosis. E11S4 was
  //             labelled "terrain — no cut of this basin can shorten it" and
  //             rung 1 of the same seed shortened it to 1.0 with one rampart
  //             LESS. E8S7's own meta recorded the rung-0 mobility, escalated
  //             for ramparts, and still declared "no cut can shorten it".
  //             The cause now colours the declaration; it no longer gates the
  //             search.
  //   shallow   structures pushed into the depth<=3 band, each renting a
  //             personal rampart forever (the original reason this exists).
  //   demand    layer 6 ran out of deep interior (deepExhausted) or had to
  //             place extensions road-blind (corridorFallback) — both mean the
  //             shell's demand estimate under-counted what the mass needed, and
  //             both are invisible to the shallow counter when the mass papers
  //             over it with tail placements. E16S7 ships 29 depth-4
  //             extensions this way and never walked.
  const mobilityWalk = mobOf(first) > MOBILITY_TARGET;
  const shallowWalk = (first.meta?.extensions?.shallow ?? 0) >= ESCALATE_MIN;
  const demandWalk =
    !!first.meta?.extensions?.deepExhausted || (first.meta?.extensions?.corridorFallback ?? 0) > 0;
  let noGainStreak = 0;
  if (shallowWalk || mobilityWalk || demandWalk) {
    for (let si = firstIdx + 1; si < SHELL_ESCALATION.length; si++) {
      const p = composePlan(d, { ...SHELL_ESCALATION[si], seedSkip, shellCache });
      steps++;
      if (p.error || !p.shell) break; // nothing wider will conjure a shell here
      trail.push(rungRecord(p, seedSkip, si));
      if (!grade(p).complete) break; // a wider bubble that loses pieces is not a bargain
      if (ecoCap !== null && ecoCost(p) > ecoCap) break;
      const noGain = rampartsOf(p) >= rampartsOf(win);
      // a rung that shortens the lap without adding a single rampart is bought
      // on mobility grounds alone; anything that costs wall still has to be
      // cheaper upkeep, because upkeep is the first objective and mobility the
      // tiebreak — never the other way round
      const freeMobilityWin = rampartsOf(p) <= rampartsOf(win) && mobOf(p) < mobOf(win);
      // ...with one bounded exception, priced rather than gated: while the
      // incumbent is still failing the target, a rung may cost extra ramparts in
      // proportion to the gated lap it RECLAIMS — see mobilityAllowance. Both
      // sides are measured against `first`, the room's own cheapest composition,
      // so the cap is a total and not a per-step allowance the ladder can spend
      // four times over. A room already inside the target buys nothing here.
      const reclaimed = mobOf(first) - mobOf(p);
      const spend = rampartsOf(p) - rampartsOf(first);
      // ...and the incumbent has to be genuinely bad, not merely imperfect —
      // see MOBILITY_BUY_FLOOR. A room at 1.25 buying its way to 1.2 is the
      // "prettier ratio" purchase this premium is explicitly not for.
      const buysMobility =
        mobOf(win) > MOBILITY_BUY_FLOOR && mobOf(p) < mobOf(win) && spend <= mobilityAllowance(reclaimed);
      // A WALK THAT ONLY EXISTS TO SHORTEN THE LAP MAY NOT LENGTHEN IT. Without
      // this the rampart-first comparator turns a mobility search into a wall
      // sale: E17S9 walked for mobility, found a rung one rampart cheaper and
      // took it at 1.25 -> 2.0. A room walking for shallow structures or for
      // exhausted deep space is a different trade and keeps the old comparator.
      const mobilityRegression = !shallowWalk && !demandWalk && mobOf(p) > mobOf(win);
      if ((buysMobility || cheaperUpkeep(p, win) || freeMobilityWin) && !mobilityRegression) {
        win = p;
        winIdx = si;
      }
      // convex: the bill has started climbing again. A room still outside the
      // mobility target keeps walking anyway — the premium above can only be
      // spent by a rung we bothered to compose.
      //
      // ...AND THE CONVEXITY IS NOT EXACT, so the walk has one rung of patience.
      // The near-convexity argument (cut grows monotonically with needDeep while
      // personal ramparts fall, so the total is unimodal) is a tendency, not a
      // theorem: E11S6 and E17S6 both have a FLAT rung 1 and a strictly cheaper
      // rung 2 (28 ramparts against 36, eight personal ramparts deleted). They
      // used to reach it by accident, because the ungated lap read 1.5 and the
      // "still failing the target" escape hatch above kept the walk alive; the
      // moment this file started reading the gated lap the accident stopped and
      // they shipped nine shallow extensions each. The ladder has four rungs
      // total, so one rung of patience costs at most one extra compose in the
      // rooms that walk at all, and it is not an accident.
      if (noGain) noGainStreak++;
      else noGainStreak = 0;
      if (noGainStreak > NO_GAIN_PATIENCE && !(mobilityWalk && mobOf(win) > MOBILITY_TARGET)) break;
    }
  }
  const mine = trail.filter((r) => r.seedSkip === seedSkip);
  win.meta.shellEscalation = {
    steps,
    walked: shallowWalk || mobilityWalk || demandWalk,
    why: { mobility: mobilityWalk, shallow: shallowWalk, demand: demandWalk },
    // the rung, reported as the offset it is (0 = the demand-aware base floor)
    pickedNeedDeepBonus: SHELL_ESCALATION[winIdx].needDeepBonus ?? 0,
    pickedNeedDeep: win.meta?.shell?.needDeep ?? null,
    saved: rampartsOf(first) - rampartsOf(win),
    mobilityFirst: mobOf(first),
    mobilityPicked: mobOf(win),
    // kept as colour on the report, never as a gate on the search — see above
    causeFirst: mobCauseOf(first),
    // criticism 88 — every composed rung of this seed, with the cut the
    // validator re-walks. ladder.rungs mobility must equal enclosureMobility
    // of the matching cutTiles; a fatter discarded rung is no longer free.
    rungs: mine.map((r) => ({
      needDeepBonus: r.needDeepBonus,
      mobility: r.mobility,
      ramparts: r.ramparts,
      complete: r.complete,
      cutTiles: (r.cutTiles || []).map((t) => ({ x: t.x, y: t.y })),
    })),
  };
  return win;
}

/**
 * M5 — the escalation's price ceiling.
 *
 * Walking down the seed list moves the WHOLE hub, and the seeds below the
 * winner are ranked below it for a reason: they sit further from the
 * economy. E4S7 used to escalate to seedSkip 7 and buy its 60th extension
 * with a hub whose source paths summed to 61 (fleet median 27) and whose
 * controller path was 27 (median 11) — a permanent 2.5x hauler tax, paid
 * every trip, forever, to close a one-off checkbox.
 *
 * So a higher-seedSkip plan now has to earn the move twice: it must add
 * program pieces AND keep total hauler distance within ECO_TOLERANCE of
 * what the top-ranked seed managed. When nothing clears the bar we keep the
 * compact plan and report the shortfall honestly — meta.extensions.full is
 * allowed to be false. 60/60 is strongly preferred; it is not preferred at
 * any price.
 */
const ECO_TOLERANCE = 1.6;
const ecoCost = (p) => (p?.meta?.pathSourcesSum ?? 0) + (p?.meta?.pathController ?? 0);
const skipOf = (p) => p?.meta?.seedSkip ?? 0;

/** more of the program wins; on a tie take the cheaper wall */
function better(a, b, ecoCap) {
  if (!b) return true;
  const ga = grade(a),
    gb = grade(b);
  if (skipOf(a) > skipOf(b)) {
    // a moved the hub off the best seed — it must both improve the program
    // and stay inside the hauler-distance budget to be worth it
    if (ga.rank <= gb.rank) return false;
    if (ecoCap !== null && ecoCost(a) > ecoCap) return false;
    return true;
  }
  if (ga.rank !== gb.rank) return ga.rank > gb.rank;
  return ga.cut < gb.cut;
}

/**
 * ------------------------------------------------------------------
 * THE ONE PLACE THE UPGRADER'S SEATS ARE ACTUALLY PRICED.
 * ------------------------------------------------------------------
 * Holding every counted seat is free in all but a handful of rooms — measured,
 * twice, at two different floors. In the handful that are genuinely short of
 * deep floor it is not: those rooms pay for the reservation in SHALLOW
 * EXTENSIONS, and a shallow extension is a
 * personal rampart repaired forever plus a structure a ranged attacker can hit
 * from outside the wall. That is a real trade and it is the first one in this
 * file that the reservation cannot make on its own, because the cost only
 * becomes visible six layers after the tiles are reserved.
 * (The room count and the two-room roster were typed here and had gone stale by
 * round 20; plan.mjs names every room that releases, with its held/kept/shipped
 * seats, in the "released in N room(s)" clause of the upgrader-parks line of the
 * fleet summary at the end of a run, and each room's own meta.ctrlParkFloorWhy
 * says which case it is in. Criticism 80.)
 *
 * So it is priced here, once, on the composition the room is about to ship: if
 * the room ships a shallow extension AND is holding more seats than the hard
 * 4-seat floor, the same composition is re-run holding exactly four. It is kept
 * only if it is still a complete room and it is measurably better — strictly
 * fewer shallow extensions — and the seats it spent are named in a declaration.
 * One extra composition, in the rooms that need it and no others.
 *
 * WHY FOUR. `MIN_PARKS` in layer 1 and the validator's ctrlParks floor are both
 * 4 and always have been: below four seats the upgrader fleet is throttled by
 * the parking rather than by the energy, which is the m9 finding this whole
 * mechanism exists for. Above four, a seat is worth less than a forever-rampart.
 */
const PARK_FLOOR_HARD = 4;
function maybeReleaseParks(d, plan) {
  if (!plan || plan.error || !plan.meta) return plan;
  const shallow = plan.meta.extensions?.shallow ?? 0;
  const held = plan.meta.ctrlParkFloor ?? 0;
  if (!shallow || held <= PARK_FLOOR_HARD || !plan.meta.composeOpts) return plan;
  // ...AND THE FLOOR IS ON THE SEATS THE ROOM SHIPS, NOT ON THE RESERVATION.
  //
  // A cap is how many tiles are HELD; what the upgraders get is how many are
  // still free once the mass has grown, and the two are not the same number.
  // E12S5 holding 4 seats ships 7 parks and 3 shallow extensions; E12S5 holding
  // TWO ships 5 parks — still above the floor — with 0 shallow extensions and
  // three fewer ramparts. Refusing to look below a cap of 4 would have missed a
  // composition that is better on every axis at once, including the one the cap
  // exists to protect. So the walk goes all the way down and every rung is
  // judged on what it SHIPS: complete room, parks at or above the hard floor,
  // strictly fewer shallow slots, ties to more parks and then fewer ramparts.
  let alt = null;
  let altShallow = shallow;
  // ------------------------------------------------------------------
  // WHAT WAS ACTUALLY COMPOSED, so the declaration can stop claiming otherwise.
  //
  // The generated paragraph said "Every cap from held-1 down to 0 was composed IN
  // FULL and measured" — a claim about a search, derived from `held`, printed by a
  // loop that BROKE at the first composition reaching zero shallow extensions
  // under the comment "nothing below this can do better". Two defects, and the
  // second one is the interesting one:
  //
  //   · the sentence was a lie whenever the break fired. E12S5 holds 12, and if a
  //     cap of 9 had come back at zero shallow the paragraph would still have
  //     claimed caps 8 through 0 were composed. Nothing composed them.
  //   · the break's premise is FALSE ON ITS OWN TIE-BREAK. `better` does not rank
  //     on shallow extensions alone: at equal shallow it takes MORE PARKS, and
  //     then FEWER RAMPARTS. So a cap below a zero-shallow winner can still beat
  //     it — that is precisely the case the comment above this loop cites (E12S5
  //     holding two ships five parks with three fewer ramparts than holding four),
  //     and the break was throwing exactly those compositions away unexamined.
  //
  // So the walk runs to the bottom, which is what the sentence always said it did,
  // and every rung it composed is recorded. It costs at most `held` compositions
  // in the two rooms on the fleet that reach this function at all.
  //
  // THE ROUND-21 RULING, AND WHY IT DOES NOT ADD A KEY HERE (obligation iii —
  // see DECLARED_KEY_RULE). A declared quantity is a key in every tie-break the
  // room's passes run, and this pass has one: shallow extensions, then parks,
  // then ramparts. Two facts about it, both stated rather than assumed:
  //   · its FIRST key already IS a declared quantity — `extensions/shallow` is
  //     the declaration this pass exists to shrink, and it outranks everything
  //     else here, which is the rule's own ordering arriving by construction;
  //   · this pass runs BEFORE finalizeRoom, so the candidates it compares have
  //     no as-built declaration channel yet — no verifyMobility, no shipped
  //     battery, no built lap. A key derived from `meta.shortfalls` here would
  //     be derived from half a board, and a key read off a panel that does not
  //     exist is a key that decides nothing while claiming to.
  // The two passes that DO carry the rule (the sealed-floor recovery and the
  // across-prior tower swap) both run at the end of `done`, on finalized rooms,
  // which is exactly what makes their panels able to read it.
  // ------------------------------------------------------------------
  const composedCaps = [];
  const rejected = { error: 0, incomplete: 0, underFloor: 0 };
  for (let cap = held - 1; cap >= 0; cap--) {
    const c = composePlan(d, { ...plan.meta.composeOpts, parkCap: cap });
    composedCaps.push(cap);
    if (c.error || !c.shell) {
      rejected.error++;
      continue;
    }
    if (!grade(c).complete) {
      rejected.incomplete++;
      continue;
    }
    if ((c.meta.ctrlParks ?? 0) < PARK_FLOOR_HARD) {
      rejected.underFloor++;
      continue;
    }
    const s = c.meta.extensions?.shallow ?? 0;
    const better =
      s < altShallow ||
      (alt &&
        s === altShallow &&
        ((c.meta.ctrlParks ?? 0) > (alt.meta.ctrlParks ?? 0) ||
          ((c.meta.ctrlParks ?? 0) === (alt.meta.ctrlParks ?? 0) &&
            (c.meta.counts?.rampart ?? 1e9) < (alt.meta.counts?.rampart ?? 1e9))));
    if (better) {
      alt = c;
      altShallow = s;
    }
  }
  if (!alt) return plan;
  const kept = alt.meta.ctrlParkReserve || [];
  const gave = (plan.meta.ctrlParkReserve || []).filter(
    (s) => !kept.some((k) => k.x === s.x && k.y === s.y),
  );
  alt.meta.shortfalls = alt.meta.shortfalls || [];
  const sfReleased = {
    gate: "ctrlParks",
    kind: "released",
    detail: "",
    tiles: gave.map((s) => ({ x: s.x, y: s.y })),
    ctrlParks: {
      held,
      kept: kept.length,
      released: gave.length,
      shallowHolding: shallow,
      shallowReleasing: altShallow,
      parksShipped: alt.meta.ctrlParks,
      rampartsHolding: plan.meta.counts?.rampart,
      rampartsReleasing: alt.meta.counts?.rampart,
      floor: PARK_FLOOR_HARD,
      // the fact underneath both columns, and the one figure of the nine this
      // paragraph quoted that was NOT in the record
      deepTiles: plan.shell?.deepTiles ?? null,
      // THE SEARCH, so the sentence about it is generated rather than asserted:
      // the caps this walk actually composed (lowest last), how many of them the
      // completeness and floor tests threw out, and the cap that won.
      composedCaps: composedCaps.slice(),
      composedFrom: held - 1,
      composedTo: 0,
      rejectedError: rejected.error,
      rejectedIncomplete: rejected.incomplete,
      rejectedUnderFloor: rejected.underFloor,
      winningCap: alt.meta.composeOpts?.parkCap ?? alt.meta.ctrlParkFloorCap ?? null,
    },
  };
  sfReleased.detail = renderDecl(sfReleased);
  alt.meta.shortfalls.push(sfReleased);
  return alt;
}

/**
 * ===========================================================================
 * THE ACROSS-PRIOR TAKE — priced on the board that ships (OF4 / OF6, round 16).
 * ===========================================================================
 * Layer 3 publishes two swaps it can see and cannot price:
 *
 *   · `adjacency.satAcrossPrior` — a single tower move ACROSS the D8-adjacency
 *     prior that lifts the weakest cut-tile face. Nine rooms carry one, worth
 *     330 damage between them, and the plan has been printing that number as
 *     "what the prior is still costing this room" for five rounds while
 *     declining to spend it.
 *   · `towerSwapOffer` — a swap the prior ALLOWS which holds the weakest face
 *     and its saturation exactly and improves the tower-only 5x5 or the clump.
 *
 * The reason both were refused is written in layer-towers and it is a good one:
 * "the SHIPPED nuke window rises in seven rooms and E12S4's as-built refill walk
 * goes 7 -> 10 ... a pass that cannot read the number it is moving is not a
 * non-worsening pass, it is a gamble that happened to come out ahead on one
 * term." That argument is about WHERE the decision is made, not about whether it
 * should be. Here, it can be read: the room is RE-COMPOSED with the swap taken,
 * finalized, and every as-built instrument is measured on the finished board and
 * compared with the finished board the room would otherwise have shipped.
 *
 * WHAT MUST NOT WORSEN, all of it on the shipped board:
 *   weakest cut-tile face · saturated cut tiles · the 5x5 nuke window over the
 *   whole high-value mass · the 5x5 window over the towers alone · the as-built
 *   self-blocked refill walk (and the count of towers the filler cannot reach) ·
 *   the interior walk region · the clump · extensions placed · shallow
 *   extensions · ramparts · the as-built gated defender lap.
 *
 * WHAT MUST IMPROVE, and this is the scope rule: the swap has to buy the room
 * out of something it would otherwise have to say. Either the weakest face goes
 * UP — the objective this whole layer exists for — or the clump falls below
 * CLUMP_NOTE and the room stops filing a clump declaration. A shipped tower is
 * not moved for a soft tie-break, because a fleet-wide experiment was run and
 * rejected and it said what that costs: ranking the dispersion pass itself on
 * the enriched tuple moved 56 of the 172 rooms of the fleet it was tried on, and
 * took E11S1's as-built refill from 4 to 7, E8S7's from 4 to 8 and E18S4's
 * shipped nuke window from 9 to 10. Those are that experiment's results on that
 * board — the ranking is not in the shipped pipeline and nothing re-measures
 * them, so they are the reason for the refusal and not a property of the fleet
 * this planner ships. (Round 20 past-tensed this: it read as a live fleet
 * statistic about the shipped rooms, which it never was. Criticism 80.)
 * Offers that are merely legal
 * are published (`towerSwapOffer`) and not taken, which is the same discipline
 * the rest of this planner applies to a trade it cannot price.
 *
 * Cost: at most one extra composition in the handful of rooms holding an offer
 * that could clear the rule — two in the fleet for the face lift, two for the
 * clump. Every other room composes exactly as many times as before.
 */
const HV_WINDOW_TYPES = ["spawn", "storage", "terminal", "nuker", "tower"];
function windowMaxOver(pts) {
  let mx = 0;
  for (const a of pts) {
    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const cx = a.x + ox,
          cy = a.y + oy;
        let n = 0;
        for (const b of pts) if (Math.abs(b.x - cx) <= 2 && Math.abs(b.y - cy) <= 2) n++;
        if (n > mx) mx = n;
      }
    }
  }
  return mx;
}
/** the instrument panel, read off a FINALIZED plan and nothing else */
function asBuiltInstruments(terrain, plan) {
  const tw = plan.meta?.towers || {};
  const towers = plan.structures?.tower || [];
  const cut = plan.shell?.cut || [];
  const dmgAt = (t) => {
    let sum = 0;
    for (const w of towers) {
      const r = Math.max(Math.abs(w.x - t.x), Math.abs(w.y - t.y));
      sum += r <= 5 ? 600 : r >= 20 ? 150 : 600 - (r - 5) * 30;
    }
    return sum;
  };
  const faces = cut.map(dmgAt);
  const hv = [];
  for (const t of HV_WINDOW_TYPES) for (const p of plan.structures?.[t] || []) hv.push(p);
  const rset = new Set((plan.structures?.rampart || []).map((r) => `${r.x},${r.y}`));
  const blocked = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures?.[t] || []) blocked.add(`${p.x},${p.y}`);
  }
  const ext = plan.shippedExterior || plan.exterior;
  const interior =
    ext && plan.sitter ? interiorWalk(terrain, rset, ext, blocked, plan.sitter).size : null;
  // ------------------------------------------------------------------
  // O2 (round 17) — `refill` IS A MAX, AND A MAX IS BLIND TO ITS OWN BATTERY.
  //
  // E3S1's take moved a tower 23,23 -> 22,19 and the panel read `refill 10 ->
  // 10`, so the basis string said "no instrument moves the wrong way". The
  // room's SIX per-tower filler walks went 3/5/6/8/10/10 -> 3/5/8/10/10/10:
  // the moved tower's own walk went 6 -> 10, taking the room from two towers at
  // the hard cap to three, and the battery's total from 42 steps to 46. E3S1 is
  // a room that FILES `towers|weak-battery` on that very walk, and the take
  // bought the regression for +30 damage — one falloff step — on one cut tile.
  // The instrument could not see it because the max was already at the cap and
  // a max cannot rise past its own ceiling.
  //
  // So the whole distribution is on the panel: the sorted per-tower walk
  // vector, its total, how many towers sit AT the hard cap, and how many are
  // over the line the room declares at. Sorted rather than per-seat because the
  // take MOVES a tower — the battery is a multiset of walks and the honest
  // comparison is between the two multisets, not between two arrays indexed by
  // a seat identity that changed.
  // ------------------------------------------------------------------
  const walks = Array.isArray(tw.refillDists) ? tw.refillDists.slice().sort((a, b) => a - b) : null;
  return {
    face: faces.length ? Math.min(...faces) : 0,
    saturatedCutTiles: faces.filter((v) => v >= MIN_SAT).length,
    nukeWindow: windowMaxOver(hv),
    towerWindow: windowMaxOver(towers),
    refill: typeof tw.maxRefill === "number" ? tw.maxRefill : null,
    refillUnreachable: tw.refillUnreachable ?? 0,
    // the four O2 readings — see the header
    refillWalks: walks,
    refillTotal: walks ? walks.reduce((a, b) => a + b, 0) : null,
    refillAtCap: walks ? walks.filter((v) => v >= MAX_REFILL).length : null,
    refillOverNote: walks ? walks.filter((v) => v > REFILL_NOTE).length : null,
    interior,
    clump: tw.towerClump?.withinCheb2OfSitter ?? null,
    extensions: (plan.structures?.extension || []).length,
    shallowExts: plan.meta?.extensions?.shallow ?? 0,
    ramparts: (plan.structures?.rampart || []).length,
    lap: plan.meta?.walls?.mobility?.builtGated ?? null,
    // O3: the objective of the sealed-floor recovery pass, and an instrument for
    // every other re-composition in this file — a swap that seals deep floor off
    // is a swap that costs the room buildable ground nobody was counting.
    sealedTiles: plan.meta?.sealedFloor?.tiles ?? 0,
    sealedDeep: plan.meta?.sealedFloor?.deep ?? 0,
    // O3: "every extension has a D4 road face" is a hard gate elsewhere; a
    // re-composition that breaks it must not be able to pass this panel either.
    extNoD4Face: countExtNoD4Face(plan),
    // O3: structures our own road network does not reach — the network
    // instrument, counted rather than asserted.
    offNetwork: countOffNetwork(plan),
    // ------------------------------------------------------------------
    // ...AND THE TWO HARD GATES A RE-COMPOSITION CAN BREAK.
    //
    // Found by running the sealed-floor recovery: E11S7's third candidate
    // re-composed into a room that recovers its pocket, holds every instrument
    // above, and ships an extension standing ON a road at 18,21 with a
    // three-tile road stub (18,21 17,20 16,19) that conducts to nothing. Both
    // are HARD validator failures, neither was an instrument, and "no
    // instrument moves the wrong way" was therefore not the same statement as
    // "this room is legal". A pass allowed to replace the composition has to be
    // able to see everything the composition can break, so the two gates are
    // read here with the validator's own derivations.
    //
    // (The stack itself is a latent layer-6/7b defect: no room in the fleet
    // ships one today, and it only appears in this one re-composition. It is
    // recorded rather than chased here — the bounded fix is that this pass
    // cannot ship it, and it now cannot.)
    // ------------------------------------------------------------------
    stackedOnRoad: countStacks(plan),
    orphanRoads: countOrphanRoads(plan),
  };
}
/**
 * ===========================================================================
 * OF6 (round 18) — THE OTHER WALK. The one nobody was pricing.
 * ===========================================================================
 * `INSTRUMENT_DIRECTION` carries four readings of the TOWER battery's walk and
 * not one of the sixty extensions, which is the walk the filler actually spends
 * its life on and the owner's most-repeated preference ("dense but walkable",
 * "extensions closest-first", "a filler tour is short and obvious"). Round 17's
 * owner review measured the eight takes by hand: E15S6 paid +9 total steps and
 * +1 on its longest extension walk, E2S1 +7, E9S1 +3, four rooms improved, net
 * -7 over the eight. Nothing shipped an owner would object to — and nothing
 * looked, which is the finding.
 *
 * So the recovery pass reads it. The model is layer 6's own build-order model
 * (`builtField`/`buildCost` in layer-ext): the filler walks the FINISHED
 * interior with every obstacle of ours standing, and an extension's cost is one
 * step off the nearest walkable D4 face — the tile the filler stands on to fill
 * it. Summed over the mass, that is the room's whole extension tour.
 *
 * WHY IT IS NOT IN `INSTRUMENT_DIRECTION`. A non-worsening gate on this number
 * would refuse a recovery for one step of tour, and one step of tour is not
 * worth five tiles of deep floor the program can build on forever. It is priced
 * instead, with the bound stated on the record and quoted in the note:
 * SEALED_RECOVERY_TOUR_SLACK steps of extra TOTAL tour, which is the same order
 * as the per-tower slack the battery gets (`TAKE_WALK_SLACK_STEPS`) scaled by
 * the sixty structures this walk runs over. Past it the candidate is refused
 * with the number printed; inside it the delta is reported either way, so a
 * reader sees what the room paid rather than being told it paid nothing.
 */
function extTourSteps(terrain, plan) {
  const exts = plan.structures?.extension || [];
  if (!exts.length || !plan.sitter) return null;
  const ext = plan.shippedExterior || plan.exterior;
  if (!ext) return null;
  const rset = new Set((plan.structures?.rampart || []).map((r) => key(r.x, r.y)));
  const blocked = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures?.[t] || []) blocked.add(key(p.x, p.y));
  }
  // the same flood `interiorWalk` runs, carrying the step count with it: the
  // filler is a creep of ours inside our own wall, so the cut is walkable, the
  // exterior is not, and everything that blocks a creep blocks it.
  const dist = new Int32Array(2500).fill(-1);
  dist[plan.sitter.x + plan.sitter.y * 50] = 0;
  const q = [plan.sitter];
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const d = dist[cur.x + cur.y * 50];
    for (const [dx, dy] of D8) {
      const x = cur.x + dx,
        y = cur.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      const i = x + y * 50;
      if (dist[i] >= 0 || !walkable(terrain, x, y)) continue;
      const k = key(x, y);
      if (!rset.has(k) && ext[i]) continue;
      if (blocked.has(k)) continue;
      dist[i] = d + 1;
      q.push({ x, y });
    }
  }
  let total = 0;
  let unreached = 0;
  for (const e of exts) {
    let best = -1;
    for (const [dx, dy] of D4) {
      const x = e.x + dx,
        y = e.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      const d = dist[x + y * 50];
      if (d >= 0 && (best < 0 || d + 1 < best)) best = d + 1;
    }
    if (best < 0) unreached++;
    else total += best;
  }
  return { total, unreached, extensions: exts.length };
}
/**
 * ---------------------------------------------------------------------------
 * MF2 (round 22) — THE COUNTERFACTUAL TOUR, WITNESSED RATHER THAN ASSERTED.
 * ---------------------------------------------------------------------------
 * `extTourAfter` and `extTourDelta` are read off a board this room did not
 * ship. Every other panel figure on an offered candidate has the same property,
 * and the file says so — but the tour is the PRICED key the tie-break turns on,
 * so "nothing outside the record can compare it with anything" is the difference
 * between a decision and a number. A coherent two-leaf edit (move the delta and
 * the after together, keeping before + delta === after) rewrites which candidate
 * the pass "would have" taken and erases the one `decidedBy` this fleet files.
 *
 * `extTourSteps` is DETERMINISTIC given a board, and it reads exactly five
 * things: the terrain, the sitter, the exterior flood, the rampart set, and the
 * tiles that block a creep (BUILT_OBSTACLES plus the room's own objects). So the
 * witness is the DIFF of those five between the pre-take board — which the room
 * ships, and which anybody holding the artifact has — and the candidate. The
 * extension mass is the part that actually moves (a withdrawn seat re-seats
 * sixty extensions), and it is published as an out/in tile list, bounded by the
 * number of seats layer 6 relocated. Everything else is published as a diff too,
 * and is empty on this fleet — which is the interesting claim, and it is made
 * checkably rather than assumed: `tourBoardIdentical` is false the moment a
 * candidate moved a rampart or a lab, and then `otherMoved` names it.
 *
 * With that, the counterfactual tour is RE-DERIVABLE: take the shipped board,
 * apply the diff, re-run extTourSteps. `extTourAfter` is then pinned exactly and
 * the two-leaf edit contradicts it.
 */
const TOUR_BOARD_KINDS = ["rampart", ...BUILT_OBSTACLES];
function tourWitness(base, alt) {
  const setOf = (p, t) => new Set((p.structures?.[t] || []).map((s) => `${s.x},${s.y}`));
  const only = (a, b) =>
    [...a]
      .filter((k) => !b.has(k))
      .sort()
      .map((k) => {
        const [x, y] = k.split(",").map(Number);
        return { x, y };
      });
  const be = setOf(base, "extension");
  const ae = setOf(alt, "extension");
  const w = { extOut: only(be, ae), extIn: only(ae, be), otherMoved: [] };
  for (const t of TOUR_BOARD_KINDS) {
    if (t === "extension") continue;
    const b = setOf(base, t);
    const a = setOf(alt, t);
    const out = only(b, a);
    const inn = only(a, b);
    if (out.length || inn.length) w.otherMoved.push({ type: t, out, in: inn });
  }
  // the objects are the room's own (sources, controller, mineral) and cannot
  // move; the exterior flood can, and it is the one input that is not a tile
  // list, so it is compared as a whole and reported as a tile count.
  const bx = base.shippedExterior || base.exterior;
  const ax = alt.shippedExterior || alt.exterior;
  let exteriorDiff = null;
  if (bx && ax && bx.length === ax.length) {
    let n = 0;
    for (let i = 0; i < bx.length; i++) if (!!bx[i] !== !!ax[i]) n++;
    exteriorDiff = n;
  }
  w.exteriorDiff = exteriorDiff;
  w.tourBoardIdentical = !w.otherMoved.length && exteriorDiff === 0;
  return w;
}
/** tiles carrying a road AND a solid that is not a container — a hard validator fail */
function countStacks(plan) {
  const byTile = new Map();
  for (const [t, list] of Object.entries(plan.structures || {})) {
    for (const p of list || []) {
      const k = `${p.x},${p.y}`;
      if (!byTile.has(k)) byTile.set(k, []);
      byTile.get(k).push(t);
    }
  }
  let n = 0;
  for (const types of byTile.values()) {
    if (new Set(types).size !== types.length) n++;
    const solids = types.filter((t) => t !== "rampart" && t !== "road");
    if (new Set(solids).size > 1) n++;
    if (types.includes("road") && solids.some((t) => t !== "container")) n++;
  }
  return n;
}
/** roads not in the sitter's conducting component — verbatim roadComponent */
function countOrphanRoads(plan) {
  const blocked = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures?.[t] || []) blocked.add(`${p.x},${p.y}`);
  }
  const net = new Set();
  for (const r of plan.structures?.road || []) {
    const k = `${r.x},${r.y}`;
    if (blocked.has(k)) continue; // dead tile, conducts nothing
    net.add(k);
  }
  for (const c of plan.structures?.container || []) net.add(`${c.x},${c.y}`);
  const sitter = plan.sitter;
  if (!sitter) return 0;
  net.add(`${sitter.x},${sitter.y}`);
  const comp = new Set([`${sitter.x},${sitter.y}`]);
  const q = [sitter];
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    for (const [dx, dy] of D8) {
      const x = cur.x + dx,
        y = cur.y + dy;
      const k = `${x},${y}`;
      if (comp.has(k) || !net.has(k)) continue;
      comp.add(k);
      q.push({ x, y });
    }
  }
  return (plan.structures?.road || []).filter((r) => !comp.has(`${r.x},${r.y}`)).length;
}
/** extensions with no D4 road neighbour on the shipped board */
function countExtNoD4Face(plan) {
  const roads = new Set((plan.structures?.road || []).map((r) => `${r.x},${r.y}`));
  let n = 0;
  for (const e of plan.structures?.extension || []) {
    if (!D4.some(([dx, dy]) => roads.has(`${e.x + dx},${e.y + dy}`))) n++;
  }
  return n;
}
/**
 * Owned structures THE ROOM'S ROAD NETWORK DOES NOT REACH.
 *
 * ...AND "THE NETWORK" IS THE COMPONENT, NOT THE NEIGHBOURHOOD (round 22, OM4).
 *
 * This counted a structure as on-network if ANY of its eight neighbours carried
 * a road or a container, which is an adjacency test wearing a connectivity
 * word — the header has always said "reach". It read a different quantity from
 * the one the room DECLARES: `misc/off-network` publishes `tiles`, and it lists
 * TWO tiles (the mineral seat and the extractor standing on the mineral beside
 * it, both excused by name), while this function returned 1 in every one of the
 * 133 rooms that file it. The extractor was on-network by this test purely
 * because the seat is a container — a container that is itself off the network.
 * The declared value and the ranked value were therefore two different numbers
 * wearing one label, on every take and every swap that read the key.
 *
 * So the network is the sitter's one D8 component over roads and containers —
 * the same definition layer 7b's swap predicate and the validator's road gate
 * use — and a structure is off it when neither it nor any of its eight
 * neighbours is in that component. `extractor` joins the counted kinds because
 * the declaration excuses it by name. Re-derived over the shipped fleet: this
 * reads 2 in all 133 declaring rooms (exactly `tiles.length`) and is unchanged
 * from the old reading in the other 39 — a mismatch in 133 of 133 becomes 0 of
 * 133, and no ranking anywhere moves, because the exemption is a constant that
 * cancels in every BEFORE/AFTER comparison. A newly stranded structure does not
 * cancel, which is what the instrument is for.
 */
const NETWORK_KINDS = [
  "spawn",
  "extension",
  "tower",
  "lab",
  "link",
  "storage",
  "terminal",
  "nuker",
  "observer",
  "container",
  "extractor",
];
function countOffNetwork(plan) {
  const live = new Set((plan.structures?.road || []).map((r) => `${r.x},${r.y}`));
  const conduct = new Set(live);
  for (const c of plan.structures?.container || []) conduct.add(`${c.x},${c.y}`);
  const sitter = plan.sitter;
  const net = new Set();
  if (sitter) {
    net.add(`${sitter.x},${sitter.y}`);
    const q = [sitter];
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      for (const [dx, dy] of D8) {
        const x = c.x + dx,
          y = c.y + dy;
        const k = `${x},${y}`;
        if (net.has(k) || !conduct.has(k)) continue;
        net.add(k);
        q.push({ x, y });
      }
    }
  }
  let n = 0;
  for (const t of NETWORK_KINDS) {
    for (const p of plan.structures?.[t] || []) {
      const k = `${p.x},${p.y}`;
      if (net.has(k)) continue;
      if (D8.some(([dx, dy]) => net.has(`${p.x + dx},${p.y + dy}`))) continue;
      n++;
    }
  }
  return n;
}
/** every SCALAR instrument, with the direction each one is allowed to move */
const INSTRUMENT_DIRECTION = {
  face: "up",
  saturatedCutTiles: "up",
  nukeWindow: "down",
  towerWindow: "down",
  refill: "down",
  refillUnreachable: "down",
  // O2 — the two lines the room's own declaration channel fires at. MAX_REFILL
  // is layer 3's hard cap (a battery over it is refused outright); REFILL_NOTE
  // is the line `declareShippedRefill` files a weak-battery declaration at. A
  // take may not push another tower across either of them.
  refillAtCap: "down",
  refillOverNote: "down",
  interior: "up",
  clump: "down",
  extensions: "up",
  shallowExts: "down",
  ramparts: "down",
  lap: "down",
  // O3
  sealedTiles: "down",
  sealedDeep: "down",
  extNoD4Face: "down",
  offNetwork: "down",
  stackedOnRoad: "down",
  orphanRoads: "down",
};
function instrumentsHold(before, after) {
  const worse = [];
  for (const k of Object.keys(INSTRUMENT_DIRECTION)) {
    const a = before[k],
      b = after[k];
    if (a === null || a === undefined || b === null || b === undefined) continue;
    if (INSTRUMENT_DIRECTION[k] === "up" ? b < a : b > a) worse.push(`${k} ${a}->${b}`);
  }
  const walkWhy = refillPriceHolds(before, after);
  if (walkWhy) worse.push(walkWhy);
  return worse;
}
/**
 * ===========================================================================
 * THE DECLARED QUANTITY IS A KEY (round 21 — the RULING on criticism 95).
 * ===========================================================================
 * Criticism 95 was E11S7: the sealed-floor recovery admitted nine seats, four of
 * them recovering the same 5 deep tiles, and picked between them on the filler's
 * extension tour alone. The seat it took (20,8) buys 46 steps of tour and ships
 * an as-built gated defender lap of 9.00; the seat it passed over (14,8) buys 23
 * and ships 8.67 — and E11S7 is a room that DECLARES its defender lap, in
 * `meta.shortfalls`, gate `mobility`. The lap was on the instrument panel as a
 * non-worsening GATE (it may not get worse than the un-taken board's 9.33) and
 * nowhere in the tie-break, so the pass spent a number the room has to publish
 * to buy a number nothing outside the record reads, and the room's own gallery
 * headline moved. Both readings were published, so nothing was hidden; the
 * ordering was simply wrong.
 *
 * THE RULE, GENERAL AND STATED ONCE:
 *
 *   Where a room's plan DECLARES a quantity, that quantity is a KEY in every
 *   tie-break that room's passes run — ranked immediately after the pass's own
 *   ADMISSION quantities and ahead of every PRICED preference. It is NEVER a
 *   veto: it may not refuse a candidate the pass has admitted, it may not be
 *   spent to protect a number the room already misses, and it does not change
 *   what gets in. It ORDERS the candidates that are already in.
 *
 * Why that rank and not another. The admission quantities are what the pass
 * EXISTS to buy (deep floor, for the recovery; a lifted face or a retired clump
 * declaration, for the tower swap) and a rule that outranked them would turn a
 * declaration into a veto over the pass's own purpose. The priced preferences
 * are the pass's internal economics — a filler's walk, an interior tile count —
 * and every one of them is cheaper to the room than a number it has to stand up
 * in front of a reader and defend. A declared quantity is the room's published
 * word. Between two candidates the pass is otherwise indifferent to, the one
 * that is kinder to the room's own declaration wins, and the room says so.
 *
 * THREE OBLIGATIONS SHIP WITH IT:
 *  (i)   the key set is DERIVED from `meta.shortfalls` on the PRE-TAKE board —
 *        the board the pass is judging — and PUBLISHED on the record beside the
 *        ranking (`declaredKeys` + `declaredSkipped` + `ranking`), so the
 *        validator re-derives it rather than trusting it. The two lists between
 *        them account for EVERY entry of `meta.shortfalls`, in declaration
 *        order, with the reason a skipped one is not a key.
 *  (ii)  a tie-break a declared quantity actually DECIDES says so in the room's
 *        note: `decidedBy` names the runner-up — the candidate the pass would
 *        have taken without this rule — and the margin on BOTH axes, the
 *        declared one it won and the priced one it paid.
 *  (iii) it applies to EVERY pass with a tie-break, not to the one the
 *        criticism was written about.
 *
 * WHICH QUANTITIES. A declaration declares a quantity when the shortfall it
 * files publishes a NUMBER that this pass's own instrument panel measures on a
 * finished board — otherwise the key could not be read on a candidate and the
 * "rule" would be a sentence. The map below is that intersection, and it is
 * exhaustive by construction: every shortfall the map does not name is
 * published in `declaredSkipped` with its gate, its kind and the reason, so a
 * reader (and the validator) sees the whole of `meta.shortfalls` accounted for
 * rather than the flattering half of it. The direction is the instrument's own
 * from INSTRUMENT_DIRECTION — the key sorts a candidate that is KINDER to the
 * declaration first, and since every one of these instruments is also a
 * non-worsening gate, "kinder" can only ever mean "at or better than the
 * un-taken board".
 */
const DECLARED_QUANTITIES = [
  // the as-built gated defender lap — the criticism's own room, and the
  // headline of the gallery's mobility column
  { gate: "mobility", kind: null, instrument: "lap", source: "metric.maxGated", read: (sf) => sf.metric?.maxGated },
  {
    gate: "mobility",
    kind: "covered-detour",
    instrument: "lap",
    source: "record.gatedLap",
    read: (sf) => sf.record?.gatedLap,
  },
  // "this room stands N of its sixty extensions shallower than the safe depth"
  { gate: "extensions", kind: "shallow", instrument: "shallowExts", source: "count", read: (sf) => sf.count },
  // the weak battery's furthest filler walk, and the tower clump the room has
  // to explain — both already named as declared quantities by TAKE_WALK_RULE
  {
    gate: "towers",
    kind: "weak-battery",
    instrument: "refill",
    source: "battery.maxRefill",
    read: (sf) => sf.battery?.maxRefill,
  },
  { gate: "towers", kind: "clump", instrument: "clump", source: "clump.within", read: (sf) => sf.clump?.within },
  // the structures this room's own road network does not reach
  {
    gate: "misc",
    kind: "off-network",
    instrument: "offNetwork",
    source: "tiles.length",
    read: (sf) => (Array.isArray(sf.tiles) ? sf.tiles.length : undefined),
  },
];
function declaredQuantityOf(sf) {
  if (!sf || !sf.gate) return null;
  for (const q of DECLARED_QUANTITIES) {
    if (q.gate !== sf.gate) continue;
    if ((q.kind ?? null) !== (sf.kind ?? null)) continue;
    const v = q.read(sf);
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return { instrument: q.instrument, declared: v, source: `${sf.gate}${sf.kind ? `/${sf.kind}` : ``}.${q.source}` };
  }
  return null;
}
/**
 * Obligation (i): the key set, derived from the pre-take board's own
 * declaration channel and published in declaration order. Two declarations of
 * the same instrument are ONE key — the first — because a key repeated is a key
 * that decides nothing the second time, and the duplicate is published as such.
 */
function declaredKeySet(plan) {
  const keys = [];
  const skipped = [];
  const held = new Set();
  const sfs = plan?.meta?.shortfalls || [];
  sfs.forEach((sf, at) => {
    const where = { at, gate: sf?.gate ?? null, kind: sf?.kind ?? null };
    const d = declaredQuantityOf(sf);
    if (!d) {
      skipped.push({
        ...where,
        why:
          `this declaration publishes no quantity this pass's instrument panel measures on a finished ` +
          `board, so there is nothing here a candidate could be ranked on`,
      });
      return;
    }
    if (held.has(d.instrument)) {
      skipped.push({
        ...where,
        instrument: d.instrument,
        declared: d.declared,
        why: `\`${d.instrument}\` is already a key from an earlier declaration in this list`,
      });
      return;
    }
    held.add(d.instrument);
    keys.push({
      ...where,
      instrument: d.instrument,
      declared: d.declared,
      direction: INSTRUMENT_DIRECTION[d.instrument],
      source: d.source,
    });
  });
  // ------------------------------------------------------------------
  // MF1 (round 22) — THE INPUT TO THE DERIVATION, PUBLISHED BESIDE ITS OUTPUT.
  //
  // `keys ++ skipped` is derived from `meta.shortfalls` on the PRE-TAKE board.
  // On the 15 rooms where a take MOVED the board, that board is gone: the
  // shipped `meta.shortfalls` is the AFTER declaration channel, so the exact set
  // comparison a validator wants to run — "is this key list really the whole of
  // that room's declarations, in that order?" — has nothing to compare against
  // and gets skipped (criticism 99). What was left checking the derivation there
  // was a totality test against the union's own length, which is a statement
  // about itself.
  //
  // The whole pre-take declaration channel is a big thing to copy onto every
  // record. The KEY SET's inputs are not: they are a gate/kind pair per
  // declaration, in order, plus the count. That is published here, so on a moved
  // board the set comparison runs against a witnessed list instead of being
  // skipped — an invented key at an index the room never declared, and a real
  // key dropped out of the union, both die against it.
  // ------------------------------------------------------------------
  const shortfalls = sfs.map((sf, at) => ({ at, gate: sf?.gate ?? null, kind: sf?.kind ?? null }));
  return { keys, skipped, shortfalls, count: shortfalls.length };
}
/**
 * MF1 — the same three fields on every record that publishes a key set.
 *
 * ML8 (round 25): `preTakeShortfallBasis` shipped BYTE-IDENTICAL on all 134 of
 * this fleet's records — a constant sentence copied onto a record and called a
 * witness. The rule half of it is genuinely constant and belongs there (it is
 * what the field MEANS, and a reader who finds one record should not have to go
 * looking for the definition), but a field that cannot differ between two rooms
 * cannot witness anything about either of them. So the room's own census is
 * derived into it: how many declarations the pre-take board carried, which
 * classes they were in declaration order, and how the derivation split them
 * into keys and skips. That is the same three numbers the fields beside it
 * publish, said in the sentence that claims they account for each other — so a
 * record whose key set does not cover its own shortfall list now contradicts
 * itself in prose as well as in arithmetic.
 */
function preTakeKeySetInputs(declared) {
  const classes = declared.shortfalls.map(
    (s) => `${s.at}:${s.gate ?? "?"}${s.kind ? `/${s.kind}` : ``}`,
  );
  return {
    preTakeShortfallCount: declared.count,
    preTakeShortfalls: declared.shortfalls,
    preTakeShortfallBasis:
      `ON THIS RECORD: the pre-take board carried ${declared.count} ` +
      `declaration(s)${classes.length ? ` — ${classes.join(", ")}` : ``}, of which this pass ranks on ` +
      `${declared.keys.length} as key(s)${
        declared.keys.length
          ? ` (${declared.keys.map((k) => `${k.gate}${k.kind ? `/${k.kind}` : ``}`).join(", ")})` : ``
      } and skips ${declared.skipped.length}${
        declared.skipped.length
          ? ` (${declared.skipped.map((s) => `${s.gate}${s.kind ? `/${s.kind}` : ``}`).join(", ")})` : ``
      }; ${declared.keys.length} + ${declared.skipped.length} = ${declared.keys.length + declared.skipped.length} ` +
      `against ${declared.count} entries. ` +
      PRE_TAKE_SHORTFALL_BASIS,
  };
}
const PRE_TAKE_SHORTFALL_BASIS =
  `MF1 (round 22) — \`preTakeShortfalls\` is the gate/kind of every entry of \`meta.shortfalls\` on the ` +
  `PRE-TAKE board this pass judged, in declaration order with its index, and \`preTakeShortfallCount\` ` +
  `is its length. \`declaredKeys\` and \`declaredSkipped\` are derived from exactly that list, so the ` +
  `two of them together must account for every entry of it, once each, at its own index — which is a ` +
  `set comparison against a WITNESSED list rather than against the union's own length. It is published ` +
  `because a take that moves the board destroys the channel the derivation was read from: the shipped ` +
  `\`meta.shortfalls\` is the AFTER declaration, and on the rooms where the two differ nothing else ` +
  `carries the BEFORE one. Where the board did not move the two are the same list and the shipped ` +
  `declarations check it directly; where a kind survives the move, a shipped shortfall kind absent from ` +
  `\`declaredKeys ∪ declaredSkipped\` is a hole in the derivation whatever this list says.`;
/** one line of a published `ranking`, in the same words for every pass */
function declaredKeyLabel(k) {
  return (
    `declared: ${k.instrument}, ${k.direction === "up" ? "more" : "less"} is better ` +
    `(${k.gate}${k.kind ? `/${k.kind}` : ``} declares ${k.source} = ${k.declared})`
  );
}
/** one declared key, read on two candidates' finished-board panels */
function declaredKeyCompare(key, a, b) {
  const av = a?.[key.instrument],
    bv = b?.[key.instrument];
  if (typeof av !== "number" || typeof bv !== "number") return 0;
  return key.direction === "up" ? bv - av : av - bv;
}
/** the whole key set, in declaration order */
function declaredKeysCompare(keys, a, b) {
  for (const k of keys) {
    const v = declaredKeyCompare(k, a, b);
    if (v) return v;
  }
  return 0;
}
/** laps are 2dp; a margin printed as -0.33000000000000007 is not a margin */
const margin2 = (v) => Math.round(v * 100) / 100;
const DECIDER_RULE =
  `OM5 (round 22) — \`decider\` names the key that SEPARATED THE WINNER FROM THE RUNNER-UP, derived by ` +
  `walking this record's own published \`ranking\` in order against the candidate the pass placed ` +
  `second and naming the first key on which the two differ. It is not \`decidedBy\`: that field answers ` +
  `"would the pick have been different WITHOUT the declared-quantity rule?" and is published only in ` +
  `the rooms where the answer is yes. This one answers "what actually discriminated here?", is ` +
  `published on every take, and is allowed to say the unflattering answers — "raster order", which ` +
  `means every ranked key tied, and "no tie-break ran", which means one candidate cleared the panel and ` +
  `nothing was ranked against anything. The note reciting a room's declared quantities beside a win ` +
  `they did not decide is the thing this closes.`;
const DECLARED_KEY_RULE =
  `THE DECLARED QUANTITY IS A KEY (round 21, the RULING on criticism 95). Where this room's plan ` +
  `DECLARES a quantity — an entry of \`meta.shortfalls\` on the board this pass is judging, publishing ` +
  `a number this pass's own instrument panel measures on a finished board — that quantity is a KEY in ` +
  `this tie-break, ranked immediately after the pass's ADMISSION quantities and ahead of every PRICED ` +
  `preference, in the order the room declares. It is NEVER a veto: it cannot refuse a candidate the ` +
  `panel admitted, it is never spent to protect a number the room already misses, and it changes ` +
  `nothing about what gets in — it orders what is already in. \`declaredKeys\` is that set, derived ` +
  `from the pre-take board; \`declaredSkipped\` accounts for every other entry of \`meta.shortfalls\` ` +
  `and why it is not a key, so the two lists together are the whole declaration channel and the ` +
  `derivation can be re-run against it; \`ranking\` is the full ordering this pass sorted on; and ` +
  `\`decidedBy\`, when the rule actually changed the pick, names the candidate this pass would have ` +
  `taken without it and the margin on both axes — the declared one the winner won and the priced one ` +
  `it paid. The rule was written because E11S7 spent 0.33 of a defender lap it has to publish to buy ` +
  `23 steps of a filler tour nothing outside the record reads.`;
/**
 * ---------------------------------------------------------------------------
 * O2 — THE TOTAL WALK IS PRICED, NOT FREE, AND IT IS NOT FREE AT ALL IN A ROOM
 * THAT DECLARES ON IT.
 * ---------------------------------------------------------------------------
 * `refillAtCap` and `refillOverNote` above catch a tower crossing a line the
 * room has to speak about. They do not catch a battery that simply gets slower
 * underneath both lines, and "slower underneath the line" is still the filler
 * walking further on every refill cycle for the life of the room.
 *
 * The rule, stated rather than tuned: a re-composition may cost the battery at
 * most ONE extra step, on at most ONE tower — the minimum perturbation a
 * one-tile move can make — and only in a room whose furthest walk is inside
 * REFILL_NOTE on both boards. A room that already declares its walk pays for
 * that declaration on every reader; it does not get to make the declared
 * quantity worse in exchange for a tie-break, so its slack is ZERO.
 *
 * Measured on the fleet's four round-16 takes: E4S3, E14S1 and E3S5 each cost
 * +1 total step with the max unmoved and no tower near either line, and clear.
 * E3S1 costs +4 with a tower crossing both lines, in the one room of the four
 * that declares — and is refused, which is the finding this rule exists for.
 */
const TAKE_WALK_SLACK_TOWERS = 1;
const TAKE_WALK_SLACK_STEPS = 1;
function refillPriceHolds(before, after) {
  const a = before.refillWalks,
    b = after.refillWalks;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
  const totalA = a.reduce((s, v) => s + v, 0);
  const totalB = b.reduce((s, v) => s + v, 0);
  if (totalB <= totalA) return null;
  const declares = before.refill > REFILL_NOTE || after.refill > REFILL_NOTE;
  if (declares) {
    return (
      `refillTotal ${totalA}->${totalB} in a room whose furthest filler walk is ` +
      `${Math.max(before.refill, after.refill)}, over the ${REFILL_NOTE}-step line this room DECLARES ` +
      `at — a declared quantity gets no slack (walks ${a.join("/")} -> ${b.join("/")})`
    );
  }
  let lengthened = 0;
  for (let i = 0; i < a.length; i++) if (b[i] > a[i]) lengthened++;
  if (lengthened > TAKE_WALK_SLACK_TOWERS) {
    return (
      `refillWalks ${a.join("/")} -> ${b.join("/")} lengthens ${lengthened} of the ${a.length} ` +
      `per-tower walks and the bounded price is ${TAKE_WALK_SLACK_TOWERS}`
    );
  }
  if (totalB - totalA > TAKE_WALK_SLACK_STEPS) {
    return (
      `refillTotal ${totalA}->${totalB} costs ${totalB - totalA} steps and the bounded price is ` +
      `${TAKE_WALK_SLACK_STEPS} (walks ${a.join("/")} -> ${b.join("/")})`
    );
  }
  return null;
}
function maybeTakeTowerSwap(d, plan) {
  if (!plan || plan.error || !plan.meta?.composeOpts || plan.meta.composeOpts.takeTowerSwap) {
    return plan;
  }
  const tw = plan.meta.towers;
  if (!tw) return plan;
  const ap = tw.adjacency?.satAcrossPrior;
  const offer = tw.towerSwapOffer;
  const candidates = [];
  // (1) the lift across the prior — only when the seat is genuinely FREE on the
  //     shipped board. The seven rooms whose seat carries a nuker or an
  //     extension are not refusing a trade, they never had one; see
  //     seatOccupancyOf in layer-walls.
  if (ap && ap.seat && ap.leaves && ap.forgoneToPrior > 0) {
    candidates.push({ why: "lift", from: ap.leaves, to: ap.seat });
  }
  // (2) the swap that retires a clump declaration
  if (
    offer &&
    offer.best &&
    offer.before?.[2] >= CLUMP_NOTE &&
    offer.best.after?.[2] < CLUMP_NOTE
  ) {
    candidates.push({ why: "clump", from: offer.best.from, to: offer.best.to });
  }
  if (!candidates.length) return plan;
  const before = asBuiltInstruments(d.terrain, plan);
  // obligation (iii) of the round-21 RULING — see DECLARED_KEY_RULE. This pass
  // has a tie-break too: it offers a lift and a clump retirement, and until now
  // it took the FIRST of them that cleared the panel, which is a preference
  // (the offer order) doing a tie-break's job with nothing published about it.
  // So every offer is composed and priced, the accepted ones are RANKED, and
  // the room's declared quantities are keys ahead of that offer order. On this
  // fleet the pass runs in 4 rooms and every one of them has exactly ONE
  // candidate, so no board moves on it — the rule is here because a rule that
  // only exists in the pass the criticism was written about is not a rule.
  const declared = declaredKeySet(plan);
  const tried = [];
  const accepted = [];
  candidates.forEach((c, order) => {
    const alt = composePlan(d, { ...plan.meta.composeOpts, takeTowerSwap: { from: c.from, to: c.to } });
    if (alt.error || !alt.shell || !grade(alt).complete) {
      tried.push({ ...c, verdict: "the re-composition did not produce a complete room" });
      return;
    }
    finalizeRoom(d.terrain, alt);
    const after = asBuiltInstruments(d.terrain, alt);
    const worse = instrumentsHold(before, after);
    if (worse.length) {
      tried.push({ ...c, before, after, verdict: `refused: ${worse.join(", ")}` });
      return;
    }
    const lifts = after.face > before.face;
    const retires = before.clump >= CLUMP_NOTE && after.clump < CLUMP_NOTE;
    if (!lifts && !retires) {
      tried.push({
        ...c,
        before,
        after,
        verdict:
          `refused: every instrument holds but nothing the room has to declare changes — the ` +
          `weakest face is unchanged at ${after.face} and the clump is ${after.clump} against a ` +
          `${CLUMP_NOTE} line`,
      });
      return;
    }
    const panel = { ...c, before, after, verdict: "ACCEPTED" };
    tried.push(panel);
    accepted.push({ c, order, alt, after, lifts, retires, panel });
  });
  if (accepted.length) {
    // ADMISSION HERE IS A PREDICATE, NOT A QUANTITY: a swap is in when no
    // instrument moves the wrong way and it either lifts the weakest face or
    // retires the clump declaration. There is no scalar gain to rank on ahead
    // of the declared keys, so they are the first keys, and the offer order —
    // lift before clump — is the priced preference behind them.
    accepted.sort((a, b) => declaredKeysCompare(declared.keys, a.after, b.after) || a.order - b.order);
    const win = accepted[0];
    const withoutRule = accepted.slice().sort((a, b) => a.order - b.order)[0];
    const rec = {
      taken: { from: win.c.from, to: win.c.to, why: win.c.why },
      lifts: win.lifts,
      retiresClumpDeclaration: win.retires,
      clumpNote: CLUMP_NOTE,
      before,
      after: win.after,
      offered: tried,
      instruments: Object.keys(INSTRUMENT_DIRECTION),
      directions: { ...INSTRUMENT_DIRECTION },
      declaredKeys: declared.keys,
      declaredSkipped: declared.skipped,
      ...preTakeKeySetInputs(declared),
      ranking: [
        `admission: every instrument holds AND (the weakest cut face rises OR the clump falls under ` +
          `${CLUMP_NOTE}) — a predicate, so this pass has no admission QUANTITY to rank on`,
        ...declared.keys.map((k) => declaredKeyLabel(k)),
        `priced: offer order, the lift across the prior before the clump retirement`,
      ],
      declaredKeyRule: DECLARED_KEY_RULE,
      accepted: accepted.length,
      walkRule: TAKE_WALK_RULE,
      basis:
        `the room was RE-COMPOSED with this swap taken (opts.takeTowerSwap, applied in layer 3 after ` +
        `every one of its searches has run) and finalized, and both instrument panels are read off ` +
        `finished boards: before is the plan this room would otherwise ship, after is the plan it ` +
        `does. A swap is kept only when no instrument moves the wrong way AND either the weakest ` +
        `cut-tile face rises or the clump falls below ${CLUMP_NOTE}, which is the line the clump ` +
        `declaration fires at. EVERY offer is composed and priced — round 21: this pass used to take ` +
        `the first offer that cleared the panel, so its offer order was deciding a tie-break with ` +
        `nothing published about it — and the accepted ones are ranked. ${DECLARED_KEY_RULE} ` +
        `${TAKE_WALK_RULE}`,
    };
    if (withoutRule !== win) {
      const key = declared.keys.find((k) => declaredKeyCompare(k, win.after, withoutRule.after) !== 0);
      rec.decidedBy = {
        instrument: key.instrument,
        gate: key.gate,
        kind: key.kind,
        source: key.source,
        declared: key.declared,
        direction: key.direction,
        taken: { from: win.c.from, to: win.c.to, why: win.c.why, value: win.after[key.instrument], order: win.order },
        runnerUp: {
          from: withoutRule.c.from,
          to: withoutRule.c.to,
          why: withoutRule.c.why,
          value: withoutRule.after[key.instrument],
          order: withoutRule.order,
        },
        margin: {
          declared: margin2(win.after[key.instrument] - withoutRule.after[key.instrument]),
          priced: withoutRule.order - win.order,
          pricedKey: "offer order",
        },
      };
    }
    // OM5 (round 22) — what separated first from second here. See DECIDER_RULE.
    // This pass has no admission QUANTITY (admission is a predicate), so the
    // ranked keys are the declared ones and then the offer order.
    {
      const second = accepted[1] || null;
      if (!second) {
        rec.decider = {
          key: "single-candidate",
          label:
            `no tie-break ran — exactly one offer cleared the panel, so nothing was ranked against ` +
            `anything`,
          candidates: 1,
          rank: null,
        };
      } else {
        const ranks = [
          ...declared.keys.map((k) => ({
            key: `declared:${k.instrument}`,
            label: `this room's DECLARED ${k.instrument} (${k.gate}${k.kind ? `/${k.kind}` : ``})`,
            cmp: (a, b) => declaredKeyCompare(k, a.after, b.after),
            read: (c) => c.after[k.instrument],
          })),
          {
            key: "offer-order",
            label: `the offer order — the lift across the prior before the clump retirement`,
            cmp: (a, b) => a.order - b.order,
            read: (c) => c.order,
          },
        ];
        const step = ranks.find((r) => r.cmp(win, second) !== 0) || ranks[ranks.length - 1];
        rec.decider = {
          key: step.key,
          label: step.label,
          candidates: accepted.length,
          rank: ranks.indexOf(step),
          runnerUp: { from: second.c.from, to: second.c.to, why: second.c.why },
          values: { taken: step.read(win), runnerUp: step.read(second) },
        };
      }
      rec.deciderRule = DECIDER_RULE;
    }
    for (const a of accepted) {
      a.panel.verdict =
        a === win
          ? "TAKEN"
          : `accepted, not taken: ${accepted.length} offer(s) cleared the panel and the pick is the ` +
            `room's declared quantities in declaration order, then the offer order`;
    }
    win.alt.meta.towers.acrossPriorTake = rec;
    // O6 (round 17): if this swap put two towers on neighbouring tiles, the
    // crossing record is where the adjacency contract says the evidence lives —
    // see recordTakeCrossing.
    recordTakeCrossing(win.alt, win.c, before, win.after);
    // the sealed-floor recovery ran BEFORE this pass and its record is written
    // by the pipeline, not by composePlan, so the re-composition does not carry
    // it. Its two panels describe the recovery's own decision point — the board
    // this take then re-priced on top of — which is what its basis says.
    if (plan.meta.sealedRecovery) win.alt.meta.sealedRecovery = plan.meta.sealedRecovery;
    return win.alt;
  }
  // nothing was kept — say so on the plan the room does ship, so a reader can
  // see the offer WAS priced on the shipped board rather than ignored
  plan.meta.towers.acrossPriorTake = {
    taken: null,
    before,
    offered: tried,
    instruments: Object.keys(INSTRUMENT_DIRECTION),
    directions: { ...INSTRUMENT_DIRECTION },
    declaredKeys: declared.keys,
    declaredSkipped: declared.skipped,
    ...preTakeKeySetInputs(declared),
    // ...published on the REFUSAL branch too, and in the same shape. The key
    // set is a property of the board this pass judged, not of the answer it
    // reached: a room that publishes it only when it ranked something is a room
    // whose derivation cannot be checked in the rooms where nothing was ranked.
    ranking: [
      `admission: every instrument holds AND (the weakest cut face rises OR the clump falls under ` +
        `${CLUMP_NOTE}) — a predicate, so this pass has no admission QUANTITY to rank on`,
      ...declared.keys.map((k) => declaredKeyLabel(k)),
      `priced: offer order, the lift across the prior before the clump retirement`,
    ],
    declaredKeyRule: DECLARED_KEY_RULE,
    clumpNote: CLUMP_NOTE,
    walkRule: TAKE_WALK_RULE,
    basis:
      `every offer above was re-composed and finalized, and the instrument panel of the finished ` +
      `board refused it — nothing reached the tie-break, so \`ranking\` and \`declaredKeys\` describe ` +
      `the order this pass would have used rather than one it ran. before is the plan this room ` +
      `ships. ${TAKE_WALK_RULE}`,
  };
  // ...and the refusal has to reach the record the forgone damage is summed out
  // of, or the reader of `satAcrossPrior` still sees a seat that is "free" and
  // an offer nobody priced. See restateSatBasis.
  restateSatBasis(plan);
  return plan;
}
const TAKE_WALK_RULE =
  `THE FILLER'S WALK IS READ PER TOWER, NOT AS A MAX (O2, round 17): refillWalks is the sorted ` +
  `per-tower walk vector, refillTotal its sum, refillAtCap the towers at the ${MAX_REFILL}-step hard ` +
  `cap and refillOverNote those over the ${REFILL_NOTE}-step line a weak-battery declaration fires ` +
  `at. The last two are non-worsening like every other instrument. The TOTAL is priced rather than ` +
  `free: a take may cost at most ${TAKE_WALK_SLACK_STEPS} extra step on at most ` +
  `${TAKE_WALK_SLACK_TOWERS} tower, and ZERO in a room whose furthest walk is already over ` +
  `${REFILL_NOTE} — a room that declares its battery does not get to make the declared quantity ` +
  `worse for a tie-break.`;

/**
 * O6 (round 17) — the take's readings, filed where adjacency says they live.
 *
 * `adjacency.crossings` carries the contract "every crossing of the D8 prior,
 * with the readings that proved it". The across-prior take can create an
 * adjacent tower pair — it did in E3S1 and E4S3 in round 16 — and it filed its
 * evidence in `acrossPriorTake` instead, leaving `crossings` empty in a room
 * publishing `priorHeld: false`. Both records are true and only one of them is
 * where a reader of the adjacency prior looks.
 *
 * The crossing is written from the same two panels the take was decided on, so
 * it is a LINK and not a second copy of the argument: `pass` names the pass,
 * `from`/`to` are the move, and the readings are the before/after of the
 * instruments this crossing had to prove. `refillFrom`/`refillTo` are
 * deliberately NOT written — those two fields mean "the refill-repair pass
 * SHORTENED the walk to buy this adjacency", which is not what this pass did
 * and not what it claims.
 */
function recordTakeCrossing(alt, c, before, after) {
  const adj = alt.meta?.towers?.adjacency;
  if (!adj || !Array.isArray(adj.crossings)) return;
  const towers = alt.structures?.tower || [];
  const to = { x: c.to.x, y: c.to.y };
  const neighbours = towers.filter(
    (t) => !(t.x === to.x && t.y === to.y) && Math.max(Math.abs(t.x - to.x), Math.abs(t.y - to.y)) <= 1,
  );
  if (!neighbours.length) return; // no pair created — nothing crossed
  adj.crossings.push({
    pass: "acrossPriorTake",
    from: { x: c.from.x, y: c.from.y },
    to,
    why: c.why,
    neighbours: neighbours.map((t) => ({ x: t.x, y: t.y })),
    // the readings this crossing proved, straight off the take's own panels
    faceFrom: before.face,
    faceTo: after.face,
    nukeWindowFrom: before.nukeWindow,
    nukeWindowTo: after.nukeWindow,
    towerWindowFrom: before.towerWindow,
    towerWindowTo: after.towerWindow,
    refillWalksFrom: before.refillWalks,
    refillWalksTo: after.refillWalks,
    refillTotalFrom: before.refillTotal,
    refillTotalTo: after.refillTotal,
    interiorFrom: before.interior,
    interiorTo: after.interior,
    basis:
      `this pair exists because the across-prior take moved a tower here. The readings are the take's ` +
      `own two as-built instrument panels (meta.towers.acrossPriorTake.before/after), not a second ` +
      `measurement — one decision, one set of numbers, filed in both records. refillFrom/refillTo are ` +
      `absent on purpose: those name the refill-repair pass's claim to have SHORTENED the walk, and ` +
      `this pass makes no such claim.`,
  });
  adj.priorHeld = false;
}

/**
 * O2 — the seat that comes back to `forgone` when the take refuses it.
 *
 * `satAcrossPrior.basis` is generated in finalizeRoom, before this pass runs.
 * When the take refuses an offer the room keeps its forgone damage AND now has
 * a priced reason for keeping it, so the sentence is re-rendered with the
 * verdict attached: "the prior costs this room N" becomes "…and taking it was
 * re-composed and priced at <the instrument that refused it>".
 */
function restateSatBasis(plan) {
  const ap = plan.meta?.towers?.adjacency?.satAcrossPrior;
  const take = plan.meta?.towers?.acrossPriorTake;
  if (!ap || !take || take.taken) return;
  const lift = (take.offered || []).find((o) => o.why === "lift");
  if (!lift) return;
  ap.takeOutcome = { taken: false, verdict: lift.verdict, from: lift.from, to: lift.to };
  ap.basis = renderSatBasis(ap);
}

/**
 * ===========================================================================
 * THE SEALED-FLOOR ONE-MOVE RECOVERY (O3, round 17).
 * ===========================================================================
 * `meta.sealedFloor` has for two rounds published `ourFault` — the whole-mass
 * counterfactual — and called it "the ceiling on what any re-ordering inside
 * the placement layers could recover". Nothing tried to reach it. Round 17's
 * owner review measured what ONE move got, on the fleet as it stood BEFORE this
 * pass existed: 220 of that fleet's 257 sealed tiles came back on a single
 * structure, 42 of its 62 sealing rooms were >= 90%
 * single-structure, and E15S6's 72-tile seal was 69 tiles behind any ONE of
 * three extensions while its 16-tile cut was not D8-adjacent to the pocket at
 * all. That survey is why the pass exists, and the pass has been recovering
 * floor ever since, so those figures describe a board this planner no longer
 * ships. (Round 20 past-tensed them; they had read as current. Criticism 80.)
 * That is criticism 2's shape — E16S5's whole 2.25 lap was ONE observer
 * tile — in the note channel, and a published ceiling nobody attempts is a
 * number printed in place of a decision.
 *
 * `noteSealedFloor` now prices the counterfactual per POCKET and per
 * STRUCTURE, exhaustively, by deleting each boundary structure and re-flooding.
 * This pass acts on it, and it is bounded in every direction:
 *
 *   · THE MOVABLE SEAT CLASSES, AND WHY THEY ARE MOVABLE. The extension mass
 *     is the flexible layer and the seal is its ordering — the note's own
 *     sentence is "a row of extensions across a one-wide corridor seals the
 *     pocket behind it". The OBSERVER joins it in round 18 (OF4): layer 5's own
 *     header calls the observer "the one structure in the game whose position is
 *     completely irrelevant — its own placement rule is literally 'takes the
 *     furthest leftover tile'", and E9S9 was publishing a fixed-geometry refusal
 *     over 7 deep tiles held by exactly that tile, with six free deep road-faced
 *     seats standing empty. Those two classes are the ones whose TILE is chosen
 *     by preference: layer 6 re-seats the whole extension mass on demand and
 *     layer 5 hands the observer whatever is left over. The hub kit, the lab
 *     diamond, a tower and the hauled nuker are placed by their own layers
 *     against real constraints (a 300k-energy haul, a diamond that must be a
 *     diamond) and "move it one tile" is not a bounded change to them, so this
 *     pass never withdraws one. It still NAMES them when they hold a pocket —
 *     see `record.fixedHolders` — because a reader of the refusal is owed the
 *     reason the pocket is not this pass's to open.
 *   · A THRESHOLD, STATED. The move has to bring back at least
 *     SEALED_RECOVERY_MIN tiles of DEEP floor — buildable ground the program
 *     could have used — because a one-tile pocket is not worth a re-composition
 *     and a pass that fires on everything is a pass with no rule.
 *   · THE THRESHOLD IS READ ON THE BOARD, NOT ON A POCKET (O1, round 19). Until
 *     this round the pass ADMITTED candidates with
 *     `pockets.filter(p => p.best.recoversDeep >= MIN)` and then worked on
 *     `ranked[0]` alone — a PREDICTION, per pocket, made by the counterfactual
 *     "delete this one structure and re-flood". The gain the pass then measures
 *     is `before.sealedDeep - after.sealedDeep`, which is BOARD-WIDE, and the
 *     two are not the same question: withdrawing a seat re-seats sixty
 *     extensions, so a withdrawal can open a pocket the withdrawn structure
 *     never touched. E7S2 and E7S5 each shipped a fully recoverable 4-deep seal
 *     under a refusal reading "the largest single-structure recovery here is 3
 *     deep tile(s)" — true of the counterfactual, false of the board: E7S2's
 *     ext@25,45 holds a 3-tile pocket and its withdrawal returns all 4 deep
 *     tiles of the room, the second pocket falling open with the re-seated mass.
 *     Fleet-wide, when round 19 checked, the holder sets of two pockets were
 *     disjoint in 59 of the 60 rooms that sealed anything on that board — so no
 *     arithmetic over the counterfactual can stand in for the measurement. The
 *     ratio is quoted as the reason for the rule, not as a live count; the
 *     rooms and pockets are in `meta.sealedFloor` every run. (Criticism 80.)
 *     So admission is now a bound that is TRUE OF THE BOARD and exact:
 *     gainedDeep can never exceed the deep floor the room seals in the first
 *     place, so a room whose whole sealed floor is under the threshold is
 *     refused without composing anything and SAYS SO IN THOSE TERMS; every other
 *     room composes every movable SEAT it ships and admits on the measured
 *     board-wide gain, and the winner rule is unchanged.
 *   · EVERY MOVABLE SEAT ON THE BOARD, NOT ONLY THE POCKET HOLDERS (OM1,
 *     round 20 — the last place the counterfactual was still steering this
 *     pass). Rounds 18 and 19 widened the candidate list from a raster prefix of
 *     one pocket's holders to every movable holder of every pocket, and round 19
 *     replaced the ADMISSION test with a bound that is true of the board — but
 *     candidate GENERATION was still reading `sealedFloor.pockets[].holders`,
 *     which is the per-structure counterfactual "delete this one structure and
 *     re-flood". That quantity is the wrong one for exactly the reason round 19
 *     already established about admission: a withdrawal RE-SEATS SIXTY
 *     EXTENSIONS, so the seat that best opens a pocket need not be standing
 *     beside it, and a seat that touches no pocket at all can still be the
 *     cheapest way to let the mass flow. The round-20 owner review composed
 *     every movable seat in each of the round-19 build's taken rooms and found 5
 *     with a NON-HOLDER seat shipping the SAME deep recovery and the SAME total
 *     recovery for a strictly cheaper filler tour on this pass's OWN published
 *     tie-break — E11S7 20,8 at -46 tour steps against the -23 it had shipped,
 *     plus E18S3, E9S1, E19S2 and E5S5, 68 steps of tour between them. Building
 *     it reproduced exactly that: those five boards moved, the other seven takes
 *     re-won with the seat they already had, and the fleet's sealed floor came
 *     back identical (same rooms, same tiles, same deep).
 *     So the candidate set is now every extension seat and the observer's seat in
 *     any room that clears the admission screen: composed, priced, published, and
 *     decided by the same comparison as before. It costs roughly sixty
 *     compositions per admitted room instead of roughly ten, which is the build
 *     time this pass is worth — and it is what makes "every candidate was
 *     re-composed and the panel refused it" a sentence about the ROOM rather
 *     than about the counterfactual's shortlist.
 *     The counterfactual is not thrown away: it still orders the trial (so the
 *     trial order is deterministic and the interesting seats are priced first),
 *     it still names the fixed-geometry holders a reader is owed, and every
 *     priced entry says whether the seat it withdrew was a holder at all.
 *     WHAT THIS COST, SAID OUT LOUD — AND THEN PAID BACK (round 21). Round 20's
 *     tie-break ranked the extension tour third and left the DEFENDER LAP a
 *     non-worsening gate rather than a key, so a cheaper-tour winner could ship
 *     a lap anywhere at or under the un-taken board's rather than the lowest one
 *     available. It did in E11S7: the widened winner bought 23 more steps of
 *     tour off the filler's walk and shipped a HIGHER gated lap (9.00) than the
 *     seat round 19 took (8.67), which moved the fleet's worst-lap headline and
 *     dropped E11S7's lane bound claim. That entry ended "making the lap a
 *     tie-break key is a change to the WINNER rule and belongs to whichever
 *     round argues for it". This is that round: criticism 95 was ruled, and the
 *     answer is not a special case for the lap but the general rule under
 *     DECLARED_KEY_RULE — every quantity a room DECLARES is a key in that room's
 *     tie-breaks, ranked after the admission quantities and ahead of every
 *     priced preference, never a veto. E11S7 takes 14,8 again, at 23 steps of
 *     tour instead of 46, and says in its note that it did and what it paid.
 *   · TO A FIXPOINT (OL5, round 20). A take re-composes the room, and the room
 *     it hands back has its own sealed floor. E8S2's did: it took 6 deep tiles
 *     back and still shipped a 4-deep residual seal, published under a SEALED
 *     INTERIOR FLOOR note calling it "the ceiling on what any re-ordering inside
 *     the placement layers could recover" — the exact published-ceiling-nobody-
 *     attempts shape this pass exists to answer, one level down, and invisible
 *     because the pass returns at its first line when `composeOpts` already
 *     carries a withdrawal. So the pass now REPEATS while the board it just took
 *     still seals the threshold, accumulating forbidden seats (which is why
 *     `forbidExtSeat` and `forbidObserverSeat` are LISTS), and each run files its
 *     own record on `record.next`. Owner's measurement of the second withdrawal
 *     in E8S2, before this was built, was that the best one returns 2 of the
 *     residual 4 — under the threshold — so the expected outcome is a refusal
 *     filed rather than a board changed. Which is the point: the room stops
 *     publishing a ceiling nobody attempted, and starts publishing the attempt.
 *   · ALL OF THEM, THEN THE BEST — not the first that passes. With every
 *     candidate priced anyway, taking the first acceptable one is taking a raster
 *     accident. The winner is the largest deep recovery, then the largest total
 *     recovery — the ADMISSION quantities — then THIS ROOM'S DECLARED QUANTITIES
 *     in declaration order (round 21; see DECLARED_KEY_RULE), then the CHEAPEST
 *     PANEL (least extension-tour cost, then most interior, then strongest
 *     face), then raster order. The order candidates are TRIED in cannot change
 *     the outcome, which is the point.
 *   · THE WHOLE PANEL. Same `asBuiltInstruments` the across-prior take uses,
 *     which since round 17 also carries sealedTiles/sealedDeep, the per-tower
 *     refill walks, the extension D4-face count and the off-network count. The
 *     move must not move ANY of them the wrong way, and it must actually
 *     deliver the deep floor it was taken for. Round 18 adds the EXTENSION TOUR
 *     (OF6) as a priced-not-gated reading — see `extTourSteps`.
 *   · REFUSAL WITH EVIDENCE. Every candidate that was tried publishes its two
 *     panels and the instrument that refused it; every pocket that was not
 *     tried publishes why.
 *
 * The move itself is a seat WITHDRAWN, not a structure teleported: the room is
 * re-composed with `opts.forbidExtSeat` (or `opts.forbidObserverSeat`) set, and
 * layer 6 places its sixty extensions — or layer 5 its observer — again with
 * that one tile off the board. That is why the answer is a real plan and not a
 * hand edit: the corridor stays open, the mass flows into the pocket, and every
 * downstream layer runs on the result.
 */
const SEALED_RECOVERY_MIN = 4;
/**
 * OF6 — how many extra steps of TOTAL extension tour a recovery may cost.
 *
 * The tower battery's slack is ONE step on ONE tower (TAKE_WALK_SLACK_STEPS)
 * over six towers. This walk runs over sixty structures and is re-derived from a
 * re-seated mass rather than from a moved tile, so a bound of the same shape is
 * a bound of a different size: 12 steps is one fifth of a step per extension,
 * and it is a CEILING on a number that is reported either way rather than a
 * budget anybody is entitled to spend. Measured against round 17's eight takes
 * (owner's harness, F6): worst +9, best -8, net -7 over the eight — every one of
 * them inside this bound, which is where the number comes from.
 */
const SEALED_RECOVERY_TOUR_SLACK = 12;
/** the seat classes this pass may withdraw, and the compose option each one sets */
const SEALED_RECOVERY_KINDS = {
  extension: "forbidExtSeat",
  // OF4 (round 18) — see the header. shared.mjs/layer-misc call the observer's
  // position irrelevant in their own prose; it has no walk to lengthen, no face
  // to lose and no haul to pay, so its seat is the cheapest one in the room to
  // withdraw.
  observer: "forbidObserverSeat",
};
/**
 * OL5 (round 20) — the ceiling on the fixpoint loop.
 *
 * Each run of the pass forbids one more seat, so the loop is strictly
 * decreasing in available seats and terminates on its own; this is the
 * belt-and-braces bound that keeps a pathological room from spending the whole
 * build inside one pass. On this fleet the loop runs twice in exactly one room
 * and once everywhere else, so nothing is anywhere near it — it exists so that
 * "runs to a fixpoint" is a bounded claim rather than an open one.
 */
const SEALED_RECOVERY_MAX_PASSES = 8;
/**
 * OL5 (round 20) — the pass, run to a fixpoint.
 *
 * `runSealedRecovery` is ONE run: it looks at the board it is given, composes
 * every movable seat, and either takes the best withdrawal or files a refusal.
 * This driver runs it again on whatever it hands back, for as long as the board
 * it just produced still seals `SEALED_RECOVERY_MIN` deep tiles — because a
 * take that recovers six deep tiles and leaves four behind is a room that still
 * publishes a recovery ceiling, and this pass exists to answer those rather
 * than to print them. Each run files its own record; the head record is the one
 * on `meta.sealedRecovery` (it is the one whose take the shipped `composeOpts`
 * is evidence of), and every later run hangs off `record.next`.
 */
function maybeTakeSealedRecovery(d, plan) {
  if (!plan || plan.error || !plan.meta?.composeOpts) return plan;
  let cur = plan;
  let head = null;
  let prev = null;
  for (let pass = 1; pass <= SEALED_RECOVERY_MAX_PASSES; pass++) {
    const run = runSealedRecovery(d, cur, pass);
    // a board that seals nothing has nothing for this pass to say. On the first
    // run that is the 114 rooms with no `meta.sealedFloor` at all and they file
    // no record; on a later run it is a take that closed the room's whole seal,
    // and the take's own `residual` says so.
    if (!run) break;
    if (prev) prev.next = run.record;
    else head = run.record;
    prev = run.record;
    cur = run.plan;
    if (run.record.outcome !== "taken") break;
    // THE STOP CONDITION, PUBLISHED ON THE RECORD THAT STOPS. The board this
    // take handed back is `run.plan`, and its own sealed floor is the thing
    // being tested — the same admission screen the next run would apply, asked
    // here so the record can say why there is or is not a `next`.
    const sfAfter = cur.meta?.sealedFloor;
    const residDeep = sfAfter ? sfAfter.deep : 0;
    const residTiles = sfAfter ? sfAfter.tiles : 0;
    const again = residDeep >= SEALED_RECOVERY_MIN && pass < SEALED_RECOVERY_MAX_PASSES;
    run.record.residual = {
      reran: again,
      why: again
        ? `this take's own re-composed board still seals ${residTiles} tile(s), ${residDeep} of them ` +
          `deep, at or over the threshold of ${SEALED_RECOVERY_MIN} — so the pass runs again on it with ` +
          `this withdrawal held (see \`next\`). A recovery that leaves behind a seal this pass would ` +
          `have admitted is a published ceiling nobody attempted, which is the thing this pass was ` +
          `written to stop printing`
        : `this take's own re-composed board seals ${residTiles} tile(s), ${residDeep} of them deep, ` +
          `under the threshold of ${SEALED_RECOVERY_MIN} — no further withdrawal in this room can give ` +
          `back the deep floor this pass requires (the gain is sealed deep before minus sealed deep ` +
          `after, and after is never negative), so the pass is at its fixpoint here`,
    };
    if (!again) break;
  }
  if (head) cur.meta.sealedRecovery = head;
  return cur;
}
function runSealedRecovery(d, plan, pass) {
  const opts = plan.meta.composeOpts;
  const sf = plan.meta.sealedFloor;
  if (!sf || !sf.pockets?.length) return null;
  // obligation (i) of the round-21 RULING — derived from THIS board, which is
  // the board every candidate below is judged against, and published on the
  // record whatever the outcome: a room that refuses without composing anything
  // still says what its tie-break would have ranked on, because the derivation
  // is a property of the board and not of the branch.
  const declared = declaredKeySet(plan);
  const record = {
    threshold: SEALED_RECOVERY_MIN,
    kindsAttempted: Object.keys(SEALED_RECOVERY_KINDS),
    tourSlack: SEALED_RECOVERY_TOUR_SLACK,
    declaredKeys: declared.keys,
    declaredSkipped: declared.skipped,
    ...preTakeKeySetInputs(declared),
    ranking: [
      `admission: gainedDeep, more is better`,
      `admission: gainedTiles, more is better`,
      ...declared.keys.map((k) => declaredKeyLabel(k)),
      `priced: extTourDelta, less is better`,
      `priced: interior, more is better`,
      `priced: face, more is better`,
      `raster order of the withdrawn seat`,
    ],
    declaredKeyRule: DECLARED_KEY_RULE,
    outcome: null,
    candidates: 0,
    tried: 0,
    taken: null,
    offered: [],
    instruments: Object.keys(INSTRUMENT_DIRECTION),
    directions: { ...INSTRUMENT_DIRECTION },
    walkRule: TAKE_WALK_RULE,
    tourRule: SEALED_RECOVERY_TOUR_RULE,
    basis: SEALED_RECOVERY_BASIS,
  };
  // THE WHOLE BOARD'S SEAL, POCKET BY POCKET. Every branch below reports the
  // same inventory, because the question this pass answers is a question about
  // the room and not about whichever pocket sorted first.
  const movableOf = (p) => (p.holders || []).filter((h) => SEALED_RECOVERY_KINDS[h.type]);
  record.pockets = sf.pockets.map((p) => ({
    at: p.at,
    tiles: p.tiles,
    deep: p.deep,
    holders: (p.holders || []).length,
    movable: movableOf(p).length,
  }));
  // THE ONLY REFUSAL THIS PASS MAY MAKE WITHOUT COMPOSING ANYTHING, AND IT IS
  // A BOUND RATHER THAN A PREDICTION. gainedDeep is measured as
  // before.sealedDeep - after.sealedDeep and after.sealedDeep >= 0, so no
  // withdrawal in this room can return more deep floor than the room seals.
  // (The two board figures are published on this branch only: a room that
  // refuses here ships the board they were read off, so they re-derive from
  // meta.sealedFloor. The branches below re-read the same two numbers as
  // `before.sealedTiles`/`before.sealedDeep` on the instrument panel and do not
  // publish a second copy of them.)
  if (sf.deep < SEALED_RECOVERY_MIN) {
    record.outcome = "belowThreshold";
    record.sealedTiles = sf.tiles;
    record.sealedDeep = sf.deep;
    // kept, and demoted: this WAS the admission rule (O1, round 19). It is the
    // best per-pocket counterfactual anywhere in the room, it is still worth
    // printing beside the bound that replaced it, and it decides nothing.
    record.bestDeepAnywhere = Math.max(0, ...sf.pockets.map((p) => (p.best ? p.best.recoversDeep : 0)));
    record.offered.push({
      verdict:
        `this room's ENTIRE sealed floor is ${record.sealedDeep} deep tile(s) across ` +
        `${record.pockets.length} pocket(s), so no withdrawal of any structure can return the ` +
        `${SEALED_RECOVERY_MIN} deep tiles this pass requires — the recovery is measured board-wide as ` +
        `sealed deep BEFORE minus sealed deep AFTER, and that difference cannot exceed the sealed deep ` +
        `floor the room has. It is a ceiling on the board rather than a claim about any one pocket ` +
        `(round 19: the admission test used to be the largest SINGLE-POCKET counterfactual, which is ` +
        `false of a withdrawal that opens two pockets at once — the largest one here is ` +
        `${record.bestDeepAnywhere} deep tile(s) and that number no longer decides anything)`,
    });
    return { plan, record };
  }
  // ---------------------------------------------------------------------
  // THE COUNTERFACTUAL, KEPT FOR WHAT IT IS ACTUALLY GOOD FOR (OM1, round 20).
  // ---------------------------------------------------------------------
  // Every movable holder of every pocket, deduped by tile — one structure can
  // hold two pockets (E16S8) and it is one entry, with the counterfactual gains
  // of both pockets summed. This USED to be the candidate list. It is not any
  // more; it is now an annotation on the candidate list and the thing that
  // orders the trial, because "delete this one structure and re-flood" answers a
  // question about a structure and this pass asks a question about a board.
  const byTile = new Map();
  for (const p of sf.pockets) {
    for (const h of p.holders || []) {
      const k = `${h.x},${h.y}`;
      let e = byTile.get(k);
      if (!e) byTile.set(k, (e = { type: h.type, x: h.x, y: h.y, recovers: 0, recoversDeep: 0, pockets: [] }));
      e.recovers += h.recovers;
      e.recoversDeep += h.recoversDeep;
      e.pockets.push({ x: p.at.x, y: p.at.y });
    }
  }
  const holders = [...byTile.values()];
  // ---------------------------------------------------------------------
  // THE CANDIDATES: EVERY MOVABLE SEAT THIS ROOM SHIPS (OM1, round 20).
  // ---------------------------------------------------------------------
  // Read off the BOARD — `plan.structures.extension` and `plan.structures
  // .observer` — and not off the pocket census. A withdrawal re-seats sixty
  // extensions, so the seat that best opens a pocket need not be standing beside
  // one: the round-20 owner review measured this over the ROUND-19 ARTIFACT, and
  // in 5 of the 12 rooms that artifact took a move in, the cheapest winner on
  // this pass's own tie-break was a NON-HOLDER — a seat the pass could not see
  // because the pass could not propose it. That is the measurement the change
  // was made on, taken on that board at that moment; it is not a running count
  // of the fleet, which composes differently now the change is in. (Criticism
  // 80: this shipped as a present-tense claim about "this fleet" and is
  // attributed instead.) Each seat carries its counterfactual if it has
  // one (`holder`, `recovers`, `recoversDeep`, `pockets`) and zeroes if it does
  // not, so a reader of any priced entry can tell which kind of seat it was.
  const seats = [];
  for (const type of Object.keys(SEALED_RECOVERY_KINDS)) {
    for (const s of plan.structures?.[type] || []) {
      const h = byTile.get(`${s.x},${s.y}`);
      seats.push({
        type,
        x: s.x,
        y: s.y,
        holder: !!h,
        recovers: h ? h.recovers : 0,
        recoversDeep: h ? h.recoversDeep : 0,
        pockets: h ? h.pockets : [],
      });
    }
  }
  // Ordered by the counterfactual purely so the trial order is deterministic and
  // the seats with something to say are priced first: the winner is chosen by a
  // comparison over ALL of them, so this order cannot change the outcome.
  const movable = seats.sort(
    (a, b) =>
      b.recoversDeep - a.recoversDeep ||
      b.recovers - a.recovers ||
      // the observer's seat before an extension's at equal gain: it is the one
      // this planner's own prose calls irrelevant, so it is the cheaper thing
      // to move. Ties past that are raster, so the order is total.
      (a.type === b.type ? 0 : a.type === "observer" ? -1 : 1) ||
      a.y - b.y ||
      a.x - b.x,
  );
  record.candidates = movable.length;
  // the census of the widened set, by class, so "every movable seat" is a claim
  // with a shape a reader can check against the board's own structure lists.
  record.seats = Object.keys(SEALED_RECOVERY_KINDS).reduce((o, t) => {
    o[t] = (plan.structures?.[t] || []).length;
    return o;
  }, {});
  // ...and the old candidate count, demoted to what it always was: how many of
  // those seats the per-structure counterfactual points at. Round 18/19 called
  // this number `candidates`; it is kept under an honest name because the
  // refusals and the pocket census still quote it.
  record.movableHolders = movable.filter((h) => h.holder).length;
  record.fixedHolders = holders
    .filter((h) => !SEALED_RECOVERY_KINDS[h.type])
    .map((h) => ({ type: h.type, x: h.x, y: h.y, recovers: h.recovers, recoversDeep: h.recoversDeep }));
  if (!movable.length) {
    // A room with no extension and no observer on its board at all. It cannot
    // happen in a complete RCL8 plan and it is kept as a real branch rather than
    // an assertion, because the alternative is a pass that silently reports
    // "every candidate refused" over an empty candidate list. (Until round 20
    // this outcome fired when every HOLDER was fixed geometry, which is no
    // longer a reason to refuse: the pass composes seats that hold nothing.)
    record.outcome = "fixedGeometry";
    record.offered.push({
      verdict:
        `this room ships no ${record.kindsAttempted.join(" and no ")} seat, and those are the only two ` +
        `structures this pass may withdraw — they are the two whose tile is chosen by preference rather ` +
        `than by a constraint, where a hub structure, a lab of the diamond, a tower or the hauled nuker ` +
        `is placed against its own layer's real rule. This room's ${record.pockets.length} pocket(s) are ` +
        `held by ${holders.length} structure(s) and there is nothing here for this pass to re-seat`,
    });
    return { plan, record };
  }
  const before = asBuiltInstruments(d.terrain, plan);
  const tourBefore = extTourSteps(d.terrain, plan);
  record.extTourBefore = tourBefore ? tourBefore.total : null;
  const accepted = [];
  for (const h of movable) {
    const withdrawn = { x: h.x, y: h.y };
    const kind = h.type;
    record.tried++;
    // the forbidden seats ACCUMULATE (OL5, round 20): `opts` already carries
    // whatever earlier runs of this pass withdrew, and this run adds one to the
    // list rather than replacing it. That is why the option is a list — a second
    // run that overwrote the first would be composing a board nobody shipped.
    const optName = SEALED_RECOVERY_KINDS[kind];
    const alt = composePlan(d, { ...opts, [optName]: [...(opts[optName] || []), withdrawn] });
    if (alt.error || !alt.shell || !grade(alt).complete) {
      record.offered.push({
        withdrawn,
        kind,
        holder: h.holder,
        recoversDeep: h.recoversDeep,
        verdict: "the re-composition did not produce a complete room",
      });
      continue;
    }
    finalizeRoom(d.terrain, alt);
    const after = asBuiltInstruments(d.terrain, alt);
    const tourAfter = extTourSteps(d.terrain, alt);
    const extTourAfter = tourAfter ? tourAfter.total : null;
    const extTourDelta =
      record.extTourBefore === null || extTourAfter === null ? null : extTourAfter - record.extTourBefore;
    const panel = {
      withdrawn,
      kind,
      // OM1 (round 20) — whether this seat stood beside a pocket at all. It is
      // no longer the reason the seat was composed, so a reader of a priced
      // entry is told which kind of seat it is looking at rather than left to
      // infer it from a `recoversDeep` of 0.
      holder: h.holder,
      recoversDeep: h.recoversDeep,
      before,
      after,
      extTourAfter,
      extTourDelta,
      // MF2 (round 22) — the witness that makes the two lines above
      // re-derivable: what this candidate's board differs from the shipped one
      // by, on every input extTourSteps reads. See tourWitness.
      moved: tourWitness(plan, alt),
    };
    const worse = instrumentsHold(before, after);
    if (worse.length) {
      record.offered.push({ ...panel, verdict: `refused: ${worse.join(", ")}` });
      continue;
    }
    const gainedDeep = before.sealedDeep - after.sealedDeep;
    if (gainedDeep < SEALED_RECOVERY_MIN) {
      record.offered.push({
        ...panel,
        gainedDeep,
        verdict:
          `refused: every instrument holds but the re-composed room only recovers ${gainedDeep} deep ` +
          `sealed tile(s) against a threshold of ${SEALED_RECOVERY_MIN} — ` +
          (h.holder
            ? `the counterfactual said ${h.recoversDeep} would come back if this structure simply ` +
              `vanished, and layer 6 re-seats the sixty extensions when it is withdrawn, which is a ` +
              `different question`
            : `this seat holds no pocket of this room shut, and it is composed anyway because a ` +
              `withdrawal re-seats the sixty extensions and can open a pocket the withdrawn structure ` +
              `never touched — which is the whole reason the candidate list is every movable seat and ` +
              `not the counterfactual's shortlist (OM1, round 20). Here it opened too little`),
      });
      continue;
    }
    // OF6 — the walk the panel could not see, priced with a stated bound.
    if (extTourDelta !== null && extTourDelta > SEALED_RECOVERY_TOUR_SLACK) {
      record.offered.push({
        ...panel,
        gainedDeep,
        verdict:
          `refused: every instrument holds and the room gives back ${gainedDeep} deep tile(s), but the ` +
          `filler's TOTAL extension tour goes ${record.extTourBefore} -> ${extTourAfter} steps, ` +
          `+${extTourDelta} against a stated ceiling of ${SEALED_RECOVERY_TOUR_SLACK} — deep floor is ` +
          `worth paying for and is not worth paying that`,
      });
      continue;
    }
    record.offered.push({
      ...panel,
      gainedDeep,
      gainedTiles: before.sealedTiles - after.sealedTiles,
      verdict: "ACCEPTED",
    });
    accepted.push({
      h,
      kind,
      withdrawn,
      alt,
      after,
      gainedDeep,
      gainedTiles: before.sealedTiles - after.sealedTiles,
      extTourAfter,
      extTourDelta,
    });
  }
  if (!accepted.length) {
    record.outcome = "allRefused";
    record.offered.push({
      verdict:
        `all ${record.tried} candidate(s) — every movable seat this room ships (` +
        `${Object.entries(record.seats)
          .map(([t, n]) => `${n} ${t} seat(s)`)
          .join(", ")}), not a prefix of them, not one pocket's holders, and not only the ` +
        `${record.movableHolders} of them the per-structure counterfactual points at — were re-composed ` +
        `and finalized and the panel refused each one, each on the BOARD-WIDE deep recovery its finished ` +
        `room actually delivers; this room ships the plan it would have shipped without this pass`,
    });
    return { plan, record };
  }
  // the winner: most deep floor back, then most floor — the two ADMISSION
  // quantities, what this pass exists to buy — then THIS ROOM'S DECLARED
  // QUANTITIES in declaration order (round 21, the RULING on criticism 95: see
  // DECLARED_KEY_RULE), then the cheapest panel, then raster. See the header —
  // every candidate was priced, so the pick is a comparison and not an accident
  // of iteration order.
  const admissionCmp = (a, b) => b.gainedDeep - a.gainedDeep || b.gainedTiles - a.gainedTiles;
  const pricedCmp = (a, b) =>
    (a.extTourDelta ?? 0) - (b.extTourDelta ?? 0) ||
    (b.after.interior ?? 0) - (a.after.interior ?? 0) ||
    (b.after.face ?? 0) - (a.after.face ?? 0) ||
    a.withdrawn.y - b.withdrawn.y ||
    a.withdrawn.x - b.withdrawn.x;
  accepted.sort(
    (a, b) => admissionCmp(a, b) || declaredKeysCompare(declared.keys, a.after, b.after) || pricedCmp(a, b),
  );
  const win = accepted[0];
  // obligation (ii): the candidate this pass WOULD have taken without the rule.
  // It ties the winner on both admission quantities by construction — a
  // candidate that beat the winner on those would have won under both orders —
  // so the only thing between them is a declared quantity against a price, and
  // that is exactly the sentence the room owes its reader.
  const withoutRule = accepted.slice().sort((a, b) => admissionCmp(a, b) || pricedCmp(a, b))[0];
  record.outcome = "taken";
  record.accepted = accepted.length;
  // WHICH POCKETS ACTUALLY OPENED, MEASURED ON THE TWO BOARDS (O1, round 19).
  // The record used to name ONE pocket — the one the admission filter had
  // ranked first — and the note then read "gives back 4 sealed tiles ... out of
  // the pocket at 22,46 (3 tile(s), 3 deep)", which is four tiles out of a
  // three-tile pocket. A withdrawal re-seats sixty extensions and opens
  // whatever it opens, so the answer is read off the after board: every pocket
  // of the BEFORE seal whose own named tiles are no longer sealed after.
  // `sealedNew` is the other half of the same arithmetic — floor the
  // re-composition sealed that was not sealed before — printed whether or not
  // it is zero, because a residue bucket you only hear about when it is empty
  // is not a check. The identity the note quotes:
  //   recoveredTiles(board) = sum(pockets[].recoveredTiles) - sealedNew
  const afterSealedKeys = new Set();
  for (const p of win.alt.meta?.sealedFloor?.pockets || []) {
    for (const t of p.named || []) afterSealedKeys.add(`${t.x},${t.y}`);
  }
  const beforeSealedKeys = new Set();
  for (const p of sf.pockets) for (const t of p.named || []) beforeSealedKeys.add(`${t.x},${t.y}`);
  record.taken = {
    withdrawn: win.withdrawn,
    kind: win.kind,
    pockets: sf.pockets
      .map((p) => ({
        at: p.at,
        tiles: p.tiles,
        deep: p.deep,
        recoveredTiles: (p.named || []).filter((t) => !afterSealedKeys.has(`${t.x},${t.y}`)).length,
      }))
      .filter((p) => p.recoveredTiles > 0),
  };
  record.sealedNew = [...afterSealedKeys].filter((k) => !beforeSealedKeys.has(k)).length;
  record.recoveredTiles = win.gainedTiles;
  record.recoveredDeep = win.gainedDeep;
  record.extTourAfter = win.extTourAfter;
  record.extTourDelta = win.extTourDelta;
  record.before = before;
  record.after = win.after;
  // obligation (ii) — published only when the rule actually CHANGED the pick,
  // because "a declared quantity decided this" is a claim and a claim printed
  // on every take is a claim about nothing.
  if (withoutRule !== win) {
    const key = declared.keys.find((k) => declaredKeyCompare(k, win.after, withoutRule.after) !== 0);
    record.decidedBy = {
      instrument: key.instrument,
      gate: key.gate,
      kind: key.kind,
      source: key.source,
      declared: key.declared,
      direction: key.direction,
      taken: {
        withdrawn: win.withdrawn,
        kind: win.kind,
        value: win.after[key.instrument],
        extTourDelta: win.extTourDelta,
      },
      runnerUp: {
        withdrawn: withoutRule.withdrawn,
        kind: withoutRule.kind,
        value: withoutRule.after[key.instrument],
        extTourDelta: withoutRule.extTourDelta,
      },
      // BOTH AXES. `declared` is what the winner won by on the room's own
      // published number (negative when less is better means the winner is
      // ahead); `priced` is what it cost on the key the pass would otherwise
      // have decided on, positive when the winner is the more expensive one.
      margin: {
        declared: margin2(win.after[key.instrument] - withoutRule.after[key.instrument]),
        priced: margin2((win.extTourDelta ?? 0) - (withoutRule.extTourDelta ?? 0)),
        pricedKey: "extTourDelta",
      },
      tiedOn: { gainedDeep: win.gainedDeep, gainedTiles: win.gainedTiles },
    };
  }
  // ------------------------------------------------------------------
  // OM5 (round 22) — WHAT DECIDED, NAMED, ON EVERY TAKE.
  //
  // `decidedBy` fires only when a DECLARED quantity changed the pick, which on
  // this fleet is one room out of twelve. In the other eleven the note recited
  // the room's declared quantities inside the sentence that explains the win —
  // true, and read by a reader as the reason — while the key that actually
  // discriminated was named nowhere. Three of those takes had no tie-break at
  // all: one candidate cleared the panel and nothing was ranked against
  // anything, which is a different fact from "it won on the declared keys" and a
  // strictly more honest one.
  //
  // So the deciding key is DERIVED, from the published `ranking` itself: walk
  // the sort order against the runner-up in the FINAL order (the candidate this
  // pass actually placed second) and name the first key on which the two differ.
  // A single-candidate take says so. `decidedBy` is unaffected — it answers a
  // different question ("would the pick have been different without the rule?")
  // and this one answers "what separated first from second?".
  // ------------------------------------------------------------------
  const deciderRanks = [
    { key: "gainedDeep", label: `the deep floor recovered`, cmp: (a, b) => b.gainedDeep - a.gainedDeep, read: (c) => c.gainedDeep },
    { key: "gainedTiles", label: `the total floor recovered`, cmp: (a, b) => b.gainedTiles - a.gainedTiles, read: (c) => c.gainedTiles },
    ...declared.keys.map((k) => ({
      key: `declared:${k.instrument}`,
      label: `this room's DECLARED ${k.instrument} (${k.gate}${k.kind ? `/${k.kind}` : ``})`,
      cmp: (a, b) => declaredKeyCompare(k, a.after, b.after),
      read: (c) => c.after[k.instrument],
    })),
    {
      key: "extTourDelta",
      label: `the filler's total extension tour`,
      cmp: (a, b) => (a.extTourDelta ?? 0) - (b.extTourDelta ?? 0),
      read: (c) => c.extTourDelta,
    },
    { key: "interior", label: `the interior tile count`, cmp: (a, b) => (b.after.interior ?? 0) - (a.after.interior ?? 0), read: (c) => c.after.interior },
    { key: "face", label: `the weakest cut face`, cmp: (a, b) => (b.after.face ?? 0) - (a.after.face ?? 0), read: (c) => c.after.face },
    {
      key: "raster",
      label: `raster order of the withdrawn seat — every ranked key above is tied`,
      cmp: (a, b) => a.withdrawn.y - b.withdrawn.y || a.withdrawn.x - b.withdrawn.x,
      read: (c) => `${c.withdrawn.x},${c.withdrawn.y}`,
    },
  ];
  const second = accepted[1] || null;
  if (!second) {
    record.decider = {
      key: "single-candidate",
      label: `no tie-break ran — exactly one candidate cleared the panel, so nothing was ranked against anything`,
      candidates: 1,
      rank: null,
    };
  } else {
    const step = deciderRanks.find((r) => r.cmp(win, second) !== 0) || deciderRanks[deciderRanks.length - 1];
    record.decider = {
      key: step.key,
      label: step.label,
      candidates: accepted.length,
      rank: deciderRanks.indexOf(step),
      runnerUp: { withdrawn: second.withdrawn, kind: second.kind },
      values: { taken: step.read(win), runnerUp: step.read(second) },
    };
  }
  record.deciderRule = DECIDER_RULE;
  for (const o of record.offered) {
    if (o.verdict !== "ACCEPTED") continue;
    o.verdict =
      o.withdrawn.x === win.withdrawn.x && o.withdrawn.y === win.withdrawn.y
        ? "TAKEN"
        : `accepted, not taken: ${accepted.length} candidate(s) cleared the panel and the pick is the ` +
          `largest deep recovery, then the largest total recovery, then ` +
          (declared.keys.length
            ? `this room's DECLARED quantities in declaration order (${declared.keys
                .map((k) => k.instrument)
                .join(", ")}), then `
            : `— this room declares no quantity this panel measures, so no declared key applies — then `) +
          `the cheapest panel (least extension tour, then most interior, then strongest face), then ` +
          `raster order`;
  }
  return { plan: win.alt, record };
}
const SEALED_RECOVERY_BASIS =
  `the candidates are EVERY MOVABLE SEAT THE ROOM SHIPS — read off the board's own structure lists, ` +
  `every extension seat and the observer's — and the move is a SEAT WITHDRAWN, not a structure ` +
  `teleported: the room is RE-COMPOSED from layer 1 with that tile added to opts.forbidExtSeat (the ` +
  `extension seats) or opts.forbidObserverSeat (the observer's), so layer 6 places its sixty ` +
  `extensions, or layer 5 its observer, again with that tile off the board and every later layer runs ` +
  `on the result. "candidates" of them, "tried" re-compositions, and the two are equal because there ` +
  `is no prefix and no shortlist (OF1, round 18: a cap of 3 in raster order made E11S7 publish "every ` +
  `candidate was refused" while five untried holders sat behind it, two of which recover the whole ` +
  `pocket; O1, round 19: admission by the best SINGLE-POCKET counterfactual made E7S2 and E7S5 publish ` +
  `"the largest single-structure recovery here is 3 deep tile(s)" over a seal that comes back WHOLE; ` +
  `OM1, round 20: candidate GENERATION was still the pocket holders — the per-structure counterfactual ` +
  `"delete this one structure and re-flood" — which is a claim about a structure where this pass asks ` +
  `a question about a board, and in 5 of this fleet's taken rooms a seat standing beside no pocket at ` +
  `all shipped the same recovery for a strictly cheaper filler tour). The counterfactual survives as ` +
  `an ANNOTATION: every priced entry says whether the seat it withdrew was a holder, movableHolders ` +
  `counts how many of the candidates it points at, fixedHolders names the holders this pass may not ` +
  `withdraw, and it orders the trial so the run is deterministic — the winner is a comparison over ` +
  `every candidate, so that order cannot change the outcome. ` +
  `THE PASS RUNS TO A FIXPOINT (OL5, round 20): a take hands back a board with its own sealed floor, ` +
  `and if that floor still holds ${SEALED_RECOVERY_MIN} deep tiles the pass runs again on it with the ` +
  `withdrawal held, each run filing its own record on \`next\` and each take publishing under ` +
  `\`residual\` what its own result still seals and whether that was enough to re-run. A recovery that ` +
  `leaves a seal this pass would have admitted is a published ceiling nobody attempted. ` +
  `ADMISSION IS MEASURED ON THE BOARD, NOT PREDICTED ON A POCKET: a room is refused without composing ` +
  `anything only when its ENTIRE sealed floor holds fewer than ${SEALED_RECOVERY_MIN} deep tiles, ` +
  `which is a true ceiling on the gain (gained = sealed deep before - sealed deep after, and after is ` +
  `never negative) rather than a claim about any one pocket. before/after are the same as-built ` +
  `instrument panel the across-prior take uses, read off two FINISHED rooms. A withdrawal is ACCEPTED ` +
  `only when no instrument moves the wrong way, the finished room actually gives back at least ` +
  `${SEALED_RECOVERY_MIN} deep sealed tiles BOARD-WIDE, and the extension tour stays inside its stated ` +
  `ceiling — the counterfactual is a claim about deleting a structure, and this is the claim about ` +
  `re-composing without its seat, which is a strictly harder test and the only one that ships. ` +
  `taken.pockets is read off the two boards afterwards: every pocket of the before seal whose own ` +
  `named tiles are no longer sealed, with sealedNew counting any floor the re-composition sealed that ` +
  `was not sealed before, so the recovery adds up tile by tile. Among the accepted, ` +
  `the one TAKEN is the largest deep recovery, then the largest total recovery — the two ADMISSION ` +
  `quantities, what this pass exists to buy — then THIS ROOM'S DECLARED QUANTITIES in declaration ` +
  `order, then the cheapest panel (least extension tour, most interior, strongest face), then raster ` +
  `order: a comparison over every priced candidate rather than whichever one iteration reached first. ` +
  `The declared keys are derived from meta.shortfalls on the board this run judged and published on ` +
  `this record as \`declaredKeys\` (with \`declaredSkipped\` accounting for every other declaration ` +
  `and \`ranking\` printing the whole order) — round 21, the RULING on criticism 95, stated in full ` +
  `under \`declaredKeyRule\`: a quantity the room has to publish outranks every price this pass pays ` +
  `in private, and is never a veto over what gets in.`;
const SEALED_RECOVERY_TOUR_RULE =
  `THE FILLER'S OTHER WALK, PRICED AND NOT GATED (OF6, round 18): extTourBefore/extTourAfter are the ` +
  `TOTAL extension tour — for each of the sixty extensions, the walk from the sitter across the ` +
  `finished interior to the tile the filler stands on to fill it (one step off its nearest walkable D4 ` +
  `face), summed. It is layer 6's own build-order model, read on two finished boards. It is NOT a ` +
  `non-worsening instrument: a recovery that hands the program back deep buildable floor forever is ` +
  `worth a step of tour, and refusing it for one step would be pricing the wrong thing. It is bounded ` +
  `instead — at most ${SEALED_RECOVERY_TOUR_SLACK} extra steps of TOTAL tour across sixty structures, ` +
  `stated here and quoted in the note — and the delta is published whether it is positive or negative, ` +
  `so a reader sees what the room paid rather than being told it paid nothing.`;

export function planRoom(d) {
  const t0 = performance.now();
  let best = null;
  let lastError = null;
  let ecoCap = null; // set from the skip-0 hub, if it produced one at all
  // every composition this room paid for, in order — the evidence a mobility
  // declaration has to carry (see attachRungProof)
  const trail = [];
  // one shell-negotiation memo per SEED. Every rung of the escalation ladder
  // re-asks layer 2 for the same candidates off the same layer-1 plan (see the
  // note on opts.shellCache); the memo is what stops the ladder from paying for
  // the same min-cut four times. Keyed by seed because a different seed is a
  // different hub, protect mask and basin.
  const shellCaches = new Map();
  const cacheFor = (seedSkip) => {
    let c = shellCaches.get(seedSkip);
    if (!c) shellCaches.set(seedSkip, (c = new Map()));
    return c;
  };
  const done = (p0) => {
    let p = maybeReleaseParks(d, p0);
    if (p && p.meta) {
      // THE TRUTH PASS, on the composition this room ships and no other. It
      // files the mobility declaration attachRungProof then staples the ladder
      // to, so it has to come first.
      finalizeRoom(d.terrain, p);
      // ...and the two passes that are allowed to REPLACE the composition after
      // the truth pass, because their whole argument is that they need the
      // finished board to price their trade. Each finalizes whatever it returns.
      //
      // ORDER MATTERS AND IT IS NOT ARBITRARY. The sealed-floor recovery
      // withdraws an extension or OBSERVER seat and re-composes from layer 1;
      // the across-prior take moves a TOWER and re-composes from layer 1.
      // Running the recovery first means the take's two instrument panels are
      // read on top of whatever the recovery decided, and the take's
      // re-composition inherits `forbidExtSeat`/`forbidObserverSeat` through
      // composeOpts — so the room the take prices is the room the recovery
      // left. The other order would leave the take's panels describing a board
      // the recovery then replaced.
      p = maybeTakeSealedRecovery(d, p);
      p = maybeTakeTowerSwap(d, p);
      // OF3 (round 18) — and NOW the recovery gets to speak, on the plan the
      // room actually ships. It has to be here rather than inside the pass: the
      // pass may hand back a fresh composition, and the tower take after it may
      // hand back another one, each with its own freshly-built notes array. A
      // note pushed inside either of them would be dropped by the next
      // re-composition while its record survived (`sealedRecovery` is copied
      // across explicitly), which is exactly the record/prose drift the note
      // inventory exists to make impossible.
      if (p.meta.sealedRecovery) {
        // ...and the OBLIGATION that makes the note undeletable, in the same
        // call. Every other class derives its entry in `finalizeRoom`
        // (layer-walls, "WHO OWES A NOTE"), and this one cannot: the record it
        // is derived from does not exist until this pass has run, and this pass
        // runs AFTER the truth pass by design, because its whole argument is
        // that it needs a finished board to price its trade. So the entry is
        // appended here — still derived from the RECORD and never from
        // `meta.notes`, which is the only property the obligation has to have.
        // Both triggers resolve on the shipped plan by their own path, which is
        // how the validator re-derives them.
        p.meta.noteObligations = p.meta.noteObligations || [];
        p.meta.noteObligations.push({
          cls: "sealedRecovery",
          why: [
            { field: "meta.sealedRecovery.outcome", value: p.meta.sealedRecovery.outcome },
            { field: "meta.sealedRecovery.offered", value: p.meta.sealedRecovery.offered.length },
          ],
        });
        pushNote(p, "sealedRecovery", p.meta.sealedRecovery);
      }
      // OM2 (round 22) — ...AND SO DOES THE TOWER SWAP, on the same terms and
      // for a stronger reason: this pass MOVES A TOWER on the shipped board, and
      // it did so in three rooms with no note, no declaration, no gallery badge
      // and a film that captions the tile it moved the tower TO as layer 3's own
      // set-cover pick. Two of its four rooms shipped `meta.noteObligations: []`
      // — the machinery had a class for `sealedRecovery` and none for this — so
      // the record was not merely unspoken, it was deletable: withdrawing
      // `meta.towers.acrossPriorTake` from a room whose `towerSwapTaken` still
      // says a tower moved passed the whole suite.
      //
      // Same placement as the recovery's, for the same reason: this pass may
      // hand back a fresh composition with a fresh notes array, so the note is
      // pushed out here on the plan the room actually ships, and the obligation
      // beside it is derived from the RECORD.
      if (p.meta.towers?.acrossPriorTake) {
        const swap = p.meta.towers.acrossPriorTake;
        p.meta.noteObligations = p.meta.noteObligations || [];
        p.meta.noteObligations.push({
          cls: "towerSwap",
          why: [
            // the offers this pass composed — a count that exists whichever
            // branch it took, so the refusal owes the note as loudly as the take
            { field: "meta.towers.acrossPriorTake.offered", value: swap.offered.length },
            // ...and the board fact, in the rooms that have one: the twin the
            // record can be checked against without reading the record
            ...(swap.taken ? [{ field: "meta.towers.towerSwapTaken", value: 1 }] : []),
          ],
        });
        pushNote(p, "towerSwap", swap);
      }
      attachRungProof(p, trail);
      p.meta.planMs = Math.round((performance.now() - t0) * 10) / 10;
      declareRuntime(p, trail);
      declareExtShortfall(p, trail);
    }
    return p;
  };
  for (let seedSkip = 0; seedSkip <= MAX_SEED_SKIP; seedSkip++) {
    for (let si = 0; si < SHELL_ESCALATION.length; si++) {
      const p = composePlan(d, { ...SHELL_ESCALATION[si], seedSkip, shellCache: cacheFor(seedSkip) });
      if (p.error) {
        lastError = p;
        break; // this seed is unusable — try the next one
      }
      trail.push(rungRecord(p, seedSkip, si));
      if (ecoCap === null && seedSkip === 0) ecoCap = ecoCost(p) * ECO_TOLERANCE;
      if (better(p, best, ecoCap)) best = p;
      // a complete plan only short-circuits if it is affordable; an
      // over-budget complete plan is not allowed to end the search either
      if (grade(p).complete && (ecoCap === null || ecoCost(p) <= ecoCap)) {
        // seedSkip > 0 runs exist to rescue 60/60 from a hub that already cost
        // us economy, so they do not go shopping for a cheaper wall — but they
        // DO owe the same proof as everybody else when they want to declare a
        // mobility miss, and minUpkeepShell is what walks the rungs. Its own
        // triggers decide whether anything is actually composed.
        return done(minUpkeepShell(d, p, si, ecoCap, seedSkip, trail, cacheFor(seedSkip)));
      }
      if (!p.shell) break; // no shell here — wider radii won't conjure one
    }
  }
  if (best) best.meta.ecoBudget = { cost: ecoCost(best), cap: ecoCap === null ? null : Math.round(ecoCap) };
  return done(best) || lastError;
}
