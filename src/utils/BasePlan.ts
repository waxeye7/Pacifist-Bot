/**
 * Dynamic base layout planner.
 * Scores a hub, caches stamps + min-cut perimeter in room.memory.basePlan.
 *
 * See docs/DYNAMIC-LAYOUT.md, docs/LAYOUT-MIGRATION.md
 */

import { logAlways } from "utils/Logger";
import { getCutTiles, rectAround } from "utils/MinCut";
import { syncPerimeterToConstructionMemory } from "utils/Perimeter";
import { extensionTake } from "utils/PlanV2";

export interface BasePlanPos {
  x: number;
  y: number;
}

export interface RoomBasePlan {
  /** Plan schema version — bump to force replan */
  version: number;
  roomName: string;
  hub: BasePlanPos;
  /** Planned structure slots by type (build order = array order within type) */
  structures: {
    [structureType: string]: BasePlanPos[];
  };
  /** Min-cut wall tiles (excludes ramp openings) */
  perimeter: BasePlanPos[];
  /** Open rampart openings for RA lines of fire / controlled entry */
  ramps: BasePlanPos[];
  /** How perimeter was computed */
  perimeterMode: "mincut" | "square" | "none";
  /** Prefix of structures.road that is hub→ctrl/sources/spawn + hub ring. */
  arterialN?: number;
  scoredAt: number;
  score: number;
}

const PLAN_VERSION = 7;

/**
 * How far from the hub a planned extension still counts as "inside the base"
 * for the purpose of sizing the defence shell. Everything within this radius
 * has to end up behind the wall, otherwise the shell is a decoration.
 */
const SHELL_FOOTPRINT_R = 6;

/** How far from edges hub must stay (exits + edge clutter). */
const EDGE_MARGIN = 5;
/** Search radius for hub candidates around average of sources+controller. */
const HUB_SEARCH = 8;

function terrainAt(roomName: string, x: number, y: number): number {
  return Game.map.getRoomTerrain(roomName).get(x, y);
}

function isBuildable(roomName: string, x: number, y: number): boolean {
  if (x < 1 || x > 48 || y < 1 || y > 48) return false;
  return terrainAt(roomName, x, y) !== TERRAIN_MASK_WALL;
}

function isOpenHubTile(roomName: string, x: number, y: number): boolean {
  if (x < EDGE_MARGIN || x > 49 - EDGE_MARGIN || y < EDGE_MARGIN || y > 49 - EDGE_MARGIN) {
    return false;
  }
  return isBuildable(roomName, x, y);
}

/** Count buildable tiles in radius (open space score). */
function openSpace(roomName: string, x: number, y: number, r: number): number {
  let n = 0;
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      if (isBuildable(roomName, x + dx, y + dy)) n++;
    }
  }
  return n;
}

function chebyshev(a: BasePlanPos, b: BasePlanPos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** How often one room may complain about its min-cut (heap, ticks). */
const MINCUT_LOG_EVERY = 1000;
const minCutLoggedAt: { [roomName: string]: number } = {};

/**
 * A failed min-cut is a room with NO defence perimeter, and it used to be
 * completely silent — an ignore-everything catch plus an empty-cut path that
 * just fell through to perimeterMode "none". Throttled per room: replan runs
 * often enough that an unthrottled line would be the console.
 */
function noteMinCutFailure(roomName: string, what: string): void {
  const last = minCutLoggedAt[roomName];
  if (last !== undefined && Game.time - last < MINCUT_LOG_EVERY) return;
  minCutLoggedAt[roomName] = Game.time;
  logAlways(
    `basePlan ${roomName}: min-cut perimeter FAILED — ${what}. ` +
      `Plan ships with perimeterMode "none": no defence ring, no RampartDefender anchor, ` +
      `no erector list. (MinCut.getCutTiles also DROPS cut tiles outside x/y 2..47, so a cut ` +
      `that hugs the room edge can come back holed rather than empty.)`,
  );
}

/**
 * Score candidate hub: high open space, close to sources + controller, not on swamp if avoidable.
 */
function scoreHub(
  roomName: string,
  x: number,
  y: number,
  anchors: BasePlanPos[],
): number {
  if (!isOpenHubTile(roomName, x, y)) return -Infinity;

  const space = openSpace(roomName, x, y, 4); // max ~81
  let distSum = 0;
  for (const a of anchors) {
    distSum += Math.abs(a.x - x) + Math.abs(a.y - y);
  }
  const swamp = terrainAt(roomName, x, y) === TERRAIN_MASK_SWAMP ? 25 : 0;
  // prefer space, penalize travel + swamp + being near edge already handled by isOpenHubTile
  return space * 3 - distSum - swamp;
}

function averageAnchor(anchors: BasePlanPos[]): BasePlanPos {
  if (!anchors.length) return { x: 25, y: 25 };
  let sx = 0;
  let sy = 0;
  for (const a of anchors) {
    sx += a.x;
    sy += a.y;
  }
  return { x: Math.round(sx / anchors.length), y: Math.round(sy / anchors.length) };
}

/** Checkerboard-ish extension offsets (same spirit as legacy list, generated). */
function extensionRingOffsets(maxR: number): BasePlanPos[] {
  const out: BasePlanPos[] = [];
  for (let r = 2; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        // skip pure cardinal roads near hub for first ring roads later
        if ((dx + dy) % 2 === 0) out.push({ x: dx, y: dy });
      }
    }
  }
  return out;
}

function placeRelative(
  hub: BasePlanPos,
  roomName: string,
  offsets: BasePlanPos[],
  need: number,
  blocked: Set<string>,
): BasePlanPos[] {
  const placed: BasePlanPos[] = [];
  for (const o of offsets) {
    if (placed.length >= need) break;
    const x = hub.x + o.x;
    const y = hub.y + o.y;
    const key = `${x},${y}`;
    if (blocked.has(key)) continue;
    if (!isBuildable(roomName, x, y)) continue;
    // keep off controller/sources (anchors blocked externally)
    placed.push({ x, y });
    blocked.add(key);
  }
  return placed;
}

/**
 * Build a full plan for the room (does not place construction sites).
 */
export function computeBasePlan(room: Room): RoomBasePlan | null {
  if (!room.controller || !room.controller.my) return null;

  const sources = room.find(FIND_SOURCES);
  const anchors: BasePlanPos[] = sources.map((s) => ({ x: s.pos.x, y: s.pos.y }));
  anchors.push({ x: room.controller.pos.x, y: room.controller.pos.y });

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  // Prefer existing spawn as soft anchor (we won't move it)
  if (spawn) anchors.push({ x: spawn.pos.x, y: spawn.pos.y });

  const center = averageAnchor(anchors);
  let best = { x: center.x, y: center.y, score: -Infinity };

  for (let dx = -HUB_SEARCH; dx <= HUB_SEARCH; dx++) {
    for (let dy = -HUB_SEARCH; dy <= HUB_SEARCH; dy++) {
      const x = center.x + dx;
      const y = center.y + dy;
      const sc = scoreHub(room.name, x, y, anchors);
      if (sc > best.score) best = { x, y, score: sc };
    }
  }

  // If spawn already exists far from best hub, bias hub toward spawn so we don't fight reality
  if (spawn) {
    const d = chebyshev(best, { x: spawn.pos.x, y: spawn.pos.y });
    if (d > 6) {
      // re-score near spawn
      let localBest = { x: spawn.pos.x, y: spawn.pos.y - 2, score: -Infinity };
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
          const x = spawn.pos.x + dx;
          const y = spawn.pos.y + dy;
          const sc = scoreHub(room.name, x, y, anchors) + 10; // bias keep near spawn
          if (sc > localBest.score) localBest = { x, y, score: sc };
        }
      }
      best = localBest;
    }
  }

  const hub: BasePlanPos = { x: best.x, y: best.y };
  const blocked = new Set<string>();
  blocked.add(`${hub.x},${hub.y}`);
  for (const a of anchors) blocked.add(`${a.x},${a.y}`);
  if (spawn) blocked.add(`${spawn.pos.x},${spawn.pos.y}`);

  // Core stamps relative to hub (compact diamond)
  // storage = hub, terminal N, towers SE/SW/NE..., links later
  const structures: RoomBasePlan["structures"] = {};

  structures[STRUCTURE_STORAGE] = [{ x: hub.x, y: hub.y }];
  blocked.add(`${hub.x},${hub.y}`);

  // Early hub container same tile as future storage (RCL2–3)
  structures[STRUCTURE_CONTAINER] = [{ x: hub.x, y: hub.y }];
  // Source seats after hub, nearest-to-hub first. Not sited at RCL2
  // (placeFromBasePlan prefix). Both go down at RCL3.
  const sourceSeats: BasePlanPos[] = [];
  for (const s of sources) {
    let best: BasePlanPos | null = null;
    let bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const x = s.pos.x + dx;
        const y = s.pos.y + dy;
        if (!isBuildable(room.name, x, y)) continue;
        const key = `${x},${y}`;
        if (blocked.has(key)) continue;
        const d = chebyshev(hub, { x, y });
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    if (best) {
      sourceSeats.push(best);
      blocked.add(`${best.x},${best.y}`);
    }
  }
  sourceSeats.sort((a, b) => chebyshev(hub, a) - chebyshev(hub, b));
  for (const p of sourceSeats) structures[STRUCTURE_CONTAINER].push(p);

  // Terminal: prefer north of storage
  const terminalCandidates: BasePlanPos[] = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
  ];
  structures[STRUCTURE_TERMINAL] = placeRelative(hub, room.name, terminalCandidates, 1, blocked);

  // Towers: ring around hub
  const towerOffsets: BasePlanPos[] = [
    { x: 2, y: 0 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
    { x: 0, y: -2 },
    { x: 2, y: 2 },
    { x: -2, y: -2 },
  ];
  structures[STRUCTURE_TOWER] = placeRelative(hub, room.name, towerOffsets, 6, blocked);

  // Spawn #2 / #3 slots (don't move spawn #1)
  const spawnOffsets: BasePlanPos[] = [
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ];
  structures[STRUCTURE_SPAWN] = placeRelative(hub, room.name, spawnOffsets, 2, blocked);

  // Extensions: up to 60 slots planned
  const extOff = extensionRingOffsets(8);
  structures[STRUCTURE_EXTENSION] = placeRelative(hub, room.name, extOff, 60, blocked);

  // --- Perimeter: min-cut around core ---
  let fullCut: BasePlanPos[] = [];
  let perimeterMode: RoomBasePlan["perimeterMode"] = "none";

  // The shell has to enclose the BASE, not just the core stamp. Sizing the
  // min-cut rect off storage/terminal/spawn/tower alone produced a ~7x6
  // bounding box which, padded by 2, min-cuts straight back to its own
  // boundary in open terrain — the "small rounded box" that leaves the
  // controller, a source and two thirds of the planned extensions OUTSIDE the
  // wall. Take the real footprint instead: core stamps + the extension field
  // within SHELL_FOOTPRINT_R + the controller + any source close enough to be
  // worth defending.
  const corePoints: BasePlanPos[] = [hub];
  if (spawn) corePoints.push({ x: spawn.pos.x, y: spawn.pos.y });
  for (const st of [STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_SPAWN, STRUCTURE_TOWER]) {
    for (const p of structures[st] || []) corePoints.push(p);
  }
  if (room.storage) corePoints.push({ x: room.storage.pos.x, y: room.storage.pos.y });

  for (const p of structures[STRUCTURE_EXTENSION] || []) {
    if (chebyshev(p, hub) <= SHELL_FOOTPRINT_R) corePoints.push(p);
  }
  const controllerPos = { x: room.controller.pos.x, y: room.controller.pos.y };
  if (chebyshev(controllerPos, hub) <= SHELL_FOOTPRINT_R + 3) corePoints.push(controllerPos);
  for (const s of sources) {
    const sp = { x: s.pos.x, y: s.pos.y };
    if (chebyshev(sp, hub) <= SHELL_FOOTPRINT_R + 3) corePoints.push(sp);
  }

  const rect = rectAround(corePoints, 2);
  if (rect && rect.x2 - rect.x1 >= 2 && rect.y2 - rect.y1 >= 2) {
    try {
      const cut = getCutTiles(room.name, [rect]);
      if (cut.length > 0) {
        fullCut = cut;
        perimeterMode = "mincut";
      } else {
        // An EMPTY cut is not "no wall needed", it is a failed cut. The plan
        // ships with perimeterMode "none" and the room silently has no defence
        // ring — no perimeter for the towers, no RampartDefender anchor, no
        // erector list. Say so.
        noteMinCutFailure(
          room.name,
          `getCutTiles returned 0 tiles for rect ${rect.x1},${rect.y1}-${rect.x2},${rect.y2}`,
        );
      }
    } catch (e: any) {
      // Was `catch { /* ignore */ }`, which left nothing behind but
      // perimeterMode "none". dfsFlow is iterative now (it used to recurse up
      // to ~1.8k frames deep), so this is a last-resort net, not the expected
      // path - but a failure here must still be visible.
      noteMinCutFailure(room.name, `getCutTiles threw: ${(e && e.message) || e}`);
    }
  }

  // Ramps: 2 openings on perimeter (angular spread) + adjacent tiles for RA fire lanes
  const ramps = pickRamps(fullCut, hub, 2);
  const rampSet = new Set(ramps.map((r) => `${r.x},${r.y}`));
  const perimeter = fullCut.filter((p) => !rampSet.has(`${p.x},${p.y}`));

  // Roads: hub ring + every perimeter/ramp tile + paths hub→ramp
  const roadSet = new Set<string>();
  const roads: BasePlanPos[] = [];
  const addRoad = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (roadSet.has(k) || !isBuildable(room.name, x, y)) return;
    roadSet.add(k);
    roads.push({ x, y });
  };
  // Haul lines first (hub→ctrl/sources/spawn), then the hub ring.
  // path[0] is the hub / future storage — do not pave that tile.
  // The last step is the source/controller/spawn tile itself.
  const arterials: BasePlanPos[] = [];
  arterials.push({ x: room.controller.pos.x, y: room.controller.pos.y });
  for (const s of sources) arterials.push({ x: s.pos.x, y: s.pos.y });
  if (spawn) arterials.push({ x: spawn.pos.x, y: spawn.pos.y });
  for (const target of arterials) {
    const path = greedyPath(room.name, hub, target);
    for (let i = 1; i < path.length - 1; i++) addRoad(path[i].x, path[i].y);
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      addRoad(hub.x + dx, hub.y + dy);
    }
  }
  const arterialN = roads.length;

  // ...then the shell service roads (ramp lanes, then the wall walk itself).
  for (const r of ramps) {
    const path = greedyPath(room.name, hub, r);
    for (const p of path) addRoad(p.x, p.y);
  }
  for (const p of fullCut) addRoad(p.x, p.y);
  structures[STRUCTURE_ROAD] = roads;

  return {
    version: PLAN_VERSION,
    roomName: room.name,
    hub,
    structures,
    perimeter,
    ramps,
    perimeterMode,
    arterialN,
    scoredAt: Game.time,
    score: best.score,
  };
}

/** Angular ramps on perimeter for RA fire + controlled entry */
function pickRamps(perimeter: BasePlanPos[], hub: BasePlanPos, count: number): BasePlanPos[] {
  if (!perimeter.length) return [];
  const scored = perimeter.map((t) => ({
    t,
    ang: Math.atan2(t.y - hub.y, t.x - hub.x),
    dist: Math.abs(t.x - hub.x) + Math.abs(t.y - hub.y),
  }));
  const ramps: BasePlanPos[] = [];
  const step = (2 * Math.PI) / count;
  for (let i = 0; i < count; i++) {
    const target = -Math.PI + step * i + step / 2;
    let best: BasePlanPos | null = null;
    let bestScore = 99;
    for (const s of scored) {
      let d = Math.abs(s.ang - target);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const sc = d - s.dist * 0.02;
      if (sc < bestScore) {
        bestScore = sc;
        best = s.t;
      }
    }
    if (best && !ramps.some((r) => r.x === best!.x && r.y === best!.y)) ramps.push(best);
  }
  // open adjacent perimeter tiles for a wider ramp lane
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

/** 8-dir BFS. walkLine died at the first wall (E12S3 29,23 → 28,24). */
function walkLine(roomName: string, from: BasePlanPos, to: BasePlanPos): BasePlanPos[] {
  const key = (x: number, y: number) => (x << 6) | y;
  const start = key(from.x, from.y);
  const goal = key(to.x, to.y);
  const came = new Map<number, number>();
  const q: number[] = [start];
  came.set(start, start);
  let qi = 0;
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  while (qi < q.length && qi < 2500) {
    const cur = q[qi++];
    if (cur === goal) {
      const path: BasePlanPos[] = [];
      let k = goal;
      while (true) {
        path.push({ x: k >> 6, y: k & 63 });
        const prev = came.get(k);
        if (prev === undefined || prev === k) break;
        k = prev;
      }
      return path.reverse();
    }
    const x = cur >> 6;
    const y = cur & 63;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isBuildable(roomName, nx, ny) && key(nx, ny) !== goal) continue;
      const nk = key(nx, ny);
      if (came.has(nk)) continue;
      came.set(nk, cur);
      q.push(nk);
    }
  }
  return [];
}

function greedyPath(roomName: string, from: BasePlanPos, to: BasePlanPos): BasePlanPos[] {
  const key = (x: number, y: number) => `${x},${y}`;
  type N = { x: number; y: number; g: number; f: number; parent: N | null };
  const open: N[] = [{ x: from.x, y: from.y, g: 0, f: 0, parent: null }];
  open[0].f = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  const closed = new Set<string>();
  let guard = 0;
  while (open.length && guard++ < 2500) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.x === to.x && cur.y === to.y) {
      const path: BasePlanPos[] = [];
      let p: N | null = cur;
      while (p) {
        path.push({ x: p.x, y: p.y });
        p = p.parent;
      }
      return path.reverse();
    }
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!isBuildable(roomName, nx, ny)) continue;
      const g = cur.g + 1;
      open.push({
        x: nx,
        y: ny,
        g,
        f: g + Math.max(Math.abs(nx - to.x), Math.abs(ny - to.y)),
        parent: cur,
      });
    }
  }
  return [];
}

/**
 * Live haul tiles: hub→controller, hub→sources, hub→spawn. No hub ring
 * (that ate the 8-site cap). Skip hub and destination.
 */
export function haulRoadTiles(room: Room, plan?: RoomBasePlan | null): BasePlanPos[] {
  const p = plan || (room.memory.basePlan as RoomBasePlan) || null;
  if (!p || !p.hub || !room.controller) return [];
  const hub = p.hub;
  const out: BasePlanPos[] = [];
  const seen = new Set<string>();
  const add = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (seen.has(k) || !isBuildable(room.name, x, y)) return;
    if (x === hub.x && y === hub.y) return;
    seen.add(k);
    out.push({ x, y });
  };
  const targets: BasePlanPos[] = [
    { x: room.controller.pos.x, y: room.controller.pos.y },
  ];
  for (const s of room.find(FIND_SOURCES)) targets.push({ x: s.pos.x, y: s.pos.y });
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (spawn) targets.push({ x: spawn.pos.x, y: spawn.pos.y });
  for (const t of targets) {
    // Straight Chebyshev walk — A* was returning [hub, dest] on live
    // race rooms, so arterialN collapsed to the 8-tile hub ring.
    const path = walkLine(room.name, hub, t);
    for (let i = 1; i < path.length - 1; i++) add(path[i].x, path[i].y);
  }
  // No hub ring here. Cycle-17 filled the 8-site cap with the ring and
  // never reached the controller line. Ring waits for RCL4.
  return out;
}

/** True while any haul tile is still missing a standing road. */
export function haulRoadsIncomplete(room: Room, plan?: RoomBasePlan | null): boolean {
  const tiles = haulRoadTiles(room, plan);
  if (!tiles.length) return false;
  const standing = new Set<string>();
  for (const s of room.find(FIND_STRUCTURES, { filter: (x) => x.structureType === STRUCTURE_ROAD })) {
    standing.add(`${s.pos.x},${s.pos.y}`);
  }
  for (const t of tiles) {
    if (!standing.has(`${t.x},${t.y}`)) return true;
  }
  return false;
}

/** Get or recompute plan. Replans if version mismatch or force. */
export function getBasePlan(room: Room, force = false): RoomBasePlan | null {
  // v2-planned rooms: room.memory.basePlan is a MIRROR of the adopted plan
  // (hub / perimeter / leash, written by utils/PlanV2.syncPlanV2Memory). It
  // carries no `version`, so an un-guarded call here would replan the v1
  // dynamic layout straight over the defence perimeter and the
  // RampartDefender anchor. Use dropPlan(room) first if you want v1 back.
  if (room.memory.planV2 && !force) {
    return (room.memory.basePlan as RoomBasePlan) || null;
  }
  if (!room.memory.basePlan || force || room.memory.basePlan.version !== PLAN_VERSION) {
    const plan = computeBasePlan(room);
    if (plan) {
      room.memory.basePlan = plan;
      // v1 rooms only. The legacy writer publishes the WHOLE ring, while the
      // contract for construction.rampartLocations is "tiles still missing a
      // rampart"; on a planV2 room that resets the room to "shell unfinished"
      // until the next PlanV2 sync. Belt and braces — the helper also guards
      // itself (utils/Perimeter).
      if (!room.memory.planV2) syncPerimeterToConstructionMemory(room);
    }
  }
  return (room.memory.basePlan as RoomBasePlan) || null;
}

/** How many of this structure type we are allowed at this RCL (CONTROLLER_STRUCTURES). */
export function maxStructuresAtRcl(structureType: BuildableStructureConstant, rcl: number): number {
  const table = CONTROLLER_STRUCTURES[structureType];
  if (!table) return 0;
  return table[rcl] || 0;
}

/**
 * Ensure construction sites for planned structures up to RCL caps.
 * Returns number of new sites created this call.
 */
export function placeFromBasePlan(room: Room, maxSites = 5): number {
  const plan = getBasePlan(room);
  if (!plan || !room.controller || !room.controller.my) return 0;

  const rcl = room.controller.level;
  let existingSites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
  if (existingSites >= 10) return 0;

  let created = 0;
  const slam5 = room.energyCapacityAvailable >= 550;
  // Dest-20 no-pave RCL3 +2880. Restore haul-pave for dest-21 + empire
  // (L3+slam-5, 8 sites, haul tiles only). Do not push-pacifist while 20 watches.
  const paveNow = rcl === 3 && slam5;
  const order: BuildableStructureConstant[] = paveNow
    ? [
        STRUCTURE_STORAGE,
        STRUCTURE_EXTENSION,
        STRUCTURE_TOWER,
        STRUCTURE_SPAWN,
        STRUCTURE_ROAD,
        STRUCTURE_CONTAINER,
        STRUCTURE_TERMINAL,
        STRUCTURE_RAMPART,
      ]
    : [
        STRUCTURE_STORAGE,
        STRUCTURE_CONTAINER,
        STRUCTURE_EXTENSION,
        STRUCTURE_TOWER,
        STRUCTURE_SPAWN,
        STRUCTURE_TERMINAL,
        STRUCTURE_RAMPART,
        STRUCTURE_ROAD,
      ];

  for (const st of order) {
    if (created >= maxSites || existingSites + created >= 10) break;

    // RCL gates
    if (st === STRUCTURE_STORAGE && rcl < 4) continue;
    if (st === STRUCTURE_CONTAINER && rcl >= 4) continue; // storage replaces hub container
    if (st === STRUCTURE_CONTAINER && rcl < 2) continue;
    if (st === STRUCTURE_TOWER && rcl < 3) continue;
    if (st === STRUCTURE_TERMINAL && rcl < 6) continue;
    if (st === STRUCTURE_SPAWN && rcl < 7) continue; // extra spawns only
    // No RCL2 roads (c17 SEND BACK). RCL3 haul after slam-5 only.
    if (st === STRUCTURE_ROAD && rcl < 3) continue;
    if (st === STRUCTURE_ROAD && rcl === 3 && !slam5) continue;
    // Ramparts from RCL4, matching the v2 planner's own wall gate
    // (utils/PlanV2 wantsAtRcl: `if (type === "rampart") return lvl >= 4`).
    // At RCL3 a shell is pure waste: no storage to pay for it, safe mode is
    // available, and RAMPART_DECAY (300 hits / 100 ticks) outruns anything a
    // pre-storage room can repair — the room builds a wall and watches it rot.
    if (st === STRUCTURE_RAMPART && rcl < 4) continue;

    let maxAllowed =
      st === STRUCTURE_RAMPART ? 2500 : maxStructuresAtRcl(st, rcl);
    // Race rooms often have no planV2, so this legacy path is the one that
    // actually sites extensions. Honor leftover-5 (hold at 5 through RCL3).
    if (st === STRUCTURE_EXTENSION) {
      maxAllowed = extensionTake(rcl, maxAllowed, room);
    }
    if (maxAllowed <= 0) continue;

    const have =
      room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === st }).length +
      room.find(FIND_MY_CONSTRUCTION_SITES, { filter: (s) => s.structureType === st }).length;

    // Spawn: don't count planned extras against spawn#1 already placed off-plan
    let remaining = maxAllowed - have;
    if (remaining <= 0) continue;

    let slots =
      st === STRUCTURE_RAMPART ? plan.perimeter || [] : plan.structures[st] || [];

    if (st === STRUCTURE_CONTAINER && slots.length) {
      // [0] hub. Rest = source seats, already nearest-first.
      // RCL2: hub only (cycle-10). RCL3: hub + both sources.
      const srcN = Math.max(0, slots.length - 1);
      const takeSrc = rcl < 3 ? 0 : srcN;
      slots = [slots[0]].concat(slots.slice(1, 1 + takeSrc));
    }

    // A road ON the wall only pays off once the wall exists (it is the shell
    // patrol/repair lane). Before the shell RCL those tiles sit on the far edge
    // of the base and are pure builder overhead, so drop them from the slot
    // list rather than let them crowd out the arterials.
    if (st === STRUCTURE_ROAD && rcl <= 3) {
      const haul = haulRoadTiles(room, plan);
      const n = plan.arterialN || 0;
      slots = haul.length ? haul : n > 0 ? slots.slice(0, n) : [];
      const liveRoadSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: (s) => s.structureType === STRUCTURE_ROAD,
      }).length;
      remaining = Math.min(remaining, Math.max(0, 8 - liveRoadSites));
    } else if (st === STRUCTURE_ROAD && rcl < 4) {
      const shell = new Set<string>();
      for (const t of plan.perimeter || []) shell.add(`${t.x},${t.y}`);
      for (const t of plan.ramps || []) shell.add(`${t.x},${t.y}`);
      if (shell.size) slots = slots.filter((s) => !shell.has(`${s.x},${s.y}`));
    }
    for (const slot of slots) {
      if (remaining <= 0 || created >= maxSites) break;
      if (!isBuildable(room.name, slot.x, slot.y)) continue;

      // Skip if structure or site already there
      const pos = new RoomPosition(slot.x, slot.y, room.name);
      const structs = pos.lookFor(LOOK_STRUCTURES);
      if (structs.some((s) => s.structureType === st || s.structureType === STRUCTURE_WALL)) continue;
      // Don't build over spawn/storage/controller accidentally
      if (
        structs.some(
          (s) =>
            s.structureType === STRUCTURE_SPAWN ||
            s.structureType === STRUCTURE_STORAGE ||
            s.structureType === STRUCTURE_CONTROLLER ||
            s.structureType === STRUCTURE_TERMINAL ||
            s.structureType === STRUCTURE_LINK,
        ) &&
        st !== STRUCTURE_ROAD &&
        st !== STRUCTURE_RAMPART
      ) {
        continue;
      }
      if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length) continue;

      // Storage slot: destroy container when placing storage
      if (st === STRUCTURE_STORAGE) {
        for (const s of structs) {
          if (s.structureType === STRUCTURE_CONTAINER) s.destroy();
        }
      }

      const res = room.createConstructionSite(slot.x, slot.y, st);
      if (res === OK) {
        created++;
        remaining--;
      }
    }
  }

  return created;
}

/** Console/debug: force replan */
export function replanRoom(roomName: string): string {
  const room = Game.rooms[roomName];
  if (!room) return `no vision ${roomName}`;
  delete room.memory.basePlan;
  const plan = getBasePlan(room, true);
  if (!plan) return `failed plan ${roomName}`;
  return (
    `planned ${roomName} hub=${plan.hub.x},${plan.hub.y} score=${plan.score.toFixed(1)}` +
    ` ext=${(plan.structures[STRUCTURE_EXTENSION] || []).length}` +
    ` walls=${plan.perimeter.length} ramps=${(plan.ramps || []).length} (${plan.perimeterMode})`
  );
}

/** RoomVisual overlay: hub + perimeter (no placement). */
export function visualizeBasePlan(room: Room): void {
  const plan = getBasePlan(room);
  if (!plan) return;
  const vis = new RoomVisual(room.name);
  vis.circle(plan.hub.x, plan.hub.y, {
    radius: 0.55,
    fill: "transparent",
    stroke: "#00ff88",
    strokeWidth: 0.15,
  });
  vis.text("HUB", plan.hub.x, plan.hub.y - 0.6, { font: 0.4, color: "#00ff88" });
  for (const t of plan.perimeter) {
    vis.rect(t.x - 0.45, t.y - 0.45, 0.9, 0.9, {
      fill: "transparent",
      stroke: "#ff4444",
      strokeWidth: 0.08,
      opacity: 0.85,
    });
  }
  for (const t of plan.ramps || []) {
    vis.rect(t.x - 0.45, t.y - 0.45, 0.9, 0.9, {
      fill: "#4488ff",
      opacity: 0.45,
      stroke: "#88aaff",
      strokeWidth: 0.08,
    });
  }
  vis.text(
    `${plan.perimeterMode} walls=${plan.perimeter.length} ramps=${(plan.ramps || []).length}`,
    1,
    1,
    { align: "left", font: 0.5, color: "#ffffff" },
  );
}
