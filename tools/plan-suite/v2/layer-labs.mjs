/**
 * Layer 4 — Labs (the one justified stamp)
 *
 * Reaction mechanics force the shape: both INPUT labs must be within
 * range 2 of every OUTPUT lab, and haulers need range-1 access to all 10.
 * The 4x4 diamond solves both: 10 labs wrapped around an internal
 * diagonal road — every lab touches the road, inputs sit mid-diamond.
 *
 *     L L . x        x = dropped corner
 *     L I R L        R = internal road (the diagonal)
 *     L R I L        I = input labs (range ≤2 of all 10)
 *     x . L L
 *
 * Placement is dynamic: the stamp is tried at every deep-interior anchor
 * in both diagonal orientations, scored by hauler distance from the hub,
 * and its internal road is stitched into the layer-1 network.
 */
import { D8, buildable, key, walkable } from "./shared.mjs";
import { fieldFrom } from "./layer-hub.mjs";

const DEPTH_SAFE = 4;
/**
 * What a shallow lab is worth, in tiles of hauler distance.
 *
 * Pass 1 demands all ten labs at depth >= 4 and most rooms end there. Pass 2
 * exists for the rooms where no fully-deep 4x4 pocket survives the wall-
 * reachability promise, and it used to rank purely on hauler distance — which
 * meant a diamond with four labs in the ranged band beat one with none by a
 * single tile of walk. E20S3 shipped exactly that: four labs at depth 3, four
 * personal ramparts, repaired forever, to save the lab hauler one step.
 *
 * A personal rampart is upkeep in perpetuity; a tile of hauler distance is one
 * tick per trip on a route the link network mostly retires anyway. Three tiles
 * per shallow lab is the exchange rate: it will move a diamond a short way for
 * a dry anchor and will not drag it across the room chasing depth. Pass 1 is
 * untouched, so no room that already ships ten deep labs can be reshuffled.
 */
const SHALLOW_LAB_COST = 3;

function idx(x, y) {
  return x + y * 50;
}

// offsets within the 4x4 box, main-diagonal variant
const MAIN = {
  road: [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  labs: [
    [1, 0],
    [2, 0],
    [3, 1],
    [3, 2],
    [2, 3],
    [1, 3],
    [0, 2],
    [0, 1],
    [2, 1],
    [1, 2],
  ],
  inputs: [
    [2, 1],
    [1, 2],
  ],
};
// anti-diagonal variant (mirror x)
const ANTI = {
  road: MAIN.road.map(([x, y]) => [3 - x, y]),
  labs: MAIN.labs.map(([x, y]) => [3 - x, y]),
  inputs: MAIN.inputs.map(([x, y]) => [3 - x, y]),
};

export function planLabs(terrain, plan) {
  if (!plan.shell) return { error: "labs need a shell (layer 2 missing)" };
  const depth = plan.depth;
  const ext = plan.exterior;

  const occupied = new Set();
  for (const t of ["storage", "terminal", "link", "spawn", "container", "tower"]) {
    for (const p of plan.structures[t] || []) occupied.add(key(p.x, p.y));
  }
  occupied.add(key(plan.sitter.x, plan.sitter.y));
  for (const k of plan.objectTiles || []) occupied.add(k); // C1
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));

  const hauls = fieldFrom(terrain, plan.sitter, occupied);

  // ------------------------------------------------------------------
  // THE DIAMOND IS A 4x4 PLUG, AND A PLUG CAN SEAL A DOORWAY.
  //
  // This layer used to place on hauler distance alone. In E18S2 the winning
  // anchor closed the last gap into a west-side alcove, and the two cut tiles
  // at 18,23 / 18,24 — ramparts the interior could walk to before the labs
  // landed — became wall no defender can ever stand on. Nothing downstream
  // catches it: the extension layer's M4 invariant takes its wall-reachability
  // baseline AFTER this layer runs, so a segment the labs already killed reads
  // to it as "not my problem, it was dead when I got here".
  //
  // So the diamond carries the same promise the extension mass does: every cut
  // tile the base could walk to before the stamp lands, it can walk to after.
  // Measured with the FINISHED-BASE walk (`builtMobility`'s rules): containers
  // and roads are walkable, obstacles are not, and the flood walks along the
  // cut but never through it.
  // ------------------------------------------------------------------
  const cut = plan.shell?.cut || [];
  const cutSet = new Set(cut.map((c) => key(c.x, c.y)));
  const walkBlocked = new Set(plan.objectTiles || []);
  for (const t of ["storage", "terminal", "link", "spawn", "tower"]) {
    for (const p of plan.structures[t] || []) walkBlocked.add(key(p.x, p.y));
  }
  const interiorWalk = (extraBlocked) => {
    const seen = new Set([key(plan.sitter.x, plan.sitter.y)]);
    const q = [plan.sitter];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi];
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        if (x < 0 || y < 0 || x > 49 || y > 49) continue;
        const k = key(x, y);
        if (seen.has(k) || !walkable(terrain, x, y)) continue;
        if (!cutSet.has(k) && ext[idx(x, y)]) continue;
        if (walkBlocked.has(k) || (extraBlocked && extraBlocked.has(k))) continue;
        seen.add(k);
        q.push({ x, y });
      }
    }
    return seen;
  };
  const baseWalk = interiorWalk(null);
  const wallKeep = cut.filter((c) => baseWalk.has(key(c.x, c.y)));
  /** true when this anchor strands no wall segment the base can reach today */
  const keepsTheWall = (ax, ay, variant) => {
    if (!wallKeep.length) return true;
    const stamp = new Set(variant.labs.map(([dx, dy]) => key(ax + dx, ay + dy)));
    const after = interiorWalk(stamp);
    for (const w of wallKeep) if (!after.has(key(w.x, w.y))) return false;
    return true;
  };

  let best = null;
  let fallback = null;
  let deepAnchors = 0;
  let fallbackAnchors = 0;
  let dryAnchors = 0;
  // Candidates in strict scan order, best-first by hauler distance; the
  // connectivity check runs on the winner and only walks down the list when it
  // fails, so a normal room pays exactly one extra BFS.
  const candidates = [];
  // pass 1: fully deep. pass 2 (cramped rooms): depth 3 allowed, shallow
  // lab tiles get personal ramparts — same rule as the eco bubbles.
  for (const minDepth of [DEPTH_SAFE, DEPTH_SAFE - 1]) {
    if (best) break;
    for (const variant of [MAIN, ANTI]) {
    for (let ax = 2; ax <= 44; ax++) {
      for (let ay = 2; ay <= 44; ay++) {
        let ok = true;
        // labs: buildable, deep, unoccupied, off the road network
        for (const [dx, dy] of variant.labs) {
          const x = ax + dx,
            y = ay + dy;
          const k = key(x, y);
          if (!buildable(terrain, x, y) || ext[idx(x, y)] || depth[idx(x, y)] < minDepth || occupied.has(k) || roadSet.has(k)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        // internal road: walkable + inside, may reuse existing roads
        for (const [dx, dy] of variant.road) {
          const x = ax + dx,
            y = ay + dy;
          if (!walkable(terrain, x, y) || ext[idx(x, y)] || occupied.has(key(x, y))) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        // hauler distance: nearest end of the internal road
        const ends = [variant.road[0], variant.road[3]].map(([dx, dy]) => hauls[idx(ax + dx, ay + dy)]);
        const d = Math.min(...ends);
        if (d >= 9999) continue;
        // how many of the ten sit in the ranged band and will rent a rampart.
        // Always 0 on the depth>=4 pass; the term only bites on the fallback.
        const shallow = variant.labs.filter(
          ([dx, dy]) => depth[idx(ax + dx, ay + dy)] < DEPTH_SAFE,
        ).length;
        candidates.push({
          ax,
          ay,
          variant,
          d,
          shallow,
          score: d + shallow * SHALLOW_LAB_COST,
          seq: candidates.length,
        });
      }
    }
    }
    // hauler distance priced against personal ramparts (SHALLOW_LAB_COST),
    // then hauler distance alone, then scan order — stable and explicit
    candidates.sort((a, b) => a.score - b.score || a.d - b.d || a.seq - b.seq);
    // how many anchors this pass could even see, and how many were dry — the
    // evidence behind a shallow-lab declaration further down
    if (minDepth === DEPTH_SAFE) deepAnchors = candidates.length;
    else {
      fallbackAnchors = candidates.length;
      dryAnchors = candidates.filter((c) => c.shallow === 0).length;
    }
    for (const c of candidates) {
      if (keepsTheWall(c.ax, c.ay, c.variant)) {
        best = c;
        break;
      }
    }
    // A room whose every deep diamond seals a wall segment has beaten the
    // stamp, not the check. Remember the deepest pass's plain winner and fall
    // through to depth 3; if that pass has nothing either, take the remembered
    // anchor back — 10 labs beat no labs, and a wall tile nobody can stand on
    // already has an honest channel in the shell's battlement shortfall.
    if (!best && !fallback && candidates.length) fallback = candidates[0];
    candidates.length = 0;
  }
  if (!best) best = fallback;
  if (!best) return { error: "no 4x4 pocket for the lab diamond even at depth 3" };

  const { ax, ay, variant } = best;
  const labs = variant.labs.map(([dx, dy]) => ({ x: ax + dx, y: ay + dy }));
  const inputs = variant.inputs.map(([dx, dy]) => ({ x: ax + dx, y: ay + dy }));

  // internal road + stitch nearest end into the network by field descent
  const newRoads = [];
  const addRoad = (x, y) => {
    const k = key(x, y);
    if (roadSet.has(k) || occupied.has(k)) return;
    roadSet.add(k);
    newRoads.push({ x, y });
  };
  for (const [dx, dy] of variant.road) addRoad(ax + dx, ay + dy);
  for (const lab of labs) occupied.add(key(lab.x, lab.y));
  let cur = variant.road[best.d === fieldFromEnd(hauls, ax, ay, variant, 0) ? 0 : 3];
  cur = { x: ax + cur[0], y: ay + cur[1] };
  let guard = 0;
  while (hauls[idx(cur.x, cur.y)] > 0 && guard++ < 60) {
    let next = null;
    for (const [dx, dy] of D8) {
      const x = cur.x + dx,
        y = cur.y + dy;
      if (!walkable(terrain, x, y) || occupied.has(key(x, y))) continue;
      if (hauls[idx(x, y)] >= hauls[idx(cur.x, cur.y)]) continue;
      if (!next || hauls[idx(x, y)] < hauls[idx(next.x, next.y)]) next = { x, y };
    }
    if (!next) break;
    if (roadSet.has(key(next.x, next.y))) break;
    addRoad(next.x, next.y);
    cur = next;
  }

  const shallow = labs.filter((l) => depth[idx(l.x, l.y)] < DEPTH_SAFE);

  // A LAB IN THE RANGED BAND IS DECLARED, NOT SWALLOWED. The caller ramparts
  // these tiles, so no gate fires — which is exactly why the room has to say so
  // out loud. The claim being made is "the diamond is a rigid 4x4 stamp and
  // this room has no dry pocket that fits it", and the numbers that back it are
  // the anchor census both passes measured.
  if (shallow.length && plan.meta) {
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    plan.meta.shortfalls.push({
      gate: "labs",
      kind: "shallow-lab",
      source: "labs",
      detail:
        `${shallow.length}/10 labs sit inside the ranged band (depth < ${DEPTH_SAFE}) and carry personal ` +
        `ramparts (${shallow.map((l) => `${l.x},${l.y} d${depth[idx(l.x, l.y)]}`).join(" · ")}). ` +
        `The 10-lab diamond is a rigid 4x4 stamp ` +
        `— it cannot be split or reshaped — and this enclosure offers ${deepAnchors} anchor(s) with all ` +
        `ten labs at depth >= ${DEPTH_SAFE} and ${fallbackAnchors} at depth >= ${DEPTH_SAFE - 1}, of ` +
        `which ${dryAnchors} would be fully dry. The anchor shipped was the cheapest on hauler distance ` +
        `PLUS ${SHALLOW_LAB_COST} tiles per shallow lab, so depth was priced, not ignored; ` +
        (deepAnchors === 0
          ? `no dry anchor exists at any orientation, so the ramparts are the room's verdict, not a preference`
          : `every dry anchor was refused because it seals a wall segment the garrison can walk today`) +
        `.`,
      tiles: shallow.map((l) => ({ x: l.x, y: l.y })),
    });
  }

  return {
    layer: "labs",
    lab: labs,
    labInputs: inputs,
    shallowLabs: shallow, // caller ramparts these
    roads: newRoads,
    labsMeta: {
      anchor: { x: ax, y: ay },
      haulDist: best.d,
      variant: variant === MAIN ? "main" : "anti",
      shallow: shallow.length,
      // what the depth term paid for this anchor, in tiles of hauler walk
      shallowCost: (best.shallow ?? 0) * SHALLOW_LAB_COST,
    },
  };
}

function fieldFromEnd(hauls, ax, ay, variant, endIdx) {
  const [dx, dy] = variant.road[endIdx === 0 ? 0 : 3];
  return hauls[idx(ax + dx, ay + dy)];
}
