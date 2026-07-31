/**
 * Layer 5 — Misc singletons: NUKER + OBSERVER + EXTRACTOR.
 *
 * Deliberately short list. The owner's RCL8 program has exactly two
 * leftover buildings worth tiles:
 *   - NUKER    kept. It is the only structure that projects force off-room
 *              without a creep, and it wants to be near the hub because it
 *              eats 5k ghodium + 300k energy hauled by fillers.
 *   - OBSERVER kept. Cheap, needs no access at all, so it gets whatever
 *              deep tile is furthest from the hub.
 *   - EXTRACTOR kept (RCL6). It is the one structure that MUST sit on an
 *              object tile: an extractor is built ON the mineral, which is
 *              why C1's objectTiles ban is explicitly waived for it. It
 *              gets a container on the mineral's walkable ring (the miner's
 *              seat) and, when the mineral is outside the shell, a rampart
 *              bubble on that container. NO road: mineral hauling is a
 *              handful of trips per regeneration cycle, not an eco lane —
 *              paving one would cost more upkeep than it ever saves.
 *   - FACTORY  NEVER. Commodity chains are a different game than the one
 *              this bot plays, and the factory would eat a prime hub tile.
 *   - POWERSPAWN NEVER. Power processing is off by default in this bot.
 *
 * Both run BEFORE extensions so the flexible mass flows around them, and
 * both get a road face stitched into the network (the observer does not
 * need one to FUNCTION, but a structure nothing can walk to is a plan
 * smell and trips the suite validator).
 */
import { D4, D8, borderLegal, buildable, key, walkable } from "./shared.mjs";
import { fieldFrom } from "./layer-hub.mjs";

const DEPTH_SAFE = 4;

function idx(x, y) {
  return x + y * 50;
}

export function planMisc(terrain, plan) {
  if (!plan.shell) return { error: "misc needs a shell (layer 2 missing)" };
  const depth = plan.depth;
  const ext = plan.exterior;

  const occupied = new Set();
  for (const t of ["storage", "terminal", "link", "spawn", "container", "tower", "lab"]) {
    for (const p of plan.structures[t] || []) occupied.add(key(p.x, p.y));
  }
  occupied.add(key(plan.sitter.x, plan.sitter.y));
  for (const k of plan.objectTiles || []) occupied.add(k); // C1
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));

  const hub = fieldFrom(terrain, plan.sitter, occupied);

  const cands = [];
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const i = idx(x, y);
      const k = key(x, y);
      if (!buildable(terrain, x, y) || ext[i]) continue;
      if (depth[i] < DEPTH_SAFE) continue;
      if (occupied.has(k) || roadSet.has(k)) continue;
      if (hub[i] >= 9999) continue;
      cands.push({ x, y, d: hub[i] });
    }
  }
  if (cands.length < 2) return { error: `only ${cands.length} deep tiles for nuker+observer` };

  const nearRoad = (p) => D8.some(([dx, dy]) => roadSet.has(key(p.x + dx, p.y + dy)));

  // M4: the observer takes the FURTHEST leftover tile, which in a room with
  // a long thin interior is exactly the tile plugging the corridor to a
  // wall segment (E16S0 stranded 13 ring tiles this way). Neither singleton
  // may cost the defenders their walk to a rampart they can reach today.
  const walkRegion = (blockSet) => {
    const seen = new Set([key(plan.sitter.x, plan.sitter.y)]);
    const q = [plan.sitter];
    let qi = 0;
    while (qi < q.length) {
      const cur = q[qi++];
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        if (x < 1 || y < 1 || x > 48 || y > 48) continue;
        const k = key(x, y);
        if (seen.has(k) || blockSet.has(k)) continue;
        if (!walkable(terrain, x, y) || ext[idx(x, y)]) continue;
        seen.add(k);
        q.push({ x, y });
      }
    }
    return seen;
  };
  const baseWalk = walkRegion(occupied);
  const wallKeep = (plan.shell.cut || []).filter((c) => baseWalk.has(key(c.x, c.y)));
  // ...and neither may cost an EXISTING structure its access. E20S7 put the
  // nuker in the last gap of a tower pocket and sealed a tower plus its own
  // road face inside it: the room walk-passed, the road network could not be
  // stitched and the tower was unserviceable for the life of the room.
  const facesKeep = [];
  for (const t of ["storage", "terminal", "link", "spawn", "container", "tower", "lab"]) {
    for (const p of plan.structures[t] || []) {
      if (D8.some(([dx, dy]) => baseWalk.has(key(p.x + dx, p.y + dy)))) facesKeep.push(p);
    }
  }
  const seals = (p, occ) => {
    const trial = new Set(occ);
    trial.add(key(p.x, p.y));
    const seen = walkRegion(trial);
    if (wallKeep.some((w) => !seen.has(key(w.x, w.y)))) return true;
    return facesKeep.some((f) => !D8.some(([dx, dy]) => seen.has(key(f.x + dx, f.y + dy))));
  };

  // nuker: nearest the hub by walk — fillers haul 300k energy into it
  const byNear = cands.slice().sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
  const nuker = byNear.find((c) => !seals(c, occupied)) || byNear[0];
  occupied.add(key(nuker.x, nuker.y));

  // observer: needs no access, so it takes the furthest leftover tile —
  // but prefer one already served by a road so nothing is stranded.
  const byFar = cands
    .filter((c) => c !== nuker)
    .sort((a, b) => b.d - a.d || a.x - b.x || a.y - b.y);
  const observer =
    byFar.find((c) => nearRoad(c) && !seals(c, occupied)) ||
    byFar.find((c) => !seals(c, occupied)) ||
    byFar[0];
  occupied.add(key(observer.x, observer.y));

  // road faces, stitched to the network by hub-field descent (same pattern
  // as the tower stitching in layer-towers.mjs)
  const newRoads = [];
  const addRoad = (x, y) => {
    const k = key(x, y);
    if (roadSet.has(k) || occupied.has(k)) return;
    if (!walkable(terrain, x, y) || x < 1 || y < 1 || x > 48 || y > 48) return;
    roadSet.add(k);
    newRoads.push({ x, y });
  };
  for (const st of [nuker, observer]) {
    if (nearRoad(st)) continue;
    let face = null;
    for (const [dx, dy] of D4) {
      const x = st.x + dx,
        y = st.y + dy;
      if (!walkable(terrain, x, y) || occupied.has(key(x, y))) continue;
      if (!face || hub[idx(x, y)] < hub[idx(face.x, face.y)]) face = { x, y };
    }
    if (!face) continue;
    addRoad(face.x, face.y);
    let cur = face;
    let guard = 0;
    while (hub[idx(cur.x, cur.y)] > 0 && guard++ < 80) {
      let next = null;
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        if (!walkable(terrain, x, y) || occupied.has(key(x, y))) continue;
        if (hub[idx(x, y)] >= hub[idx(cur.x, cur.y)]) continue;
        if (!next || hub[idx(x, y)] < hub[idx(next.x, next.y)]) next = { x, y };
      }
      if (!next) break;
      if (roadSet.has(key(next.x, next.y))) break; // reached the network
      addRoad(next.x, next.y);
      cur = next;
    }
  }

  // ------------------------------------------------------------------
  // m11 — EXTRACTOR + mineral works.
  // The extractor is the deliberate exception to C1: it is built ON the
  // mineral tile. The miner's container takes the walkable ring tile
  // closest to the hub, and if the mineral sits outside the shell the
  // container gets a rampart bubble so a harasser cannot free-kill the
  // miner mid-cycle. No road, by design (see the header).
  // ------------------------------------------------------------------
  const extractor = [];
  const mineralContainer = [];
  const bubbles = [];
  const bubbleRejected = [];
  const shortfalls = [];
  const mineral = plan.mineral;
  if (mineral) {
    extractor.push({ x: mineral.x, y: mineral.y });
    let seat = null;
    for (const [dx, dy] of D8) {
      const x = mineral.x + dx,
        y = mineral.y + dy;
      if (!walkable(terrain, x, y) || x < 1 || y < 1 || x > 48 || y > 48) continue;
      const k = key(x, y);
      if (occupied.has(k)) continue;
      // hub[] is INF outside the reachable region; fall back to chebyshev so
      // a walled-off mineral still gets a seat rather than none at all
      let d = hub[idx(x, y)] < 9999 ? hub[idx(x, y)] : 9000 + Math.max(Math.abs(x - plan.sitter.x), Math.abs(y - plan.sitter.y));
      // container+road on one tile is legal in Screeps, but a clean tile is
      // preferred — three rooms have a mineral whose entire walkable ring is
      // already paved, and they would otherwise get no miner seat at all
      if (roadSet.has(k)) d += 0.5;
      // engine border rule: a seat at x/y 1 or 48 whose edge triple is not all
      // wall can never carry the miner's rampart bubble (shared.mjs borderLegal)
      if (!borderLegal(terrain, x, y, "rampart")) d += 12;
      if (!seat || d < seat.d) seat = { x, y, d };
    }
    if (seat) {
      mineralContainer.push({ x: seat.x, y: seat.y });
      occupied.add(key(seat.x, seat.y));
      const i = idx(seat.x, seat.y);
      if (ext[i] || depth[i] < DEPTH_SAFE) {
        if (borderLegal(terrain, seat.x, seat.y, "rampart")) {
          bubbles.push({ x: seat.x, y: seat.y });
        } else {
          bubbleRejected.push({ x: seat.x, y: seat.y });
        }
      }
    } else {
      shortfalls.push({
        gate: "containers",
        detail:
          `mineral ${mineral.x},${mineral.y} has no free walkable ring tile — ` +
          `no miner seat, so no mineral container`,
        tiles: [{ x: mineral.x, y: mineral.y }],
      });
    }
  }

  return {
    layer: "misc",
    nuker: [{ x: nuker.x, y: nuker.y }],
    observer: [{ x: observer.x, y: observer.y }],
    extractor,
    mineralContainer,
    bubbles, // caller pushes these onto structures.rampart
    bubbleRejected, // border-rule-illegal rampart tiles -> meta.shortfalls
    shortfalls,
    roads: newRoads,
    miscMeta: {
      nukerHubDist: nuker.d,
      observerHubDist: observer.d,
      extractor: extractor.length,
      mineralContainer: mineralContainer.length,
      mineralBubble: bubbles.length,
      factory: 0,
      powerSpawn: 0,
    },
  };
}
