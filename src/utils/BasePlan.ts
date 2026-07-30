/**
 * Dynamic base layout planner.
 * Scores a hub, caches stamps in room.memory.basePlan, construction places sites from that.
 *
 * See docs/DYNAMIC-LAYOUT.md
 */

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
  scoredAt: number;
  score: number;
}

const PLAN_VERSION = 1;

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

  // Roads: adjacent to hub (filler ring)
  const roadRing: BasePlanPos[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = hub.x + dx;
      const y = hub.y + dy;
      if (isBuildable(room.name, x, y) && !blocked.has(`${x},${y}`)) {
        roadRing.push({ x, y });
      }
    }
  }
  structures[STRUCTURE_ROAD] = roadRing;

  return {
    version: PLAN_VERSION,
    roomName: room.name,
    hub,
    structures,
    scoredAt: Game.time,
    score: best.score,
  };
}

/** Get or recompute plan. Replans if version mismatch or force. */
export function getBasePlan(room: Room, force = false): RoomBasePlan | null {
  if (!room.memory.basePlan || force || room.memory.basePlan.version !== PLAN_VERSION) {
    const plan = computeBasePlan(room);
    if (plan) room.memory.basePlan = plan;
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
  // Build priority: storage/container core, extensions, tower, terminal, extra spawns, roads
  const order: BuildableStructureConstant[] = [
    STRUCTURE_STORAGE,
    STRUCTURE_CONTAINER,
    STRUCTURE_EXTENSION,
    STRUCTURE_TOWER,
    STRUCTURE_SPAWN,
    STRUCTURE_TERMINAL,
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
    if (st === STRUCTURE_ROAD && rcl < 3) continue;

    const maxAllowed = maxStructuresAtRcl(st, rcl);
    if (maxAllowed <= 0) continue;

    const have =
      room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === st }).length +
      room.find(FIND_MY_CONSTRUCTION_SITES, { filter: (s) => s.structureType === st }).length;

    // Spawn: don't count planned extras against spawn#1 already placed off-plan
    let remaining = maxAllowed - have;
    if (remaining <= 0) continue;

    const slots = plan.structures[st] || [];
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
  return `planned ${roomName} hub=${plan.hub.x},${plan.hub.y} score=${plan.score.toFixed(1)} ext=${(plan.structures[STRUCTURE_EXTENSION] || []).length}`;
}
