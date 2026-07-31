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
 *   (0) CORRIDOR BREACH — the one pass that MOVES a structure. See the header
 *       on breachCorridors below: the extension mass is grown for density and
 *       filler-tour length, and in ~60 rooms it closes the last lateral lane
 *       across the base, so the garrison walks in to the hub and back out
 *       while the attacker cuts straight across outside. This pass reopens the
 *       lane by relocating the one or two extensions standing in it. It runs
 *       FIRST, so the spur/face/prune passes below see the final mass.
 */
import { D4, D8, buildable, engineBuildable, isSwamp, key, walkable } from "./shared.mjs";
import { fieldFrom } from "./layer-hub.mjs";
import {
  BUILT_OBSTACLES,
  MOBILITY_TARGET,
  interiorWalk,
  maskFromKeys,
  mobilityStats,
} from "./layer-shell.mjs";

/** a 1-tile rampart in a crack is not a defensive position worth a road */
const MIN_CLUSTER = 2;
/** a spur longer than this is a hike, not an approach — leave it unpaved */
const MAX_SPUR = 14;
/** shell doctrine: depth < 4 is inside ranged-attacker reach */
const DEPTH_SAFE = 4;
/** how many extensions one breach may move. Past this it is a redesign. */
const BREACH_MAX_EXT = 4;
/** worst-pair fixes attempted per room */
const BREACH_ROUNDS = 8;
/** a breach must buy back this share of the detour or it is not worth moving */
const BREACH_RESTORE = 0.6;
/**
 * Road tiles one room's breaches may spend in total (see homesFor).
 *
 * Deliberately BELOW the 6-tile ceiling this pass is allowed. The price is an
 * estimate — the filler-face net lays the actual chain later, after the spur
 * pass has moved the network, and when two rehousings share a corridor it can
 * come out a few tiles longer than either was quoted (E11S7: quoted 4, paved
 * 7). Budgeting 3 keeps the MEASURED fleet-worst at +3 road tiles per room,
 * which is what the gate is really about; the ceiling is not a target.
 */
const BREACH_ROAD_BUDGET = 3;
/** fleet gate: no extension may sit further than this from the hub by walk */
const HUB_REACH_HARD = 16;

function idx(x, y) {
  return x + y * 50;
}

/**
 * ------------------------------------------------------------------------
 * CORRIDOR BREACH — "the attacker walks 10, I refuse to walk 20."
 * ------------------------------------------------------------------------
 *
 * THE DEFECT. The shell negotiates its cut against an EMPTY interior, so the
 * ratio it ships is the lap of the room, not the lap of the base. Re-measured
 * on the finished plan (meta.shell.mobilityBuilt), 70 rooms' worst wall pair
 * is slower because of our own mass. The reason is structural, not sloppy:
 * the extension layer grows ribs off the road network out of the hub, so the
 * corridor topology it produces is a STAR. Crossing the base laterally means
 * walking in to the storage and back out again, while the attacker walks the
 * chord outside. Measured worst case: E20S7, attacker 5, defender 24.
 *
 * WHY IT IS FIXED HERE AND NOT THERE. The extension layer cannot see this. It
 * places one tile at a time under a connectivity invariant that only asks "is
 * everything still reachable", and every single tile it lays passes that test —
 * the lane closes on the last one, and by then the mass is a fait accompli.
 * The lap is a property of the FINISHED base, so it can only be measured once
 * the base is finished. This is not a repair-loop layer patching layer 6's
 * mistakes: layer 6 made no mistake, it optimised a different objective, and
 * this pass is the one place where both objectives are on the table at once.
 *
 * WHAT IT SPENDS. One to four extensions RELOCATED — never deleted, never
 * demoted: 60/60 is untouchable, the destination must be deep (a personal
 * rampart is forever upkeep and mobility does not get to buy one), it must
 * already have a road on a D4 face (so the breach costs ZERO road tiles), and
 * it may not sit further from the hub than the room's own worst extension
 * already does. The vacated tile is left bare — a road there would buy
 * nothing the metric counts and cost decay forever.
 *
 * WHAT IT REFUSES. Anything that touches the hub kit, the labs, the towers or
 * the eco works; any move that strands a wall tile, a road or a structure face
 * the base can reach today; any breach that does not buy back BREACH_RESTORE
 * of the detour. And it stops the moment the room is inside the target — this
 * is a mobility pass, not a rearrangement hobby.
 */
function breachCorridors(terrain, plan) {
  const cut = plan.shell.cut || [];
  const extensions = plan.structures.extension || [];
  const meta = { rounds: 0, moved: 0, bricked: 0, before: 0, after: 0, stop: "target", pairs: [] };
  if (!cut.length || !extensions.length || !plan.depth) return meta;

  const ext = plan.exterior;
  const depth = plan.depth;
  const cutSet = new Set(cut.map((c) => key(c.x, c.y)));
  const objTiles = new Set(plan.objectTiles || []);
  /** everything the finished base blocks EXCEPT the extension mass */
  const fixedBlocked = new Set(objTiles);
  for (const t of BUILT_OBSTACLES) {
    if (t === "extension") continue;
    for (const p of plan.structures[t] || []) fixedBlocked.add(key(p.x, p.y));
  }
  /** live, mutable: the extension tiles as they stand right now */
  const extKeys = new Set(extensions.map((e) => key(e.x, e.y)));
  /** tiles this pass emptied — the only ones allowed to shed a rampart */
  const vacated = new Set();
  const blockedNow = () => new Set([...fixedBlocked, ...extKeys]);
  const walkNow = () => interiorWalk(terrain, cutSet, ext, blockedNow(), plan.sitter);

  // roads and containers never block, but they do have to stay REACHABLE —
  // a road inside a pocket is a road nothing can build or repair
  const roadKeys = plan.structures.road.map((r) => key(r.x, r.y));
  const containerKeys = (plan.structures.container || []).map((c) => key(c.x, c.y));
  const roadSetLive = new Set(roadKeys);
  /** structures that are not extensions and want a walkable D8 face */
  const facedFixed = [];
  for (const t of BUILT_OBSTACLES) {
    if (t === "extension") continue;
    for (const p of plan.structures[t] || []) facedFixed.push(p);
  }
  for (const c of plan.structures.container || []) facedFixed.push(c);

  // ---- the baseline promise: whatever the base can walk to today, it keeps
  const walk0 = walkNow();
  const keepCut = cut.filter((c) => walk0.has(key(c.x, c.y))).map((c) => key(c.x, c.y));
  const keepRoad = [...roadKeys, ...containerKeys].filter((k) => walk0.has(k));
  const keepFace = facedFixed.filter((p) =>
    D8.some(([dx, dy]) => walk0.has(key(p.x + dx, p.y + dy))),
  );

  // ---- build-order field, reproduced exactly as layer 6 derived it, so a
  //      room this pass does not touch re-sorts to the identical array
  const orderBlocked = new Set(objTiles);
  for (const t of [
    "storage",
    "terminal",
    "link",
    "spawn",
    "container",
    "tower",
    "lab",
    "nuker",
    "observer",
  ]) {
    for (const p of plan.structures[t] || []) orderBlocked.add(key(p.x, p.y));
  }
  const hubField = fieldFrom(terrain, plan.sitter, orderBlocked);
  // A rehousing may sit two steps further out than the room's own furthest
  // extension already does, and never past HUB_REACH_HARD — that number is the
  // fleet gate, and a filler tour is measured by its longest leg. Two steps is
  // the smallest slack that unlocks the dense rooms; without it a room whose
  // mass is packed to its own cap has literally nowhere legal to put anything.
  const hubCap = Math.min((plan.meta?.extensions?.maxHubDist ?? 9999) + 2, HUB_REACH_HARD);

  /** does a trial mass keep every promise above? */
  const promisesHold = (trialExtKeys) => {
    const blocked = new Set([...fixedBlocked, ...trialExtKeys]);
    const walk = interiorWalk(terrain, cutSet, ext, blocked, plan.sitter);
    for (const k of keepCut) if (!walk.has(k)) return null;
    for (const k of keepRoad) if (!walk.has(k)) return null;
    for (const p of keepFace) {
      if (!D8.some(([dx, dy]) => walk.has(key(p.x + dx, p.y + dy)))) return null;
    }
    // every extension keeps a walkable D4 face — the filler stands on it
    for (const k of trialExtKeys) {
      const [x, y] = k.split(",").map(Number);
      if (!D4.some(([dx, dy]) => walk.has(key(x + dx, y + dy)))) return null;
    }
    return walk;
  };

  /** 2x2 of extensions has no interior face — a brick, not density */
  const makesSquare = (x, y, set) => {
    for (const [ox, oy] of [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1],
    ]) {
      let n = 0;
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          const px = x + ox + dx,
            py = y + oy + dy;
          if ((px === x && py === y) || set.has(key(px, py))) n++;
        }
      }
      if (n === 4) return true;
    }
    return false;
  };

  /**
   * Legal homes for a displaced extension, cheapest hub distance first.
   *
   * TWO TIERS, and the order between them is the whole economy of this pass.
   * Tier 0 already has a road on a D4 face, so rehousing there costs NOTHING —
   * no road tile, no upkeep, the filler tour absorbs it. Tier 1 does not, and
   * the filler-face net below will have to pave one in. Tier 1 is what the
   * dense rooms actually need (28 of the 45 rooms an earlier cut of this pass
   * could not help had no tier-0 slot left at all), so it is allowed — but
   * PRICED, not merely counted. `paveCost` is the length of the chain the net
   * will lay, derived the same way the net derives it, and the room may spend
   * BREACH_ROAD_BUDGET tiles across all its breaches. Counting homes instead of
   * tiles let E9S6 buy twelve road tiles with three "cheap" rehousings.
   *
   * Deterministic: row-major scan, sorted by (cost, hub distance, y, x).
   */
  let roadSpent = 0;
  /** tiles that must be paved to reach t from the live network, t included */
  const paveField = () => {
    const d = new Int32Array(2500).fill(-1);
    const q = [];
    const free = (x, y) => {
      if (x < 1 || y < 1 || x > 48 || y > 48) return false;
      if (!walkable(terrain, x, y) || ext[idx(x, y)]) return false;
      const k = key(x, y);
      return !fixedBlocked.has(k) && !extKeys.has(k) && !cutSet.has(k) && !roadSetLive.has(k);
    };
    // seed from the LIVE network only — the component that actually contains
    // the sitter. A stranded road fragment is not somewhere the filler net will
    // pave from, and pricing against one understates the chain (E11S7 bought
    // seven road tiles on a five-tile budget that way).
    const live = new Set([key(plan.sitter.x, plan.sitter.y)]);
    {
      const conduct = new Set([...roadSetLive, ...containerKeys, key(plan.sitter.x, plan.sitter.y)]);
      const q = [plan.sitter];
      for (let qi = 0; qi < q.length; qi++) {
        const cur = q[qi];
        for (const [dx, dy] of D8) {
          const nx = cur.x + dx,
            ny = cur.y + dy;
          const k = key(nx, ny);
          if (live.has(k) || !conduct.has(k)) continue;
          live.add(k);
          q.push({ x: nx, y: ny });
        }
      }
    }
    for (const k of live) {
      const [rx, ry] = k.split(",").map(Number);
      for (const [dx, dy] of D8) {
        const nx = rx + dx,
          ny = ry + dy;
        if (!free(nx, ny)) continue;
        const ni = nx + ny * 50;
        if (d[ni] >= 0) continue;
        d[ni] = 1;
        q.push(ni);
      }
    }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      const x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (!free(nx, ny)) continue;
        const ni = nx + ny * 50;
        if (d[ni] >= 0) continue;
        d[ni] = d[i] + 1;
        q.push(ni);
      }
    }
    return d;
  };
  const homesFor = (forbidden) => {
    const pave = paveField();
    const out = [];
    for (let y = 2; y <= 47; y++) {
      for (let x = 2; x <= 47; x++) {
        const i = idx(x, y);
        const k = key(x, y);
        if (ext[i] || depth[i] < DEPTH_SAFE) continue; // outside, or shallow
        if (!buildable(terrain, x, y) || !engineBuildable(terrain, x, y, "extension")) continue;
        if (extKeys.has(k) || fixedBlocked.has(k) || cutSet.has(k)) continue;
        if (roadSetLive.has(k) || forbidden.has(k)) continue;
        if (hubField[i] > hubCap) continue; // never past the room's own reach
        let cost = Infinity;
        for (const [dx, dy] of D4) {
          const fx = x + dx,
            fy = y + dy;
          if (fx < 1 || fy < 1 || fx > 48 || fy > 48) continue;
          if (roadSetLive.has(key(fx, fy))) {
            cost = 0;
            break;
          }
          const fd = pave[idx(fx, fy)];
          if (fd >= 0 && fd < cost) cost = fd;
        }
        if (!isFinite(cost) || roadSpent + cost > BREACH_ROAD_BUDGET) continue;
        out.push({ x, y, d: hubField[i], cost });
      }
    }
    out.sort((a, b) => a.cost - b.cost || a.d - b.d || a.y - b.y || a.x - b.x);
    return out;
  };

  /**
   * Shortest lane from a to b that crosses at most `cap` extensions, as a
   * layered BFS over (tile, extensions spent). Uniform edge cost, so plain
   * BFS is exact; the layer index is what makes "one more extension buys a
   * shorter walk" answerable at all.
   */
  const lane = (a, b, cap) => {
    const W = 2500;
    const dist = new Int32Array(W * (cap + 1)).fill(-1);
    const prev = new Int32Array(W * (cap + 1)).fill(-1);
    const passable = (x, y) => {
      const k = key(x, y);
      if (!walkable(terrain, x, y)) return 0;
      if (!cutSet.has(k) && ext[idx(x, y)]) return 0;
      if (fixedBlocked.has(k)) return 0;
      return extKeys.has(k) ? 2 : 1; // 2 = costs one extension
    };
    const s = idx(a.x, a.y);
    if (!passable(a.x, a.y)) return null;
    dist[s] = 0;
    const q = [s];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi];
      const u = (cur / W) | 0,
        i = cur % W;
      const x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        const p = passable(nx, ny);
        if (!p) continue;
        const nu = u + (p === 2 ? 1 : 0);
        if (nu > cap) continue;
        const ns = nu * W + nx + ny * 50;
        if (dist[ns] >= 0) continue;
        dist[ns] = dist[cur] + 1;
        prev[ns] = cur;
        q.push(ns);
      }
    }
    // best over every layer, fewest extensions winning ties
    const bi = idx(b.x, b.y);
    let bestS = -1;
    for (let u = 0; u <= cap; u++) {
      const s2 = u * W + bi;
      if (dist[s2] < 0) continue;
      if (bestS < 0 || dist[s2] < dist[bestS]) bestS = s2;
    }
    if (bestS < 0) return null;
    const tiles = [];
    for (let s2 = bestS; s2 >= 0; s2 = prev[s2]) tiles.push(s2 % W);
    tiles.reverse();
    return {
      steps: dist[bestS],
      tiles,
      exts: tiles
        .filter((i) => extKeys.has(key(i % 50, (i / 50) | 0)))
        .map((i) => ({ x: i % 50, y: (i / 50) | 0 })),
    };
  };

  // ------------------------------------------------------------------
  // THE LOOP: fix the worst pair, re-measure, repeat.
  //
  // It does NOT stop the first time the room's max fails to fall. Breaching
  // the worst pair often hands the title to a different pair at the same
  // ratio, and that one is frequently breachable too — stopping there left
  // half the fleet's structure detours on the table. What it stops on is a
  // pair it has already tried and failed to shorten (chasing its own tail)
  // and, of course, the target.
  // ------------------------------------------------------------------
  const extMask = ext;
  let m = mobilityStats(cut, extMask, maskFromKeys(walk0));
  meta.before = m.max;
  meta.after = m.max;
  const tried = new Set();
  /** every tile of every lane this pass has already bought */
  const openLanes = new Set();
  for (let round = 0; round < BREACH_ROUNDS; round++) {
    if (m.max <= MOBILITY_TARGET || !m.worst) {
      meta.stop = "target";
      break;
    }
    meta.stop = "rounds-spent";
    const { a, b, din } = m.worst;
    const pairK = `${a.x},${a.y}|${b.x},${b.y}|${din}`;
    if (tried.has(pairK)) {
      meta.stop = "same-pair"; // this walk is as short as the mass allows
      break;
    }
    tried.add(pairK);
    meta.rounds++;
    const free = lane(a, b, BREACH_MAX_EXT);
    if (!free || free.steps >= din) {
      meta.stop = "not-the-mass"; // no lane through the mass is shorter
      break;
    }
    // the cheapest breach that buys back BREACH_RESTORE of the detour
    const want = din - BREACH_RESTORE * (din - free.steps);
    let chosen = null;
    for (let cap = 1; cap <= BREACH_MAX_EXT; cap++) {
      const L = lane(a, b, cap);
      if (L && L.steps <= want) {
        chosen = L;
        break;
      }
    }
    if (!chosen || !chosen.exts.length) {
      meta.stop = "breach-too-dear"; // no lane within the extension cap earns it
      break;
    }

    // relocate, one extension at a time, rolling the whole breach back if any
    // single move cannot be housed legally. Every lane opened so far stays
    // forbidden for the rest of the room: without that, round 3 can rehouse an
    // extension into the lane round 1 paid for and hand the detour straight
    // back.
    for (const i of chosen.tiles) openLanes.add(key(i % 50, (i / 50) | 0));
    const forbidden = openLanes;
    const undo = [];
    let ok = true;
    for (const e of chosen.exts) {
      const from = key(e.x, e.y);
      let landed = false;
      const homes = homesFor(forbidden);
      // TWO SWEEPS, and the second one is the same escape hatch layer 6 keeps
      // for its own last extensions. A 2x2 of extensions has no face between
      // its inner tiles, which is why neither layer builds one by choice — but
      // the objection is about SERVICING, and every home here carries a road on
      // a D4 face (tier 0 already has one, tier 1 gets one from the filler-face
      // net below), so the filler still works the block from a lane. Rule:
      // never brick while a non-brick slot exists anywhere in the room.
      for (const allowSquare of [false, true]) {
        for (const h of homes) {
          const to = key(h.x, h.y);
          const trial = new Set(extKeys);
          trial.delete(from);
          if (makesSquare(h.x, h.y, trial) && !allowSquare) continue;
          trial.add(to);
          if (!promisesHold(trial)) continue;
          extKeys.delete(from);
          extKeys.add(to);
          roadSpent += h.cost;
          vacated.add(from);
          vacated.delete(to);
          undo.push([from, to]);
          const slot = extensions.findIndex((q) => q.x === e.x && q.y === e.y);
          extensions[slot] = { x: h.x, y: h.y };
          landed = true;
          meta.moved++;
          meta.bricked += allowSquare ? 1 : 0;
          break;
        }
        if (landed) break;
      }
      if (!landed) {
        ok = false;
        meta.stop = "no-home"; // nowhere legal and deep to rehouse it
        break;
      }
    }
    if (!ok) {
      for (const [from, to] of undo.reverse()) {
        extKeys.delete(to);
        extKeys.add(from);
        vacated.delete(from);
        const [fx, fy] = from.split(",").map(Number);
        const [tx, ty] = to.split(",").map(Number);
        const slot = extensions.findIndex((q) => q.x === tx && q.y === ty);
        extensions[slot] = { x: fx, y: fy };
        meta.moved--;
      }
      break;
    }
    meta.pairs.push({
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      din,
      breach: chosen.steps,
      moved: chosen.exts.length,
    });
    const w = walkNow();
    m = mobilityStats(cut, extMask, maskFromKeys(w));
    meta.after = m.max;
  }

  meta.roadSpent = roadSpent;

  // ---- DECLARE WHAT IS LEFT. The shell already files a mobility shortfall
  //      against the lap it NEGOTIATED; this one is about the lap we actually
  //      built, and it only speaks when the mass is still the reason and this
  //      pass could not take it away. Silent capping is the anti-pattern; a
  //      number the reader can check against meta.walls.breach is not.
  if (m.max > MOBILITY_TARGET && m.worst && plan.meta) {
    const why = {
      "no-home":
        `every lane through the mass needs an extension moved and the room has no legal deep ` +
        `slot left to move it to (60/60 is not negotiable and mobility may not buy a personal rampart)`,
      "not-the-mass":
        `no lane through the extension mass is shorter — what is in the way is the hub kit, the lab ` +
        `diamond or a tower, and none of those may be relocated for a lap`,
      "breach-too-dear": `no lane crossing ${BREACH_MAX_EXT} extensions or fewer buys back ${Math.round(
        BREACH_RESTORE * 100,
      )}% of the detour`,
      "same-pair": `the lane is already as short as the mass allows`,
      "rounds-spent": `the ${BREACH_ROUNDS}-fix budget for one room ran out`,
      target: `inside the target`,
    }[meta.stop];
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    plan.meta.shortfalls.push({
      gate: "mobility",
      detail:
        `AS BUILT the defender lap is ${m.max} (target ${MOBILITY_TARGET}): between wall tiles ` +
        `${m.worst.a.x},${m.worst.a.y} and ${m.worst.b.x},${m.worst.b.y} the garrison walks ` +
        `${m.worst.din} inside while the attacker walks ${m.worst.dout} outside. The corridor-breach ` +
        `pass relocated ${meta.moved} extension(s) over ${meta.rounds} round(s) and got the room from ` +
        `${meta.before} to ${m.max}; it stopped because ${why}.`,
      tiles: [
        { x: m.worst.a.x, y: m.worst.a.y },
        { x: m.worst.b.x, y: m.worst.b.y },
      ],
    });
  }

  if (!meta.moved) return meta;

  // ---- personal ramparts. The destination is deep by construction, so a move
  //      never BUYS one; a vacated shallow tile stops renting the one it had.
  //      NARROW ON PURPOSE: only a tile this pass emptied is a candidate, and
  //      only if nothing else stands on it. Ramparts also sit on bare ground by
  //      design — the controller ring is a ring of them — so a general "no
  //      structure here, drop it" sweep would quietly disarm the plan.
  if (plan.structures.rampart && vacated.size) {
    const occupiedNow = new Set(objTiles);
    for (const t of BUILT_OBSTACLES.concat(["container", "extractor"])) {
      for (const p of plan.structures[t] || []) occupiedNow.add(key(p.x, p.y));
    }
    plan.structures.rampart = plan.structures.rampart.filter((r) => {
      const k = key(r.x, r.y);
      return !vacated.has(k) || cutSet.has(k) || occupiedNow.has(k);
    });
    if (plan.meta?.extensions) {
      plan.meta.extensions.shallow = extensions.filter(
        (e) => depth[idx(e.x, e.y)] < DEPTH_SAFE,
      ).length;
    }
  }

  // ---- BUILD ORDER, re-derived with layer 6's own recipe (see its footer):
  //      outward from the hub, shallow tiles pushed back a little.
  const buildCost = (e) =>
    hubField[idx(e.x, e.y)] + (depth[idx(e.x, e.y)] < DEPTH_SAFE ? 3 : 0);
  extensions.sort((a, b) => buildCost(a) - buildCost(b) || a.y - b.y || a.x - b.x);
  return meta;
}

export function planWallRoads(terrain, plan) {
  if (!plan.shell) return { error: "wall roads need a shell (layer 2 missing)" };
  const cut = plan.shell.cut || [];
  if (!cut.length) return { error: "shell has no cut tiles" };
  const ext = plan.exterior;

  // (0) reopen the lateral lanes the mass closed — MUST precede everything
  //     below, which all read the extension list as final
  const breach = breachCorridors(terrain, plan);

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
  const sitterK = key(plan.sitter.x, plan.sitter.y);
  const pruned = new Set();

  /**
   * REMOVABILITY, not dead-ends.
   *
   * The old rule only ever deleted degree-1 tiles, which is the one case where
   * removal provably cannot split the network — safe, and far too weak. It
   * cannot see the two shapes that actually accumulate: a corridor grown
   * alongside an existing lane (every tile has two neighbours, so nothing is a
   * dead end, and the whole strand is redundant), and a loop that closes back
   * on the network (same story, in a circle). Both survive to be repaired and
   * walked around forever.
   *
   * The honest question is not "is this a tail" but "does anything need this
   * tile": a road earns its upkeep only by serving something adjacent or by
   * being the way to something that does. So:
   *
   *   SERVES   a non-road structure or a room object in D8, or a rampart-spur
   *            head (defenders' approach — a dead end on purpose).
   *   CARRIES  removing it would strand a serving road, a container or the
   *            sitter from the rest of the network.
   *
   * A tile that does neither is deleted, and the test repeats to fixpoint
   * because deleting a redundant strand can expose the strand behind it.
   * Deterministic scan order (row-major) so the choice among equally
   * removable tiles is stable run to run.
   *
   * This SUPERSEDES the degree rule rather than extending it — degree-1
   * unprotected tiles are removable under this definition too — except for the
   * degree-0 case, which is kept: a tile walled in by structures conducts
   * nothing and no creep can stand on it, so it goes even when it "serves".
   */
  const connectedWithout = (drop) => {
    const seen = new Set([sitterK]);
    const st = [sitterK];
    while (st.length) {
      const cur = st.pop();
      const [x, y] = cur.split(",").map(Number);
      for (const [dx, dy] of D8) {
        const k = key(x + dx, y + dy);
        if (k === drop || seen.has(k) || !nodes.has(k)) continue;
        seen.add(k);
        st.push(k);
      }
    }
    return seen;
  };
  const scan = allRoads.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const prunePass = (extraRoads) => {
    const all = extraRoads ? scan.concat(extraRoads) : scan;
    for (let pass = 0; pass < 60; pass++) {
      let changed = false;
      for (const r of all) {
        const k = key(r.x, r.y);
        if (pruned.has(k) || !nodes.has(k)) continue;
        let deg = 0;
        for (const [dx, dy] of D8) if (nodes.has(key(r.x + dx, r.y + dy))) deg++;
        if (deg === 0) {
          pruned.add(k);
          nodes.delete(k);
          changed = true;
          continue;
        }
        if (protectedRoads.has(k)) continue; // serves something
        // everything that must stay on one network once k is gone
        const need = [sitterK];
        for (const c of containerSet) if (nodes.has(c)) need.push(c);
        for (const n of nodes) if (n !== k && protectedRoads.has(n)) need.push(n);
        const seen = connectedWithout(k);
        if (!need.every((n) => seen.has(n))) continue; // it is the way through
        pruned.add(k);
        nodes.delete(k);
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
    for (const r of allRoads) if (!pruned.has(key(r.x, r.y))) live.add(key(r.x, r.y));
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
  //     yet. The holes themselves are protected: they were paved precisely
  //     because something has to cross there.
  // ------------------------------------------------------------------
  if (swampPaved) {
    const holes = [];
    for (const r of newRoads) {
      const k = key(r.x, r.y);
      if (!pruned.has(k) && !nodes.has(k)) {
        nodes.add(k);
        holes.push(r);
        protectedRoads.add(k);
      }
    }
    prunePass(holes);
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
      swampPaved,
      unreachableExts,
      breach,
    },
  };
}
