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
  /** Cost matrices rebuilt at most once per tick per kind */
  costMatrices: { [key: string]: CostMatrix };
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

function ensure(room: Room): RoomTickCache {
  if (!room.cache || room.cache.tick !== Game.time) {
    room.cache = { tick: Game.time, costMatrices: {} };
  }
  return room.cache;
}

export function cachedSources(room: Room): Source[] {
  const c = ensure(room);
  if (!c.sources) c.sources = room.find(FIND_SOURCES);
  return c.sources;
}

export function cachedMyStructures(room: Room): AnyStructure[] {
  const c = ensure(room);
  if (!c.myStructures) c.myStructures = room.find(FIND_MY_STRUCTURES);
  return c.myStructures;
}

export function cachedStructures(room: Room): AnyStructure[] {
  const c = ensure(room);
  if (!c.structures) c.structures = room.find(FIND_STRUCTURES);
  return c.structures;
}

export function cachedHostileCreeps(room: Room): Creep[] {
  const c = ensure(room);
  if (!c.hostileCreeps) c.hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
  return c.hostileCreeps;
}

export function cachedMyCreeps(room: Room): Creep[] {
  const c = ensure(room);
  if (!c.myCreeps) c.myCreeps = room.find(FIND_MY_CREEPS);
  return c.myCreeps;
}

export function cachedSites(room: Room): ConstructionSite[] {
  const c = ensure(room);
  if (!c.constructionSites) c.constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
  return c.constructionSites;
}

/** Store / reuse a CostMatrix for this room this tick (movement). */
export function getCachedCostMatrix(roomName: string, key: string, build: () => CostMatrix | false): CostMatrix | false {
  const room = Game.rooms[roomName];
  if (!room) return build();
  const c = ensure(room);
  if (c.costMatrices[key]) return c.costMatrices[key];
  const m = build();
  if (m) c.costMatrices[key] = m;
  return m;
}
