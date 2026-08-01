/**
 * Layer 2 — Shell (distance-weighted min-cut, all ramparts, no openings)
 *
 * Shell BEFORE contents: the cut encloses the growth region the space-
 * budget gate reserved, so extensions (layer 6) can never place outside.
 *
 * Pipeline:
 *   1. Protect mask = hub structures + basin tiles within a negotiated
 *      radius (NOT the eco works at sources/controller — they get bubbles)
 *   2. Min-cut via Dinic max-flow. Tile capacity = SCALE*(1 + k*d²) + swamp
 *      bias, where d = walk distance from the protect mask — the cut still
 *      prefers real terrain chokes but refuses to wander far from home.
 *   3. Exterior = flood from the exits with the cut as walls. All later
 *      safety is measured against this region — ramparts have no openings
 *      (own creeps walk through ramparts, enemies don't), so there is no
 *      "door" loophole.
 *   4. Depth map = pure chebyshev distance to the exterior (attack range
 *      ignores walls — so must the safety check). Eco/tower tiles need
 *      depth ≥ 4 to be out of ranged-attacker (range 3) reach.
 *   5. NEGOTIATION: try protect radii 8..12; prefer the smallest cut that
 *      still leaves enough deep interior for the full RCL8 program. Size
 *      is negotiated BEFORE placement — never repaired after. Candidates
 *      carry their reachability AND their defender-mobility ratio, so a
 *      wall the garrison cannot lap loses to an equally cheap one that it
 *      can (at most +2 ramparts — upkeep is still the first objective).
 *   6. Bubbles: individual ramparts on the controller link + upgrader
 *      parks + source containers/links (harassment cover outside the wall).
 *   7. Battlements: cut tiles facing wide approach lanes — where the
 *      RampartDefenders should stand. Metadata for defence AI.
 */
import { D8, borderLegal, buildable, chebyshev, isSwamp, isWall, key, walkable } from "./shared.mjs";

const INF_FLOW = 1 << 28;
const EXIT_T = 5001;
const SRC_S = 5000;

// ------------------------------------------------------------------
// DEEP-SPACE DEMAND — derived from the program, not a magic floor.
//
// The old NEED_DEEP=85 was a static guess and it sat on a knife edge: real
// demand is ~115 deep tiles, so a room that cleared 85 with 91 deep tiles ran
// out of space in the extension layer, shipped a pile of shallow extensions
// and only got rescued by the pipeline's minUpkeepShell ladder. Worse, every
// unrelated layout change flipped rooms back and forth across the 85 edge —
// that edge was the dominant source of shallow-count noise between batches.
//
// So the floor is COUNTED instead. These are the pieces the LATER layers still
// have to put on deep interior; the hub trio, the hub link, the three spawns
// and the sitter are already standing when the shell negotiates and countDeep()
// has already excluded their tiles, so counting them again would buy wall we
// do not need.
const PROGRAM_EXTENSIONS = 60;
const PROGRAM_LABS = 10;
const PROGRAM_TOWERS = 6;
const PROGRAM_NUKER = 1;
const PROGRAM_OBSERVER = 1;
export const PROGRAM_TILES =
  PROGRAM_EXTENSIONS + PROGRAM_LABS + PROGRAM_TOWERS + PROGRAM_NUKER + PROGRAM_OBSERVER; // 78

// ...plus the corridor the program is fed through. Extensions flank ROADS, and
// every road tile the later layers dig comes out of the same deep pool. Measured
// over the fleet (159 rooms, roads placed after the shell that land on deep
// interior): min 14 · p10 26 · median 36 · mean 37 · p90 51 · max 60. A flat
// constant beat every per-room estimator tried — a swamp-fraction model
// (a + b·swampFrac) fits WORSE (MAE 9.5 vs 8.0 for a constant), because the
// road bill is driven by the 60-extension corridor pattern, not by terrain
// cost. The constant sits above the mean on purpose: needDeep is a FLOOR on a
// negotiation that usually over-delivers, and a floor that is a little generous
// costs a wider bubble in a handful of rooms while a floor that is short costs
// twenty personal ramparts in the extension layer.
// 45, and that is a swept number rather than a rounded mean. Fleet sweep of the
// constant (159 rooms, ramparts / shallow-extensions / rooms still walking the
// upkeep ladder / road median):
//   30 -> 7162 / 203 / 42 / 86      40 -> 7187 / 124 / 22 / 88
//   35 -> 7171 / 156 / 30 / 88      45 -> 7200 /  97 / 16 / 86
//   50 -> 7230 /  84 / 13 / 86      55 -> 7314 /  75 / 11 / 84
// Shallow structures fall monotonically and ramparts climb monotonically, so
// this is a straight trade; 45 is the last rung that still clears BOTH standing
// fleet gates (ramparts <= 7222, road median <= 87) — 50 breaks the rampart
// gate, 40 and 35 break the road gate.
const CORRIDOR_OVERHEAD = 45;
const NEED_DEEP = PROGRAM_TILES + CORRIDOR_OVERHEAD;

const MAX_CUT = 45;
const DEPTH_SAFE = 4; // ranged attacker reach is 3

// A rampart the interior cannot WALK to is a rampart no defender can hold, no
// repairer can stand on and no battlement can cover. We will pay this many
// extra wall tiles for a cut whose every tile is reachable; past that the room
// has genuinely beaten us and the shortfall gets declared instead of hidden.
const REACH_SWAP_BUDGET = 1;

// negotiation ladder. 13/14 exist so a room that cannot fit 60 extensions
// at the tight radii can buy more deep space by walling a bigger bubble.
const RADII = [6, 7, 8, 9, 10, 11, 12];
export const RADII_WIDE = [6, 7, 8, 9, 10, 11, 12, 13, 14];

// "enclose the eco when it is cheap" — how many extra cut tiles we will pay
// to pull the controller's upgrader area / a source's mining ring inside.
const ENCLOSE_CTRL_BUDGET = 4;
const ENCLOSE_SRC_BUDGET = 3;
const MAX_PARKS = 8;
// ...but a FAR controller may only be pulled inside when doing so does not pull
// the wall out of tower reach with it — see the note at the tryExpand call site.
const CTRL_ENCLOSE_MAX_WALK = 15;
const CTRL_ENCLOSE_MAX_REACH = 25;

// ------------------------------------------------------------------
// DEFENDER MOBILITY — the owner's rule, in numbers.
//
// "attacker walks 10, I refuse to walk 20": for a pair of wall tiles, the
// path a defender walks INSIDE must not be much longer than the path the
// attacker walks OUTSIDE between the same two tiles. Target ratio 1.2.
export const MOBILITY_TARGET = 1.2;
// A RampartDefender's ranged attack reaches 3. A pair of wall tiles needs no
// repositioning at all when a defender standing on either one already covers
// every tile an attacker could stand on to grind the other — then he shoots
// without walking and the lap is irrelevant.
//
// THE OLD RULE WAS UNSOUND. It skipped every pair within chebyshev 3, which
// silently forgave the exact case it was supposed to describe: an attacker
// grinding rampart B stands ADJACENT to B, i.e. up to chebyshev 4 from A, out
// of a range-3 defender's reach. Those pairs are real repositioning work and
// they were hidden. The test below is the operational statement spelled out:
// exclude a pair only when the exterior STANDS of each tile are covered from
// the other. (Chebyshev <= 2 always satisfies it — a stand is within 1 of its
// wall tile — so this is strictly the old rule minus the unsound cheb-3 band,
// plus the cheb-3 pairs whose terrain leaves no stand out of reach.)
const RANGED_RANGE = 3;
// Endpoint budget. The metric is EXACT all-pairs over every reachable cut tile
// up to this many endpoints — which covers the entire fleet (largest cut 75).
// The farthest-point sampler survives only as a fallback for a hypothetical
// monster shell, and any result that used it is labelled `sampled: true` so it
// can never be mistaken for the exact number. The old 32-endpoint sample was
// not merely imprecise: it MISSED the true worst pair in 17 rooms (E20S4 read
// 4.5 against a true 6.0) and let E19S8 slip under the 1.2 gate undeclared.
const MOBILITY_EXACT_MAX = 90;
const MOBILITY_ENDPOINTS = 32;
// THE EXTERIOR ARRIVAL BIAS.
//
// Both laps are measured tile-a-to-tile-b. The defender OCCUPIES both wall
// tiles, so `arriveAt` finds b in his own field and charges him nothing extra.
// The attacker occupies neither — he stands on the exterior tile beside each —
// so `arriveAt` fell through to the neighbour scan and charged him a phantom
// final step onto a tile he never sets foot on. That step inflated every
// exterior lap by one tile and flattered every ratio in the fleet (E20S3 read
// 7.5 against 10.0).
//
// Charging him NOTHING at either end is the fully symmetric model (his true
// work is stand-to-stand, i.e. raw - 2); it is reported as `maxStrict` on every
// measurement so the stricter truth is on the record. The gate deliberately
// uses raw - 1, the conservative half: at raw - 2 a pair of wall tiles four
// apart can measure an exterior lap of 1 and the ratio stops describing
// anything. So the shipped number is a LOWER BOUND on the defender's real
// disadvantage, never an over-statement.
const MOBILITY_ARRIVE_BIAS = 1;
// THE DETOUR FLOOR — the owner's ruling, applied to the arithmetic.
//
// The criterion is "attacker walks 10, I refuse to walk 20". It is a statement
// about a REAL detour: the garrison has to give up the wall and go the long way
// round. A ratio alone does not say that. Once the metric started measuring
// close pairs honestly (see the note above on the unsound cheb-3 skip), the
// fleet's ratio maximum became owned almost everywhere by a pair where the
// defender walks 3 and the attacker walks 2 — 1.5 on the nose, and one tick of
// actual work. 64 rooms "failed" the 1.2 target on detours of two tiles or
// less. That is arithmetic noise wearing the costume of a defect: it triggered
// ladder walks, it filled the fleet with declarations nobody can act on, and it
// buried the rooms where the defender genuinely walks 21 against an attacker's
// 3.
//
// So a pair counts AGAINST the target — for every VERDICT: the mobility
// tiebreak band, the eco-lobe veto, the cause diagnosis and the declaration —
// only when its absolute detour (din - dout) exceeds this many tiles. Nothing
// is hidden: `max`, `maxStrict`, `maxDetour`, `over` and `worst` still record
// every pair exactly as before, and the gated reading sits beside them.
// Four tiles is the smallest floor that is unambiguously a detour and not a
// rounding accident: eight ticks of an unboosted defender's time, one whole
// tower cooldown of grinding he cannot answer.
//
// WHAT THE FLOOR DELIBERATELY DOES NOT GATE: the pipeline's escalation
// TRIGGER. That was tried and measured. Reading the gated lap there stops 70
// rooms composing extra rungs and the fleet runs 74s -> 54s — and it costs
// 14 shallow extensions (81 -> 95) and 39 ramparts, because the rungs those
// rooms were composing "for mobility" were finding cheaper shells for other
// reasons and the ladder was keeping them. The trigger is a heuristic about
// where to LOOK, not a claim about whether the room is defective; the floor
// only governs the latter. Upkeep is the first objective, so the trigger keeps
// the raw reading and the fleet keeps its 81.
const MOBILITY_DETOUR_FLOOR = 4;
// Ramparts stay the primary currency. Mobility breaks ties and justifies at
// most this many extra wall tiles — never more.
const MOBILITY_TIEBREAK_BUDGET = 2;
// The eco-enclosure mobility guard (below) only fires for a room that has deep
// space to spare — needDeep is a FLOOR, and a room sitting on it needs every
// tile the eco lobe brings with it more than it needs a short lap. Swept over
// the fleet (guard margin -> rooms over the 1.2 target / shallow structures /
// road median / source enclosures):
//    off ->  99 / 97 / 86 / 174      +20 ->  92 / 97 / 86 / 172
//     +0 ->  86 /114 / 88 / 169      +40 ->  94 / 97 / 86 / 173
// At +0 the guard starves four rooms of interior and the extension layer pays
// it back in shallow structures, personal ramparts and corridor roads (one
// room even loses its 60th extension); at +20 the same guard is free.
const MOBILITY_GUARD_DEEP_MARGIN = 20;

function idx(x, y) {
  return x + y * 50;
}

/** Walk-distance field from a tile set over open terrain (D8). */
function fieldFromSet(terrain, set) {
  const dist = new Int16Array(2500).fill(9999);
  const q = [];
  for (const k of set) {
    const [x, y] = k.split(",").map(Number);
    dist[idx(x, y)] = 0;
    q.push(idx(x, y));
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
      if (!walkable(terrain, nx, ny)) continue;
      const ni = nx + ny * 50;
      if (dist[ni] <= dist[i] + 1) continue;
      dist[ni] = dist[i] + 1;
      q.push(ni);
    }
  }
  return dist;
}

/** Dinic max-flow. Node ids: top(i)=2i, bot(i)=2i+1, S=5000, T=5001. */
class Dinic {
  constructor(n) {
    this.n = n;
    this.head = new Int32Array(n).fill(-1);
    this.to = [];
    this.nxt = [];
    this.cap = [];
  }
  addEdge(u, v, c) {
    this.to.push(v);
    this.cap.push(c);
    this.nxt.push(this.head[u]);
    this.head[u] = this.to.length - 1;
    this.to.push(u);
    this.cap.push(0);
    this.nxt.push(this.head[v]);
    this.head[v] = this.to.length - 1;
  }
  bfs(s, t) {
    this.level = new Int32Array(this.n).fill(-1);
    this.level[s] = 0;
    const q = [s];
    let qi = 0;
    while (qi < q.length) {
      const u = q[qi++];
      for (let e = this.head[u]; e !== -1; e = this.nxt[e]) {
        if (this.cap[e] > 0 && this.level[this.to[e]] < 0) {
          this.level[this.to[e]] = this.level[u] + 1;
          q.push(this.to[e]);
        }
      }
    }
    return this.level[t] >= 0;
  }
  dfs(u, t, f) {
    if (u === t) return f;
    for (; this.iter[u] !== -1; this.iter[u] = this.nxt[this.iter[u]]) {
      const e = this.iter[u];
      const v = this.to[e];
      if (this.cap[e] > 0 && this.level[v] === this.level[u] + 1) {
        const d = this.dfs(v, t, Math.min(f, this.cap[e]));
        if (d > 0) {
          this.cap[e] -= d;
          this.cap[e ^ 1] += d;
          return d;
        }
      }
    }
    return 0;
  }
  maxflow(s, t) {
    let flow = 0;
    while (this.bfs(s, t)) {
      this.iter = Int32Array.from(this.head);
      let f;
      while ((f = this.dfs(s, t, INF_FLOW)) > 0) flow += f;
      if (flow > INF_FLOW) break; // disconnected protect/exit — bail
    }
    return flow;
  }
  /** residual reachability from s */
  reach(s) {
    const seen = new Uint8Array(this.n);
    seen[s] = 1;
    const q = [s];
    let qi = 0;
    while (qi < q.length) {
      const u = q[qi++];
      for (let e = this.head[u]; e !== -1; e = this.nxt[e]) {
        if (this.cap[e] > 0 && !seen[this.to[e]]) {
          seen[this.to[e]] = 1;
          q.push(this.to[e]);
        }
      }
    }
    return seen;
  }
}

/**
 * Distance-weighted min-cut. Returns { cut: [{x,y}], flow } or {error}.
 * opts: distWeight (k in 1+k*d², default 1), swampBias (extra capacity on
 * swamp tiles so the cut prefers plains — defenders move at full speed).
 */
/**
 * Tiles that can never be interior: the outer 2-tile band plus anything
 * D8-adjacent to an exit tile (walls are illegal there, so an enclosure
 * can't contain them). Protect masks must be clipped to this.
 */
export function computeUnwallable(terrain) {
  const unwallable = new Uint8Array(2500);
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (x < 2 || y < 2 || x > 47 || y > 47) unwallable[idx(x, y)] = 1;
    }
  }
  for (let i = 0; i < 50; i++) {
    for (const [ex, ey] of [
      [i, 0],
      [i, 49],
      [0, i],
      [49, i],
    ]) {
      if (!walkable(terrain, ex, ey)) continue;
      for (const [dx, dy] of D8) {
        const x = ex + dx,
          y = ey + dy;
        if (x >= 0 && x <= 49 && y >= 0 && y <= 49) unwallable[idx(x, y)] = 1;
      }
    }
  }
  return unwallable;
}

/**
 * Tiles that can never be PROTECTED: the exit-connected walkable part of
 * the unwallable band, plus anything D8-adjacent to it (the wall would
 * have to sit inside the band, which is illegal).
 */
export function computeUnprotectable(terrain) {
  const unw = computeUnwallable(terrain);
  const unsealable = new Uint8Array(2500);
  const q = [];
  for (let i = 0; i < 50; i++) {
    for (const [x, y] of [
      [i, 0],
      [i, 49],
      [0, i],
      [49, i],
    ]) {
      if (!walkable(terrain, x, y)) continue;
      const ii = idx(x, y);
      if (!unsealable[ii]) {
        unsealable[ii] = 1;
        q.push(ii);
      }
    }
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
      if (unsealable[ni] || !walkable(terrain, nx, ny) || !unw[ni]) continue;
      unsealable[ni] = 1;
      q.push(ni);
    }
  }
  const unprotectable = Uint8Array.from(unsealable);
  for (let i = 0; i < 2500; i++) {
    if (!unsealable[i]) continue;
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx <= 49 && ny <= 49) unprotectable[nx + ny * 50] = 1;
    }
  }
  return unprotectable;
}

export function computeCut(terrain, protectSet, opts = {}) {
  const k = opts.distWeight ?? 1;
  const swampBias = opts.swampBias ?? 2;
  const SCALE = 4;
  // TILES THE WALL MAY NOT USE. A rampart is a fighting position: the garrison
  // stands on it, the repairer stands on it, a battlement marks it. A tile that
  // already carries an OBSTACLE_OBJECT_TYPE structure — a link — can hold none
  // of that, so a cut through it is a hole in the perimeter dressed up as wall.
  // Giving those tiles infinite capacity (exactly like the unwallable exit band)
  // makes the min-cut route around them instead, at whatever the detour costs.
  // Containers and roads are NOT here on purpose: the engine lets creeps walk
  // over both, so a rampart on one is a perfectly good fighting position.
  const uncuttable = opts.uncuttable;

  const dP = fieldFromSet(terrain, protectSet);
  const unwallable = computeUnwallable(terrain);

  const g = new Dinic(5002);
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (!walkable(terrain, x, y)) continue;
      const i = idx(x, y);
      const isProtect = protectSet.has(key(x, y));
      const isExit = x === 0 || y === 0 || x === 49 || y === 49;
      let w;
      if (isProtect || unwallable[i] || (uncuttable && uncuttable.has(key(x, y)))) w = INF_FLOW;
      else {
        const d = dP[i] >= 9999 ? 20 : dP[i];
        w = Math.round(SCALE * (1 + k * d * d));
        // isSwamp() is wall-first: a code-3 (wall|swamp) tile is never walkable
        // and never reaches this line, so the bias only ever prices real swamp
        if (isSwamp(terrain, x, y)) w += swampBias;
      }
      g.addEdge(2 * i, 2 * i + 1, w);
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        if (!walkable(terrain, nx, ny)) continue;
        g.addEdge(2 * i + 1, 2 * idx(nx, ny), INF_FLOW);
      }
      if (isProtect) g.addEdge(SRC_S, 2 * i, INF_FLOW);
      if (isExit) g.addEdge(2 * i + 1, EXIT_T, INF_FLOW);
    }
  }

  const flow = g.maxflow(SRC_S, EXIT_T);
  if (flow >= INF_FLOW) return { error: "protect region touches exits — uncuttable" };

  const seen = g.reach(SRC_S);
  const cut = [];
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const i = idx(x, y);
      if (!walkable(terrain, x, y)) continue;
      if (seen[2 * i] && !seen[2 * i + 1]) cut.push({ x, y });
    }
  }
  return { cut, flow };
}

/** Exterior = flood from exits, cut tiles block. */
function exteriorFlood(terrain, cutSet) {
  const ext = new Uint8Array(2500);
  const q = [];
  for (let i = 0; i < 50; i++) {
    for (const [x, y] of [
      [i, 0],
      [i, 49],
      [0, i],
      [49, i],
    ]) {
      if (!walkable(terrain, x, y) || cutSet.has(key(x, y))) continue;
      const ii = idx(x, y);
      if (!ext[ii]) {
        ext[ii] = 1;
        q.push(ii);
      }
    }
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
      if (!walkable(terrain, nx, ny)) continue;
      if (cutSet.has(key(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (ext[ni]) continue;
      ext[ni] = 1;
      q.push(ni);
    }
  }
  return ext;
}

/**
 * Depth = pure chebyshev distance to the nearest exterior tile, THROUGH
 * walls — ranged attacks don't care about line of sight, so neither do we.
 */
function depthFromExterior(ext) {
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) {
    if (ext[i]) {
      depth[i] = 0;
      q.push(i);
    }
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

/**
 * D8 BFS distance field over a boolean tile mask. The seed is always allowed.
 *
 * This is the single hottest function in the planner — the exact all-pairs
 * mobility metric runs two of them per reachable cut tile, on every candidate
 * enclosure, on every rung of the escalation ladder. Hence the hand-rolled
 * shape: a module-scoped queue (the walk is synchronous and finishes before it
 * returns, so one buffer is safe and re-entrancy is impossible) and flat
 * neighbour deltas instead of destructuring D8's array-of-arrays 2500 times.
 * The returned field is freshly allocated because callers keep several alive.
 */
const BFS_Q = new Int32Array(2500);
const DX8 = Int8Array.from(D8.map((d) => d[0]));
const DY8 = Int8Array.from(D8.map((d) => d[1]));
export function bfsField(mask, from) {
  const dist = new Int16Array(2500).fill(-1);
  const q = BFS_Q;
  let head = 0,
    tail = 0;
  const fi = idx(from.x, from.y);
  dist[fi] = 0;
  q[tail++] = fi;
  while (head < tail) {
    const i = q[head++];
    const x = i % 50,
      y = (i / 50) | 0;
    const d = dist[i] + 1;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX8[k],
        ny = y + DY8[k];
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (dist[ni] >= 0 || !mask[ni]) continue;
      dist[ni] = d;
      q[tail++] = ni;
    }
  }
  return dist;
}

/**
 * Distance from a BFS field to a tile that may itself be off-mask — which is
 * exactly the attacker's case: he cannot STAND on our rampart, he stands next
 * to it and hits it. Both endpoints of every measured pair are wall tiles, so
 * both graphs pay the same "step off / step on" tax and the ratio stays a like
 * for like comparison.
 */
export function arriveAt(f, t) {
  const ti = idx(t.x, t.y);
  if (f[ti] >= 0) return f[ti];
  let best = Infinity;
  for (const [dx, dy] of D8) {
    const nx = t.x + dx,
      ny = t.y + dy;
    if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
    const v = f[nx + ny * 50];
    if (v >= 0 && v + 1 < best) best = v + 1;
  }
  return best;
}

/** Uint8Array tile mask from a set of "x,y" keys. */
export function maskFromKeys(set) {
  const m = new Uint8Array(2500);
  for (const k of set) {
    const [x, y] = k.split(",").map(Number);
    m[idx(x, y)] = 1;
  }
  return m;
}

/**
 * Deterministic farthest-point subset: seed with the farthest pair, then
 * repeatedly take the tile furthest from everything already chosen. No RNG,
 * no dependence on the order the cut was scanned in — ties are broken by
 * (x,y), and the result is re-sorted by (x,y) so the pair loop below is
 * order-stable too.
 */
function sampleEndpoints(ends, cap) {
  if (ends.length <= cap) return ends.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const sorted = ends.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  let bi = 0,
    bj = 1,
    bd = -1;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const d = chebyshev(sorted[i], sorted[j]);
      if (d > bd) {
        bd = d;
        bi = i;
        bj = j;
      }
    }
  }
  const chosen = [sorted[bi], sorted[bj]];
  const used = new Set([bi, bj]);
  while (chosen.length < cap) {
    let best = -1,
      bestD = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (used.has(i)) continue;
      let m = Infinity;
      for (const c of chosen) m = Math.min(m, chebyshev(sorted[i], c));
      if (m > bestD) {
        bestD = m;
        best = i;
      }
    }
    if (best < 0) break;
    used.add(best);
    chosen.push(sorted[best]);
  }
  return chosen.sort((a, b) => a.x - b.x || a.y - b.y);
}

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * DEFENDER MOBILITY — interior lap ÷ exterior lap, over pairs of wall tiles.
 *
 * The old version of this function was measuring something else entirely and
 * flattered the fleet by a factor of two:
 *   - it paired cut[s] with cut[s + n/2], but `cut` is scanned in column-major
 *     order, so that is NOT the antipodal tile — it is an arbitrary one, and
 *     the pairs were neither a lap nor a worst case;
 *   - it SKIPPED every pair closer than chebyshev 8, which is where almost
 *     every real failure lives (two wall plugs four tiles apart on either side
 *     of an interior mountain: attacker walks 4, defender walks 27);
 *   - it walked the whole non-exterior region, including wall segments the
 *     interior cannot actually reach and tiles occupied by the hub.
 * Fleet effect of the fix: rooms over the 1.2 target went 18 -> 105.
 *
 * The corrected metric:
 *   endpoints  cut tiles the interior walk region can reach (an unreachable
 *              rampart is already a declared battlement shortfall; measuring
 *              a lap to a tile no defender can stand on is double counting);
 *   defender   the interior walk region — ramparts included (own creeps walk
 *              their own ramparts), hub structures excluded (nobody walks
 *              through a spawn);
 *   attacker   the exterior region only — ramparts have no openings, so he
 *              cannot cut through the wall, and he cannot cut a corner that
 *              the defender cannot cut either (both graphs are plain D8,
 *              which is what the engine does: Screeps has no corner rule).
 */
/** exterior tiles an attacker can stand on to grind the wall tile `t` */
function exteriorStands(extMask, t) {
  const out = [];
  for (const [dx, dy] of D8) {
    const x = t.x + dx,
      y = t.y + dy;
    if (x < 0 || y < 0 || x > 49 || y > 49) continue;
    if (extMask[x + y * 50]) out.push({ x, y });
  }
  return out;
}
/** can a defender standing on `from` shoot anything grinding those stands? */
function coversStands(from, stands) {
  for (const s of stands) if (chebyshev(from, s) > RANGED_RANGE) return false;
  return true;
}

export function mobilityStats(cut, extMask, walkMask) {
  const reachable = cut.filter((c) => walkMask[idx(c.x, c.y)]);
  const sampled = reachable.length > MOBILITY_EXACT_MAX;
  const ends = sampled
    ? sampleEndpoints(reachable, MOBILITY_ENDPOINTS)
    : reachable.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const n = ends.length;
  const empty = {
    max: 0,
    mean: 0,
    p90: 0,
    pairs: 0,
    over: 0,
    endpoints: n,
    reachable: reachable.length,
    sampled,
    maxStrict: 0,
    worst: null,
    maxGated: 0,
    overGated: 0,
    gatedPairs: 0,
    worstGated: null,
    detourFloor: MOBILITY_DETOUR_FLOOR,
  };
  if (n < 2) return empty;
  const stands = ends.map((e) => exteriorStands(extMask, e));
  const inF = ends.map((e) => bfsField(walkMask, e));
  const outF = ends.map((e) => bfsField(extMask, e));
  const ratios = [];
  let max = 0;
  let maxStrict = 0;
  let worst = null;
  // ...and the worst pair by ABSOLUTE detour. Now that cheb-3 pairs are
  // measured (they used to be skipped), the ratio's maximum is frequently owned
  // by a pair where the defender walks 3 and the attacker walks 2 — arithmetic
  // that reads 1.5 and costs the garrison one tick. That is a true reading and
  // it stays the gate, but a reader triaging the fleet needs to tell it apart
  // from "the defender walks 25 while the attacker walks 2", so both are
  // reported and the declaration prints the raw walks either way.
  let maxDetour = 0;
  let worstDetour = null;
  // ...and the same maximum taken over the pairs that clear the detour floor —
  // the reading the target is judged on. See MOBILITY_DETOUR_FLOOR.
  let maxGated = 0;
  let worstGated = null;
  let gatedPairs = 0;
  let overGated = 0;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      // covered from BOTH sides: neither defender would have to move
      if (coversStands(ends[a], stands[b]) && coversStands(ends[b], stands[a])) continue;
      const din = arriveAt(inF[a], ends[b]);
      const raw = arriveAt(outF[a], ends[b]);
      if (!isFinite(din) || !isFinite(raw)) continue;
      const dout = raw - MOBILITY_ARRIVE_BIAS;
      if (dout <= 0) continue;
      const r = din / dout;
      ratios.push(r);
      if (raw - 2 > 0 && din / (raw - 2) > maxStrict) maxStrict = din / (raw - 2);
      if (din - dout > maxDetour) {
        maxDetour = din - dout;
        worstDetour = { a: ends[a], b: ends[b], din, dout, ratio: round2(r) };
      }
      if (din - dout > MOBILITY_DETOUR_FLOOR) {
        gatedPairs++;
        if (r > MOBILITY_TARGET) overGated++;
        if (r > maxGated) {
          maxGated = r;
          worstGated = { a: ends[a], b: ends[b], din, dout };
        }
      }
      if (r > max) {
        max = r;
        worst = { a: ends[a], b: ends[b], din, dout };
      }
    }
  }
  if (!ratios.length) return empty;
  ratios.sort((x, y) => x - y);
  return {
    max: round2(max),
    mean: round2(ratios.reduce((p, c) => p + c, 0) / ratios.length),
    // the max is a tail statistic — one terrain accident owns it. p90 says
    // whether the WHOLE wall is slow or just one corner of it.
    p90: round2(ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * 0.9))]),
    pairs: ratios.length,
    over: ratios.filter((r) => r > MOBILITY_TARGET).length,
    endpoints: n,
    // how many cut tiles were eligible at all — endpoints < reachable means the
    // sampler ran and the number is a floor, not the measurement
    reachable: reachable.length,
    sampled,
    // the fully symmetric stand-to-stand ratio (see MOBILITY_ARRIVE_BIAS): what
    // the number would be if the attacker were charged nothing at either end
    maxStrict: round2(maxStrict),
    // the longest extra walk on the wall, in tiles — the number that says
    // whether a failing ratio is a real detour or a rounding accident
    maxDetour,
    worstDetour,
    worst,
    // THE GATED READING (see MOBILITY_DETOUR_FLOOR): the same maximum, taken
    // only over pairs whose absolute detour exceeds the floor. This is what the
    // 1.2 target is judged on — escalation, the eco-lobe veto and the
    // declaration all read it. `max` above stays the complete record.
    maxGated: round2(maxGated),
    overGated,
    gatedPairs,
    worstGated,
    detourFloor: MOBILITY_DETOUR_FLOOR,
  };
}

/**
 * WHY is the worst pair slow? Three answers, and only one of them is the
 * shell's to fix:
 *   structures  the hub mass is in the way — re-walk with it removed and the
 *               detour disappears. The shell does not own the extension mass,
 *               so this is a report to the orchestrator, not a repair here.
 *   terrain     a natural wall INSIDE the enclosure (the classic ring-shaped
 *               basin around a mountain) — re-walk letting the defender pass
 *               through interior walls and the detour disappears.
 *   shape       neither: the enclosure itself is concave, and the attacker is
 *               simply cutting across a bay the defender has to walk around.
 *               This one the negotiation CAN sometimes beat, by buying a
 *               different cut.
 */
function mobilityCause(terrain, cut, extMask, worst) {
  if (!worst) return "none";
  const { a, b, din, dout } = worst;
  const noStructMask = new Uint8Array(2500);
  const noWallMask = new Uint8Array(2500);
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const i = idx(x, y);
      if (extMask[i]) continue;
      noWallMask[i] = 1;
      if (walkable(terrain, x, y)) noStructMask[i] = 1;
    }
  }
  for (const c of cut) {
    noStructMask[idx(c.x, c.y)] = 1;
    noWallMask[idx(c.x, c.y)] = 1;
  }
  const dStruct = arriveAt(bfsField(noStructMask, a), b);
  if (dStruct <= MOBILITY_TARGET * dout || dStruct * 1.15 <= din) return "structures";
  const dFree = arriveAt(bfsField(noWallMask, a), b);
  if (dFree <= MOBILITY_TARGET * dout || dFree * 1.15 <= dStruct) return "terrain";
  return "shape";
}

/**
 * THE SAME METRIC, MEASURED ON THE FINISHED BASE.
 *
 * planShell runs before the mass exists, so the number it negotiates against
 * only knows the hub trio and the object tiles. That is the right input for
 * the NEGOTIATION — the shell cannot choose a cut against structures that do
 * not exist yet — but it is not what the defender will walk at RCL8. So the
 * pipeline calls this once on the finished plan and files the answer next to
 * the negotiated one. Nothing reads it back; it exists so the difference
 * between "the shell the room allows" and "the base we actually built" is a
 * measured number instead of an argument.
 *
 * Obstacles per @screeps/engine OBSTACLE_OBJECT_TYPES: roads, containers and
 * our own ramparts are walkable, everything else is not.
 */
export const BUILT_OBSTACLES = [
  "spawn",
  "extension",
  "link",
  "storage",
  "tower",
  "observer",
  "lab",
  "terminal",
  "nuker",
];
export function builtMobility(terrain, plan) {
  if (!plan.shell || !plan.exterior) return null;
  const cut = plan.shell.cut;
  const cutSet = new Set(cut.map((c) => key(c.x, c.y)));
  const blocked = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures[t] || []) blocked.add(key(p.x, p.y));
  }
  const walk = interiorWalk(terrain, cutSet, plan.exterior, blocked, plan.sitter);
  const stats = mobilityStats(cut, plan.exterior, maskFromKeys(walk));
  return {
    max: stats.max,
    p90: stats.p90,
    mean: stats.mean,
    over: stats.over,
    pairs: stats.pairs,
    maxGated: stats.maxGated,
    overGated: stats.overGated,
    worstGated: stats.worstGated,
    // a cut tile the FINISHED base cannot walk to — the mass sealed it off
    walled: cut.length - cut.filter((c) => walk.has(key(c.x, c.y))).length,
    cause:
      stats.maxGated > MOBILITY_TARGET
        ? mobilityCause(terrain, cut, plan.exterior, stats.worstGated)
        : "none",
  };
}

/**
 * The enclosure is a CLOSED LOOP of ramparts *and natural walls* — the
 * min-cut buys terrain walls for free, which makes a rendered plan look
 * "open" where it is in fact sealed. These are the wall tiles that carry
 * the seal: D8-adjacent to both the interior and the exterior.
 */
function boundaryWalls(terrain, ext) {
  const out = [];
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (!isWall(terrain, x, y)) continue;
      let hasExt = false;
      let hasInt = false;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        if (!walkable(terrain, nx, ny)) continue;
        if (ext[nx + ny * 50]) hasExt = true;
        else hasInt = true;
        if (hasExt && hasInt) break;
      }
      if (hasExt && hasInt) out.push({ x, y });
    }
  }
  return out;
}

/**
 * THE INTERIOR WALK REGION — everything the owner can stand on inside its own
 * shell, flooded from the sitter.
 *
 * Ramparts are walkable by their owner, so the flood walks ALONG the cut (a
 * wall segment reached only by walking the wall is still reached — E11S4's
 * north lobe hangs off exactly one such isthmus) but it never steps past the
 * cut into the exterior. Hub structures block, because a creep cannot stand on
 * a spawn.
 *
 * This is the single definition of "reachable" the shell uses: for choosing
 * which cut to buy, for deciding where a defender may be told to stand, and
 * for declaring the shortfall when neither is possible.
 */
export function interiorWalk(terrain, cutSet, ext, occupied, sitter) {
  const seen = new Set([key(sitter.x, sitter.y)]);
  const q = [sitter];
  let qi = 0;
  while (qi < q.length) {
    const cur = q[qi++];
    for (const [dx, dy] of D8) {
      const x = cur.x + dx,
        y = cur.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      const k = key(x, y);
      if (seen.has(k) || !walkable(terrain, x, y)) continue;
      // the flood stops AT the cut rather than before it, and never crosses it
      if (!cutSet.has(k) && ext[idx(x, y)]) continue;
      if (occupied.has(k)) continue;
      seen.add(k);
      q.push({ x, y });
    }
  }
  return seen;
}

/**
 * Cut tiles the interior walk region cannot reach.
 *
 * ROOT CAUSE these exist at all: the min-cut only knows S-side / T-side, not
 * "one connected castle". When the protect mask contains a lobe that is walk-
 * separated from the basin — which is exactly what the eco-enclosure expansions
 * below build, since a controller box and a source ring are GEOMETRIC sets, not
 * walk-connected ones — Dinic happily buys two disjoint enclosures and seals
 * each one. The second enclosure's rampart ring is on the source side of the
 * cut and is therefore "inside", but the base can only get to it by walking
 * OUT through its own wall and back in. That is not a defended perimeter.
 */
function unreachableCut(cut, walkSet) {
  return cut.filter((c) => !walkSet.has(key(c.x, c.y)));
}

/** deep, buildable, unoccupied interior tiles left for the RCL8 program */
function countDeep(terrain, ext, depth, cutSet, occupied, roadSet) {
  let deep = 0;
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const i = idx(x, y);
      if (ext[i] || !buildable(terrain, x, y)) continue;
      const k = key(x, y);
      if (cutSet.has(k) || occupied.has(k) || roadSet.has(k)) continue;
      if (depth[i] >= DEPTH_SAFE) deep++;
    }
  }
  return deep;
}

export function planShell(terrain, plan, opts = {}) {
  const maxCut = opts.maxCut ?? MAX_CUT;
  // needDeep: absolute override wins, otherwise the derived program demand plus
  // whatever rung of the pipeline's escalation ladder we are on. The ladder
  // passes an OFFSET, not an absolute, so it stays anchored to real demand.
  const needDeep = opts.needDeep ?? NEED_DEEP + (opts.needDeepBonus ?? 0);
  const radii = opts.radii ?? RADII;

  // hub structures the shell must always contain
  const hubKeys = new Set();
  for (const t of ["storage", "terminal", "spawn"]) {
    for (const p of plan.structures[t]) hubKeys.add(key(p.x, p.y));
  }
  hubKeys.add(key(plan.structures.link[0].x, plan.structures.link[0].y)); // hub link only
  hubKeys.add(key(plan.sitter.x, plan.sitter.y));

  // basin tiles that can't be sealed off from the exits get clipped from
  // the protect mask — a hub structure there is a genuine error.
  const unprotectable = computeUnprotectable(terrain);
  for (const k of hubKeys) {
    const [x, y] = k.split(",").map(Number);
    if (unprotectable[idx(x, y)]) return { error: `hub structure at (${x},${y}) is unenclosable (exit band)` };
  }

  // C1: source/controller/mineral tiles can never hold a structure, so they
  // must not be counted as deep interior the RCL8 program could use either
  const objectTiles = plan.objectTiles || new Set();
  // WHAT THE SHELL MUST ENCLOSE IS NOT WHAT BLOCKS THE WALK. hubKeys is the
  // protect set; `occupied` is the obstacle set (and the "tile is spoken for"
  // set the space budget counts against), so it has to name every structure
  // already standing when layer 2 runs. Layer 1 places the per-source and
  // controller links as well as the hub trio, and a link is an
  // OBSTACLE_OBJECT_TYPE — leaving them out made the negotiation measure a walk
  // no creep will ever take. E19S1: the source link at 31,26 is the single free
  // tile between the basin and a source pocket, so the shell believed it could
  // walk that pocket, bought the eco ring around it, and the finished base
  // could not reach ten of those ramparts. Containers and roads stay OUT on
  // purpose — the engine lets creeps walk over both, and builtMobility models
  // them the same way.
  const occupied = new Set([...hubKeys, ...objectTiles]);
  for (const t of ["storage", "terminal", "spawn", "link"]) {
    for (const p of plan.structures[t] || []) occupied.add(key(p.x, p.y));
  }
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));

  // A GARRISON CANNOT STAND ON A LINK. Every link layer 1 placed — hub, per
  // source, controller — is fed to computeCut as an uncuttable tile, so the
  // min-cut routes the wall around it rather than through it. See the note on
  // `uncuttable` in computeCut.
  const linkKeys = new Set((plan.structures.link || []).map((l) => key(l.x, l.y)));

  // --- negotiation: smallest cut that still holds the RCL8 program ---
  //
  // A CANDIDATE IS A FUNCTION OF (seed, radius, link rule) AND NOTHING ELSE.
  // planHub reads only seedSkip, so for one seed every rung of the pipeline's
  // escalation ladder hands this function an identical layer-1 plan and asks it
  // to re-solve the identical max-flow at the identical radii — the rungs differ
  // only in `needDeep`, which is applied AFTER the candidates exist. That made
  // the escalation ladder cost four full min-cut sweeps per room for three
  // identical answers. `opts.shellCache` is a per-room, per-seed memo the
  // pipeline threads through; the entries are read-only (only the lazy `.mob`
  // field is filled in, and it is the same measurement either way).
  const cache = opts.shellCache;
  const buildAttempt = (r, cutOpts) => {
    const protect = new Set(hubKeys);
    for (const b of plan.basin) {
      if (b.d <= r && !unprotectable[idx(b.x, b.y)]) protect.add(key(b.x, b.y));
    }
    const res = computeCut(terrain, protect, cutOpts);
    if (res.error) return null;
    const cutSet = new Set(res.cut.map((c) => key(c.x, c.y)));
    const ext = exteriorFlood(terrain, cutSet);
    // sanity: protect must be sealed
    for (const k of protect) {
      const [x, y] = k.split(",").map(Number);
      if (ext[idx(x, y)]) return null;
    }
    const depth = depthFromExterior(ext);
    const deep = countDeep(terrain, ext, depth, cutSet, occupied, roadSet);
    // every candidate is judged on whether the base can WALK its own wall
    const walk = interiorWalk(terrain, cutSet, ext, occupied, plan.sitter);
    const unreach = unreachableCut(res.cut, walk);
    return { r, protect, cut: res.cut, cutSet, ext, depth, deep, unreach, walk, mob: null };
  };
  const negotiate = (cutOpts, tag) => {
    const out = [];
    for (const r of radii) {
      const ck = `${tag}|${r}`;
      let a;
      if (cache && cache.has(ck)) a = cache.get(ck);
      else {
        a = buildAttempt(r, cutOpts);
        if (cache) cache.set(ck, a);
      }
      if (a) out.push(a);
    }
    return out;
  };

  let cutOpts = { ...opts, uncuttable: linkKeys };
  let attempts = negotiate(cutOpts, "link-safe");
  // ...and if forbidding the link tiles leaves the room with no enclosure at
  // all, the link genuinely sits on the only isthmus this basin has. Then the
  // wall goes through it and the shortfall is DECLARED by name at the bottom —
  // never silently swapped for a fighting position no creep can occupy.
  let linkCutForced = false;
  if (!attempts.length) {
    cutOpts = { ...opts };
    attempts = negotiate(cutOpts, "link-through");
    linkCutForced = attempts.length > 0;
  }
  if (!attempts.length) return { error: "no viable cut at any radius" };

  // Candidates carry their own defender-mobility number, computed on demand:
  // the negotiation below only asks for it when it is about to matter, so a
  // room that is already inside the target pays for exactly one measurement.
  const mobilityOf = (a) => {
    if (!a.mob) a.mob = mobilityStats(a.cut, a.ext, maskFromKeys(a.walk));
    return a.mob;
  };

  // pick: cheapest wall that still fits the program; the maxCut cap is a
  // quality flag, not a hard gate — open rooms are legitimately pricier
  const fits = attempts.filter((a) => a.deep >= needDeep);
  let pick;
  let poolForSwap;
  if (fits.length) {
    fits.sort((a, b) => a.cut.length - b.cut.length || b.deep - a.deep);
    pick = fits[0];
    poolForSwap = fits;
  } else {
    attempts.sort((a, b) => b.deep - a.deep || a.cut.length - b.cut.length);
    pick = attempts[0];
    poolForSwap = attempts;
  }
  // PREFER A CUT THE BASE CAN WALK. If the cheapest candidate rings a lobe the
  // interior cannot reach, and another candidate of comparable price has no
  // such lobe, buy that one instead — a rampart a defender cannot stand on is
  // not cheaper wall, it is wall that does not defend. The swap budget is one
  // tile: past that the alternative is a real bill and the honest answer is a
  // declared shortfall, not a silently pricier shell.
  //
  // The alternative is remembered either way — when we cannot afford the swap
  // it is the MEASURED substitute cost that goes into the shortfall detail.
  const cheapestOf = (list) =>
    list.length ? list.reduce((best, a) => (a.cut.length < best.cut.length ? a : best)) : null;
  // the swap may only consider candidates that still hold the program — and
  // when NO candidate holds it, `pick` is the roomiest enclosure this room
  // offers and reachability does not get to spend that. The same guard the
  // mobility tiebreak below uses, for the same reason: in a deep-starved room
  // every tile of interior the swap gives away comes back as an extension in
  // the shallow band renting a personal rampart forever. E20S5 traded 17 deep
  // tiles for one reachable rampart exactly this way.
  const swapAlt = cheapestOf(
    poolForSwap.filter((a) => !a.unreach.length && (fits.length || a.deep >= pick.deep)),
  );
  // ...but the shortfall reports the whole truth, including a reachable cut we
  // had to refuse because it starves the extension layer. That report wants the
  // CLOSEST substitute — the roomiest fully-reachable enclosure — not the
  // cheapest one, or the measured trade reads as far worse than it is.
  const reachableAll = attempts.filter((a) => !a.unreach.length);
  const reachAlt = reachableAll.length
    ? reachableAll.reduce((best, a) => (a.deep > best.deep || (a.deep === best.deep && a.cut.length < best.cut.length) ? a : best))
    : null;
  if (pick.unreach.length && swapAlt && swapAlt.cut.length <= pick.cut.length + REACH_SWAP_BUDGET) {
    pick = swapAlt;
  }

  // ------------------------------------------------------------------
  // MOBILITY TIEBREAK — same wall bill, shorter lap.
  //
  // The candidates already carry their cut and their reachability; adding
  // their mobility costs one BFS pair per wall tile and lets the negotiation
  // answer a question it could not answer before: of the enclosures this room
  // can afford, which one can the garrison actually walk? Ramparts stay the
  // primary currency — an alternative is only eligible if it costs at most
  // MOBILITY_TIEBREAK_BUDGET extra wall tiles and is no worse on reachability
  // — so this can never buy a mobile shell by paying for a fat one.
  //
  // Skipped entirely when the incumbent is already inside the target: nothing
  // to win, and the whole fleet would pay the measurement.
  //
  // A swap must also EARN the churn. Two ways to earn it, and nothing else:
  //   - it reaches the target (the room stops being a mobility problem), or
  //   - it improves the lap without costing deep interior.
  // Anything looser measured worse: an "any improvement" rule bought 3 more
  // rooms a shorter lap and paid for it with 18 extra ramparts and a road
  // median that moved the wrong way, because a same-price cut of a different
  // SHAPE re-routes the whole extension corridor behind it. Mobility is worth
  // a tile of wall; it is not worth reshaping a base that already works.
  // ------------------------------------------------------------------
  let mobilityBandBest = null;
  let mobilityBandSize = 0;
  if (mobilityOf(pick).maxGated > MOBILITY_TARGET) {
    const band = poolForSwap.filter(
      (a) =>
        a.cut.length <= pick.cut.length + MOBILITY_TIEBREAK_BUDGET &&
        a.unreach.length <= pick.unreach.length &&
        // when NO candidate holds the program, deep space is the scarce thing
        // in this room and mobility does not get to spend it
        (fits.length || a.deep >= pick.deep),
    );
    mobilityBandSize = band.length;
    let best = pick;
    for (const a of band) {
      if (a === pick) continue;
      const m = mobilityOf(a);
      const bm = mobilityOf(best);
      const earned =
        m.maxGated <= bm.maxGated - 0.001 && (m.maxGated <= MOBILITY_TARGET || a.deep >= pick.deep);
      if (
        earned ||
        (m.maxGated === bm.maxGated && a.cut.length < best.cut.length) ||
        (m.maxGated === bm.maxGated && a.cut.length === best.cut.length && a.deep > best.deep) ||
        (m.maxGated === bm.maxGated &&
          a.cut.length === best.cut.length &&
          a.deep === best.deep &&
          a.r < best.r)
      ) {
        best = a;
      }
    }
    mobilityBandBest = mobilityOf(best).maxGated;
    pick = best;
  }
  const priceyWall = pick.cut.length > maxCut; // open room, expensive to enclose

  // ------------------------------------------------------------------
  // ENCLOSE THE ECO WHEN IT IS CHEAP
  // Owner: "if I can get a source inside the rampart area then good" and
  // "the controller belongs in the main base". So after the base cut is
  // chosen we try up to three protect-expansions and keep each one only
  // if the wall barely grows. A source/controller inside the shell needs
  // no bubble, no harassment cover and no defender excursion.
  // ------------------------------------------------------------------
  let protect = pick.protect;
  let cut = pick.cut;
  let cutSet = pick.cutSet;
  let extF = pick.ext;
  let depthF = pick.depth;
  let unreachF = pick.unreach;
  let walkF = pick.walk;
  let mobF = mobilityOf(pick);
  const baseCut = pick.cut.length;
  // whether the eco-enclosure mobility guard below is allowed to veto at all —
  // see the note on it. Fixed here because `pick` is settled from this point on.
  const guardIsFree = pick.deep >= needDeep + MOBILITY_GUARD_DEEP_MARGIN;

  const tryExpand = (tiles, budget, veto) => {
    const cand = new Set(protect);
    let added = 0;
    for (const t of tiles) {
      if (!t) continue;
      const i = idx(t.x, t.y);
      // clipped by unprotectable: tiles in the exit band can never be walled
      if (!walkable(terrain, t.x, t.y) || unprotectable[i]) continue;
      const k = key(t.x, t.y);
      if (!cand.has(k)) {
        cand.add(k);
        added++;
      }
    }
    if (!added) return true; // already inside
    const res = computeCut(terrain, cand, cutOpts);
    if (res.error) return false;
    if (res.cut.length > cut.length + budget) return false;
    if (veto && veto(res.cut)) return false;
    const cs = new Set(res.cut.map((c) => key(c.x, c.y)));
    const e = exteriorFlood(terrain, cs);
    for (const k of cand) {
      const [x, y] = k.split(",").map(Number);
      if (e[idx(x, y)]) return false; // leaked — reject
    }
    // NOT-LEAKED IS NOT THE SAME AS ENCLOSED. A controller box and a source
    // ring are geometric sets; when the lobe they sit in is walk-separated from
    // the basin, the min-cut answers by building a SECOND castle around it. The
    // leak test above passes that happily — the tiles are on the source side —
    // but the base can only reach that ring by walking out through its own wall,
    // no defender can hold it and no battlement can cover it. An enclosure the
    // garrison cannot walk to is not an enclosure; refuse to buy it and let the
    // eco works take personal bubbles instead.
    const w = interiorWalk(terrain, cs, e, occupied, plan.sitter);
    const u = unreachableCut(res.cut, w);
    if (u.length > unreachF.length) return false;
    // ...AND AN ENCLOSURE THE GARRISON CANNOT LAP IS NOT AN ENCLOSURE EITHER.
    // An eco lobe that doubles the defender's walk is rent, not value: the
    // source inside saves a few hauler steps forever and costs the wall its
    // one real advantage — interior lines. So an expansion that pushes the
    // room out of the mobility target when it was inside it is refused, and
    // the eco works take personal bubbles instead (which is what they would
    // have had anyway).
    //
    // The bar is "no worse than the shell we already negotiated, and not over
    // the target": an eco lobe may not push a compliant room over the line NOR
    // lengthen the lap of a room that is already struggling. The second half
    // matters more than it looks — the negotiation measures candidates BEFORE
    // the eco lobes are bid for, so without it a room could be handed the most
    // mobile enclosure available and then have that enclosure dragged out of
    // shape by a source ring three tiles later (E17S9 went 1.25 -> 2.0 exactly
    // that way).
    //
    // The veto is only allowed where it is FREE: the base enclosure must
    // already hold the program with MOBILITY_GUARD_DEEP_MARGIN tiles to spare.
    // In a room living on the floor, the lobe is not decoration — it is the
    // interior the extension layer is about to need, and refusing it buys a
    // short lap with shallow structures, personal ramparts and longer roads.
    let m = null;
    if (guardIsFree) {
      m = mobilityStats(res.cut, e, maskFromKeys(w));
      if (m.maxGated > MOBILITY_TARGET && m.maxGated > mobF.maxGated + 0.001) return false;
    }
    protect = cand;
    cut = res.cut;
    cutSet = cs;
    extF = e;
    depthF = depthFromExterior(e);
    unreachF = u;
    walkF = w;
    // the incumbent ratio moves with the enclosure, so the next expansion is
    // judged against what this one actually left behind. Only measured when the
    // guard was armed; in a space-starved room nothing reads it.
    if (m) mobF = m;
    return true;
  };

  const ctrlLink = plan.structures.link[plan.structures.link.length - 1];
  const ctrl = plan.controller;
  const parkTiles = [];
  for (const [dx, dy] of D8) {
    const x = ctrlLink.x + dx,
      y = ctrlLink.y + dy;
    if (!walkable(terrain, x, y)) continue;
    if (chebyshev({ x, y }, ctrl) > 3) continue;
    if (parkTiles.length >= MAX_PARKS) break;
    parkTiles.push({ x, y });
  }

  // (a) controller upgrader area: walkable tiles within range 2 of the
  //     controller, plus the controller link and its park tiles.
  const ctrlArea = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const x = ctrl.x + dx,
        y = ctrl.y + dy;
      if (walkable(terrain, x, y)) ctrlArea.push({ x, y });
    }
  }
  ctrlArea.push(ctrlLink, ...parkTiles);
  // A DISTANT CONTROLLER DOES NOT GET THE WALL DRAGGED OUT TO IT.
  //
  // ENCLOSE_CTRL_BUDGET caps how many extra CUT TILES the expansion may cost,
  // and that turned out to be the wrong currency. E19S10's controller is a
  // 29-tile walk from the hub; the expansion bought its enclosure for under 4
  // extra cut tiles by stretching the shell 28 tiles west into a long finger —
  // same wall bill, completely different SHAPE, and the shape is what the
  // towers have to cover. It shipped the fleet's only sub-1500 wall face (900
  // damage, next worst 1440) and the fleet's only towerCoverage declaration.
  // The goal document already says what a far controller gets instead:
  // "rampart ONLY its adjacent ring (denies claim-attack stands) + link +
  // container. Nothing wider."
  //
  // So the currency is REACH, and the gate has both limbs the failure had:
  //   walk   how far the controller is. 88 of the 90 rooms that enclose their
  //          controller do it at pathController <= 15 (p50 6, p90 13); only
  //          E21S0 (19) and E19S10 (29) are past it. Under the line nothing is
  //          checked at all — a near controller cannot stretch anything.
  //   reach  chebyshev from the sitter to the furthest tile of the RESULTING
  //          cut, which is what tower falloff actually cares about (a tower
  //          does 150 damage past chebyshev 20). Across the fleet this runs
  //          p50 12 / p90 15, and the largest shell no expansion stretched is
  //          25 — so 25 is "no further out than this room shape reaches on its
  //          own". E19S10's controller lobe takes it to 31 and is refused;
  //          E21S0's takes it to 21, keeps its enclosure, and keeps a healthy
  //          1890-damage weakest face.
  const ctrlWalk = plan.meta?.pathController ?? 0;
  const reachOf = (tiles) => tiles.reduce((m, c) => Math.max(m, chebyshev(c, plan.sitter)), 0);
  const ctrlVeto =
    ctrlWalk > CTRL_ENCLOSE_MAX_WALK ? (trialCut) => reachOf(trialCut) > CTRL_ENCLOSE_MAX_REACH : null;
  const ctrlEnclosed = tryExpand(ctrlArea, ENCLOSE_CTRL_BUDGET, ctrlVeto);
  const ctrlEncloseRefused = !!ctrlVeto && !ctrlEnclosed;

  // (b) each source's walkable ring + its container/link
  const srcLinks = plan.structures.link.slice(1, plan.structures.link.length - 1);
  for (const s of plan.sources) {
    const ring = [];
    for (const [dx, dy] of D8) {
      const x = s.x + dx,
        y = s.y + dy;
      if (walkable(terrain, x, y)) ring.push({ x, y });
    }
    for (const c of plan.structures.container) if (chebyshev(c, s) <= 1) ring.push(c);
    for (const l of srcLinks) if (chebyshev(l, s) <= 2) ring.push(l);
    tryExpand(ring, ENCLOSE_SRC_BUDGET);
  }

  // ------------------------------------------------------------------
  // WALL THAT PROTECTS NOTHING — an exact removal test, not a heuristic.
  //
  // Dinic returns a MINIMUM-CAPACITY cut, which is not the same thing as a
  // minimal SET: when a lobe is sealed twice over (an outer ring plus a second
  // ring behind it, or a ring around a pocket the base cannot walk to anyway)
  // the inner tiles are in the cut, cost 3 e/tick each forever, and defend
  // nothing. E20S10 shipped six of them and then DECLARED them as a battlement
  // shortfall — "no defender can stand there" — when the honest answer was to
  // stop buying them.
  //
  // The test is exact and it is the only one that means anything: delete the
  // tile, re-flood the exterior, and keep the deletion only if NOTHING MOVES —
  // every tile the base can walk, every hub structure and every eco structure
  // keeps exactly the exterior flag and the chebyshev depth it had. Safety,
  // tower cover and bubble decisions are all functions of those two numbers, so
  // if neither moved, none of them can. A rampart the garrison can actually
  // reach fails this immediately (delete it and it becomes exterior itself), so
  // only doubled wall and rings around pockets we never owned can go.
  //
  // Deliberately NOT part of the guard: the protect mask. plan.basin is flooded
  // over raw terrain at layer 1, so it happily contains pockets that the layer-1
  // links then seal off from the base — and demanding those stay walled is
  // exactly how E20S10 came to buy six ramparts around a lobe no creep of ours
  // can enter. The walk region is the honest statement of what we own.
  // Bubbles are untouched: they are not part of the cut.
  const uselessCut = [];
  {
    const mustHold = new Set(walkF);
    for (const k of hubKeys) mustHold.add(k);
    for (const t of ["link", "container"]) {
      for (const p of plan.structures[t] || []) mustHold.add(key(p.x, p.y));
    }
    // fast reject: a reachable cut tile that faces the exterior turns INTO
    // exterior the moment it is deleted, so it can never pass the test
    const facesExterior = (c) => {
      for (const [dx, dy] of D8) {
        const x = c.x + dx,
          y = c.y + dy;
        if (x < 0 || y < 0 || x > 49 || y > 49) continue;
        if (extF[idx(x, y)]) return true;
      }
      return false;
    };
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of cut) {
        if (walkF.has(key(c.x, c.y)) && facesExterior(c)) continue;
        const trial = new Set(cutSet);
        trial.delete(key(c.x, c.y));
        const e = exteriorFlood(terrain, trial);
        const d = depthFromExterior(e);
        let ok = true;
        for (const k of mustHold) {
          const [x, y] = k.split(",").map(Number);
          const i = idx(x, y);
          if (e[i] !== extF[i] || d[i] !== depthF[i]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        cut = cut.filter((o) => o !== c);
        cutSet = trial;
        extF = e;
        depthF = d;
        walkF = interiorWalk(terrain, cutSet, extF, occupied, plan.sitter);
        for (const k of walkF) mustHold.add(k);
        unreachF = unreachableCut(cut, walkF);
        uselessCut.push({ x: c.x, y: c.y });
        changed = true;
        break;
      }
    }
    // the incumbent mobility number belongs to the cut we are actually holding
    if (uselessCut.length) mobF = mobilityStats(cut, extF, maskFromKeys(walkF));
  }

  const deepTiles = countDeep(terrain, extF, depthF, cutSet, occupied, roadSet);
  const budgetPass = deepTiles >= needDeep; // space for the RCL8 program

  // enclosure verdicts read off the FINAL exterior, never off the attempts
  const outside = (p) => !!extF[idx(p.x, p.y)];
  const ctrlRing = [];
  for (const [dx, dy] of D8) {
    const x = ctrl.x + dx,
      y = ctrl.y + dy;
    if (walkable(terrain, x, y)) ctrlRing.push({ x, y });
  }
  const enclosedController = !outside(ctrlLink) && ctrlRing.every((p) => !outside(p));
  // ------------------------------------------------------------------
  // "ENCLOSED" MEANT TWO DIFFERENT THINGS AND THE HEADLINE TOOK THE FLATTERING
  // ONE.
  //
  // The controller's verdict has always been strict: its LINK and every walkable
  // tile of its ring must be inside. A source's verdict tested only the works —
  // its container and its link — so a source whose seat is inside the wall and
  // whose remaining three walkable ring tiles are outside it counted as
  // enclosed, and the fleet headline said 174/318. That is a real and useful
  // number (the works are what an attacker actually breaks), but it is not what
  // "enclosed source" sounds like: an attacker standing on an unwalled ring tile
  // is standing next to our miner.
  //
  // Both are computed, both are reported, and the STRICT one is the headline —
  // the same rule the controller is held to.
  // ------------------------------------------------------------------
  let enclosedSources = 0;
  let enclosedSourceWorks = 0;
  const srcEnclosed = plan.sources.map((s) => {
    const mine = [
      ...plan.structures.container.filter((c) => chebyshev(c, s) <= 1),
      ...srcLinks.filter((l) => chebyshev(l, s) <= 2),
    ];
    const works = mine.length > 0 && mine.every((p) => !outside(p));
    if (works) enclosedSourceWorks++;
    const ring = [];
    for (const [dx, dy] of D8) {
      const x = s.x + dx,
        y = s.y + dy;
      if (walkable(terrain, x, y)) ring.push({ x, y });
    }
    const strict = works && ring.every((p) => !outside(p));
    if (strict) enclosedSources++;
    return strict;
  });

  // --- bubbles: eco works the shell does NOT cover get personal ramparts ---
  // A tile needs one when it sits outside the wall, or inside but within a
  // ranged attacker's reach (depth < 4). Anything enclosed AND deep is
  // already covered by the shell — a bubble there is pure upkeep.
  const bubble = [];
  const bubbleRejected = [];
  const addBubble = (p) => {
    if (!p) return;
    const i = idx(p.x, p.y);
    if (!extF[i] && depthF[i] >= DEPTH_SAFE) return; // redundant
    // ENGINE BORDER RULE (utils.js:120-143): a rampart at x/y 1 or 48 needs all
    // three adjacent room-EDGE tiles to be natural wall, or the site is
    // ERR_INVALID_TARGET forever. Shipping one is worse than shipping none: it
    // never builds, and the tile LOOKS covered on every render and in the
    // upkeep quote. Record it as a shortfall instead.
    if (!borderLegal(terrain, p.x, p.y, "rampart")) {
      if (!bubbleRejected.some((b) => b.x === p.x && b.y === p.y)) {
        bubbleRejected.push({ x: p.x, y: p.y });
      }
      return;
    }
    if (!bubble.some((b) => b.x === p.x && b.y === p.y)) bubble.push({ x: p.x, y: p.y });
  };
  for (const c of plan.structures.container) addBubble(c);
  for (const l of srcLinks) addBubble(l);
  addBubble(ctrlLink);
  // m8: the hub itself is inside the wall by construction, but "inside" is
  // not "safe" — a shell that hugs the pocket can leave a spawn at depth 3,
  // i.e. inside a ranged attacker's reach from the wall. Same rule as the
  // eco works: too shallow ⇒ personal rampart.
  for (const t of ["storage", "terminal", "spawn"]) {
    for (const p of plan.structures[t] || []) addBubble(p);
  }
  addBubble(plan.structures.link[0]); // hub link
  addBubble(plan.sitter); // the trio's parking tile
  // CONTROLLER OUTSIDE THE WALL (owner: "only rampart the edges so no one
  // can attack the controller, and the link"). Every tile a creep can stand
  // on to reach the controller is D8-adjacent to it — rampart that ring and
  // an enemy claim/attack creep has nowhere to stand, without paying for the
  // wide range-3 park bubble the old version rented. The controller link and
  // its container are covered above (links + containers all go through
  // addBubble); they are listed here so the intent survives a refactor.
  if (!enclosedController) {
    for (const p of ctrlRing) addBubble(p);
    addBubble(ctrlLink);
    for (const c of plan.structures.container) if (chebyshev(c, ctrl) <= 3) addBubble(c);
  }

  // --- battlements: where the defenders stand ---
  // Lane count picks the tiles that MATTER — a rampart facing three walkable
  // exterior tiles is where a breach party can mass. But lanes alone is a
  // terrain accident: a shell whose approach is one tile wide the whole way
  // round marks almost nothing, and a room that marks 5 stands on a 17-tile
  // cut has told its defenders to hold a wall they cannot reach in time.
  //
  // So the marks carry a floor as well as a preference:
  //   - at least ceil(cut/3) stands, so a fleet minimum holds everywhere;
  //   - every cut tile within chebyshev 2 of a stand, so a defender is always
  //     one or two sidesteps from any tile that starts taking hits.
  // Top-ups are chosen greedily by how much uncovered wall each one buys,
  // ties broken by lane count then tile order — deterministic, and it still
  // lands on the wide faces first.
  const laneCount = (c) => {
    let lanes = 0;
    for (const [dx, dy] of D8) {
      const x = c.x + dx,
        y = c.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      if (walkable(terrain, x, y) && extF[idx(x, y)]) lanes++;
    }
    return lanes;
  };
  // a stand a defender cannot walk to is decoration: only cut tiles the
  // interior walk region actually touches may be marked. This is the SAME
  // region the cut was chosen against — one definition of "reachable", used by
  // the pick, the expansion guard and the marks alike.
  const walkFinal = walkF;
  const standable = cut.filter((c) => walkFinal.has(key(c.x, c.y)));
  const pool = standable.length ? standable : cut;

  const battlements = [];
  const marked = new Set();
  const mark = (c) => {
    const k = key(c.x, c.y);
    if (marked.has(k)) return;
    marked.add(k);
    battlements.push({ x: c.x, y: c.y });
  };
  for (const c of pool) if (laneCount(c) >= 3) mark(c);

  const covered = (c) => battlements.some((b) => chebyshev(b, c) <= 2);
  const floor = Math.ceil(cut.length / 3);
  let guard = 0;
  while (guard++ < cut.length + 1) {
    const uncovered = cut.filter((c) => !covered(c));
    if (!uncovered.length && battlements.length >= floor) break;
    let best = null;
    for (const c of pool) {
      const k = key(c.x, c.y);
      if (marked.has(k)) continue;
      const gain = uncovered.filter((u) => chebyshev(u, c) <= 2).length;
      const lanes = laneCount(c);
      if (
        !best ||
        gain > best.gain ||
        (gain === best.gain && lanes > best.lanes) ||
        (gain === best.gain && lanes === best.lanes && (c.x < best.c.x || (c.x === best.c.x && c.y < best.c.y)))
      ) {
        best = { c, gain, lanes };
      }
    }
    if (!best) break; // every standable tile is already marked — say so in meta
    mark(best.c);
  }
  // Honest shortfall, not a rounding error: a cut tile no battlement can
  // cover is a tile no defender can stand within two steps of, and in every
  // fleet case so far that is because the interior cannot reach that wall
  // segment at all (the min-cut sealed a pocket the base does not own).
  // Name the tiles so the next reviewer can see it rather than infer it.
  const battlementGapTiles = cut.filter((c) => !covered(c)).map((c) => ({ x: c.x, y: c.y }));
  const battlementGap = battlementGapTiles.length;
  const battlementUnreachable = cut.length - standable.length;

  // ------------------------------------------------------------------
  // DECLARE WHAT WE COULD NOT BUY
  //
  // The pick above prefers a fully-reachable cut whenever one costs at most
  // REACH_SWAP_BUDGET more, and the expansion guard refuses to build a second
  // castle. If unreachable tiles survive BOTH, the room genuinely offers no
  // affordable alternative — so say so, with the substitute price we actually
  // measured, and let the reviewer judge it rather than infer it from a count.
  // ------------------------------------------------------------------
  const shortfalls = [];

  // A LINK ON THE WALL, NAMED. computeCut is told to route around every link
  // tile; the only way one can still end up in the cut is the fallback above,
  // where forbidding them left this basin with no enclosure at all. Say which
  // link and say why, so the reviewer judges a stated trade instead of finding
  // an unstated one.
  const linkOnCut = cut.filter((c) => linkKeys.has(key(c.x, c.y)));
  if (linkOnCut.length) {
    const where = linkOnCut.map((t) => `${t.x},${t.y}`).join(" ");
    shortfalls.push({
      gate: "shell",
      detail:
        `${linkOnCut.length}/${cut.length} cut tiles carry a link (${where}) — a link is an ` +
        `OBSTACLE_OBJECT_TYPE, so no defender, repairer or battlement can occupy those ramparts. ` +
        `The min-cut was run with every link tile at infinite capacity first and ${
          linkCutForced
            ? `no protect radius in this room produced an enclosure at all under that rule: the link ` +
              `sits on the only isthmus this basin has, and the wall has to go through it`
            : `this cut still came back through one, which should be impossible — treat it as a bug`
        }.`,
      tiles: linkOnCut.map((t) => ({ x: t.x, y: t.y })),
    });
  }

  if (unreachF.length) {
    const where = unreachF.map((t) => `${t.x},${t.y}`).join(" ");
    const substitute = swapAlt
      ? `the cheapest fully-reachable cut that still holds the program is ${swapAlt.cut.length} tiles ` +
        `against this radius's ${pick.cut.length} (+${swapAlt.cut.length - pick.cut.length} ramparts), ` +
        `over the ${REACH_SWAP_BUDGET}-tile swap budget`
      : reachAlt
        ? `every fully-reachable enclosure of this hub is too small for the program — the best is ` +
          `radius ${reachAlt.r} at ${reachAlt.cut.length} cut tiles enclosing only ${reachAlt.deep} deep ` +
          `tiles against a floor of ${needDeep}, so buying it would trade ${unreachF.length} unreachable ` +
          `wall tiles for roughly ${needDeep - reachAlt.deep} structures pushed into the shallow band, ` +
          `each of which rents a personal rampart forever`
        : `no protect radius in this room produces a fully-reachable cut at all — every enclosure ` +
          `of this hub rings a lobe the basin cannot walk to`;
    shortfalls.push({
      gate: "battlements",
      detail:
        `${unreachF.length}/${cut.length} cut tiles sit on a wall segment the interior walk region ` +
        `cannot reach (${where}); no defender can stand there and no battlement can cover them. ` +
        `${substitute}.`,
      tiles: unreachF.map((t) => ({ x: t.x, y: t.y })),
    });
  }

  // ------------------------------------------------------------------
  // DEFENDER MOBILITY — measure the shell we are actually shipping, name the
  // cause, and declare the miss when the room has beaten every enclosure we
  // are allowed to buy.
  //
  // What was tried before this declaration is written: every protect radius on
  // the ladder (the whole `attempts` set), the reachability swap, and — when
  // the incumbent was over target — an explicit mobility tiebreak across every
  // candidate within MOBILITY_TIEBREAK_BUDGET wall tiles of the cheapest. The
  // pipeline's needDeep rungs re-enter this function with wider radii on top of
  // that. What is NOT tried: paying more than +2 ramparts, because the fleet's
  // first objective is minimising forever-upkeep and a mobile shell bought with
  // twenty extra decaying walls is a worse base, not a better one.
  // ------------------------------------------------------------------
  const walkMaskFinal = maskFromKeys(walkFinal);
  const mobility = mobilityStats(cut, extF, walkMaskFinal);
  mobility.target = MOBILITY_TARGET;
  mobility.cause =
    mobility.maxGated > MOBILITY_TARGET
      ? mobilityCause(terrain, cut, extF, mobility.worstGated)
      : "none";
  // The floor we PROVED: the best ratio any affordable enclosure of this hub
  // measured. It is taken BEFORE the eco lobes are bid for, so in a room too
  // short of interior to refuse a lobe (see guardIsFree) the shipped number can
  // be worse than the floor — that gap is not a rounding error, it is the price
  // of the enclosure, and the declaration below spells it out.
  mobility.floor =
    mobilityBandBest === null ? mobility.maxGated : Math.min(mobilityBandBest, mobility.maxGated);
  mobility.candidates = mobilityBandSize;
  mobility.ecoCost = round2(Math.max(0, mobility.maxGated - mobility.floor));
  // THE DECLARATION IS FILED ON THE GATED READING (MOBILITY_DETOUR_FLOOR): a
  // pair the defender loses by two tiles is not a shortfall to declare, it is a
  // measurement to record — and `mobility` records it either way.
  if (mobility.maxGated > MOBILITY_TARGET && mobility.worstGated) {
    const { a, b, din, dout } = mobility.worstGated;
    // ------------------------------------------------------------------
    // THE CAUSE IS DIAGNOSED HERE; WHETHER ANOTHER ENCLOSURE BEATS IT IS NOT.
    //
    // These strings used to end in claims about every cut this room admits —
    // "no cut of this basin can shorten it", "no candidate enclosure within the
    // wall budget closes that bay". This function sees exactly ONE enclosure and
    // has no standing to say that; the pipeline owns the escalation ladder and
    // staples the composed rungs to this very declaration (attachRungProof), and
    // in 30 rooms that table listed a COMPLETE rung with a materially shorter lap
    // directly underneath the impossibility claim. E14S5 printed "no cut of this
    // basin can shorten it" at 7.5 above a rung that measured 1.5.
    //
    // So the diagnosis stays — it is a real measurement, taken by re-walking with
    // structures removed and then with interior walls removed — and the verdict
    // on alternatives is left to the layer that actually composed them.
    // ------------------------------------------------------------------
    const why = {
      terrain:
        `a natural wall inside the enclosure forces the detour — with interior walls ignored the same ` +
        `walk is short, so the length is the basin's shape and not the mass inside it; the room is a ` +
        `ring around a mountain`,
      shape:
        `the enclosure is concave here and the attacker is cutting across a bay the defender must walk ` +
        `around — with structures removed AND with interior walls removed the walk stays long, so it is ` +
        `the outline of this cut, not its contents`,
      structures:
        `the planner's own mass is in the way — the same walk is short with structures removed. The ` +
        `shell does not own the extension/road layers, so this one is a lead for them, not a shell miss`,
    }[mobility.cause];
    shortfalls.push({
      gate: "mobility",
      // the pipeline owns the escalation ladder, so it is the pipeline that
      // staples the per-rung evidence onto this entry (see attachRungProof).
      // A shell-mobility declaration without `rungs` has not been proved and
      // must not ship.
      source: "shell",
      metric: {
        exact: !mobility.sampled,
        endpoints: mobility.endpoints,
        reachable: mobility.reachable,
        maxStrict: mobility.maxStrict,
        detourFloor: MOBILITY_DETOUR_FLOOR,
        maxUngated: mobility.max,
      },
      detail:
        `defender mobility max ${mobility.maxGated} over pairs that cost more than ` +
        `${MOBILITY_DETOUR_FLOOR} tiles of detour (target ${MOBILITY_TARGET}; the ungated maximum over ` +
        `every pair including two-tile ones is ${mobility.max}, ` +
        `${mobility.sampled ? `SAMPLED over ${mobility.endpoints}/${mobility.reachable}` : `exact all-pairs over ${mobility.endpoints}`} ` +
        `reachable wall tiles; stand-to-stand it is ${mobility.maxStrict}): between wall tiles ${a.x},${a.y} ` +
        `and ${b.x},${b.y} the defender walks ${din} inside while the attacker walks ${dout} outside. ` +
        `Cause: ${mobility.cause} — ${why}. Measured floor ${mobility.floor} over ${mobilityBandSize || 1} ` +
        `enclosure(s) within +${MOBILITY_TIEBREAK_BUDGET} ramparts of the cheapest cut this room admits` +
        (mobility.ecoCost > 0
          ? `; the negotiation reached ${mobility.floor} before the eco enclosures were bid in, but the ` +
            `bare enclosure held only ${pick.deep} deep tiles against a floor of ${needDeep} — too little ` +
            `to refuse a lobe that brings interior with it (the room ends up with ${deepTiles}), so it was ` +
            `bought and the lap grew by ${mobility.ecoCost}`
          : "") +
        `. ${mobility.overGated}/${mobility.gatedPairs} wall pairs with a real detour exceed the target ` +
        `(${mobility.over}/${mobility.pairs} on the ungated reading, p90 ${mobility.p90}); ` +
        `the longest extra walk anywhere on this wall is ${mobility.maxDetour} tile(s)` +
        (mobility.worstDetour
          ? ` (${mobility.worstDetour.a.x},${mobility.worstDetour.a.y} to ${mobility.worstDetour.b.x},` +
            `${mobility.worstDetour.b.y}: ${mobility.worstDetour.din} in / ${mobility.worstDetour.dout} out, ` +
            `ratio ${mobility.worstDetour.ratio})`
          : "") +
        `.`,
      tiles: [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ],
    });
  }

  // m7: a bubble tile that the cut already covers is a duplicate rampart —
  // it renders twice, is counted twice and inflates the upkeep quote. The
  // emitted rampart list is deduped by tile, and every count reads off it.
  const bubbleOnly = bubble.filter((b) => !cutSet.has(key(b.x, b.y)));
  const rampart = [];
  const seenRampart = new Set();
  for (const p of [...cut, ...bubbleOnly]) {
    const k = key(p.x, p.y);
    if (seenRampart.has(k)) continue;
    seenRampart.add(k);
    rampart.push({ x: p.x, y: p.y });
  }
  const upkeep = Math.round(rampart.length * 3) / 100; // e/tick

  return {
    layer: "shell",
    rampart,
    // tiles that wanted a personal rampart and cannot legally have one —
    // the pipeline turns these into meta.shortfalls entries
    bubbleRejected,
    // declared shortfalls from this layer (unreachable wall segments). The
    // pipeline forwards these into plan.meta.shortfalls, same channel the
    // tower layer already uses.
    shortfalls,
    shell: {
      cut,
      bubble: bubbleOnly,
      battlements,
      // held floor: ceil(cut/3) stands, every cut tile within cheb 2 of one.
      // battlementGap > 0 means the interior physically cannot reach part of
      // its own wall — loud, not silent.
      battlementFloor: Math.ceil(cut.length / 3),
      battlementGap,
      battlementGapTiles,
      battlementUnreachable,
      // natural-wall tiles that carry the seal — render draws these so a
      // fully closed enclosure LOOKS closed (see render.mjs)
      boundary: boundaryWalls(terrain, extF),
      protectRadius: pick.r,
      // cut tiles deleted because deleting them changed nothing measurable —
      // doubled wall and rings around pockets the base cannot walk to
      uselessCut,
      // links the wall had to go through anyway (declared above), and whether
      // the "route around every link" rule had to be dropped to find a cut
      linkOnCut: linkOnCut.map((t) => ({ x: t.x, y: t.y })),
      linkCutForced,
      // the controller enclosure was refused on walk distance, not on price
      ctrlEncloseRefused,
      ctrlWalk,
      deepTiles,
      needDeep,
      budgetPass,
      priceyWall,
      baseCut,
      enclosedController,
      // strict: works inside AND every walkable ring tile inside (the headline)
      enclosedSources,
      // the older, looser reading: the container and link are inside, whatever
      // the ring does. Kept because it is the number a besieger's shopping list
      // actually cares about, and because dropping a metric to make a new one
      // look good is its own kind of dishonesty.
      enclosedSourceWorks,
      srcEnclosed,
      // interior lap ÷ exterior lap over pairs of wall tiles. max is the
      // owner's gate (<= 1.2); p90/mean say whether the whole wall is slow or
      // one corner is; cause says whose fault it is; floor is what the
      // negotiation proved it could not beat.
      mobility,
      upkeepPerTick: upkeep,
    },
    // exported fields for later layers (towers/labs/extensions)
    exterior: extF,
    depth: depthF,
  };
}
