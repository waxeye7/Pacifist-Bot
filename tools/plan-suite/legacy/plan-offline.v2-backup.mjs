/**
 * Pacifist offline base plan suite v2
 *
 * Goals (from design review):
 * - Protect MOST of the base so hostiles cannot stand within RANGE 3 of core buildings
 * - Source containers/links MAY stay outside if including them blows up the cut
 * - Dynamic placement (flood-fill), not diagonal checkerboard stamps
 * - Atlantis-inspired center scoring (weighted path costs + open space + exit distance)
 * - Big Screeps-like visuals
 *
 *   node tools/plan-suite/legacy/plan-offline.mjs
 *   node tools/plan-suite/legacy/plan-offline.mjs --rooms E2S7,E5S1
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "out");

// --- Protection policy ---
/** Hostile must not be able to stand within this Chebyshev range of core buildings */
const PROTECT_RANGE = 3;
/** Soft cap: if min-cut tiles exceed this when sources included, drop sources outside */
const MAX_CUT_SOFT = 80;

const WALL = 1;
const SWAMP = 2;

// Screeps-ish palette (readable on dark terrain)
const C = {
  wall: "#111111",
  swamp: "#294d29",
  plain: "#3a3a2e",
  road: "#555555",
  roadStroke: "#777777",
  // structures (approx Screeps client)
  spawn: "#ffe56d",
  extension: "#ffeb3b",
  storage: "#f4e4bc",
  terminal: "#20b2aa",
  tower: "#cc3333",
  lab: "#b266ff",
  link: "#6ec6ff",
  factory: "#c49a6c",
  container: "#8b6914",
  observer: "#aaaaaa",
  nuker: "#ff66aa",
  powerSpawn: "#ff8800",
  extractor: "#6666ff",
  // defense
  perimeter: "#ff2a2a",
  perimeterFill: "rgba(255,40,40,0.15)",
  ramp: "#3399ff",
  protectHalo: "rgba(255,200,0,0.08)",
  // map objects
  source: "#ffd700",
  controller: "#ffffff",
  mineral: "#7ec8e3",
  hub: "#00ff88",
};

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
  powerSpawn: { 8: 1 },
  container: { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5 },
  extractor: { 6: 1, 7: 1, 8: 1 },
};

function tileAt(terrain, x, y) {
  if (x < 0 || x > 49 || y < 0 || y > 49) return WALL;
  return parseInt(terrain.charAt(y * 50 + x), 10);
}
function buildable(terrain, x, y) {
  if (x < 1 || x > 48 || y < 1 || y > 48) return false;
  return tileAt(terrain, x, y) !== WALL;
}
function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// --- BFS path length on walkable (for scoring) ---
function walkableTile(terrain, x, y) {
  if (x < 0 || x > 49 || y < 0 || y > 49) return false;
  return tileAt(terrain, x, y) !== WALL;
}

/** Nearest walkable tile within range 1 of a structure (ctrl/source often on awkward tiles). */
function approachTile(terrain, pos) {
  if (walkableTile(terrain, pos.x, pos.y)) return { x: pos.x, y: pos.y };
  let best = null;
  let bestD = 99;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const x = pos.x + dx,
        y = pos.y + dy;
      if (!walkableTile(terrain, x, y)) continue;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return best;
}

function pathLen(terrain, from, to) {
  // Screeps: 8-direction. Path to approach tile of target (range 1).
  const start = walkableTile(terrain, from.x, from.y)
    ? { x: from.x, y: from.y }
    : approachTile(terrain, from);
  const goal = approachTile(terrain, to) || (walkableTile(terrain, to.x, to.y) ? to : null);
  if (!start || !goal) return 999;
  if (start.x === goal.x && start.y === goal.y) return 0;

  const key = (x, y) => x + y * 50;
  const q = [[start.x, start.y, 0]];
  const seen = new Uint8Array(2500);
  seen[key(start.x, start.y)] = 1;
  let qi = 0;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  while (qi < q.length) {
    const [x, y, d] = q[qi++];
    for (const [dx, dy] of dirs) {
      const nx = x + dx,
        ny = y + dy;
      if (!walkableTile(terrain, nx, ny)) continue;
      if (seen[key(nx, ny)]) continue;
      if (nx === goal.x && ny === goal.y) return d + 1;
      seen[key(nx, ny)] = 1;
      q.push([nx, ny, d + 1]);
    }
  }
  return 999;
}

function openSpace(terrain, x, y, r) {
  let n = 0;
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) if (buildable(terrain, x + dx, y + dy)) n++;
  return n;
}

function exitDist(x, y) {
  return Math.min(x, y, 49 - x, 49 - y);
}

/**
 * Atlantis-inspired hub score (lower is better internally; we invert for display).
 * Weighted path costs to controller / sources / mineral + exit penalty + space bonus.
 */
function scoreHubCandidate(terrain, x, y, controller, sources, mineral) {
  if (!buildable(terrain, x, y)) return null;
  if (exitDist(x, y) < 7) return null;
  const space = openSpace(terrain, x, y, 10);
  if (space < 90) return null; // need room for core + extensions

  const hub = { x, y };
  // weights ~ Atlantis: controller heavy, sources medium, mineral light
  let cost = 0;
  cost += pathLen(terrain, hub, controller) * 0.675;
  for (const s of sources) cost += pathLen(terrain, hub, s) * 0.22;
  if (mineral) cost += pathLen(terrain, hub, mineral) * 0.01;

  // Prefer away from exits a bit (soft)
  const ed = exitDist(x, y);
  if (ed < 10) cost += (10 - ed) * 0.4;

  // Space quality (more open = better → lower cost)
  cost -= (space / 200) * 2;

  // Swamp hub penalty
  if (tileAt(terrain, x, y) === SWAMP) cost += 3;

  return { x, y, cost, space };
}

function findHub(terrain, controller, sources, mineral) {
  // Coarse then fine search around weighted centroid
  let sx = controller.x,
    sy = controller.y,
    w = 0.675;
  for (const s of sources) {
    sx += s.x * 0.22;
    sy += s.y * 0.22;
    w += 0.22;
  }
  if (mineral) {
    sx += mineral.x * 0.01;
    sy += mineral.y * 0.01;
    w += 0.01;
  }
  const cx = Math.round(sx / w);
  const cy = Math.round(sy / w);

  let best = null;
  // Full-ish scan of interior (like Atlantis minEdge 7)
  for (let x = 7; x <= 42; x++) {
    for (let y = 7; y <= 42; y++) {
      // skip far from centroid first pass? full scan is 36^2 fine
      const sc = scoreHubCandidate(terrain, x, y, controller, sources, mineral);
      if (!sc) continue;
      if (!best || sc.cost < best.cost) best = sc;
    }
  }
  // bias near centroid if tie region
  if (!best) {
    for (let dx = -12; dx <= 12; dx++)
      for (let dy = -12; dy <= 12; dy++) {
        const sc = scoreHubCandidate(terrain, cx + dx, cy + dy, controller, sources, mineral);
        if (sc && (!best || sc.cost < best.cost)) best = sc;
      }
  }
  return best;
}

// --- Min-cut (Saruss / Dinic) ---
const UNWALKABLE = -1,
  NORMAL = 0,
  PROTECTED = 1,
  TO_EXIT = 2,
  EXIT = 3;
const SURR8 = [
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
];

function room2d(terrain) {
  const a = Array.from({ length: 50 }, () => Array(50).fill(UNWALKABLE));
  for (let x = 0; x < 50; x++)
    for (let y = 0; y < 50; y++) {
      if (tileAt(terrain, x, y) !== WALL) {
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

/**
 * Protect a set of tiles (boolean mask). Marks mask as interior UNWALKABLE and
 * border as PROTECTED so cut tiles seal exits from that region.
 */
function getCutForMask(terrain, protectMask) {
  const room_array = room2d(terrain);
  // Interior of protect mask → UNWALKABLE; border of mask on walkable → PROTECTED
  for (let x = 1; x < 49; x++) {
    for (let y = 1; y < 49; y++) {
      if (!protectMask[x][y]) continue;
      if (room_array[x][y] === UNWALKABLE) continue;
      // is border if any neighbor not in mask or wall
      let border = false;
      for (const [dx, dy] of SURR8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49 || !protectMask[nx][ny]) {
          border = true;
          break;
        }
      }
      if (border) room_array[x][y] = PROTECTED;
      else room_array[x][y] = UNWALKABLE;
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
        g.newEdge(top, bot, 1);
        for (const [dx, dy] of SURR8) {
          const nx = x + dx,
            ny = y + dy;
          if (room_array[nx][ny] === NORMAL || room_array[nx][ny] === TO_EXIT)
            g.newEdge(bot, ny * 50 + nx, INF);
        }
      } else if (room_array[x][y] === PROTECTED) {
        g.newEdge(source, top, INF);
        g.newEdge(top, bot, 1);
        for (const [dx, dy] of SURR8) {
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
  const count = g.mincut(source, sink);
  if (count <= 0) return [];
  const verts = g.bfsCut(source);
  const seen = new Set();
  const out = [];
  for (const u of verts) {
    const x = u % 50;
    const y = Math.floor(u / 50);
    const k = `${x},${y}`;
    if (seen.has(k) || x < 2 || x > 47 || y < 2 || y > 47) continue;
    if (!buildable(terrain, x, y)) continue;
    seen.add(k);
    out.push({ x, y });
  }
  return out;
}

/** Dilate points by Chebyshev range R into a boolean mask */
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

function orMask(a, b) {
  const m = Array.from({ length: 50 }, () => Array(50).fill(false));
  for (let x = 0; x < 50; x++) for (let y = 0; y < 50; y++) m[x][y] = a[x][y] || b[x][y];
  return m;
}

// --- Dynamic placement: compact flood-fill from hub ---
function floodPlace(terrain, hub, blocked, count, preferNear = null) {
  const placed = [];
  const key = (x, y) => `${x},${y}`;
  const q = [[hub.x, hub.y]];
  const seen = new Set([key(hub.x, hub.y)]);
  const candidates = [];

  while (q.length && candidates.length < count * 8) {
    const [x, y] = q.shift();
    // 4-neigh expand
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!buildable(terrain, nx, ny)) continue;
      q.push([nx, ny]);
      if (blocked.has(k)) continue;
      // leave hub ring for roads sometimes — still allow place
      candidates.push({ x: nx, y: ny, d: chebyshev(hub, { x: nx, y: ny }) });
    }
  }

  // Prefer: close to hub, slightly prefer "not pure diagonal-only" by mixing
  // Sort by distance, then by (x+y) for stable packing — compact blob not checkerboard
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);

  for (const c of candidates) {
    if (placed.length >= count) break;
    const k = key(c.x, c.y);
    if (blocked.has(k)) continue;
    // leave 1-tile ring around hub empty for storage adjacency roads
    if (chebyshev(hub, c) < 2) continue;
    placed.push({ x: c.x, y: c.y });
    blocked.add(k);
  }
  return placed;
}

function placeNear(terrain, near, blocked, offsets, n) {
  const out = [];
  for (const o of offsets) {
    if (out.length >= n) break;
    const x = near.x + o.x,
      y = near.y + o.y;
    const k = `${x},${y}`;
    if (blocked.has(k) || !buildable(terrain, x, y)) continue;
    out.push({ x, y });
    blocked.add(k);
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
  // widen ramp by 1 adjacent perimeter tile
  const open = new Set(ramps.map((r) => `${r.x},${r.y}`));
  for (const r of [...ramps]) {
    for (const p of perimeter) {
      if (Math.abs(p.x - r.x) + Math.abs(p.y - r.y) === 1) open.add(`${p.x},${p.y}`);
    }
  }
  return [...open].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  });
}

function planRoom(roomName, terrain, objects) {
  const sources = objects.filter((o) => o.type === "source").map((s) => ({ x: s.x, y: s.y }));
  const controllerObj = objects.find((o) => o.type === "controller");
  const mineralObj = objects.find((o) => o.type === "mineral");
  if (!controllerObj || !sources.length) {
    return { roomName, error: "no controller/sources" };
  }
  const controller = { x: controllerObj.x, y: controllerObj.y };
  const mineral = mineralObj ? { x: mineralObj.x, y: mineralObj.y } : null;

  const hubSc = findHub(terrain, controller, sources, mineral);
  if (!hubSc) return { roomName, error: "no valid hub" };
  const hub = { x: hubSc.x, y: hubSc.y };

  const blocked = new Set([`${hub.x},${hub.y}`]);
  for (const s of sources) blocked.add(`${s.x},${s.y}`);
  blocked.add(`${controller.x},${controller.y}`);
  if (mineral) blocked.add(`${mineral.x},${mineral.y}`);

  const structures = {};
  // Core stamp near hub (compact, not diagonal-only)
  structures.storage = [{ x: hub.x, y: hub.y }];
  structures.terminal = placeNear(
    terrain,
    hub,
    blocked,
    [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
    ],
    1,
  );
  structures.spawn = placeNear(
    terrain,
    hub,
    blocked,
    [
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
      { x: 2, y: 0 },
      { x: -2, y: 0 },
    ],
    3,
  );
  structures.tower = floodPlace(terrain, hub, blocked, 6);
  // Labs: compact 2x5-ish blob south-west of hub via flood
  structures.lab = floodPlace(terrain, { x: hub.x - 2, y: hub.y + 2 }, blocked, 10);
  // Extensions: compact flood blob (NOT checkerboard)
  structures.extension = floodPlace(terrain, hub, blocked, 60);
  structures.link = placeNear(
    terrain,
    hub,
    blocked,
    [
      { x: -2, y: 0 },
      { x: 2, y: -1 },
      { x: 0, y: 2 },
    ],
    3,
  );
  structures.factory = placeNear(terrain, hub, blocked, [{ x: 2, y: 2 }, { x: 2, y: 1 }], 1);
  structures.observer = placeNear(terrain, hub, blocked, [{ x: -2, y: 1 }, { x: -3, y: 0 }], 1);
  structures.nuker = placeNear(terrain, hub, blocked, [{ x: 3, y: 0 }, { x: 3, y: 1 }], 1);
  structures.powerSpawn = placeNear(terrain, hub, blocked, [{ x: 3, y: 2 }, { x: 2, y: 3 }], 1);
  if (mineral) structures.extractor = [{ x: mineral.x, y: mineral.y }];

  // Source economy OUTSIDE core by default (containers near sources)
  structures.container = [];
  for (const s of sources) {
    const near = placeNear(
      terrain,
      s,
      blocked,
      [
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: -1, y: 0 },
        { x: 1, y: 1 },
      ],
      1,
    );
    structures.container.push(...near);
  }

  // --- Protected set: all CORE buildings, dilated by PROTECT_RANGE ---
  // Core = storage, spawns, extensions, towers, labs, terminal, factory, nuker, powerSpawn, observer, hub links
  // NOT source containers (optional second pass)
  const corePoints = [];
  for (const t of [
    "storage",
    "spawn",
    "extension",
    "tower",
    "lab",
    "terminal",
    "factory",
    "nuker",
    "powerSpawn",
    "observer",
    "link",
  ]) {
    for (const p of structures[t] || []) corePoints.push(p);
  }

  const coreMask = dilateMask(corePoints, PROTECT_RANGE);
  let perimeter = getCutForMask(terrain, coreMask);
  let sourcesInside = false;

  // Optional: try including source containers if cut stays reasonable
  if (structures.container.length) {
    const withSrc = orMask(coreMask, dilateMask(structures.container, PROTECT_RANGE));
    const cut2 = getCutForMask(terrain, withSrc);
    if (cut2.length > 0 && cut2.length <= MAX_CUT_SOFT && cut2.length <= perimeter.length * 1.35 + 10) {
      perimeter = cut2;
      sourcesInside = true;
    }
  }

  const ramps = pickRamps(perimeter, hub, 2);
  const rampSet = new Set(ramps.map((r) => `${r.x},${r.y}`));
  const walls = perimeter.filter((p) => !rampSet.has(`${p.x},${p.y}`));

  // Roads: hub ring + perimeter + paths to sources
  const roads = [];
  const roadSet = new Set();
  const addRoad = (x, y) => {
    const k = `${x},${y}`;
    if (roadSet.has(k) || !buildable(terrain, x, y)) return;
    roadSet.add(k);
    roads.push({ x, y });
  };
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      addRoad(hub.x + dx, hub.y + dy);
    }
  for (const p of perimeter) addRoad(p.x, p.y);

  // Metrics
  const pathSources = sources.reduce((s, src) => s + pathLen(terrain, hub, src), 0);
  const pathCtrl = pathLen(terrain, hub, controller);
  const squareCount = (() => {
    let n = 0;
    for (let i = -10; i <= 10; i++)
      for (let o = -10; o <= 10; o++) {
        if (Math.abs(i) !== 10 && Math.abs(o) !== 10) continue;
        if (buildable(terrain, hub.x + i, hub.y + o)) n++;
      }
    return n;
  })();

  // Scoring: lower internal cost = better; display 0-100
  // Good: short paths, small cut, enough extensions, sources optionally protected
  let raw =
    100 -
    pathSources * 0.8 -
    pathCtrl * 1.2 -
    walls.length * 0.35 +
    (sourcesInside ? 8 : 0) +
    Math.min(20, structures.extension.length / 3) -
    (hubSc.cost || 0) * 0.15;
  const overall = Math.round(Math.max(0, Math.min(100, raw)));

  return {
    roomName,
    hub,
    structures,
    perimeter: walls,
    ramps,
    roads,
    protectRange: PROTECT_RANGE,
    sourcesInside,
    sources,
    controller,
    mineral,
    terrain,
    rating: {
      overall,
      hubPathCost: Math.round(hubSc.cost * 10) / 10,
      openSpace: hubSc.space,
      wallTiles: walls.length,
      rampTiles: ramps.length,
      squareCompare: squareCount,
      savedVsSquare: squareCount - walls.length,
      sourcePathSum: pathSources,
      controllerPath: pathCtrl,
      extensions: structures.extension.length,
      sourcesInside: sourcesInside ? 1 : 0,
      protectRange: PROTECT_RANGE,
    },
  };
}

function structuresAtRcl(plan, rcl) {
  const out = {};
  for (const [type, slots] of Object.entries(plan.structures || {})) {
    const cap = (CAPS[type] && CAPS[type][rcl]) || 0;
    out[type] = (slots || []).slice(0, cap);
  }
  out._perimeter = rcl >= 3 ? plan.perimeter : [];
  out._ramps = rcl >= 3 ? plan.ramps : [];
  out._roads = rcl >= 2 ? plan.roads : [];
  return out;
}

/** Screeps-like tile renderer — large cells, structure icons */
function renderRoomSvg(plan, rcl = 8, cell = 14) {
  const size = 50 * cell;
  const terrain = plan.terrain;
  const at = structuresAtRcl(plan, rcl);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" font-family="Segoe UI, system-ui, sans-serif">`;

  // terrain
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const t = tileAt(terrain, x, y);
      const fill = t === WALL ? C.wall : t === SWAMP ? C.swamp : C.plain;
      svg += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${fill}"/>`;
    }
  }

  // protect halo (range-3 of core) — subtle
  // skip full halo for perf on index thumbs; only on detail pages when cell>=12
  if (cell >= 12 && plan.hub) {
    const core = [];
    for (const t of ["storage", "spawn", "extension", "tower", "lab", "terminal"]) {
      for (const p of at[t] || []) core.push(p);
    }
    for (const p of core) {
      const r = plan.protectRange || 3;
      svg += `<rect x="${(p.x - r) * cell}" y="${(p.y - r) * cell}" width="${(2 * r + 1) * cell}" height="${(2 * r + 1) * cell}" fill="${C.protectHalo}"/>`;
    }
  }

  // roads
  for (const p of at._roads || []) {
    const m = cell * 0.22;
    svg += `<rect x="${p.x * cell + m}" y="${p.y * cell + m}" width="${cell - 2 * m}" height="${cell - 2 * m}" fill="${C.road}" stroke="${C.roadStroke}" stroke-width="0.5"/>`;
  }

  // perimeter walls
  for (const p of at._perimeter || []) {
    svg += `<rect x="${p.x * cell + 1}" y="${p.y * cell + 1}" width="${cell - 2}" height="${cell - 2}" fill="${C.perimeterFill}" stroke="${C.perimeter}" stroke-width="1.8"/>`;
  }
  // ramps
  for (const p of at._ramps || []) {
    svg += `<rect x="${p.x * cell + 1}" y="${p.y * cell + 1}" width="${cell - 2}" height="${cell - 2}" fill="${C.ramp}" opacity="0.55"/>`;
    svg += `<text x="${p.x * cell + cell / 2}" y="${p.y * cell + cell / 2 + 3}" text-anchor="middle" font-size="${cell * 0.35}" fill="#fff">R</text>`;
  }

  const sq = (list, color, label) => {
    for (const p of list || []) {
      const pad = cell * 0.15;
      svg += `<rect x="${p.x * cell + pad}" y="${p.y * cell + pad}" width="${cell - 2 * pad}" height="${cell - 2 * pad}" fill="${color}" stroke="#000" stroke-width="0.8" rx="1"/>`;
      if (label && cell >= 12) {
        svg += `<text x="${p.x * cell + cell / 2}" y="${p.y * cell + cell / 2 + 3}" text-anchor="middle" font-size="${cell * 0.28}" fill="#111" font-weight="600">${label}</text>`;
      }
    }
  };
  const circ = (list, color) => {
    for (const p of list || []) {
      svg += `<circle cx="${p.x * cell + cell / 2}" cy="${p.y * cell + cell / 2}" r="${cell * 0.32}" fill="${color}" stroke="#000" stroke-width="1"/>`;
    }
  };

  sq(at.extension, C.extension, cell >= 13 ? "E" : "");
  sq(at.lab, C.lab, "L");
  sq(at.tower, C.tower, "T");
  sq(at.spawn, C.spawn, "S");
  sq(at.storage, C.storage, "St");
  sq(at.terminal, C.terminal, "Te");
  sq(at.factory, C.factory, "F");
  sq(at.link, C.link, "Li");
  sq(at.container, C.container, "C");
  sq(at.observer, C.observer, "O");
  sq(at.nuker, C.nuker, "N");
  sq(at.powerSpawn, C.powerSpawn, "P");

  circ(plan.sources, C.source);
  if (plan.controller) circ([plan.controller], C.controller);
  if (plan.mineral) circ([plan.mineral], C.mineral);

  // labels for map objects
  if (cell >= 12) {
    for (const s of plan.sources || []) {
      svg += `<text x="${s.x * cell + cell / 2}" y="${s.y * cell + cell / 2 + 3}" text-anchor="middle" font-size="${cell * 0.25}" fill="#000">src</text>`;
    }
    if (plan.controller) {
      svg += `<text x="${plan.controller.x * cell + cell / 2}" y="${plan.controller.y * cell + cell / 2 + 3}" text-anchor="middle" font-size="${cell * 0.22}" fill="#000">ctrl</text>`;
    }
  }

  // hub crosshair
  if (plan.hub) {
    const hx = plan.hub.x * cell + cell / 2;
    const hy = plan.hub.y * cell + cell / 2;
    svg += `<circle cx="${hx}" cy="${hy}" r="${cell * 0.55}" fill="none" stroke="${C.hub}" stroke-width="2.5"/>`;
    svg += `<text x="${hx}" y="${hy - cell * 0.7}" text-anchor="middle" font-size="${cell * 0.4}" fill="${C.hub}" font-weight="700">HUB</text>`;
  }

  // grid subtle
  if (cell >= 12) {
    svg += `<rect x="0" y="0" width="${size}" height="${size}" fill="none" stroke="#000" stroke-width="2"/>`;
  }

  svg += `</svg>`;
  return svg;
}

function legendHtml() {
  const items = [
    ["#ffeb3b", "Extension"],
    ["#ffe56d", "Spawn"],
    ["#f4e4bc", "Storage"],
    ["#20b2aa", "Terminal"],
    ["#cc3333", "Tower"],
    ["#b266ff", "Lab"],
    ["#6ec6ff", "Link"],
    ["#ff2a2a", "Wall (min-cut)"],
    ["#3399ff", "Ramp (opening)"],
    ["#555555", "Road"],
    ["#ffd700", "Source"],
    ["#ffffff", "Controller"],
  ];
  return items
    .map(
      ([c, n]) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0"><span style="width:14px;height:14px;background:${c};border:1px solid #333;display:inline-block"></span>${n}</span>`,
    )
    .join("");
}

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
  execSync(`docker cp "${dumpPath}" local-screeps-server-mongo-1:/tmp/dump-rooms.js`, {
    encoding: "utf8",
  });
  const raw = execSync(
    `docker exec local-screeps-server-mongo-1 mongosh --quiet --file /tmp/dump-rooms.js`,
    { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 },
  );
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0) throw new Error("no JSON from mongo: " + raw.slice(0, 300));
  return JSON.parse(raw.slice(start, end + 1));
}

function defaultRoomList() {
  return [
    "E2S7",
    "E5S1",
    "E9S8",
    "E1S5",
    "E3S3",
    "E7S2",
    "E8S5",
    "E2S2",
    "E1S1",
    "E3S7",
    "E7S6",
    "E4S1",
    "E8S2",
    "E6S8",
    "E9S3",
  ];
}

function main() {
  const args = process.argv.slice(2);
  let rooms = defaultRoomList();
  const ri = args.indexOf("--rooms");
  if (ri >= 0 && args[ri + 1]) rooms = args[ri + 1].split(",").map((s) => s.trim());

  console.log("Fetching", rooms.length, "rooms...");
  const data = fetchRoomsFromMongo(rooms);
  console.log("Got", data.length);

  fs.mkdirSync(OUT, { recursive: true });
  const plans = [];

  for (const d of data) {
    const plan = planRoom(d.room, d.terrain, d.objects);
    plans.push(plan);
    if (plan.error) {
      console.log(d.room, "ERROR", plan.error);
      continue;
    }
    const r = plan.rating;
    console.log(
      d.room,
      "score",
      r.overall,
      "walls",
      r.wallTiles,
      "vs sq",
      r.squareCompare,
      "srcPath",
      r.sourcePathSum,
      "ctrl",
      r.controllerPath,
      "srcIn",
      plan.sourcesInside,
    );

    let page = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${d.room} plan v2</title>
<style>
body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#eee;margin:16px}
h1{margin:0 0 6px}
.meta{color:#9ab;font-size:14px;max-width:1100px;line-height:1.45}
.row{display:flex;flex-wrap:wrap;gap:20px;margin-top:16px}
.card{background:#141414;padding:14px;border-radius:10px;border:1px solid #2a2a2a}
.card h3{margin:0 0 10px;font-size:15px;color:#8cf}
.legend{margin:12px 0;line-height:1.8;font-size:13px}
table{border-collapse:collapse;margin-top:12px} td,th{border:1px solid #333;padding:6px 10px;font-size:13px}
th{background:#1c1c1c;text-align:left}
.note{background:#1a1510;border-left:3px solid #fc6;padding:10px 14px;margin:14px 0;max-width:900px;font-size:13px;color:#edc}
a{color:#6af}
</style></head><body>
<h1>${d.room} — dynamic plan v2</h1>
<div class="meta">
Hub (${plan.hub.x},${plan.hub.y}) · overall <b>${plan.rating.overall}</b>/100 ·
min-cut walls <b>${plan.rating.wallTiles}</b> (square would be ${plan.rating.squareCompare}) ·
protect range <b>${PROTECT_RANGE}</b> around core ·
source containers <b>${plan.sourcesInside ? "INSIDE" : "OUTSIDE"}</b> shell
</div>
<div class="note">
<b>Protection model:</b> min-cut seals the dilated core (all storage/spawns/extensions/towers/labs/terminal/…)
so a hostile cannot stand within range ${PROTECT_RANGE} of those buildings.
Source containers stay outside when including them would inflate the cut too much.
</div>
<div class="legend">${legendHtml()}</div>
<div class="row">`;
    for (const rcl of [3, 4, 6, 8]) {
      page += `<div class="card"><h3>RCL ${rcl} preview</h3>${renderRoomSvg(plan, rcl, 13)}</div>`;
    }
    page += `</div>
<table><tr><th>metric</th><th>value</th><th>meaning</th></tr>
<tr><td>overall</td><td>${plan.rating.overall}</td><td>0–100 composite (paths + cut size + space)</td></tr>
<tr><td>hubPathCost</td><td>${plan.rating.hubPathCost}</td><td>Atlantis-style weighted path cost (lower better)</td></tr>
<tr><td>wallTiles</td><td>${plan.rating.wallTiles}</td><td>min-cut ramparts after ramps removed</td></tr>
<tr><td>squareCompare</td><td>${plan.rating.squareCompare}</td><td>old ±10 square shell tile count</td></tr>
<tr><td>sourcePathSum</td><td>${plan.rating.sourcePathSum}</td><td>walk tiles hub→all sources</td></tr>
<tr><td>controllerPath</td><td>${plan.rating.controllerPath}</td><td>walk tiles hub→controller</td></tr>
<tr><td>extensions</td><td>${plan.rating.extensions}</td><td>flood-fill packed slots</td></tr>
<tr><td>sourcesInside</td><td>${plan.sourcesInside}</td><td>whether source containers in shell</td></tr>
</table>
<p><a href="index.html">← gallery</a></p>
</body></html>`;
    fs.writeFileSync(path.join(OUT, `${d.room}.html`), page);
  }

  const ok = plans.filter((p) => !p.error).sort((a, b) => b.rating.overall - a.rating.overall);
  let index = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Pacifist Plan Suite v2</title>
<style>
body{font-family:system-ui,sans-serif;background:#080808;color:#eee;margin:20px}
h1{margin-bottom:4px} .sub{color:#889;margin-bottom:16px;max-width:1000px;line-height:1.5}
table{border-collapse:collapse;width:100%;max-width:1200px;font-size:13px}
th,td{border:1px solid #2a2a2a;padding:8px;text-align:left}
th{background:#161616} tr:hover{background:#121212}
a{color:#6af} .good{color:#6f6} .meh{color:#fc6} .bad{color:#f66}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:20px;margin-top:24px}
.card{background:#101010;border-radius:10px;padding:12px;border:1px solid #222}
.card h3{margin:0 0 8px;font-size:14px}
.card svg{width:100%;height:auto;image-rendering:pixelated}
</style></head><body>
<h1>Pacifist base plan suite v2</h1>
<p class="sub">
Dynamic hub (Atlantis-weighted paths) · flood-fill extensions · min-cut around <b>range-${PROTECT_RANGE}</b> dilation of core buildings
(not spawn-only) · source containers optional outside · ramps + perimeter roads.<br/>
Generated ${new Date().toISOString()}
</p>
<table>
<tr><th>room</th><th>score</th><th>hub</th><th>walls</th><th>square</th><th>saved</th><th>src path</th><th>ctrl</th><th>ext</th><th>src in?</th></tr>`;
  for (const p of ok) {
    const cls = p.rating.overall >= 70 ? "good" : p.rating.overall >= 45 ? "meh" : "bad";
    index += `<tr>
<td><a href="${p.roomName}.html">${p.roomName}</a></td>
<td class="${cls}"><b>${p.rating.overall}</b></td>
<td>${p.hub.x},${p.hub.y}</td>
<td>${p.rating.wallTiles}</td>
<td>${p.rating.squareCompare}</td>
<td>${p.rating.savedVsSquare}</td>
<td>${p.rating.sourcePathSum}</td>
<td>${p.rating.controllerPath}</td>
<td>${p.rating.extensions}</td>
<td>${p.sourcesInside ? "yes" : "no"}</td>
</tr>`;
  }
  index += `</table>
<div class="legend" style="margin:16px 0;font-size:13px">${legendHtml()}</div>
<h2>RCL 8 previews (large)</h2>
<div class="grid">`;
  for (const p of ok) {
    index += `<div class="card"><h3><a href="${p.roomName}.html">${p.roomName}</a> · ${p.rating.overall}/100 · walls ${p.rating.wallTiles} · src ${p.sourcesInside ? "in" : "out"}</h3>
${renderRoomSvg(p, 8, 11)}
</div>`;
  }
  index += `</div>
<p class="sub">Click a room for RCL 3/4/6/8 at full size (13px/tile). Yellow halo ≈ protect range ${PROTECT_RANGE} around core structures.</p>
</body></html>`;
  fs.writeFileSync(path.join(OUT, "index.html"), index);
  fs.writeFileSync(
    path.join(OUT, "plans.json"),
    JSON.stringify(
      ok.map((p) => ({
        room: p.roomName,
        hub: p.hub,
        rating: p.rating,
        sourcesInside: p.sourcesInside,
        protectRange: PROTECT_RANGE,
      })),
      null,
      2,
    ),
  );
  console.log("\nWrote", path.join(OUT, "index.html"));
}

main();
