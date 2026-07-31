/**
 * Room min-cut (Saruss algorithm, Dinic max-flow).
 * Returns fewest tiles that separate room exits from a protected rectangle set.
 * Port adapted from community util.min_cut / Atlantis mincut.
 */

export interface CutRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CutBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CutTile {
  x: number;
  y: number;
}

const UNWALKABLE = -1;
const NORMAL = 0;
const PROTECTED = 1;
const TO_EXIT = 2;
const EXIT = 3;

const SURR = [
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
];

function room2d(roomName: string, bounds: CutBounds): number[][] {
  const room_2d: number[][] = Array(50)
    .fill(0)
    .map(() => Array(50).fill(UNWALKABLE));
  const terrain = Game.map.getRoomTerrain(roomName);

  for (let i = bounds.x1; i <= bounds.x2; i++) {
    for (let j = bounds.y1; j <= bounds.y2; j++) {
      if (terrain.get(i, j) !== TERRAIN_MASK_WALL) {
        room_2d[i][j] = NORMAL;
        if (i === bounds.x1 || j === bounds.y1 || i === bounds.x2 || j === bounds.y2) {
          room_2d[i][j] = TO_EXIT;
        }
        if (i === 0 || j === 0 || i === 49 || j === 49) {
          room_2d[i][j] = EXIT;
        }
      }
    }
  }

  // near-exit tiles cannot hold walls
  for (let y = 1; y < 49; y++) {
    if (room_2d[0][y - 1] === EXIT) room_2d[1][y] = TO_EXIT;
    if (room_2d[0][y] === EXIT) room_2d[1][y] = TO_EXIT;
    if (room_2d[0][y + 1] === EXIT) room_2d[1][y] = TO_EXIT;
    if (room_2d[49][y - 1] === EXIT) room_2d[48][y] = TO_EXIT;
    if (room_2d[49][y] === EXIT) room_2d[48][y] = TO_EXIT;
    if (room_2d[49][y + 1] === EXIT) room_2d[48][y] = TO_EXIT;
  }
  for (let x = 1; x < 49; x++) {
    if (room_2d[x - 1][0] === EXIT) room_2d[x][1] = TO_EXIT;
    if (room_2d[x][0] === EXIT) room_2d[x][1] = TO_EXIT;
    if (room_2d[x + 1][0] === EXIT) room_2d[x][1] = TO_EXIT;
    if (room_2d[x - 1][49] === EXIT) room_2d[x][48] = TO_EXIT;
    if (room_2d[x][49] === EXIT) room_2d[x][48] = TO_EXIT;
    if (room_2d[x + 1][49] === EXIT) room_2d[x][48] = TO_EXIT;
  }
  return room_2d;
}

interface Edge {
  v: number;
  r: number;
  c: number;
  f: number;
  u?: number;
}

class FlowGraph {
  v: number;
  level: number[];
  edges: Edge[][];

  constructor(n: number) {
    this.v = n;
    this.level = Array(n);
    this.edges = Array(n)
      .fill(0)
      .map(() => []);
  }

  newEdge(u: number, v: number, c: number) {
    this.edges[u].push({ v, r: this.edges[v].length, c, f: 0 });
    this.edges[v].push({ v: u, r: this.edges[u].length - 1, c: 0, f: 0 });
  }

  bfs(s: number, t: number): boolean {
    if (t >= this.v) return false;
    this.level.fill(-1);
    this.level[s] = 0;
    const q: number[] = [s];
    while (q.length) {
      const u = q.shift()!;
      for (const edge of this.edges[u]) {
        if (this.level[edge.v] < 0 && edge.f < edge.c) {
          this.level[edge.v] = this.level[u] + 1;
          q.push(edge.v);
        }
      }
    }
    return this.level[t] >= 0;
  }

  dfsFlow(u: number, f: number, t: number, c: number[]): number {
    if (u === t) return f;
    while (c[u] < this.edges[u].length) {
      const edge = this.edges[u][c[u]];
      if (this.level[edge.v] === this.level[u] + 1 && edge.f < edge.c) {
        const flowToT = this.dfsFlow(edge.v, Math.min(f, edge.c - edge.f), t, c);
        if (flowToT > 0) {
          edge.f += flowToT;
          this.edges[edge.v][edge.r].f -= flowToT;
          return flowToT;
        }
      }
      c[u]++;
    }
    return 0;
  }

  bfsTheCut(s: number): number[] {
    const eInCut: Edge[] = [];
    this.level.fill(-1);
    this.level[s] = 1;
    const q: number[] = [s];
    while (q.length) {
      const u = q.shift()!;
      for (const edge of this.edges[u]) {
        if (edge.f < edge.c) {
          if (this.level[edge.v] < 1) {
            this.level[edge.v] = 1;
            q.push(edge.v);
          }
        }
        if (edge.f === edge.c && edge.c > 0) {
          edge.u = u;
          eInCut.push(edge);
        }
      }
    }
    const minCut: number[] = [];
    for (const e of eInCut) {
      if (this.level[e.v] === -1 && e.u !== undefined) minCut.push(e.u);
    }
    return minCut;
  }

  calcMinCut(s: number, t: number): number {
    if (s === t) return -1;
    let total = 0;
    while (this.bfs(s, t)) {
      const count = Array(this.v + 1).fill(0);
      let flow = 0;
      do {
        flow = this.dfsFlow(s, Number.MAX_VALUE, t, count);
        if (flow > 0) total += flow;
      } while (flow);
    }
    return total;
  }
}

function createGraph(roomName: string, rects: CutRect[], bounds: CutBounds): FlowGraph | null {
  if (bounds.x1 >= bounds.x2 || bounds.y1 >= bounds.y2) return null;
  const room_array = room2d(roomName, bounds);

  for (const r of rects) {
    if (r.x1 >= r.x2 || r.y1 >= r.y2) continue;
    for (let x = r.x1; x <= r.x2; x++) {
      for (let y = r.y1; y <= r.y2; y++) {
        if (x < 0 || x > 49 || y < 0 || y > 49) continue;
        if (x === r.x1 || x === r.x2 || y === r.y1 || y === r.y2) {
          if (room_array[x][y] === NORMAL) room_array[x][y] = PROTECTED;
        } else {
          room_array[x][y] = UNWALKABLE;
        }
      }
    }
  }

  const g = new FlowGraph(2 * 50 * 50 + 2);
  const infini = Number.MAX_VALUE;
  const source = 2 * 50 * 50;
  const sink = 2 * 50 * 50 + 1;

  for (let x = 1; x < 49; x++) {
    for (let y = 1; y < 49; y++) {
      const top = y * 50 + x;
      const bot = top + 2500;
      if (room_array[x][y] === NORMAL) {
        g.newEdge(top, bot, 1);
        for (let i = 0; i < 8; i++) {
          const dx = x + SURR[i][0];
          const dy = y + SURR[i][1];
          if (room_array[dx][dy] === NORMAL || room_array[dx][dy] === TO_EXIT) {
            g.newEdge(bot, dy * 50 + dx, infini);
          }
        }
      } else if (room_array[x][y] === PROTECTED) {
        g.newEdge(source, top, infini);
        g.newEdge(top, bot, 1);
        for (let i = 0; i < 8; i++) {
          const dx = x + SURR[i][0];
          const dy = y + SURR[i][1];
          if (room_array[dx][dy] === NORMAL || room_array[dx][dy] === TO_EXIT) {
            g.newEdge(bot, dy * 50 + dx, infini);
          }
        }
      } else if (room_array[x][y] === TO_EXIT) {
        g.newEdge(top, sink, infini);
      }
    }
  }
  return g;
}

/**
 * Compute min-cut tiles protecting the given rectangles.
 * rects: inclusive bounds of areas to protect (hub / core).
 */
export function getCutTiles(
  roomName: string,
  rects: CutRect[],
  bounds: CutBounds = { x1: 0, y1: 0, x2: 49, y2: 49 },
): CutTile[] {
  if (!rects.length) return [];
  const graph = createGraph(roomName, rects, bounds);
  if (!graph) return [];

  const source = 2 * 50 * 50;
  const sink = 2 * 50 * 50 + 1;
  const count = graph.calcMinCut(source, sink);
  if (count <= 0) return [];

  const cutVerts = graph.bfsTheCut(source);
  const positions: CutTile[] = [];
  const seen = new Set<string>();
  for (const u of cutVerts) {
    const x = u % 50;
    const y = Math.floor(u / 50);
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    if (x < 2 || x > 47 || y < 2 || y > 47) continue;
    seen.add(key);
    positions.push({ x, y });
  }
  return positions;
}

/** Bounding rect around points with padding (clamped). */
export function rectAround(
  points: { x: number; y: number }[],
  pad = 1,
): CutRect | null {
  if (!points.length) return null;
  let minX = 49;
  let minY = 49;
  let maxX = 0;
  let maxY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    x1: Math.max(2, minX - pad),
    y1: Math.max(2, minY - pad),
    x2: Math.min(47, maxX + pad),
    y2: Math.min(47, maxY + pad),
  };
}
