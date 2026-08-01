/**
 * Layer 1 — Hub by growing from the room
 *
 * No stamps. No "place storage then stick terminal on it" kit.
 *
 * Pipeline:
 *   1. Room anchors = sources + controller (+ mineral)
 *   2. Distance fields flood from every anchor (walk distance)
 *   3. Distance transform (DT) = openness primitive for the whole layer
 *   4. Seed candidates = buildable tiles scored by confluence (close to all
 *      anchors, but not glued to any) + DT pocket depth
 *   5. RCL8 SPACE BUDGET GATE: a seed is only accepted if its basin — the
 *      buildable tiles reachable within walk distance ~11 — can hold the
 *      full RCL8 program (~90 structures + ~35 service roads). v1 skipped
 *      this check and paid for it with seven extension-rescue functions.
 *   6. Core = first N buildable tiles of the basin in BFS order (terrain-
 *      shaped pocket, NOT a chebyshev box — it may snake down a canyon)
 *   6b. OBJECT TILES: sources, the controller and the mineral are OBSTACLES
 *      that already occupy their tile. Nothing — no structure, no road —
 *      may be planned on them (the one exception is the extractor, which by
 *      design sits ON the mineral; layer 5 special-cases it). The set is
 *      built here once, exported as `plan.objectTiles`, and every later
 *      layer folds it into its own occupancy set.
 *   7. Claim tiles inside the grown core, ORIENTED BY THE ROOM:
 *      - hub trio (storage/terminal/link) all touch one SITTER tile, and
 *        the trio's face points toward the room's eco traffic
 *      - spawns spread into different angular sectors of the pocket
 *      - roads grow outward along the actual eco paths (field descent),
 *        not as a fixed ring
 *
 * RCL8 final positions; lower RCLs fill the same tiles later.
 */
import { D4, D8, borderLegal, buildable, chebyshev, key, walkable } from "./shared.mjs";
import { distanceTransform } from "./dt.mjs";
// terrain-only, no cycle: layer-shell imports nothing but shared.mjs
import { computeUnprotectable } from "./layer-shell.mjs";

const INF = 999;

// RCL8 program: 60 ext + 10 lab + 6 tower + 3 spawn + storage/terminal/
// factory/nuker/observer + 6 link + containers ≈ 90 tiles, plus ~35 roads.
const SPACE_BUDGET = 140;
const BUDGET_RADIUS = 11;
const BASIN_RADIUS = 12;
const CORE_SIZE = 30;
const MIN_ANCHOR_PATH = 4; // leave room for containers/miners/upgraders
const MIN_EDGE = 6;

/** Multi-source D8 BFS walk-distance field. origins: [{x,y}, ...] */
export function distField(terrain, origins) {
  const dist = new Int16Array(2500);
  dist.fill(INF);
  const q = [];
  const seed = (x, y) => {
    if (!walkable(terrain, x, y)) return;
    const i = x + y * 50;
    if (dist[i] > 0) {
      dist[i] = 0;
      q.push(i);
    }
  };
  for (const o of origins) {
    if (!o) continue;
    // origin may sit on a wall tile (sources do) — seed its walkable ring
    seed(o.x, o.y);
    for (const [dx, dy] of D8) seed(o.x + dx, o.y + dy);
  }
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++];
    const x = i % 50,
      y = (i / 50) | 0;
    const d = dist[i];
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny)) continue;
      const ni = nx + ny * 50;
      if (dist[ni] <= d + 1) continue;
      dist[ni] = d + 1;
      q.push(ni);
    }
  }
  return dist;
}

function idx(x, y) {
  return x + y * 50;
}

/**
 * Basin = buildable tiles reachable from seed by walk distance, in BFS
 * order. This is the room-shaped pocket everything else grows inside.
 */
export function growBasin(terrain, seed, maxDist) {
  const seen = new Uint8Array(2500);
  const basin = []; // {x, y, d} — buildable only, BFS order
  let withinBudgetRadius = 0;
  const q = [{ x: seed.x, y: seed.y, d: 0 }];
  seen[idx(seed.x, seed.y)] = 1;
  let qi = 0;
  while (qi < q.length) {
    const { x, y, d } = q[qi++];
    if (buildable(terrain, x, y)) {
      basin.push({ x, y, d });
      if (d <= BUDGET_RADIUS) withinBudgetRadius++;
    }
    if (d >= maxDist) continue;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (seen[ni]) continue;
      if (!walkable(terrain, nx, ny)) continue;
      seen[ni] = 1;
      q.push({ x: nx, y: ny, d: d + 1 });
    }
  }
  return { basin, withinBudgetRadius };
}

/**
 * Anchor weights. `fields` is always [...sources, controller] — the
 * controller is the LAST entry (index === sources.length). Owner design
 * call: controller proximity matters slightly MORE than source proximity
 * (upgraders walk it every tick of the room's life; miners sit still).
 * The mineral is never an anchor at all.
 */
const CTRL_WEIGHT = 1.15;
const SRC_WEIGHT = 1.0;
const anchorWeight = (i, n) => (i === n - 1 ? CTRL_WEIGHT : SRC_WEIGHT);

/**
 * ENCLOSURE BIAS (owner: "sometimes it's better to build the core around the
 * controller or a source — it's good to have stuff inside, it's all about
 * defence"). A hub within a short walk of an anchor is a hub whose min-cut
 * can usually AFFORD to pull that anchor inside the wall (layer 2 only buys
 * the expansion when the cut grows by ≤4 tiles). The linear -sum term alone
 * does not express that: it treats 9 vs 12 as a 3-tile difference when it is
 * really the difference between a source inside the base and a source that
 * needs a bubble, harassment cover and a defender excursion forever.
 */
const ENCLOSE_BONUS = 3.0;
const ENCLOSE_RANGE = 9;

/**
 * Seed score: the room's economy pulls here (low walk distance to every
 * anchor), the pocket is deep (DT), and we're not crushed on the edge.
 * Cheap filter — the expensive space-budget gate runs on the top few only.
 */
function seedScore(terrain, dt, x, y, fields, objectTiles) {
  if (!buildable(terrain, x, y)) return -Infinity;
  if (objectTiles.has(key(x, y))) return -Infinity;
  const d = dt[idx(x, y)];
  if (d < 3) return -Infinity; // needs a real pocket, not a crack
  const edge = Math.min(x, y, 49 - x, 49 - y);
  if (edge < MIN_EDGE) return -Infinity;
  let sum = 0;
  let maxD = 0;
  let minD = INF;
  let huggable = 0; // anchors close enough for the shell to swallow
  for (let fi = 0; fi < fields.length; fi++) {
    const fd = fields[fi][idx(x, y)];
    if (fd >= INF) return -Infinity;
    sum += fd * anchorWeight(fi, fields.length);
    if (fd > maxD) maxD = fd;
    if (fd < minD) minD = fd;
    if (fd <= ENCLOSE_RANGE) huggable++;
  }
  // not glued to one anchor (containers/upgrader spots live there)
  if (minD < MIN_ANCHOR_PATH) return -Infinity;
  return (
    dt[idx(x, y)] * 2.0 - sum * 1.0 - maxD * 0.35 + edge * 0.3 + huggable * ENCLOSE_BONUS
  );
}

function freeNeighbors4(terrain, pos, blocked) {
  const out = [];
  for (const [dx, dy] of D4) {
    const x = pos.x + dx,
      y = pos.y + dy;
    if (!buildable(terrain, x, y)) continue;
    if (blocked.has(key(x, y))) continue;
    out.push({ x, y });
  }
  return out;
}

function freeNeighbors8(terrain, pos, blocked) {
  const out = [];
  for (const [dx, dy] of D8) {
    const x = pos.x + dx,
      y = pos.y + dy;
    if (!buildable(terrain, x, y)) continue;
    if (blocked.has(key(x, y))) continue;
    out.push({ x, y });
  }
  return out;
}

/**
 * Claim storage inside grown core: deep DT, close to every anchor,
 * central in the pocket, and ≥4 free D4 so the hub trio + roads fit.
 */
function claimStorage(terrain, dt, core, fields, objectTiles) {
  let best = null;
  for (const t of core) {
    if (objectTiles.has(key(t.x, t.y))) continue;
    const faces = freeNeighbors4(terrain, t, objectTiles);
    if (faces.length < 4) continue;
    let sum = 0;
    let maxD = 0;
    let minD = INF;
    let bad = false;
    for (let fi = 0; fi < fields.length; fi++) {
      const fd = fields[fi][idx(t.x, t.y)];
      if (fd >= INF) {
        bad = true;
        break;
      }
      sum += fd * anchorWeight(fi, fields.length);
      if (fd > maxD) maxD = fd;
      if (fd < minD) minD = fd;
    }
    if (bad) continue;
    // same rule as the seed: containers/miners/upgraders own the anchor ring
    if (minD < MIN_ANCHOR_PATH) continue;
    let cSum = 0;
    for (const c of core) cSum += chebyshev(t, c);
    const central = -cSum / Math.max(1, core.length);
    const total =
      dt[idx(t.x, t.y)] * 1.5 - sum * 1.0 - maxD * 0.35 + central * 0.8;
    if (!best || total > best.total) best = { ...t, total, faces: faces.length };
  }
  return best;
}

/**
 * The direction the room's economy pulls from the storage tile —
 * unit-vector average toward sources (weight 1) and controller (0.6).
 * This orients the whole hub kit, so no two rooms face the same way.
 */
function ecoDirection(storage, sources, controller) {
  let dx = 0,
    dy = 0;
  const pull = (p, w) => {
    const vx = p.x - storage.x,
      vy = p.y - storage.y;
    const len = Math.max(1, Math.hypot(vx, vy));
    dx += (vx / len) * w;
    dy += (vy / len) * w;
  };
  for (const s of sources) pull(s, 1.0);
  pull(controller, 0.6);
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return { x: dx / len, y: dy / len };
}

/**
 * Hub trio: storage, terminal, link all touch one SITTER tile (a road a
 * single creep parks on and transfers between all three without moving),
 * and the trio faces the eco traffic. Returns null only in degenerate
 * pockets; caller falls back to loose adjacency.
 */
function claimHubTrio(terrain, storage, dir, objectTiles) {
  // sitter: free D4 face of storage, most aligned with eco direction
  const faces = freeNeighbors4(terrain, storage, objectTiles);
  const scored = faces
    .map((f) => ({
      ...f,
      dot: (f.x - storage.x) * dir.x + (f.y - storage.y) * dir.y,
    }))
    .sort((a, b) => b.dot - a.dot);

  for (const sitter of scored) {
    // terminal/link: touch BOTH storage and sitter, and touch each other
    const cands = [];
    for (const [dx, dy] of D8) {
      const x = sitter.x + dx,
        y = sitter.y + dy;
      if (!buildable(terrain, x, y) || objectTiles.has(key(x, y))) continue;
      if (x === storage.x && y === storage.y) continue;
      if (chebyshev({ x, y }, storage) > 1) continue;
      cands.push({
        x,
        y,
        dot: (x - storage.x) * dir.x + (y - storage.y) * dir.y,
      });
    }
    cands.sort((a, b) => b.dot - a.dot);
    for (let i = 0; i < cands.length; i++) {
      for (let j = 0; j < cands.length; j++) {
        if (i === j) continue;
        if (chebyshev(cands[i], cands[j]) > 1) continue; // pairwise ≤1
        return { sitter: { x: sitter.x, y: sitter.y }, terminal: { x: cands[i].x, y: cands[i].y }, link: { x: cands[j].x, y: cands[j].y } };
      }
    }
  }
  return null;
}

const octant = (from, to) => Math.round((Math.atan2(to.y - from.y, to.x - from.x) / Math.PI) * 4) & 7;

/** signed bearing of `to` seen from `from`, in degrees [-180,180). */
const bearing = (from, to) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
/** smallest absolute angle between two bearings, in degrees [0,180]. */
function angleGap(a, b) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

// A spawn's only mechanical requirements are: a creep can leave it, and a
// filler can reach it. Adjacency between spawns buys NOTHING — three spawns
// in one corner is three eggs in one basket, one nuke, one breach, one
// stalled respawn. So the fan is scored, not hoped for: SECTOR_TARGET is the
// pairwise angular separation around storage the fan aims for, and the reward
// SATURATES there. Chasing a wider fan than that is score-chasing: it drags
// spawns to the rim of the pocket, which widens the shell and pushes the
// extension mass into the shallow band, and a 120° fan defends nothing a 60°
// fan does not. Past the target, tile quality decides.
const SECTOR_TARGET = 60;
const SECTOR_WEIGHT = 0.4; // 0..24 pts — sized against the tile-quality sum
// Weight on hugging the pocket edge. Sized so the distance transform leads
// and exit count breaks its ties, not the other way round: at 2.0 the fleet
// keeps 335/477 spawns on full-8-exit tiles while the shallow-extension
// count falls below the pre-fan baseline. Higher starts crowding spawns into
// rock pockets for no further gain.
const HUG_WEIGHT = 2.0;
// A filler tours storage → spawns → storage every generation. Five walk steps
// from storage is already a long leash; past that the fan costs more than the
// spread is worth, so it is a hard bound, not a penalty.
const SPAWN_WALK_MAX = 5;
// Bounded search: keep the best few tiles per 30° sector so the candidate set
// stays angularly diverse instead of collapsing onto the one hot corner, then
// enumerate triples exhaustively. ~50 candidates ⇒ ~20k triples ⇒ single-digit ms.
const SECTOR_BINS = 12;
const PER_BIN = 4;
const TOP_OVERALL = 8;
// ------------------------------------------------------------------
// THE PRE-SHELL DEPTH PROXY.
//
// Layer 1 places spawns; layer 2 cuts the shell. So at the moment a spawn is
// chosen the exterior region does not exist yet and its depth is genuinely
// unknown — which is why three spawns in the fleet shipped at depth 3, each
// renting a personal rampart forever, and why no amount of tuning the hug term
// found them: the hug term is about elbow room, not about the wall.
//
// What IS knowable from terrain alone is an UPPER BOUND on the eventual depth.
// Two families of tile are exterior in every enclosure this planner can build:
//   - `computeUnprotectable` tiles — the exit band and everything the min-cut
//     can never seal off from it. No protect mask may contain them, by rule.
//   - anything past the walk horizon below. The shell's protect mask is the
//     basin within a walk radius of the hub (RADII_WIDE tops out at 14, the
//     fleet median lands on 10), so a tile a long walk from storage is on the
//     attacker's side of every cut this room will be offered.
// Chebyshev distance to the nearest such tile is therefore never LESS than the
// final depth: proxy < 4 proves the tile will be shallow. The reverse is not
// proved, which is exactly right — this is a veto on tiles that cannot work,
// not a promise about the ones that can.
//
// Calibrated against the finished fleet (477 spawns, proxy vs re-derived
// post-shell depth): at the horizon below it flags all 3 shallow spawns with
// one false alarm; at 10 it costs two false alarms, at 14 it misses one of the
// three. Mean absolute error against the true depth is 1.09 tiles.
const DEPTH_SAFE = 4;
const PROXY_WALK_HORIZON = 12;
// Points shaved per tile of proven shortfall. Sized against the fan: the
// sector term is worth up to SECTOR_TARGET * SECTOR_WEIGHT = 24 points across a
// triple, so 8 points buys back 20 degrees of fan angle — enough to move a
// spawn off a proven-shallow tile, not enough to collapse the fan for it. Deep
// candidates are untouched by construction, so a room with no shallow spawn
// candidate in its shortlist plans exactly as it did before.
const SHALLOW_SPAWN_PENALTY = 8;

/**
 * Spawns fanned into DIFFERENT angular sectors around storage — they don't
 * need to touch each other, they need exit tiles, fill access, and daylight
 * between them. The fan shape follows the room, which is where per-room
 * character comes from.
 *
 * Greedy placement cannot do this: the first spawn takes the best tile, the
 * second takes the best tile that is merely not-adjacent, and by the third
 * the good sectors are gone. So the triple is chosen jointly — every
 * candidate set is scored on its WORST pairwise gap, and the hub's own
 * invariants (storage keeps ≥2 free D4 faces, every spawn keeps ≥3 exits)
 * are checked against the FINAL layout rather than the partial one.
 *
 * Terrain-cramped rooms degrade gracefully: if no triple satisfies the joint
 * test, the old sequential growth runs as a fallback so the room still ships
 * three spawns, and the achieved minimum angle is reported either way.
 */
/**
 * Upper bound on post-shell depth, from terrain alone. See PROXY_WALK_HORIZON.
 * Chebyshev BFS (through walls, the way a ranged attacker's reach measures)
 * from every tile that is exterior in every enclosure this room can be sold.
 */
function proxyDepthField(terrain, storage) {
  const unprotectable = computeUnprotectable(terrain);
  const walk = fieldFrom(terrain, storage, new Set());
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) {
    const x = i % 50,
      y = (i / 50) | 0;
    if (!walkable(terrain, x, y)) continue;
    if (!unprotectable[i] && walk[i] <= PROXY_WALK_HORIZON) continue;
    depth[i] = 0;
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
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (depth[ni] <= depth[i] + 1) continue;
      depth[ni] = depth[i] + 1;
      q.push(ni);
    }
  }
  return depth;
}

/** the 30° sector index of a bearing — the same bins the shortlist strata use */
const sectorOf = (ang) => Math.floor(((ang + 360) % 360) / (360 / SECTOR_BINS));

function growSpawnsSpread(terrain, dt, core, coreSet, blocked, storage, n = 3) {
  // core first, then one ring outside it
  const pool = [...core];
  for (const c of core) {
    for (const [dx, dy] of D8) {
      const x = c.x + dx,
        y = c.y + dy;
      if (!buildable(terrain, x, y) || coreSet.has(key(x, y))) continue;
      if (!pool.some((p) => p.x === x && p.y === y)) pool.push({ x, y });
    }
  }

  // CENSUS — read-only bookkeeping over the search that is about to run. It
  // changes nothing: every counter below is incremented on a path that already
  // existed, so a room plans exactly the tiles it planned before. Its whole
  // job is to make `fanned:false` explicable instead of a bare boolean — WHY
  // the pocket could not offer three spawns 60° apart, in numbers.
  const census = {
    pool: pool.length,
    poolCore: core.length,
    poolRing: pool.length - core.length,
    rejClaimed: 0, // tile already taken by the hub trio / an object
    rejHubRing: 0, // inside storage's own 2-tile ring
    rejWalk: 0, // past the filler leash
    rejStorageFace: 0, // would cut storage below 2 free D4 faces
    rejExits: 0, // fewer than 3 free exits — a creep could not leave
    viable: 0,
    viableCore: 0,
    viableShallow: 0, // proven shallow on the pre-shell depth proxy
    viableSectors: 0,
    shortlist: 0,
    shortlistSectors: 0,
    triples: 0, // legal (pairwise non-adjacent) triples enumerated
    triplesAdjacent: 0, // combinations discarded because two spawns touched
    triplesJointRejected: 0, // better-scoring triples that failed the joint test
    fannedTriples: 0, // enumerated triples that DID reach SECTOR_TARGET
    // set only when the fan misses: the best-scoring triple that would have
    // reached the target, and the exact trade it lost. Without it a miss reads
    // as "the terrain ran out" even in rooms where the fan was on the table and
    // was outbid by tile quality — two different failures, one boolean.
    fannedAvailable: null,
    winnerSectors: 0,
    walkCap: SPAWN_WALK_MAX,
    sectorDeg: Math.round(360 / SECTOR_BINS),
    sectorBins: SECTOR_BINS,
    depthSafe: DEPTH_SAFE,
    fallback: false,
  };

  // walk distance from storage over bare terrain minus the hub trio — the
  // real filler leash, not a chebyshev guess that a wall makes a lie of
  const walk = fieldFrom(terrain, storage, blocked);
  // proven-shallow veto: see PROXY_WALK_HORIZON
  const proxy = proxyDepthField(terrain, storage);

  const viable = [];
  for (const p of pool) {
    const k = key(p.x, p.y);
    if (blocked.has(k)) {
      census.rejClaimed++;
      continue;
    }
    if (chebyshev(p, storage) < 2) {
      census.rejHubRing++;
      continue; // keep the hub ring clear
    }
    if (walk[idx(p.x, p.y)] > SPAWN_WALK_MAX) {
      census.rejWalk++;
      continue;
    }
    const trial = new Set(blocked);
    trial.add(k);
    if (freeNeighbors4(terrain, storage, trial).length < 2) {
      census.rejStorageFace++;
      continue;
    }
    const exits = freeNeighbors8(terrain, p, trial).length;
    if (exits < 3) {
      census.rejExits++;
      continue; // creeps must be able to leave the spawn
    }
    // Every tile below DEPTH_SAFE on the proxy is PROVEN to end up in the
    // ranged band whatever the shell does, so it will buy a personal rampart
    // and repair it forever. Deep tiles score exactly as they always did —
    // the term is a penalty, not a reward, so it can only ever break the tie
    // AGAINST a tile that is known not to work.
    const pd = proxy[idx(p.x, p.y)];
    const shallowCost = pd < DEPTH_SAFE ? (DEPTH_SAFE - pd) * SHALLOW_SPAWN_PENALTY : 0;
    viable.push({
      x: p.x,
      y: p.y,
      exits,
      proxyDepth: pd,
      ang: bearing(storage, p),
      // A spawn wants access, not elbow room. The open middle of the pocket
      // is the only place the extension mass can sit at depth ≥ 4, so a
      // spawn parked there is paid for later in personal ramparts — the
      // owner's top standing criticism. Hug the pocket's edge: low distance
      // transform, still ≥3 exits.
      base:
        exits +
        (coreSet.has(k) ? 2 : 0) -
        chebyshev(p, storage) * 0.4 -
        dt[idx(p.x, p.y)] * HUG_WEIGHT -
        shallowCost,
    });
  }
  census.viable = viable.length;
  census.viableCore = viable.filter((v) => coreSet.has(key(v.x, v.y))).length;
  census.viableShallow = viable.filter((v) => v.proxyDepth < DEPTH_SAFE).length;
  census.viableSectors = new Set(viable.map((v) => sectorOf(v.ang))).size;

  // deterministic order for every downstream tie-break
  viable.sort((a, b) => b.base - a.base || a.x - b.x || a.y - b.y);

  // sector-stratified shortlist
  const bins = new Map();
  const shortlist = [];
  const take = (c) => {
    if (!shortlist.includes(c)) shortlist.push(c);
  };
  for (const c of viable.slice(0, TOP_OVERALL)) take(c);
  for (const c of viable) {
    const b = sectorOf(c.ang);
    const cnt = bins.get(b) || 0;
    if (cnt >= PER_BIN) continue;
    bins.set(b, cnt + 1);
    take(c);
  }
  shortlist.sort((a, b) => a.x - b.x || a.y - b.y);
  census.shortlist = shortlist.length;
  census.shortlistSectors = new Set(shortlist.map((c) => sectorOf(c.ang))).size;

  const jointOk = (set) => {
    const trial = new Set(blocked);
    for (const s of set) trial.add(key(s.x, s.y));
    if (freeNeighbors4(terrain, storage, trial).length < 2) return false;
    for (const s of set) {
      if (freeNeighbors8(terrain, s, trial).length < 3) return false;
    }
    return true;
  };

  // enumerate triples, cheap score first, joint feasibility only on the ones
  // worth building — the expensive test runs a handful of times, not 20k
  const triples = [];
  const L = shortlist.length;
  for (let i = 0; i < L; i++) {
    for (let j = i + 1; j < L; j++) {
      if (chebyshev(shortlist[i], shortlist[j]) <= 1) continue; // never adjacent
      for (let k2 = j + 1; k2 < L; k2++) {
        if (chebyshev(shortlist[i], shortlist[k2]) <= 1) continue;
        if (chebyshev(shortlist[j], shortlist[k2]) <= 1) continue;
        const a = shortlist[i],
          b = shortlist[j],
          c = shortlist[k2];
        const minAng = Math.min(
          angleGap(a.ang, b.ang),
          angleGap(a.ang, c.ang),
          angleGap(b.ang, c.ang),
        );
        const sc =
          Math.min(minAng, SECTOR_TARGET) * SECTOR_WEIGHT + a.base + b.base + c.base;
        triples.push({ i, j, k: k2, minAng, sc });
      }
    }
  }
  triples.sort(
    (p, q) => q.sc - p.sc || q.minAng - p.minAng || p.i - q.i || p.j - q.j || p.k - q.k,
  );
  census.triples = triples.length;
  census.triplesAdjacent = Math.max(0, (L * (L - 1) * (L - 2)) / 6 - triples.length);
  census.fannedTriples = triples.filter((t) => t.minAng >= SECTOR_TARGET).length;
  // the score minus its sector term — the pure tile-quality sum a triple offers
  const tileQuality = (t) => t.sc - Math.min(t.minAng, SECTOR_TARGET) * SECTOR_WEIGHT;
  const r1 = (v) => Math.round(v * 10) / 10;
  for (const t of triples) {
    const set = [shortlist[t.i], shortlist[t.j], shortlist[t.k]];
    if (!jointOk(set)) {
      census.triplesJointRejected++;
      continue;
    }
    if (t.minAng < SECTOR_TARGET) {
      // triples are sorted by score, so the first target-reaching entry IS the
      // best fan the room could have had. One extra feasibility call, on the
      // failure path only, and nothing here feeds back into the choice.
      const rival = triples.find((u) => u.minAng >= SECTOR_TARGET);
      if (rival) {
        const rset = [shortlist[rival.i], shortlist[rival.j], shortlist[rival.k]];
        census.fannedAvailable = {
          minAngle: Math.round(rival.minAng),
          tiles: rset.map((s) => ({ x: s.x, y: s.y })),
          jointlyFeasible: jointOk(rset),
          scoreGap: r1(t.sc - rival.sc),
          tileQualityGap: r1(tileQuality(t) - tileQuality(rival)),
          sectorGain: r1(
            (Math.min(rival.minAng, SECTOR_TARGET) - Math.min(t.minAng, SECTOR_TARGET)) *
              SECTOR_WEIGHT,
          ),
        };
      }
    }
    for (const s of set) blocked.add(key(s.x, s.y));
    census.winnerSectors = new Set(set.map((s) => sectorOf(s.ang))).size;
    return {
      spawns: set.map((s) => ({ x: s.x, y: s.y })),
      minAngle: Math.round(t.minAng),
      walkMax: Math.max(...set.map((s) => walk[idx(s.x, s.y)])),
      fanned: t.minAng >= SECTOR_TARGET,
      // the bound, not the truth — layer 2 measures the real depth later
      proxyDepthMin: Math.min(...set.map((s) => s.proxyDepth)),
      census,
    };
  }

  // FALLBACK — the pocket is too tight for any legal fan. Grow sequentially
  // the way the old code did so the room still gets three spawns, and let the
  // meta say how thin the fan came out.
  census.fallback = true;
  const spawns = [];
  while (spawns.length < n) {
    let best = null;
    for (const p of viable) {
      const k = key(p.x, p.y);
      if (blocked.has(k)) continue;
      if (spawns.some((s) => chebyshev(s, p) <= 1)) continue;
      const trial = new Set(blocked);
      trial.add(k);
      if (freeNeighbors4(terrain, storage, trial).length < 2) continue;
      let sc = p.base;
      for (const s of spawns) if (octant(storage, s) === octant(storage, p)) sc -= 4;
      if (!best || sc > best.sc) best = { ...p, sc };
    }
    if (!best) break;
    spawns.push({ x: best.x, y: best.y });
    blocked.add(key(best.x, best.y));
  }
  let minAngle = 180;
  for (let i = 0; i < spawns.length; i++) {
    for (let j = i + 1; j < spawns.length; j++) {
      minAngle = Math.min(minAngle, angleGap(bearing(storage, spawns[i]), bearing(storage, spawns[j])));
    }
  }
  census.winnerSectors = new Set(spawns.map((s) => sectorOf(bearing(storage, s)))).size;
  return {
    spawns,
    minAngle: spawns.length > 1 ? Math.round(minAngle) : 180,
    walkMax: spawns.length ? Math.max(...spawns.map((s) => walk[idx(s.x, s.y)])) : 0,
    fanned: false,
    proxyDepthMin: spawns.length ? Math.min(...spawns.map((s) => proxy[idx(s.x, s.y)])) : 0,
    census,
  };
}

/**
 * THE FAN THAT MISSED, IN NUMBERS.
 *
 * `fanned:false` used to be the whole story: the room shipped three spawns
 * bunched inside one angular sector and the meta said so in a boolean nobody
 * can argue with. Silently capping an axis is the anti-pattern this codebase
 * forbids by name, so the miss now costs a declared shortfall whose prose is
 * generated from the census the search kept: what the pocket offered, what
 * each hard filter took away, and how few sectors the survivors covered. The
 * plan is unchanged — this is the receipt, not a new decision.
 */
function spawnFanDetail(fan, storage) {
  const c = fan.census;
  const short = Math.max(0, SECTOR_TARGET - fan.minAngle);
  const rejected =
    c.rejClaimed + c.rejHubRing + c.rejWalk + c.rejStorageFace + c.rejExits;
  const where = fan.spawns.map((s) => `${s.x},${s.y}`).join(" / ");
  const parts = [];
  parts.push(
    `spawn fan short by ${short}°: the best legal triple around the hub at ` +
      `${storage.x},${storage.y} separates its three spawns (${where}) by only ` +
      `${fan.minAngle}° at the worst pair, against the ${SECTOR_TARGET}° sector target — ` +
      `achieved ${fan.minAngle}° vs target ${SECTOR_TARGET}°, filler leash used ` +
      `${fan.walkMax} of ${c.walkCap} walk steps, shallowest spawn at proxy depth ` +
      `${fan.proxyDepthMin} (floor ${c.depthSafe}).`,
  );
  parts.push(
    `Candidate census: ${c.pool} tiles were considered (${c.poolCore} in the grown core, ${c.poolRing} in the ring just outside it); ` +
      `${rejected} were struck out in order — ${c.rejClaimed} already claimed by the hub trio or ` +
      `an object tile, ${c.rejHubRing} inside storage's own 2-tile ring, ${c.rejWalk} past the ` +
      `${c.walkCap}-step filler leash, ${c.rejStorageFace} that would have cut storage below two ` +
      `free faces, ${c.rejExits} with fewer than 3 free exits for a creep to leave by — leaving ` +
      `${c.viable} viable seats (${c.viableCore} of them inside the core pocket, ` +
      `${c.viableShallow} of them proven shallow below depth ${c.depthSafe} on the pre-shell ` +
      `proxy), spread over ${c.viableSectors} of the ${c.sectorBins} ${c.sectorDeg}° sectors ` +
      `around storage. ${c.shortlist} of those were shortlisted across ${c.shortlistSectors} ` +
      `sectors and ${c.triples} pairwise-non-adjacent triples were enumerated from them ` +
      `(${c.triplesAdjacent} more discarded because two spawns touched), of which ` +
      `${c.fannedTriples} reached the ${SECTOR_TARGET}° target; ${c.triplesJointRejected} ` +
      `better-scoring triples failed the joint feasibility test before this one was taken, and ` +
      `the winner spans ${c.winnerSectors} sector${c.winnerSectors === 1 ? "" : "s"}.`,
  );
  // WHICH failure this was. A miss because the pocket has no daylight in it is
  // a different admission from a miss because the fan was outbid, and reporting
  // the first when the second happened would be a comfortable lie.
  if (c.fallback) {
    parts.push(
      `Not one triple survived the joint feasibility test — storage's own free faces and the ` +
        `3-exit rule could not be satisfied by any three of them at once — so the sequential ` +
        `fallback placed the spawns one at a time and the fan is whatever the leftovers allowed.`,
    );
  } else if (!c.fannedTriples) {
    parts.push(
      `Why it failed: not one of the ${c.triples} triples reached ${SECTOR_TARGET}°. The pocket ` +
        `offered ${c.viable} seats in ${c.viableSectors} sectors and no three of them, mutually ` +
        `non-adjacent, stand ${SECTOR_TARGET}° apart around storage — this is the terrain's ` +
        `answer, not a scoring preference, and no reweighting reaches a tile that is not there.`,
    );
  } else if (c.fannedAvailable) {
    const f = c.fannedAvailable;
    parts.push(
      `Why it failed: the fan WAS on the table and lost on score. ${c.fannedTriples} triples ` +
        `reached the target, the best of them ${f.minAngle}° at ` +
        `${f.tiles.map((t) => `${t.x},${t.y}`).join(" / ")}` +
        (f.jointlyFeasible ? ` (jointly feasible)` : ` (and not even jointly feasible)`) +
        `, but it scored ${f.scoreGap} points below the winner: the sector term pays ` +
        `${SECTOR_WEIGHT} points per degree and saturates at ${SECTOR_TARGET}°, so the extra ` +
        `angle was worth ${f.sectorGain} points while the fanned triple gave up ` +
        `${f.tileQualityGap} points of tile quality — exits, pocket hug and proxy depth. That is ` +
        `a deliberate trade, priced by SECTOR_WEIGHT, and this is where it is being declared ` +
        `rather than hidden behind a boolean.`,
    );
  }
  // ------------------------------------------------------------------
  // THE CONSEQUENCE IS READ OFF THE CENSUS, NOT PRINTED FROM A TEMPLATE.
  //
  // This paragraph used to open "three spawns inside one sector" unconditionally
  // — in 8 rooms directly contradicting the sentence above it, which had just
  // reported `winnerSectors: 3`. A room whose three spawns sit in three
  // different 30° sectors and merely fail the 120° target is a completely
  // different failure from a room whose three spawns are bunched on one face,
  // and telling a reader the second when the census says the first is the kind
  // of boilerplate that makes the whole channel worthless. The wording now comes
  // from `winnerSectors` and from the worst pair's actual angle.
  // ------------------------------------------------------------------
  const ws = c.winnerSectors;
  parts.push(
    `Consequence: ` +
      (ws <= 1
        ? `all three spawns sit in ONE ${c.sectorDeg}° sector, so the room's spawn-adjacent parking and ` +
          `the fill routes crowd a single face of the hub — the fillers queue on one side instead of ` +
          `touring three, and one breach, one nuke or one blocked corridor on that side reaches every ` +
          `spawn the room has.`
        : ws === 2
          ? `the three spawns cover ${ws} of the ${c.sectorBins} ${c.sectorDeg}° sectors, so two of them ` +
            `share a face: the parking and fill routes fan across two sides rather than three, and a ` +
            `breach on the shared side reaches two of the room's three spawns at once.`
          : `the three spawns DO sit in ${ws} different ${c.sectorDeg}° sectors — this is a spread that ` +
            `misses the ${SECTOR_TARGET}° separation target, not a bunch. The cost is proportionate: the ` +
            `closest pair is ${fan.minAngle}° apart, so their parking and fill routes overlap and the ` +
            `filler tour saves less than a fully fanned trio would, but no single face carries the room.`) +
      ` At ${fan.minAngle}° the worst pair here is ${short}° short of the target, and the parking, roads ` +
      `and rampart spend follow them.`,
  );
  return parts.join(" ");
}

/** Roads may sit anywhere walkable off the exit band. */
function roadOk(terrain, x, y) {
  return x >= 1 && x <= 48 && y >= 1 && y <= 48 && walkable(terrain, x, y);
}

/** BFS walk-distance field from one tile, treating `impassable` as walls. */
export function fieldFrom(terrain, origin, impassable) {
  const dist = new Int16Array(2500);
  dist.fill(INF);
  dist[idx(origin.x, origin.y)] = 0;
  const q = [idx(origin.x, origin.y)];
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny) || impassable.has(key(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (dist[ni] <= dist[i] + 1) continue;
      dist[ni] = dist[i] + 1;
      q.push(ni);
    }
  }
  return dist;
}

/**
 * IS THIS TILE THE WAY IN? — the chokepoint test.
 *
 * A link is an OBSTACLE. Drop one on the single free tile that joins a pocket
 * to the basin and everything behind it is gone for good: the min-cut works on
 * geometry, not on walks, so the shell still rings that pocket, and the finished
 * base can never stand on those ramparts. E19S1 paid exactly this bill — the
 * source link at 31,26 sealed a source pocket and ten cut tiles had to be
 * DECLARED unreachable, at zero rampart saving, while a legal alternative link
 * tile on the same seat sealed nothing.
 *
 * Plain articulation is NOT the test. Layer 1 runs before the wall exists, so
 * the graph it can see still has the whole exterior in it: 31,26 is not a cut
 * vertex of the room, only of the base. What survives that blindness is the
 * DETOUR — with the tile blocked, how much further does the sitter have to walk
 * to reach everything it could reach before? A corner costs a tile or two. A way
 * in costs the trip around the outside, and that trip is precisely what the wall
 * is about to delete.
 *
 * Two stages, so the honest-but-expensive question is asked almost never:
 *   RING SPLIT  a tile can only be a separator if the free tiles of its own 3x3
 *               ring fall into two or more arcs. O(8), and it clears the field.
 *   DETOUR      one BFS with the tile blocked, compared against the field we
 *               already have. Memoised per tile.
 */
const CHOKE_DETOUR = 6;
/** the 3x3 ring in cyclic order — consecutive entries are D8-adjacent */
const RING = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
function ringSplit(terrain, impassable, x, y) {
  let free = 0;
  let arcs = 0;
  for (let i = 0; i < 8; i++) {
    const [dx, dy] = RING[i];
    const ok = walkable(terrain, x + dx, y + dy) && !impassable.has(key(x + dx, y + dy));
    if (!ok) continue;
    free++;
    const [px, py] = RING[(i + 7) % 8];
    if (!walkable(terrain, x + px, y + py) || impassable.has(key(x + px, y + py))) arcs++;
  }
  return free < 8 && arcs >= 2; // a full ring is one arc and no separator
}
/**
 * Its OWN baseline field, deliberately: the callers' hubField is frozen on raw
 * terrain for the whole eco pass (moving it would re-score every seat), while
 * the graph this test measures gains a tile with every link committed.
 */
export function chokeTest(terrain, sitter, impassable) {
  const hubField = fieldFrom(terrain, sitter, impassable);
  const memo = new Map();
  return (x, y) => {
    const k = key(x, y);
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    let seals = false;
    if (ringSplit(terrain, impassable, x, y)) {
      const blocked = new Set(impassable);
      blocked.add(k);
      const f = fieldFrom(terrain, sitter, blocked);
      const self = idx(x, y);
      for (let i = 0; i < 2500; i++) {
        if (i === self || hubField[i] >= INF) continue;
        if (f[i] >= INF || f[i] - hubField[i] > CHOKE_DETOUR) {
          seals = true;
          break;
        }
      }
    }
    memo.set(k, seals);
    return seals;
  };
}

/**
 * A link that seals a pocket loses to one that does not, always — but it is
 * still taken when it is the only link tile on offer. Refusing outright would
 * trade a declared BATTLEMENT shortfall for a declared LINK shortfall, and a
 * room that ships three links forever is the worse of the two.
 */
const STRAND_PENALTY = 1000;

/**
 * Source works: container on the source's walkable ring (miner sits here),
 * closest to the hub by walk; link on a container neighbor, preferring
 * tiles OFF the mining ring so it doesn't eat a harvest spot.
 */
/**
 * RAMPART-LEGALITY PENALTY (engine border rule, utils.js:120-126).
 * A container is exempt from the rule, so it can sit at x/y 1 or 48 quite
 * legally — but the RAMPART layer-shell wants to bubble it with cannot. Two
 * rooms used to ship exactly that: a miner seat one tile off the edge with a
 * gate rampart that returns ERR_INVALID_TARGET forever. So a seat whose tile
 * can never be covered costs a few tiles of hauler distance in the scoring;
 * it is still taken when it is the only seat there is.
 */
const NO_RAMPART_PENALTY = 12;
const rampartPenalty = (terrain, x, y) =>
  borderLegal(terrain, x, y, "rampart") ? 0 : NO_RAMPART_PENALTY;

/**
 * best link tile D8 of `seat`, or null. Prefers tiles off the mining ring.
 *
 * A link is a BLOCKING structure, so a link on the seat's only corridor walls
 * the miner out of its own container. There is a repair pass further down
 * that notices and deletes the link, but by then the seat is already chosen
 * and the room silently ships one link short — E14S6's source at 26,25 sits
 * in a one-tile pocket and lost its link exactly this way. Cheap local test:
 * the seat must keep at least one hub-reachable walkable neighbour that is
 * not the link.
 *
 * The seat is not the only thing a link can seal. `seals` (chokeTest, above)
 * asks the same question about the REST of the room: a candidate that cuts a
 * pocket off the basin loses to any candidate that does not, by a margin no
 * distance term can close. It is passed only on the FINAL pricing of the
 * winning seat — the seat ladder below only needs to know whether a link
 * exists at all, and that answer is the same either way.
 */
function bestLinkFor(terrain, source, seat, hubField, impassable, seals) {
  const keepsSeatOpen = (lx, ly) =>
    D8.some(([dx, dy]) => {
      const x = seat.x + dx,
        y = seat.y + dy;
      if (x === lx && y === ly) return false;
      if (!walkable(terrain, x, y) || impassable.has(key(x, y))) return false;
      return hubField[idx(x, y)] < INF;
    });
  let link = null;
  let linkSc = -Infinity;
  for (const [dx, dy] of D8) {
    const x = seat.x + dx,
      y = seat.y + dy;
    if (!buildable(terrain, x, y) || impassable.has(key(x, y))) continue;
    if (!keepsSeatOpen(x, y)) continue;
    const offRing = chebyshev({ x, y }, source) > 1 ? 10 : 0;
    const choke = seals && seals(x, y) ? STRAND_PENALTY : 0;
    const sc = offRing - hubField[idx(x, y)] * 0.1 - choke;
    if (sc > linkSc) {
      linkSc = sc;
      link = { x, y };
    }
  }
  return link;
}

/**
 * LINK-FEASIBLE SEAT (the "links >= 4" gate, honestly).
 * The seat used to be picked purely on hauler distance and the link had to
 * make do with whatever ring the winner happened to have. In a boxed-in
 * source that lost the link outright and the room quietly shipped 3 links
 * forever. A seat one tile further from the hub that CAN carry a link is
 * worth far more than the tick it costs, so "has a legal link neighbour" is
 * now part of the seat's score — a hard shortfall only when no seat on the
 * whole ring can hold one.
 */
const NO_LINK_PENALTY = 30;

function claimSourceWorks(terrain, source, hubField, impassable, seals) {
  const seats = [];
  for (const [dx, dy] of D8) {
    const x = source.x + dx,
      y = source.y + dy;
    if (x < 1 || y < 1 || x > 48 || y > 48) continue;
    if (!walkable(terrain, x, y) || impassable.has(key(x, y))) continue;
    const d = hubField[idx(x, y)];
    if (d >= INF) continue;
    const link = bestLinkFor(terrain, source, { x, y }, hubField, impassable, null);
    seats.push({
      x,
      y,
      link,
      sc: d + rampartPenalty(terrain, x, y) + (link ? 0 : NO_LINK_PENALTY),
    });
  }
  if (!seats.length) return null;
  seats.sort((a, b) => a.sc - b.sc || a.x - b.x || a.y - b.y);
  const seat = seats[0];
  // The seat is settled; NOW re-price its link with the chokepoint test. The
  // ladder above ran without it on purpose — it only reads "link or no link",
  // which the penalty cannot change, and paying for the test on all eight seats
  // to answer a question about one of them is not a trade worth making.
  const link = seat.link ? bestLinkFor(terrain, source, seat, hubField, impassable, seals) : null;
  return { container: { x: seat.x, y: seat.y }, link };
}

/**
 * Controller link: cheb 2–3 from the controller so upgraders park between
 * link and controller, scored by how many parking tiles it feeds.
 *
 * A link with two or three park tiles throttles the upgrader fleet forever
 * (m9): the best-scoring tile is taken only if it feeds MIN_PARKS seats,
 * otherwise we walk down the ranked list and take the first that does. If
 * no candidate reaches the bar the roomiest one wins — reported in meta so
 * a genuinely cramped controller is visible rather than silently accepted.
 */
const MIN_PARKS = 4;
/**
 * A room at MIN_PARKS + 1 is one seat from throttling, which is a constraint
 * worth declaring, not a comfortable margin worth hiding. At or below this,
 * the room ships a `ctrlParks` shortfall carrying the seat search's evidence.
 */
const THIN_PARKS = 5;
function claimControllerWorks(terrain, controller, hubField, impassable, objectTiles, seals) {
  const cands = [];
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const ch = Math.max(Math.abs(dx), Math.abs(dy));
      if (ch < 2) continue; // inner ring belongs to upgraders
      const x = controller.x + dx,
        y = controller.y + dy;
      if (!buildable(terrain, x, y) || impassable.has(key(x, y))) continue;
      if (objectTiles.has(key(x, y))) continue;
      if (hubField[idx(x, y)] >= INF) continue;
      let park = 0;
      const parkTiles = [];
      for (const [ax, ay] of D8) {
        const px = x + ax,
          py = y + ay;
        if (!walkable(terrain, px, py)) continue;
        if (impassable.has(key(px, py)) || objectTiles.has(key(px, py))) continue;
        if (Math.max(Math.abs(px - controller.x), Math.abs(py - controller.y)) <= 3) {
          park++;
          // kept, not recounted: the seat tiles ARE the evidence for a thin
          // ctrlParks declaration, and the loop that knows them is this one.
          parkTiles.push({ x: px, y: py });
        }
      }
      const d = hubField[idx(x, y)];
      const sc = park * 2 - d * 0.5;
      cands.push({ x, y, sc, park, d, parkTiles });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.sc - a.sc);
  // SAME RULE AS THE SOURCE LINKS, applied as a partition rather than a score:
  // the park/roominess ladder below has two independent tie-breaks and a score
  // penalty would only reach one of them. A controller link that seals a pocket
  // is considered only when the controller offers nothing else.
  const clean = cands.filter((c) => !(seals && seals(c.x, c.y)));
  const pool = clean.length ? clean : cands;
  const roomy = pool.find((c) => c.park >= MIN_PARKS);
  let chosen = roomy;
  if (!chosen) {
    chosen = pool[0];
    for (const c of pool) if (c.park > chosen.park) chosen = c;
  }
  // CENSUS — the ladder above already computed every number here; keeping them
  // costs nothing and turns "ctrlParks: 5" into an argument that can be checked.
  // The runner-up is the roomiest tile the room could have had INSTEAD, ties
  // broken by the ladder's own score, so the trade it lost is legible.
  let runnerUp = null;
  for (const c of pool) {
    if (c === chosen) continue;
    if (!runnerUp || c.park > runnerUp.park || (c.park === runnerUp.park && c.sc > runnerUp.sc)) {
      runnerUp = c;
    }
  }
  const strip = (c) =>
    c ? { x: c.x, y: c.y, parks: c.park, hubWalk: c.d, score: Math.round(c.sc * 10) / 10 } : null;
  return {
    x: chosen.x,
    y: chosen.y,
    parks: chosen.park,
    parkTiles: chosen.parkTiles,
    census: {
      considered: cands.length,
      sealing: cands.length - clean.length,
      forcedOntoSealingPool: clean.length === 0,
      maxParks: pool.reduce((m, c) => Math.max(m, c.park), 0),
      minParksFloor: MIN_PARKS,
      tookFirstAboveFloor: !!roomy,
      chosen: strip(chosen),
      runnerUp: strip(runnerUp),
    },
  };
}

/**
 * A CONTROLLER SEAT AT THE FLOOR IS A CONSTRAINT, NOT A MARGIN.
 *
 * MIN_PARKS is 4 and the meta reports the achieved count, but a room shipping
 * 5 was indistinguishable from a room shipping 8 — one seat of slack read as
 * comfort. It is not: it is the terrain's ceiling or a trade the ladder made,
 * and either way it belongs in the shortfalls channel with the numbers that
 * forced it, not in a silent integer.
 */
function ctrlParksDetail(controller, ctrl) {
  const c = ctrl.census;
  const r = c.runnerUp;
  const rel =
    ctrl.parks < MIN_PARKS
      ? `${MIN_PARKS - ctrl.parks} BELOW the ${MIN_PARKS}-seat floor`
      : ctrl.parks === MIN_PARKS
        ? `exactly ON the ${MIN_PARKS}-seat floor`
        : `${ctrl.parks - MIN_PARKS} above the ${MIN_PARKS}-seat floor`;
  const parts = [];
  parts.push(
    `thin upgrader seat: the controller link at ${ctrl.x},${ctrl.y} feeds ${ctrl.parks} walkable ` +
      `parking tiles within range 3 of the controller at ${controller.x},${controller.y} — ` +
      `${rel}, which is a constraint and not a margin: lose one seat to a rampart, a road ` +
      `repair or a creep standing still and the upgrader fleet throttles.`,
  );
  parts.push(
    `Seat search, in numbers: ${c.considered} buildable link tiles at chebyshev 2–3 from the ` +
      `controller were reachable from the hub and considered` +
      (c.sealing
        ? `, of which ${c.sealing} were set aside for sealing a pocket off the basin` +
          (c.forcedOntoSealingPool
            ? ` — and every candidate did, so the seat had to come from the sealing pool anyway`
            : ``)
        : `, none of which sealed a pocket off the basin`) +
      `. The winner offered ${ctrl.parks} seats at ${c.chosen.hubWalk} walk steps from the hub ` +
      `(ladder score ${c.chosen.score} on park×2 − hubWalk÷2), and was taken as ` +
      (c.tookFirstAboveFloor
        ? `the highest-scoring tile that clears the ${MIN_PARKS}-seat floor`
        : `the roomiest tile on offer — no candidate cleared the ${MIN_PARKS}-seat floor at all`) +
      `.`,
  );
  if (!r) {
    parts.push(
      `There was no runner-up: the ring produced exactly one legal link tile, so ${ctrl.parks} ` +
        `seats is not a choice the planner made but the only seat the terrain sells.`,
    );
  } else if (r.parks > ctrl.parks) {
    parts.push(
      `The trade: a roomier seat existed — ${r.x},${r.y} feeds ${r.parks} tiles, ` +
        `${r.parks - ctrl.parks} more — but it sits ${r.hubWalk - c.chosen.hubWalk} walk steps ` +
        `further from the hub (${r.hubWalk} vs ${c.chosen.hubWalk}) and scores ${r.score} against ` +
        `${c.chosen.score}. That detour is paid on every pre-link hauler round trip and every ` +
        `repair walk to the controller for the life of the room, so the chosen seat won anyway; ` +
        `the seat count is what the room paid for the shorter haul.`,
    );
  } else {
    parts.push(
      `The trade was not available: the best alternative, ${r.x},${r.y}, feeds ${r.parks} ` +
        (r.parks === ctrl.parks ? `— the same count — ` : `— ${ctrl.parks - r.parks} fewer — `) +
        `at ${r.hubWalk} walk steps against the winner's ${c.chosen.hubWalk} (score ${r.score} vs ` +
        `${c.chosen.score}), and no tile anywhere in the ring fed more than ${c.maxParks}. ` +
        `${ctrl.parks} seats is therefore the room's ceiling, not a preference — the chosen tile ` +
        `won on hub distance among equals.`,
    );
  }
  return parts.join(" ");
}

/**
 * Controller CONTAINER — the pre-RCL7 upgrader bin.
 *
 * Before RCL7 there is no controller link (links are RCL5+ but the third
 * link only lands at 7 in this bot's order), so without a container the
 * upgraders walk to storage every single trip: the whole upgrade fleet
 * spends most of its life in transit. v1 got one for free because it pathed
 * storage->controller and dropped a container on the last tile; v2 planned
 * only the link, which left Structures.controllerLink/bin unset forever.
 *
 * The tile: walkable, chebyshev <= 3 of the controller (upgraders reach the
 * controller from it), D8-adjacent to the controller link (so at RCL7+ the
 * link tops the same seat up), off the plan's structures. Range EXACTLY 3
 * is strongly preferred — the bot's own discovery (creepFunctions filler /
 * ControllerLinkFiller) looks for a container at range 3 pre-RCL7, so a
 * closer seat would be planned and built and then never found.
 *
 * It joins structures.container AFTER the source containers and BEFORE the
 * mineral container (layer-misc) — that order is load-bearing for the
 * source-enclosure and mineral-seat logic in later layers. Rampart cover is
 * automatic: layer-shell bubbles every container that lands outside the
 * wall or inside a ranged attacker's reach.
 */
function claimControllerContainer(terrain, controller, ctrlLink, hubField, blockedSets) {
  let best = null;
  for (const [dx, dy] of D8) {
    const x = ctrlLink.x + dx,
      y = ctrlLink.y + dy;
    if (x < 1 || y < 1 || x > 48 || y > 48) continue;
    if (!walkable(terrain, x, y)) continue;
    const k = key(x, y);
    if (blockedSets.some((s) => s.has(k))) continue;
    const ch = chebyshev({ x, y }, controller);
    if (ch < 1 || ch > 3) continue;
    const d = hubField[idx(x, y)];
    if (d >= INF) continue;
    const sc = (ch === 3 ? 100 : 0) - d - rampartPenalty(terrain, x, y);
    if (!best || sc > best.sc) best = { x, y, sc };
  }
  return best ? { x: best.x, y: best.y } : null;
}

/**
 * The road network — ONE connected component, by construction:
 * every path is laid by descending the post-placement hub field, which
 * always terminates at the sitter. Serves: trio faces (roady hub), every
 * spawn, every source container, the controller link.
 */
function buildRoadNetwork(terrain, hubField, sitter, structures, impassable) {
  const roads = [];
  const roadSet = new Set();
  const noRoad = new Set(impassable);
  for (const c of structures.container || []) noRoad.add(key(c.x, c.y));

  const add = (x, y) => {
    const k = key(x, y);
    if (noRoad.has(k) || roadSet.has(k)) return;
    if (!roadOk(terrain, x, y)) return;
    roadSet.add(k);
    roads.push({ x, y });
  };

  // descend hubField to the sitter, paving as we go (skip impassable tiles)
  const paveToHub = (from) => {
    let cur = from;
    let guard = 0;
    while (hubField[idx(cur.x, cur.y)] > 0 && guard++ < 150) {
      let next = null;
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        if (!walkable(terrain, x, y) || impassable.has(key(x, y))) continue;
        if (hubField[idx(x, y)] >= hubField[idx(cur.x, cur.y)]) continue;
        if (!next || hubField[idx(x, y)] < hubField[idx(next.x, next.y)]) next = { x, y };
      }
      if (!next) break;
      add(next.x, next.y);
      cur = next;
    }
  };

  add(sitter.x, sitter.y);

  // roady hub: every free D4 face of the trio is paved for fillers
  for (const t of ["storage", "terminal"]) {
    for (const s of structures[t]) {
      for (const f of freeNeighbors4(terrain, s, impassable)) add(f.x, f.y);
    }
  }
  const hubLink = structures.link[0];
  for (const f of freeNeighbors4(terrain, hubLink, impassable)) add(f.x, f.y);

  // every spawn: pave its best face, then connect that face to the hub
  for (const s of structures.spawn) {
    let face = null;
    for (const f of freeNeighbors4(terrain, s, impassable)) {
      if (!face || hubField[idx(f.x, f.y)] < hubField[idx(face.x, face.y)]) face = f;
    }
    if (face) {
      add(face.x, face.y);
      paveToHub(face);
    }
  }

  // eco paths: from each container and the controller link back to the hub
  for (const c of structures.container || []) paveToHub(c);
  const ctrlLink = structures.link[structures.link.length - 1];
  for (const f of freeNeighbors4(terrain, ctrlLink, impassable)) {
    add(f.x, f.y);
    break;
  }
  paveToHub(ctrlLink);

  // unify: any road component not touching the sitter's gets stitched to
  // the network by the shortest walkable path (e.g. the trio's far faces)
  const containerSet = new Set((structures.container || []).map((c) => key(c.x, c.y)));
  for (let round = 0; round < 10; round++) {
    // main component from sitter (containers conduct — creeps walk over them)
    const comp = new Set([key(sitter.x, sitter.y)]);
    const cq = [sitter];
    let ci = 0;
    while (ci < cq.length) {
      const cur = cq[ci++];
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        const k = key(x, y);
        if (comp.has(k) || (!roadSet.has(k) && !containerSet.has(k))) continue;
        comp.add(k);
        cq.push({ x, y });
      }
    }
    const orphans = roads.filter((r) => !comp.has(key(r.x, r.y)));
    if (!orphans.length) break;
    // BFS from the whole main component to the nearest orphan tile
    const prev = new Map();
    const bq = [];
    for (const k of comp) {
      prev.set(k, null);
      const [x, y] = k.split(",").map(Number);
      bq.push({ x, y });
    }
    let bi = 0;
    let hit = null;
    while (bi < bq.length && !hit) {
      const cur = bq[bi++];
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        const k = key(x, y);
        if (prev.has(k)) continue;
        if (!walkable(terrain, x, y) || impassable.has(key(x, y))) continue;
        prev.set(k, key(cur.x, cur.y));
        if (!comp.has(k) && roadSet.has(k)) {
          hit = k;
          break;
        }
        bq.push({ x, y });
      }
    }
    if (!hit) break; // genuinely unreachable — checker will flag it
    let k = prev.get(hit);
    while (k && prev.get(k) !== undefined && prev.get(k) !== null) {
      const [x, y] = k.split(",").map(Number);
      add(x, y);
      k = prev.get(k);
    }
  }

  return roads;
}

/**
 * Invariant check: all roads one D8 component containing the sitter, and
 * every structure touches that component. Container tiles count as network
 * nodes — creeps walk over containers, so a path through one is intact.
 */
function checkRoadConnectivity(sitter, structures) {
  const roadSet = new Set(structures.road.map((r) => key(r.x, r.y)));
  for (const c of structures.container || []) roadSet.add(key(c.x, c.y));
  const comp = new Set();
  const q = [sitter];
  comp.add(key(sitter.x, sitter.y));
  let qi = 0;
  while (qi < q.length) {
    const cur = q[qi++];
    for (const [dx, dy] of D8) {
      const k = key(cur.x + dx, cur.y + dy);
      if (comp.has(k) || !roadSet.has(k)) continue;
      comp.add(k);
      q.push({ x: cur.x + dx, y: cur.y + dy });
    }
  }
  const orphanRoads = structures.road.filter((r) => !comp.has(key(r.x, r.y)));
  const touching = (p) => {
    for (const [dx, dy] of D8) {
      if (comp.has(key(p.x + dx, p.y + dy))) return true;
    }
    return false;
  };
  const orphanStructs = [];
  for (const t of ["storage", "terminal", "link", "spawn", "container"]) {
    for (const p of structures[t] || []) {
      if (!touching(p)) orphanStructs.push({ type: t, ...p });
    }
  }
  return { connected: orphanRoads.length === 0 && orphanStructs.length === 0, orphanRoads: orphanRoads.length, orphanStructs };
}

export function planHub(terrain, objects, opts = {}) {
  const sources = objects.filter((o) => o.type === "source").map((s) => ({ x: s.x, y: s.y }));
  const controllerObj = objects.find((o) => o.type === "controller");
  if (!controllerObj || sources.length < 1) {
    return { error: "no controller/sources" };
  }
  const controller = { x: controllerObj.x, y: controllerObj.y };
  const mineralObj = objects.find((o) => o.type === "mineral");
  const mineral = mineralObj ? { x: mineralObj.x, y: mineralObj.y } : null;

  // Object tiles are permanently occupied by an OBSTACLE (sources, the
  // controller and the mineral all block creep movement and reject every
  // construction site except road/container/rampart/extractor). Terrain
  // alone can't see them, which is how v2 once planned an extension on a
  // source. Built once, threaded through every layer from here on.
  const objectTiles = new Set([
    ...sources.map((s) => key(s.x, s.y)),
    key(controller.x, controller.y),
    ...(mineral ? [key(mineral.x, mineral.y)] : []),
  ]);

  // --- 1–3. Distance fields from anchors + distance transform ---
  const anchors = [...sources, controller];
  const fields = anchors.map((a) => distField(terrain, [a]));
  const dt = distanceTransform(terrain);

  // --- 4. Rank seed candidates by confluence + pocket depth ---
  const cands = [];
  for (let x = MIN_EDGE; x <= 49 - MIN_EDGE; x++) {
    for (let y = MIN_EDGE; y <= 49 - MIN_EDGE; y++) {
      const sc = seedScore(terrain, dt, x, y, fields, objectTiles);
      if (sc > -Infinity) cands.push({ x, y, sc });
    }
  }
  if (!cands.length) return { error: "no seed candidates (room too tight or anchors unreachable)" };
  cands.sort((a, b) => b.sc - a.sc);

  // --- 5. Space-budget gate: first candidate whose basin fits RCL8 ---
  // Ranked, not just picked: candidates that pass the budget keep their
  // confluence order, the rest fall back on raw roominess. `seedSkip` takes
  // the Nth entry instead of the first — the 60-extension guarantee uses it
  // to walk down this list when the winning pocket turns out too cramped
  // for the full program (a shell can only negotiate so much).
  const ranked = [];
  for (const c of cands.slice(0, 25)) {
    const info = growBasin(terrain, c, BASIN_RADIUS);
    ranked.push({ cand: c, info, pass: info.withinBudgetRadius >= SPACE_BUDGET });
  }
  const order = [
    ...ranked.filter((r) => r.pass),
    ...ranked
      .filter((r) => !r.pass)
      .sort((a, b) => b.info.withinBudgetRadius - a.info.withinBudgetRadius),
  ];
  const seedSkip = Math.max(0, Math.min(opts.seedSkip ?? 0, order.length - 1));
  const chosen = order[seedSkip];
  const seed = chosen.cand;
  const basinInfo = chosen.info;
  const budgetPass = chosen.pass;

  // --- 6. Core = first CORE_SIZE basin tiles (terrain-shaped pocket) ---
  const core = basinInfo.basin
    .filter((b) => !objectTiles.has(key(b.x, b.y)))
    .slice(0, CORE_SIZE)
    .map(({ x, y }) => ({ x, y }));
  if (core.length < 8) return { error: "core too small to grow hub", seed };
  const coreSet = new Set(core.map((p) => key(p.x, p.y)));

  // --- 7. Claim roles from the grown mass, oriented by the room ---
  const storage = claimStorage(terrain, dt, core, fields, objectTiles);
  if (!storage) return { error: "no storage claim in core", seed, coreSize: core.length };

  const dir = ecoDirection(storage, sources, controller);
  const trio = claimHubTrio(terrain, storage, dir, objectTiles);
  if (!trio) return { error: "hub trio does not fit around storage", seed };
  const { sitter, terminal, link } = trio;

  const blocked = new Set([
    ...objectTiles,
    key(storage.x, storage.y),
    key(terminal.x, terminal.y),
    key(link.x, link.y),
    key(sitter.x, sitter.y), // sitter is a reserved road tile, not buildable-over
  ]);

  const accessAfter = freeNeighbors4(terrain, storage, blocked).length;
  if (accessAfter < 1) return { error: "hub trio sealed storage", seed };

  const spawnFan = growSpawnsSpread(terrain, dt, core, coreSet, blocked, storage, 3);
  const spawn = spawnFan.spawns;
  if (spawn.length < 3) {
    return { error: `spawns only grew ${spawn.length}/3`, seed, coreSize: core.length };
  }

  // --- 8. Eco works at the anchors: containers + links ---
  // impassable = real structures (sitter stays walkable — it's a road)
  // object tiles are impassable too — a creep cannot walk over a source or
  // the controller, so no eco path or road may be routed across one either
  const impassable = new Set([
    ...objectTiles,
    key(storage.x, storage.y),
    key(terminal.x, terminal.y),
    key(link.x, link.y),
    ...spawn.map((s) => key(s.x, s.y)),
  ]);
  // hub distance on raw terrain for endpoint selection
  let hubField = fieldFrom(terrain, sitter, impassable);

  // Whether a tile is the way into a pocket, re-asked after every link we
  // commit — the links go down one at a time and each one narrows the graph the
  // next one is judged against. The memo is per-graph for the same reason.
  let seals = chokeTest(terrain, sitter, impassable);

  const sourceWorks = [];
  for (const src of sources) {
    const works = claimSourceWorks(terrain, src, hubField, impassable, seals);
    if (!works) return { error: `no container spot at source (${src.x},${src.y})`, seed };
    sourceWorks.push(works);
    if (works.link) {
      impassable.add(key(works.link.x, works.link.y));
      seals = chokeTest(terrain, sitter, impassable);
    }
  }
  const ctrlLink = claimControllerWorks(terrain, controller, hubField, impassable, objectTiles, seals);
  if (!ctrlLink) return { error: "no controller link spot", seed };
  impassable.add(key(ctrlLink.x, ctrlLink.y));

  // --- 9. Road network: one connected component serving everything ---
  // recompute hub field against final obstacles so paths stay valid
  hubField = fieldFrom(terrain, sitter, impassable);

  // a link may have claimed the only corridor to its own container
  // (narrow canyons) — drop any link that seals its container off
  for (const works of sourceWorks) {
    if (!works.link) continue;
    if (hubField[idx(works.container.x, works.container.y)] < INF) continue;
    impassable.delete(key(works.link.x, works.link.y));
    works.link = null;
    hubField = fieldFrom(terrain, sitter, impassable);
  }
  const containers = sourceWorks.map((w) => w.container);
  const sourceLinks = sourceWorks.filter((w) => w.link).map((w) => w.link);

  // DECLARED SHORTFALLS — the "honest shortfall" mechanism. A source whose
  // whole walkable ring has no seat with a buildable, non-conflicting link
  // tile beside it cannot have a source link, period. Saying so out loud is
  // the contract; shipping 3 links and a passing validator is not.
  const shortfalls = [];
  for (let i = 0; i < sources.length; i++) {
    if (sourceWorks[i].link) continue;
    const src = sources[i];
    const seat = sourceWorks[i].container;
    shortfalls.push({
      gate: "links",
      detail:
        `source ${src.x},${src.y} boxed in — no buildable link tile beside any ` +
        `walkable seat on its ring (seat ${seat.x},${seat.y})`,
      tiles: [{ x: src.x, y: src.y }],
    });
  }

  // THE FAN, DECLARED. A miss on the sector target is a real axis the room
  // beat the planner on, and it shipped as a bare `fanned:false` until now.
  if (!spawnFan.fanned) {
    shortfalls.push({
      gate: "spawnFan",
      kind: "sector",
      detail: spawnFanDetail(spawnFan, storage),
      tiles: spawn.map((s) => ({ x: s.x, y: s.y })),
      spawnFan: {
        minAngle: spawnFan.minAngle,
        target: SECTOR_TARGET,
        walkMax: spawnFan.walkMax,
        census: spawnFan.census,
      },
    });
  }

  // THE UPGRADER SEAT, DECLARED. MIN_PARKS is the floor; one seat above it is
  // still a room whose fleet has no slack, so THIN_PARKS and below is stated
  // out loud with the seat search's own numbers behind it.
  if ((ctrlLink.parks ?? 0) <= THIN_PARKS) {
    shortfalls.push({
      gate: "ctrlParks",
      kind: "seats",
      detail: ctrlParksDetail(controller, ctrlLink),
      tiles: [{ x: ctrlLink.x, y: ctrlLink.y }, ...(ctrlLink.parkTiles || [])],
      ctrlParks: {
        parks: ctrlLink.parks ?? 0,
        floor: MIN_PARKS,
        thinAt: THIN_PARKS,
        census: ctrlLink.census,
      },
    });
  }

  // upgrader bin — sources first, controller after, mineral last (layer 5)
  const ctrlContainer = claimControllerContainer(terrain, controller, ctrlLink, hubField, [
    impassable,
    new Set(containers.map((c) => key(c.x, c.y))),
    new Set([key(sitter.x, sitter.y)]),
  ]);
  if (ctrlContainer) containers.push(ctrlContainer);
  else {
    shortfalls.push({
      gate: "containers",
      detail:
        `controller ${controller.x},${controller.y} has no free walkable tile ` +
        `D8 of its link and within range 3 — no pre-RCL7 upgrader bin`,
      tiles: [{ x: controller.x, y: controller.y }],
    });
  }

  const structures = {
    storage: [{ x: storage.x, y: storage.y }],
    terminal: [terminal],
    // hub first, controller last (strip the scoring fields off the ctrl link)
    link: [link, ...sourceLinks, { x: ctrlLink.x, y: ctrlLink.y }],
    container: containers,
    spawn,
    road: [],
  };
  structures.road = buildRoadNetwork(terrain, hubField, sitter, structures, impassable);
  const conn = checkRoadConnectivity(sitter, structures);

  // path stats from fields (already grown)
  const iSt = idx(storage.x, storage.y);
  const pCtrl = fields[sources.length][iSt];
  let pSrc = 0;
  for (let s = 0; s < sources.length; s++) pSrc += fields[s][iSt];

  return {
    layer: "hub",
    hub: { x: storage.x, y: storage.y },
    seed,
    core, // for debug/render if wanted
    basin: basinInfo.basin, // {x,y,d} BFS order — layer 2 negotiates the shell over this
    sitter,
    structures,
    meta: {
      method: "grow-from-room-dt-oriented",
      seedSkip,
      seedPool: order.length,
      coreSize: core.length,
      seedScore: Math.round(cands[0].sc * 10) / 10,
      dtHub: dt[iSt],
      ecoDir: { x: Math.round(dir.x * 100) / 100, y: Math.round(dir.y * 100) / 100 },
      budget: {
        pass: budgetPass,
        tiles: basinInfo.withinBudgetRadius,
        need: SPACE_BUDGET,
        radius: BUDGET_RADIUS,
      },
      storageAccessD4: freeNeighbors4(terrain, storage, blocked).length + 1, // + sitter road face
      // the fan, measured — worst pairwise angular gap between spawns around
      // storage, the filler's longest leash, and whether the room had room
      // for the SECTOR_TARGET fan at all
      spawnFan: {
        minAngle: spawnFan.minAngle,
        walkMax: spawnFan.walkMax,
        fanned: spawnFan.fanned,
        proxyDepthMin: spawnFan.proxyDepthMin,
        target: SECTOR_TARGET,
        // the search's own bookkeeping — why the fan came out the way it did
        census: spawnFan.census,
      },
      pathController: pCtrl,
      pathSourcesSum: pSrc,
      ctrlParks: ctrlLink.parks ?? 0,
      // the seat search behind that integer: what was on offer and what lost
      ctrlParksCensus: ctrlLink.census ?? null,
      ctrlContainer: ctrlContainer ? { ...ctrlContainer, range: chebyshev(ctrlContainer, controller) } : null,
      roadConnected: conn.connected,
      roadOrphans: conn.orphanStructs,
      shortfalls,
      counts: {
        storage: 1,
        terminal: 1,
        link: structures.link.length,
        container: containers.length,
        spawn: spawn.length,
        road: structures.road.length,
      },
    },
    sources,
    controller,
    mineral,
    // C1: every later layer folds this into its own occupancy set
    objectTiles,
  };
}
