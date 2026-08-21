/**
 * Interior — "am I inside the shell, and how do I stay there?"
 *
 * WHY THIS EXISTS
 * ---------------
 * The bot builds a min-cut shell (utils/PlanV2 shellCut -> basePlan.perimeter)
 * and then happily walks its repairers, erectors and rampart defenders STRAIGHT
 * THROUGH IT. Every interior mover uses a cost matrix that only knows about
 * terrain, roads and structures, so the cheapest route between two points on
 * opposite sides of the base is very often a short hop out through a gate,
 * along the outside of the wall, and back in. In peacetime that is merely
 * silly. With hostiles in the room it is fatal: the creep leaves the ramparts
 * for three tiles, gets focused, and the room loses the very unit that was
 * repairing the wall.
 *
 * So: derive the exterior region ONCE per ~100 ticks with a flood fill from the
 * room edges that treats the planned shell as solid, cache it in the heap (a
 * Uint8Array per room — never in Memory, it is 2500 tiles of derived data), and
 * hand callers three things:
 *
 *   isExteriorTile()   is this tile outside the shell?
 *   interiorMove()     move there without leaving the shell (see the rules
 *                      below); returns false when the geometry is unusable so
 *                      the caller can fall back to its existing mover.
 *   outpostDeferred()  should this repair target be ignored right now because
 *                      it is outside the shell and the room is under attack?
 *
 * THE THREE MOVEMENT RULES
 * ------------------------
 *  1. Under danger, path with the exterior marked unwalkable.
 *  2. Under danger, a creep that is ALREADY OUTSIDE is never stranded: rule 1
 *     would make its own tile a wall and leave it standing in the open. It
 *     paths to the nearest gate (a shell tile it can stand on) with a normal
 *     matrix first, and only then rule 1 applies.
 *  3. In peacetime the interior is a preference, not a law: take the interior
 *     route when the detour is at most 1.5x the direct route, otherwise take
 *     the direct one. A base whose two halves are joined only by a 40-tile
 *     interior corridor should not pay that every trip while nothing is
 *     shooting at it.
 *
 * FAIL-OPEN, ALWAYS. Every entry point returns "not applicable" when the room
 * has no plan, has a shell that does not actually close (partial plan, plan
 * pushed for a different layout), or when no route exists under the mask. The
 * caller then does exactly what it did before this file existed. A creep that
 * cannot move is worse than a creep that moves through the wrong tile.
 */
import { logAlways } from "utils/Logger";

/** how long one flood fill is trusted (ticks) */
const CACHE_TTL = 100;
/** peacetime: take the interior route while it costs at most this much more */
const DETOUR_FACTOR = 1.5;
/** a shell smaller than this is a half-synced plan, not a base */
const MIN_SHELL = 8;

const packOf = (x: number, y: number) => x + y * 50;

type InteriorCache = {
  /** tick the fill ran */
  t: number;
  /** 1 = tile is outside the shell */
  ext: Uint8Array;
  /** chebyshev distance to the nearest exterior (standable) tile; 255 = far */
  depth: Uint8Array;
  /** packed shell tiles (the min-cut ring itself — neither in nor out) */
  shell: number[];
  /** packed shell tiles a creep of mine can stand on = gates home */
  gates: number[];
  /** same, as a mask — "is the gate I picked still a gate?" is a hot question */
  isGate: Uint8Array;
  /** false = geometry unusable, every caller falls back */
  ok: boolean;
  /** interior tile count, for the console report */
  inside: number;
  /** plan hash / shell signature this fill was built from */
  sig: string;
};

/** heap only — 2500 bytes/room of derived data has no business in Memory */
const cache: { [roomName: string]: InteriorCache } = {};
/** per-tick cost matrices, keyed roomName + ":" + mode */
let matrixCache: { [key: string]: CostMatrix } = {};
let matrixTick = -1;

/**
 * The planned shell, most authoritative source first.
 *
 * construction.rampartLocations is LAST and only used as a floor: PlanV2
 * rewrites it to the shell tiles that are still MISSING a rampart, so it
 * shrinks to [] as the wall goes up. Reading it as "the shell" would quietly
 * turn the whole system off in exactly the rooms that finished their wall.
 */
function shellTiles(room: Room): number[] {
  const plan: any = room.memory.planV2;
  if (plan && plan.t && plan.t.shellCut && plan.t.shellCut.length) {
    return plan.t.shellCut.slice();
  }
  const bp: any = room.memory.basePlan;
  if (bp && bp.perimeter && bp.perimeter.length) {
    // v1 min-cut subtracts ramp openings from perimeter. Flooding only the
    // wall tiles leaves those holes open, the hub is marked exterior, and
    // Interior fail-opens forever. Treat ramps as shell too (they get a
    // rampart and are where defenders stand).
    const tiles = bp.perimeter.map((p: any) => packOf(p.x, p.y));
    if (bp.ramps && bp.ramps.length) {
      const seen: { [p: number]: boolean } = {};
      for (const p of tiles) seen[p] = true;
      for (const r of bp.ramps) {
        const pk = packOf(r.x, r.y);
        if (!seen[pk]) {
          seen[pk] = true;
          tiles.push(pk);
        }
      }
    }
    return tiles;
  }
  const def: any = room.memory.defence;
  if (def && def.perimeter && def.perimeter.length) {
    return def.perimeter.map((p: any) => packOf(p.x, p.y));
  }
  const legacy: any = room.memory.construction && room.memory.construction.rampartLocations;
  if (legacy && legacy.length) {
    return legacy.map((p: any) => (p instanceof Array ? packOf(p[0], p[1]) : packOf(p.x, p.y)));
  }
  return [];
}

function hubTile(room: Room): number | undefined {
  const bp: any = room.memory.basePlan;
  if (bp && bp.hub) return packOf(bp.hub.x, bp.hub.y);
  const plan: any = room.memory.planV2;
  if (plan && plan.t && plan.t.storage && plan.t.storage.length) return plan.t.storage[0];
  if (room.storage) return packOf(room.storage.pos.x, room.storage.pos.y);
  return undefined;
}

/**
 * Flood the room from every edge tile with the shell treated as solid.
 * Whatever the flood reaches is OUTSIDE. Shell tiles themselves count as
 * inside — they are where the defenders stand.
 */
function build(room: Room): InteriorCache {
  const dead: InteriorCache = {
    t: Game.time,
    ext: new Uint8Array(2500),
    depth: new Uint8Array(2500),
    shell: [],
    gates: [],
    isGate: new Uint8Array(2500),
    ok: false,
    inside: 0,
    sig: "",
  };
  const shell = shellTiles(room);
  if (shell.length < MIN_SHELL) return dead;
  const hub = hubTile(room);
  if (hub === undefined) return dead;

  const terrain = room.getTerrain();
  const blocked = new Uint8Array(2500);
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) blocked[packOf(x, y)] = 1;
    }
  }
  const isShell = new Uint8Array(2500);
  for (const p of shell) {
    if (p < 0 || p >= 2500) continue;
    isShell[p] = 1;
    blocked[p] = 1;
  }

  const ext = new Uint8Array(2500);
  const queue: number[] = [];
  const seed = (x: number, y: number) => {
    const p = packOf(x, y);
    if (blocked[p] || ext[p]) return;
    ext[p] = 1;
    queue.push(p);
  };
  for (let i = 0; i < 50; i++) {
    seed(i, 0);
    seed(i, 49);
    seed(0, i);
    seed(49, i);
  }
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    const x = p % 50;
    const y = (p - x) / 50;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        const np = packOf(nx, ny);
        if (blocked[np] || ext[np]) continue;
        ext[np] = 1;
        queue.push(np);
      }
    }
  }

  // The cut has to actually cut. If the hub is in the flood the shell has a
  // hole in it (half-synced plan, plan from a different layout) and every
  // "interior" answer below would be a lie — so say nothing at all.
  if (ext[hub]) {
    dead.shell = shell;
    return dead;
  }
  let inside = 0;
  for (let p = 0; p < 2500; p++) if (!ext[p] && !blocked[p]) inside++;
  if (!inside) return dead;

  // Gates: shell tiles a creep of MINE can stand on. A shell tile with a built
  // rampart is the real thing; before the wall exists the planned tiles are
  // plain ground and any of them will do.
  const ramparted: { [p: number]: boolean } = {};
  for (const s of room.find(FIND_MY_STRUCTURES)) {
    if (s.structureType === STRUCTURE_RAMPART) ramparted[packOf(s.pos.x, s.pos.y)] = true;
  }
  const withRampart: number[] = [];
  const anyStandable: number[] = [];
  for (const p of shell) {
    const x = p % 50;
    const y = (p - x) / 50;
    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
    anyStandable.push(p);
    if (ramparted[p]) withRampart.push(p);
  }
  const gates = withRampart.length ? withRampart : anyStandable;
  if (!gates.length) return dead;
  const isGate = new Uint8Array(2500);
  for (const p of gates) isGate[p] = 1;

  /*
   * Depth = chebyshev distance to the nearest EXTERIOR tile. A pure distance
   * transform, deliberately expanding THROUGH terrain walls: Screeps attacks
   * have no line-of-sight, only range, so what matters is how far the tile is
   * from anywhere an enemy can STAND (the ext set is standable by
   * construction). depth >= 4 means no ranged attacker (range 3) can ever
   * touch the tile without first breaching the wall — the planner's own
   * DEPTH_SAFE. This is what rampartIsBuried() reads.
   */
  const depth = new Uint8Array(2500).fill(255);
  const dq: number[] = [];
  for (let p = 0; p < 2500; p++) {
    if (ext[p]) {
      depth[p] = 0;
      dq.push(p);
    }
  }
  for (let head = 0; head < dq.length; head++) {
    const p = dq[head];
    const x = p % 50;
    const y = (p - x) / 50;
    const nd = depth[p] + 1;
    if (nd >= 255) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        const np = packOf(nx, ny);
        if (depth[np] <= nd) continue;
        depth[np] = nd;
        dq.push(np);
      }
    }
  }

  return {
    t: Game.time,
    ext: ext,
    depth: depth,
    shell: shell,
    gates: gates,
    isGate: isGate,
    ok: true,
    inside: inside,
    sig: "",
  };
}

/** planV2.h when adopted; otherwise a cheap perimeter fingerprint. */
function shellSig(room: Room): string {
  const plan: any = room.memory.planV2;
  if (plan && plan.h) return "h:" + plan.h;
  const tiles = shellTiles(room);
  if (!tiles.length) return "empty";
  return tiles.length + ":" + tiles[0] + ":" + tiles[tiles.length - 1];
}

function getCache(room: Room): InteriorCache | null {
  if (!room) return null;
  const sig = shellSig(room);
  const cur = cache[room.name];
  // Failures used to sit in the heap for the full 100t TTL, so a room
  // whose plan had just been adopted / whose wall had just closed stayed
  // fail-open for a long time. Retry misses quickly; successes keep 100t.
  const ttl = cur && cur.ok ? CACHE_TTL : 15;
  if (cur && cur.sig === sig && Game.time - cur.t < ttl) return cur.ok ? cur : null;
  const built = build(room);
  built.sig = sig;
  cache[room.name] = built;
  return built.ok ? built : null;
}

/** true once the room has a shell this module can reason about */
export function interiorReady(room: Room): boolean {
  return !!getCache(room);
}

/** true when this tile is outside the planned shell (false when unknown) */
export function isExteriorTile(room: Room, x: number, y: number): boolean {
  const c = getCache(room);
  if (!c) return false;
  if (x < 0 || x > 49 || y < 0 || y > 49) return true;
  return c.ext[packOf(x, y)] === 1;
}

export function isExteriorPos(room: Room, pos: { x: number; y: number }): boolean {
  return !!pos && isExteriorTile(room, pos.x, pos.y);
}

/** ranged range is 3: anything deeper than this cannot be hit over the wall */
const RAMPART_EXPOSED_DEPTH = 4;

/**
 * Is a rampart at this tile pure upkeep waste?
 *
 * The plan's cover pass wraps source seats/links in rampart "bubbles" priced
 * against a PROVISIONAL wall; the enclosure trades then pull those lobes
 * inside the final wall and nothing re-tests the emitted set. Audit
 * (2026-08-22, both servers): 4 shipped ramparts sit at depth 4-8 behind
 * their own shell — unreachable by any attacker that has not already
 * breached the room — two of them pumped to 13M hits by the RCL8 repair
 * ladder (~260k energy on two tiles that defend nothing).
 *
 * Buried = not exterior, and chebyshev-deeper than ranged reach from every
 * standable exterior tile. Consumers: the placePlanSites plant veto and
 * every rampart-repair spender. FAIL-OPEN: no usable interior geometry (no
 * plan, open shell) => false, so nothing changes in rooms this module
 * cannot reason about.
 */
export function rampartIsBuried(room: Room, pos: { x: number; y: number }): boolean {
  if (!pos || typeof pos.x !== "number") return false;
  const c = getCache(room);
  if (!c) return false;
  const p = packOf(pos.x, pos.y);
  if (c.ext[p]) return false;
  return c.depth[p] >= RAMPART_EXPOSED_DEPTH;
}

/**
 * "Is something shooting at us right now?"
 *
 * room.memory.danger is the bot's own latched flag and it lags both ways, so
 * an armed hostile standing in the room counts too. Unarmed hostiles do not —
 * a scout walking past must not lock every repairer inside the wall.
 */
export function dangerNow(room: Room): boolean {
  if (!room) return false;
  if (room.memory && room.memory.danger) return true;
  const hostiles: Creep[] =
    (room as any).cache && (room as any).cache.hostileCreeps
      ? (room as any).cache.hostileCreeps
      : room.find(FIND_HOSTILE_CREEPS);
  for (const h of hostiles) {
    if (
      h.getActiveBodyparts(ATTACK) > 0 ||
      h.getActiveBodyparts(RANGED_ATTACK) > 0 ||
      h.getActiveBodyparts(HEAL) > 0 ||
      h.getActiveBodyparts(WORK) > 0
    ) {
      return true;
    }
  }
  return false;
}

/** nearest shell tile a creep can stand on — where a stranded creep runs to */
export function nearestGate(room: Room, pos: { x: number; y: number }): RoomPosition | null {
  const c = getCache(room);
  if (!c) return null;
  let best = -1;
  let bestD = 1e9;
  let bestE = 1e9;
  for (const p of c.gates) {
    const x = p % 50;
    const y = (p - x) / 50;
    const dx = x - pos.x;
    const dy = y - pos.y;
    // chebyshev IS the step count, so it decides; euclidean only breaks ties,
    // which it does in favour of the gate straight ahead rather than whichever
    // equidistant one happened to come first out of the shell array
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    const e = dx * dx + dy * dy;
    if (d < bestD || (d === bestD && e < bestE)) {
      bestD = d;
      bestE = e;
      best = p;
    }
  }
  if (best < 0) return null;
  return new RoomPosition(best % 50, Math.floor(best / 50), room.name);
}

/**
 * Repair/build targets outside the shell are outposts: remote road spurs,
 * source containers past the wall, the mineral line. While the room is under
 * attack they are not worth a creep, so every repair role skips them entirely
 * rather than sending someone out of the ramparts to top up a road.
 */
export function outpostDeferred(room: Room, target: any): boolean {
  if (!target) return false;
  const c = getCache(room);
  if (!c) return false;
  if (!dangerNow(room)) return false;
  const pos = target.pos || target;
  if (!pos || typeof pos.x !== "number") return false;
  return c.ext[packOf(pos.x, pos.y)] === 1;
}

/** convenience for the roles: drop every outside target while under attack */
export function filterOutposts<T>(room: Room, targets: T[]): T[] {
  if (!targets || !targets.length) return targets;
  const c = getCache(room);
  if (!c || !dangerNow(room)) return targets;
  const out: T[] = [];
  for (const t of targets) {
    const pos = (t as any).pos || t;
    if (!pos || typeof pos.x !== "number" || c.ext[packOf(pos.x, pos.y)] !== 1) out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// pathing
// ---------------------------------------------------------------------------

/**
 * Base matrix. Deliberately its own and not one of creepFunctions' twelve:
 * creepFunctions.ts is an ambient script and cannot import a module, so the
 * only way to share would be a global — and the matrices there each encode a
 * role's preferences. This one encodes exactly one thing (walkability plus a
 * road preference) so the interior/direct comparison in peacetime measures
 * geometry rather than someone else's weights.
 */
function buildMatrix(room: Room, masked: boolean, c: InteriorCache): CostMatrix {
  const costs = new PathFinder.CostMatrix();
  const terrain = room.getTerrain();
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const t = terrain.get(x, y);
      costs.set(x, y, t === TERRAIN_MASK_WALL ? 255 : t === TERRAIN_MASK_SWAMP ? 10 : 2);
    }
  }
  const structures: AnyStructure[] =
    (room as any).cache && (room as any).cache.structures
      ? (room as any).cache.structures
      : room.find(FIND_STRUCTURES);
  for (const s of structures) {
    if (s.structureType === STRUCTURE_ROAD) {
      if (costs.get(s.pos.x, s.pos.y) !== 255) costs.set(s.pos.x, s.pos.y, 1);
      continue;
    }
    if (s.structureType === STRUCTURE_CONTAINER) continue;
    if (s.structureType === STRUCTURE_RAMPART) {
      // mine is a door, theirs is a wall
      if (!(s as StructureRampart).my) costs.set(s.pos.x, s.pos.y, 255);
      continue;
    }
    if ((OBSTACLE_OBJECT_TYPES as any).indexOf(s.structureType) !== -1) {
      costs.set(s.pos.x, s.pos.y, 255);
    }
  }
  const hostiles: Creep[] =
    (room as any).cache && (room as any).cache.hostileCreeps
      ? (room as any).cache.hostileCreeps
      : room.find(FIND_HOSTILE_CREEPS);
  for (const h of hostiles) {
    costs.set(h.pos.x, h.pos.y, 255);
    // step around a melee hostile rather than into it; ranged auras are left
    // to the role-specific matrices, this one must stay cheap
    if (h.getActiveBodyparts(ATTACK) > 0) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = h.pos.x + dx;
          const ny = h.pos.y + dy;
          if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;
          if (costs.get(nx, ny) < 30) costs.set(nx, ny, 30);
        }
      }
    }
  }
  if (masked) {
    for (let p = 0; p < 2500; p++) {
      if (c.ext[p]) costs.set(p % 50, Math.floor(p / 50), 255);
    }
  }
  return costs;
}

function matrixFor(room: Room, masked: boolean, c: InteriorCache): CostMatrix {
  if (matrixTick !== Game.time) {
    matrixCache = {};
    matrixTick = Game.time;
  }
  const key = room.name + (masked ? ":m" : ":p");
  let m = matrixCache[key];
  if (!m) {
    m = buildMatrix(room, masked, c);
    matrixCache[key] = m;
  }
  return m;
}

function search(
  room: Room,
  from: RoomPosition,
  goal: RoomPosition,
  range: number,
  masked: boolean,
  c: InteriorCache,
): PathFinderPath {
  return PathFinder.search(
    from,
    { pos: goal, range: range },
    {
      maxOps: 1500,
      maxRooms: 1,
      roomCallback: () => matrixFor(room, masked, c),
    },
  );
}

function staysInside(c: InteriorCache, path: RoomPosition[]): boolean {
  for (const p of path) {
    if (c.ext[packOf(p.x, p.y)]) return false;
  }
  return true;
}

/** the cached interior path, if it is still ours and still adjacent */
function cachedPath(creep: Creep, key: string): RoomPosition[] | null {
  const mem: any = creep.memory;
  if (mem._imk !== key) return null;
  // any tick where the creep moved by some OTHER mover invalidates us
  if (mem._imt !== Game.time - 1) return null;
  const path = mem._ip;
  if (!path || !path.length) return null;
  if (Math.abs(creep.pos.x - path[0].x) > 1 || Math.abs(creep.pos.y - path[0].y) > 1) return null;
  return path;
}

/**
 * Danger-aware interior movement.
 *
 * Returns TRUE when it owns the creep's movement this tick (including "already
 * in range" and "fatigued"), FALSE when the caller must use its own mover.
 * Callers are always written as:
 *
 *     if (!interiorMove(creep, target, 3)) creep.MoveCostMatrixRoadPrio(target, 3);
 */
export function interiorMove(creep: Creep, target: any, range: number): boolean {
  if (!creep || !target) return false;
  const room = creep.room;
  const c = getCache(room);
  if (!c) return false;
  const tpos: RoomPosition = target.pos || target;
  if (!tpos || typeof tpos.x !== "number") return false;
  if (tpos.roomName && tpos.roomName !== room.name) return false;

  const mem: any = creep.memory;
  const danger = dangerNow(room);
  const outside = c.ext[packOf(creep.pos.x, creep.pos.y)] === 1;
  // Rule 2 first: already-in-range must not keep an exterior creep under fire
  // standing on the work target. Run for a gate instead.
  if (!(danger && outside) && creep.pos.getRangeTo(tpos.x, tpos.y) <= range) return true;

  let mode = "p";
  let goal = tpos;
  let goalRange = range;
  if (danger && outside) {
    // RULE 2 — never strand a creep already outside. Its own tile is masked
    // off, so the interior matrix would leave it with nowhere legal to go.
    //
    // The chosen gate is COMMITTED to memory rather than re-derived each tick.
    // Re-deriving looks harmless (it is one pass over the shell) but it is
    // not: a diagonal step changes which gate is nearest, which changes the
    // path key, which re-runs PathFinder AND re-logs the rescue — every tick,
    // the whole way home. Pick once, walk there.
    let gp: number | undefined = mem._ig;
    if (gp !== undefined && (!c.isGate[gp] || Game.time - (mem._igt || 0) > 50)) gp = undefined;
    let gate: RoomPosition | null;
    if (gp === undefined) {
      gate = nearestGate(room, creep.pos);
      if (!gate) return false;
      mem._ig = packOf(gate.x, gate.y);
      mem._igt = Game.time;
      logAlways(
        `interior ${room.name}: ${creep.name} (${creep.memory.role}) caught outside the shell at ` +
          `${creep.pos.x},${creep.pos.y} under attack — running for the gate at ${gate.x},${gate.y}`,
      );
    } else {
      gate = new RoomPosition(gp % 50, Math.floor(gp / 50), room.name);
    }
    mode = "g";
    goal = gate;
    goalRange = 0;
  } else {
    if (mem._ig !== undefined) {
      delete mem._ig;
      delete mem._igt;
    }
    if (danger) mode = "d";
  }

  const key = mode + packOf(goal.x, goal.y) + "." + goalRange;
  if (creep.fatigue > 0) {
    // hold the plan but do not let the cache think we stepped.
    // stamping a new key onto the old _ip would replay the previous
    // destination once fatigue drops
    if (mem._imk === key) mem._imt = Game.time;
    return true;
  }

  let path = cachedPath(creep, key);
  if (!path) {
    path = computePath(creep, c, mode, goal, goalRange);
    if (!path || !path.length) return false; // no route under our rules — fall back
    mem._ip = path;
    mem._imk = key;
    // the legacy movers cache under memory.path/MoveTargetId; drop theirs so a
    // fallback next tick re-plans instead of replaying a route we overrode
    mem.path = false;
    mem.MoveTargetId = false;
    const d0 = creep.pos.getDirectionTo(path[0].x, path[0].y);
    if (typeof (creep as any).SwapPositionWithCreep === "function") {
      (creep as any).SwapPositionWithCreep(d0);
    }
  }

  const next = path[0];
  creep.move(creep.pos.getDirectionTo(next.x, next.y));
  mem.moving = true;
  mem._imt = Game.time;
  path.shift();
  mem._ip = path;
  return true;
}

function computePath(
  creep: Creep,
  c: InteriorCache,
  mode: string,
  goal: RoomPosition,
  range: number,
): RoomPosition[] | null {
  const room = creep.room;
  if (mode === "g") {
    // heading home: the exterior must stay walkable or there is no route
    const r = search(room, creep.pos, goal, range, false, c);
    return r.path && r.path.length ? r.path : null;
  }
  if (mode === "d") {
    // RULE 1 — exterior is a wall
    const r = search(room, creep.pos, goal, range, true, c);
    if (r.incomplete || !r.path.length) return null;
    return r.path;
  }
  // RULE 3 — peacetime preference. One search in the common case: if the
  // direct route never leaves the shell there is nothing to compare against.
  const direct = search(room, creep.pos, goal, range, false, c);
  if (direct.incomplete || !direct.path.length) return null;
  if (staysInside(c, direct.path)) return direct.path;
  const inner = search(room, creep.pos, goal, range, true, c);
  if (inner.incomplete || !inner.path.length) return direct.path;
  return inner.path.length <= direct.path.length * DETOUR_FACTOR ? inner.path : direct.path;
}

/** Console: interiorInfo("E11S2") */
(global as any).interiorInfo = function (roomName: string) {
  const room = Game.rooms[roomName];
  if (!room) return `${roomName}: no visibility`;
  const c = getCache(room);
  if (!c) {
    const raw = cache[roomName];
    return (
      `${roomName}: interior UNUSABLE (shell ${raw ? raw.shell.length : 0} tiles — ` +
      `no plan, or the cut does not close around the hub)`
    );
  }
  let outCount = 0;
  for (let p = 0; p < 2500; p++) if (c.ext[p]) outCount++;
  return (
    `${roomName}: shell ${c.shell.length}, gates ${c.gates.length}, inside ${c.inside}, ` +
    `outside ${outCount}, danger ${dangerNow(room)}, age ${Game.time - c.t}t`
  );
};
