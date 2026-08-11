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
import { D8, buildable, key, mineralRing, mineralSeatHolds, reservedTiles, walkable } from "./shared.mjs";
import { fieldFrom } from "./layer-hub.mjs";
import {
  boardMobility,
  boardWalkMask,
  breachesGate,
  detourFreeSet,
  MOBILITY_TARGET,
} from "./layer-shell.mjs";
// DECLARATION PROSE IS GENERATED, NOT WRITTEN — see the header of declprose.mjs.
// All three `labs` declarations used to ship a paragraph and a tile list and NO
// STRUCTURED RECORD AT ALL: the hauler distance, the anchor census and the cost
// weights existed only inside the sentences quoting them, so a reviewer could
// rewrite E13S2's "12 hauler tile(s)" to "2" — the fleet median — with nothing
// on the other side of the comparison. The records below were invented to make
// generation possible, which is the contract doing its job.
import { renderDecl } from "./declprose.mjs";

const DEPTH_SAFE = 4;
/**
 * What the diamond will pay, in tiles of hauler walk, to stop plugging the
 * defender's doorway.
 *
 * E12S3 ships an as-built gated lap of 2.25 against a 1.2 target and declares
 * it "THE ENCLOSURE AND THE TERRAIN, not the mass". Re-derived: removing the
 * lab diamond ALONE (33,17…33,19) takes the room to maxGated 0 over 0 judged
 * pairs. The whole miss is this stamp, and this layer had no mobility term of
 * any kind — the anchor was scored on hauler distance, personal ramparts and
 * eaten road, and nothing else.
 *
 * So the wall-reachability promise above (`keepsTheWall`) gains a sibling: an
 * anchor may not CREATE or WORSEN a gated-over-target pair. It is a veto and
 * not a score, for the same reason `keepsTheWall` is — but it is a veto with a
 * stated price, because the lab hauler's walk is a real recurring cost and a
 * diamond dragged across the room to save a lap is the same anti-pattern in
 * the other direction. Six tiles is the budget; past it the room keeps the
 * plugging anchor and DECLARES it with the structure named.
 */
const LAB_MOBILITY_BUDGET = 6;
/**
 * The hauler walk above which a diamond owes the reader a census.
 *
 * Fleet median is 2 and p90 is 4. E9S9 ships 17 — labs at 32,12, hub at 37,22 —
 * and every reagent load pays it forever, with no word anywhere in the plan
 * about why. A number that is an order of magnitude off the fleet is either a
 * defect or a verdict, and the difference is whether the room can show what it
 * refused. 8 is deliberately well clear of p90 so a normal room says nothing.
 */
const LAB_HAUL_NOTE = 8;
/**
 * The two fleet quantiles the declaration's paragraph compares this room against
 * — the numbers that turn "17 hauler tiles" into a statement rather than an
 * integer. They were literals INSIDE the sentence until round 13, which is the
 * exact shape of defect declprose.mjs exists to end: a comparison whose other
 * side lives only in the prose is a comparison nobody can check. They are fields
 * on the record now, and the paragraph reads them from there.
 */
const LAB_HAUL_FLEET_MEDIAN = 2;
const LAB_HAUL_FLEET_P90 = 4;
/**
 * What a shallow lab is worth, in tiles of hauler distance.
 *
 * Pass 1 demands all ten labs at depth >= 4 and most rooms end there. Pass 2
 * exists for the rooms where no fully-deep 4x4 pocket survives the wall-
 * reachability promise, and it used to rank purely on hauler distance — which
 * meant a diamond with four labs in the ranged band beat one with none by a
 * single tile of walk — four personal ramparts, repaired forever, to save the
 * lab hauler one step. (The room that shipped that board, E20S3, is not in the
 * claimable fleet any more and the figure should not be quoted as if it were —
 * and nor is its replacement a standing fact. Re-derived from the shipped
 * artifact at round 20: exactly ONE room of 172 shipped a shallow lab, and it
 * shipped one. That is the exchange rate below doing its job, at that moment.
 * Every room publishes its own count as `meta.labs.shallow`, which is where a
 * reader should go rather than to this sentence, because a count typed into a
 * comment beside the code that produces it is a count that goes stale.
 * Criticism 80.)
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
  // THE TILES NO BLOCKING STRUCTURE MAY TAKE — the controller claim seat and
  // its approach, the mineral stand and its approach, and the upgrader park
  // seats this room holds to its floor. See reservedTiles in shared.mjs.
  const reserved = reservedTiles(plan);
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));

  const hauls = fieldFrom(terrain, plan.sitter, occupied);

  // ------------------------------------------------------------------
  // THE MINERAL'S SEAT IS CLAIMED TWO LAYERS LATER, AND THE DIAMOND IS BIG
  // ENOUGH TO EAT THE WHOLE RING BEFORE IT GETS THERE.
  //
  // `occupied` above carries `plan.objectTiles` — the source, controller and
  // mineral tiles THEMSELVES — but never their rings, so nothing here knew that
  // a mineral can have exactly one walkable neighbour. E12S9's mineral at 28,28
  // is boxed in by seven natural walls and one code-3 (wall|swamp) tile; its
  // only seat is 29,27, the 4x4 stamp landed a lab on it, and layer 5's
  // `if (occupied.has(k)) continue` then correctly found nothing and filed an
  // honest "no free walkable ring tile" shortfall. The note was true and
  // useless: the ring was not full when the room started, WE filled it. The
  // room shipped 3 containers against a required 4 and failed the validator.
  //
  // Measured at round 20, 33 of the 172 rooms in this world had a 1-tile mineral
  // ring — a share of a fleet that grows, not a constant, and it is quoted as a
  // moment rather than as a standing fact (criticism 80). So this is a
  // race the fleet runs often and E12S9 is simply the one that lost it. The
  // guard is a no-op unless a stamp would empty the ring outright, so it cannot
  // reshuffle a room that has room to spare — and only the ten LAB tiles are
  // checked, never the internal road, because a container under a road is legal
  // and layer 5 already prices that seat at +0.5.
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // ...AND A SEAT NOBODY CAN WALK TO IS NOT A SEAT — THE SAME LESSON, TWICE.
  //
  // The first cut of this guard asked only whether the ring kept a FREE tile.
  // E9S9 passed it and shipped an entombed mineral anyway: the diamond left
  // 40,19 free and then the diamond, a tower and a spawn took every one of
  // 40,19's own walkable neighbours, so the surviving seat has zero passable
  // approaches and no creep in the room can ever occupy it. The controller
  // learned this already (claimSeat is reserved WITH an approach); the shared
  // predicate is the mineral's version of the same rule — see mineralSeatHolds
  // in shared.mjs.
  // ------------------------------------------------------------------
  const ring = mineralRing(terrain, plan);
  /** engine obstacles only: a container and the sitter road are walkable */
  const standBlocked = new Set(plan.objectTiles || []);
  for (const t of ["storage", "terminal", "link", "spawn", "tower"]) {
    for (const p of plan.structures[t] || []) standBlocked.add(key(p.x, p.y));
  }
  /** true when this anchor leaves the mineral a stand a creep can reach */
  const keepsMineralSeat = (ax, ay, variant) => {
    const blocked = new Set(standBlocked);
    for (const [dx, dy] of variant.labs) blocked.add(key(ax + dx, ay + dy));
    return mineralSeatHolds(terrain, plan, blocked, ring);
  };

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

  // ------------------------------------------------------------------
  // THE ROAD NETWORK IS NOT A NO-GO ZONE, IT IS A COST.
  //
  // Passes 1 and 2 veto any anchor with a planned road under one of the ten
  // labs. In a room with room to spare that veto is free. In a CRAMPED one it
  // is the whole game: E9S2 encloses 175 walkable interior tiles and layer 1
  // lays its eco kit across them, so every one of the 13 all-buildable 4x4
  // interior boxes has a road through it. The census, measured on the shipped
  // shell: at depth >= 4, 131 anchors clear terrain, exterior, depth and
  // occupancy and are killed by nothing but a road tile; with the depth term
  // dropped entirely there are still ZERO road-free anchors. The room shipped
  // `no 4x4 pocket for the lab diamond even at depth 3` — 0 labs, 0 inputs —
  // for want of tiles that a road merely wanted.
  //
  // A road is not an obstacle: it is three build ticks and 300 energy of
  // decay-repair, and this layer already lays its own diagonal plus a stitch
  // back into the net. So passes 3 and 4 let the diamond EAT roads, priced,
  // and guard the only thing that actually matters — that the network the
  // eaten tiles belonged to is still one piece afterwards and still services
  // every structure it serviced before.
  //
  // The eating passes run ONLY after both clean passes come back empty, so no
  // room that places labs today can be re-shuffled by this. That ordering is
  // deliberate: it makes the change provably a no-op on every room whose clean
  // passes find an anchor, which is very nearly the whole fleet. The rooms that
  // ate anything are exactly the rooms with a non-zero `meta.labs.roadsEaten`,
  // counted per room in the artifact rather than remembered here. (The room
  // count was typed here and is a fleet statistic that moves with the fleet;
  // round 20 deleted it. Criticism 80.)
  // ------------------------------------------------------------------
  /** what a re-routed eco road costs, in tiles of hauler walk, per tile eaten */
  const ROAD_EAT_COST = 2;

  const structTiles = [];
  for (const t of Object.keys(plan.structures)) {
    if (t === "road" || t === "rampart") continue;
    for (const p of plan.structures[t] || []) structTiles.push({ x: p.x, y: p.y });
  }
  /** D8 component of `rset` reachable from the sitter (which sits on the net) */
  const netComponent = (rset) => {
    let seed = null;
    const sk = key(plan.sitter.x, plan.sitter.y);
    if (rset.has(sk)) seed = sk;
    else
      for (const [dx, dy] of D8) {
        const k = key(plan.sitter.x + dx, plan.sitter.y + dy);
        if (rset.has(k)) {
          seed = k;
          break;
        }
      }
    const seen = new Set();
    if (!seed) return seen;
    seen.add(seed);
    const q = [seed];
    for (let qi = 0; qi < q.length; qi++) {
      const [cx, cy] = q[qi].split(",").map(Number);
      for (const [dx, dy] of D8) {
        const k = key(cx + dx, cy + dy);
        if (rset.has(k) && !seen.has(k)) {
          seen.add(k);
          q.push(k);
        }
      }
    }
    return seen;
  };
  const servicedBy = (comp, s) => {
    if (comp.has(key(s.x, s.y))) return true;
    for (const [dx, dy] of D8) if (comp.has(key(s.x + dx, s.y + dy))) return true;
    return false;
  };
  const compBefore = netComponent(roadSet);
  const servicedBefore = structTiles.filter((s) => servicedBy(compBefore, s));

  /**
   * Everything the diamond at (ax,ay) does to the road network, computed
   * WITHOUT mutating anything: the tiles it lays (its own diagonal plus the
   * stitch that reattaches it to the net) and the tiles it EATS. Pure, so the
   * guard below can price a candidate before it is chosen and the winner can
   * simply apply the result — one implementation, not two that drift.
   */
  const roadWork = (ax, ay, variant) => {
    const labKeys = variant.labs.map(([dx, dy]) => key(ax + dx, ay + dy));
    const eaten = labKeys.filter((k) => roadSet.has(k));
    const net = new Set(roadSet);
    for (const k of eaten) net.delete(k);
    const occ = new Set(occupied);
    for (const k of labKeys) occ.add(k);
    const laid = [];
    const lay = (x, y) => {
      const k = key(x, y);
      if (net.has(k) || occ.has(k)) return;
      net.add(k);
      laid.push({ x, y });
    };
    for (const [dx, dy] of variant.road) lay(ax + dx, ay + dy);
    // stitch: descend the hauler field from the cheaper end of the diagonal
    const e0 = hauls[idx(ax + variant.road[0][0], ay + variant.road[0][1])];
    const e3 = hauls[idx(ax + variant.road[3][0], ay + variant.road[3][1])];
    const off = e0 <= e3 ? variant.road[0] : variant.road[3];
    let cur = { x: ax + off[0], y: ay + off[1] };
    let guard = 0;
    while (hauls[idx(cur.x, cur.y)] > 0 && guard++ < 60) {
      let next = null;
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        if (!walkable(terrain, x, y) || occ.has(key(x, y))) continue;
        if (hauls[idx(x, y)] >= hauls[idx(cur.x, cur.y)]) continue;
        if (!next || hauls[idx(x, y)] < hauls[idx(next.x, next.y)]) next = { x, y };
      }
      if (!next) break;
      if (net.has(key(next.x, next.y))) break;
      lay(next.x, next.y);
      cur = next;
    }
    return { laid, eaten, net };
  };
  /**
   * true when eating this anchor's roads leaves the network no worse off: every
   * road tile the sitter could reach before (bar the eaten ones) it can still
   * reach, and every structure the net serviced it still services. That is the
   * validator's ROAD gate, asked before the fact instead of after it.
   */
  const keepsTheNetwork = (work) => {
    if (!work.eaten.length) return true;
    const after = netComponent(work.net);
    const gone = new Set(work.eaten);
    for (const k of compBefore) if (!gone.has(k) && !after.has(k)) return false;
    for (const s of servicedBefore) if (!servicedBy(after, s)) return false;
    return true;
  };

  // ------------------------------------------------------------------
  // ...AND THE SAME PROMISE ABOUT THE DEFENDER'S LAP. See LAB_MOBILITY_BUDGET.
  //
  // The proof is the cheap one: a set of tiles is FREE when blocking it
  // lengthens no interior walk, which `detourFreeSet` establishes from the
  // eight neighbours of each tile without touching the all-pairs metric. In an
  // open pocket that is every anchor and this guard costs nothing. Only a
  // diamond sitting in a genuine corridor pinch — which is the whole point — is
  // ever measured, and those measurements are capped.
  // ------------------------------------------------------------------
  const mobBase = plan.shell?.cut?.length ? boardMobility(terrain, plan, null) : null;
  const mobMask = mobBase ? boardWalkMask(terrain, plan) : null;
  /** how many all-pairs re-derivations one room may spend on the lap veto */
  const LAP_VETO_BUDGET = 16;
  let lapSpend = 0;
  const lapVeto = { measured: 0, provedFree: 0, refused: 0, budgetSpent: false };
  /** true when this anchor creates or worsens a gated-over-target pair */
  const breachesTheLap = (ax, ay, variant) => {
    if (!mobBase || !mobMask) return false;
    const tiles = variant.labs.map(([dx, dy]) => ({ x: ax + dx, y: ay + dy }));
    if (detourFreeSet(mobMask, tiles)) {
      lapVeto.provedFree++;
      return false;
    }
    if (lapSpend >= LAP_VETO_BUDGET) {
      lapVeto.budgetSpent = true;
      return true; // conservative: undecided counts as breaching, and is declared
    }
    lapSpend++;
    lapVeto.measured++;
    const trial = boardMobility(
      terrain,
      plan,
      tiles.map((t) => key(t.x, t.y)),
    );
    const bad = breachesGate(mobBase, trial);
    if (bad) lapVeto.refused++;
    return bad;
  };

  let best = null;
  /** the cheapest anchor of THIS pass that fails ONLY the lap veto */
  let lapRefused = null;
  /** ...and the first pass's, kept in case no pass ever produces a clean one */
  let lapFallback = null;
  /** why the anchors cheaper than the winner lost, for the haul census */
  const refusedCensus = { wall: 0, mineral: 0, network: 0, lap: 0 };
  let fallback = null;
  let deepAnchors = 0;
  let fallbackAnchors = 0;
  let dryAnchors = 0;
  // the road-eating census, for the declaration further down
  let eatAnchors = 0;
  let eatBlockedByNet = 0;
  // Candidates in strict scan order, best-first by hauler distance; the
  // connectivity check runs on the winner and only walks down the list when it
  // fails, so a normal room pays exactly one extra BFS.
  const candidates = [];
  // pass 1: fully deep. pass 2 (cramped rooms): depth 3 allowed, shallow
  // lab tiles get personal ramparts — same rule as the eco bubbles.
  // passes 3-4: the same two depths again, but the diamond may EAT planned
  // roads (see the note above). Reached only when 1 and 2 find nothing at all.
  const PASSES = [
    { minDepth: DEPTH_SAFE, eatRoads: false },
    { minDepth: DEPTH_SAFE - 1, eatRoads: false },
    { minDepth: DEPTH_SAFE, eatRoads: true },
    { minDepth: DEPTH_SAFE - 1, eatRoads: true },
  ];
  for (const pass of PASSES) {
    if (best) break;
    // the fallback remembered by the clean passes is a REAL winner (it places
    // ten labs, it just seals a wall segment); prefer it over eating roads
    if (pass.eatRoads && fallback) break;
    const { minDepth, eatRoads } = pass;
    for (const variant of [MAIN, ANTI]) {
    for (let ax = 2; ax <= 44; ax++) {
      for (let ay = 2; ay <= 44; ay++) {
        let ok = true;
        let eats = 0;
        // labs: buildable, deep, unoccupied, off the road network
        for (const [dx, dy] of variant.labs) {
          const x = ax + dx,
            y = ay + dy;
          const k = key(x, y);
          if (
            !buildable(terrain, x, y) ||
            ext[idx(x, y)] ||
            depth[idx(x, y)] < minDepth ||
            occupied.has(k) ||
            reserved.has(k)
          ) {
            ok = false;
            break;
          }
          if (roadSet.has(k)) {
            if (!eatRoads) {
              ok = false;
              break;
            }
            eats++;
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
          eats,
          score: d + shallow * SHALLOW_LAB_COST + eats * ROAD_EAT_COST,
          seq: candidates.length,
        });
      }
    }
    }
    // hauler distance priced against personal ramparts (SHALLOW_LAB_COST) and
    // against re-routed eco road (ROAD_EAT_COST), then hauler distance alone,
    // then scan order — stable and explicit
    candidates.sort((a, b) => a.score - b.score || a.d - b.d || a.seq - b.seq);
    // how many anchors this pass could even see, and how many were dry — the
    // evidence behind a shallow-lab declaration further down
    if (!eatRoads) {
      if (minDepth === DEPTH_SAFE) deepAnchors = candidates.length;
      else {
        fallbackAnchors = candidates.length;
        dryAnchors = candidates.filter((c) => c.shallow === 0).length;
      }
    } else eatAnchors = Math.max(eatAnchors, candidates.length);
    for (const c of candidates) {
      if (!keepsTheWall(c.ax, c.ay, c.variant)) {
        refusedCensus.wall++;
        continue;
      }
      if (!keepsMineralSeat(c.ax, c.ay, c.variant)) {
        refusedCensus.mineral++;
        continue;
      }
      const work = roadWork(c.ax, c.ay, c.variant);
      if (!keepsTheNetwork(work)) {
        eatBlockedByNet++;
        refusedCensus.network++;
        continue;
      }
      // ...and the lap. Everything else about this anchor is legal, so this is
      // the last question and it is the one E12S3 was never asked.
      if (breachesTheLap(c.ax, c.ay, c.variant)) {
        refusedCensus.lap++;
        if (!lapRefused) {
          c.work = work;
          lapRefused = c;
        }
        continue;
      }
      c.work = work;
      best = c;
      break;
    }
    // ------------------------------------------------------------------
    // THE VETO HAS A PRICE AND THE PRICE IS ENFORCED HERE.
    //
    // A diamond that has to walk six tiles further to stop plugging a doorway
    // is worth it; one that has to walk twenty is not, and pretending otherwise
    // would trade a measured lap for an unmeasured haul paid on every reagent
    // load forever. Past the budget the room keeps the plugging anchor and the
    // declaration below names it — which is the outcome the ruling asks for and
    // is strictly better than the silence this layer shipped.
    // ------------------------------------------------------------------
    if (best && lapRefused && best.score - lapRefused.score > LAB_MOBILITY_BUDGET) {
      best.lapTradeRefused = {
        x: lapRefused.ax,
        y: lapRefused.ay,
        d: lapRefused.d,
        cost: Math.round((best.score - lapRefused.score) * 100) / 100,
      };
      const kept = lapRefused;
      kept.lapTradeRefused = best.lapTradeRefused;
      kept.cleanAnchor = { x: best.ax, y: best.ay, d: best.d };
      kept.keptDespiteLap = true;
      best = kept;
    }
    // A pass whose every legal anchor plugs a doorway keeps its cheapest one as
    // a LAST RESORT, remembered exactly like `fallback` above so the pass ladder
    // still runs: a room may well have a clean anchor one depth down, and a lap
    // veto is not a reason to skip the search that would find it. If no later
    // pass produces anything, the remembered anchor is taken back and declared.
    if (!best && lapRefused && !lapFallback) lapFallback = lapRefused;
    lapRefused = null;
    // A room whose every deep diamond seals a wall segment has beaten the
    // stamp, not the check. Remember the deepest pass's plain winner and fall
    // through to depth 3; if that pass has nothing either, take the remembered
    // anchor back — 10 labs beat no labs, and a wall tile nobody can stand on
    // already has an honest channel in the shell's battlement shortfall.
    // ...and even the last resort prefers to leave the mineral its seat: a
    // stranded battlement is already declared elsewhere, a missing mineral
    // container is a gate nobody can excuse for it.
    if (!best && !fallback && !eatRoads && candidates.length)
      fallback =
        candidates.find((c) => keepsMineralSeat(c.ax, c.ay, c.variant)) ||
        candidates[0];
    candidates.length = 0;
  }
  if (!best && fallback) {
    fallback.work = roadWork(fallback.ax, fallback.ay, fallback.variant);
    best = fallback;
  }
  // TEN LABS BEAT NO LABS, HERE TOO. The lap veto is the last guard to give way
  // — after the wall promise and the mineral seat have both already fallen back
  // — and when it does, it gives way loudly (see the declaration below).
  if (!best && lapFallback) {
    best = lapFallback;
    best.keptDespiteLap = true;
    best.lapNoAlternative = true;
  }
  if (!best)
    return {
      error:
        "no 4x4 pocket for the lab diamond even at depth 3, with or without eating planned roads",
    };

  const { ax, ay, variant } = best;
  const labs = variant.labs.map(([dx, dy]) => ({ x: ax + dx, y: ay + dy }));
  const inputs = variant.inputs.map(([dx, dy]) => ({ x: ax + dx, y: ay + dy }));

  // apply the road work the guard already computed — internal diagonal, the
  // stitch back into the network, and the eco road tiles the ten labs displace
  const newRoads = best.work.laid;
  const eatenRoads = best.work.eaten.map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  });
  for (const k of best.work.eaten) roadSet.delete(k);
  for (const r of newRoads) roadSet.add(key(r.x, r.y));
  for (const lab of labs) occupied.add(key(lab.x, lab.y));

  const shallow = labs.filter((l) => depth[idx(l.x, l.y)] < DEPTH_SAFE);

  // A LAB IN THE RANGED BAND IS DECLARED, NOT SWALLOWED. The caller ramparts
  // these tiles, so no gate fires — which is exactly why the room has to say so
  // out loud. The claim being made is "the diamond is a rigid 4x4 stamp and
  // this room has no dry pocket that fits it", and the numbers that back it are
  // the anchor census both passes measured.
  if (shallow.length && plan.meta) {
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    const sfShallowLab = {
      gate: "labs",
      kind: "shallow-lab",
      source: "labs",
      detail: "",
      tiles: shallow.map((l) => ({ x: l.x, y: l.y })),
      labs: {
        shallow: shallow.map((l) => ({ x: l.x, y: l.y, depth: depth[idx(l.x, l.y)] })),
        total: labs.length,
        depthSafe: DEPTH_SAFE,
        deepAnchors,
        fallbackAnchors,
        dryAnchors,
        shallowLabCost: SHALLOW_LAB_COST,
      },
    };
    sfShallowLab.detail = renderDecl(sfShallowLab);
    plan.meta.shortfalls.push(sfShallowLab);
  }

  // ------------------------------------------------------------------
  // THE DIAMOND THAT PLUGS THE DOORWAY SAYS SO, WITH THE STRUCTURE NAMED.
  //
  // This is the E12S3 channel. The room ships an over-target defender lap whose
  // entire cause is these ten tiles, and the mobility declaration in layer 7 now
  // names the class (the lift test) — but the layer that CHOSE the tiles is the
  // one that can say what else was on offer and what it would have cost, so it
  // says it here and layer 7's declaration is the verdict.
  // ------------------------------------------------------------------
  if (best.keptDespiteLap && plan.meta) {
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    plan.meta.shortfalls.push({
      gate: "mobility",
      kind: "placement",
      source: "labs",
      detail:
        `the LAB DIAMOND at anchor ${ax},${ay} creates or worsens a gated-over-target defender pair on ` +
        `this layer's board — the room laps ${mobBase ? mobBase.maxGated : "?"} against a ` +
        `${MOBILITY_TARGET} target with the ten tiles empty — and it is shipped anyway. ` +
        (best.lapNoAlternative
          ? `No anchor in this enclosure clears the veto at any orientation or depth this layer searches: ` +
            `${lapVeto.refused} anchor(s) were measured and refused, ${lapVeto.provedFree} more were ` +
            `proved to change no interior distance at all and lost on other grounds` +
            (lapVeto.budgetSpent
              ? `, and the ${LAP_VETO_BUDGET}-measurement budget was exhausted, after which an undecided ` +
                `anchor counts as breaching — the conservative direction`
              : ``) +
            `. The diamond is a rigid 4x4 stamp; ten labs beat no labs, so the room takes the lap.`
          : `A clean anchor DOES exist, at ${best.cleanAnchor.x},${best.cleanAnchor.y} (hauler distance ` +
            `${best.cleanAnchor.d} against this one's ${best.d}), and it was REFUSED because it costs ` +
            `${best.lapTradeRefused.cost} tile(s) of hauler walk — over the ${LAB_MOBILITY_BUDGET}-tile ` +
            `budget this veto is priced at. Every reagent load pays hauler distance forever; the lap is ` +
            `declared here and in layer 7's mobility entry, and the trade is written down so it can be ` +
            `argued with.`),
      tiles: labs.map((l) => ({ x: l.x, y: l.y })),
    });
  }

  // ------------------------------------------------------------------
  // A HAUL DISTANCE AN ORDER OF MAGNITUDE OFF THE FLEET OWES A CENSUS.
  //
  // E9S9's diamond sits 17 hauler tiles from the hub against a fleet median of
  // 2 and a p90 of 4 — labs at 32,12, hub at 37,22 — and every reagent load pays
  // it forever. The number was published (`labsMeta.haulDist`) and nothing said
  // whether it was a defect or a verdict. The difference is exactly whether the
  // room can show what it refused, so here is the refusal census: the anchors
  // this layer walked past on its way out to 17, and which guard killed each.
  // ------------------------------------------------------------------
  if (best.d >= LAB_HAUL_NOTE && plan.meta) {
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    // THE FLEET QUANTILES ARE FIELDS, not two integers typed into a sentence.
    // "the fleet median is 2 and p90 is 4" is the comparison that makes the
    // room's own number mean anything, and it was a pair of literals inside the
    // string — so the paragraph could quote whichever median made this room look
    // best and nothing would notice.
    const sfHaul = {
      gate: "labs",
      kind: "lab-haul",
      source: "labs",
      detail: "",
      tiles: [{ x: ax, y: ay }],
      labs: {
        haulDist: best.d,
        anchor: { x: ax, y: ay },
        orientation: variant === MAIN ? "main" : "anti",
        fleetMedian: LAB_HAUL_FLEET_MEDIAN,
        fleetP90: LAB_HAUL_FLEET_P90,
        refused: {
          wall: refusedCensus.wall,
          mineral: refusedCensus.mineral,
          network: refusedCensus.network,
          lap: refusedCensus.lap,
        },
        deepAnchors,
        fallbackAnchors,
        depthSafe: DEPTH_SAFE,
        shallowLabCost: SHALLOW_LAB_COST,
        roadEatCost: ROAD_EAT_COST,
      },
    };
    sfHaul.detail = renderDecl(sfHaul);
    plan.meta.shortfalls.push(sfHaul);
  }

  // A DIAMOND THAT ATE ECO ROAD SAYS SO. The room ships all ten labs and no
  // gate fires — the network is re-derived whole by the guard above — but a
  // layer-1 road tile was displaced, which is a real (small) cost paid on the
  // route it served, and it is exactly the kind of thing that should not be
  // discoverable only by diffing two runs.
  if (eatenRoads.length && plan.meta) {
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    // THE RECORD IS THE ONLY WITNESS HERE, and that is why it has to exist. The
    // displaced tiles are DELETED from the plan by the time it ships, so the
    // finished board carries no trace of them — this kind is the one named
    // exemption in validate.mjs's obligation inventory for exactly that reason.
    const sfEat = {
      gate: "labs",
      kind: "lab-road-eat",
      source: "labs",
      detail: "",
      tiles: eatenRoads,
      labs: {
        eaten: eatenRoads.length,
        deepAnchors,
        fallbackAnchors,
        depthSafe: DEPTH_SAFE,
        eatAnchors,
        eatBlockedByNet,
        roadEatCost: ROAD_EAT_COST,
      },
    };
    sfEat.detail = renderDecl(sfEat);
    plan.meta.shortfalls.push(sfEat);
  }

  return {
    layer: "labs",
    lab: labs,
    labInputs: inputs,
    shallowLabs: shallow, // caller ramparts these
    roads: newRoads,
    // eco road the ten labs sit on top of — the caller deletes these, because a
    // road under a blocking structure conducts nothing and the validator says so
    removeRoads: eatenRoads,
    labsMeta: {
      anchor: { x: ax, y: ay },
      roadsEaten: eatenRoads.length,
      haulDist: best.d,
      variant: variant === MAIN ? "main" : "anti",
      shallow: shallow.length,
      // what the depth term paid for this anchor, in tiles of hauler walk
      shallowCost: (best.shallow ?? 0) * SHALLOW_LAB_COST,
      // what the road term paid, same units
      roadEatCost: (best.eats ?? 0) * ROAD_EAT_COST,
      // THE LAP VETO, PUBLISHED — see LAB_MOBILITY_BUDGET and the E12S3 note.
      lapVeto: {
        target: MOBILITY_TARGET,
        baseLap: mobBase ? mobBase.maxGated : null,
        measured: lapVeto.measured,
        provedFree: lapVeto.provedFree,
        refused: lapVeto.refused,
        budget: LAP_VETO_BUDGET,
        budgetSpent: lapVeto.budgetSpent,
        kept: !!best.keptDespiteLap,
        noAlternative: !!best.lapNoAlternative,
        cleanAnchor: best.cleanAnchor || null,
        tradeCost: best.lapTradeRefused ? best.lapTradeRefused.cost : null,
      },
      // ...and why the anchors cheaper than this one lost, which is the only
      // evidence a haul-distance declaration can be made of
      refusedCheaper: { ...refusedCensus },
    },
  };
}
