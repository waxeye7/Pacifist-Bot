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
 *      is negotiated BEFORE placement — never repaired after.
 *   6. Bubbles: individual ramparts on the controller link + upgrader
 *      parks + source containers/links (harassment cover outside the wall).
 *   7. Battlements: cut tiles facing wide approach lanes — where the
 *      RampartDefenders should stand. Metadata for defence AI.
 */
import { D8, borderLegal, buildable, chebyshev, isSwamp, isWall, key, walkable } from "./shared.mjs";

const INF_FLOW = 1 << 28;
const EXIT_T = 5001;
const SRC_S = 5000;

// deep-interior tiles needed beyond the shell: 60 ext + 10 labs + 6 towers
// + misc/spare. Placed hub structures already sit on deep tiles and are
// excluded from the count, as are roads (extensions can't sit on roads).
const NEED_DEEP = 85;
const MAX_CUT = 45;
const DEPTH_SAFE = 4; // ranged attacker reach is 3

// negotiation ladder. 13/14 exist so a room that cannot fit 60 extensions
// at the tight radii can buy more deep space by walling a bigger bubble.
const RADII = [6, 7, 8, 9, 10, 11, 12];
export const RADII_WIDE = [6, 7, 8, 9, 10, 11, 12, 13, 14];

// "enclose the eco when it is cheap" — how many extra cut tiles we will pay
// to pull the controller's upgrader area / a source's mining ring inside.
const ENCLOSE_CTRL_BUDGET = 4;
const ENCLOSE_SRC_BUDGET = 3;
const MAX_PARKS = 8;
const MOBILITY_PAIRS = 20;
const MOBILITY_MIN_SEP = 8;

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
      if (isProtect || unwallable[i]) w = INF_FLOW;
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
 * D8 walk distance between two tiles over an arbitrary allowed-tile
 * predicate. `from`/`to` are always allowed (they are the endpoints even
 * when they sit on a blocked tile — e.g. a rampart in the exterior graph).
 */
function walkDistWhere(terrain, from, to, allowed) {
  const fi = idx(from.x, from.y);
  const ti = idx(to.x, to.y);
  if (fi === ti) return 0;
  const seen = new Uint8Array(2500);
  seen[fi] = 1;
  let layer = [fi];
  let d = 0;
  while (layer.length) {
    const next = [];
    d++;
    for (const i of layer) {
      const x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        const ni = nx + ny * 50;
        if (seen[ni] || !walkable(terrain, nx, ny)) continue;
        if (ni === ti) return d;
        if (!allowed(ni)) continue;
        seen[ni] = 1;
        next.push(ni);
      }
    }
    layer = next;
  }
  return Infinity;
}

/**
 * Defender mobility ratio (owner's requirement: a defender walking the
 * INSIDE of the wall must never be out-manoeuvred by an attacker walking
 * the outside). For sampled pairs of cut tiles, ratio = interior path /
 * exterior path. >1 means the attacker can reposition faster than we can.
 * Reported, never enforced — some rooms are shaped like that.
 */
function mobilityStats(terrain, cut, ext) {
  const n = cut.length;
  if (n < 2) return { max: 0, mean: 0, pairs: 0 };
  const inside = (i) => !ext[i];
  const outside = (i) => !!ext[i];
  const step = Math.max(1, Math.floor(n / MOBILITY_PAIRS));
  const ratios = [];
  for (let s = 0; s < n && ratios.length < MOBILITY_PAIRS; s += step) {
    const a = cut[s];
    const b = cut[(s + ((n / 2) | 0)) % n];
    if (chebyshev(a, b) < MOBILITY_MIN_SEP) continue;
    const din = walkDistWhere(terrain, a, b, inside);
    const dout = walkDistWhere(terrain, a, b, outside);
    if (!isFinite(din) || !isFinite(dout) || dout === 0) continue;
    ratios.push(din / dout);
  }
  if (!ratios.length) return { max: 0, mean: 0, pairs: 0 };
  const mean = ratios.reduce((p, c) => p + c, 0) / ratios.length;
  return {
    max: Math.round(Math.max(...ratios) * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    pairs: ratios.length,
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
  const needDeep = opts.needDeep ?? NEED_DEEP;
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
  const occupied = new Set([...hubKeys, ...objectTiles]);
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));

  // --- negotiation: smallest cut that still holds the RCL8 program ---
  const attempts = [];
  for (const r of radii) {
    const protect = new Set(hubKeys);
    for (const b of plan.basin) {
      if (b.d <= r && !unprotectable[idx(b.x, b.y)]) protect.add(key(b.x, b.y));
    }
    const res = computeCut(terrain, protect, opts);
    if (res.error) continue;
    const cutSet = new Set(res.cut.map((c) => key(c.x, c.y)));
    const ext = exteriorFlood(terrain, cutSet);
    // sanity: protect must be sealed
    let leak = false;
    for (const k of protect) {
      const [x, y] = k.split(",").map(Number);
      if (ext[idx(x, y)]) {
        leak = true;
        break;
      }
    }
    if (leak) continue;
    const depth = depthFromExterior(ext);
    const deep = countDeep(terrain, ext, depth, cutSet, occupied, roadSet);
    attempts.push({ r, protect, cut: res.cut, cutSet, ext, depth, deep });
  }
  if (!attempts.length) return { error: "no viable cut at any radius" };

  // pick: cheapest wall that still fits the program; the maxCut cap is a
  // quality flag, not a hard gate — open rooms are legitimately pricier
  const fits = attempts.filter((a) => a.deep >= needDeep);
  let pick;
  if (fits.length) {
    fits.sort((a, b) => a.cut.length - b.cut.length || b.deep - a.deep);
    pick = fits[0];
  } else {
    attempts.sort((a, b) => b.deep - a.deep || a.cut.length - b.cut.length);
    pick = attempts[0];
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
  const baseCut = pick.cut.length;

  const tryExpand = (tiles, budget) => {
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
    const res = computeCut(terrain, cand, opts);
    if (res.error) return false;
    if (res.cut.length > cut.length + budget) return false;
    const cs = new Set(res.cut.map((c) => key(c.x, c.y)));
    const e = exteriorFlood(terrain, cs);
    for (const k of cand) {
      const [x, y] = k.split(",").map(Number);
      if (e[idx(x, y)]) return false; // leaked — reject
    }
    protect = cand;
    cut = res.cut;
    cutSet = cs;
    extF = e;
    depthF = depthFromExterior(e);
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
  tryExpand(ctrlArea, ENCLOSE_CTRL_BUDGET);

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
  let enclosedSources = 0;
  const srcEnclosed = plan.sources.map((s) => {
    const mine = [
      ...plan.structures.container.filter((c) => chebyshev(c, s) <= 1),
      ...srcLinks.filter((l) => chebyshev(l, s) <= 2),
    ];
    const ok = mine.length > 0 && mine.every((p) => !outside(p));
    if (ok) enclosedSources++;
    return ok;
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
  // interior walk region actually touches may be marked
  const interiorStand = new Set();
  {
    const seen = new Set([key(plan.sitter.x, plan.sitter.y)]);
    const q = [plan.sitter];
    let qi = 0;
    while (qi < q.length) {
      const cur = q[qi++];
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        if (x < 0 || y < 0 || x > 49 || y > 49) continue;
        const k = key(x, y);
        if (seen.has(k) || !walkable(terrain, x, y)) continue;
        // ramparts are walkable for the owner, so the flood stops AT the cut
        // rather than before it — but never crosses into the exterior
        if (!cutSet.has(k) && extF[idx(x, y)]) continue;
        if (occupied.has(k)) continue;
        seen.add(k);
        // the flood walks ALONG the cut too — a rampart is walkable for its
        // owner, and a wall segment reached only by walking the wall is still
        // reached (E11S4's north lobe hangs off exactly one such isthmus)
        q.push({ x, y });
      }
    }
    for (const c of cut) if (seen.has(key(c.x, c.y))) interiorStand.add(key(c.x, c.y));
  }
  const standable = cut.filter((c) => interiorStand.has(key(c.x, c.y)));
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
      deepTiles,
      needDeep,
      budgetPass,
      priceyWall,
      baseCut,
      enclosedController,
      enclosedSources,
      srcEnclosed,
      mobility: mobilityStats(terrain, cut, extF),
      upkeepPerTick: upkeep,
    },
    // exported fields for later layers (towers/labs/extensions)
    exterior: extF,
    depth: depthF,
  };
}
