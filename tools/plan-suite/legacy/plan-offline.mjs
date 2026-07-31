/**
 * Pacifist offline base plan suite v4
 *
 * Policy (user):
 * - Protect FULL ECO: hub + spawns + storage/terminal/labs/links/towers/factory/nuker/observer + ALL extensions
 * - NO powerSpawn (power mode off forever)
 * - NO double shell
 * - Compare seal modes: full min-cut vs edge/choke-only (partial)
 * - RCL8 target: 60 extensions
 *
 *   node tools/plan-suite/legacy/plan-offline.mjs
 *   node tools/plan-suite/legacy/plan-offline.mjs --rooms E2S7,E5S1
 *   node tools/plan-suite/legacy/plan-offline.mjs --all-claimable
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "out");

// --- Policy ---
// Dilate around eco protect points before min-cut. Fixed 3 bloated roomy seals
// Min-cut dilate around protected buildings.
// NEVER use 2: wall sits ~2 from structures → hostile outside is ~3 away →
// RANGED_ATTACK (range 3) can shoot storage/exts/labs from outside the seal.
// Dilate 4 ⇒ wall farther out; eco only packed where wallDist≥RA_SAFE_DEPTH.
// Hostile outside wall is then ≥ RA_SAFE_DEPTH+1 from buildings (RA3-safe).
const PROTECT_RANGE = 4;
/** Min Chebyshev distance from any eco tile to a wall (RA range 3 ⇒ need ≥3). */
const RA_SAFE_DEPTH = 3;
/** openSpace threshold for other roomy packing heuristics (not protect-2). */
const ROOMY_PROTECT2_SPACE = 198;
/** Source container only inside shell if path hub→source is ≤ this */
const SOURCE_PROTECT_MAX_PATH = 12;
const MAX_EXTENSIONS = 60;
const EDGE = 7;

const WALL = 1;
const SWAMP = 2;

const CAPS = {
  spawn: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 3 },
  extension: { 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 },
  tower: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6 },
  storage: { 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 },
  terminal: { 6: 1, 7: 1, 8: 1 },
  lab: { 6: 3, 7: 6, 8: 10 },
  link: { 5: 2, 6: 3, 7: 4, 8: 6 },
  factory: { 7: 1, 8: 1 },
  observer: { 8: 1 },
  nuker: { 8: 1 },
  // no powerSpawn — power mode disabled by policy
  container: { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5 },
  extractor: { 6: 1, 7: 1, 8: 1 },
};

/** Edge distance for "choke / no full seal" mode — keep only wall tiles near exits. */
const EDGE_SEAL_DIST = 6;

// ---------- terrain ----------
function tileAt(terrain, x, y) {
  if (x < 0 || x > 49 || y < 0 || y > 49) return WALL;
  return parseInt(terrain.charAt(y * 50 + x), 10);
}
function isWall(terrain, x, y) {
  return tileAt(terrain, x, y) === WALL;
}
function walkable(terrain, x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49 && !isWall(terrain, x, y);
}
function buildable(terrain, x, y) {
  // leave border free
  return x >= 2 && x <= 47 && y >= 2 && y <= 47 && !isWall(terrain, x, y);
}
function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
function key(x, y) {
  return `${x},${y}`;
}

const D8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const D4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function approachTile(terrain, pos) {
  if (walkable(terrain, pos.x, pos.y)) return { x: pos.x, y: pos.y };
  let best = null;
  let bestD = 99;
  for (const [dx, dy] of D8) {
    const x = pos.x + dx,
      y = pos.y + dy;
    if (!walkable(terrain, x, y)) continue;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return best;
}

function pathLen(terrain, from, to) {
  const start = approachTile(terrain, from);
  const goal = approachTile(terrain, to);
  if (!start || !goal) return 999;
  if (start.x === goal.x && start.y === goal.y) return 0;
  const q = [[start.x, start.y, 0]];
  const seen = new Uint8Array(2500);
  seen[start.x + start.y * 50] = 1;
  let qi = 0;
  while (qi < q.length) {
    const [x, y, d] = q[qi++];
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (!walkable(terrain, nx, ny)) continue;
      const i = nx + ny * 50;
      if (seen[i]) continue;
      if (nx === goal.x && ny === goal.y) return d + 1;
      seen[i] = 1;
      q.push([nx, ny, d + 1]);
    }
  }
  return 999;
}

/** Reconstruct 8-dir path tiles (excluding start, including end) */
function findPath(terrain, from, to, blocked = new Set()) {
  const start = approachTile(terrain, from);
  const goal = approachTile(terrain, to);
  if (!start || !goal) return [];
  if (start.x === goal.x && start.y === goal.y) return [];
  const prev = new Map();
  const q = [[start.x, start.y]];
  const sk = key(start.x, start.y);
  prev.set(sk, null);
  let qi = 0;
  let found = false;
  while (qi < q.length) {
    const [x, y] = q[qi++];
    if (x === goal.x && y === goal.y) {
      found = true;
      break;
    }
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      if (!walkable(terrain, nx, ny)) continue;
      // may path through blocked only if goal
      if (blocked.has(k) && !(nx === goal.x && ny === goal.y)) continue;
      prev.set(k, { x, y });
      q.push([nx, ny]);
    }
  }
  if (!found) return [];
  const path = [];
  let cur = { x: goal.x, y: goal.y };
  while (cur) {
    path.push(cur);
    const p = prev.get(key(cur.x, cur.y));
    cur = p;
  }
  path.reverse();
  return path.slice(1); // drop start
}

function openSpace(terrain, x, y, r) {
  let n = 0;
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) if (walkable(terrain, x + dx, y + dy)) n++;
  return n;
}
function exitDist(x, y) {
  return Math.min(x, y, 49 - x, 49 - y);
}

// ---------- hub (Atlantis-weighted + soft eco nudge) ----------
// Packing floor openSpace≥100. Cramped pads (<150): packing-first (E7S8/E4S7).
// Roomy pads: cap space reward past 185 + tax long pathS so E5S1/E8S4/E9S3 leave
// dead-center parking; reward compact pathS + protectable minSrc so E3S3 keeps
// near-source hub (controller is maze-far — pathC cannot be fixed by hub alone).
// Dual-source two-pass: keep original packing cost, also track best dual-protect hub;
// switch to dual only when rating path pen (pathS*0.7+pathC*1.1−prot*4) improves
// (E8S4 dual wins +4 score; E1S6 dual rejected — stretched ctrl).
// Roomy rpen override: when packing-best is roomy but a nearby roomy hub cuts rpen
// by ≥1.4 at ≤+3.5 packing cost, take it (E5S1 pathS 61→57; E4S3 38→34).
//
// Maze / remote soft-caps: placement softRpen uses effectivePath* below (mild).
// scoreForWalls uses its own softer residual (scorePathS/C) so terrain-locked
// pathS/pathC (E5S1/E3S3) do not dominate overall. Soft-band re-ranks by softRpen
// (E5S1→29,35@67/14 score 78); dual/packing still use linear rpen.
/** Soft-capped source-path sum for placement softRpen (full to 40, then 35%). */
function effectivePathS(pSrc) {
  return Math.min(pSrc, 40) + Math.max(0, pSrc - 40) * 0.35;
}
/** Soft-capped controller walk for placement softRpen (full to 24, then 32%). */
function effectivePathC(pCtrl) {
  return Math.min(pCtrl, 24) + Math.max(0, pCtrl - 24) * 0.32;
}

function findHub(terrain, controller, sources, mineral) {
  let best = null;
  let bestDual = null;
  // Dual-eligible pads for near-rpen cost re-rank (see dual override below).
  const dualBand = [];
  // Roomy score-align track: soft-capped path pen (matches scoreForWalls).
  // Linear rpen over-taxes remote pathS past the soft cap and under-values
  // shaving pathC when pathS is already in the soft region (E5S1 57→~63/16).
  let bestRating = null;
  // Soft-band candidates: roomy nP≥1 pads near packing cost. Pure softRpen min
  // overshoots pathS toward ctrl (E5S1 63→67); band re-rank by linear rpen
  // (softCeil+2, no rpen regression) → E5S1 26,38@61 not 28,36@65.
  const softBand = [];
  // Roomy zero-protect track: when packing glues to a cramped ctrl pad with no
  // source in range, solid r=9 + densify paints road spam (E9S1 12,15@147 →
  // 142 roads). Prefer roomy (≥ROOMY_PROTECT2_SPACE) nP=0 by soft pen instead.
  let bestRoamyZero = null;
  for (let x = EDGE + 2; x <= 49 - EDGE - 2; x++) {
    for (let y = EDGE + 2; y <= 49 - EDGE - 2; y++) {
      if (!buildable(terrain, x, y)) continue;
      const ed = exitDist(x, y);
      if (ed < EDGE + 1) continue;
      const space = openSpace(terrain, x, y, 8);
      if (space < 100) continue;
      const hub = { x, y };
      const pCtrl = pathLen(terrain, hub, controller);
      let pSrc = 0;
      let minSrc = 999;
      let maxSrc = 0;
      let nProtect = 0;
      for (const s of sources) {
        const d = pathLen(terrain, hub, s);
        pSrc += d;
        if (d < minSrc) minSrc = d;
        if (d > maxSrc) maxSrc = d;
        if (d <= SOURCE_PROTECT_MAX_PATH) nProtect++;
      }
      if (pCtrl >= 999 || minSrc >= 999) continue;

      let cost = 0;
      if (mineral) cost += pathLen(terrain, hub, mineral) * 0.01;
      // strong interior bias so we don't glue to corner controller/sources
      cost += (12 - Math.min(12, ed)) * 1.2;
      if (tileAt(terrain, x, y) === SWAMP) cost += 2.5;

      if (space < 150) {
        // Packing-first (E7S8@100, E4S7@132)
        cost += pCtrl * 0.55;
        cost += pSrc * 0.25;
        cost += Math.hypot(x - 25, y - 25) * 0.15;
        cost -= (space / 180) * 3;
        if (space >= 130 && minSrc <= SOURCE_PROTECT_MAX_PATH) cost -= 2.0;
        if (pSrc > 60) cost += (pSrc - 60) * 0.14;
      } else {
        // Roomy: score-align pathS, cap open-space over-pull
        cost += pCtrl * 0.55;
        cost += pSrc * 0.27;
        cost += Math.hypot(x - 25, y - 25) * 0.12;
        cost -= (Math.min(space, 185) / 180) * 2.9;
        if (minSrc <= SOURCE_PROTECT_MAX_PATH) cost -= 2.4;
        else cost += (minSrc - SOURCE_PROTECT_MAX_PATH) * 0.55;
        // Long source hauls (E5S1@67) — soft slope past soft-cap region
        if (pSrc > 56) cost += (pSrc - 56) * 0.22;
        // Prefer shorter ctrl among eco-OK hubs (E8S4 25→~23) — not when
        // abandoning a protectable source (that yank wrecked E3S3).
        if (minSrc <= SOURCE_PROTECT_MAX_PATH && pCtrl > 22) cost += (pCtrl - 22) * 0.12;
        // Compact pathS is gold when a source is sealable (E3S3/E2S7/E9S3)
        if (pSrc <= 36 && minSrc <= SOURCE_PROTECT_MAX_PATH) cost -= (36 - pSrc) * 0.12;
        if (pCtrl <= 18 && minSrc <= SOURCE_PROTECT_MAX_PATH) cost -= 0.5;
        // Soft-cap aware: past score soft-caps, prefer shaving pathC over pathS
        // (E5S1 linear rpen clung to 57/19; soft score likes ~63/16).
        if (minSrc <= SOURCE_PROTECT_MAX_PATH && pSrc > 40 && pCtrl > 14) {
          cost += (pCtrl - 14) * 0.08;
        }
      }
      if (cost > 250) continue;
      // Placement path pen — linear for dual/packing; soft for score-align track
      const rpen = pSrc * 0.7 + pCtrl * 1.1 - nProtect * 4;
      const softRpen =
        effectivePathS(pSrc) * 0.7 + effectivePathC(pCtrl) * 1.1 - nProtect * 4;
      const row = { x, y, cost, space, rpen, softRpen, nProtect, pSrc, pCtrl };
      if (!best || cost < best.cost) best = row;
      if (nProtect >= 2 && maxSrc <= SOURCE_PROTECT_MAX_PATH && pSrc <= 28) {
        dualBand.push(row);
        const dcost = rpen + cost * 0.04;
        if (!bestDual || dcost < bestDual.dcost)
          bestDual = { ...row, dcost };
      }
      // Roomy score-align track: soft-capped pen among pads with space to pack 60
      if (space >= 150 && nProtect >= 1) {
        softBand.push(row);
        if (
          !bestRating ||
          softRpen < bestRating.softRpen - 0.05 ||
          (Math.abs(softRpen - bestRating.softRpen) < 0.05 && cost < bestRating.cost)
        )
          bestRating = row;
      }
      // Roomy zero-protect: drop r=9 / protect dilate 2 when packing is cramped nP=0
      if (space >= ROOMY_PROTECT2_SPACE && nProtect === 0) {
        if (
          !bestRoamyZero ||
          softRpen < bestRoamyZero.softRpen - 0.05 ||
          (Math.abs(softRpen - bestRoamyZero.softRpen) < 0.05 && cost < bestRoamyZero.cost)
        )
          bestRoamyZero = row;
      }
    }
  }
  // Dual when rating path pen improves vs packing pick:
  //  - linear rpen ≥0.8 (E8S4 classic), OR
  //  - mild score-residual win with nProtect step-up and pathC stretch ≤+6
  //    (E8S2 dual@36,27 rpenWin≈0.3 / scoreWin≈0.3; still rejects E1S6 dual
  //    pathC 18→26 stretch and E2S3 dual that worsens score pen).
  // Pure min dcost (= rpen + tiny cost) can lock a source-hug tile that bloats
  // free/ramp corridors on roomy seals (E9S8 15,27@130 roads). On roomy dual
  // pads only: among near-rpen same-pathS duals, re-rank by packing cost when
  // the win is real (≥0.8) → E9S8 15,28@85 roads. Skip re-rank on mid/edge
  // duals (E6S2 cost-yank 9,19→10,18 roads 85→92; pathS-drift was worse).
  {
    const scorePen = (row) => {
      // Match scoreForWalls soft residual so dual switch aligns with overall.
      // pathS uses sum soft-cap here (no per-source dists on dualBand rows);
      // dual candidates already have both sources ≤12 so sum ≈ real pathSScore.
      const sS = Math.min(row.pSrc, 40) + Math.max(0, row.pSrc - 40) * 0.2;
      const sC = Math.min(row.pCtrl, 22) + Math.max(0, row.pCtrl - 22) * 0.12;
      return sS * 0.7 + sC * 1.1 - (row.nProtect || 0) * 4;
    };
    const rpenWin = best && bestDual ? best.rpen - bestDual.rpen : -999;
    const scoreWin = best && bestDual ? scorePen(best) - scorePen(bestDual) : -999;
    const dualOk =
      bestDual &&
      best &&
      (rpenWin >= 0.8 ||
        (scoreWin >= 0.25 &&
          bestDual.nProtect > best.nProtect &&
          bestDual.pCtrl <= best.pCtrl + 6));
    if (dualOk) {
      let pick = bestDual;
      if (bestDual.space >= ROOMY_PROTECT2_SPACE) {
        const RPEN_SLACK = 1.4;
        const COST_WIN = 0.8;
        for (const c of dualBand) {
          if (c.rpen > bestDual.rpen + RPEN_SLACK) continue;
          if (c.pSrc !== bestDual.pSrc) continue;
          if (c.space < ROOMY_PROTECT2_SPACE) continue;
          if (c.cost > bestDual.cost - COST_WIN) continue;
          if (
            c.cost < pick.cost - 0.05 ||
            (Math.abs(c.cost - pick.cost) < 0.05 && c.rpen < pick.rpen - 0.05) ||
            (Math.abs(c.cost - pick.cost) < 0.05 &&
              Math.abs(c.rpen - pick.rpen) < 0.05 &&
              c.pCtrl < pick.pCtrl)
          )
            pick = c;
        }
      }
      return { x: pick.x, y: pick.y, cost: pick.cost, space: pick.space };
    }
  }
  // Roomy soft-band override: packing uses linear pathS and can under-tax pathC
  // once pathS is soft-capped (E5S1). Among near-soft / near-cost pads (softCeil +2),
  // re-rank by softRpen (score-aligned) not linear rpen — linear min clung to
  // 26,38@61/17 score 77 while soft 29,35@67/14 scores 78 (pathC shave past soft-cap
  // pathS residual). Allow mild linear rpen regression on soft wins (was -0.2;
  // E5S1 soft pick rpenWin≈-0.6). Linear-win branch still covers haul-first pads.
  // Leave cramped pads alone (packing-first stays primary there).
  if (
    bestRating &&
    best &&
    best.space >= 150 &&
    bestRating.nProtect >= best.nProtect &&
    bestRating.softRpen <= (best.softRpen ?? best.rpen) - 0.9 &&
    bestRating.cost <= best.cost + 4.0
  ) {
    const softCeil = bestRating.softRpen + 2.0;
    let pick = null;
    for (const c of softBand) {
      if (c.nProtect < best.nProtect) continue;
      if (c.cost > best.cost + 4.0) continue;
      if (c.softRpen > softCeil) continue;
      if (
        !pick ||
        c.softRpen < pick.softRpen - 0.05 ||
        (Math.abs(c.softRpen - pick.softRpen) < 0.05 && c.rpen < pick.rpen - 0.05) ||
        (Math.abs(c.softRpen - pick.softRpen) < 0.05 &&
          Math.abs(c.rpen - pick.rpen) < 0.05 &&
          c.cost < pick.cost)
      )
        pick = c;
    }
    if (pick) {
      const softBase = best.softRpen ?? best.rpen;
      const softWin = softBase - pick.softRpen;
      const rpenWin = best.rpen - pick.rpen;
      // Soft pen win (allow mild linear rpen regress past soft-cap pathS), OR
      // real linear path win with mild soft slack.
      if (
        (softWin >= 0.3 && rpenWin >= -1.0) ||
        (rpenWin >= 0.25 && pick.softRpen <= softBase + 1.5)
      ) {
        return { x: pick.x, y: pick.y, cost: pick.cost, space: pick.space };
      }
    }
  }
  // Cramped zero-protect → roomy zero-protect (E9S1 12,15@147/142 roads →
  // 12,20@204/85 roads, score 90→92). Keep pathC within +3 so we do not
  // abandon the controller for a mid-room parking lot.
  if (
    best &&
    best.nProtect === 0 &&
    best.space < ROOMY_PROTECT2_SPACE &&
    bestRoamyZero &&
    bestRoamyZero.pCtrl <= best.pCtrl + 3 &&
    bestRoamyZero.pSrc <= best.pSrc + 3
  ) {
    return {
      x: bestRoamyZero.x,
      y: bestRoamyZero.y,
      cost: bestRoamyZero.cost,
      space: bestRoamyZero.space,
    };
  }
  return best;
}

// ---------- min-cut ----------
const UNWALKABLE = -1,
  NORMAL = 0,
  PROTECTED = 1,
  TO_EXIT = 2,
  EXIT = 3;

function room2d(terrain) {
  const a = Array.from({ length: 50 }, () => Array(50).fill(UNWALKABLE));
  for (let x = 0; x < 50; x++)
    for (let y = 0; y < 50; y++) {
      if (!isWall(terrain, x, y)) {
        a[x][y] = NORMAL;
        if (x === 0 || y === 0 || x === 49 || y === 49) a[x][y] = EXIT;
        else if (x === 1 || y === 1 || x === 48 || y === 48) a[x][y] = TO_EXIT;
      }
    }
  return a;
}

class Graph {
  constructor(n) {
    this.v = n;
    this.level = Array(n);
    this.edges = Array.from({ length: n }, () => []);
  }
  newEdge(u, v, c) {
    this.edges[u].push({ v, r: this.edges[v].length, c, f: 0 });
    this.edges[v].push({ v: u, r: this.edges[u].length - 1, c: 0, f: 0 });
  }
  bfs(s, t) {
    this.level.fill(-1);
    this.level[s] = 0;
    const q = [s];
    while (q.length) {
      const u = q.shift();
      for (const e of this.edges[u]) {
        if (this.level[e.v] < 0 && e.f < e.c) {
          this.level[e.v] = this.level[u] + 1;
          q.push(e.v);
        }
      }
    }
    return this.level[t] >= 0;
  }
  dfsFlow(u, f, t, c) {
    if (u === t) return f;
    while (c[u] < this.edges[u].length) {
      const e = this.edges[u][c[u]];
      if (this.level[e.v] === this.level[u] + 1 && e.f < e.c) {
        const got = this.dfsFlow(e.v, Math.min(f, e.c - e.f), t, c);
        if (got > 0) {
          e.f += got;
          this.edges[e.v][e.r].f -= got;
          return got;
        }
      }
      c[u]++;
    }
    return 0;
  }
  bfsCut(s) {
    const eIn = [];
    this.level.fill(-1);
    this.level[s] = 1;
    const q = [s];
    while (q.length) {
      const u = q.shift();
      for (const e of this.edges[u]) {
        if (e.f < e.c) {
          if (this.level[e.v] < 1) {
            this.level[e.v] = 1;
            q.push(e.v);
          }
        }
        if (e.f === e.c && e.c > 0) {
          e.u = u;
          eIn.push(e);
        }
      }
    }
    return eIn.filter((e) => this.level[e.v] === -1).map((e) => e.u);
  }
  mincut(s, t) {
    let total = 0;
    while (this.bfs(s, t)) {
      const c = Array(this.v + 1).fill(0);
      let flow;
      do {
        flow = this.dfsFlow(s, 1e15, t, c);
        total += flow;
      } while (flow);
    }
    return total;
  }
}

function dilateMask(points, R) {
  const m = Array.from({ length: 50 }, () => Array(50).fill(false));
  for (const p of points) {
    for (let dx = -R; dx <= R; dx++)
      for (let dy = -R; dy <= R; dy++) {
        const x = p.x + dx,
          y = p.y + dy;
        if (x >= 0 && x <= 49 && y >= 0 && y <= 49) m[x][y] = true;
      }
  }
  return m;
}

function getCutForMask(terrain, protectMask) {
  const room_array = room2d(terrain);
  for (let x = 1; x < 49; x++) {
    for (let y = 1; y < 49; y++) {
      if (!protectMask[x][y] || room_array[x][y] === UNWALKABLE) continue;
      // Never claim the exit band as protected. Dilate R=3 reaches y=0/1 when eco
      // sits near an edge (E4S7/E7S8/E8S6). Overwriting TO_EXIT removes the sink
      // edge so min-cut only walls *other* exits → open leak edge→hub and "ext
      // outside seal" / full-eco failures on exit-flood checks.
      if (room_array[x][y] === TO_EXIT || room_array[x][y] === EXIT) continue;
      let border = false;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49 || !protectMask[nx][ny]) {
          border = true;
          break;
        }
        // Dilate may paint the exit band as "inside" mask. Treat exit-band
        // neighbors as outside so we still get a PROTECTED face the cut seals.
        const nb = room_array[nx]?.[ny];
        if (nb === TO_EXIT || nb === EXIT) {
          border = true;
          break;
        }
      }
      room_array[x][y] = border ? PROTECTED : UNWALKABLE;
    }
  }

  // Distance from protect mask (Chebyshev). Uniform cap=1 prefers cheap edge chokes
  // far from the base (E8S4 walls at x=47 while eco sits at r≈12) → towers cannot
  // cover shell under refill≤10. Weight far tiles higher so min-cut hugs the base.
  const distP = Array.from({ length: 50 }, () => Array(50).fill(99));
  const dq = [];
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (!protectMask[x][y]) continue;
      distP[x][y] = 0;
      dq.push(x, y);
    }
  }
  for (let qi = 0; qi < dq.length; qi += 2) {
    const x = dq[qi],
      y = dq[qi + 1];
    const d = distP[x][y];
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (distP[nx][ny] <= d + 1) continue;
      distP[nx][ny] = d + 1;
      dq.push(nx, ny);
    }
  }

  const g = new Graph(2 * 50 * 50 + 2);
  const INF = 1e15;
  const source = 2 * 50 * 50;
  const sink = 2 * 50 * 50 + 1;
  for (let x = 1; x < 49; x++) {
    for (let y = 1; y < 49; y++) {
      const top = y * 50 + x;
      const bot = top + 2500;
      if (room_array[x][y] === NORMAL) {
        // cap grows with distance from eco — edge chokes lose to tight base rings
        const cap = 1 + distP[x][y] * distP[x][y];
        g.newEdge(top, bot, cap);
        for (const [dx, dy] of D8) {
          const nx = x + dx,
            ny = y + dy;
          if (room_array[nx][ny] === NORMAL || room_array[nx][ny] === TO_EXIT)
            g.newEdge(bot, ny * 50 + nx, INF);
        }
      } else if (room_array[x][y] === PROTECTED) {
        g.newEdge(source, top, INF);
        g.newEdge(top, bot, 1); // protect border stays cheapest cut
        for (const [dx, dy] of D8) {
          const nx = x + dx,
            ny = y + dy;
          if (room_array[nx][ny] === NORMAL || room_array[nx][ny] === TO_EXIT)
            g.newEdge(bot, ny * 50 + nx, INF);
        }
      } else if (room_array[x][y] === TO_EXIT) {
        g.newEdge(top, sink, INF);
      }
    }
  }
  if (g.mincut(source, sink) <= 0) return [];
  const verts = g.bfsCut(source);
  const seen = new Set();
  const out = [];
  for (const u of verts) {
    const x = u % 50;
    const y = Math.floor(u / 50);
    const k = key(x, y);
    if (seen.has(k) || !buildable(terrain, x, y)) continue;
    seen.add(k);
    out.push({ x, y });
  }
  return out;
}

function pickRamps(perimeter, hub, count = 2) {
  if (!perimeter.length) return [];
  const scored = perimeter.map((t) => ({
    t,
    ang: Math.atan2(t.y - hub.y, t.x - hub.x),
    dist: Math.abs(t.x - hub.x) + Math.abs(t.y - hub.y),
  }));
  const ramps = [];
  const step = (2 * Math.PI) / count;
  for (let i = 0; i < count; i++) {
    const target = -Math.PI + step * i + step / 2;
    let best = null,
      bestSc = 99;
    for (const s of scored) {
      let d = Math.abs(s.ang - target);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const sc = d - s.dist * 0.01;
      if (sc < bestSc) {
        bestSc = sc;
        best = s.t;
      }
    }
    if (best && !ramps.some((r) => r.x === best.x && r.y === best.y)) ramps.push(best);
  }
  const open = new Set(ramps.map((r) => key(r.x, r.y)));
  for (const r of [...ramps]) {
    for (const p of perimeter) {
      if (Math.abs(p.x - r.x) + Math.abs(p.y - r.y) === 1) open.add(key(p.x, p.y));
    }
  }
  return [...open].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  });
}

// ---------- placement ----------
/**
 * True if building on (x,y) would seal a terrain neck: hub free-walk (structures
 * blocked, roadReserved still walkable) loses a large open region. E7S8 hub sits
 * against a wall; terminal+spawn+link+nuker filled the only NE passage so
 * defenders could not reach north shell ramps (rampReach 2/6).
 */
function isCriticalChoke(terrain, hub, blocked, roadReserved, x, y) {
  const kBlock = key(x, y);
  const passable = (nx, ny, extra) => {
    if (nx === hub.x && ny === hub.y) return true;
    if (!walkable(terrain, nx, ny)) return false;
    const k = key(nx, ny);
    if (extra && k === kBlock) return false;
    if (roadReserved && roadReserved.has(k)) return true; // corridor / future road
    if (blocked.has(k)) return false;
    return true;
  };
  const flood = (extra) => {
    const seen = new Set([key(hub.x, hub.y)]);
    const q = [[hub.x, hub.y]];
    let qi = 0;
    while (qi < q.length) {
      const [cx, cy] = q[qi++];
      for (const [dx, dy] of D8) {
        const nx = cx + dx,
          ny = cy + dy,
          k = key(nx, ny);
        if (seen.has(k) || nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        if (!passable(nx, ny, extra)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    return seen.size;
  };
  const open = flood(false);
  const closed = flood(true);
  // ≥20 tiles lost ⇒ this tile is a real neck, not noise near edges
  return open - closed >= 20;
}

/**
 * @param {boolean} [strictNoChoke] if true, never seal a terrain neck (links/nuker/obs).
 *   Terminal/spawns use false so they still place when every offset is a neck —
 *   but only the *first* placement may sit on a choke (stacking three spawns on a
 *   1-tile corridor seals hub→shell: E8S3 rampFail 2, spawns@27–29,12).
 */
function placeNear(terrain, origin, blocked, offsets, n, roadReserved = null, strictNoChoke = false) {
  const out = [];
  // D4 hub path: reject diagonal-only terrain islands (E8S3 link@27,10 pl4=999)
  // and long terrain detours that land outside the later D4 seal chamber
  // (E1S6 factory@29,26 pl4=20 vs cheb 4 → harsh coreOut).
  const pathD4 = pathDistFieldD4(terrain, origin);
  const tryPlace = (allowChoke) => {
    for (const o of offsets) {
      if (out.length >= n) return;
      const x = origin.x + o.x,
        y = origin.y + o.y;
      const k = key(x, y);
      if (blocked.has(k) || !buildable(terrain, x, y)) continue;
      const d = Math.max(Math.abs(o.x), Math.abs(o.y));
      const pl4 = pathD4[x + y * 50];
      if (pl4 >= 900) continue;
      if (pl4 > d + 12 || pl4 > 18) continue;
      if (roadReserved && isCriticalChoke(terrain, origin, blocked, roadReserved, x, y)) {
        // Non-choke pass: always skip necks.
        // Choke fallback: allow only the first building (need ≥1 spawn/terminal);
        // further choke stacks seal the corridor (E8S3 triple-spawn wall).
        if (!allowChoke) continue;
        if (out.length > 0) continue;
      }
      out.push({ x, y });
      blocked.add(k);
    }
  };
  // Prefer non-choke sites; optional buildings refuse choke fallback entirely
  tryPlace(false);
  if (out.length < n && !strictNoChoke) tryPlace(true);
  return out;
}

/**
 * Place labs only where a free D4 road face can be claimed immediately.
 * Claiming the face (blocked + roadReserved) stops later labs/links from landlocking it (gate D).
 */
function placeLabs(terrain, origin, blocked, roadReserved, offsets, n) {
  const out = [];
  // Path field rejects terrain-detour pockets: chebyshev-near tiles that snake
  // around wall fingers land outside the hub seal chamber (E4S3 coreOut: SW
  // strip at (17,17)/(17,18) path≈28 vs cheb 5–6 → labs beyond the cut).
  // D8 alone still admits diagonal squeezes (E8S5 lab@30,34 pl8=6 but pl4=29
  // → outside D4 seal flood / harsh coreOut). Gate both.
  const pathD = pathDistField(terrain, origin);
  const pathD4 = pathDistFieldD4(terrain, origin);
  for (const o of offsets) {
    if (out.length >= n) break;
    const x = origin.x + o.x,
      y = origin.y + o.y;
    const k = key(x, y);
    if (blocked.has(k) || !buildable(terrain, x, y)) continue;
    const d = Math.max(Math.abs(o.x), Math.abs(o.y));
    const pl = pathD[x + y * 50];
    if (pl >= 900) continue;
    // Same stretch threshold as dense ext packing; labs must stay path-near hub
    // so dilate+min-cut keeps them in the hub chamber (full-eco, no coreOut).
    if (pl > d + 6) continue;
    if (pl > 14) continue;
    const pl4 = pathD4[x + y * 50];
    if (pl4 >= 900 || pl4 > d + 12 || pl4 > 18) continue;
    // Prefer face toward hub (shorter logistics), then any free D4
    const faces = [
      ...D4.map(([dx, dy]) => ({ dx, dy, towardHub: Math.abs(x + dx - origin.x) + Math.abs(y + dy - origin.y) })),
    ].sort((a, b) => a.towardHub - b.towardHub);
    let faceK = null;
    for (const { dx, dy } of faces) {
      const nx = x + dx,
        ny = y + dy;
      const nk = key(nx, ny);
      if (blocked.has(nk)) continue;
      if (!buildable(terrain, nx, ny)) continue;
      faceK = nk;
      break;
    }
    if (!faceK) continue;
    out.push({ x, y });
    blocked.add(k);
    blocked.add(faceK);
    roadReserved.add(faceK);
  }
  return out;
}

/** Pack radius along intentional road skeleton (spokes + eco). */
const EXT_MAX_R = 10;
/** Extra chebyshev radius for rescue top-ups past skeleton tips. */
const EXT_RESCUE_R = 15;
/**
 * Legacy ring radii — kept empty on purpose.
 * Solid chebyshev rings (r=3/6/9) painted ~70–140 roads as a packing scaffold
 * with no travel intent. Packing now uses radial spokes + on-demand faces.
 * onCorridorRing() still consults this; leave [] so nothing is reserved as a ring.
 */
let CORRIDOR_RINGS = [];
/** openSpace≥this → slightly shorter eco paint (roomy seals need less haul road). */
const ROOMY_DROP_R9_SPACE = 200;

/**
 * D8 path distance field from hub (one BFS). Used to reject terrain-detour pockets
 * that look close by chebyshev but snake around walls (E4S7 western finger →
 * uncoverable left wall strip + false "ext outside seal" relative to hub chamber).
 */
function pathDistField(terrain, hub) {
  const dist = new Int16Array(2500);
  dist.fill(999);
  const start = approachTile(terrain, hub) || hub;
  if (!walkable(terrain, start.x, start.y) && !isWall(terrain, start.x, start.y)) {
    // hub tile itself
  }
  const sx = hub.x,
    sy = hub.y;
  if (sx < 0 || sy < 0 || sx > 49 || sy > 49) return dist;
  dist[sx + sy * 50] = 0;
  const q = [[sx, sy]];
  let qi = 0;
  while (qi < q.length) {
    const [x, y] = q[qi++];
    const d = dist[x + y * 50];
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny)) continue;
      const i = nx + ny * 50;
      if (dist[i] <= d + 1) continue;
      dist[i] = d + 1;
      q.push([nx, ny]);
    }
  }
  return dist;
}

/**
 * Dense-pack extensions onto free tiles that already have a D4 road neighbor.
 * Skips hub cardinal axes (reserved corridors) so later shell paving does not strip exts.
 * Optional interiorMask: after the shell is locked, only pack tiles inside the seal
 * (full-eco — never leave extensions outside a fixed cut).
 * Mutates blocked + structures.extension.
 */
function topUpExtensions(terrain, hub, blocked, structures, maxExt, maxR = EXT_MAX_R, interiorMask = null) {
  if (!structures.extension) structures.extension = [];
  if (!structures.road) structures.road = [];
  const roadSet = new Set(structures.road.map((r) => key(r.x, r.y)));
  const extSet = new Set(structures.extension.map((e) => key(e.x, e.y)));
  const pathD = pathDistField(terrain, hub);
  const pathD4 = pathDistFieldD4(terrain, hub);
  const isNearRoad = (x, y) => {
    for (const [dx, dy] of D4) if (roadSet.has(key(x + dx, y + dy))) return true;
    return false;
  };
  // Assess sparse = zero *cardinal* ext neighbors. D8-only pack scoring left
  // diagonal checkerboards (E5S9/E4S7 sp28, avgD4~0.8–1.0) while dens looked OK.
  const nearExtD4 = (x, y) => {
    let n = 0;
    for (const [dx, dy] of D4) if (extSet.has(key(x + dx, y + dy))) n++;
    return n;
  };
  const nearExtD8 = (x, y) => {
    let n = 0;
    for (const [dx, dy] of D8) if (extSet.has(key(x + dx, y + dy))) n++;
    return n;
  };
  // Cardinal axes stay clear for hub→shell corridors (paveShellAccess).
  // Late rescue may claim outer axis tiles (d≥4) when short of 60 — keeps spokes
  // near hub intact while recovering gate A on cramped seals (E4S7/E7S8).
  const onCorridorAxis = (x, y) => x === hub.x || y === hub.y;
  // Corridor ring lanes are roads / walk — never host extensions (even if a
  // ring tile failed to pave). Prevents ".E.E" on ring chebyshev shells.
  const onCorridorRing = (x, y) => CORRIDOR_RINGS.includes(chebyshev(hub, { x, y }));

  // Cap adds per pass so each re-score grows *cardinal* clumps (not a frozen
  // diagonal scatter). pack4 dominates; pack8 is secondary glue. Axes + rings
  // still carve corridors so this does not form solid brick.
  const MAX_ADD_PER_PASS = 5;
  const MAX_PASSES = 24;

  for (let pass = 0; pass < MAX_PASSES && structures.extension.length < maxExt; pass++) {
    const allowOuterAxis = pass >= 14;
    const candidates = [];
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) {
        const k = key(x, y);
        if (blocked.has(k) || roadSet.has(k) || extSet.has(k)) continue;
        if (!buildable(terrain, x, y)) continue;
        const d = chebyshev(hub, { x, y });
        if (onCorridorAxis(x, y) && !(allowOuterAxis && d >= 4)) continue;
        if (onCorridorRing(x, y)) continue;
        // Stay inside locked seal (wall ring tiles themselves are not interior)
        if (interiorMask && !interiorMask[x]?.[y]) continue;
        // Near-road preferred. Post-seal: also allow pack4≥1 free tiles without a
        // road face from pass≥6 — ensureExtensionAccess paves after. Cramped seals
        // leave freeDeep next to clumps that never get a spoke (E4S7 freeDeep~4–8).
        const pack4Early = nearExtD4(x, y);
        if (!isNearRoad(x, y)) {
          if (!(interiorMask && pass >= 6 && pack4Early >= 1)) continue;
        }
        if (d < 2 || d > maxR) continue;
        // Reject terrain-detour pockets (chebyshev close, path snakes around walls).
        // E4S7 western finger: cheb≈9 but path≈110 → uncoverable left wall strip.
        const pl = pathD[x + y * 50];
        if (pl >= 900) continue;
        if (pl > maxR + 4) continue;
        if (pl > d + 6) continue;
        // D4 path stretch: diagonal-only terrain squeezes look short on D8 (E8S5 SE
        // cheb 5 / d4 ~30) and land outside assess D4 chamber. Only flag severe
        // stretch (>+12 vs cheb) so E4S7 north edge pack (d4≈15–22, cheb≈10–12)
        // still fills to 60; a maxR cap here starved that row.
        const pl4 = pathD4[x + y * 50];
        if (pl4 >= 900) continue;
        if (pl4 > d + 12) continue;
        const pack4 = nearExtD4(x, y);
        const pack8 = nearExtD8(x, y);
        // Post-seal only: never re-seed total islands (pack4=pack8=0). E4S7 densify
        // moved iso@spawn then tower/ramp re-top re-placed a zero-neighbor ext.
        // Still allow diagonal glue (pack8≥1) so gate A rescue can finish 60 on
        // cramped seals; post-carve compact pulls pack4=0 into cardinal packs.
        if (interiorMask && pack4 === 0 && pack8 === 0 && extSet.size > 0) continue;
        // Cardinal adjacency first (cuts sparse=d4n0); diagonals secondary.
        // Soft cap on pack4=3 avoids chasing fully-enclosed brick cells.
        // Mild pack4 bump (20 vs 18) prefers clump faces over bare near-hub seeds
        // without starving late gate-A rescue islands (E5S9/E9S1@59 with *24).
        const axisPen = onCorridorAxis(x, y) ? 3 : 0;
        const packScore = Math.min(pack4, 3) * 20 + pack8 * 3;
        candidates.push({
          x,
          y,
          d,
          score: packScore - d * 1.5 - (pl - d) * 0.8 - axisPen,
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.d - b.d || a.y - b.y || a.x - b.x);
    let added = 0;
    for (const c of candidates) {
      if (structures.extension.length >= maxExt) break;
      if (added >= MAX_ADD_PER_PASS) break;
      const k = key(c.x, c.y);
      if (blocked.has(k) || roadSet.has(k) || extSet.has(k)) continue;
      structures.extension.push({ x: c.x, y: c.y });
      extSet.add(k);
      blocked.add(k);
      added++;
    }
    if (added === 0 && allowOuterAxis) break;
    if (added === 0) continue; // advance to axis-rescue / fill passes
  }
  return structures.extension.length;
}

/**
 * Pack at baseR, then expand radius if still short of maxExt.
 * Cramped pockets (E7S8) only have free near-road tiles at r=12–13 past corridor rings.
 * Does not add roads — only uses existing eco/spoke/ring access (gate F safe).
 * interiorMask: when set, never place outside the locked shell.
 */
function topUpExtensionsFlexible(terrain, hub, blocked, structures, maxExt, baseR = EXT_MAX_R, interiorMask = null) {
  let n = topUpExtensions(terrain, hub, blocked, structures, maxExt, baseR, interiorMask);
  if (n >= maxExt) return n;
  for (let r = baseR + 1; r <= EXT_RESCUE_R && n < maxExt; r++) {
    n = topUpExtensions(terrain, hub, blocked, structures, maxExt, r, interiorMask);
  }
  return n;
}

/**
 * Convert a dispensable interior road → extension when short of 60 after ramp carve.
 * Prefers non-axis, non-core-face roads that join existing packs. After each steal,
 * verifies hub can still walk to every ramp (gate C); reverts if not.
 *
 * Cramped seals (E4S7@34, E7S8@56): deep interior is often full of roads with only
 * a few free near-road tiles. Aggressive rescue:
 *  - pave alternate D4 faces so sole-face roads become stealable (gate B)
 *  - outer cardinal axis (d≥4) when still short
 *  - multi-face core roads (core keeps ≥1 other road) as last resort
 */
function rescueExtFromSafeRoads(terrain, hub, blocked, structures, maxExt, interiorMask = null, ramps = null) {
  if (!structures.extension) structures.extension = [];
  if (!structures.road) structures.road = [];
  if (structures.extension.length >= maxExt) return 0;
  if (!ramps?.length) return 0;

  const hardAt = (x, y) => isCoreStructureAt(structures, x, y);
  const allRampsReachable = (extSet) => {
    for (const ramp of ramps) {
      const q = [[hub.x, hub.y]];
      const seen = new Set([key(hub.x, hub.y)]);
      let qi = 0;
      let ok = false;
      while (qi < q.length) {
        const [x, y] = q[qi++];
        if (x === ramp.x && y === ramp.y) {
          ok = true;
          break;
        }
        for (const [dx, dy] of D8) {
          const nx = x + dx,
            ny = y + dy,
            k = key(nx, ny);
          if (seen.has(k) || nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
          if (!walkable(terrain, nx, ny)) continue;
          if ((hardAt(nx, ny) || extSet.has(k)) && !(nx === ramp.x && ny === ramp.y)) continue;
          seen.add(k);
          q.push([nx, ny]);
        }
      }
      if (!ok) return false;
    }
    return true;
  };

  let added = 0;
  // 30 steals: E4S7 needs ~20+ road→ext in a 130-tile deep seal
  for (let guard = 0; guard < 30 && structures.extension.length < maxExt; guard++) {
    const roadSet = new Set(structures.road.map((r) => key(r.x, r.y)));
    const extSet = new Set(structures.extension.map((e) => key(e.x, e.y)));
    const nearExtD4 = (x, y) => {
      let n = 0;
      for (const [dx, dy] of D4) if (extSet.has(key(x + dx, y + dy))) n++;
      return n;
    };
    const otherRoadFace = (ex, ey, skipK) => {
      for (const [dx, dy] of D4) {
        const k = key(ex + dx, ey + dy);
        if (k === skipK) continue;
        if (roadSet.has(k)) return true;
      }
      return false;
    };
    /** Pave an alternate D4 face so we can steal skipK without breaking gate B. */
    const paveAltFace = (ex, ey, skipK) => {
      for (const [dx, dy] of D4) {
        const fx = ex + dx,
          fy = ey + dy;
        const fk = key(fx, fy);
        if (fk === skipK) continue;
        if (roadSet.has(fk)) return true;
        if (!buildable(terrain, fx, fy)) continue;
        if (extSet.has(fk) || hardAt(fx, fy)) continue;
        if (blocked.has(fk) && !roadSet.has(fk)) continue;
        if (interiorMask && !interiorMask[fx]?.[fy]) continue;
        structures.road.push({ x: fx, y: fy });
        roadSet.add(fk);
        return true;
      }
      return false;
    };
    /** Core keeps a road face other than skipK. */
    const coreHasOtherFace = (cx, cy, skipK) => {
      for (const [dx, dy] of D4) {
        const k = key(cx + dx, cy + dy);
        if (k === skipK) continue;
        if (roadSet.has(k)) return true;
      }
      return false;
    };

    const shortBy = maxExt - structures.extension.length;
    // Phase: 0 = free pack roads; 1 = + outer axis; 2 = + multi-face core
    // (desperate sole-face steals without alt faces thrash: ensure steals back)
    const phase = shortBy > 12 ? 2 : shortBy > 4 ? 1 : 0;

    const cands = [];
    for (const r of structures.road) {
      const d = chebyshev(hub, r);
      if (d < 2 || d > EXT_RESCUE_R) continue;
      const onAxis = r.x === hub.x || r.y === hub.y;
      // Keep hub ring (d=1 already skipped) and near-hub spokes; outer axis OK late
      if (onAxis && !(phase >= 1 && d >= 4)) continue;
      if (CORRIDOR_RINGS.includes(d)) continue;
      if (interiorMask && !interiorMask[r.x]?.[r.y]) continue;
      if (!buildable(terrain, r.x, r.y)) continue;
      if (hardAt(r.x, r.y)) continue;

      // Core-face: only steal when every adjacent core keeps another road face
      let coreFace = false;
      let coreOk = true;
      for (const [dx, dy] of D4) {
        const cx = r.x + dx,
          cy = r.y + dy;
        if (!hardAt(cx, cy)) continue;
        coreFace = true;
        if (!coreHasOtherFace(cx, cy, key(r.x, r.y))) {
          coreOk = false;
          break;
        }
      }
      if (coreFace && (phase < 2 || !coreOk)) continue;

      const pack4 = nearExtD4(r.x, r.y);
      if (pack4 < 1) continue;

      // Prefer non-axis, non-core, high pack4, closer to hub
      const axisPen = onAxis ? 8 : 0;
      const corePen = coreFace ? 6 : 0;
      cands.push({
        x: r.x,
        y: r.y,
        pack4,
        d,
        score: pack4 * 10 - d - axisPen - corePen,
      });
    }
    cands.sort((a, b) => b.score - a.score || a.d - b.d || a.y - b.y || a.x - b.x);
    let did = false;
    for (const c of cands) {
      const k = key(c.x, c.y);
      // Ensure neighboring exts keep a road face (pave alt if needed)
      let ok = true;
      for (const [dx, dy] of D4) {
        const nx = c.x + dx,
          ny = c.y + dy;
        if (!extSet.has(key(nx, ny))) continue;
        if (otherRoadFace(nx, ny, k)) continue;
        if (!paveAltFace(nx, ny, k)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // Multi-face core: re-check after any pave (roadSet updated)
      {
        let coreOk = true;
        for (const [dx, dy] of D4) {
          const cx = c.x + dx,
            cy = c.y + dy;
          if (!hardAt(cx, cy)) continue;
          if (!coreHasOtherFace(cx, cy, k)) {
            coreOk = false;
            break;
          }
        }
        if (!coreOk) continue;
      }

      const ri = structures.road.findIndex((r) => r.x === c.x && r.y === c.y);
      if (ri < 0) continue;
      // New ext must keep a D4 road face after conversion (gate B) — pave one if needed.
      if (!otherRoadFace(c.x, c.y, k)) {
        if (!paveAltFace(c.x, c.y, k)) continue;
      }
      // trial: road → ext
      structures.road.splice(ri, 1);
      roadSet.delete(k);
      structures.extension.push({ x: c.x, y: c.y });
      const trialExt = new Set(structures.extension.map((e) => key(e.x, e.y)));
      if (!allRampsReachable(trialExt)) {
        // revert steal (leave any alt-face roads — still useful)
        structures.extension.pop();
        structures.road.splice(ri, 0, { x: c.x, y: c.y });
        roadSet.add(k);
        continue;
      }
      blocked.add(k);
      extSet.add(k);
      added++;
      did = true;
      break;
    }
    if (!did) break;
  }
  return added;
}

/**
 * Flood-grow extension clumps into free seal tiles without requiring a road
 * neighbor first (ensureExtensionAccess paves faces after).
 *
 * Cramped rooms often have huge RA-safe interior but roads only near the hub
 * skeleton — near-road topUp stalls ~45–50 while freeDeep is hundreds of tiles
 * (E4S7). Grow cardinally from existing packs; keep hub axes + every CORRIDOR_STEP
 * chebyshev ring clear so we do not brick the seal.
 */
function floodGrowExtensions(terrain, hub, blocked, structures, maxExt, interiorMask = null) {
  if (!structures.extension) structures.extension = [];
  if (!structures.road) structures.road = [];
  if (structures.extension.length >= maxExt) return 0;
  const roadSet = new Set(structures.road.map((r) => key(r.x, r.y)));
  const extSet = new Set(structures.extension.map((e) => key(e.x, e.y)));
  const nearExtD4 = (x, y) => {
    let n = 0;
    for (const [dx, dy] of D4) if (extSet.has(key(x + dx, y + dy))) n++;
    return n;
  };
  const nearExtD8 = (x, y) => {
    let n = 0;
    for (const [dx, dy] of D8) if (extSet.has(key(x + dx, y + dy))) n++;
    return n;
  };
  let added = 0;
  // Multi-pass growth: each pass adds faces of current clumps
  for (let pass = 0; pass < 40 && structures.extension.length < maxExt; pass++) {
    const cands = [];
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) {
        const k = key(x, y);
        if (blocked.has(k) || roadSet.has(k) || extSet.has(k)) continue;
        if (isCoreStructureAt(structures, x, y)) continue;
        if (!buildable(terrain, x, y)) continue;
        if (interiorMask && !interiorMask[x]?.[y]) continue;
        // Keep cardinal corridors + thin rings every CORRIDOR_STEP
        if (x === hub.x || y === hub.y) continue;
        const d = chebyshev(hub, { x, y });
        if (d < 2 || d > EXT_RESCUE_R + 4) continue;
        if (d % CORRIDOR_STEP === 0) continue; // thin walk rings (3,6,9,12,15)
        if (CORRIDOR_RINGS.includes(d)) continue;
        const pack4 = nearExtD4(x, y);
        const pack8 = nearExtD8(x, y);
        // Must join an existing clump (no islands)
        if (pack4 === 0 && pack8 === 0) continue;
        // Prefer cardinal glue; soft-cap pack4=3 against solid brick cells
        if (pack4 >= 3 && pack8 >= 5) continue;
        cands.push({
          x,
          y,
          d,
          score: Math.min(pack4, 3) * 20 + pack8 * 2 - d * 0.5,
        });
      }
    }
    cands.sort((a, b) => b.score - a.score || a.d - b.d || a.y - b.y || a.x - b.x);
    let passAdd = 0;
    for (const c of cands) {
      if (structures.extension.length >= maxExt) break;
      if (passAdd >= 8) break; // re-score clumps each pass
      const k = key(c.x, c.y);
      if (blocked.has(k) || roadSet.has(k) || extSet.has(k)) continue;
      structures.extension.push({ x: c.x, y: c.y });
      extSet.add(k);
      blocked.add(k);
      added++;
      passAdd++;
    }
    if (passAdd === 0) break;
  }
  return added;
}

/**
 * Last-resort free-tile pack when short after ramp-carve (E4S7 → 59).
 * Near-road free tiles only (ignore stale `blocked` ghosts). Pack-hole fills
 * without roads re-seal hub→ramp necks — use rescueExtFromSafeRoads instead.
 * Never places on axes/rings or outside interiorMask.
 */
function topUpExtensionsIgnoreGhostBlocked(terrain, hub, blocked, structures, maxExt, interiorMask = null) {
  if (!structures.extension) structures.extension = [];
  if (!structures.road) structures.road = [];
  if (structures.extension.length >= maxExt) return structures.extension.length;
  const roadSet = new Set(structures.road.map((r) => key(r.x, r.y)));
  const extSet = new Set(structures.extension.map((e) => key(e.x, e.y)));
  const pathD = pathDistField(terrain, hub);
  const pathD4 = pathDistFieldD4(terrain, hub);
  const isNearRoad = (x, y) => {
    for (const [dx, dy] of D4) if (roadSet.has(key(x + dx, y + dy))) return true;
    return false;
  };
  const nearExtD4 = (x, y) => {
    let n = 0;
    for (const [dx, dy] of D4) if (extSet.has(key(x + dx, y + dy))) n++;
    return n;
  };
  const nearExtD8 = (x, y) => {
    let n = 0;
    for (const [dx, dy] of D8) if (extSet.has(key(x + dx, y + dy))) n++;
    return n;
  };
  const cands = [];
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const k = key(x, y);
      if (roadSet.has(k) || extSet.has(k)) continue;
      if (isCoreStructureAt(structures, x, y)) continue;
      if (!buildable(terrain, x, y)) continue;
      if (interiorMask && !interiorMask[x]?.[y]) continue;
      if (x === hub.x || y === hub.y) continue;
      const d = chebyshev(hub, { x, y });
      if (CORRIDOR_RINGS.includes(d)) continue;
      if (d < 2 || d > EXT_RESCUE_R) continue;
      if (!isNearRoad(x, y)) continue;
      const pl = pathD[x + y * 50];
      if (pl >= 900 || pl > EXT_RESCUE_R + 4 || pl > d + 6) continue;
      const pl4 = pathD4[x + y * 50];
      if (pl4 >= 900 || pl4 > d + 12) continue;
      const pack4 = nearExtD4(x, y);
      const pack8 = nearExtD8(x, y);
      // Same post-seal anti-total-island rule as topUpExtensions.
      if (pack4 === 0 && pack8 === 0 && extSet.size > 0) continue;
      cands.push({
        x,
        y,
        d,
        score: Math.min(pack4, 3) * 10 + pack8 * 3 - d - (pack4 === 0 ? 6 : 0),
      });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.d - b.d || a.y - b.y || a.x - b.x);
  for (const c of cands) {
    if (structures.extension.length >= maxExt) break;
    const k = key(c.x, c.y);
    if (roadSet.has(k) || extSet.has(k) || isCoreStructureAt(structures, c.x, c.y)) continue;
    structures.extension.push({ x: c.x, y: c.y });
    extSet.add(k);
    blocked.add(k);
  }
  return structures.extension.length;
}

/**
 * Move D4-sparse / low-pack extensions into free holes next to clumps.
 * Diagonal-only islands count as sparse in assess (d4n==0) even when D8 dens is
 * fine — e.g. E4S7/E5S9 sp28 with iso@d=10 while a pack4≥2 hole sits empty.
 *
 * Free holes preferred. Road-steal into packs:
 * (a) cardinally join pack (pack4≥2, or pack4≥1 for pure d4n0 sparse),
 * (b) neighbor exts keep a D4 road face — pave an empty alternate face if the
 *     stolen tile was their only face (unlocks ring-road densify),
 * (c) steal tile itself touches another road (new ext keeps gate-B access).
 * Outer ring r=9 roads may be stolen (sandwich densify); r=3/r=6 stay corridors.
 * Caps pack4≤3 (no brick). Pack scored excluding the candidate. Max 22 steals.
 * Mid densify: pack4=2→3 preferred; same pack4 with pack8+2 also allowed (was
 * gated dead by a hard p4<3 skip). Steal alt-faces: outer-axis for pack4≤1 and
 * vacating weak tile as replacement road (E4S7 freeHoles=0 / noAltFace thrash).
 *
 * When `ramps` is provided, free-walk (freeFlood) glue holes (pack4≥1) are
 * allowed if hub→every-ramp still walks after the move — blanket freeFlood bans
 * left E8S4/E4S7 with 0–1 densify targets and sp9 leftovers. Without ramps, keep
 * the old freeFlood ban (gate C safe default).
 * Mutates blocked + structures in place.
 */
function compactExtensions(terrain, hub, blocked, structures, interiorMask = null, ramps = null) {
  if (!structures.extension?.length) return 0;
  if (!structures.road) structures.road = [];
  const roadSet = new Set(structures.road.map((r) => key(r.x, r.y)));
  const pathD = pathDistField(terrain, hub);
  const pathD4 = pathDistFieldD4(terrain, hub);
  const onCorridorAxis = (x, y) => x === hub.x || y === hub.y;
  const onCorridorRing = (x, y) => CORRIDOR_RINGS.includes(chebyshev(hub, { x, y }));
  // Free-walk flood from hub (roads + empty only). Filling/stealing these can
  // re-seal hub→ramp necks (gate C — E4S7/E8S3). With ramps, trial-check instead.
  const freeFlood = new Set();
  {
    const hardTypes = [
      "spawn",
      "storage",
      "terminal",
      "lab",
      "link",
      "factory",
      "nuker",
      "observer",
      "tower",
      "extension",
    ];
    const hard = new Set();
    for (const t of hardTypes)
      for (const p of structures[t] || []) hard.add(key(p.x, p.y));
    const q = [[hub.x, hub.y]];
    freeFlood.add(key(hub.x, hub.y));
    let qi = 0;
    while (qi < q.length) {
      const [x, y] = q[qi++];
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy,
          k = key(nx, ny);
        if (freeFlood.has(k) || nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        if (!walkable(terrain, nx, ny)) continue;
        if (hard.has(k)) continue;
        freeFlood.add(k);
        q.push([nx, ny]);
      }
    }
  }
  const hardAt = (x, y) => {
    for (const t of [
      "spawn",
      "storage",
      "terminal",
      "lab",
      "link",
      "factory",
      "nuker",
      "observer",
      "tower",
    ]) {
      if ((structures[t] || []).some((p) => p.x === x && p.y === y)) return true;
    }
    return false;
  };
  const allRampsReachable = (extSet) => {
    if (!ramps?.length) return true;
    for (const ramp of ramps) {
      const q = [[hub.x, hub.y]];
      const seen = new Set([key(hub.x, hub.y)]);
      let qi = 0;
      let ok = false;
      while (qi < q.length) {
        const [x, y] = q[qi++];
        if (x === ramp.x && y === ramp.y) {
          ok = true;
          break;
        }
        for (const [dx, dy] of D8) {
          const nx = x + dx,
            ny = y + dy,
            k = key(nx, ny);
          if (seen.has(k) || nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
          if (!walkable(terrain, nx, ny)) continue;
          if ((hardAt(nx, ny) || extSet.has(k)) && !(nx === ramp.x && ny === ramp.y)) continue;
          seen.add(k);
          q.push([nx, ny]);
        }
      }
      if (!ok) return false;
    }
    return true;
  };
  /** Empty buildable tile we can pave as a road face (not ext/core/road). */
  const findPaveFace = (x, y, extSet, avoidK = null, allowOuterAxis = false) => {
    for (const [dx, dy] of D4) {
      const fx = x + dx,
        fy = y + dy,
        fk = key(fx, fy);
      if (avoidK && fk === avoidK) continue;
      if (roadSet.has(fk) || extSet.has(fk)) continue;
      if (hardAt(fx, fy)) continue;
      if (!buildable(terrain, fx, fy)) continue;
      if (blocked.has(fk)) continue;
      // Keep near-hub axes clear (spokes). Outer axis (d≥4) OK when densifying
      // pure-sparse — northern E4S7 ring steals often only have axis alt faces.
      if (onCorridorAxis(fx, fy)) {
        if (!(allowOuterAxis && chebyshev(hub, { x: fx, y: fy }) >= 4)) continue;
      }
      return { x: fx, y: fy };
    }
    return null;
  };
  const paveRoad = (p) => {
    const k = key(p.x, p.y);
    if (roadSet.has(k)) return false;
    structures.road.push({ x: p.x, y: p.y });
    roadSet.add(k);
    blocked.add(k);
    return true;
  };
  const unpaveRoad = (p) => {
    const k = key(p.x, p.y);
    const i = structures.road.findIndex((r) => r.x === p.x && r.y === p.y);
    if (i >= 0) structures.road.splice(i, 1);
    roadSet.delete(k);
    blocked.delete(k);
  };
  const okTile = (x, y) => {
    if (x < 2 || x > 47 || y < 2 || y > 47) return false;
    if (!buildable(terrain, x, y)) return false;
    if (interiorMask && !interiorMask[x]?.[y]) return false;
    if (onCorridorAxis(x, y)) return false;
    const d = chebyshev(hub, { x, y });
    // Outer ring r=9 roads are valid densify steal targets (sandwich packs on
    // E4S7/E8S4). r=3/r=6 stay pure corridors; non-road ring tiles never host exts.
    if (onCorridorRing(x, y)) {
      if (!(d === 9 && roadSet.has(key(x, y)))) return false;
    }
    if (d < 2 || d > EXT_RESCUE_R) return false;
    const pl = pathD[x + y * 50];
    if (pl >= 900 || pl > EXT_RESCUE_R + 4 || pl > d + 6) return false;
    const pl4 = pathD4[x + y * 50];
    if (pl4 >= 900 || pl4 > d + 12) return false;
    return true;
  };
  let moved = 0;
  let steals = 0;
  const MAX_STEALS = 22;
  const allowFloodGlue = !!(ramps && ramps.length);
  for (let iter = 0; iter < 120; iter++) {
    const extSet = new Set(structures.extension.map((e) => key(e.x, e.y)));
    const nearExtD4 = (x, y, excludeK = null) => {
      let n = 0;
      for (const [dx, dy] of D4) {
        const k = key(x + dx, y + dy);
        if (excludeK && k === excludeK) continue;
        if (extSet.has(k)) n++;
      }
      return n;
    };
    const nearExtD8 = (x, y, excludeK = null) => {
      let n = 0;
      for (const [dx, dy] of D8) {
        const k = key(x + dx, y + dy);
        if (excludeK && k === excludeK) continue;
        if (extSet.has(k)) n++;
      }
      return n;
    };
    // Cardinal-sparse first (d4n 0–1), then pack4=2 mid densify (pack4=3 holes
    // or same pack4 with pack8+2). Cap still pack4≤3 on targets (no brick).
    const weak = structures.extension
      .map((e, i) => ({
        e,
        i,
        pack4: nearExtD4(e.x, e.y),
        pack8: nearExtD8(e.x, e.y),
        d: chebyshev(hub, e),
      }))
      .filter((w) => w.pack4 <= 2)
      .sort((a, b) => a.pack4 - b.pack4 || a.pack8 - b.pack8 || b.d - a.d);
    if (!weak.length) break;

    // Free-tile holes (prefer) + safe dual-access road steals into clumps.
    // freeFlood glue + outer-ring r=9 steals use ramp trial (gate C).
    const holes = [];
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) {
        const k = key(x, y);
        if (extSet.has(k)) continue;
        if (!okTile(x, y)) continue;
        const isRoad = roadSet.has(k);
        const onFlood = freeFlood.has(k);
        let paveFace = null;
        if (!isRoad) {
          if (blocked.has(k)) continue;
          // Enclosed pockets always OK. Walkable freeFlood only with ramp-checked glue.
          if (onFlood && !allowFloodGlue) continue;
          // Prefer free holes that already touch a road. Else allow if we can pave
          // an empty D4 face after the move (avoids ensureExtensionAccess ext-steal).
          let nearR = false;
          for (const [dx, dy] of D4) {
            if (roadSet.has(key(x + dx, y + dy))) {
              nearR = true;
              break;
            }
          }
          if (!nearR) {
            paveFace = findPaveFace(x, y, extSet);
            if (!paveFace) continue;
          }
        } else {
          if (steals >= MAX_STEALS) continue;
          if (isCoreStructureAt(structures, x, y)) continue;
          // Corridor roads: only with ramp trial; never without ramps.
          if (onFlood && !allowFloodGlue) continue;
          // Never steal a lab/tower/spawn D4 face road — ensure*D4Roads would
          // reclaim by converting an extension and drop under 60.
          let coreFace = false;
          for (const [dx, dy] of D4) {
            if (isCoreStructureAt(structures, x + dx, y + dy)) {
              coreFace = true;
              break;
            }
          }
          if (coreFace) continue;
          // New ext must keep a D4 road face without paving
          let touchesRoad = false;
          for (const [dx, dy] of D4) {
            if (roadSet.has(key(x + dx, y + dy))) {
              touchesRoad = true;
              break;
            }
          }
          if (!touchesRoad) continue;
        }
        const pack4 = nearExtD4(x, y);
        // Free: pack4 1–3. Steal: pack4≥1 (pure-sparse may use single glue).
        if (pack4 < 1 || pack4 >= 4) continue;
        const pack8 = nearExtD8(x, y);
        holes.push({
          x,
          y,
          pack4,
          pack8,
          d: chebyshev(hub, { x, y }),
          steal: isRoad,
          needRamp: onFlood || isRoad,
          paveFace,
        });
      }
    }
    holes.sort(
      (a, b) =>
        (a.steal ? 1 : 0) - (b.steal ? 1 : 0) ||
        (a.paveFace ? 1 : 0) - (b.paveFace ? 1 : 0) ||
        (a.needRamp ? 1 : 0) - (b.needRamp ? 1 : 0) ||
        b.pack4 - a.pack4 ||
        b.pack8 - a.pack8 ||
        a.d - b.d,
    );
    if (!holes.length) break;

    let did = false;
    for (const w of weak) {
      const weakK = key(w.e.x, w.e.y);
      for (const target of holes) {
        const hk = key(target.x, target.y);
        if (hk === weakK) continue;
        if (extSet.has(hk)) continue;
        if (!target.steal && blocked.has(hk)) continue;
        if (target.steal && (!roadSet.has(hk) || steals >= MAX_STEALS)) continue;
        // Pack excluding the sparse being moved — hole that only touches weak is fake
        const p4 = nearExtD4(target.x, target.y, weakK);
        const p8 = nearExtD8(target.x, target.y, weakK);
        if (p4 < 1 || p4 >= 4) continue;
        // Road steal: pack4≥2 preferred; pure d4n0 sparse may take pack4=1 glue.
        // pack4≥1 may steal pack4=1 only via pack8 upgrade (below).
        if (target.steal && p4 < 1) continue;
        let packUpgrade = false;
        if (p4 >= w.pack4 + 1) packUpgrade = true;
        else if (p4 > w.pack4) packUpgrade = true;
        // Same pack4 with strong D8 upgrade — was dead for pack4=2 because a
        // hard `p4<3 continue` ran first (E8S7/E6S2 midSkip thrash, dens~2.9).
        else if (p4 === w.pack4 && p4 >= 1 && p8 >= w.pack8 + 2) packUpgrade = true;
        if (!packUpgrade) continue;
        // Steal with only pack4=1 glue: pure-sparse OR pack8-upgrade path only.
        if (target.steal && p4 < 2 && w.pack4 > 0 && !(p4 === w.pack4 && p8 >= w.pack8 + 2))
          continue;

        const oldK = key(w.e.x, w.e.y);
        const newK = hk;
        const oldPos = { x: w.e.x, y: w.e.y };
        let stoleRi = -1;
        const pavedAlt = [];
        // Vacating weak tile can restore a neighbor's D4 road face after steal —
        // schedule pave after oldK is freed (not yet empty for findPaveFace).
        const weakAsAlt = [];

        if (target.steal) {
          // Neighboring exts need a D4 road face after steal. If the steal tile
          // was their only face, pave an empty alternate (enables r=9 ring densify).
          // E4S7: freeHoles=0 and ~1k noAltFace — allow outer-axis alts for pack4≤1
          // and prefer the vacating weak cell when it D4-touches the neighbor.
          let ok = true;
          for (const [dx, dy] of D4) {
            const nx = target.x + dx,
              ny = target.y + dy;
            const nk = key(nx, ny);
            if (!extSet.has(nk) || nk === weakK) continue;
            let other = false;
            for (const [ox, oy] of D4) {
              const fk = key(nx + ox, ny + oy);
              if (fk === newK) continue;
              if (roadSet.has(fk)) {
                other = true;
                break;
              }
            }
            if (!other) {
              // Vacating weak tile is D4-adjacent → use it as the replacement road
              // (compact moves weak onto the steal; old cell frees for gate B).
              let weakTouch = false;
              for (const [ox, oy] of D4) {
                if (nx + ox === oldPos.x && ny + oy === oldPos.y) {
                  weakTouch = true;
                  break;
                }
              }
              if (weakTouch && buildable(terrain, oldPos.x, oldPos.y)) {
                // Defer pave until oldK unblocked; mark claimed so multi-neighbor
                // steals share one road on weak's tile.
                if (!weakAsAlt.some((p) => p.x === oldPos.x && p.y === oldPos.y))
                  weakAsAlt.push({ x: oldPos.x, y: oldPos.y });
              } else {
                // pack4≤1 densify may use outer-axis alt faces (E4S7 north ring).
                const alt = findPaveFace(nx, ny, extSet, newK, w.pack4 <= 1);
                if (!alt) {
                  ok = false;
                  break;
                }
                paveRoad(alt);
                pavedAlt.push(alt);
              }
            }
          }
          if (!ok) {
            for (const p of pavedAlt) unpaveRoad(p);
            continue;
          }
          stoleRi = structures.road.findIndex((r) => r.x === target.x && r.y === target.y);
          if (stoleRi < 0) {
            for (const p of pavedAlt) unpaveRoad(p);
            continue;
          }
          structures.road.splice(stoleRi, 1);
          roadSet.delete(newK);
          // newK stays blocked (was road, becomes ext)
        } else {
          blocked.add(newK);
          // Free hole with no existing road neighbor: pave planned face for gate B.
          if (target.paveFace) {
            const pf = target.paveFace;
            const pfk = key(pf.x, pf.y);
            if (!roadSet.has(pfk) && !extSet.has(pfk) && !blocked.has(pfk) && buildable(terrain, pf.x, pf.y)) {
              paveRoad(pf);
              pavedAlt.push(pf);
            } else {
              // planned face taken — try any empty face
              const alt = findPaveFace(target.x, target.y, extSet);
              if (!alt) {
                blocked.delete(newK);
                continue;
              }
              paveRoad(alt);
              pavedAlt.push(alt);
            }
          }
        }

        blocked.delete(oldK);
        structures.extension[w.i] = { x: target.x, y: target.y };
        // Pave vacating weak tile as replacement road face(s) for steal neighbors.
        for (const p of weakAsAlt) {
          const pk = key(p.x, p.y);
          if (!roadSet.has(pk) && !extSet.has(pk) && buildable(terrain, p.x, p.y)) {
            // oldK may equal p — not in extSet after move; ensure not re-blocked as ext
            if (pk === oldK || !blocked.has(pk)) {
              paveRoad(p);
              pavedAlt.push(p);
            }
          }
        }

        // Gate C: never seal hub→ramp. Always trial when ramps provided —
        // freeFlood is computed once, so after a weak-ext move, tiles that were
        // behind it look like non-flood "pockets" (needRamp=false) but can be
        // the only remaining neck (E4S7 soft densify 7/7→0/7).
        if (ramps?.length) {
          const trialExt = new Set(structures.extension.map((e) => key(e.x, e.y)));
          if (!allRampsReachable(trialExt)) {
            // revert
            structures.extension[w.i] = oldPos;
            blocked.add(oldK);
            if (target.steal && stoleRi >= 0) {
              structures.road.splice(stoleRi, 0, { x: target.x, y: target.y });
              roadSet.add(newK);
            } else {
              blocked.delete(newK);
            }
            for (const p of pavedAlt) unpaveRoad(p);
            continue;
          }
        }

        if (target.steal) steals++;
        moved++;
        did = true;
        break; // recompute packs after each move
      }
      if (did) break;
    }
    if (!did) break;
  }
  return moved;
}

/**
 * Cramped seals (E4S7) can hit freeIn=0 before 60 after solid corridor rings:
 * r=9 roads occupy tiles that used to be sparse gap-exts. Convert outer-ring
 * (r=9) roads into extensions when they cardinally join existing packs — densifies
 * the double-row sandwich and recovers gate A without reopening checkerboard.
 * Leaves r=3/r=6 rings + hub ring + axes intact. Caller must ensureExtensionAccess.
 */
function rescueExtFromOuterRing(terrain, hub, blocked, structures, maxExt, interiorMask = null) {
  if (!structures.extension) structures.extension = [];
  if (!structures.road) structures.road = [];
  if (structures.extension.length >= maxExt) return 0;
  const OUTER = 9;
  let added = 0;
  for (let guard = 0; guard < 12 && structures.extension.length < maxExt; guard++) {
    const roadSet = new Set(structures.road.map((r) => key(r.x, r.y)));
    const extSet = new Set(structures.extension.map((e) => key(e.x, e.y)));
    const nearExtD4 = (x, y) => {
      let n = 0;
      for (const [dx, dy] of D4) if (extSet.has(key(x + dx, y + dy))) n++;
      return n;
    };
    const otherRoadFace = (ex, ey, skipK) => {
      for (const [dx, dy] of D4) {
        const k = key(ex + dx, ey + dy);
        if (k === skipK) continue;
        if (roadSet.has(k)) return true;
      }
      return false;
    };
    /** Pave an alternate D4 face for ext so we can steal skipK road safely. */
    const paveAltFace = (ex, ey, skipK) => {
      for (const [dx, dy] of D4) {
        const fx = ex + dx,
          fy = ey + dy;
        const fk = key(fx, fy);
        if (fk === skipK) continue;
        if (roadSet.has(fk)) return true;
        if (!buildable(terrain, fx, fy)) continue;
        if (extSet.has(fk) || isCoreStructureAt(structures, fx, fy)) continue;
        if (blocked.has(fk) && !roadSet.has(fk)) continue;
        if (interiorMask && !interiorMask[fx]?.[fy]) continue;
        // free tile → road
        structures.road.push({ x: fx, y: fy });
        roadSet.add(fk);
        return true;
      }
      return false;
    };
    const cands = [];
    for (let i = 0; i < structures.road.length; i++) {
      const r = structures.road[i];
      if (chebyshev(hub, r) !== OUTER) continue;
      if (r.x === hub.x || r.y === hub.y) continue; // keep spoke/ring joints
      if (interiorMask && !interiorMask[r.x]?.[r.y]) continue;
      if (!buildable(terrain, r.x, r.y)) continue;
      if (isCoreStructureAt(structures, r.x, r.y)) continue;
      const pack4 = nearExtD4(r.x, r.y);
      if (pack4 < 1) continue; // only join an existing clump
      cands.push({ i, x: r.x, y: r.y, pack4, d: chebyshev(hub, r) });
    }
    cands.sort((a, b) => b.pack4 - a.pack4 || a.d - b.d || a.y - b.y || a.x - b.x);
    if (!cands.length) break;

    let did = false;
    for (const c of cands) {
      const rk = key(c.x, c.y);
      // Neighboring exts that only touch this road need an alternate face first,
      // else ensureExtensionAccess immediately converts our new ext back to road.
      let ok = true;
      for (const [dx, dy] of D4) {
        const nx = c.x + dx,
          ny = c.y + dy;
        if (!extSet.has(key(nx, ny))) continue;
        if (otherRoadFace(nx, ny, rk)) continue;
        if (!paveAltFace(nx, ny, rk)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // re-find road index (paveAlt may have grown the array; index may have shifted)
      const ri = structures.road.findIndex((r) => r.x === c.x && r.y === c.y);
      if (ri < 0) continue;
      structures.road.splice(ri, 1);
      roadSet.delete(rk);
      blocked.delete(rk);
      structures.extension.push({ x: c.x, y: c.y });
      extSet.add(rk);
      blocked.add(rk);
      added++;
      did = true;
      break; // recompute packs
    }
    if (!did) break;
  }
  return added;
}

/**
 * Cardinal spokes hub→maxR with 1-tile detours around walls.
 *
 * Bugfix: pure-axis loops used to `break` when a tile already had a road
 * (hub ring always occupies i=1), so spokes never extended past the ring —
 * E7S8/E8S4 ended as [2,0,2,0]-class corridors. Existing roads continue;
 * terrain blocks try ±1 perpendicular (cap perp≤2) before giving up.
 *
 * placeRoad(x,y) → truthy if tile is (or becomes) corridor:
 *   true / "ok"  — step accepted, keep walking this spoke
 *   "stop"       — step accepted, end this spoke (e.g. hit shell)
 *   false        — reject candidate (try next detour)
 */
function walkCardinalSpokes(terrain, hub, maxR, placeRoad) {
  for (const [sx, sy] of D4) {
    let x = hub.x;
    let y = hub.y;
    for (let step = 0; step < maxR; step++) {
      const cands = [];
      const fx = x + sx;
      const fy = y + sy;
      // Prefer pure forward, then side-step detours (not diagonal backtracks)
      cands.push([fx, fy]);
      if (sx === 0) {
        cands.push([fx + 1, fy], [fx - 1, fy]);
      } else {
        cands.push([fx, fy + 1], [fx, fy - 1]);
      }
      // Prefer pure-axis (perp=0), then small realign; avoid fat ±2 near hub
      // (E7S8 weak pure-axis — terrain forced perp=2 on early steps).
      cands.sort((a, b) => {
        const pa = sx === 0 ? Math.abs(a[0] - hub.x) : Math.abs(a[1] - hub.y);
        const pb = sx === 0 ? Math.abs(b[0] - hub.x) : Math.abs(b[1] - hub.y);
        return pa - pb;
      });
      let advanced = false;
      let stopSpoke = false;
      const along0 = sx * (x - hub.x) + sy * (y - hub.y);
      // Near hub: only ±1 detour so corridors stay thin; outer steps may use ±2
      // to clear terrain fingers without ending the spoke early.
      const maxPerp = step < 6 ? 1 : 2;
      for (const [nx, ny] of cands) {
        if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;
        const along1 = sx * (nx - hub.x) + sy * (ny - hub.y);
        if (along1 <= along0) continue;
        const perp = sx === 0 ? Math.abs(nx - hub.x) : Math.abs(ny - hub.y);
        if (perp > maxPerp) continue;
        const res = placeRoad(nx, ny);
        if (res) {
          x = nx;
          y = ny;
          advanced = true;
          if (res === "stop") stopSpoke = true;
          break;
        }
      }
      if (!advanced || stopSpoke) break;
    }
  }
}

/**
 * DENSE extensions on an intentional road skeleton (not city-grid, not ring spam):
 *
 * Roads (intent only):
 *   - hub logistics ring (D8)
 *   - one D4 face per core structure
 *   - economy paths hub → controller / sources (near-base only)
 *   - 8 radial spokes (cardinal + diagonal) — main arteries for refill + walk-out
 *   - NO solid concentric rings (those painted 70–140 roads with zero travel intent)
 *
 * Extensions:
 *   - pack tightly next to existing roads, closest-first clumps
 *   - ensureExtensionAccess later paves single faces only where still missing
 *   - cardinal axes reserved near hub so shell spokes stay open
 */
function buildRoadsAndExtensions(terrain, hub, blocked, controller, sourceContainers, maxExt, coreTiles = []) {
  const roads = [];
  const roadSet = new Set();
  const addRoad = (x, y) => {
    const k = key(x, y);
    if (roadSet.has(k)) return false;
    if (x === hub.x && y === hub.y) return false;
    if (!buildable(terrain, x, y)) return false;
    if (blocked.has(k)) return false;
    roadSet.add(k);
    roads.push({ x, y });
    return true;
  };

  // 1) Hub logistics ring
  for (const [dx, dy] of D8) addRoad(hub.x + dx, hub.y + dy);

  // 2) Core access — one D4 face per structure
  for (const c of coreTiles) {
    let hasFace = false;
    for (const [dx, dy] of D4) {
      if (roadSet.has(key(c.x + dx, c.y + dy))) {
        hasFace = true;
        break;
      }
    }
    if (hasFace) continue;
    for (const [dx, dy] of D4) {
      if (addRoad(c.x + dx, c.y + dy)) break;
    }
  }

  // 3) Economy paths — near-base only (haul outside seal is not "base plan" road)
  const ECO_ROAD_R = 10;
  for (const t of [controller, ...sourceContainers]) {
    if (!t) continue;
    for (const p of findPath(terrain, hub, t, blocked)) {
      if (chebyshev(hub, p) > ECO_ROAD_R) continue;
      addRoad(p.x, p.y);
    }
  }

  // 4) Radial spokes — 4 cardinal + 4 diagonal arteries (not solid rings)
  const MAX_R = EXT_MAX_R;
  walkCardinalSpokes(terrain, hub, MAX_R, (x, y) => {
    const k = key(x, y);
    if (roadSet.has(k)) return true;
    if (x === hub.x && y === hub.y) return true;
    return addRoad(x, y);
  });
  // Diagonal rays (NE/SE/SW/NW): same length, ±1 orth detour around walls.
  // Skip on cramped hubs (openSpace around hub < 150) — 4 diagonals double the
  // interior road footprint and starve extension packing (E4S7 130-tile seal).
  // Cardinal spokes + faces + eco paths still unlock dense pack access.
  let hubSpace = 0;
  for (let dx = -8; dx <= 8; dx++)
    for (let dy = -8; dy <= 8; dy++)
      if (walkable(terrain, hub.x + dx, hub.y + dy)) hubSpace++;
  const DIAG =
    hubSpace < 150
      ? []
      : [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ];
  for (const [sx, sy] of DIAG) {
    let x = hub.x;
    let y = hub.y;
    for (let step = 0; step < MAX_R; step++) {
      const tx = x + sx;
      const ty = y + sy;
      // prefer straight diagonal; detour one cardinal step if blocked
      let placed = false;
      const tryOrder = [
        [tx, ty],
        [tx, y],
        [x, ty],
      ];
      for (const [nx, ny] of tryOrder) {
        if (nx === hub.x && ny === hub.y) {
          placed = true;
          x = nx;
          y = ny;
          break;
        }
        const k = key(nx, ny);
        if (roadSet.has(k)) {
          placed = true;
          x = nx;
          y = ny;
          break;
        }
        if (addRoad(nx, ny)) {
          placed = true;
          x = nx;
          y = ny;
          break;
        }
      }
      if (!placed) break;
    }
  }

  // 5) Dense extension pack along the skeleton
  const structures = { road: roads, extension: [] };
  topUpExtensions(terrain, hub, blocked, structures, maxExt, MAX_R);
  return { roads: structures.road, extensions: structures.extension };
}

/**
 * Adaptive refill radius: large min-cut shells put walls at dHub 15–24; a hard
 * cap of 10 leaves most of the shell uncoverable (E8S4: max ~14% at refill 10).
 * Soft target remains ~10; stretch up to 14 when the median wall is far.
 */
function computeTowerRefill(hub, perimeter, base = 10) {
  if (!perimeter?.length) return base;
  const dists = perimeter.map((p) => chebyshev(hub, p)).sort((a, b) => a - b);
  const med = dists[(dists.length - 1) >> 1];
  // tower range 5 → need refill ≥ med-5 to reach median wall; cap 14
  return Math.max(base, Math.min(14, med - 5));
}

/**
 * Tiles reachable from hub without crossing perimeter (inside the seal ring).
 * Eco dilate is often much smaller than the min-cut, so towers need this to
 * sit near far walls without being placed outside the enclosure.
 *
 * Must use D8 (same as min-cut graph + creep movement). D4 left terrain-pocket
 * tiles near remote shell fingers marked exterior even when path-connected
 * diagonally — towers then could not cover those walls (E8S5 SE, E2S9 east).
 */
function interiorFromPerimeter(terrain, hub, perimeter) {
  const wallSet = new Set(perimeter.map((p) => key(p.x, p.y)));
  const inside = Array.from({ length: 50 }, () => Array(50).fill(false));
  if (wallSet.has(key(hub.x, hub.y))) return inside;
  const q = [{ x: hub.x, y: hub.y }];
  inside[hub.x][hub.y] = true;
  while (q.length) {
    const { x, y } = q.pop();
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (inside[nx][ny] || wallSet.has(key(nx, ny))) continue;
      // block terrain walls only; swamp/plain OK
      const t = terrain[ny * 50 + nx];
      if (t === "1" || t === 1) continue;
      inside[nx][ny] = true;
      q.push({ x: nx, y: ny });
    }
  }
  return inside;
}

/**
 * Cardinal (D4) seal chamber — matches harsh critic / full-eco edge-flood.
 * D8 interior admits diagonal squeezes past wall fingers (E8S3 north pack
 * ext@28,3/29,3: pl4 OK via terrain detour but cut off by D4 wall flood →
 * extOut). Extensions post-seal pack only inside this mask; towers keep D8.
 */
function interiorFromPerimeterD4(terrain, hub, perimeter) {
  const wallSet = new Set(perimeter.map((p) => key(p.x, p.y)));
  const inside = Array.from({ length: 50 }, () => Array(50).fill(false));
  if (wallSet.has(key(hub.x, hub.y))) return inside;
  const q = [{ x: hub.x, y: hub.y }];
  inside[hub.x][hub.y] = true;
  while (q.length) {
    const { x, y } = q.pop();
    for (const [dx, dy] of D4) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (inside[nx][ny] || wallSet.has(key(nx, ny))) continue;
      const t = terrain[ny * 50 + nx];
      if (t === "1" || t === 1) continue;
      inside[nx][ny] = true;
      q.push({ x: nx, y: ny });
    }
  }
  return inside;
}

/**
 * Drop extensions outside a chamber mask; free their blocked keys. Returns removed count.
 * Perimeter tiles (walls/ramps) are not culled — harsh critic treats them as in-seal
 * (`!inside && !barr`), and cramped north edges (E4S7 y=2) pack on the cut itself.
 */
function cullExtensionsOutsideMask(structures, blocked, mask, perimeter = null) {
  if (!structures.extension?.length || !mask) return 0;
  const onPerim = perimeter
    ? new Set(perimeter.map((p) => key(p.x, p.y)))
    : null;
  const kept = [];
  let removed = 0;
  for (const e of structures.extension) {
    if (mask[e.x]?.[e.y] || (onPerim && onPerim.has(key(e.x, e.y)))) kept.push(e);
    else {
      blocked.delete(key(e.x, e.y));
      removed++;
    }
  }
  structures.extension = kept;
  return removed;
}

/**
 * Interior tiles far enough from the wall that RA3 outside cannot hit them.
 * (wallDist ≥ RA_SAFE_DEPTH; Chebyshev — diagonal same as orthogonal.)
 */
function depthSafeMask(interiorMask, perimeter, minDepth = RA_SAFE_DEPTH) {
  const mask = Array.from({ length: 50 }, () => Array(50).fill(false));
  if (!interiorMask || !perimeter?.length) return mask;
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (!interiorMask[x]?.[y]) continue;
      let m = 99;
      for (const p of perimeter) {
        m = Math.min(m, chebyshev({ x, y }, p));
        if (m < minDepth) break;
      }
      if (m >= minDepth) mask[x][y] = true;
    }
  }
  return mask;
}

/** Drop any extension with wallDist < minDepth (or on a wall tile). */
function cullShallowExtensions(structures, blocked, perimeter, minDepth = RA_SAFE_DEPTH) {
  if (!structures.extension?.length || !perimeter?.length) return 0;
  const kept = [];
  let removed = 0;
  for (const e of structures.extension) {
    let m = 99;
    for (const p of perimeter) m = Math.min(m, chebyshev(e, p));
    if (m >= minDepth) kept.push(e);
    else {
      blocked.delete(key(e.x, e.y));
      removed++;
    }
  }
  structures.extension = kept;
  return removed;
}

/**
 * Cardinal (D4) path distance field from hub through walkable terrain only.
 * D8 pathDistField treats diagonal squeezes as short; assess full-eco edge-flood
 * is D4 — E8S5 SE finger is cheb≈5 but d4≈30 (around the wall mass). Used to
 * keep extensions out of those pockets without a post-seal chamber cull that
 * also strips legitimate edge pack on cramped seals (E4S7 y=2 row).
 */
function pathDistFieldD4(terrain, hub) {
  const dist = new Int16Array(2500);
  dist.fill(999);
  const sx = hub.x,
    sy = hub.y;
  if (sx < 0 || sy < 0 || sx > 49 || sy > 49) return dist;
  dist[sx + sy * 50] = 0;
  const q = [[sx, sy]];
  let qi = 0;
  while (qi < q.length) {
    const [x, y] = q[qi++];
    const d = dist[x + y * 50];
    for (const [dx, dy] of D4) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny)) continue;
      const i = nx + ny * 50;
      if (dist[i] <= d + 1) continue;
      dist[i] = d + 1;
      q.push([nx, ny]);
    }
  }
  return dist;
}

/**
 * Place towers for shell coverage, not stacked on hub.
 * Balance: max perimeter tiles in optimal range (≤5), but stay refillable from storage (≤ maxRefill).
 *
 * Cramped seals pack 60 exts before towers run — free tiles near the wall are rare.
 * Progressive passes: free tiles → steal extensions (re-topped later) → looser refill/sep.
 *
 * Scoring: (1) new wall cover, (2) angular spread (no one-side clump),
 * (3) minPerim sweet-spot ~3 (cover ≤5, dilate-3 won't punch the seal outward).
 * Optional interiorMask keeps towers inside the eco dilate (not outside the cut).
 */
function placeTowersForShell(
  terrain,
  hub,
  blocked,
  perimeter,
  n = 6,
  maxRefill = 10,
  roadSet = null,
  structures = null,
  interiorMask = null,
) {
  if (!perimeter.length) {
    // fallback near hub if no shell yet — diagonals only (cardinals reserved for corridors)
    return placeNear(
      terrain,
      hub,
      blocked,
      [
        { x: 2, y: 2 },
        { x: -2, y: 2 },
        { x: 2, y: -2 },
        { x: -2, y: -2 },
        { x: 3, y: 1 },
        { x: -3, y: 1 },
      ],
      n,
    );
  }

  const towers = [];
  const covered = new Set(); // perimeter keys covered optimally by existing towers
  const roads = roadSet || new Set();
  const extSet = new Set((structures?.extension || []).map((e) => key(e.x, e.y)));
  // Gate D: never sit on a lab's D4 face (towers were landlocking labs on E5S1/E7S1/E8S2)
  const labFaceSet = new Set();
  for (const l of structures?.lab || []) {
    for (const [dx, dy] of D4) labFaceSet.add(key(l.x + dx, l.y + dy));
  }
  // D4 hub path: interiorMask is D8 flood and admits diagonal wall-finger pockets
  // (E8S5 tower@31,33 pl8=5 pl4=29 → coreOut; tower@30,20 pl4=999 wall-cage).
  const pathD4 = pathDistFieldD4(terrain, hub);
  // Residual shell gaps (walls still bare with the FULL tower set). Gap-fill sets this
  // so findBest prefers covering true gaps over re-homing onto a removed tower's
  // exclusive walls (E1S2 NW finger: re-pick 10,34 nc=4 left gap 2 → tCover 97%).
  let residualGap = null;

  function ang(x, y) {
    return Math.atan2(y - hub.y, x - hub.x);
  }
  function angDist(a, b) {
    let d = Math.abs(a - b);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  }

  function optimalCover(tx, ty) {
    const hits = [];
    for (const p of perimeter) {
      if (chebyshev({ x: tx, y: ty }, p) <= 5) hits.push(key(p.x, p.y));
    }
    return hits;
  }

  function stealExtension(x, y) {
    const k = key(x, y);
    if (!extSet.has(k) || !structures) return;
    const ei = structures.extension.findIndex((e) => e.x === x && e.y === y);
    if (ei >= 0) structures.extension.splice(ei, 1);
    extSet.delete(k);
    // leave blocked; tower claims the tile next
  }

  function stealRoad(x, y) {
    const k = key(x, y);
    if (!roads.has(k)) return;
    roads.delete(k);
    if (structures?.road) {
      const ri = structures.road.findIndex((r) => r.x === x && r.y === y);
      if (ri >= 0) structures.road.splice(ri, 1);
    }
  }

  /** Find best site under one constraint pass. */
  function findBest(pass) {
    let best = null;
    let bestScore = -Infinity;
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) {
        const k = key(x, y);
        if (!buildable(terrain, x, y)) continue;
        if (labFaceSet.has(k)) continue;
        const isRoad = roads.has(k);
        // Roads normally reserved for traffic; looser passes may claim one for cover
        if (isRoad && !pass.allowRoad) continue;
        // stay inside eco dilate when provided (avoids exterior wall-huggers)
        if (interiorMask && !interiorMask[x]?.[y]) continue;
        const isExt = extSet.has(k);
        if (blocked.has(k) && !(pass.allowExt && isExt)) continue;

        const dHub = chebyshev(hub, { x, y });
        if (dHub < 2 || dHub > pass.maxRefill) continue;
        // Hauler road face possible: all-wall D4 cage → twNoRoad forever (E8S5 30,20).
        // Core-sealed cages also fail ensureTowerD4Roads (E5S3 tower@14,7: links on
        // two faces + walls on the rest → freeFaces>0 by terrain but no pave target).
        // Count only faces we can pave or steal (not core / already-placed towers).
        let freeFaces = 0;
        for (const [dx, dy] of D4) {
          const fx = x + dx,
            fy = y + dy;
          if (!buildable(terrain, fx, fy)) continue;
          if (structures && isCoreStructureAt(structures, fx, fy)) continue;
          if (towers.some((t) => t.x === fx && t.y === fy)) continue;
          freeFaces++;
        }
        if (freeFaces === 0) continue;
        // Stay in D4-reachable hub chamber (harsh coreOut / full-eco D4 flood)
        const pl4 = pathD4[x + y * 50];
        if (pl4 >= 900 || pl4 > dHub + 12) continue;

        let minPerim = 99;
        for (const p of perimeter) {
          minPerim = Math.min(minPerim, chebyshev({ x, y }, p));
        }
        // RA3-safe: wall dist ≥3 so hostile OUTSIDE (wall+1) is ≥4 from tower.
        // Cover still needs ≤5 to a perimeter tile (maxMinPerim).
        if (minPerim < 3 || minPerim > pass.maxMinPerim) continue;

        const hits = optimalCover(x, y);
        if (pass.requireCover && hits.length === 0) continue;
        let newCover = 0;
        let residualHits = 0;
        for (const h of hits) {
          if (!covered.has(h)) {
            newCover++;
            if (residualGap && residualGap.has(h)) residualHits++;
          }
        }

        // Cardinal axes reserved for hub→shell corridors (gate C). Exception: the only
        // interior tiles that can cover a choke strip may sit on an axis (E4S7: (2,12)
        // is on hub.y and is the sole site covering upper left walls). Allow axis when
        // site adds NEW shell cover, or on last-resort fill (requireCover false).
        const onAxis = x === hub.x || y === hub.y;
        if (onAxis && newCover <= 0 && pass.requireCover) continue;

        let minT = 99;
        for (const tw of towers) minT = Math.min(minT, chebyshev(tw, { x, y }));
        if (towers.length && minT < pass.minSep) continue;

        // Angular spread: push towers into largest gap around hub (fixes one-side clumps).
        // When no NEW cover is available, weight angle harder so late towers do not stack
        // on the same face (E1S4 east clump). Once most of the shell is already covered,
        // also lean harder on angle so remaining towers fan out instead of stacking the
        // last cover face (E7S8/E1S2 residual clumps at tCover 100%).
        let minAng = Math.PI;
        const a = ang(x, y);
        for (const tw of towers) minAng = Math.min(minAng, angDist(a, ang(tw.x, tw.y)));
        const coverFrac = covered.size / Math.max(1, perimeter.length);
        let angW = 5;
        if (towers.length) {
          if (newCover === 0) angW = 14;
          else if (coverFrac >= 0.85) angW = 9;
          else if (coverFrac >= 0.6) angW = 7;
        }
        const angBonus = towers.length ? minAng * angW : 0;

        // sweet-spot 3–4: deep enough for RA3, still ≤5 cover range
        const perimSweet = 4 - Math.abs(minPerim - 3.5);

        // Pull toward still-uncovered wall tiles (multi-cluster shells: left strip vs top)
        let uncPull = 0;
        let uncHits = 0;
        if (covered.size < perimeter.length) {
          let minUnc = 99;
          for (const p of perimeter) {
            const pk = key(p.x, p.y);
            if (covered.has(pk)) continue;
            const d = chebyshev({ x, y }, p);
            minUnc = Math.min(minUnc, d);
            if (d <= 5) uncHits++;
          }
          // Stronger pull for multi-cluster shells (E4S7 left strip vs north wall)
          uncPull = Math.max(0, 7 - minUnc) * 2.4 + uncHits * 1.5;
        }

        // Prefer NEW shell cover hard; angular spread; outward when it buys cover
        // Soft penalty on refill stretch so looser passes only win when they buy cover.
        // Stretch vs SOFT_REFILL=10 (goal), not adaptive pass max — adaptive may be
        // 12–14 for cover, but equal-cover sites should still prefer dHub≤10
        // (E8S3/E9S2/E1S6 were landing 11–12).
        // Prefer existing D4 road face (hauler access) — still weak vs new cover
        let hasRoadFace = false;
        for (const [dx, dy] of D4) {
          if (roads.has(key(x + dx, y + dy))) {
            hasRoadFace = true;
            break;
          }
        }
        const SOFT_REFILL = 10;
        const refillStretch = Math.max(0, dHub - SOFT_REFILL);
        // Mild outward bias only while inside soft refill; beyond that stretch tax rules
        const outward = dHub <= SOFT_REFILL ? dHub * 0.12 : SOFT_REFILL * 0.12;
        // residualHits*40: one true-gap wall outranks ~2.8 exclusive re-homes so gap-fill
        // relocates onto residual fingers instead of bouncing back onto old exclusive.
        const score =
          newCover * 14 +
          residualHits * 40 +
          hits.length * 0.25 +
          outward +
          perimSweet * 2.2 +
          Math.min(minT, 10) * 0.9 +
          angBonus +
          uncPull +
          (hasRoadFace ? 1.5 : 0) -
          (isExt ? 0.4 : 0) -
          (isRoad ? 0.6 : 0) -
          (onAxis ? 1.2 : 0) -
          refillStretch * 2.8;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y, hits, isExt, isRoad, newCover, residualHits, score: bestScore };
        }
      }
    }
    return best;
  }

  // Strict → steal exts → looser refill/separation (cramped / large seals)
  // Prefer minPerim ≤3 first (sweet spot), then relax to 5
  // Extra high-refill + road-claim passes: terrain-separated wall clusters (E4S7 left
  // strip) need dHub ~12 and the only interior cover tile is often a shell road.
  // Early tight passes always "succeed" with newCover=0 on the easy side, so rank
  // across ALL passes by newCover first.
  const passes = [
    { maxRefill, minSep: 4, allowExt: false, allowRoad: false, maxMinPerim: 3, requireCover: true },
    { maxRefill, minSep: 3, allowExt: false, allowRoad: false, maxMinPerim: 5, requireCover: true },
    { maxRefill, minSep: 3, allowExt: true, allowRoad: false, maxMinPerim: 3, requireCover: true },
    { maxRefill, minSep: 3, allowExt: true, allowRoad: false, maxMinPerim: 5, requireCover: true },
    { maxRefill: Math.min(15, maxRefill + 2), minSep: 2, allowExt: true, allowRoad: false, maxMinPerim: 5, requireCover: true },
    { maxRefill: Math.min(15, maxRefill + 4), minSep: 2, allowExt: true, allowRoad: true, maxMinPerim: 5, requireCover: true },
    // last resort: still want 6 towers for RCL8 even if cover saturated
    { maxRefill: Math.min(15, maxRefill + 4), minSep: 2, allowExt: true, allowRoad: true, maxMinPerim: 5, requireCover: false },
  ];

  function pickBestSite() {
    let best = null;
    // Evaluate every pass; prefer any new wall cover over a zero-cover site from a
    // tighter pass (fixes one-side clumps when the other cluster needs stretch refill).
    // When residualGap is set (gap-fill repair), prefer residualHits so we do not
    // re-home onto a removed tower's exclusive walls over true bare fingers.
    for (const pass of passes) {
      const cand = findBest(pass);
      if (!cand) continue;
      const rh = cand.residualHits || 0;
      const brh = best ? best.residualHits || 0 : -1;
      if (
        !best ||
        (residualGap && rh > brh) ||
        (residualGap && rh === brh && cand.newCover > best.newCover) ||
        (residualGap && rh === brh && cand.newCover === best.newCover && cand.score > best.score) ||
        (!residualGap && cand.newCover > best.newCover) ||
        (!residualGap && cand.newCover === best.newCover && cand.score > best.score)
      ) {
        best = cand;
      }
    }
    return best;
  }

  function recomputeCovered() {
    covered.clear();
    for (const tw of towers) {
      for (const h of optimalCover(tw.x, tw.y)) covered.add(h);
    }
  }

  function exclusiveCover(tw) {
    let nEx = 0;
    for (const p of perimeter) {
      if (chebyshev(tw, p) > 5) continue;
      let others = 0;
      for (const o of towers) {
        if (o === tw) continue;
        if (chebyshev(o, p) <= 5) others++;
      }
      if (!others) nEx++;
    }
    return nEx;
  }

  for (let t = 0; t < n; t++) {
    const best = pickBestSite();
    if (!best) break;
    if (best.isExt) stealExtension(best.x, best.y);
    if (best.isRoad) stealRoad(best.x, best.y);
    towers.push({ x: best.x, y: best.y });
    blocked.add(key(best.x, best.y));
    for (const h of best.hits) covered.add(h);
  }

  // Gap-fill repair: greedy placement often stacks redundant towers on one shell
  // face while a far cluster stays bare (E8S5 SE, E2S9 far-east strip). Relocate
  // the least-exclusive tower onto remaining uncovered walls when that improves cover.
  // residualGap biases findBest/pickBestSite toward walls bare with the FULL set so
  // we do not bounce back onto the removed tower's exclusive cluster (E1S2).
  for (let rep = 0; rep < n; rep++) {
    recomputeCovered();
    if (covered.size >= perimeter.length) break;
    const uncBefore = perimeter.length - covered.size;
    residualGap = new Set();
    for (const p of perimeter) {
      const pk = key(p.x, p.y);
      if (!covered.has(pk)) residualGap.add(pk);
    }

    // Prefer relocating pure-redundant (exclusive 0) towers first
    let worstIdx = -1;
    let worstEx = Infinity;
    let worstTotal = Infinity;
    for (let i = 0; i < towers.length; i++) {
      const tw = towers[i];
      const ex = exclusiveCover(tw);
      const tot = optimalCover(tw.x, tw.y).length;
      if (ex < worstEx || (ex === worstEx && tot < worstTotal)) {
        worstEx = ex;
        worstTotal = tot;
        worstIdx = i;
      }
    }
    if (worstIdx < 0) {
      residualGap = null;
      break;
    }

    const old = towers[worstIdx];
    // Free old site so findBest can claim a better one (incl. nearby)
    towers.splice(worstIdx, 1);
    blocked.delete(key(old.x, old.y));
    recomputeCovered();

    const cand = pickBestSite();
    // Estimate cover after swap without mutating ext/road yet
    let uncAfterEst = uncBefore;
    if (cand && cand.newCover > 0) {
      const trialCovered = new Set(covered);
      for (const h of cand.hits) trialCovered.add(h);
      uncAfterEst = perimeter.length - trialCovered.size;
    }
    if (!cand || cand.newCover <= 0 || uncAfterEst >= uncBefore) {
      // No improvement site — restore old tower
      towers.push(old);
      blocked.add(key(old.x, old.y));
      recomputeCovered();
      residualGap = null;
      break;
    }

    // Commit relocation (steal only after we know cover improves)
    if (cand.isExt) stealExtension(cand.x, cand.y);
    if (cand.isRoad) stealRoad(cand.x, cand.y);
    towers.push({ x: cand.x, y: cand.y });
    blocked.add(key(cand.x, cand.y));
    recomputeCovered();
  }
  residualGap = null;

  // Second repair: try EVERY tower as a relocation candidate (not only the
  // least-exclusive). Needed when the redundant tower sits far from the gap and
  // the only free gap tiles are blocked by minSep from a nearby mid-cover tower —
  // better to move that mid-cover tower into the gap (E8S5 SE / E2S9 east strip).
  for (let rep = 0; rep < n; rep++) {
    recomputeCovered();
    if (covered.size >= perimeter.length) break;
    const uncBefore = perimeter.length - covered.size;
    residualGap = new Set();
    for (const p of perimeter) {
      const pk = key(p.x, p.y);
      if (!covered.has(pk)) residualGap.add(pk);
    }
    let bestMove = null; // { idx, cand, uncAfter }

    for (let i = 0; i < towers.length; i++) {
      const old = towers[i];
      towers.splice(i, 1);
      blocked.delete(key(old.x, old.y));
      recomputeCovered();

      const cand = pickBestSite();
      if (cand && cand.newCover > 0) {
        const trialCovered = new Set(covered);
        for (const h of cand.hits) trialCovered.add(h);
        const uncAfter = perimeter.length - trialCovered.size;
        // Require strict improvement; prefer larger drop in uncovered walls
        if (
          uncAfter < uncBefore &&
          (!bestMove ||
            uncAfter < bestMove.uncAfter ||
            (uncAfter === bestMove.uncAfter && (cand.residualHits || 0) > (bestMove.cand.residualHits || 0)) ||
            (uncAfter === bestMove.uncAfter &&
              (cand.residualHits || 0) === (bestMove.cand.residualHits || 0) &&
              cand.newCover > bestMove.cand.newCover))
        ) {
          bestMove = { idx: i, old, cand, uncAfter };
        }
      }

      // restore for next trial
      towers.splice(i, 0, old);
      blocked.add(key(old.x, old.y));
      recomputeCovered();
    }

    if (!bestMove) {
      residualGap = null;
      break;
    }
    const { idx, old, cand } = bestMove;
    towers.splice(idx, 1);
    blocked.delete(key(old.x, old.y));
    if (cand.isExt) stealExtension(cand.x, cand.y);
    if (cand.isRoad) stealRoad(cand.x, cand.y);
    towers.push({ x: cand.x, y: cand.y });
    blocked.add(key(cand.x, cand.y));
    recomputeCovered();
  }
  residualGap = null;

  // Soft refill pull-in: after cover repairs, walk far towers (dHub>10) inward
  // when a closer site keeps total shell cover (goal refill ≤10). Does not chase
  // cover gains — only hauler distance. Adaptive maxRefill still allowed for
  // multi-cluster shells that truly need stretch.
  {
    const SOFT_REFILL = 10;
    const softPasses = [
      { maxRefill: SOFT_REFILL, minSep: 2, allowExt: true, allowRoad: true, maxMinPerim: 5, requireCover: false },
      {
        maxRefill: Math.min(15, Math.max(SOFT_REFILL + 1, maxRefill)),
        minSep: 2,
        allowExt: true,
        allowRoad: true,
        maxMinPerim: 5,
        requireCover: false,
      },
    ];
    for (let rep = 0; rep < n * 2; rep++) {
      recomputeCovered();
      const coverBefore = covered.size;
      let farIdx = -1;
      let farD = 0;
      for (let i = 0; i < towers.length; i++) {
        const d = chebyshev(hub, towers[i]);
        if (d > SOFT_REFILL && d > farD) {
          farD = d;
          farIdx = i;
        }
      }
      if (farIdx < 0) break;
      const old = towers[farIdx];
      const oldEx = exclusiveCover(old);
      towers.splice(farIdx, 1);
      blocked.delete(key(old.x, old.y));
      recomputeCovered();

      let bestPull = null;
      for (const pass of softPasses) {
        const cand = findBest(pass);
        if (!cand) continue;
        const dNew = chebyshev(hub, cand);
        if (dNew >= farD) continue;
        // Must not drop total cover
        const trial = new Set(covered);
        for (const h of cand.hits) trial.add(h);
        if (trial.size < coverBefore) continue;
        // Prefer sites that re-cover exclusive walls; allow zero-ex move if cover holds
        if (oldEx > 0) {
          let reEx = 0;
          for (const p of perimeter) {
            if (chebyshev(old, p) > 5) continue;
            let others = 0;
            for (const o of towers) if (chebyshev(o, p) <= 5) others++;
            if (others) continue; // was exclusive to old
            if (chebyshev(cand, p) <= 5) reEx++;
          }
          // Keep most exclusive cover (allow 1 wall loss only if d drops by ≥2)
          if (reEx < oldEx - 1) continue;
          if (reEx < oldEx && farD - dNew < 2) continue;
        }
        if (
          !bestPull ||
          dNew < bestPull.d ||
          (dNew === bestPull.d && cand.hits.length > bestPull.cand.hits.length)
        ) {
          bestPull = { cand, d: dNew };
        }
      }
      if (!bestPull) {
        towers.splice(farIdx, 0, old);
        blocked.add(key(old.x, old.y));
        recomputeCovered();
        break;
      }
      const { cand } = bestPull;
      // RA3 depth: never pull onto a site <3 from a wall
      let pullDepth = 99;
      for (const p of perimeter) pullDepth = Math.min(pullDepth, chebyshev(cand, p));
      if (pullDepth < 3) {
        towers.splice(farIdx, 0, old);
        blocked.add(key(old.x, old.y));
        recomputeCovered();
        break;
      }
      if (cand.isExt) stealExtension(cand.x, cand.y);
      if (cand.isRoad) stealRoad(cand.x, cand.y);
      towers.push({ x: cand.x, y: cand.y });
      blocked.add(key(cand.x, cand.y));
      recomputeCovered();
    }
  }

  // Angular rebalance once shell cover is complete: relocate clumped towers
  // into larger angular gaps without dropping tCover. Greedy cover-first packs
  // late towers onto the last wall face (E7S8/E1S2/E4S7 residual one-side
  // clumps at 100% cover). Skip when cover is still incomplete — cover repairs
  // above own that job.
  //
  // Stretch refill past SOFT_REFILL is required: one-side seals put the open
  // arc's only free sites at dHub 11–14 (E4S7 28,6@14). Old Math.max(SOFT, maxR)
  // left the "loose" pass still at 10 when adaptive refill was already 10.
  // Prefer zero-exclusive, but allow low-ex when every tower owns a wall strip
  // (E1S2) so rebalance is not a no-op. findBest is cover-biased — also scan
  // for pure angular gap sites when greedy pick fails the minA threshold.
  {
    const SOFT_REFILL = 10;
    const STRETCH_REFILL = Math.min(14, Math.max(SOFT_REFILL + 4, maxRefill));
    const angPasses = [
      {
        maxRefill: SOFT_REFILL,
        minSep: 3,
        allowExt: true,
        allowRoad: false,
        maxMinPerim: 5,
        requireCover: false,
      },
      {
        maxRefill: SOFT_REFILL,
        minSep: 2,
        allowExt: true,
        allowRoad: true,
        maxMinPerim: 5,
        requireCover: false,
      },
      {
        maxRefill: STRETCH_REFILL,
        minSep: 2,
        allowExt: true,
        allowRoad: true,
        maxMinPerim: 5,
        requireCover: false,
      },
    ];

    // Exclusive cover of the tower currently being relocated (set each rep).
    // Zero-ex sites accept smaller angular wins (~+5.7°) on thin wall arcs.
    let oldExForAng = 0;

    /** Evaluate a candidate tile for angular move; returns score row or null. */
    function scoreAngCand(x, y, oldMinAng, minSep, maxRef, allowExt, allowRoad) {
      const k = key(x, y);
      if (!buildable(terrain, x, y)) return null;
      if (labFaceSet.has(k)) return null;
      const isRoad = roads.has(k);
      if (isRoad && !allowRoad) return null;
      if (interiorMask && !interiorMask[x]?.[y]) return null;
      const isExt = extSet.has(k);
      if (blocked.has(k) && !(allowExt && isExt)) return null;
      if (towers.some((t) => t.x === x && t.y === y)) return null;
      const dHub = chebyshev(hub, { x, y });
      // Angular moves never hub-stack (tHub anti-pattern); cover placement may use d=2–3
      if (dHub < 4 || dHub > maxRef) return null;
      let freeFaces = 0;
      for (const [dx, dy] of D4) {
        const fx = x + dx,
          fy = y + dy;
        if (!buildable(terrain, fx, fy)) continue;
        if (structures && isCoreStructureAt(structures, fx, fy)) continue;
        if (towers.some((t) => t.x === fx && t.y === fy)) continue;
        freeFaces++;
      }
      if (freeFaces === 0) return null;
      const pl4 = pathD4[x + y * 50];
      // Terrain-only pathD4 detours on cramped seals (E4S7: cheb 10 but pl4 24).
      // Cover placement keeps dHub+12; angular rebalance already requires interiorMask
      // + full cover, so allow a longer terrain walk when already inside the seal.
      const pl4Slack =
        interiorMask && interiorMask[x]?.[y] ? dHub + 18 : dHub + 12;
      if (pl4 >= 900 || pl4 > pl4Slack) return null;
      let minPerim = 99;
      for (const p of perimeter) minPerim = Math.min(minPerim, chebyshev({ x, y }, p));
      if (minPerim < 1 || minPerim > 5) return null;
      let minT = 99;
      for (const tw of towers) minT = Math.min(minT, chebyshev(tw, { x, y }));
      if (towers.length && minT < minSep) return null;
      const hits = optimalCover(x, y);
      const trial = new Set(covered);
      for (const h of hits) trial.add(h);
      if (trial.size < perimeter.length) return null;
      let minA = Math.PI;
      const a = ang(x, y);
      for (const tw of towers) minA = Math.min(minA, angDist(a, ang(tw.x, tw.y)));
      // Need a real angular win. Zero-ex clumps accept ~+5.7°; exclusive keep ~+8.5°.
      const need = oldExForAng <= 0 ? 0.1 : 0.15;
      if (minA < oldMinAng + need) return null;
      // Prefer wide angle, soft refill, more hits
      const refillStretch = Math.max(0, dHub - SOFT_REFILL);
      const rank =
        minA * 20 +
        hits.length * 0.15 -
        refillStretch * 0.4 -
        (isExt ? 0.2 : 0) -
        (isRoad ? 0.3 : 0);
      return {
        cand: { x, y, hits, isExt, isRoad, newCover: 0, score: rank },
        minA,
        d: dHub,
        rank,
      };
    }

    // Towers already tried that had no legal angular move (avoid infinite loop).
    // Zero-ex often cannot move on one-side seals (E4S7 20,5); the paired
    // exclusive tower (24,3) is the one that can reach the open arc end.
    const angTried = new Set();
    for (let rep = 0; rep < n; rep++) {
      recomputeCovered();
      if (covered.size < perimeter.length) break;

      // Clumpiest tower by min angular gap. Exclusive is soft preference only —
      // hard ex caps skipped the only movable member of E4S7's 7° pair (ex=4).
      // New site must restore full cover, so high-ex is safe when a gap site hits
      // the same walls (E1S2 all towers ex≥3).
      let worstIdx = -1;
      let worstMinAng = Infinity;
      let worstEx = Infinity;
      for (let i = 0; i < towers.length; i++) {
        const tw = towers[i];
        if (angTried.has(key(tw.x, tw.y))) continue;
        const ex = exclusiveCover(tw);
        let minA = Math.PI;
        for (let j = 0; j < towers.length; j++) {
          if (i === j) continue;
          minA = Math.min(minA, angDist(ang(tw.x, tw.y), ang(towers[j].x, towers[j].y)));
        }
        // Only relocate truly tight clumps (< ~35°)
        if (minA >= 0.61) continue;
        if (
          minA < worstMinAng - 0.02 ||
          (Math.abs(minA - worstMinAng) < 0.02 && ex < worstEx)
        ) {
          worstMinAng = minA;
          worstEx = ex;
          worstIdx = i;
        }
      }
      if (worstIdx < 0) break;

      const old = towers[worstIdx];
      const oldMinAng = worstMinAng;
      oldExForAng = worstEx;
      const angNeed = oldExForAng <= 0 ? 0.1 : 0.15;
      towers.splice(worstIdx, 1);
      blocked.delete(key(old.x, old.y));
      recomputeCovered();

      let bestMove = null;
      // 1) Greedy cover-scored sites (may still land near walls)
      for (const pass of angPasses) {
        const cand = findBest(pass);
        if (!cand) continue;
        const trial = new Set(covered);
        for (const h of cand.hits) trial.add(h);
        if (trial.size < perimeter.length) continue;
        let minA = Math.PI;
        const a = ang(cand.x, cand.y);
        for (const tw of towers) minA = Math.min(minA, angDist(a, ang(tw.x, tw.y)));
        if (minA < oldMinAng + angNeed) continue;
        const dNew = chebyshev(hub, cand);
        // Angular rebalance: never stack on hub (tHub); cover phase may still use d=2–3
        if (dNew < 4) continue;
        if (
          !bestMove ||
          minA > bestMove.minA + 0.02 ||
          (Math.abs(minA - bestMove.minA) < 0.02 && dNew < bestMove.d) ||
          (Math.abs(minA - bestMove.minA) < 0.02 &&
            dNew === bestMove.d &&
            cand.hits.length > bestMove.cand.hits.length)
        ) {
          bestMove = { cand, minA, d: dNew };
        }
      }
      // 2) Pure angular scan (covers stretch sites findBest under-ranks;
      //    also relaxed pl4 slack inside seal — E4S7 zero-ex wall-arc moves)
      if (!bestMove || bestMove.minA < oldMinAng + 0.35) {
        for (let x = 2; x <= 47; x++) {
          for (let y = 2; y <= 47; y++) {
            const row = scoreAngCand(
              x,
              y,
              oldMinAng,
              2,
              STRETCH_REFILL,
              true,
              true,
            );
            if (!row) continue;
            if (
              !bestMove ||
              row.minA > bestMove.minA + 0.02 ||
              (Math.abs(row.minA - bestMove.minA) < 0.02 && row.d < bestMove.d) ||
              (Math.abs(row.minA - bestMove.minA) < 0.02 &&
                row.d === bestMove.d &&
                row.cand.hits.length > bestMove.cand.hits.length)
            ) {
              bestMove = row;
            }
          }
        }
      }
      if (!bestMove) {
        // Restore and try a different clumped tower next rep (not give up)
        towers.push(old);
        blocked.add(key(old.x, old.y));
        recomputeCovered();
        angTried.add(key(old.x, old.y));
        continue;
      }
      const { cand } = bestMove;
      if (cand.isExt) stealExtension(cand.x, cand.y);
      if (cand.isRoad) stealRoad(cand.x, cand.y);
      towers.push({ x: cand.x, y: cand.y });
      blocked.add(key(cand.x, cand.y));
      recomputeCovered();
      // Geometry changed — previously immovable clump mates may now have a gap site
      angTried.clear();
    }
  }

  // Bulletproof RA3 safety (repairs/rebalance can re-land too close to the wall)
  {
    const safe = [];
    for (const tw of towers) {
      let m = 99;
      for (const p of perimeter) m = Math.min(m, chebyshev(tw, p));
      if (m >= 3) {
        safe.push(tw);
      } else {
        blocked.delete(key(tw.x, tw.y));
      }
    }
    // Refill dropped slots with strict depth
    towers.length = 0;
    for (const tw of safe) {
      towers.push(tw);
      blocked.add(key(tw.x, tw.y));
    }
    recomputeCovered();
    while (towers.length < n) {
      const strictPass = {
        maxRefill: Math.min(15, maxRefill + 4),
        minSep: 2,
        allowExt: true,
        allowRoad: true,
        maxMinPerim: 5,
        requireCover: false,
      };
      const cand = findBest(strictPass);
      if (!cand) break;
      let m = 99;
      for (const p of perimeter) m = Math.min(m, chebyshev(cand, p));
      if (m < 3) break;
      if (cand.isExt) stealExtension(cand.x, cand.y);
      if (cand.isRoad) stealRoad(cand.x, cand.y);
      towers.push({ x: cand.x, y: cand.y });
      blocked.add(key(cand.x, cand.y));
      for (const h of cand.hits) covered.add(h);
    }
  }

  return towers;
}

const CORE_TYPES_ACCESS = [
  "storage",
  "spawn",
  "terminal",
  "lab",
  "link",
  "factory",
  "nuker",
  "observer",
  "tower",
  "container",
];

function isCoreStructureAt(structures, x, y) {
  for (const t of CORE_TYPES_ACCESS) {
    if ((structures[t] || []).some((p) => p.x === x && p.y === y)) return true;
  }
  return false;
}

/**
 * Gate D: every lab needs ≥1 D4 road neighbor.
 * Places one road on a free face if missing (clears extensions). Never overwrites core.
 */
function ensureLabD4Roads(terrain, blocked, structures) {
  if (!structures.road) structures.road = [];
  if (!structures.extension) structures.extension = [];
  const hasRoad = (x, y) => structures.road.some((r) => r.x === x && r.y === y);
  const occupiedNonRoad = (x, y) => {
    for (const t of Object.keys(structures)) {
      if (t === "road") continue;
      if ((structures[t] || []).some((p) => p.x === x && p.y === y)) return true;
    }
    return false;
  };

  for (const lab of structures.lab || []) {
    let ok = false;
    for (const [dx, dy] of D4) {
      if (hasRoad(lab.x + dx, lab.y + dy)) {
        ok = true;
        break;
      }
    }
    if (ok) continue;
    for (const [dx, dy] of D4) {
      const x = lab.x + dx,
        y = lab.y + dy;
      const k = key(x, y);
      if (!buildable(terrain, x, y)) continue;
      if (isCoreStructureAt(structures, x, y)) continue;
      const ei = structures.extension.findIndex((e) => e.x === x && e.y === y);
      if (ei >= 0) {
        structures.extension.splice(ei, 1);
        blocked.delete(k);
      } else if (blocked.has(k)) {
        // Same ghost-block reclaim as ensureExtensionAccess (gate D after connect).
        if (occupiedNonRoad(x, y)) continue;
        blocked.delete(k);
      }
      if (blocked.has(k)) continue;
      structures.road.push({ x, y });
      blocked.add(k);
      break;
    }
  }
}

/**
 * Soft logistics: every tower needs ≥1 D4 road neighbor for hauler refill.
 * Prefer free empty faces toward hub. If every free face is taken by an
 * extension, steal one (same as ensureLabD4Roads) — caller re-tops to 60.
 * Without steal, E9S2/E7S1 leave twNoRoad=1 after dense packing seals faces.
 */
function ensureTowerD4Roads(terrain, blocked, structures, hub = null) {
  if (!structures.road) structures.road = [];
  if (!structures.extension) structures.extension = [];
  const hasRoad = (x, y) => structures.road.some((r) => r.x === x && r.y === y);
  const origin = hub || (structures.storage && structures.storage[0]) || { x: 25, y: 25 };

  for (const tw of structures.tower || []) {
    let ok = false;
    for (const [dx, dy] of D4) {
      if (hasRoad(tw.x + dx, tw.y + dy)) {
        ok = true;
        break;
      }
    }
    if (ok) continue;
    // Pass 1: free empty face (prefer toward hub). Pass 2: steal extension face.
    for (const allowSteal of [false, true]) {
      if (ok) break;
      const faces = D4.map(([dx, dy]) => {
        const x = tw.x + dx,
          y = tw.y + dy;
        const k = key(x, y);
        const isExt = structures.extension.some((e) => e.x === x && e.y === y);
        return {
          x,
          y,
          k,
          isExt,
          towardHub: Math.abs(x - origin.x) + Math.abs(y - origin.y),
        };
      }).sort((a, b) => a.towardHub - b.towardHub || (a.isExt ? 1 : 0) - (b.isExt ? 1 : 0));
      for (const f of faces) {
        const { x, y, k } = f;
        if (!buildable(terrain, x, y)) continue;
        if (isCoreStructureAt(structures, x, y)) continue;
        if (hasRoad(x, y)) {
          ok = true;
          break;
        }
        const ei = structures.extension.findIndex((e) => e.x === x && e.y === y);
        if (ei >= 0) {
          if (!allowSteal) continue;
          structures.extension.splice(ei, 1);
          blocked.delete(k);
        } else if (blocked.has(k)) {
          continue;
        }
        structures.road.push({ x, y });
        ok = true;
        break;
      }
    }
  }
}

/**
 * Gate B: every extension needs ≥1 D4 road neighbor (harsh critic / access%).
 * Towers stealing roads leave 1–2 orphans per room with free faces still open.
 * Pass 1: pave empty faces. Pass 2: convert a neighboring extension → road.
 */
function ensureExtensionAccess(terrain, blocked, structures) {
  if (!structures.road) structures.road = [];
  if (!structures.extension) structures.extension = [];
  const roadSet = new Set(structures.road.map((r) => key(r.x, r.y)));
  const hasD4Road = (x, y) => {
    for (const [dx, dy] of D4) if (roadSet.has(key(x + dx, y + dy))) return true;
    return false;
  };
  /** True if any non-road structure occupies (x,y). */
  const occupiedNonRoad = (x, y) => {
    for (const t of Object.keys(structures)) {
      if (t === "road") continue;
      if ((structures[t] || []).some((p) => p.x === x && p.y === y)) return true;
    }
    return false;
  };
  const tryFace = (x, y, allowStealExt) => {
    const k = key(x, y);
    if (roadSet.has(k)) return true;
    if (!buildable(terrain, x, y)) return false;
    if (isCoreStructureAt(structures, x, y)) return false;
    const ei = structures.extension.findIndex((e) => e.x === x && e.y === y);
    if (ei >= 0) {
      if (!allowStealExt) return false;
      structures.extension.splice(ei, 1);
      blocked.delete(k);
    } else if (blocked.has(k)) {
      // Ghost block: connect/prune dropped a road without clearing blocked, or a
      // reserved empty tile. Reclaim only when nothing else sits here (gate B).
      if (occupiedNonRoad(x, y)) return false;
      blocked.delete(k);
    }
    structures.road.push({ x, y });
    roadSet.add(k);
    blocked.add(k);
    return true;
  };

  for (const allowSteal of [false, true]) {
    // snapshot — converting an ext mutates the list
    const exts = structures.extension.slice();
    for (const e of exts) {
      if (!structures.extension.some((o) => o.x === e.x && o.y === e.y)) continue;
      if (hasD4Road(e.x, e.y)) continue;
      for (const [dx, dy] of D4) {
        if (tryFace(e.x + dx, e.y + dy, allowSteal)) break;
      }
    }
  }
}

/**
 * Acceptable hub→ramp walk length. Longer paths are exterior snakes around a
 * sealed pack (E9S2: free d=11 vs hardBlocked path 78 @ maxD=30) — do not paint
 * or keep those roads (gate F soft / road spam).
 */
function hubRampPathBudget(hub, ramp) {
  const d = chebyshev(hub, ramp);
  return Math.max(d * 2 + 8, d + 14);
}

/**
 * Soft defender access: walk hub → each ramp without stepping on buildings.
 * Late dense packing can seal terrain necks — E7S8 north strip has shell roads on
 * y=2 but y=3 is a solid extension wall, so free perimeter roads are islands.
 * Carve a min-extension path: convert blocking extensions → roads (never core).
 * Roads stay open under later topUps (roadSet reserved). Call again AFTER
 * compact/rescue densify — those steps re-seal free necks (gate C / E4S7 0/7).
 *
 * Also re-carve when the only free path is a long exterior detour (canWalk true
 * but pathLen ≫ chebyshev): pure steal-min 0-1 BFS preferred 0-steal snakes over
 * short interior corridors with a few steals, which left E9S2 at 148 roads.
 */
function ensureRampWalkAccess(terrain, hub, blocked, structures, ramps) {
  if (!ramps?.length) return 0;
  if (!structures.road) structures.road = [];
  if (!structures.extension) structures.extension = [];

  const hardAt = (x, y) => {
    // Match assess canWalk blockers (containers stay walkable like live Screeps)
    for (const t of [
      "spawn",
      "storage",
      "terminal",
      "lab",
      "link",
      "factory",
      "nuker",
      "observer",
      "tower",
    ]) {
      if ((structures[t] || []).some((p) => p.x === x && p.y === y)) return true;
    }
    return false;
  };

  const rebuildExt = () => new Set((structures.extension || []).map((e) => key(e.x, e.y)));
  let extSet = rebuildExt();
  const roadSet = new Set((structures.road || []).map((r) => key(r.x, r.y)));

  /** BFS length hub→to avoiding hard + extensions (∞ if unreachable). */
  const walkPathLen = (to) => {
    const q = [[hub.x, hub.y, 0]];
    const seen = new Set([key(hub.x, hub.y)]);
    let qi = 0;
    while (qi < q.length) {
      const [x, y, d] = q[qi++];
      if (x === to.x && y === to.y) return d;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy,
          k = key(nx, ny);
        if (seen.has(k) || nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        if (!walkable(terrain, nx, ny)) continue;
        if ((hardAt(nx, ny) || extSet.has(k)) && !(nx === to.x && ny === to.y)) continue;
        seen.add(k);
        q.push([nx, ny, d + 1]);
      }
    }
    return 999;
  };

  const canWalk = (to) => walkPathLen(to) < 900;

  /**
   * Weighted path: each step costs 1, stealing an extension costs +4 more.
   * Prefer short interior corridors with a few steals over long free exterior
   * snakes (old 0-1 steal-only BFS picked the snake when free tiles looped around).
   */
  const STEAL_EXTRA = 4;
  const carvePath = (to) => {
    const INF = 1e9;
    const cost = new Int32Array(2500);
    cost.fill(INF);
    const prev = new Int32Array(2500);
    prev.fill(-1);
    const si = hub.x + hub.y * 50;
    cost[si] = 0;
    // Dial-like buckets by cost (max useful cost ~ 50*5)
    const buckets = new Map();
    const push = (c, x, y) => {
      let arr = buckets.get(c);
      if (!arr) {
        arr = [];
        buckets.set(c, arr);
      }
      arr.push([x, y]);
    };
    push(0, hub.x, hub.y);
    let curC = 0;
    const maxC = 50 * (1 + STEAL_EXTRA) + 10;
    while (curC <= maxC) {
      const arr = buckets.get(curC);
      if (!arr || !arr.length) {
        curC++;
        continue;
      }
      const [x, y] = arr.pop();
      const ci = x + y * 50;
      if (curC !== cost[ci]) continue;
      if (x === to.x && y === to.y) break;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        if (!walkable(terrain, nx, ny)) continue;
        const ni = nx + ny * 50;
        const k = key(nx, ny);
        const isGoal = nx === to.x && ny === to.y;
        if (!isGoal && hardAt(nx, ny)) continue;
        const step = 1 + (extSet.has(k) ? STEAL_EXTRA : 0);
        const nd = cost[ci] + step;
        if (nd >= cost[ni]) continue;
        cost[ni] = nd;
        prev[ni] = ci;
        push(nd, nx, ny);
      }
    }
    const gi = to.x + to.y * 50;
    if (cost[gi] >= INF) return [];
    const path = [];
    let cur = gi;
    while (cur >= 0 && cur !== si) {
      path.push({ x: cur % 50, y: (cur / 50) | 0 });
      cur = prev[cur];
    }
    path.reverse();
    return path;
  };

  const clearExtAt = (x, y) => {
    const k = key(x, y);
    if (!extSet.has(k)) return false;
    const ei = structures.extension.findIndex((e) => e.x === x && e.y === y);
    if (ei >= 0) structures.extension.splice(ei, 1);
    extSet.delete(k);
    blocked.delete(k);
    return true;
  };

  // Ramps must not host extensions (opening tiles are walk goals + shell roads).
  let carved = 0;
  for (const ramp of ramps) {
    if (clearExtAt(ramp.x, ramp.y)) carved++;
    if (!roadSet.has(key(ramp.x, ramp.y)) && buildable(terrain, ramp.x, ramp.y) && !hardAt(ramp.x, ramp.y)) {
      structures.road.push({ x: ramp.x, y: ramp.y });
      roadSet.add(key(ramp.x, ramp.y));
    }
  }
  extSet = rebuildExt();

  /** True if tile is a narrow neck (≤3 free D8 walk neighbors) — must stay road. */
  const isNarrowNeck = (x, y) => {
    let freeN = 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny)) continue;
      const k = key(nx, ny);
      if (hardAt(nx, ny) || extSet.has(k)) continue;
      freeN++;
    }
    return freeN <= 3;
  };

  // Multi-pass: carving one neck can open a cheaper free path to others.
  // Also re-carve exterior-snake "successes" so interior short corridors exist.
  for (let pass = 0; pass < 4; pass++) {
    let passCarved = 0;
    for (const ramp of ramps) {
      const budget = hubRampPathBudget(hub, ramp);
      const len = walkPathLen(ramp);
      if (len <= budget) continue;
      const path = carvePath(ramp);
      if (!path.length) continue;
      // If weighted path is still a snake, only paint necks — don't pave the loop.
      if (path.length > budget) continue;
      for (const p of path) {
        const k = key(p.x, p.y);
        if (p.x === hub.x && p.y === hub.y) continue;
        if (hardAt(p.x, p.y)) continue;
        let wasExt = false;
        if (clearExtAt(p.x, p.y)) {
          wasExt = true;
          passCarved++;
          carved++;
        }
        // Road-paint only necks / carved tiles / ramps — not every free tile on a
        // long hub→south path (E8S3 paved +50 roads and starved the 60th ext).
        // Open free tiles stay walkable without paint; later topUp may claim them
        // and a subsequent carve pass re-opens if needed.
        const needRoad =
          wasExt || isNarrowNeck(p.x, p.y) || ramps.some((r) => r.x === p.x && r.y === p.y);
        if (needRoad && !roadSet.has(k) && buildable(terrain, p.x, p.y)) {
          structures.road.push({ x: p.x, y: p.y });
          roadSet.add(k);
        }
      }
      extSet = rebuildExt();
    }
    if (passCarved === 0) break;
  }
  return carved;
}

/**
 * Gate F soft: drop redundant interior roads after layout is stable.
 * Keeps: ramp openings, hub ring, one free-path approach per ramp, sole D4
 * faces for extensions (gate B) / labs (gate D) / towers.
 * Trial-remove only checks clients that used the culled road (any-client 0-face
 * check froze E8S3 at 112 — one diagonal-only structure blocked all culls).
 * Empty tiles stay walkable. Prefer cull fat junctions.
 *
 * Fat corridor note: pickRamps expands seeds to manh-adj perimeter (6–9 openings).
 * Old D4 near-ramp perimeter keep + every cheb≤1 path tile froze 2×2/3×3 road
 * pads at each cluster (E5S7/E9S2/E1S2 fat 5–7). Ramp tiles alone + one approach
 * per ramp still give hub→opening access; sole-face + every-other wall roads cover
 * the rest.
 */
function pruneRedundantRoads(terrain, hub, blocked, structures, perimeter, ramps) {
  if (!structures.road?.length) return 0;
  const roadSet = new Set(structures.road.map((r) => key(r.x, r.y)));
  const keep = new Set();

  // Shell: ramp openings only (not D4 halo of every ramp). Halo keep turned
  // expanded ramp clusters into frozen fat road blocks on the wall + approach.
  for (const p of ramps || []) keep.add(key(p.x, p.y));

  // Hub ring (storage faces) — logistics always useful, tiny set
  for (const [dx, dy] of D8) keep.add(key(hub.x + dx, hub.y + dy));

  // One free-path approach road per ramp (last non-ramp step), not every cheb≤1
  // path tile. Multi-ramp clusters were keeping a whole approach pad (E5S7
  // 29–31,29–30). Exterior snakes (E9S2 pathLen 78) stay droppable via budget.
  const hardBlocked = new Set();
  for (const t of [
    "spawn",
    "storage",
    "terminal",
    "lab",
    "link",
    "factory",
    "nuker",
    "observer",
    "tower",
    "extension",
  ]) {
    for (const p of structures[t] || []) hardBlocked.add(key(p.x, p.y));
  }
  for (const ramp of ramps || []) {
    const path = findPath(terrain, hub, ramp, hardBlocked);
    const budget = hubRampPathBudget(hub, ramp);
    // Only seed-keep when free path is short (not exterior snake). One approach
    // tile: nearest road on path with cheb≤1 to the ramp (not every cheb≤1).
    if (path.length && path.length <= budget) {
      for (let i = path.length - 1; i >= 0; i--) {
        const p = path[i];
        if (p.x === ramp.x && p.y === ramp.y) continue;
        if (chebyshev(p, ramp) > 1) continue;
        const k = key(p.x, p.y);
        if (roadSet.has(k)) {
          keep.add(k);
          break;
        }
      }
    }
    if (roadSet.has(key(ramp.x, ramp.y))) keep.add(key(ramp.x, ramp.y));
  }

  /** Structures that need ≥1 D4 road face */
  const faceClients = [];
  for (const t of ["extension", "lab", "tower", "spawn", "terminal", "storage", "link", "factory", "nuker"]) {
    for (const p of structures[t] || []) faceClients.push(p);
  }

  const soleFaceOrMulti = () => {
    // Mark roads that are the only D4 face of some client
    for (const c of faceClients) {
      const faces = [];
      for (const [dx, dy] of D4) {
        const k = key(c.x + dx, c.y + dy);
        if (roadSet.has(k)) faces.push(k);
      }
      if (faces.length === 1) keep.add(faces[0]);
      // If zero faces (shouldn't happen post-ensure), nothing to keep
    }
  };
  soleFaceOrMulti();

  // Greedy cull: fat roads first (high D4 road-degree, then 2×2 corner), not kept
  const degree = (x, y) => {
    let n = 0;
    for (const [dx, dy] of D4) if (roadSet.has(key(x + dx, y + dy))) n++;
    return n;
  };
  const is2x2 = (x, y) =>
    roadSet.has(key(x + 1, y)) &&
    roadSet.has(key(x, y + 1)) &&
    roadSet.has(key(x + 1, y + 1));

  let removed = 0;
  // Multiple passes — removing one road can free neighbors from sole-face duty
  for (let pass = 0; pass < 6; pass++) {
    soleFaceOrMulti();
    const cands = structures.road
      .map((r, i) => ({
        r,
        i,
        k: key(r.x, r.y),
        deg: degree(r.x, r.y),
        fat2: is2x2(r.x, r.y) ? 1 : 0,
        d: chebyshev(hub, r),
      }))
      .filter((c) => !keep.has(c.k) && roadSet.has(c.k))
      // Prefer fat junctions; outer rings before near-hub spokes
      .sort((a, b) => b.deg - a.deg || b.fat2 - a.fat2 || b.d - a.d);

    let passRemoved = 0;
    for (const c of cands) {
      if (keep.has(c.k) || !roadSet.has(c.k)) continue;
      // Trial remove: would any client that used THIS road lose its last D4 face?
      // Old check failed if ANY client already had 0 faces (observer-less nuker /
      // diagonal-only link on E8S3) → every cand permanently kept, removed=0 @112.
      roadSet.delete(c.k);
      let ok = true;
      for (const cl of faceClients) {
        let used = false;
        for (const [dx, dy] of D4) {
          if (cl.x + dx === c.r.x && cl.y + dy === c.r.y) {
            used = true;
            break;
          }
        }
        if (!used) continue;
        let faces = 0;
        for (const [dx, dy] of D4) {
          if (roadSet.has(key(cl.x + dx, cl.y + dy))) {
            faces++;
            break;
          }
        }
        if (faces === 0) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        roadSet.add(c.k);
        keep.add(c.k); // permanent for this plan — sole face of a client
        continue;
      }
      // Must not split the hub-connected road graph (was the main orphan cause)
      {
        const seen = new Set();
        const q = [];
        for (const [dx, dy] of D8) {
          const k0 = key(hub.x + dx, hub.y + dy);
          if (roadSet.has(k0)) {
            seen.add(k0);
            q.push([hub.x + dx, hub.y + dy]);
          }
        }
        let qi = 0;
        while (qi < q.length) {
          const [x, y] = q[qi++];
          for (const [dx, dy] of D8) {
            const nx = x + dx,
              ny = y + dy,
              kk = key(nx, ny);
            if (seen.has(kk) || !roadSet.has(kk)) continue;
            seen.add(kk);
            q.push([nx, ny]);
          }
        }
        // if any remaining road is outside seen, this removal disconnected the net
        let splits = false;
        for (const r of structures.road) {
          const kk = key(r.x, r.y);
          if (kk === c.k) continue;
          if (roadSet.has(kk) && !seen.has(kk)) {
            splits = true;
            break;
          }
        }
        if (splits) {
          roadSet.add(c.k);
          keep.add(c.k);
          continue;
        }
      }
      // Commit removal
      const idx = structures.road.findIndex((r) => r.x === c.r.x && r.y === c.r.y);
      if (idx >= 0) structures.road.splice(idx, 1);
      blocked.delete(c.k);
      removed++;
      passRemoved++;
    }
    if (passRemoved === 0) break;
  }
  return removed;
}

/**
 * One road graph from the hub. Intentional policy (gate F):
 *   - Drop disconnected roads that are NOT a sole D4 structure face (no bridge paint).
 *   - Only pave a hub path for sole-face islands (gates B/D need that road).
 * Old policy paved a path to *every* orphan → 50–100 glue roads of zero intent.
 */
function connectRoadNetwork(terrain, hub, blocked, structures) {
  if (!structures.road?.length) return 0;
  const roadSet = new Set(structures.road.map((r) => key(r.x, r.y)));
  const hard = new Set();
  for (const t of [
    "spawn",
    "storage",
    "terminal",
    "lab",
    "link",
    "factory",
    "nuker",
    "observer",
    "tower",
    "extension",
  ]) {
    for (const p of structures[t] || []) hard.add(key(p.x, p.y));
  }

  /** Keep island roads that are the only D4 face of a structure (gates B/D). */
  const isSoleClientFace = (rx, ry) => {
    for (const t of [
      "extension",
      "lab",
      "tower",
      "spawn",
      "terminal",
      "storage",
      "link",
      "factory",
      "nuker",
    ]) {
      for (const c of structures[t] || []) {
        let used = false;
        let faces = 0;
        for (const [dx, dy] of D4) {
          const fx = c.x + dx,
            fy = c.y + dy;
          if (!roadSet.has(key(fx, fy))) continue;
          faces++;
          if (fx === rx && fy === ry) used = true;
        }
        if (used && faces === 1) return true;
      }
    }
    return false;
  };

  /** Remove a road tile; always clear blocked so ensure* can re-pave later. */
  const dropRoadAt = (rx, ry) => {
    const k = key(rx, ry);
    if (isSoleClientFace(rx, ry)) return false;
    const idx = structures.road.findIndex((r) => r.x === rx && r.y === ry);
    if (idx >= 0) structures.road.splice(idx, 1);
    roadSet.delete(k);
    blocked.delete(k);
    return true;
  };

  function reachableFromHub() {
    const seen = new Set();
    const q = [];
    for (const [dx, dy] of D8) {
      const k = key(hub.x + dx, hub.y + dy);
      if (roadSet.has(k)) {
        seen.add(k);
        q.push({ x: hub.x + dx, y: hub.y + dy });
      }
    }
    if (roadSet.has(key(hub.x, hub.y))) {
      seen.add(key(hub.x, hub.y));
      q.push({ x: hub.x, y: hub.y });
    }
    let qi = 0;
    while (qi < q.length) {
      const { x, y } = q[qi++];
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        const k = key(nx, ny);
        if (seen.has(k) || !roadSet.has(k)) continue;
        seen.add(k);
        q.push({ x: nx, y: ny });
      }
    }
    return seen;
  }

  let added = 0;
  const keepIslands = new Set();

  // Pass 0: drop all non-sole orphans immediately (no bridge spam).
  {
    const seen = reachableFromHub();
    structures.road = structures.road.filter((r) => {
      const k = key(r.x, r.y);
      if (seen.has(k)) return true;
      if (isSoleClientFace(r.x, r.y)) {
        keepIslands.add(k);
        return true;
      }
      roadSet.delete(k);
      blocked.delete(k);
      return false;
    });
  }

  // Pass 1+: only bridge sole-face islands (must stay reachable for fillers).
  for (let pass = 0; pass < 40; pass++) {
    const seen = reachableFromHub();
    let orphan = null;
    for (const r of structures.road) {
      const k = key(r.x, r.y);
      if (!seen.has(k) && !keepIslands.has(k) && isSoleClientFace(r.x, r.y)) {
        orphan = r;
        break;
      }
      if (!seen.has(k) && !isSoleClientFace(r.x, r.y)) {
        // late non-sole orphan — drop
        dropRoadAt(r.x, r.y);
      }
    }
    if (!orphan) {
      // any remaining unseen sole faces?
      for (const r of structures.road) {
        const k = key(r.x, r.y);
        if (!seen.has(k) && isSoleClientFace(r.x, r.y) && !keepIslands.has(k)) {
          orphan = r;
          break;
        }
      }
    }
    if (!orphan) break;

    const path = findPath(terrain, hub, orphan, hard);
    if (!path.length || path.length > hubRampPathBudget(hub, orphan)) {
      // too far / unreachable — keep as island sole face (gate B local access)
      keepIslands.add(key(orphan.x, orphan.y));
      continue;
    }
    for (const p of path) {
      const k = key(p.x, p.y);
      if (roadSet.has(k)) continue;
      if (hard.has(k)) {
        const ei = (structures.extension || []).findIndex((e) => e.x === p.x && e.y === p.y);
        if (ei >= 0) {
          structures.extension.splice(ei, 1);
          hard.delete(k);
          blocked.delete(k);
        } else continue;
      }
      if (!buildable(terrain, p.x, p.y) && !(p.x === orphan.x && p.y === orphan.y)) continue;
      if (blocked.has(k) && !(p.x === orphan.x && p.y === orphan.y)) continue;
      roadSet.add(k);
      structures.road.push({ x: p.x, y: p.y });
      blocked.add(k);
      added++;
    }
    const seen2 = reachableFromHub();
    if (!seen2.has(key(orphan.x, orphan.y))) {
      keepIslands.add(key(orphan.x, orphan.y));
    }
  }
  // Final: drop leftover non-sole islands
  {
    const seen = reachableFromHub();
    structures.road = structures.road.filter((r) => {
      const k = key(r.x, r.y);
      if (seen.has(k) || keepIslands.has(k) || isSoleClientFace(r.x, r.y)) return true;
      roadSet.delete(k);
      blocked.delete(k);
      return false;
    });
  }
  return added;
}

/**
 * Defender access only — intentional, not wall paint.
 *   - road on each ramp tile
 *   - short hub→ramp path when interior (not exterior snake)
 *   - reassert 4 cardinal spokes to the shell (break sealed ext blobs)
 * Does NOT pave every-other perimeter wall (that alone added 30–80 roads of
 * zero logistics value — builders walk walls under ramparts without a road ring).
 */
function paveShellAccess(terrain, hub, blocked, structures, perimeter, ramps) {
  const roadSet = new Set((structures.road || []).map((r) => key(r.x, r.y)));
  const onPerim = (x, y) => perimeter.some((p) => p.x === x && p.y === y);
  const addRoad = (x, y) => {
    const k = key(x, y);
    if (roadSet.has(k)) return;
    if (x === hub.x && y === hub.y) return;
    // allow paving on perimeter even if "blocked" by wall intent — roads under ramparts OK
    if (!buildable(terrain, x, y) && !onPerim(x, y)) return;
    if (blocked.has(k) && !onPerim(x, y)) {
      return;
    }
    roadSet.add(k);
    structures.road.push({ x, y });
  };

  // Ramp openings only (+ D4 neighbor for stand-off / defender park)
  for (const ramp of ramps || []) {
    addRoad(ramp.x, ramp.y);
    for (const [dx, dy] of D4) {
      const x = ramp.x + dx,
        y = ramp.y + dy;
      if (onPerim(x, y)) addRoad(x, y);
    }
    const path = findPath(terrain, hub, ramp, blocked);
    // Skip exterior snake paint (E9S2 exterior loop). Spokes + carve cover interior.
    if (path.length && path.length <= hubRampPathBudget(hub, ramp)) {
      for (const p of path) addRoad(p.x, p.y);
    }
  }

  // Cardinal corridors hub → perimeter (break through extension blobs)
  walkCardinalSpokes(terrain, hub, 15, (x, y) => {
    const k = key(x, y);
    if (roadSet.has(k)) return onPerim(x, y) ? "stop" : true;
    if (blocked.has(k) && !onPerim(x, y)) {
      const ei = (structures.extension || []).findIndex((e) => e.x === x && e.y === y);
      if (ei >= 0) {
        structures.extension.splice(ei, 1);
        blocked.delete(k);
        addRoad(x, y);
        return onPerim(x, y) ? "stop" : true;
      }
      return false;
    }
    if (!buildable(terrain, x, y) && !onPerim(x, y)) return false;
    addRoad(x, y);
    return onPerim(x, y) ? "stop" : true;
  });
}

function planRoom(roomName, terrain, objects) {
  const sources = objects.filter((o) => o.type === "source").map((s) => ({ x: s.x, y: s.y }));
  const controllerObj = objects.find((o) => o.type === "controller");
  const mineralObj = objects.find((o) => o.type === "mineral");
  if (!controllerObj || !sources.length) return { roomName, error: "no controller/sources" };
  const controller = { x: controllerObj.x, y: controllerObj.y };
  const mineral = mineralObj ? { x: mineralObj.x, y: mineralObj.y } : null;

  const hubSc = findHub(terrain, controller, sources, mineral);
  if (!hubSc) return { roomName, error: "no valid hub" };
  const hub = { x: hubSc.x, y: hubSc.y };
  // Always ≥3 so R3 ranged attackers outside the wall cannot hit eco.
  const protectRange = PROTECT_RANGE;
  // No solid corridor rings — radial spokes + on-demand faces only (gate F intent).
  CORRIDOR_RINGS = [];

  const blocked = new Set([key(hub.x, hub.y)]);
  for (const s of sources) blocked.add(key(s.x, s.y));
  blocked.add(key(controller.x, controller.y));
  if (mineral) blocked.add(key(mineral.x, mineral.y));

  const structures = {};

  // Source containers FIRST (before axis reserve + labs/links). Late placement
  // lost every approach on terrain-pinched sources: E5S7 only free D8 faces were
  // stolen by SW lab strip + E axis roadReserved → 0 containers → sourcesIn=0
  // despite hub sitting next to both sources (pathS=6). Early lock keeps the
  // sole harvest tiles; later core placement respects blocked.
  structures.container = [];
  const sourceContainers = [];
  for (const s of sources) {
    // Prefer free path (only natural blocks) so we don't depend on empty core yet.
    const path = findPath(terrain, hub, s, blocked);
    let cpos = null;
    if (path.length) {
      // Prefer tile before source when path ends on the source tile
      const last = path[path.length - 1];
      if (last.x === s.x && last.y === s.y && path.length >= 2) cpos = path[path.length - 2];
      else if (last.x === s.x && last.y === s.y) {
        // path is only the source — pick best free D8 neighbor toward hub
        let best = null,
          bestD = 999;
        for (const [dx, dy] of D8) {
          const x = s.x + dx,
            y = s.y + dy;
          if (!buildable(terrain, x, y) || blocked.has(key(x, y))) continue;
          const d = pathLen(terrain, hub, { x, y });
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
        cpos = best;
      } else cpos = last;
    } else {
      let best = null,
        bestD = 999;
      for (const [dx, dy] of D8) {
        const x = s.x + dx,
          y = s.y + dy;
        if (!buildable(terrain, x, y) || blocked.has(key(x, y))) continue;
        const d = pathLen(terrain, hub, { x, y });
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
      cpos = best;
    }
    if (cpos && !blocked.has(key(cpos.x, cpos.y))) {
      structures.container.push(cpos);
      sourceContainers.push(cpos);
      blocked.add(key(cpos.x, cpos.y));
    }
  }

  // Reserve full cardinal spokes hub→shell for corridor roads (gate C).
  // Buildings on axes blocked E/W/N/S corridors with links/labs/nuker.
  // Skip tiles already taken by source containers (roads may still pave later).
  // Cramped pads (space<150): shorter reserve — long empty axis blocks pack
  // tiles that could host extensions (E4S7 seal budget).
  const roadReserved = new Set();
  const AXIS_RESERVE_R = hubSc.space < 150 ? 6 : 10;
  for (const [dx, dy] of D4) {
    for (let i = 1; i <= AXIS_RESERVE_R; i++) {
      const x = hub.x + dx * i,
        y = hub.y + dy * i;
      if (!buildable(terrain, x, y)) break;
      const k = key(x, y);
      // Don't paint road-reserve over a locked source container — harvest tile wins.
      if (sourceContainers.some((c) => c.x === x && c.y === y)) continue;
      blocked.add(k);
      roadReserved.add(k);
    }
  }

  // --- Core (compact; diagonal / off-axis only — never on hub cardinals) ---
  structures.storage = [{ x: hub.x, y: hub.y }];
  structures.terminal = placeNear(
    terrain,
    hub,
    blocked,
    [
      { x: 1, y: -1 },
      { x: -1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: 2, y: -1 },
      { x: -2, y: -1 },
      { x: 2, y: 1 },
      { x: -2, y: 1 },
    ],
    1,
    roadReserved,
  );
  structures.spawn = placeNear(
    terrain,
    hub,
    blocked,
    [
      // Diagonals only (cardinals = corridor). placeNear refuses stacked choke
      // seals so three S-row spawns cannot brick hub→shell (E8S3).
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
      { x: 2, y: 1 },
      { x: -2, y: 1 },
      { x: 2, y: -1 },
      { x: -2, y: -1 },
      { x: 3, y: 1 },
      { x: -3, y: 1 },
      { x: 3, y: -1 },
      { x: -3, y: -1 },
      { x: 1, y: 2 },
      { x: -1, y: 2 },
      { x: 1, y: -2 },
      { x: -1, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
      { x: 2, y: -2 },
      { x: -2, y: -2 },
    ],
    3,
    roadReserved,
  );
  // Towers placed AFTER shell (coverage + refill). Placeholder empty for now.
  structures.tower = [];
  // Labs: 2-wide strip (not 3-wide brick). Every lab keeps an exterior D4 face for roads (gate D).
  // Primary SW of hub; SE/NW/NE fallbacks so cramped rooms still get 10 labs.
  // placeLabs skips sites with no free D4 (spawn/terrain landlocks).
  structures.lab = placeLabs(
    terrain,
    hub,
    blocked,
    roadReserved,
    [
      // SW 2×5 strip (face-claim avoids landlock; keep compact for smaller seals)
      { x: -2, y: 2 },
      { x: -3, y: 2 },
      { x: -2, y: 3 },
      { x: -3, y: 3 },
      { x: -2, y: 4 },
      { x: -3, y: 4 },
      { x: -2, y: 5 },
      { x: -3, y: 5 },
      { x: -2, y: 6 },
      { x: -3, y: 6 },
      // SE fallback
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 2, y: 6 },
      { x: 3, y: 6 },
      // NW fallback
      { x: -2, y: -2 },
      { x: -3, y: -2 },
      { x: -2, y: -3 },
      { x: -3, y: -3 },
      { x: -2, y: -4 },
      { x: -3, y: -4 },
      { x: -2, y: -5 },
      { x: -3, y: -5 },
      { x: -2, y: -6 },
      { x: -3, y: -6 },
      // NE fallback
      { x: 2, y: -2 },
      { x: 3, y: -2 },
      { x: 2, y: -3 },
      { x: 3, y: -3 },
      { x: 2, y: -4 },
      { x: 3, y: -4 },
      { x: 2, y: -5 },
      { x: 3, y: -5 },
      { x: 2, y: -6 },
      { x: 3, y: -6 },
      // Wider ring fallbacks
      { x: -4, y: 2 },
      { x: -4, y: 3 },
      { x: -4, y: 4 },
      { x: 4, y: 2 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: -4, y: -2 },
      { x: -4, y: -3 },
      { x: 4, y: -2 },
      { x: 4, y: -3 },
    ],
    10,
  );
  // Lab road faces claimed inside placeLabs (roadReserved) — links cannot steal them
  // Links off cardinal axes (was blocking E/W/N corridors)
  structures.link = placeNear(
    terrain,
    hub,
    blocked,
    [
      { x: -2, y: -1 },
      { x: 2, y: -1 },
      { x: -1, y: -2 },
      { x: 1, y: -2 },
      { x: -2, y: 1 },
      { x: 2, y: 1 },
      { x: -1, y: 2 },
      { x: 1, y: 2 },
      { x: -3, y: -1 },
      { x: 3, y: -1 },
      // extra non-neck fallbacks (E7S8 NE passage kept free)
      { x: -2, y: 2 },
      { x: 2, y: 2 },
      { x: -3, y: 1 },
      { x: 3, y: 1 },
      { x: -1, y: 3 },
      { x: 1, y: 3 },
      // E7S8: hub against S/W terrain — prior offsets all blocked/choke; NE pocket free
      { x: 2, y: -2 },
      { x: 3, y: -2 },
      { x: 2, y: -3 },
      { x: 3, y: -3 },
      { x: 4, y: -1 },
      { x: 4, y: -2 },
      { x: 4, y: -3 },
      { x: 1, y: -3 },
      { x: -1, y: -3 },
      { x: -2, y: -3 },
      { x: -3, y: -2 },
      { x: -3, y: -3 },
      { x: 5, y: -1 },
      { x: 5, y: -2 },
      { x: -4, y: -1 },
      { x: -4, y: 1 },
    ],
    3,
    roadReserved,
    true, // never seal terrain neck (E7S8 ramp reach)
  );
  structures.factory = placeNear(
    terrain,
    hub,
    blocked,
    [
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: -4, y: 2 },
      { x: -3, y: 2 },
      { x: 3, y: 3 },
      // E7S8: SE factory ring is terrain; use NE free pocket (same as link fallbacks)
      { x: 3, y: -2 },
      { x: 4, y: -2 },
      { x: 4, y: -3 },
      { x: 3, y: -3 },
      { x: 2, y: -3 },
      { x: 5, y: -1 },
      { x: 5, y: -2 },
      { x: -4, y: -2 },
      { x: -3, y: -2 },
      { x: -2, y: -3 },
      { x: 2, y: 3 },
      { x: 3, y: -4 },
      { x: 4, y: -4 },
    ],
    1,
    roadReserved,
    true,
  );
  structures.observer = placeNear(
    terrain,
    hub,
    blocked,
    [
      { x: -3, y: -1 },
      { x: -4, y: -1 },
      { x: -1, y: -3 },
      { x: 1, y: -3 },
      { x: 4, y: -2 },
      { x: -4, y: 1 },
      { x: 4, y: 2 },
      { x: -2, y: 3 },
      // E7S8: after NE link/factory pack, need further NE free tiles
      { x: 5, y: -2 },
      { x: 5, y: -3 },
      { x: 3, y: -4 },
      { x: 4, y: -4 },
      { x: -5, y: 2 },
      { x: -3, y: -3 },
    ],
    1,
    roadReserved,
    true,
  );
  structures.nuker = placeNear(
    terrain,
    hub,
    blocked,
    [
      { x: 3, y: -1 },
      { x: 4, y: -1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: -4, y: -2 },
      { x: -3, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      // E7S8 NE pocket (link/factory may take nearer tiles first)
      { x: 5, y: -1 },
      { x: 5, y: -2 },
      { x: 4, y: -3 },
      { x: 3, y: -3 },
      { x: -3, y: -3 },
      { x: 2, y: -4 },
    ],
    1,
    roadReserved,
    true,
  );
  // no powerSpawn
  if (mineral) structures.extractor = [mineral];

  // Source containers already placed early (before axis/labs). Controller container only here.
  // Controller container at range 2 (Atlantis-ish)
  const ctrlNear = [];
  for (let dx = -2; dx <= 2; dx++)
    for (let dy = -2; dy <= 2; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
      const x = controller.x + dx,
        y = controller.y + dy;
      if (buildable(terrain, x, y) && !blocked.has(key(x, y))) ctrlNear.push({ x, y });
    }
  ctrlNear.sort(
    (a, b) =>
      pathLen(terrain, hub, a) - pathLen(terrain, hub, b) ||
      openSpace(terrain, b.x, b.y, 1) - openSpace(terrain, a.x, a.y, 1),
  );
  if (ctrlNear[0]) {
    structures.container.push(ctrlNear[0]);
    blocked.add(key(ctrlNear[0].x, ctrlNear[0].y));
  }

  // Unblock reserved road tiles so roads can actually be placed there
  for (const k of roadReserved) blocked.delete(k);

  // Core tiles that need street access (labs especially)
  const coreTiles = [];
  for (const t of ["storage", "spawn", "terminal", "lab", "link", "factory", "observer", "nuker"]) {
    for (const p of structures[t] || []) coreTiles.push(p);
  }

  // City-grid roads + extensions (corridors, not solid blobs)
  const { roads, extensions } = buildRoadsAndExtensions(
    terrain,
    hub,
    blocked,
    controller,
    sourceContainers,
    MAX_EXTENSIONS,
    coreTiles,
  );
  structures.extension = extensions;
  structures.road = roads;

  // Force lab accessibility: road on free D4 of every lab (gate D)
  ensureLabD4Roads(terrain, blocked, structures);

  // Replace any extensions lost to lab roads; expand r if cramped (gate A / E7S8)
  topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R);

  // --- Protection set: FULL ECO (extensions always in). Towers added after first cut. ---
  const ecoTypesNoTower = [
    "storage",
    "spawn",
    "extension",
    "lab",
    "terminal",
    "factory",
    "nuker",
    "observer",
    "link",
  ];
  function collectProtect(includeTowers, skipSourceKeys = null) {
    const pts = [];
    for (const t of ecoTypesNoTower) {
      for (const p of structures[t] || []) pts.push(p);
    }
    if (includeTowers) for (const p of structures.tower || []) pts.push(p);
    const sourcesProtected = [];
    for (const c of sourceContainers) {
      if (skipSourceKeys && skipSourceKeys.has(key(c.x, c.y))) continue;
      const d = pathLen(terrain, hub, c);
      if (d <= SOURCE_PROTECT_MAX_PATH) {
        pts.push(c);
        sourcesProtected.push({ ...c, path: d });
      }
    }
    return { pts, sourcesProtected };
  }

  /** True if some wall tile has no seal-interior tile within tower optimal range (≤5). */
  function hasUncoverableWalls(walls, interior) {
    for (const w of walls) {
      let ok = false;
      for (let x = Math.max(2, w.x - 5); x <= Math.min(47, w.x + 5) && !ok; x++) {
        for (let y = Math.max(2, w.y - 5); y <= Math.min(47, w.y + 5); y++) {
          if (!interior[x]?.[y]) continue;
          if (chebyshev({ x, y }, w) <= 5) {
            ok = true;
            break;
          }
        }
      }
      if (!ok) return true;
    }
    return false;
  }

  // Seal WITHOUT towers first. Near-wall towers + dilate expand the min-cut and
  // leave towers deep/dead; place towers once against the final shell below.
  let { pts: protectPoints, sourcesProtected } = collectProtect(false);
  let mask = dilateMask(protectPoints, protectRange);
  let perimeterFull = getCutForMask(terrain, mask);
  let rampsFull = pickRamps(perimeterFull, hub, 3);
  let rampFullSet = new Set(rampsFull.map((r) => key(r.x, r.y)));
  let wallsFull = perimeterFull.filter((p) => !rampFullSet.has(key(p.x, p.y)));

  // Defender access: roads on wall + hub→ramps + corridors through extensions
  paveShellAccess(terrain, hub, blocked, structures, perimeterFull, rampsFull);

  // Shell pave can still strip a few exts on non-axis tiles — top up (expand r if needed), re-seal
  topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1);
  ({ pts: protectPoints, sourcesProtected } = collectProtect(false));
  mask = dilateMask(protectPoints, protectRange);
  perimeterFull = getCutForMask(terrain, mask);
  rampsFull = pickRamps(perimeterFull, hub, 3);
  rampFullSet = new Set(rampsFull.map((r) => key(r.x, r.y)));
  wallsFull = perimeterFull.filter((p) => !rampFullSet.has(key(p.x, p.y)));
  // light re-pave (no further ext strip expected on axes; paths may need new ramp roads)
  paveShellAccess(terrain, hub, blocked, structures, perimeterFull, rampsFull);
  topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1);
  // Final lab D4 pass after shell/topUp may have stolen faces
  ensureLabD4Roads(terrain, blocked, structures);
  topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1);

  // FINAL pre-tower seal: late topUps can land past the previous cut (E4S7/E8S6/E9S2
  // extOut). Re-cut so ALL extensions are inside before towers lock the shell.
  // No free-radius expand after this — only interior-masked topUps (full eco).
  ({ pts: protectPoints, sourcesProtected } = collectProtect(false));
  mask = dilateMask(protectPoints, protectRange);
  perimeterFull = getCutForMask(terrain, mask);
  rampsFull = pickRamps(perimeterFull, hub, 3);
  rampFullSet = new Set(rampsFull.map((r) => key(r.x, r.y)));
  wallsFull = perimeterFull.filter((p) => !rampFullSet.has(key(p.x, p.y)));
  paveShellAccess(terrain, hub, blocked, structures, perimeterFull, rampsFull);
  ensureLabD4Roads(terrain, blocked, structures);
  let sealInterior = interiorFromPerimeter(terrain, hub, perimeterFull);
  // D4 chamber for full-eco ext packing (harsh critic). Towers keep D8 interior.
  let sealExtMask = interiorFromPerimeterD4(terrain, hub, perimeterFull);

  // Terrain-separated source protect (pathLen OK, but min-cut paints a remote wall
  // stub outside the hub chamber) leaves walls no interior tower can cover ≤5 —
  // E9S8 west pocket capped towerCover at 87%. Prefer stitching hub→source path
  // into the protect mask so one chamber covers a short path-OK source (E1S2
  // west pocket: srcIn 0→1). Only drop when stitch still leaves uncoverable walls.
  if (sourcesProtected.length && hasUncoverableWalls(wallsFull, sealInterior)) {
    const srcInChamber = (s, interior) => {
      if (interior[s.x]?.[s.y]) return true;
      for (const [dx, dy] of D8) if (interior[s.x + dx]?.[s.y + dy]) return true;
      return false;
    };
    const skipSrc = new Set();
    const stitch = [];
    for (const s of sourcesProtected) {
      if (srcInChamber(s, sealInterior)) continue;
      // Short open path → stitch corridor tiles so min-cut joins hub + source.
      const path = findPath(terrain, hub, s, new Set());
      if (path.length && path.length <= SOURCE_PROTECT_MAX_PATH + 2) {
        for (const p of path) stitch.push(p);
        stitch.push(s);
      } else {
        skipSrc.add(key(s.x, s.y));
      }
    }
    if (stitch.length) {
      ({ pts: protectPoints, sourcesProtected } = collectProtect(false, skipSrc));
      protectPoints = protectPoints.concat(stitch);
      mask = dilateMask(protectPoints, protectRange);
      perimeterFull = getCutForMask(terrain, mask);
      rampsFull = pickRamps(perimeterFull, hub, 3);
      rampFullSet = new Set(rampsFull.map((r) => key(r.x, r.y)));
      wallsFull = perimeterFull.filter((p) => !rampFullSet.has(key(p.x, p.y)));
      sealInterior = interiorFromPerimeter(terrain, hub, perimeterFull);
      // Stitch can still leave a remote uncoverable stub — fall back to drop.
      if (hasUncoverableWalls(wallsFull, sealInterior)) {
        for (const s of sourcesProtected) {
          if (!srcInChamber(s, sealInterior)) skipSrc.add(key(s.x, s.y));
        }
        if (skipSrc.size) {
          ({ pts: protectPoints, sourcesProtected } = collectProtect(false, skipSrc));
          mask = dilateMask(protectPoints, protectRange);
          perimeterFull = getCutForMask(terrain, mask);
          rampsFull = pickRamps(perimeterFull, hub, 3);
          rampFullSet = new Set(rampsFull.map((r) => key(r.x, r.y)));
          wallsFull = perimeterFull.filter((p) => !rampFullSet.has(key(p.x, p.y)));
        }
      }
      paveShellAccess(terrain, hub, blocked, structures, perimeterFull, rampsFull);
      ensureLabD4Roads(terrain, blocked, structures);
      sealInterior = interiorFromPerimeter(terrain, hub, perimeterFull);
      sealExtMask = interiorFromPerimeterD4(terrain, hub, perimeterFull);
    } else if (skipSrc.size) {
      ({ pts: protectPoints, sourcesProtected } = collectProtect(false, skipSrc));
      mask = dilateMask(protectPoints, protectRange);
      perimeterFull = getCutForMask(terrain, mask);
      rampsFull = pickRamps(perimeterFull, hub, 3);
      rampFullSet = new Set(rampsFull.map((r) => key(r.x, r.y)));
      wallsFull = perimeterFull.filter((p) => !rampFullSet.has(key(p.x, p.y)));
      paveShellAccess(terrain, hub, blocked, structures, perimeterFull, rampsFull);
      ensureLabD4Roads(terrain, blocked, structures);
      sealInterior = interiorFromPerimeter(terrain, hub, perimeterFull);
      sealExtMask = interiorFromPerimeterD4(terrain, hub, perimeterFull);
    }
  }

  // RA3 buffer: only pack eco where wallDist ≥ 3 (do NOT fill the RA dead-zone
  // between buildings and wall — that was the "exts in range" bug).
  // Reassign sealInterior so ALL later topUp/compact/rescue use the safe mask.
  {
    const sealChamber = sealInterior;
    sealInterior = depthSafeMask(sealChamber, wallsFull, RA_SAFE_DEPTH);
    sealExtMask = depthSafeMask(
      sealExtMask || sealChamber,
      wallsFull,
      RA_SAFE_DEPTH,
    );
  }
  cullShallowExtensions(structures, blocked, wallsFull, RA_SAFE_DEPTH);
  cullExtensionsOutsideMask(structures, blocked, sealInterior, perimeterFull);

  // Replace any faces lost to final pave — stay inside RA-safe sealed ring.
  topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
  ensureExtensionAccess(terrain, blocked, structures);
  topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);

  // Towers once, against final walls. Stay inside wall-ring flood-fill; adaptive refill
  // for large min-cuts. No re-cut after (would push shell out and kill cover).
  {
    const shellForTowers = wallsFull.length ? wallsFull : perimeterFull;
    const roadSetFinal = new Set((structures.road || []).map((r) => key(r.x, r.y)));
    // Towers: D4 seal chamber (harsh coreOut). D8 interiorMask admitted diagonal
    // wall-finger sites outside the D4 flood (E8S4 tower@46,25; E9S3). Cover still
    // hits shell from D4 sites (suite tCover stayed 100%). Post-tower topUp keeps
    // D8 sealInterior so packing/rescue is unchanged.
    const interior = sealInterior;
    const refill = computeTowerRefill(hub, shellForTowers, 10);
    structures.tower = placeTowersForShell(
      terrain,
      hub,
      blocked,
      shellForTowers,
      6,
      refill,
      roadSetFinal,
      structures,
      sealExtMask || interior,
    );
    // Restore any stolen extensions; shell stays fixed — never place outside seal
    topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, interior);
    ensureLabD4Roads(terrain, blocked, structures);
    // Towers may have stolen roads next to exts — repave faces (gate B), then re-top
    ensureExtensionAccess(terrain, blocked, structures);
    topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, interior);
    ensureLabD4Roads(terrain, blocked, structures);
    ensureExtensionAccess(terrain, blocked, structures);
    // Soft: hauler access to every tower (D4 road face). May steal one ext face — re-top after.
    ensureTowerD4Roads(terrain, blocked, structures, hub);
    ensureExtensionAccess(terrain, blocked, structures);
    topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, interior);
    ensureLabD4Roads(terrain, blocked, structures);
  }

  // Soft: hub→ramp walk after final pack (E7S8 north neck sealed by ext wall).
  // Carve first so roads reserve the corridor; re-top any stolen exts inside seal.
  ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
  topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
  ensureExtensionAccess(terrain, blocked, structures);
  ensureLabD4Roads(terrain, blocked, structures);
  // Second carve if re-top somehow re-isolated a finger (roads on path prevent that)
  ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
  topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
  ensureExtensionAccess(terrain, blocked, structures);

  // Soft densify: relocate iso/low-pack exts into pack holes (E4S7 sparse leftover).
  // After final roads/faces are stable so moves keep D4 access.
  // Road-steal + free-hole moves; freeFlood glue allowed with ramp trial (sp9→↓).
  // Second pass uses tiles freed by the first.
  compactExtensions(terrain, hub, blocked, structures, sealInterior, rampsFull);
  ensureExtensionAccess(terrain, blocked, structures);
  compactExtensions(terrain, hub, blocked, structures, sealInterior, rampsFull);
  ensureExtensionAccess(terrain, blocked, structures);
  topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
  ensureLabD4Roads(terrain, blocked, structures);

  // Cramped seal capacity: solid r=9 can leave freeIn=0 at 58/60 (E4S7). Turn
  // outer-ring roads that abut existing packs into exts, then re-access/compact.
  // Also mid-plan prune + flood-grow: roads hog near-hub tiles while free seal is
  // large (E4S7); grow clumps without near-road, then pave faces.
  if ((structures.extension || []).length < MAX_EXTENSIONS) {
    pruneRedundantRoads(terrain, hub, blocked, structures, perimeterFull, rampsFull);
    ensureExtensionAccess(terrain, blocked, structures);
    floodGrowExtensions(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
    ensureExtensionAccess(terrain, blocked, structures);
    topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
    rescueExtFromOuterRing(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
    rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
    ensureExtensionAccess(terrain, blocked, structures);
    compactExtensions(terrain, hub, blocked, structures, sealInterior, rampsFull);
    ensureExtensionAccess(terrain, blocked, structures);
    topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
    ensureLabD4Roads(terrain, blocked, structures);
    // Flood-grow can seal ramp necks — re-carve then re-grow if still short
    ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
    if ((structures.extension || []).length < MAX_EXTENSIONS) {
      floodGrowExtensions(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
      ensureExtensionAccess(terrain, blocked, structures);
      ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
    }
  }

  // FINAL gate C: densify re-seals hub→ramp necks (E4S7 0/7, E8S3 partial).
  // Carve first so corridors are roads; recover missing exts only via ramp-safe
  // steals (never pack-hole fills that re-block the neck). Last step must leave
  // ramps walkable AND not re-steal after a successful 60 recovery.
  ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
  topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
  ensureExtensionAccess(terrain, blocked, structures);
  ensureLabD4Roads(terrain, blocked, structures);
  if ((structures.extension || []).length < MAX_EXTENSIONS) {
    rescueExtFromOuterRing(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
    topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
    topUpExtensionsIgnoreGhostBlocked(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
    // Prefer road→ext that keeps ramp reach (checked); may re-seal if outer-ring
    // stole a neck road — re-carve then safe-steal again.
    rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
    ensureExtensionAccess(terrain, blocked, structures);
    ensureLabD4Roads(terrain, blocked, structures);
    ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
    if ((structures.extension || []).length < MAX_EXTENSIONS) {
      rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
      ensureExtensionAccess(terrain, blocked, structures);
    }
  }
  // One last carve only if somehow still sealed; then safe-steal without another carve.
  ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
  if ((structures.extension || []).length < MAX_EXTENSIONS) {
    rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
    topUpExtensionsIgnoreGhostBlocked(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
    ensureExtensionAccess(terrain, blocked, structures);
    // Verify ramps still open after free-tile topUp; carve then safe-steal once.
    ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
    if ((structures.extension || []).length < MAX_EXTENSIONS) {
      rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
      ensureExtensionAccess(terrain, blocked, structures);
    }
  }

  // Final tower D4 faces: compact/rescue can re-seal faces after the mid-plan ensure.
  // Steal+re-top is OK now that gate A is recovered; keeps E9S2/E7S1 twNoRoad=0.
  ensureTowerD4Roads(terrain, blocked, structures, hub);
  ensureLabD4Roads(terrain, blocked, structures);
  ensureExtensionAccess(terrain, blocked, structures);
  if ((structures.extension || []).length < MAX_EXTENSIONS) {
    topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
    ensureExtensionAccess(terrain, blocked, structures);
    ensureLabD4Roads(terrain, blocked, structures);
    ensureTowerD4Roads(terrain, blocked, structures, hub);
  }

  // Soft final densify (E4S7/E8S4 residual sparse). Compact with ramp trials, then
  // carve necks, refill with pack4≥1 only, densify again so ramp-carve orphans
  // (E4S7 diagonal-only@r=9) rejoin clumps without re-seeding pack4=0.
  if ((structures.extension || []).length >= MAX_EXTENSIONS) {
    compactExtensions(terrain, hub, blocked, structures, sealInterior, rampsFull);
    ensureExtensionAccess(terrain, blocked, structures);
  }
  // Gate C safety net after densify (and always before rating). Compact used to
  // re-seal E4S7 7/7→0/7 when stale freeFlood skipped the trial; carve then
  // recover any stolen corridor exts with ramp-safe steals only.
  ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
  if ((structures.extension || []).length < MAX_EXTENSIONS) {
    rescueExtFromOuterRing(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
    rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
    topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
    topUpExtensionsIgnoreGhostBlocked(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
    ensureExtensionAccess(terrain, blocked, structures);
    ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
    if ((structures.extension || []).length < MAX_EXTENSIONS) {
      rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
      topUpExtensionsIgnoreGhostBlocked(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
      ensureExtensionAccess(terrain, blocked, structures);
      ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
    }
  }
  // Post-carve densify: ramp necks can orphan a cardinal-sparse ext while staying
  // at 60 (neighbor carved, refill elsewhere). One ramp-aware compact + neck check.
  // Do not strip r=9 ring orphans that sit on necks — that trades gate A for sp0.
  if ((structures.extension || []).length >= MAX_EXTENSIONS) {
    compactExtensions(terrain, hub, blocked, structures, sealInterior, rampsFull);
    ensureExtensionAccess(terrain, blocked, structures);
    ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
    if ((structures.extension || []).length < MAX_EXTENSIONS) {
      rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
      rescueExtFromOuterRing(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
      topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
      ensureExtensionAccess(terrain, blocked, structures);
      ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
    }
  }

  // Final full-eco D4 pass: strip true outs (not on perimeter — E8S3 diagonal
  // finger @28,3/29,3). Keep E4S7 y=2 pack that sits on the cut (harsh barr OK).
  // Refill inside D4 chamber; D8 fallback only if still short of 60.
  {
    const culled = cullExtensionsOutsideMask(
      structures,
      blocked,
      sealExtMask,
      perimeterFull,
    );
    if (culled > 0 || (structures.extension || []).length < MAX_EXTENSIONS) {
      topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealExtMask);
      ensureExtensionAccess(terrain, blocked, structures);
      if ((structures.extension || []).length < MAX_EXTENSIONS) {
        rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealExtMask, rampsFull);
        rescueExtFromOuterRing(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealExtMask);
        topUpExtensionsIgnoreGhostBlocked(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealExtMask);
        ensureExtensionAccess(terrain, blocked, structures);
      }
      if ((structures.extension || []).length < MAX_EXTENSIONS) {
        topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
        rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
        ensureExtensionAccess(terrain, blocked, structures);
      }
      ensureLabD4Roads(terrain, blocked, structures);
      ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
    }
  }

  // Final densify after cull/topUp: residual cardinal-islands (E4S7 sp0=3).
  // Edge-pack holes sit on the cut (perimeter / outside D8 sealInterior), so
  // earlier sealInterior densify cannot claim them. densifyMask = D4 chamber ∪
  // perimeter (same tiles cull keeps). Keep gate C via ramp-trial compact.
  // Also run when short of 60 (E8S3@59 after choke-aware spawns): densifyMask
  // topUp/safe-steal was previously gated on already-having-60 and never fired.
  {
    const densifyMask = sealExtMask.map((col) => col.slice());
    for (const p of perimeterFull) {
      if (densifyMask[p.x]) densifyMask[p.x][p.y] = true;
    }
    if ((structures.extension || []).length >= MAX_EXTENSIONS) {
      compactExtensions(terrain, hub, blocked, structures, densifyMask, rampsFull);
      ensureExtensionAccess(terrain, blocked, structures);
      compactExtensions(terrain, hub, blocked, structures, densifyMask, rampsFull);
      ensureExtensionAccess(terrain, blocked, structures);
      ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
    }
    // Pack/rescue only on RA-safe sealInterior — densifyMask∪perimeter invites
    // shallow wall-edge steals that final cullShallow drops (E4S7 52→43 thrash).
    if ((structures.extension || []).length < MAX_EXTENSIONS) {
      pruneRedundantRoads(terrain, hub, blocked, structures, perimeterFull, rampsFull);
      floodGrowExtensions(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
      rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
      topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
      topUpExtensionsIgnoreGhostBlocked(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
      rescueExtFromOuterRing(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
      ensureExtensionAccess(terrain, blocked, structures);
      ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
      if ((structures.extension || []).length < MAX_EXTENSIONS) {
        floodGrowExtensions(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior);
        rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, sealInterior, rampsFull);
        topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
        ensureExtensionAccess(terrain, blocked, structures);
        ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
      }
    }
    if ((structures.extension || []).length >= MAX_EXTENSIONS) {
      compactExtensions(terrain, hub, blocked, structures, densifyMask, rampsFull);
      ensureExtensionAccess(terrain, blocked, structures);
      ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
      if ((structures.extension || []).length < MAX_EXTENSIONS) {
        rescueExtFromSafeRoads(terrain, hub, blocked, structures, MAX_EXTENSIONS, densifyMask, rampsFull);
        ensureExtensionAccess(terrain, blocked, structures);
        ensureRampWalkAccess(terrain, hub, blocked, structures, rampsFull);
      }
    }
  }

  // Final tower D4 faces after densifyMask compact (can re-seal earlier ensures).
  // Placement now rejects core-sealed cages (E5S3); this re-steals any late seal.
  ensureTowerD4Roads(terrain, blocked, structures, hub);
  ensureExtensionAccess(terrain, blocked, structures);
  if ((structures.extension || []).length < MAX_EXTENSIONS) {
    topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealExtMask);
    ensureExtensionAccess(terrain, blocked, structures);
    ensureTowerD4Roads(terrain, blocked, structures, hub);
  }

  // Gate F soft: strip redundant corridor/ring road paint. Last layout step —
  // no further topUp/compact (would re-demand faces). Preserves sole D4 faces,
  // shell + hub→ramp paths (see pruneRedundantRoads).
  // Final RA3 sweep — densify/rescue must not leave shallow eco
  cullShallowExtensions(structures, blocked, wallsFull, RA_SAFE_DEPTH);
  if ((structures.extension || []).length < MAX_EXTENSIONS) {
    topUpExtensionsFlexible(terrain, hub, blocked, structures, MAX_EXTENSIONS, EXT_MAX_R + 1, sealInterior);
    cullShallowExtensions(structures, blocked, wallsFull, RA_SAFE_DEPTH);
  }

  pruneRedundantRoads(terrain, hub, blocked, structures, perimeterFull, rampsFull);
  // Prune + perimeter paint leave islands — reconnect (or drop) every road to hub
  connectRoadNetwork(terrain, hub, blocked, structures);
  // connect used to drop island sole-face roads (and leave ghost blocked tiles),
  // nuking gate B/D after densify. Re-pave faces on free/ghost tiles; keep labs.
  ensureExtensionAccess(terrain, blocked, structures);
  ensureLabD4Roads(terrain, blocked, structures);
  ensureTowerD4Roads(terrain, blocked, structures, hub);
  // Face paint can create new islands — reconnect without stripping sole faces.
  connectRoadNetwork(terrain, hub, blocked, structures);
  ensureExtensionAccess(terrain, blocked, structures);
  ensureLabD4Roads(terrain, blocked, structures);

  // Edge seal comparison only (not production doctrine)
  function distToEdge(x, y) {
    return Math.min(x, y, 49 - x, 49 - y);
  }
  const perimeterEdge = perimeterFull.filter((p) => distToEdge(p.x, p.y) <= EDGE_SEAL_DIST);
  const rampsEdge = pickRamps(perimeterEdge.length ? perimeterEdge : perimeterFull.slice(0, 4), hub, 2);
  const rampEdgeSet = new Set(rampsEdge.map((r) => key(r.x, r.y)));
  const wallsEdge = perimeterEdge.filter((p) => !rampEdgeSet.has(key(p.x, p.y)));

  const walls = wallsFull;
  const ramps = rampsFull;
  const perimeter = perimeterFull;

  // Tower coverage metric (optimal range ≤5)
  let wallInOpt = 0;
  for (const p of wallsFull) {
    for (const tw of structures.tower || []) {
      if (chebyshev(tw, p) <= 5) {
        wallInOpt++;
        break;
      }
    }
  }
  const towerCoverPct = wallsFull.length
    ? Math.round((100 * wallInOpt) / wallsFull.length)
    : 100;

  // Metrics
  const pathSources = sources.reduce((s, src) => s + pathLen(terrain, hub, src), 0);
  const pathCtrl = pathLen(terrain, hub, controller);
  const extList = structures.extension || [];
  let accessPct = 100;
  {
    let hit = 0;
    const rs = new Set((structures.road || []).map((r) => key(r.x, r.y)));
    for (const e of extList) {
      for (const [dx, dy] of D8) {
        if (rs.has(key(e.x + dx, e.y + dy))) {
          hit++;
          break;
        }
      }
    }
    accessPct = extList.length ? Math.round((100 * hit) / extList.length) : 100;
  }

  let squareCount = 0;
  for (let i = -10; i <= 10; i++)
    for (let o = -10; o <= 10; o++) {
      if (Math.abs(i) !== 10 && Math.abs(o) !== 10) continue;
      if (buildable(terrain, hub.x + i, hub.y + o)) squareCount++;
    }

  function scoreForWalls(wallN) {
    // Soft-capped path pen (score only — placement rpen / softRpen stay on
    // effectivePath*): maze pathC / remote second source no longer zero out
    // good seals (E3S3/E5S1). Score residual is softer than placement so
    // terrain-locked hauls do not dominate overall while hub pick stays.
    // Drop packing-cost term — it embeds pathS/pathC and double-taxed those rooms.
    //
    // Per-source pathS: full tax up to protect+8, residual beyond so a single
    // unprotectable remote second source (E5S1 d≈55) does not burn the full
    // 40-tile soft-cap budget that was meant for dual mid-range hauls.
    // Residual 15% (was 20%): terrain-locked remote second source still soft-dips
    // E5S1 overall; placement rpen stays on effectivePath* (unchanged).
    const SRC_FULL = SOURCE_PROTECT_MAX_PATH + 8; // 20
    const srcDists = sources.map((s) => pathLen(terrain, hub, s));
    const pathSScore = srcDists.reduce(
      (t, d) => t + Math.min(d, SRC_FULL) + Math.max(0, d - SRC_FULL) * 0.15,
      0,
    );
    // Maze pathC: full to 22, residual 8% (was 12%) — E3S3 pathC 47 terrain-locked.
    const scorePathC = (p) => Math.min(p, 22) + Math.max(0, p - 22) * 0.08;
    // Large seals: full wall tax to 40, then 35% (was 45%; E9S4 W74 soft).
    const scoreWalls = Math.min(wallN, 40) + Math.max(0, wallN - 40) * 0.35;
    let raw =
      100 -
      pathSScore * 0.7 -
      scorePathC(pathCtrl) * 1.1 -
      scoreWalls * 0.3 +
      sourcesProtected.length * 4 +
      Math.min(15, extList.length / 4) +
      (accessPct >= 99 ? 5 : -10);
    if (extList.length >= 60) raw += 8;
    else raw -= (60 - extList.length) * 0.4;
    return Math.round(Math.max(0, Math.min(100, raw)));
  }

  // Prefer more tower cover on the shell (scale so 100% cover → +12, not +10)
  const towerBonus = Math.min(12, (towerCoverPct / 100) * 12);

  const ratingFull = {
    overall: Math.round(Math.max(0, Math.min(100, scoreForWalls(wallsFull.length) + towerBonus - 6))),
    hubPathCost: Math.round(hubSc.cost * 10) / 10,
    openSpace: hubSc.space,
    wallTiles: wallsFull.length,
    rampTiles: rampsFull.length,
    squareCompare: squareCount,
    savedVsSquare: squareCount - wallsFull.length,
    sourcePathSum: pathSources,
    controllerPath: pathCtrl,
    extensions: structures.extension.length,
    extAccessPct: accessPct,
    sourcesInShell: sourcesProtected.length,
    sourceProtectMaxPath: SOURCE_PROTECT_MAX_PATH,
    towers: (structures.tower || []).length,
    towerCoverPct,
    seal: "full",
  };
  const ratingEdge = {
    ...ratingFull,
    overall: Math.round(Math.max(0, Math.min(100, scoreForWalls(wallsEdge.length) + towerBonus - 6))),
    wallTiles: wallsEdge.length,
    rampTiles: rampsEdge.length,
    savedVsSquare: squareCount - wallsEdge.length,
    seal: "edge",
  };

  return {
    roomName,
    hub,
    structures,
    // primary = full seal (default doctrine)
    perimeter: wallsFull,
    ramps: rampsFull,
    perimeterFull: wallsFull,
    rampsFull,
    perimeterEdge: wallsEdge,
    rampsEdge,
    protectRange,
    sourcesProtected,
    sources,
    controller,
    mineral,
    terrain,
    rating: ratingFull,
    ratingFull,
    ratingEdge,
  };
}

// ---------- OFFICIAL Screeps icons (@screeps/renderer-metadata SVGs) ----------
// Assets in tools/plan-suite/assets/ — embedded as data URIs so previews work offline.
const _ICON_CACHE = new Map();

function loadIconDataUri(name) {
  if (_ICON_CACHE.has(name)) return _ICON_CACHE.get(name);
  const fp = path.join(__dirname, "assets", name);
  if (!fs.existsSync(fp)) {
    _ICON_CACHE.set(name, null);
    return null;
  }
  const buf = fs.readFileSync(fp);
  const ext = path.extname(name).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "application/octet-stream";
  const uri = `data:${mime};base64,${buf.toString("base64")}`;
  _ICON_CACHE.set(name, uri);
  return uri;
}

/** Draw official Screeps structure sprite centered on tile */
function iconSprite(parts, p, cell, file, scale = 0.92) {
  const uri = loadIconDataUri(file);
  if (!uri) return;
  const pad = (cell * (1 - scale)) / 2;
  const size = cell * scale;
  parts.push(
    `<image href="${uri}" x="${p.x * cell + pad}" y="${p.y * cell + pad}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`,
  );
}

function iconRoad(parts, p, cell) {
  // roads are procedural in client; solid grey tile
  const ox = p.x * cell,
    oy = p.y * cell;
  parts.push(`<rect x="${ox}" y="${oy}" width="${cell}" height="${cell}" fill="#555"/>`);
  parts.push(
    `<rect x="${ox + cell * 0.08}" y="${oy + cell * 0.08}" width="${cell * 0.84}" height="${cell * 0.84}" fill="#777" opacity="0.9"/>`,
  );
}

function iconPerimeter(parts, p, cell, isRamp) {
  const uri = loadIconDataUri("rampart.svg");
  const ox = p.x * cell,
    oy = p.y * cell;
  if (isRamp) {
    parts.push(
      `<rect x="${ox + 1}" y="${oy + 1}" width="${cell - 2}" height="${cell - 2}" fill="rgba(33,150,243,0.35)" stroke="#42A5F5" stroke-width="${Math.max(2, cell * 0.08)}" stroke-dasharray="${cell * 0.18} ${cell * 0.1}"/>`,
    );
  } else if (uri) {
    parts.push(
      `<image href="${uri}" x="${ox}" y="${oy}" width="${cell}" height="${cell}" opacity="0.8" preserveAspectRatio="xMidYMid meet"/>`,
    );
  } else {
    parts.push(
      `<rect x="${ox}" y="${oy}" width="${cell}" height="${cell}" fill="rgba(76,175,80,0.45)" stroke="#81C784" stroke-width="2"/>`,
    );
  }
}

function iconHub(parts, p, cell) {
  const cx = p.x * cell + cell / 2,
    cy = p.y * cell + cell / 2;
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${cell * 0.48}" fill="none" stroke="#00E676" stroke-width="${Math.max(2.5, cell * 0.1)}"/>`,
  );
}

// Official textures from @screeps/renderer-metadata (same pack the game client uses).
// Spawn has no single sprite (procedural in client) — rectangle + operate-spawn badge.
const STRUCT_ICON = {
  extension: ["extension-border200.svg", "extension.svg"],
  storage: ["storage-border.svg", "storage.svg"],
  terminal: ["terminal-border.svg", "terminal.svg"],
  tower: ["tower-base.svg", "tower-rotatable.svg"],
  lab: ["lab.svg"],
  link: ["link-border.svg", "link.svg"],
  factory: ["factory.svg"],
  controller: ["controller.svg"],
  extractor: ["extractor.svg"],
  nuker: ["nuker.svg"],
  spawn: ["rectangle.svg", "operate-spawn.svg"],
  container: ["tombstone.svg"],
  observer: ["cover.svg"],
  source: ["harvest-energy.svg"],
  mineral: ["harvest-mineral.svg"],
};

function iconStructure(parts, p, cell, type) {
  const files = STRUCT_ICON[type];
  if (!files) return;
  for (const f of files) {
    const scale = type === "spawn" && f === "operate-spawn.svg" ? 0.55 : 0.94;
    iconSprite(parts, p, cell, f, scale);
  }
}

function structuresAtRcl(plan, rcl, seal = "full") {
  const out = {};
  for (const [type, slots] of Object.entries(plan.structures || {})) {
    if (type === "road") {
      out.road = rcl >= 2 ? slots : [];
      continue;
    }
    if (type === "powerSpawn") continue;
    const cap = (CAPS[type] && CAPS[type][rcl]) || 0;
    out[type] = (slots || []).slice(0, cap);
  }
  if (rcl >= 3) {
    if (seal === "edge") {
      out._perimeter = plan.perimeterEdge || [];
      out._ramps = plan.rampsEdge || [];
    } else {
      out._perimeter = plan.perimeterFull || plan.perimeter || [];
      out._ramps = plan.rampsFull || plan.ramps || [];
    }
  } else {
    out._perimeter = [];
    out._ramps = [];
  }
  return out;
}

function renderRoomSvg(plan, rcl = 8, cell = 24, seal = "full") {
  const size = 50 * cell;
  const terrain = plan.terrain;
  const at = structuresAtRcl(plan, rcl, seal);
  const parts = [];

  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const t = tileAt(terrain, x, y);
      const fill = t === WALL ? "#111" : t === SWAMP ? "#1a3a1a" : "#2a2a22";
      parts.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${fill}"/>`);
    }
  }

  for (const p of at.road || []) iconRoad(parts, p, cell);
  for (const p of at._perimeter || []) iconPerimeter(parts, p, cell, false);
  for (const p of at._ramps || []) iconPerimeter(parts, p, cell, true);

  const order = [
    "extension",
    "lab",
    "tower",
    "container",
    "link",
    "factory",
    "observer",
    "nuker",
    "terminal",
    "spawn",
    "storage",
    "extractor",
  ];
  for (const type of order) {
    for (const p of at[type] || []) iconStructure(parts, p, cell, type);
  }

  for (const s of plan.sources || []) iconStructure(parts, s, cell, "source");
  if (plan.controller) iconStructure(parts, plan.controller, cell, "controller");
  if (plan.mineral) iconStructure(parts, plan.mineral, cell, "mineral");
  if (plan.hub) iconHub(parts, plan.hub, cell);

  parts.push(
    `<rect x="0" y="0" width="${size}" height="${size}" fill="none" stroke="#000" stroke-width="3"/>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${parts.join("")}</svg>`;
}

function legendHtml() {
  const items = [
    ["extension.svg", "Extension"],
    ["rectangle.svg", "Spawn*"],
    ["storage.svg", "Storage"],
    ["terminal.svg", "Terminal"],
    ["tower-base.svg", "Tower"],
    ["lab.svg", "Lab"],
    ["link.svg", "Link"],
    ["factory.svg", "Factory"],
    ["controller.svg", "Controller"],
    ["harvest-energy.svg", "Source"],
    ["rampart.svg", "Rampart"],
  ];
  const bits = items
    .map(([f, n]) => {
      const uri = loadIconDataUri(f);
      if (!uri) return "";
      return `<span style="display:inline-flex;align-items:center;gap:6px;margin:4px 14px 4px 0;font-size:16px"><img src="${uri}" width="40" height="40" style="background:#1a1a1a;border-radius:4px;padding:2px"/>${n}</span>`;
    })
    .join("");
  return `<div style="line-height:1.8">${bits}
  <div style="color:#888;font-size:13px;margin-top:8px">
    Official sprites from <code>@screeps/renderer-metadata</code> (same pack the Screeps client uses).
    * Spawn is drawn procedurally in-game — we use official rectangle + operate-spawn badge.
  </div></div>`;
}

// ---------- IO ----------
function fetchRoomsFromMongo(roomNames) {
  const dumpPath = path.join(__dirname, "dump-rooms.js");
  const body = `db = db.getSiblingDB("screeps");
var rooms = ${JSON.stringify(roomNames)};
var out = [];
for (var i = 0; i < rooms.length; i++) {
  var rn = rooms[i];
  var ter = db["rooms.terrain"].findOne({ room: rn });
  if (!ter || !ter.terrain) continue;
  var objs = db["rooms.objects"].find({ room: rn, type: { $in: ["source", "controller", "mineral"] } }, { type: 1, x: 1, y: 1 }).toArray();
  out.push({ room: rn, terrain: ter.terrain, objects: objs });
}
print(JSON.stringify(out));
`;
  fs.writeFileSync(dumpPath, body);
  execSync(`docker cp "${dumpPath}" local-screeps-server-mongo-1:/tmp/dump-rooms.js`);
  const raw = execSync(
    `docker exec local-screeps-server-mongo-1 mongosh --quiet --file /tmp/dump-rooms.js`,
    { encoding: "utf8", maxBuffer: 80e6 },
  );
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0) throw new Error("mongo dump failed: " + raw.slice(0, 200));
  return JSON.parse(raw.slice(start, end + 1));
}

function defaultRooms() {
  return [
    "E2S7",
    "E5S1",
    "E9S8",
    "E1S5",
    "E3S3",
    "E7S2",
    "E8S5",
    "E1S1",
    "E3S7",
    "E7S6",
    "E4S1",
    "E8S2",
    "E6S8",
    "E9S3",
  ];
}

/** All 2-source + controller rooms on the local private server map. */
function fetchAllClaimableRooms() {
  const script = `db = db.getSiblingDB("screeps");
var src = db["rooms.objects"].aggregate([
  {$match:{type:"source"}},
  {$group:{_id:"$room", n:{$sum:1}}},
  {$match:{n:{$gte:2}}}
]).toArray().map(x=>x._id);
var ctrl = db["rooms.objects"].distinct("room", {type:"controller"});
var claim = src.filter(r => ctrl.indexOf(r) >= 0).sort();
print(JSON.stringify(claim));
`;
  const p = path.join(__dirname, "_claimable.js");
  fs.writeFileSync(p, script);
  execSync(`docker cp "${p}" local-screeps-server-mongo-1:/tmp/_claimable.js`);
  const raw = execSync(
    `docker exec local-screeps-server-mongo-1 mongosh --quiet --file /tmp/_claimable.js`,
    { encoding: "utf8" },
  );
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0) throw new Error("claimable dump failed: " + raw.slice(0, 200));
  return JSON.parse(raw.slice(start, end + 1));
}

function main() {
  const args = process.argv.slice(2);
  let rooms = defaultRooms();
  const ri = args.indexOf("--rooms");
  if (ri >= 0 && args[ri + 1]) rooms = args[ri + 1].split(",").map((s) => s.trim());
  if (args.includes("--all-claimable") || args.includes("--all")) {
    rooms = fetchAllClaimableRooms();
  }

  console.log("Plan suite v4 — full-eco protect · NO powerSpawn · full vs edge seal · NO double shell");
  console.log("Fetching", rooms.length, "rooms…");
  const data = fetchRoomsFromMongo(rooms);
  fs.mkdirSync(OUT, { recursive: true });
  const plans = [];

  for (const d of data) {
    const plan = planRoom(d.room, d.terrain, d.objects);
    plans.push(plan);
    if (plan.error) {
      console.log(d.room, "ERROR", plan.error);
      continue;
    }
    const rf = plan.ratingFull;
    const re = plan.ratingEdge;
    console.log(
      d.room,
      "ext",
      rf.extensions,
      "roads",
      (plan.structures.road || []).length,
      "towers",
      rf.towers,
      "tCover",
      rf.towerCoverPct + "%",
      "fullW",
      rf.wallTiles,
      "edgeW",
      re.wallTiles,
      "scoreF",
      rf.overall,
    );

    const srcNote =
      plan.sourcesProtected.length === 0
        ? "all sources OUTSIDE shell (far)"
        : `source containers in shell (path≤${SOURCE_PROTECT_MAX_PATH}): ${plan.sourcesProtected.map((s) => `(${s.x},${s.y}) d=${s.path}`).join(", ")}`;

    let page = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${d.room} plan v4</title>
<style>
body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e8e8e8;margin:18px}
h1{margin:0 0 8px}
.meta{color:#9ab;font-size:14px;line-height:1.5;max-width:1400px}
.note{background:#151208;border-left:3px solid #fc6;padding:12px 14px;margin:14px 0;max-width:1100px;font-size:13px;color:#edc;line-height:1.45}
.row{display:flex;flex-wrap:wrap;gap:22px;margin-top:16px}
.card{background:#121212;padding:14px;border-radius:10px;border:1px solid #2a2a2a}
.card h3{margin:0 0 10px;color:#8cf;font-size:15px}
.card svg{display:block;image-rendering:auto;max-width:100%;height:auto}
table{border-collapse:collapse;margin-top:14px;font-size:13px}
td,th{border:1px solid #333;padding:6px 10px} th{background:#1a1a1a;text-align:left}
a{color:#6af}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;margin-right:6px}
.tag.full{background:#1a3a2a;color:#6f6}.tag.edge{background:#3a2a1a;color:#fc6}
</style></head><body>
<h1>${d.room}</h1>
<div class="meta">Hub <b>(${plan.hub.x},${plan.hub.y})</b> · extensions <b>${rf.extensions}/60</b> · access <b>${rf.extAccessPct}%</b><br/>
<span class="tag full">FULL seal</span> walls <b>${rf.wallTiles}</b> score <b>${rf.overall}</b>
&nbsp;·&nbsp;
<span class="tag edge">EDGE seal</span> walls <b>${re.wallTiles}</b> score <b>${re.overall}</b>
(saves ${rf.wallTiles - re.wallTiles} tiles vs full, but leaves flanks open)
</div>
<div class="note">
<b>Protect:</b> full eco (all extensions + hub). No powerSpawn. No double shell.<br/>
<b>FULL:</b> min-cut around dilated eco set — default doctrine.<br/>
<b>EDGE:</b> same plan, only keep wall tiles within ${EDGE_SEAL_DIST} of room edge (choke / no full seal) — for comparison.<br/>
<b>Sources:</b> ${srcNote}
</div>
${legendHtml()}
<div class="row">
<div class="card"><h3>RCL 8 · FULL seal (red walls)</h3>${renderRoomSvg(plan, 8, 18, "full")}</div>
<div class="card"><h3>RCL 8 · EDGE seal only</h3>${renderRoomSvg(plan, 8, 18, "edge")}</div>
</div>
<div class="row">
<div class="card"><h3>RCL 6 · FULL</h3>${renderRoomSvg(plan, 6, 14, "full")}</div>
<div class="card"><h3>RCL 4 · FULL</h3>${renderRoomSvg(plan, 4, 14, "full")}</div>
<div class="card"><h3>RCL 3 · FULL</h3>${renderRoomSvg(plan, 3, 14, "full")}</div>
</div>
<table>
<tr><th>metric</th><th>full</th><th>edge</th></tr>
<tr><td>overall</td><td>${rf.overall}</td><td>${re.overall}</td></tr>
<tr><td>wallTiles</td><td>${rf.wallTiles}</td><td>${re.wallTiles}</td></tr>
<tr><td>rampTiles</td><td>${rf.rampTiles}</td><td>${re.rampTiles}</td></tr>
<tr><td>extensions</td><td colspan="2">${rf.extensions}</td></tr>
<tr><td>extAccessPct</td><td colspan="2">${rf.extAccessPct}%</td></tr>
<tr><td>savedVsSquare (full)</td><td colspan="2">${rf.savedVsSquare}</td></tr>
</table>
<p><a href="index.html">← gallery</a></p>
</body></html>`;
    fs.writeFileSync(path.join(OUT, `${d.room}.html`), page);
  }

  const ok = plans.filter((p) => !p.error).sort((a, b) => b.ratingFull.overall - a.ratingFull.overall);
  const n60 = ok.filter((p) => p.ratingFull.extensions >= 60).length;
  let index = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Pacifist Plan Suite v4</title>
<style>
body{font-family:system-ui,sans-serif;background:#080808;color:#eee;margin:20px}
h1{margin-bottom:6px}
.sub{color:#889;max-width:1200px;line-height:1.55;margin-bottom:18px}
table{border-collapse:collapse;width:100%;max-width:1400px;font-size:13px}
th,td{border:1px solid #2a2a2a;padding:8px;text-align:left}
th{background:#161616} a{color:#6af}
.good{color:#6f6}.meh{color:#fc6}.bad{color:#f66}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px;max-width:1600px}
@media(max-width:1100px){.grid{grid-template-columns:1fr}}
.card{background:#101010;border-radius:10px;padding:14px;border:1px solid #222}
.card h3{margin:0 0 12px;font-size:15px}
.card svg{width:100%;height:auto;image-rendering:auto}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
</style></head><body>
<h1>Pacifist plan suite v4</h1>
<p class="sub">
<b>Full eco protect</b> (all extensions inside) · <b>no powerSpawn</b> · <b>no double shell</b>.<br/>
Compare <b>FULL min-cut seal</b> vs <b>EDGE-only seal</b> (tiles within ${EDGE_SEAL_DIST} of border).<br/>
Rooms: <b>${ok.length}</b> · hit 60 ext: <b class="${n60 === ok.length ? "good" : "meh"}">${n60}/${ok.length}</b><br/>
${new Date().toISOString()}
</p>
${legendHtml()}
<table style="margin-top:16px">
<tr><th>room</th><th>ext</th><th>towers</th><th>tower cover%</th><th>full walls</th><th>edge walls</th><th>score</th><th>access%</th></tr>`;
  for (const p of ok) {
    const rf = p.ratingFull;
    const re = p.ratingEdge;
    const cls = rf.extensions >= 60 ? "good" : rf.extensions >= 40 ? "meh" : "bad";
    const tc = rf.towerCoverPct >= 50 ? "good" : rf.towerCoverPct >= 25 ? "meh" : "bad";
    index += `<tr>
<td><a href="${p.roomName}.html">${p.roomName}</a></td>
<td class="${cls}"><b>${rf.extensions}</b></td>
<td>${rf.towers}</td>
<td class="${tc}">${rf.towerCoverPct}%</td>
<td>${rf.wallTiles}</td>
<td>${re.wallTiles}</td>
<td>${rf.overall}</td>
<td>${rf.extAccessPct}%</td>
</tr>`;
  }
  index += `</table>
<h2>RCL 8 side-by-side (FULL | EDGE)</h2>
<div class="grid">`;
  for (const p of ok) {
    const rf = p.ratingFull;
    const re = p.ratingEdge;
    index += `<div class="card"><h3><a href="${p.roomName}.html">${p.roomName}</a> · ext ${rf.extensions} · fullW ${rf.wallTiles} / edgeW ${re.wallTiles}</h3>
<div class="pair">
<div><div style="color:#6f6;font-size:12px;margin-bottom:6px">FULL seal</div>${renderRoomSvg(p, 8, 12, "full")}</div>
<div><div style="color:#fc6;font-size:12px;margin-bottom:6px">EDGE seal</div>${renderRoomSvg(p, 8, 12, "edge")}</div>
</div>
</div>`;
  }
  index += `</div></body></html>`;
  fs.writeFileSync(path.join(OUT, "index.html"), index);
  fs.writeFileSync(
    path.join(OUT, "plans.json"),
    JSON.stringify(
      ok.map((p) => ({
        room: p.roomName,
        hub: p.hub,
        ratingFull: p.ratingFull,
        ratingEdge: p.ratingEdge,
      })),
      null,
      2,
    ),
  );
  // Full dump for walkthrough video / offline tools
  fs.writeFileSync(
    path.join(OUT, "plans-full.json"),
    JSON.stringify(
      ok.map((p) => ({
        room: p.roomName,
        hub: p.hub,
        terrain: p.terrain,
        sources: p.sources,
        controller: p.controller,
        mineral: p.mineral,
        structures: p.structures,
        perimeterFull: p.perimeterFull || p.perimeter,
        rampsFull: p.rampsFull || p.ramps,
        perimeterEdge: p.perimeterEdge,
        rampsEdge: p.rampsEdge,
        ratingFull: p.ratingFull,
        ratingEdge: p.ratingEdge,
        protectRange: p.protectRange,
        sourcesProtected: p.sourcesProtected,
      })),
    ),
  );
  console.log("\nWrote", path.join(OUT, "index.html"));
  console.log("Wrote", path.join(OUT, "plans-full.json"));
  console.log(`60-ext rooms: ${n60}/${ok.length}`);
}

export {
  renderRoomSvg,
  structuresAtRcl,
  planRoom,
  fetchRoomsFromMongo,
  fetchAllClaimableRooms,
  OUT,
};

// Only run suite when executed as CLI (not when imported for video tool)
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("plan-offline.mjs");
if (isMain) {
  main();
}
