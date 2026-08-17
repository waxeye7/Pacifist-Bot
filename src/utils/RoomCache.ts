/**
 * Per-tick room finds. Call RoomCache.tick() once at start of loop.
 * Usage: room.cache.sources, room.cache.myStructures, etc.
 */

export interface RoomTickCache {
  tick: number;
  sources?: Source[];
  minerals?: Mineral[];
  myCreeps?: Creep[];
  hostileCreeps?: Creep[];
  structures?: AnyStructure[];
  myStructures?: AnyStructure[];
  constructionSites?: ConstructionSite[];
  droppedResources?: Resource[];
  ruins?: Ruin[];
  tombstones?: Tombstone[];
  /** Cost matrices rebuilt at most once per tick per kind */
  costMatrices: { [key: string]: CostMatrix };
  /**
   * Derived per-room-per-tick answers (see `cachedDerived`). Anything a creep
   * helper recomputes from the finds above and that does NOT depend on which
   * creep is asking — hungry-extension lists, "where is the hub", and so on.
   */
  derived?: { [key: string]: any };
}

declare global {
  interface Room {
    cache: RoomTickCache;
  }
}

export const RoomCache = {
  tick(): void {
    const t = Game.time;
    for (const name in Game.rooms) {
      const room = Game.rooms[name];
      // Fresh object each tick so nothing leaks between ticks
      room.cache = {
        tick: t,
        costMatrices: {},
      };
    }
  },
};

/**
 * The cache for this room IF tick() has already run for this tick, else null.
 *
 * Deliberately does NOT create one: main.ts only calls tick() when the
 * `roomCache` bench option is on, and silently caching anyway would make the
 * A/B measurement of that option meaningless. No cache => plain find.
 */
function fresh(room: Room): RoomTickCache | null {
  if (!room || !room.cache || room.cache.tick !== Game.time) return null;
  return room.cache;
}

export function cachedSources(room: Room): Source[] {
  const c = fresh(room);
  if (!c) return room.find(FIND_SOURCES);
  if (!c.sources) c.sources = room.find(FIND_SOURCES);
  return c.sources;
}

export function cachedMyStructures(room: Room): AnyStructure[] {
  const c = fresh(room);
  if (!c) return room.find(FIND_MY_STRUCTURES);
  if (!c.myStructures) c.myStructures = room.find(FIND_MY_STRUCTURES);
  return c.myStructures;
}

export function cachedStructures(room: Room): AnyStructure[] {
  const c = fresh(room);
  if (!c) return room.find(FIND_STRUCTURES);
  if (!c.structures) c.structures = room.find(FIND_STRUCTURES);
  return c.structures;
}

export function cachedHostileCreeps(room: Room): Creep[] {
  const c = fresh(room);
  if (!c) return room.find(FIND_HOSTILE_CREEPS);
  if (!c.hostileCreeps) c.hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
  return c.hostileCreeps;
}

export function cachedMyCreeps(room: Room): Creep[] {
  const c = fresh(room);
  if (!c) return room.find(FIND_MY_CREEPS);
  if (!c.myCreeps) c.myCreeps = room.find(FIND_MY_CREEPS);
  return c.myCreeps;
}

export function cachedSites(room: Room): ConstructionSite[] {
  const c = fresh(room);
  if (!c) return room.find(FIND_MY_CONSTRUCTION_SITES);
  if (!c.constructionSites) c.constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
  return c.constructionSites;
}

export function cachedDropped(room: Room): Resource[] {
  const c = fresh(room);
  if (!c) return room.find(FIND_DROPPED_RESOURCES);
  if (!c.droppedResources) c.droppedResources = room.find(FIND_DROPPED_RESOURCES);
  return c.droppedResources;
}

export function cachedRuins(room: Room): Ruin[] {
  const c = fresh(room);
  if (!c) return room.find(FIND_RUINS);
  if (!c.ruins) c.ruins = room.find(FIND_RUINS);
  return c.ruins;
}

export function cachedTombstones(room: Room): Tombstone[] {
  const c = fresh(room);
  if (!c) return room.find(FIND_TOMBSTONES);
  if (!c.tombstones) c.tombstones = room.find(FIND_TOMBSTONES);
  return c.tombstones;
}

/**
 * Memoise one DERIVED answer per room per tick.
 *
 * The finds above are the raw material; almost every per-creep helper then
 * re-derives the same short list out of them ("extensions with free capacity",
 * "which structure is the storage") once per creep per tick. Nothing in a
 * Screeps tick can change the inputs — stores only settle between ticks, and
 * structures cannot move — so the derived answer is a room/tick constant too.
 *
 * `build` may legitimately return undefined (no hub container in this room);
 * presence is tested with `in`, not truthiness, so a negative answer is cached
 * exactly once rather than rebuilt by every caller after it.
 *
 * Same escape hatch as everything else here: no tick() this tick (the
 * `roomCache` bench option is off) means no memo, so the A/B still measures.
 */
export function cachedDerived<T>(room: Room, key: string, build: () => T): T {
  const c = fresh(room);
  if (!c) return build();
  const d = c.derived || (c.derived = {});
  if (key in d) return d[key] as T;
  const v = build();
  d[key] = v;
  return v;
}

/**
 * Store / reuse a CostMatrix for this room this tick (movement).
 *
 * Nothing in the codebase mutates a matrix handed to PathFinder, and creep /
 * structure positions cannot change mid-tick, so every caller of a given key
 * can share one instance. Builders that overlay per-CALLER data (see
 * roomCallbackRoadPrio's role overlay) must clone() what they get back.
 */
export function getCachedCostMatrix(roomName: string, key: string, build: () => CostMatrix | false): CostMatrix | false {
  const room = Game.rooms[roomName];
  if (!room) return build();
  const c = fresh(room);
  // same escape hatch roomCallbackRoadPrio uses, so the A/B still measures it
  if (!c || (Memory.bench && Memory.bench.opts && Memory.bench.opts.matrixCache === false)) {
    return build();
  }
  if (c.costMatrices[key]) return c.costMatrices[key];
  const m = build();
  if (m) c.costMatrices[key] = m;
  return m;
}

/* ------------------------------------------------------------------ */
/* Terrain base matrices — cached ACROSS ticks                         */
/* ------------------------------------------------------------------ */

/**
 * A CostMatrix pre-filled from terrain alone, cached on the heap FOREVER.
 *
 * Every cost-matrix builder in Functions/creepFunctions.ts opens with the same
 * 50x50 loop — `terrain.get(x, y)` then `costs.set(x, y, weight)` — which is
 * 5000 engine calls before a single structure has been considered. There are
 * seven such builders, differing only in the (wall, swamp, plain) weights they
 * use, and `getCachedCostMatrix` only memoises the finished product for the
 * CURRENT TICK. So the loop runs again for every key, in every room, every
 * tick a creep repaths.
 *
 * Room terrain is immutable for the life of a shard. Nothing about it needs to
 * be recomputed, ever — not per tick, not per global. So build it once per
 * (room, weights) pair, keep it on the heap, and hand out `clone()`s: a native
 * typed-array copy instead of 5000 interpreted calls. Callers get a private
 * matrix exactly as before and may overlay structures and creeps freely.
 *
 * This matters most for the creeps that are ALONE in a room — a scout, a lone
 * remote hauler — because they cannot share the per-tick cache with anyone.
 * Live shard3 measured scouts at 1.61 CPU/tick for two single-MOVE creeps
 * (0.8 each), against 3.46 for twelve EnergyMiners.
 *
 * The cap exists only so a bot roaming thousands of rooms cannot grow this
 * without bound. Terrain caches are never invalidated individually because
 * they can never go stale; when the cap is hit the whole table is dropped and
 * refills naturally.
 */
const terrainBases: { [key: string]: CostMatrix } = Object.create(null);
let terrainBaseCount = 0;
const TERRAIN_BASE_CAP = 400;

/**
 * `edge` selects which tiles get a weight:
 *   "all"   — 0..49, the whole grid (the original `for y = 0; y <= 49` loops)
 *   "inner" — 1..48 only, leaving the border ring at the matrix default of 0
 *
 * The distinction is load-bearing, not stylistic. A CostMatrix value of 0 means
 * "fall back to the engine's own terrain cost", so a builder that skipped the
 * border ring was deliberately leaving exit tiles at natural cost — several of
 * these matrices assign swamp 25-50 to push creeps off swamp, and applying that
 * to the border would make room transitions expensive and distort exit choice.
 */
export function terrainBaseMatrix(
  roomName: string,
  wall: number,
  swamp: number,
  plain: number,
  edge: "all" | "inner" = "all",
): CostMatrix {
  const key = roomName + "|" + wall + "|" + swamp + "|" + plain + "|" + edge;
  const hit = terrainBases[key];
  if (hit) return hit.clone();

  const costs = new PathFinder.CostMatrix();
  const terrain = new Room.Terrain(roomName);
  const lo = edge === "inner" ? 1 : 0;
  const hi = edge === "inner" ? 48 : 49;
  for (let y = lo; y <= hi; y++) {
    for (let x = lo; x <= hi; x++) {
      const tile = terrain.get(x, y);
      costs.set(x, y, tile === TERRAIN_MASK_WALL ? wall : tile === TERRAIN_MASK_SWAMP ? swamp : plain);
    }
  }

  if (terrainBaseCount >= TERRAIN_BASE_CAP) {
    for (const k in terrainBases) delete terrainBases[k];
    terrainBaseCount = 0;
  }
  terrainBases[key] = costs;
  terrainBaseCount++;
  return costs.clone();
}
