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

  // walk distance from storage over bare terrain minus the hub trio — the
  // real filler leash, not a chebyshev guess that a wall makes a lie of
  const walk = fieldFrom(terrain, storage, blocked);

  const viable = [];
  for (const p of pool) {
    const k = key(p.x, p.y);
    if (blocked.has(k)) continue;
    if (chebyshev(p, storage) < 2) continue; // keep the hub ring clear
    if (walk[idx(p.x, p.y)] > SPAWN_WALK_MAX) continue;
    const trial = new Set(blocked);
    trial.add(k);
    if (freeNeighbors4(terrain, storage, trial).length < 2) continue;
    const exits = freeNeighbors8(terrain, p, trial).length;
    if (exits < 3) continue; // creeps must be able to leave the spawn
    viable.push({
      x: p.x,
      y: p.y,
      exits,
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
        dt[idx(p.x, p.y)] * HUG_WEIGHT,
    });
  }
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
    const b = Math.floor(((c.ang + 360) % 360) / (360 / SECTOR_BINS));
    const cnt = bins.get(b) || 0;
    if (cnt >= PER_BIN) continue;
    bins.set(b, cnt + 1);
    take(c);
  }
  shortlist.sort((a, b) => a.x - b.x || a.y - b.y);

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
  for (const t of triples) {
    const set = [shortlist[t.i], shortlist[t.j], shortlist[t.k]];
    if (!jointOk(set)) continue;
    for (const s of set) blocked.add(key(s.x, s.y));
    return {
      spawns: set.map((s) => ({ x: s.x, y: s.y })),
      minAngle: Math.round(t.minAng),
      walkMax: Math.max(...set.map((s) => walk[idx(s.x, s.y)])),
      fanned: t.minAng >= SECTOR_TARGET,
    };
  }

  // FALLBACK — the pocket is too tight for any legal fan. Grow sequentially
  // the way the old code did so the room still gets three spawns, and let the
  // meta say how thin the fan came out.
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
  return {
    spawns,
    minAngle: spawns.length > 1 ? Math.round(minAngle) : 180,
    walkMax: spawns.length ? Math.max(...spawns.map((s) => walk[idx(s.x, s.y)])) : 0,
    fanned: false,
  };
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
 */
function bestLinkFor(terrain, source, seat, hubField, impassable) {
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
    const sc = offRing - hubField[idx(x, y)] * 0.1;
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

function claimSourceWorks(terrain, source, hubField, impassable) {
  const seats = [];
  for (const [dx, dy] of D8) {
    const x = source.x + dx,
      y = source.y + dy;
    if (x < 1 || y < 1 || x > 48 || y > 48) continue;
    if (!walkable(terrain, x, y) || impassable.has(key(x, y))) continue;
    const d = hubField[idx(x, y)];
    if (d >= INF) continue;
    const link = bestLinkFor(terrain, source, { x, y }, hubField, impassable);
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
  return { container: { x: seat.x, y: seat.y }, link: seat.link };
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
function claimControllerWorks(terrain, controller, hubField, impassable, objectTiles) {
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
      for (const [ax, ay] of D8) {
        const px = x + ax,
          py = y + ay;
        if (!walkable(terrain, px, py)) continue;
        if (impassable.has(key(px, py)) || objectTiles.has(key(px, py))) continue;
        if (Math.max(Math.abs(px - controller.x), Math.abs(py - controller.y)) <= 3) park++;
      }
      const sc = park * 2 - hubField[idx(x, y)] * 0.5;
      cands.push({ x, y, sc, park });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.sc - a.sc);
  const roomy = cands.find((c) => c.park >= MIN_PARKS);
  if (roomy) return { x: roomy.x, y: roomy.y, parks: roomy.park };
  let best = cands[0];
  for (const c of cands) if (c.park > best.park) best = c;
  return { x: best.x, y: best.y, parks: best.park };
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

  const sourceWorks = [];
  for (const src of sources) {
    const works = claimSourceWorks(terrain, src, hubField, impassable);
    if (!works) return { error: `no container spot at source (${src.x},${src.y})`, seed };
    sourceWorks.push(works);
    if (works.link) impassable.add(key(works.link.x, works.link.y));
  }
  const ctrlLink = claimControllerWorks(terrain, controller, hubField, impassable, objectTiles);
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
        target: SECTOR_TARGET,
      },
      pathController: pCtrl,
      pathSourcesSum: pSrc,
      ctrlParks: ctrlLink.parks ?? 0,
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
