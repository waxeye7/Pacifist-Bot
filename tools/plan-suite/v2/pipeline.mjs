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
import { D8, isWall, pathLen } from "./shared.mjs";
import { planHub } from "./layer-hub.mjs";
import { BUILT_OBSTACLES, builtMobility, planShell, RADII_WIDE } from "./layer-shell.mjs";
import { planTowers } from "./layer-towers.mjs";
import { planLabs } from "./layer-labs.mjs";
import { planMisc } from "./layer-misc.mjs";
import { planExtensions } from "./layer-ext.mjs";
import { planWallRoads } from "./layer-walls.mjs";
// NOTE: layer-ext's RAMPARTS_PER_RATIO / MOBILITY_RAMPART_CAP are deliberately
// NOT imported any more. They price a defender LANE; the enclosure trade below
// has its own published price and its own reasons — see MOBILITY_ENCLOSURE_*.

export const EXT_TARGET = 60;

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
  // A reviewer trying to check E20S3's lab declaration ("0 dry anchors at any
  // orientation", which is gated on labs being off the road network) could
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
      plan.meta.notes = plan.meta.notes || [];
      const l6note = l6moved
        ? `Layer 6's own end-of-layer pass moved ${l6moved} slot(s) onto deep floor whose road face ` +
          `already existed (${(ex.extMeta.relocated || [])
            .map((r) => `${r.from.x},${r.from.y}->${r.to.x},${r.to.y}`)
            .join(" ")}). `
        : "";
      const l7note = l7moved
        ? `Layer 7b then re-ran the search over the board the room SHIPS — the dead-end prune had by ` +
          `then handed back ${rf.search.freeDeepRoadFaced} free deep road-faced tile(s) that did not ` +
          `exist as floor when layer 6 looked — and moved ${l7moved} more ` +
          `(${rf.moved.map((m) => `${m.from.x},${m.from.y}(d${m.fromDepth})->${m.to.x},${m.to.y}(d${m.toDepth})`).join(" ")})` +
          `${rf.rampartsRetired.length ? `, retiring ${rf.rampartsRetired.length} personal rampart(s)` : ""}. `
        : "";
      // WHAT IS LEFT, AND WHY — quoted from the post-prune search, never inferred
      // from layer 6's counters. `freeDeepRoadFaced` is the number of tiles that
      // passed every hard filter (deep, free, inside the wall, engine-legal,
      // already road-faced, reachable by a builder); `refusedCount` is how many
      // were examined and rejected, and the first of those reasons are carried in
      // the shortfall's evidence so the claim can be argued with tile by tile.
      const cause = !shallowNow
        ? `every shallow slot this room laid was relocated onto deep floor; it ships none`
        : rf
          ? `layer 7b scanned the finished interior tile by tile and found ` +
            `${rf.search.freeDeepRoadFaced} free deep road-faced tile(s) in the whole room, rejecting ` +
            `${rf.search.refusedCount} more for a stated reason each. ` +
            (rf.search.freeDeepRoadFaced === 0
              ? `There is no deep tile left in this enclosure that is free, inside the wall, ` +
                `engine-legal, already road-faced and reachable by a builder — that is a statement ` +
                `about a completed scan of all 2,304 interior positions, not about a budget`
              : `The ${shallowNow} that remain could not take any of them without failing the ` +
                `acceptance test: a structure would lose its last walkable face, a road would be cut ` +
                `off from the sitter, a battlement would be stranded, or the controller would lose a ` +
                `claim seat or an upgrader park`)
          : `the placement invariant refused the remaining deep tiles (each would strand a ` +
            `structure face, a road or the wall)`;
      // THE TRADE THIS ROOM REFUSED, PRICED. A relocation retires a
      // forever-rampart and can lengthen the garrison's lap; layer 7b will not
      // spend the second to buy the first, and the ones it therefore did NOT
      // take are stated here with both numbers rather than dropped silently.
      // This is the E11S7 shape a reviewer had to reconstruct by hand: "10
      // forever-ramparts for 0.5 of a lap the room already declares as failed
      // at 13.5 ... the plan never states it."
      const rb = rf && rf.boundRollback ? rf.boundRollback : [];
      const tradeNote = rb.length
        ? ` TRADE REFUSED, PRICED: ${rb.length} further shallow slot(s) could have moved onto free deep ` +
          `floor — ${rb
            .map((m) => `${m.from.x},${m.from.y}->${m.to.x},${m.to.y}`)
            .join(" ")} — retiring ${rb.length} personal rampart(s) at ` +
          `${Math.round(rb.length * 3) / 100} e/tick of forever-upkeep. Taking them would have moved the ` +
          `as-built gated defender lap from ${rf.lapBeforeMoves} to ${rb[0].wouldLap}, past this room's ` +
          `ceiling of ${rf.lapCeiling}` +
          (plan.meta.extensions?.laneMeta?.bounded !== null &&
          plan.meta.extensions?.laneMeta?.bounded !== undefined
            ? ` (the bound layer 6 reserved lanes to prove)`
            : ` (the lap the room already had with all 60 extensions standing — an upkeep pass may not ` +
              `spend the garrison's legs to buy upkeep)`) +
          `. The room keeps the ramparts and keeps the lap. The trade is written down so it can be ` +
          `argued with.`
        : "";
      plan.meta.notes.push(
        `SHALLOW EXTENSIONS: ${shallowNow} of ${total} sit at depth < 4 and rent a personal rampart ` +
          `forever. ${l6note}${l7note}` +
          (shallowNow ? `Cause of the ${shallowNow} that remain: ` : `Outcome: `) +
          cause +
          `.` +
          tradeNote,
      );
    }
    if (total < EXT_TARGET) {
      plan.meta.shortfalls.push({
        gate: "extension",
        detail:
          `only ${total}/${EXT_TARGET} extensions fit — the widest shell the escalation ladder would ` +
          `pay for still encloses ${plan.shell?.deepTiles ?? "?"} deep tiles, and the post-prune ` +
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
        refusedCount: rf.search.refusedCount,
        refused: rf.search.refused,
        boundRollback: rf.boundRollback,
        lapCeiling: rf.lapCeiling,
        lapBeforeMoves: rf.lapBeforeMoves,
        lapAfterMoves: rf.lapAfterMoves,
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

  // DEFENDER MOBILITY, RE-MEASURED ON THE FINISHED BASE. The shell negotiated
  // against an empty interior because that is all that existed at layer 2; this
  // is the lap the garrison will actually walk at RCL8, with the whole program
  // standing in it. It decides nothing — it is the honest number, and the gap
  // between it and meta.shell.mobility is exactly how much of the room's
  // mobility problem belongs to the layers that place the mass.
  if (plan.shell) plan.meta.shell.mobilityBuilt = builtMobility(d.terrain, plan);
  remeasureCtrlParks(d.terrain, plan);
  remeasureMineralNetwork(plan);
  declareEcoTax(plan);
  return plan;
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
}

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
  const existing = plan.meta.shortfalls.find((sf) => sf && sf.gate === "ctrlParks");
  const sentence =
    `AS BUILT this link feeds ${seats.length} parking tile(s), not the ${claimed} the layer-1 seat ` +
    `search counted: ${eaters.length ? eaters.join(" ") : "no structure"} stand(s) on the ring now. ` +
    `The layer-1 number is what the search DECIDED on — it is kept above for that reason — but the ` +
    `upgrader fleet parks on the shipped number` +
    (seats.length < 4
      ? `, and ${seats.length} is BELOW the ${4}-seat floor this planner treats as hard. That is a ` +
        `throttle on the upgrader fleet for the life of the room, caused by our own mass rather than ` +
        `by the controller's terrain.`
      : `.`);
  if (existing) {
    existing.detail += ` ${sentence}`;
    existing.ctrlParks = { ...(existing.ctrlParks || {}), built: seats.length, eaten: plan.meta.ctrlParksEaten };
  } else {
    plan.meta.shortfalls.push({
      gate: "ctrlParks",
      kind: "seats",
      detail:
        `UPGRADER SEATS, RE-COUNTED ON THE FINISHED ROOM: the controller link at ${link.x},${link.y} ` +
        `was chosen because it fed ${claimed} parking tile(s) within range 3 of the controller at ` +
        `${ctrl.x},${ctrl.y}. ${sentence}`,
      tiles: [{ x: link.x, y: link.y }, ...seats].slice(0, 32),
      ctrlParks: { parks: claimed, built: seats.length, eaten: plan.meta.ctrlParksEaten, floor: 4 },
    });
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
const ECO_REL_MULT = 2;
let ECO_CTRL_WALK_GATE = Math.min(25, ECO_REL_MULT * FLEET_CTRL_WALK_MEDIAN);
let ECO_SRC_SUM_GATE = Math.min(60, ECO_REL_MULT * FLEET_SRC_SUM_MEDIAN);

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
  ECO_CTRL_WALK_GATE = Math.min(25, ECO_REL_MULT * ctrlWalk);
  ECO_SRC_SUM_GATE = Math.min(60, ECO_REL_MULT * srcSum);
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
  const bits = [];
  if (pc > ECO_CTRL_WALK_GATE) {
    bits.push(
      `the controller is a ${pc}-tile walk ${bearing(hub, plan.controller)} of the hub, ` +
        `${pc - FLEET_CTRL_WALK_MEDIAN} over the fleet median of ${FLEET_CTRL_WALK_MEDIAN} ` +
        `(${Math.round((pc / FLEET_CTRL_WALK_MEDIAN) * 100) / 100}x it; the gate is ${ECO_CTRL_WALK_GATE}, ` +
        `whichever is lower of the absolute 25 and ${ECO_REL_MULT}x the median) — every upgrader ` +
        `trip and every controller-link haul pays it`,
    );
  }
  if (ps > ECO_SRC_SUM_GATE) {
    bits.push(
      `the source paths sum to ${ps} (${plan.sources
        .map((s) => bearing(hub, s))
        .join(" + ")}), ${ps - FLEET_SRC_SUM_MEDIAN} over the fleet median of ${FLEET_SRC_SUM_MEDIAN} ` +
        `(${Math.round((ps / FLEET_SRC_SUM_MEDIAN) * 100) / 100}x it; the gate is ${ECO_SRC_SUM_GATE}, ` +
        `whichever is lower of the absolute 60 and ${ECO_REL_MULT}x the median) — ` +
        `paid on every miner rotation and every container haul`,
    );
  }
  if (skip > 0) {
    bits.push(
      `the hub sits on seed rank ${skip}: the ${skip} better-scoring confluence(s) in this room could not ` +
        `hold the RCL8 program at any rung of the shell ladder, so the planner walked down the list and ` +
        `bought the distance instead of shipping a room short on extensions`,
    );
  }
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
  let walkSpread = null;
  let walkPair = "";
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const w = pathLen(plan.terrain, anchors[i].p, anchors[j].p);
      if (w === null) continue;
      if (walkSpread === null || w > walkSpread) {
        walkSpread = w;
        walkPair = `${anchors[i].n} ${anchors[i].p.x},${anchors[i].p.y} and ${anchors[j].n} ${anchors[j].p.x},${anchors[j].p.y}`;
      }
    }
  }
  const chebFloor = Math.ceil(spread / 2);
  const walkFloor = walkSpread === null ? null : Math.ceil(walkSpread / 2);
  const useWalk = walkFloor !== null && walkFloor > chebFloor;
  const anchorFloor = useWalk ? walkFloor : chebFloor;
  const floorProof = useWalk
    ? `the widest separation is ${walkSpread} tiles OF WALK (${walkPair}; they are only ${spread} apart ` +
      `as the crow flies, and the difference is the terrain between them), and two anchors ${walkSpread} ` +
      `apart on foot cannot both sit within ${walkFloor} steps of any tile in the room, so a walk of at ` +
      `least ${walkFloor} to the far one is owed by EVERY hub this room admits, not by this one`
    : `the widest separation is ${spread} tiles (${spreadPair}), and two anchors ${spread} apart cannot ` +
      `both sit within ${chebFloor} of any tile in the room, so a walk of at least ${chebFloor} to the ` +
      `far one is owed by EVERY hub this room admits, not by this one` +
      (walkSpread === null
        ? ` (measured as chebyshev: at least one anchor pair in this room has no walkable path between ` +
          `them at all, so a walk bound is not derivable)`
        : ` (the walk separation is ${walkSpread}, which bounds no higher than the chebyshev one here)`);
  const cause =
    skip > 0
      ? `${skip} closer-scoring seat(s) WERE tried and rejected — none of them held the RCL8 program at ` +
        `any rung of the shell ladder — so this distance was bought, not preferred.`
      : `NO closer seat was rejected: this hub is seed rank 0 of ${plan.meta.seedPool ?? "?"} scored ` +
        `confluences and it composed the whole RCL8 program on its own ladder, so the eco score was ` +
        `never overruled by anything. The anchors are genuinely far apart in this room — ${floorProof}.`;
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
  const opener =
    skip > 0
      ? `hauler distances in this room were BOUGHT, not preferred: ${bits.join("; ")}. `
      : `hauler distances in this room are at least ${anchorFloor} tiles of terrain verdict — that is the ` +
        `floor the anchor spread proves below, and the rest is the shape of this basin: ${bits.join("; ")}. `;
  plan.meta.shortfalls.push({
    gate: "eco",
    detail:
      opener +
      `The hub sits at ${hub.x},${hub.y} on the only basin that holds the program — ${basin} tiles reachable ` +
      `from the seed, core pocket ${plan.meta.coreSize ?? "?"}. ${cause} Capping this silently is the ` +
      `anti-pattern; the numbers are here so the trade can be argued with.`,
    tiles: [{ x: hub.x, y: hub.y }],
    eco: {
      pathController: pc,
      pathSourcesSum: ps,
      seedSkip: skip,
      basin,
      seedPool: plan.meta.seedPool ?? null,
      anchorSpread: spread,
      anchorWalkSpread: walkSpread,
      anchorFloorBasis: useWalk ? "walk" : "chebyshev",
      fleetMediansMeasured: FLEET_MEDIANS_MEASURED,
      anchorWalkFloor: anchorFloor,
    },
  });
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
    if (s.gate !== "mobility" || s.source !== "shell" || s.rungs) continue;
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
    // THE VERDICT IS READ OFF THE TABLE, NOT ASSERTED ABOVE IT.
    //
    // layer 2's cause template used to end "no cut of this basin can shorten
    // it" whenever it diagnosed terrain — a claim about every enclosure the room
    // admits, printed directly above a table of enclosures this room actually
    // composed, 30 of which listed a COMPLETE rung with a materially shorter
    // lap. E14S5 shipped 7.5 at 40 ramparts with rung 1 sitting in its own table
    // at 1.5 for 43. The impossibility claim is gone from layer 2 (see the `why`
    // strings there) and this is what replaces it: whatever the rungs say.
    // ------------------------------------------------------------------
    const better = mine
      .filter((r) => r.complete && r.mobility < shipped - MATERIAL_LAP)
      .sort((a, b) => a.mobility - b.mobility || a.ramparts - b.ramparts)[0];
    const best = (mine.length ? mine : trail).reduce((b, r) => (r.mobility < b.mobility ? r : b));
    const verdict = better
      ? `A WIDER CUT DOES SHORTEN IT, and it is in the table above: rung ${better.rung} ` +
        `(needDeep+${better.needDeepBonus}) composed the whole RCL8 program at a lap of ${better.mobility} for ` +
        `${better.ramparts} ramparts, ${better.ramparts - shippedRamparts} more than the ${shippedRamparts} this ` +
        `room ships. That is over the ${mobilityAllowance(shipped - better.mobility)} rampart(s) the ` +
        `${MOBILITY_ENCLOSURE_PER_RATIO}-per-1.0 mobility price allows for the ${round2(shipped - better.mobility)} of lap ` +
        `it reclaims (cap ${MOBILITY_ENCLOSURE_CAP}` +
        (shipped <= MOBILITY_BUY_FLOOR
          ? `, and this room's shipped lap of ${shipped} is not over the ${MOBILITY_BUY_FLOOR} floor below which wall may not be spent on lap at all`
          : "") +
        `), so it was refused on upkeep-first policy — not on ` +
        `impossibility. The trade is written down here so it can be argued with.`
      : best.mobility > MOBILITY_TARGET
        ? `No rung this room composed measured a materially shorter lap: the best of them is ${best.mobility} at ` +
          `${best.ramparts} ramparts, still over the ${MOBILITY_TARGET} target. Within the enclosures this room ` +
          `admits at a price it can pay, the lap is what it is.`
        : `The best lap any of them measured is ${best.mobility} at ${best.ramparts} ramparts; it was refused ` +
          `because the ${best.ramparts - shippedRamparts} extra rampart(s) exceed the ` +
          `${MOBILITY_ENCLOSURE_PER_RATIO}-per-1.0 price mobility is allowed to pay (cap ${MOBILITY_ENCLOSURE_CAP}).`;
    s.detail +=
      ` LADDER WALKED: ${mine.length} rung(s) of this seed` +
      (trail.length > mine.length ? ` (plus ${trail.length - mine.length} composition(s) on rejected seeds)` : "") +
      ` — ` +
      mine
        .map(
          (r) =>
            `rung ${r.rung} (needDeep+${r.needDeepBonus}): ` +
            `mobility ${r.mobility}, ${r.ramparts} ramparts${r.complete ? "" : ", INCOMPLETE"}`,
        )
        .join(" · ") +
      `. ${verdict}`;
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
  if (trail.length <= RUNTIME_DECLARE_COMPOSES) return;
  plan.meta.shortfalls = plan.meta.shortfalls || [];
  const seeds = new Set(trail.map((r) => r.seedSkip)).size;
  const complete = trail.filter((r) => r.complete).length;
  plan.meta.shortfalls.push({
    gate: "runtime",
    kind: "heavy-search",
    detail:
      `THIS ROOM COMPOSED ${trail.length} COMPLETE PLANS across ${seeds} seed(s) — more than the ` +
      `${RUNTIME_DECLARE_COMPOSES}-rung ladder a single seed is allowed, which is the line the suite ` +
      `declares at. ${complete} of them held the whole RCL8 program, and it shipped from seed rank ` +
      `${plan.meta.seedSkip ?? 0}. Each composition is a complete shell negotiation plus the whole ` +
      `structure program, kept only if it measurably beat the incumbent — that proof is exactly what the ` +
      `old sub-200ms budget was trading away, and it makes this one of the fleet's slowest rooms to plan. ` +
      `The planner runs offline, so this is a note about developer patience, not about CPU in-game; it is ` +
      `declared rather than hidden because a search that cannot settle on the best-scoring seat is worth ` +
      `seeing. No wall-clock reading is quoted here on purpose: it differs on every run, and a plan that ` +
      `hashes differently on every run cannot be checked for determinism at all. The suite prints the ` +
      `milliseconds.`,
    runtime: { compositions: trail.length, seeds, complete, seedSkip: plan.meta.seedSkip ?? 0 },
  });
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
  const done = (p) => {
    if (p && p.meta) {
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
