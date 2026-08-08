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
import { D4, D8, PARK_PROTECT, isWall } from "./shared.mjs";
import { planHub, distField } from "./layer-hub.mjs";
import { BUILT_OBSTACLES, interiorWalk, planShell, RADII_WIDE } from "./layer-shell.mjs";
import { CLUMP_NOTE, MAX_REFILL, MIN_SAT, REFILL_NOTE, planTowers } from "./layer-towers.mjs";
import { planLabs } from "./layer-labs.mjs";
import { planMisc } from "./layer-misc.mjs";
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
  plan.shell = shell.shell;
  plan.exterior = shell.exterior;
  plan.depth = shell.depth;
  plan.meta.counts.rampart = shell.rampart.length;
  plan.meta.shell = shell.shell;
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
    if (lb.shallowLabs.length) plan.structures.rampart.push(...lb.shallowLabs);
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
    if (ms.bubbles.length && plan.structures.rampart) plan.structures.rampart.push(...ms.bubbles);
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
              rollback: (rf.boundRollback || []).map((m) => ({
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
  // Measured on the shipped fleet: 1272 of the RCL3 road tiles were
  // disconnected from the sitter in 148 of 159 rooms. E5S1's twenty included
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
  const tiles = plan.meta?.ctrlParkTiles || [];
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
  misc.mineralSeatNetTiles = touching;
  misc.mineralOffNetwork = touching.length === 0;
  misc.mineralOffNetworkWhy = touching.length
    ? `the seat at ${seat.x},${seat.y} DOES touch the shipped road network (${touching.join(" ")}) — no ` +
      `road was grown to it, but a corridor another layer laid runs past it, so it is serviced like any ` +
      `other container. Re-derived over the finished road set, not layer 5's.`
    : `no road by design — mineral hauling is one trickle deposit on a long cooldown, and permanent road ` +
      `decay to reach it costs more than the walk it saves. Re-derived over the finished road set: no ` +
      `tile D8 of the seat carries road or container.`;
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
// Re-derived as built, 86 of 172 rooms shipped fewer seats than they claimed;
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
// The thresholds are read off the fleet, not invented: pathController runs
// min 4 / median 10 / p90 25 / max 75, and pathSourcesSum min 8 / median 27 /
// p90 45 / max 84 (159 rooms, re-measured this round; the p90 for source sum
// was quoted as 46 and is 45). The absolute lines >25 and >60 each marked
// roughly the worst decile — the rooms where the hauler bill is a terrain
// verdict rather than a planner choice — and any seedSkip at all means the
// top-ranked confluence was rejected outright. The wording below is generated
// from the room's own numbers.
//
// ...AND AN ABSOLUTE CLIFF IS THE WRONG SHAPE FOR A FLEET STATISTIC.
//
// The two absolute gates were derived from the fleet distribution once and then
// frozen as bare numbers, and a bare number cuts wherever it happens to land.
// It landed badly: E11S10 hauls 58 and E5S1 hauls 55 — 2.15x and 2.04x the
// fleet median, 4th and 5th worst in 159 rooms — and both were SILENT, because
// 58 and 55 are under 60. E19S6 at 62 declares. Two tiles of terrain is the
// entire difference between "the hauler bill is a terrain verdict worth a
// paragraph" and "nothing to see here", which is not a distinction the room
// shape supports. The controller-walk gate has the same defect and 9 more
// silent rooms above 2x its median (E12S9 and E6S2 sit at exactly 25, one tile
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
// shipped 172 rooms is 26, not 27, by every convention, which put the source
// gate at 54 instead of 52 and left E21S5 (53) and E7S5 (54) above the
// rule-as-written with no eco declaration. Meanwhile the file contradicted
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
 * the fleet 2 ramparts and 7 shallow extensions while adding 4 cut tiles and
 * pushing one more room's defender-mobility ratio over 1.0. That is noise
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

const rungRecord = (p, seedSkip, si) => ({
  seedSkip,
  rung: si,
  needDeepBonus: SHELL_ESCALATION[si].needDeepBonus ?? 0,
  needDeep: p?.meta?.shell?.needDeep ?? null,
  mobility: mobOf(p),
  ramparts: rampartsOf(p),
  cut: cutOf(p),
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
    if (s.gate !== "mobility" || !s.negotiated || s.rungs) continue;
    s.rungs = trail.map((r) => ({
      rung: r.rung,
      needDeepBonus: r.needDeepBonus,
      seedSkip: r.seedSkip,
      mobility: r.mobility,
      ramparts: r.ramparts,
      complete: r.complete,
    }));
    // the prose spells out the rungs of the seed we SHIPPED (the ones that were
    // a real alternative); `s.rungs` above carries every composition including
    // the rejected seeds, so nothing is lost by keeping the sentence readable
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
      // `s.rungs` above carries every composition including the rejected seeds.
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
 * Holding every counted seat is free in 165 of 172 rooms — measured, twice, at
 * two different floors. In the handful that are genuinely short of deep floor it
 * is not: E9S2 (74 deep tiles for the whole RCL8 program) and E12S5 each
 * pay for the reservation in SHALLOW EXTENSIONS, and a shallow extension is a
 * personal rampart repaired forever plus a structure a ranged attacker can hit
 * from outside the wall. That is a real trade and it is the first one in this
 * file that the reservation cannot make on its own, because the cost only
 * becomes visible six layers after the tiles are reserved.
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
 * not moved for a soft tie-break, because the fleet-wide experiment says what
 * that costs: ranking the dispersion pass itself on the enriched tuple moves 56
 * of 172 rooms and takes E11S1's as-built refill from 4 to 7, E8S7's from 4 to
 * 8 and E18S4's shipped nuke window from 9 to 10. Offers that are merely legal
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
 * Owned structures with no road/container on any of their eight neighbours.
 * The mineral seat and its extractor are the fleet's declared exemption (see
 * renderOffNetwork), so they are counted like everything else and the panel
 * compares BEFORE with AFTER: a constant exemption cancels, a newly stranded
 * structure does not.
 */
const NETWORK_KINDS = ["spawn", "extension", "tower", "lab", "link", "storage", "terminal", "nuker", "observer", "container"];
function countOffNetwork(plan) {
  const conduct = new Set([
    ...(plan.structures?.road || []).map((r) => `${r.x},${r.y}`),
    ...(plan.structures?.container || []).map((c) => `${c.x},${c.y}`),
  ]);
  let n = 0;
  for (const t of NETWORK_KINDS) {
    for (const p of plan.structures?.[t] || []) {
      if (!D8.some(([dx, dy]) => conduct.has(`${p.x + dx},${p.y + dy}`))) n++;
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
  const tried = [];
  for (const c of candidates) {
    const alt = composePlan(d, { ...plan.meta.composeOpts, takeTowerSwap: { from: c.from, to: c.to } });
    if (alt.error || !alt.shell || !grade(alt).complete) {
      tried.push({ ...c, verdict: "the re-composition did not produce a complete room" });
      continue;
    }
    finalizeRoom(d.terrain, alt);
    const after = asBuiltInstruments(d.terrain, alt);
    const worse = instrumentsHold(before, after);
    if (worse.length) {
      tried.push({ ...c, before, after, verdict: `refused: ${worse.join(", ")}` });
      continue;
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
      continue;
    }
    tried.push({ ...c, before, after, verdict: "TAKEN" });
    alt.meta.towers.acrossPriorTake = {
      taken: { from: c.from, to: c.to, why: c.why },
      lifts,
      retiresClumpDeclaration: retires,
      clumpNote: CLUMP_NOTE,
      before,
      after,
      offered: tried,
      instruments: Object.keys(INSTRUMENT_DIRECTION),
      directions: { ...INSTRUMENT_DIRECTION },
      walkRule: TAKE_WALK_RULE,
      basis:
        `the room was RE-COMPOSED with this swap taken (opts.takeTowerSwap, applied in layer 3 after ` +
        `every one of its searches has run) and finalized, and both instrument panels are read off ` +
        `finished boards: before is the plan this room would otherwise ship, after is the plan it ` +
        `does. A swap is kept only when no instrument moves the wrong way AND either the weakest ` +
        `cut-tile face rises or the clump falls below ${CLUMP_NOTE}, which is the line the clump ` +
        `declaration fires at. ${TAKE_WALK_RULE}`,
    };
    // O6 (round 17): if this swap put two towers on neighbouring tiles, the
    // crossing record is where the adjacency contract says the evidence lives —
    // see recordTakeCrossing.
    recordTakeCrossing(alt, c, before, after);
    // the sealed-floor recovery ran BEFORE this pass and its record is written
    // by the pipeline, not by composePlan, so the re-composition does not carry
    // it. Its two panels describe the recovery's own decision point — the board
    // this take then re-priced on top of — which is what its basis says.
    if (plan.meta.sealedRecovery) alt.meta.sealedRecovery = plan.meta.sealedRecovery;
    return alt;
  }
  // nothing was kept — say so on the plan the room does ship, so a reader can
  // see the offer WAS priced on the shipped board rather than ignored
  plan.meta.towers.acrossPriorTake = {
    taken: null,
    before,
    offered: tried,
    instruments: Object.keys(INSTRUMENT_DIRECTION),
    directions: { ...INSTRUMENT_DIRECTION },
    clumpNote: CLUMP_NOTE,
    walkRule: TAKE_WALK_RULE,
    basis:
      `every offer above was re-composed and finalized, and the instrument panel of the finished ` +
      `board refused it. before is the plan this room ships. ${TAKE_WALK_RULE}`,
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
 * owner review measured what ONE move gets: 220 of the fleet's 257 sealed tiles
 * come back on a single structure, 42 of the 62 rooms are >= 90%
 * single-structure, and E15S6's 72-tile seal is 69 tiles behind any ONE of
 * three extensions while its 16-tile cut is not D8-adjacent to the pocket at
 * all. That is criticism 2's shape — E16S5's whole 2.25 lap was ONE observer
 * tile — in the note channel, and a published ceiling nobody attempts is a
 * number printed in place of a decision.
 *
 * `noteSealedFloor` now prices the counterfactual per POCKET and per
 * STRUCTURE, exhaustively, by deleting each boundary structure and re-flooding.
 * This pass acts on it, and it is bounded in every direction:
 *
 *   · EXTENSIONS ONLY. The extension mass is the flexible layer and the seal is
 *     its ordering — the note's own sentence is "a row of extensions across a
 *     one-wide corridor seals the pocket behind it". A pocket whose only
 *     holders are the hub kit, the lab diamond, a tower, the nuker or the
 *     observer is fixed geometry: those are placed by their own layers against
 *     their own constraints and "move it one tile" is not a bounded change to
 *     them. Such a pocket publishes a refusal naming its holders.
 *   · A THRESHOLD, STATED. The move has to bring back at least
 *     SEALED_RECOVERY_MIN tiles of DEEP floor — buildable ground the program
 *     could have used — because a one-tile pocket is not worth a re-composition
 *     and a pass that fires on everything is a pass with no rule.
 *   · AT MOST SEALED_RECOVERY_TRIES COMPOSITIONS, over the holders of the
 *     single largest-deep pocket, in the record's own published order.
 *   · THE WHOLE PANEL. Same `asBuiltInstruments` the across-prior take uses,
 *     which since this round also carries sealedTiles/sealedDeep, the per-tower
 *     refill walks, the extension D4-face count and the off-network count. The
 *     move must not move ANY of them the wrong way, and it must actually
 *     deliver the deep floor it was taken for.
 *   · REFUSAL WITH EVIDENCE. Every candidate that was tried publishes its two
 *     panels and the instrument that refused it; every pocket that was not
 *     tried publishes why.
 *
 * The move itself is a seat WITHDRAWN, not a structure teleported: the room is
 * re-composed with `opts.forbidExtSeat` set, and layer 6 places its sixty
 * extensions again with that one tile off the board. That is why the answer is
 * a real plan and not a hand edit — the corridor stays open, the mass flows
 * into the pocket, and every downstream layer runs on the result.
 */
const SEALED_RECOVERY_MIN = 4;
const SEALED_RECOVERY_TRIES = 3;
function maybeTakeSealedRecovery(d, plan) {
  if (!plan || plan.error || !plan.meta?.composeOpts || plan.meta.composeOpts.forbidExtSeat) {
    return plan;
  }
  const sf = plan.meta.sealedFloor;
  if (!sf || !sf.pockets?.length) return plan;
  const ranked = sf.pockets
    .filter((p) => p.best && p.best.recoversDeep >= SEALED_RECOVERY_MIN)
    .sort((a, b) => b.best.recoversDeep - a.best.recoversDeep || b.best.recovers - a.best.recovers);
  const record = {
    threshold: SEALED_RECOVERY_MIN,
    tryCap: SEALED_RECOVERY_TRIES,
    kindsAttempted: ["extension"],
    taken: null,
    offered: [],
    instruments: Object.keys(INSTRUMENT_DIRECTION),
    directions: { ...INSTRUMENT_DIRECTION },
    walkRule: TAKE_WALK_RULE,
    basis: SEALED_RECOVERY_BASIS,
  };
  if (!ranked.length) {
    record.offered.push({
      verdict:
        `no pocket in this room is held shut by a single structure returning ` +
        `${SEALED_RECOVERY_MIN} or more DEEP tiles — the largest single-structure recovery here is ` +
        `${Math.max(0, ...sf.pockets.map((p) => (p.best ? p.best.recoversDeep : 0)))} deep tile(s)`,
    });
    plan.meta.sealedRecovery = record;
    return plan;
  }
  const target = ranked[0];
  const extHolders = target.holders.filter((h) => h.type === "extension");
  if (!extHolders.length) {
    record.offered.push({
      pocket: { at: target.at, tiles: target.tiles, deep: target.deep },
      verdict:
        `this pocket's ${target.holders.length} holder(s) are all fixed geometry ` +
        `(${[...new Set(target.holders.map((h) => h.type))].join(", ")}) — this pass re-seats ` +
        `extensions and nothing else, because the extension mass is the layer whose ordering the ` +
        `seal is, and a hub structure, a lab of the diamond or a tower is placed against its own ` +
        `constraints by its own layer`,
    });
    plan.meta.sealedRecovery = record;
    return plan;
  }
  const before = asBuiltInstruments(d.terrain, plan);
  for (const h of extHolders.slice(0, SEALED_RECOVERY_TRIES)) {
    const withdrawn = { x: h.x, y: h.y };
    const alt = composePlan(d, { ...plan.meta.composeOpts, forbidExtSeat: withdrawn });
    if (alt.error || !alt.shell || !grade(alt).complete) {
      record.offered.push({
        withdrawn,
        recoversDeep: h.recoversDeep,
        verdict: "the re-composition did not produce a complete room",
      });
      continue;
    }
    finalizeRoom(d.terrain, alt);
    const after = asBuiltInstruments(d.terrain, alt);
    const worse = instrumentsHold(before, after);
    if (worse.length) {
      record.offered.push({ withdrawn, recoversDeep: h.recoversDeep, before, after, verdict: `refused: ${worse.join(", ")}` });
      continue;
    }
    const gainedDeep = before.sealedDeep - after.sealedDeep;
    if (gainedDeep < SEALED_RECOVERY_MIN) {
      record.offered.push({
        withdrawn,
        recoversDeep: h.recoversDeep,
        before,
        after,
        verdict:
          `refused: every instrument holds but the re-composed room only recovers ${gainedDeep} deep ` +
          `sealed tile(s) against a threshold of ${SEALED_RECOVERY_MIN} — the counterfactual said ` +
          `${h.recoversDeep} would come back if this structure simply vanished, and layer 6 re-seats ` +
          `the sixty extensions when it is withdrawn, which is a different question`,
      });
      continue;
    }
    record.offered.push({ withdrawn, recoversDeep: h.recoversDeep, before, after, verdict: "TAKEN" });
    record.taken = { withdrawn, pocket: { at: target.at, tiles: target.tiles, deep: target.deep } };
    record.recoveredTiles = before.sealedTiles - after.sealedTiles;
    record.recoveredDeep = gainedDeep;
    record.before = before;
    record.after = after;
    alt.meta.sealedRecovery = record;
    return alt;
  }
  record.offered.push({
    verdict:
      `every candidate above was re-composed and finalized and the panel refused it; this room ships ` +
      `the plan it would have shipped without this pass`,
  });
  plan.meta.sealedRecovery = record;
  return plan;
}
const SEALED_RECOVERY_BASIS =
  `the candidate is read off meta.sealedFloor.pockets[].holders — the per-structure counterfactual, ` +
  `priced by deleting each boundary structure and re-running the own-creep flood — and the move is a ` +
  `SEAT WITHDRAWN, not a structure teleported: the room is RE-COMPOSED from layer 1 with ` +
  `opts.forbidExtSeat set, so layer 6 places its sixty extensions again with that one tile off the ` +
  `board and every later layer runs on the result. before/after are the same as-built instrument ` +
  `panel the across-prior take uses, read off two FINISHED rooms. A withdrawal is kept only when no ` +
  `instrument moves the wrong way AND the finished room actually gives back at least ` +
  `${SEALED_RECOVERY_MIN} deep sealed tiles — the counterfactual is a claim about deleting a ` +
  `structure, and this is the claim about re-composing without its seat, which is a strictly harder ` +
  `test and the only one that ships.`;

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
      // withdraws an extension SEAT and re-composes from layer 1; the
      // across-prior take moves a TOWER and re-composes from layer 1. Running
      // the recovery first means the take's two instrument panels are read on
      // top of whatever the recovery decided, and the take's re-composition
      // inherits `forbidExtSeat` through composeOpts — so the room the take
      // prices is the room the recovery left. The other order would leave the
      // take's panels describing a board the recovery then replaced.
      p = maybeTakeSealedRecovery(d, p);
      p = maybeTakeTowerSwap(d, p);
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
