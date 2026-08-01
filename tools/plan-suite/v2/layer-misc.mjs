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
  // CLAIM SEAT + APPROACH — the two tiles layer 1 reserved so that
  // claimController/signController (both range 1) always have somewhere to
  // stand and a creep can always get there. See the CLAIM SEAT block in
  // layer-hub.
  //
  // THIS IS A STRUCTURE BAN, NOT AN OBSTACLE. It deliberately does NOT go into
  // `occupied`: that set doubles as the pathing mask and as the no-road mask,
  // and reserving a walkable tile there tells this layer the tile is a WALL.
  // The first cut did exactly that and E15S5 paid for it — its tower moved off
  // 34,6 onto 33,6 and then could not be stitched to the road network at all,
  // because the one tile the stitch wanted to pave was the reserved approach.
  // A creep stands on the seat; a road may run over it; only a blocking
  // STRUCTURE may not be placed on it.
  const reserved = new Set();
  if (plan.claimSeat) reserved.add(key(plan.claimSeat.x, plan.claimSeat.y));
  if (plan.claimApproach) reserved.add(key(plan.claimApproach.x, plan.claimApproach.y));
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));

  const hub = fieldFrom(terrain, plan.sitter, occupied);

  const cands = [];
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const i = idx(x, y);
      const k = key(x, y);
      if (!buildable(terrain, x, y) || ext[i]) continue;
      if (depth[i] < DEPTH_SAFE) continue;
      if (occupied.has(k) || roadSet.has(k) || reserved.has(k)) continue;
      if (hub[i] >= 9999) continue;
      cands.push({ x, y, d: hub[i] });
    }
  }
  if (cands.length < 2) return { error: `only ${cands.length} deep tiles for nuker+observer` };

  const nearRoad = (p) => D8.some(([dx, dy]) => roadSet.has(key(p.x + dx, p.y + dy)));

  // ------------------------------------------------------------------
  // THE OBSERVER DOES NOT GET TO SIT NEXT TO THE CONTROLLER.
  //
  // Layer 1 reserves exactly ONE range-1 tile of the controller as the claim
  // seat, which is what makes `claimController` possible forever. It does not
  // reserve the rest of the ring, and it should not have to: an upgrader parks
  // there, a repairer stands there, and every tile of it is worth more empty
  // than built on. The observer is the one structure in the game whose position
  // is completely irrelevant — its own placement rule is literally "takes the
  // furthest leftover tile" — and it was found sitting on the controller's ring
  // in six rooms (E11S5 7,12 · E13S5 22,31 · E16S7 18,41 · E17S8 7,37 ·
  // E9S2 25,23 · W0S5 28,7). In two of those it was on the controller's ONLY
  // walkable neighbour, so a room that ever downgraded could not have been
  // re-claimed without demolishing an observer. That is not "placed with
  // intent", and it costs nothing to fix: this is a PREFERENCE, not a veto, so
  // a room with nowhere else to put it still ships one.
  // ------------------------------------------------------------------
  const ctrlRing = new Set();
  if (plan.controller) {
    for (const [dx, dy] of D8) {
      const x = plan.controller.x + dx,
        y = plan.controller.y + dy;
      if (walkable(terrain, x, y)) ctrlRing.add(key(x, y));
    }
  }
  const offRing = (p) => !ctrlRing.has(key(p.x, p.y));

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
  const nuker =
    byNear.find((c) => offRing(c) && !seals(c, occupied)) ||
    byNear.find((c) => !seals(c, occupied)) ||
    byNear[0];
  occupied.add(key(nuker.x, nuker.y));

  // observer: needs no access, so it takes the furthest leftover tile —
  // but prefer one already served by a road so nothing is stranded.
  const byFar = cands
    .filter((c) => c !== nuker)
    .sort((a, b) => b.d - a.d || a.x - b.x || a.y - b.y);
  const observer =
    byFar.find((c) => offRing(c) && nearRoad(c) && !seals(c, occupied)) ||
    byFar.find((c) => offRing(c) && !seals(c, occupied)) ||
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
      // A DECLARATION THAT CANNOT EXCUSE ANYTHING IS NOT A DECLARATION.
      //
      // This entry used to carry `tiles: [mineral]` and no `kind`, and it was
      // unable to excuse the violation it exists for, twice over. The container
      // count failure is raised TILE-LESS (validate.mjs `fail("containers",
      // "count", ...)`), and arbitration's tiled branch requires the failure to
      // list tiles that the declaration also lists — so a tiled declaration
      // falls straight through `continue`. The tile-less branch then requires
      // `d.kind === f.kind`, and this entry named no kind at all.
      //
      // So it is filed the way the channel actually reads: kind "count",
      // tile-less, with the coordinates kept in the prose where a reader needs
      // them anyway. This only ever fires for a mineral whose whole ring is
      // natural wall — layer 4 no longer takes the last seat (layer-labs
      // keepsMineralSeat), so a room reaching here has genuinely been beaten by
      // its terrain, which is exactly what the channel is for.
      shortfalls.push({
        gate: "containers",
        kind: "count",
        source: "misc",
        detail:
          `mineral ${mineral.x},${mineral.y} has no free walkable ring tile — every one of its eight D8 ` +
          `neighbours is natural wall, off the 1..48 build band, or already carries a planned structure, ` +
          `so there is nowhere for the mineral miner to stand. No miner seat means no mineral container, ` +
          `and the room therefore ships one container short of sources+1+mineral. The extractor still ` +
          `lands on ${mineral.x},${mineral.y} (it is the one structure allowed on an object tile); what ` +
          `is lost is the buffer, so mineral output has to be hauled straight off the extractor tile.`,
      });
    }
  }

  // THE ACTUAL NETWORK TEST behind `mineralOffNetwork` below. Same conducting
  // rule the road-network check uses: roads carry, containers carry (creeps
  // walk them), and a structure is serviced if it is D8 of either. Measured
  // against the road set as it stands at the END of this layer, including the
  // roads this layer just stitched to the nuker and the observer.
  const netTiles = new Set([...roadSet, ...newRoads.map((r) => key(r.x, r.y))]);
  for (const c of plan.structures.container || []) netTiles.add(key(c.x, c.y));
  const mineralSeatNetTiles = [];
  if (mineralContainer.length) {
    const seat = mineralContainer[0];
    for (const [dx, dy] of D8) {
      const k = key(seat.x + dx, seat.y + dy);
      if (netTiles.has(k)) mineralSeatNetTiles.push(k);
    }
  }
  const mineralSeatOnNetwork = mineralSeatNetTiles.length > 0;

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
      // ------------------------------------------------------------------
      // THE MINER'S SEAT IS OFF THE ROAD NET ON PURPOSE — WHEN IT IS.
      //
      // Mineral hauling is a trickle: one deposit, a long cooldown, a hauler
      // that goes when the terminal wants it. Paving to it would cost road
      // decay forever to save a handful of ticks a week, so this layer grows
      // no road to the seat, and the omission is a published field rather than
      // a source comment nobody downstream can read.
      //
      // TWO THINGS THAT WERE WRONG ABOUT IT. The flag was set from
      // `mineralContainer.length > 0` — i.e. it asserted "off network" without
      // measuring anything, and it was therefore FALSE in 34 of 172 rooms,
      // where the seat happens to land D8 of real road: E17S6's seat at 34,18
      // touches 33,18 · 35,17 · 33,19 · 33,17, and E8S6's at 18,21 touches
      // four. This layer PREFERS a clean tile (the +0.5 at the seat search) but
      // has never refused a paved one, so "there is a container" and "it is off
      // the network" were never the same claim. It is now measured, with the
      // same conducting rule the road-network check uses: a structure is ON the
      // network if it is D8 of a live road or container.
      //
      // And the comment used to end "the validator's structures-off-network
      // check reads it". It does not, and never did — validate.mjs derives the
      // mineral seat geometrically (containers within range 1 of the mineral)
      // and exempts it on that basis alone. Nothing in the suite reads this
      // field. It is published for the human reading the plan, which is a good
      // enough reason to keep it and not a good enough reason to lie about who
      // consumes it.
      // ------------------------------------------------------------------
      mineralOffNetwork: mineralContainer.length > 0 && !mineralSeatOnNetwork,
      mineralOffNetworkWhy: !mineralContainer.length
        ? null
        : mineralSeatOnNetwork
          ? `the seat at ${mineralContainer[0].x},${mineralContainer[0].y} DOES touch the road network ` +
            `(${mineralSeatNetTiles.join(" ")}) — no road was grown to it, but the corridor another ` +
            `layer laid happens to run past it, so it is serviced like any other container`
          : "no road by design — mineral hauling is one trickle deposit on a long cooldown, " +
            "and permanent road decay to reach it costs more than the walk it saves",
      mineralSeatNetTiles,
      factory: 0,
      powerSpawn: 0,
    },
  };
}
