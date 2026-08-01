/**
 * Layer 7 — LATE ROADS (runs last, after extensions).
 *
 * OWNER DOCTRINE (supersedes the older "pave the whole wall ring" note that
 * used to live here): roads are MINIMAL AND PURPOSEFUL. "I don't need the
 * roads on ramparts and stuff, that's overkill — roads TO ramparts, that's
 * fine. Only build roads for remotes or to get to key locations."
 *
 * So this layer no longer paves the cut. A road on every rampart tile bought
 * defenders a 1-tick/tile lap at the price of ~50 road tiles per room —
 * tiles that decay, cost CPU to maintain and, at RCL8, are simply not what
 * the owner wants to see. What survives:
 *
 *   (1) SPURS — one road per rampart CLUSTER, running from the existing
 *       network out to a tile adjacent to that cluster. Defenders still ride
 *       roads to the wall; they walk the last tile onto it. Clusters already
 *       touched by an eco road cost nothing. Battlement metadata is untouched
 *       (layer 2 still marks the tiles the defenders hold).
 *
 *   (2) FILLER-FACE SAFETY NET — every extension must have a ROAD on a D4
 *       face (the validator hard-fails otherwise). Layer 6 now grows the
 *       extension mass along corridors, so this pass is expected to add
 *       almost nothing; it exists so a corner case can never ship an
 *       extension a filler has to cross plain terrain to reach.
 *
 *   (3) DEAD-END PRUNE — iteratively drop degree-1 road tiles that serve no
 *       structure, no room object and no rampart spur, until stable. This
 *       runs over the WHOLE network (every layer's roads), so a stitch tail
 *       that used to hang off the ring vanishes with the ring.
 *
 * Ordering: still last. Roads never block movement, so nothing earlier needs
 * to know about them, and the RCL road budget (PlanV2's priority-prefix
 * staging) keeps building eco roads first.
 *
 * DELIBERATE (m12): the eco roads that run OUTSIDE the shell — to source
 * containers and the controller link that the cut could not afford to
 * enclose — stay. An attacker gains one tick per tile on ground they were
 * going to cross anyway; our haulers pay that tick on every single trip for
 * the life of the room.
 *
 *   (0) MOBILITY VERIFICATION — measures the finished base's defender lap and
 *       reports it. It moves NOTHING. See the header on verifyMobility below
 *       for what used to live here and why it is gone.
 */
import { D4, D8, isSwamp, key, walkable } from "./shared.mjs";
import {
  BUILT_OBSTACLES,
  MOBILITY_TARGET,
  arriveAt,
  bfsField,
  interiorWalk,
  maskFromKeys,
  mobilityStats,
} from "./layer-shell.mjs";

/** a 1-tile rampart in a crack is not a defensive position worth a road */
const MIN_CLUSTER = 2;
/** a spur longer than this is a hike, not an approach — leave it unpaved */
const MAX_SPUR = 14;

function idx(x, y) {
  return x + y * 50;
}

/**
 * ------------------------------------------------------------------------
 * MOBILITY VERIFICATION — "the attacker walks 10, I refuse to walk 20."
 * ------------------------------------------------------------------------
 *
 * WHAT USED TO BE HERE, AND WHY IT IS GONE. This was `breachCorridors`: it
 * measured the finished base's defender lap, found the wall pair the extension
 * mass had walled off, and RELOCATED one to four extensions out of the lane.
 * It worked — fleet as-built worst-pair mean 3.61 -> 2.92, 178 extensions moved
 * across 67 rooms — and it was the "repair-loop architecture" anti-pattern by
 * name: a layer fixing a previous layer's output instead of the previous layer
 * being corrected at the source. Its own header argued the fix was impossible
 * anywhere else, because the lap is a property of the FINISHED base.
 *
 * That argument was wrong. The lap cannot be KNOWN before the mass lands, but
 * it can be BOUNDED: the mass can only ever take tiles an extension is allowed
 * to stand on, so walking the interior with every one of those blocked at once
 * gives the worst base layer 6 could possibly build. Layer 6 now measures that
 * bound BEFORE it grows anything and reserves the defender's shortest lanes
 * until the bound is no worse than the lap the shell itself measured with no
 * mass in the room at all (see the lane header in layer-ext). Reserved tiles
 * are cut tiles as far as the mass is concerned; corridors may still pave them,
 * because a road does not block a creep.
 *
 * So there is nothing left to repair, and this pass does not repair. It
 * MEASURES: the mass-free lap (the floor this room's geometry allows), the
 * as-built lap, and how much of the gap between them our own mass owns. When
 * the as-built lap misses the target it declares — with both numbers, so a
 * reader can tell a shell/terrain verdict apart from a mass we chose to grow.
 * It relocates nothing, deletes nothing and re-sorts nothing.
 */
function verifyMobility(terrain, plan) {
  const cut = plan.shell.cut || [];
  const meta = {
    floor: 0,
    built: 0,
    over: 0,
    floorOver: 0,
    caused: 0,
    worstCaused: false,
    walled: 0,
    worst: null,
    lanes: plan.meta?.extensions?.laneMeta ?? null,
  };
  if (!cut.length || !plan.depth) return meta;

  const ext = plan.exterior;
  const cutSet = new Set(cut.map((c) => key(c.x, c.y)));
  /** obstacles as the engine sees them; roads/containers/ramparts are not */
  const blockedBuilt = new Set(plan.objectTiles || []);
  const blockedFree = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures[t] || []) {
      blockedBuilt.add(key(p.x, p.y));
      if (t !== "extension") blockedFree.add(key(p.x, p.y));
    }
  }
  const wFree = interiorWalk(terrain, cutSet, ext, blockedFree, plan.sitter);
  const wBuilt = interiorWalk(terrain, cutSet, ext, blockedBuilt, plan.sitter);
  const freeMask = maskFromKeys(wFree);
  const mFree = mobilityStats(cut, ext, freeMask);
  const mBuilt = mobilityStats(cut, ext, maskFromKeys(wBuilt));

  meta.floor = mFree.max;
  meta.built = mBuilt.max;
  meta.over = mBuilt.over;
  meta.floorOver = mFree.over;
  // ...and the same three read against the detour floor (layer-shell's
  // MOBILITY_DETOUR_FLOOR): a pair the garrison loses by two tiles is recorded,
  // not declared. Both readings are kept — the raw one is the measurement, the
  // gated one is the verdict.
  meta.floorGated = mFree.maxGated;
  meta.builtGated = mBuilt.maxGated;
  meta.overGated = mBuilt.overGated;
  meta.floorOverGated = mFree.overGated;
  // wall pairs the MASS pushed over the target — the only ones layers 6/7 own
  meta.caused = Math.max(0, mBuilt.over - mFree.over);
  meta.walled = cut.length - cut.filter((c) => wBuilt.has(key(c.x, c.y))).length;
  if (mBuilt.worstGated || mBuilt.worst) {
    const { a, b, din, dout } = mBuilt.worstGated || mBuilt.worst;
    // the same pair, walked with no mass at all: if THAT is inside the target
    // the detour is ours, and the reservation did not hold it
    const freeDin = arriveAt(bfsField(freeMask, a), b);
    meta.worst = { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, din, dout, freeDin };
    meta.worstCaused =
      mBuilt.maxGated > MOBILITY_TARGET && isFinite(freeDin) && freeDin / dout <= MOBILITY_TARGET;
  }

  if (mBuilt.maxGated > MOBILITY_TARGET && mBuilt.worstGated && plan.meta) {
    const { a, b, din, dout } = mBuilt.worstGated;
    const lane = plan.meta?.extensions?.laneMeta;
    const laneNote = !lane
      ? ""
      : lane.dropped
        ? ` The lane reservation layer 6 wanted (${lane.tiles} tile(s)) was DROPPED: honouring it cost this room its 60th extension, and 60/60 outranks the lap.`
        : ` Layer 6 reserved ${lane.tiles} lane tile(s) (${lane.deep} deep) over ${lane.rounds} round(s), which bounds the worst mass this room could grow at ${lane.bounded} against an unreserved ${lane.worstCase}.`;
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    plan.meta.shortfalls.push({
      gate: "mobility",
      source: "built",
      detail:
        `AS BUILT the defender lap is ${mBuilt.maxGated} over pairs costing more than ` +
        `${mBuilt.detourFloor} tiles of detour (target ${MOBILITY_TARGET}; ungated over every pair it is ` +
        `${mBuilt.max}): between wall tiles ` +
        `${a.x},${a.y} and ${b.x},${b.y} the garrison walks ${din} inside while the attacker walks ` +
        `${dout} outside. With the extension mass removed entirely the same room measures ` +
        `${mFree.maxGated} (that pair: ${meta.worst.freeDin} inside), so ` +
        (meta.worstCaused
          ? `this pair IS our mass and the reservation did not hold it`
          : `the lap is the enclosure and the terrain, not the mass — no arrangement of 60 extensions ` +
            `shortens it`) +
        `. ${mBuilt.overGated}/${mBuilt.gatedPairs} real-detour wall pairs are over target against ` +
        `${mFree.overGated} with no mass in the room (ungated: ${mBuilt.over}/${mBuilt.pairs} against ` +
        `${mFree.over}).${laneNote} Nothing is relocated to chase this number: layer 6 reserves the ` +
        `defender's lanes before it grows, and a pass that moved finished structures to patch the ` +
        `result would be the repair loop this planner is not allowed to have.`,
      tiles: [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ],
    });
  }
  return meta;
}

export function planWallRoads(terrain, plan) {
  if (!plan.shell) return { error: "wall roads need a shell (layer 2 missing)" };
  const cut = plan.shell.cut || [];
  if (!cut.length) return { error: "shell has no cut tiles" };
  const ext = plan.exterior;

  // (0) MEASURE the lap the finished mass leaves the garrison. Read-only —
  //     it changes no structure, no road and no array order.
  const mobility = verifyMobility(terrain, plan);

  // every real structure blocks; roads/ramparts/containers do not
  const occupied = new Set();
  for (const t of [
    "storage",
    "terminal",
    "link",
    "spawn",
    "tower",
    "lab",
    "extension",
    "nuker",
    "observer",
  ]) {
    for (const p of plan.structures[t] || []) occupied.add(key(p.x, p.y));
  }
  for (const k of plan.objectTiles || []) occupied.add(k); // C1 — never pave a source
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));
  const cutSet = new Set(cut.map((c) => key(c.x, c.y)));
  // every rampart down so far — the shell line plus the personal ones earlier
  // layers bolted to their own shallow structures
  const rampartSet = new Set((plan.structures.rampart || []).map((r) => key(r.x, r.y)));

  const newRoads = [];
  const addRoad = (x, y) => {
    const k = key(x, y);
    // NEVER on a cut tile — that is the whole point of this rewrite
    if (roadSet.has(k) || occupied.has(k) || cutSet.has(k)) return false;
    if (!walkable(terrain, x, y) || x < 1 || y < 1 || x > 48 || y > 48) return false;
    roadSet.add(k);
    newRoads.push({ x, y });
    return true;
  };

  const containerSet = new Set((plan.structures.container || []).map((c) => key(c.x, c.y)));
  /** D8 component of roads+containers reachable from the sitter */
  const liveNetwork = () => {
    const comp = new Set([key(plan.sitter.x, plan.sitter.y)]);
    const q = [plan.sitter];
    let qi = 0;
    while (qi < q.length) {
      const cur = q[qi++];
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        const k = key(x, y);
        if (comp.has(k) || (!roadSet.has(k) && !containerSet.has(k))) continue;
        comp.add(k);
        q.push({ x, y });
      }
    }
    return comp;
  };

  // interior walking space a new road may occupy: inside the shell, not a
  // structure, not the wall itself. Excluding the cut keeps every spur on
  // this side of the wall — a paved path THROUGH a rampart line would be a
  // ladder for anything that breaches it.
  const paveable = (x, y) => {
    if (x < 1 || y < 1 || x > 48 || y > 48) return false;
    if (!walkable(terrain, x, y) || ext[idx(x, y)]) return false;
    const k = key(x, y);
    return !occupied.has(k) && !cutSet.has(k);
  };

  /** multi-source BFS out of the live network; parent chain = shortest path */
  const fieldFromNetwork = () => {
    const comp = liveNetwork();
    const prev = new Int32Array(2500).fill(-2); // -2 unseen, -1 network root
    const dist = new Int32Array(2500).fill(1 << 20);
    const q = [];
    for (const k of comp) {
      const [x, y] = k.split(",").map(Number);
      const i = idx(x, y);
      prev[i] = -1;
      dist[i] = 0;
      q.push(i);
    }
    let qi = 0;
    while (qi < q.length) {
      const i = q[qi++];
      const x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        const ni = nx + ny * 50;
        if (nx < 1 || ny < 1 || nx > 48 || ny > 48) continue;
        if (prev[ni] !== -2 || !paveable(nx, ny)) continue;
        prev[ni] = i;
        dist[ni] = dist[i] + 1;
        q.push(ni);
      }
    }
    return { prev, dist };
  };

  /** pave the parent chain from tile i back to the network (inclusive root) */
  const paveChain = (start, prev) => {
    let added = 0;
    for (let i = start; i >= 0; ) {
      if (addRoad(i % 50, (i / 50) | 0)) added++;
      if (prev[i] === -1) break;
      i = prev[i];
    }
    return added;
  };

  // ------------------------------------------------------------------
  // (0) STITCH stranded road fragments. Earlier layers pave faces (a lab
  //     face, an observer stub, a tower face) by walking downhill on the hub
  //     field, and that walk can stop one tile short of the network. The old
  //     wall ring used to swallow those fragments by accident; without it
  //     they have to be joined on purpose, or the validator's
  //     one-road-component rule (rightly) fails the room.
  // ------------------------------------------------------------------
  let stitched = 0;
  let stitchTiles = 0;
  for (let round = 0; round < 8; round++) {
    const comp = liveNetwork();
    const orphans = plan.structures.road
      .concat(newRoads)
      .filter((r) => !comp.has(key(r.x, r.y)));
    if (!orphans.length) break;
    const { prev } = fieldFromNetwork();
    let progress = false;
    for (const o of orphans) {
      const oi = idx(o.x, o.y);
      if (prev[oi] === -2) continue; // buried by structures — pruned below
      const added = paveChain(oi, prev);
      if (added) {
        progress = true;
        stitchTiles += added;
        stitched++;
      }
    }
    if (!progress) break;
  }

  // ------------------------------------------------------------------
  // (1) one spur per rampart cluster
  // ------------------------------------------------------------------
  const clusters = [];
  {
    const seen = new Set();
    for (const c of cut) {
      const k0 = key(c.x, c.y);
      if (seen.has(k0)) continue;
      seen.add(k0);
      const comp = [c];
      for (let qi = 0; qi < comp.length; qi++) {
        const cur = comp[qi];
        for (const [dx, dy] of D8) {
          const k = key(cur.x + dx, cur.y + dy);
          if (seen.has(k) || !cutSet.has(k)) continue;
          seen.add(k);
          comp.push({ x: cur.x + dx, y: cur.y + dy });
        }
      }
      clusters.push(comp);
    }
  }

  // Road tiles that exist BECAUSE a wall cluster needs an approach. The prune
  // below no longer reads this list — it re-derives the same protection from
  // the clusters themselves ("every cluster keeps ONE road touching it"), which
  // is the honest form: a spur that a later eco road made redundant is not a
  // spur any more, and a cluster an eco road happens to serve never needed one.
  // Kept as reporting only.
  const spurEnds = new Set();
  const servingRoad = (cl) => {
    for (const c of cl) {
      for (const [dx, dy] of D8) {
        const k = key(c.x + dx, c.y + dy);
        if (roadSet.has(k)) return k;
      }
    }
    return null;
  };

  let spurred = 0;
  let spurTiles = 0;
  let unreachedClusters = 0;
  let servedFree = 0;
  // biggest clusters first: the long wall segments are where defenders live,
  // and an early spur often lands close enough to serve a small one for free
  for (const cl of clusters.slice().sort((a, b) => b.length - a.length)) {
    const already = servingRoad(cl);
    if (already) {
      spurEnds.add(already);
      servedFree++;
      continue;
    }
    if (cl.length < MIN_CLUSTER) continue;
    const { prev, dist } = fieldFromNetwork();
    let best = -1;
    for (const c of cl) {
      for (const [dx, dy] of D8) {
        const x = c.x + dx,
          y = c.y + dy;
        if (x < 1 || y < 1 || x > 48 || y > 48) continue;
        const i = idx(x, y);
        if (prev[i] === -2) continue; // no interior approach at all
        if (best < 0 || dist[i] < dist[best]) best = i;
      }
    }
    if (best < 0 || dist[best] > MAX_SPUR) {
      unreachedClusters++;
      continue;
    }
    spurTiles += paveChain(best, prev);
    spurEnds.add(key(best % 50, (best / 50) | 0));
    spurred++;
  }

  // ------------------------------------------------------------------
  // (2) filler-face safety net — a ROAD on a D4 face of every extension.
  //     Layer 6 grows the mass along corridors, so this should add ~0.
  // ------------------------------------------------------------------
  const beforeFiller = newRoads.length;
  let unreachableExts = 0;
  let servedExts = 0;
  {
    const { prev, dist } = fieldFromNetwork();
    for (const e of plan.structures.extension || []) {
      if (D4.some(([dx, dy]) => roadSet.has(key(e.x + dx, e.y + dy)))) continue;
      let face = -1;
      for (const [dx, dy] of D4) {
        const x = e.x + dx,
          y = e.y + dy;
        if (x < 1 || y < 1 || x > 48 || y > 48) continue;
        const i = idx(x, y);
        if (prev[i] === -2) continue; // not in the network's interior region
        if (face < 0 || dist[i] < dist[face]) face = i;
      }
      if (face < 0) {
        unreachableExts++;
        continue;
      }
      paveChain(face, prev);
      servedExts++;
    }
  }
  const fillerTiles = newRoads.length - beforeFiller;

  // ------------------------------------------------------------------
  // (3) THE STRICT REMOVABILITY FIXPOINT.
  //
  // THE DEFECT THIS REPLACES. The old rule protected every road within D8 of
  // any structure — extensions included. Since the extension mass is grown
  // FLANKING corridors, that protected essentially every corridor tile in the
  // room by construction, and the "removability" test underneath it never got
  // a chance to fire. Measured with an independent re-derivation, 1774 of the
  // fleet's 14288 road tiles were removable without touching a single promise
  // the plan makes: whole parallel corridors survived (E18S8 ran twin
  // hub-to-controller lanes at y=18 AND y=19, 38 removable tiles in one room),
  // each of them decaying and being repaired forever for nothing.
  //
  // THE HONEST DEFINITION. A road tile may go when, after it goes:
  //   ONE NET    the road+container+sitter graph is still ONE D8 component
  //              containing the sitter, and has lost exactly this tile;
  //   STRUCTURES every structure still has a road in D8 (the validator's
  //              "no structure off the network" rule, verbatim);
  //   FILLERS    every extension still has a road on a D4 FACE (the
  //              validator's EXTROAD rule, verbatim);
  //   HAULERS    the sitter-to-container network distances are UNCHANGED —
  //              the eco lanes may not get one tile longer to save upkeep;
  //   and it is none of the four things that exist to be dead ends:
  //   swamp paving inside a corridor (a toll booth otherwise), the last road
  //   approaching a rampart cluster (the defenders' spur), the roads around
  //   the room objects (the controller ring and the eco lane ends) and the
  //   sitter's own seat.
  //
  // Everything else is upkeep with no claimant. The test repeats to fixpoint,
  // because deleting a redundant strand exposes the strand behind it, and each
  // removal re-baselines the hauler distances so the guarantee composes.
  // Deterministic row-major scan: among equally removable tiles the choice is
  // stable run to run.
  // ------------------------------------------------------------------
  const sitterK = key(plan.sitter.x, plan.sitter.y);
  const pruned = new Set();
  let nodes = new Set();

  /** the four dead-ends-by-design that are not derived from the live net */
  const staticProt = new Set([sitterK]);
  for (const [dx, dy] of D8) staticProt.add(key(plan.sitter.x + dx, plan.sitter.y + dy));
  for (const k of plan.objectTiles || []) {
    const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of D8) staticProt.add(key(x + dx, y + dy));
  }

  const facedD8 = [];
  for (const t of [
    "storage",
    "terminal",
    "link",
    "spawn",
    "tower",
    "lab",
    "nuker",
    "observer",
    "container",
    "extractor",
  ]) {
    for (const p of plan.structures[t] || []) facedD8.push(p);
  }
  const extList = plan.structures.extension || [];

  /** is this swamp tile the only way across between its own road neighbours? */
  const isTollBooth = (r, liveRoads) => {
    if (!isSwamp(terrain, r.x, r.y)) return false;
    const nb = [];
    for (const [dx, dy] of D8) {
      const k = key(r.x + dx, r.y + dy);
      if (liveRoads.has(k)) nb.push([r.x + dx, r.y + dy]);
    }
    if (nb.length < 2) return false;
    const seen = new Set([0]);
    const st = [0];
    while (st.length) {
      const c = st.pop();
      for (let j = 0; j < nb.length; j++) {
        if (seen.has(j)) continue;
        if (Math.max(Math.abs(nb[c][0] - nb[j][0]), Math.abs(nb[c][1] - nb[j][1])) === 1) {
          seen.add(j);
          st.push(j);
        }
      }
    }
    return seen.size < nb.length;
  };

  const prunePass = (extraRoads) => {
    const roadList = plan.structures.road
      .concat(newRoads, extraRoads || [])
      .filter((r) => !pruned.has(key(r.x, r.y)));
    const liveRoads = new Set(roadList.map((r) => key(r.x, r.y)));
    nodes = new Set([...liveRoads, ...containerSet, sitterK]);

    // CLAIMS on the network, maintained incrementally: each claim is the set
    // of live road tiles that currently satisfy it, and a tile that is the
    // LAST member of any claim is not removable.
    const claims = [];
    const claimants = new Map(); // roadKey -> claim indices
    const claim = (keys) => {
      const s = new Set(keys.filter((k) => liveRoads.has(k)));
      const i = claims.push(s) - 1;
      for (const k of s) {
        if (!claimants.has(k)) claimants.set(k, []);
        claimants.get(k).push(i);
      }
    };
    for (const p of facedD8) claim(D8.map(([dx, dy]) => key(p.x + dx, p.y + dy)));
    for (const e of extList) claim(D4.map(([dx, dy]) => key(e.x + dx, e.y + dy)));
    // the defenders' approach: every rampart cluster keeps ONE road touching it
    for (const cl of clusters) {
      const t = new Set();
      for (const c of cl) for (const [dx, dy] of D8) t.add(key(c.x + dx, c.y + dy));
      claim([...t]);
    }

    /** hauler distances on the road graph, sitter-rooted */
    const netDist = (skip) => {
      const d = new Map([[sitterK, 0]]);
      const q = [sitterK];
      for (let qi = 0; qi < q.length; qi++) {
        const cur = q[qi];
        const [x, y] = cur.split(",").map(Number);
        for (const [dx, dy] of D8) {
          const k = key(x + dx, y + dy);
          if (k === skip || d.has(k) || !nodes.has(k)) continue;
          d.set(k, d.get(cur) + 1);
          q.push(k);
        }
      }
      return d;
    };
    let base = netDist(null);

    const drop = (k) => {
      pruned.add(k);
      nodes.delete(k);
      liveRoads.delete(k);
      for (const i of claimants.get(k) || []) claims[i].delete(k);
    };

    const scan = roadList.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    for (let pass = 0; pass < 60; pass++) {
      let changed = false;
      for (const r of scan) {
        const k = key(r.x, r.y);
        if (!liveRoads.has(k)) continue;
        // degree 0: walled in by structures. No creep can stand on it, it
        // conducts nothing and it claims nothing — it goes even if it "serves".
        let deg = 0;
        for (const [dx, dy] of D8) if (nodes.has(key(r.x + dx, r.y + dy))) deg++;
        if (deg === 0) {
          drop(k);
          changed = true;
          continue;
        }
        if (staticProt.has(k)) continue;
        if ((claimants.get(k) || []).some((i) => claims[i].size === 1)) continue;
        if (isTollBooth(r, liveRoads)) continue;
        const after = netDist(k);
        if (after.size !== (base.has(k) ? base.size - 1 : base.size)) continue;
        let same = true;
        for (const c of containerSet) {
          if (after.get(c) !== base.get(c)) {
            same = false;
            break;
          }
        }
        if (!same) continue; // a hauler would walk further — not worth the tile
        drop(k);
        base = after;
        changed = true;
      }
      if (!changed) break;
    }
  };
  prunePass(null);

  // ------------------------------------------------------------------
  // (4) SWAMP HOLES IN A CORRIDOR. A swamp tile costs 5 fatigue where a road
  //     costs 1, so an unpaved swamp tile with corridor on either side of it
  //     is not a gap in the plan, it is a toll booth: the filler pays it every
  //     lap for the life of the room, and the tile is already inside the
  //     corridor's footprint so there is nothing to gain by leaving it bare.
  //
  //     The test is deliberately narrow. Plenty of swamp sits NEXT to roads;
  //     that is fine, nobody has to step on it. What matters is whether the
  //     road neighbours are reachable from one another WITHOUT crossing this
  //     tile — locally, inside the 3x3. If they already are, the pathfinder
  //     routes around on roads and the swamp is never walked. If they are not,
  //     this tile is the only way across and it gets paved.
  //
  //     Runs after the prune on purpose: pruning is what opens some of these
  //     holes, and a tile paved here is a genuine connector that the prune,
  //     which judges by adjacency to structures, would have deleted again.
  // ------------------------------------------------------------------
  let swampPaved = 0;
  {
    const live = new Set();
    for (const r of plan.structures.road.concat(newRoads)) {
      if (!pruned.has(key(r.x, r.y))) live.add(key(r.x, r.y));
    }
    /**
     * A hole is judged by the corridor, not by the wall. The eco lanes to the
     * source containers and the controller run OUTSIDE the shell by design
     * (m12), haulers walk them every trip, and a swamp tile in the middle of
     * one costs exactly what a swamp tile inside costs. `paveable` refuses the
     * exterior because it is written for spurs, which must never cross the
     * cut; a hole cannot sprawl anywhere by construction, since it is only a
     * hole if roads already run on both sides of it.
     */
    const holeLegal = (x, y) => {
      if (x < 1 || y < 1 || x > 48 || y > 48) return false;
      if (!walkable(terrain, x, y)) return false;
      const k = key(x, y);
      return !occupied.has(k) && !cutSet.has(k);
    };
    /** are this tile's road neighbours already joined without crossing it? */
    const isHole = (x, y) => {
      const k = key(x, y);
      if (live.has(k) || !isSwamp(terrain, x, y) || !holeLegal(x, y)) return false;
      // never onto a rampart that is not part of the shell: the wall line is a
      // gate we cross on purpose, a personal rampart is not
      if (rampartSet.has(k) && !cutSet.has(k)) return false;
      const nb = [];
      for (const [dx, dy] of D8) if (live.has(key(x + dx, y + dy))) nb.push([x + dx, y + dy]);
      if (nb.length < 2) return false;
      const seen = new Set([0]);
      const st = [0];
      while (st.length) {
        const c = st.pop();
        for (let j = 0; j < nb.length; j++) {
          if (seen.has(j)) continue;
          if (Math.max(Math.abs(nb[c][0] - nb[j][0]), Math.abs(nb[c][1] - nb[j][1])) === 1) {
            seen.add(j);
            st.push(j);
          }
        }
      }
      return seen.size < nb.length; // some neighbour is only reachable through us
    };
    // Deterministic row-major sweep, re-tested at paving time and repeated to
    // fixpoint. Both directions of interference are real: paving one hole can
    // JOIN the stubs either side of the hole next to it (which must then not
    // be paved as well — hence the re-test), and it can equally become a road
    // neighbour that turns a tile which was not a hole INTO one. A single pass
    // catches the first and misses the second.
    for (let round = 0; round < 4; round++) {
    const cands = [];
    for (let x = 1; x <= 48; x++) for (let y = 1; y <= 48; y++) if (isHole(x, y)) cands.push({ x, y });
    if (!cands.length) break;
    // A hole can be a tile the prune just took: pruning is exactly what opens
    // them. addRoad would refuse it (the tile is still in roadSet), so undo
    // the prune instead of laying a second road on the same tile.
    const paveHole = (x, y) => {
      const k = key(x, y);
      if (pruned.has(k)) {
        pruned.delete(k);
        nodes.add(k);
        return true;
      }
      return addRoad(x, y);
    };
    for (const h of cands.sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (!isHole(h.x, h.y)) continue;
      if (paveHole(h.x, h.y)) {
        live.add(key(h.x, h.y));
        swampPaved++;
      }
    }
    }
  }

  // ------------------------------------------------------------------
  // (5) PRUNE AGAIN. A paved swamp hole is a new short way across, and the
  //     road that used to be the long way round it is now redundant — the
  //     first prune could not know that because the shortcut did not exist
  //     yet. The holes protect themselves: `isTollBooth` is evaluated against
  //     the live net on every candidate, and a tile paved because something has
  //     to cross there is a toll booth by that test's own definition.
  // ------------------------------------------------------------------
  if (swampPaved) prunePass(null);

  const keptNew = newRoads.filter((r) => !pruned.has(key(r.x, r.y)));
  const removeRoads = plan.structures.road.filter((r) => pruned.has(key(r.x, r.y)));

  return {
    layer: "late-roads",
    roads: keptNew,
    removeRoads, // caller drops these from the earlier layers' road list
    wallMeta: {
      ringTiles: 0, // the ring is deliberately unpaved now
      stitched,
      stitchTiles,
      clusters: clusters.length,
      spurred,
      spurTiles,
      servedFree,
      unreachedClusters,
      fillerTiles,
      servedExts,
      pruned: pruned.size,
      swampPaved,
      unreachableExts,
      mobility,
    },
  };
}
