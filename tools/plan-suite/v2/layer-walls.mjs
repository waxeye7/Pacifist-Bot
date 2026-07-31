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
 */
import { D4, D8, key, walkable } from "./shared.mjs";

/** a 1-tile rampart in a crack is not a defensive position worth a road */
const MIN_CLUSTER = 2;
/** a spur longer than this is a hike, not an approach — leave it unpaved */
const MAX_SPUR = 14;

function idx(x, y) {
  return x + y * 50;
}

export function planWallRoads(terrain, plan) {
  if (!plan.shell) return { error: "wall roads need a shell (layer 2 missing)" };
  const cut = plan.shell.cut || [];
  if (!cut.length) return { error: "shell has no cut tiles" };
  const ext = plan.exterior;

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

  // road tiles that exist BECAUSE a wall cluster needs an approach — the
  // prune pass below must not eat them (they are dead ends by design)
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
  // (3) dead-end prune. A degree-1 road tile that touches no structure, no
  //     room object and no wall spur is a tile we pay decay on for nothing.
  //     Iterate to fixpoint — pruning a tail exposes the tail behind it.
  //     Degree-1 removal can never split the network, so the one-component
  //     invariant survives by construction.
  // ------------------------------------------------------------------
  const protectedRoads = new Set(spurEnds);
  protectedRoads.add(key(plan.sitter.x, plan.sitter.y));
  const protectAround = (p) => {
    for (const [dx, dy] of D8) protectedRoads.add(key(p.x + dx, p.y + dy));
  };
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
    "container",
    "extractor",
  ]) {
    for (const p of plan.structures[t] || []) protectAround(p);
  }
  // sources / controller / mineral: the eco lanes END next to these, and the
  // thing they serve is an object, not a structure
  for (const k of plan.objectTiles || []) {
    const [x, y] = k.split(",").map(Number);
    protectAround({ x, y });
  }

  const allRoads = plan.structures.road.concat(newRoads);
  const nodes = new Set(allRoads.map((r) => key(r.x, r.y)));
  for (const k of containerSet) nodes.add(k);
  nodes.add(key(plan.sitter.x, plan.sitter.y));
  const pruned = new Set();
  for (let pass = 0; pass < 60; pass++) {
    let changed = false;
    for (const r of allRoads) {
      const k = key(r.x, r.y);
      if (pruned.has(k)) continue;
      let deg = 0;
      for (const [dx, dy] of D8) if (nodes.has(key(r.x + dx, r.y + dy))) deg++;
      // degree 0 = a tile walled in by structures. It conducts nothing and no
      // creep can stand on it: it goes even if a structure touches it.
      if (deg > 1 || (deg === 1 && protectedRoads.has(k))) continue;
      pruned.add(k);
      nodes.delete(k);
      changed = true;
    }
    if (!changed) break;
  }

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
      unreachableExts,
    },
  };
}
