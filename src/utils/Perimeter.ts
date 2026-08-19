/**
 * Defense perimeter abstraction.
 * Prefer room.memory.basePlan.perimeter (min-cut tiles). Fallbacks for legacy rooms.
 */

export interface PerimeterTile {
  x: number;
  y: number;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/** Load perimeter tile set from plan memory. */
export function getPerimeterTiles(room: Room): PerimeterTile[] {
  // Prefer the adopted v2 min-cut. basePlan.perimeter is a 100t mirror and
  // stays on the previous wall after replan/adopt, so towers/RDs manned the
  // old ring. Interior already reads shellCut first; match that here.
  const v2: any = (room.memory as any).planV2;
  if (v2 && v2.t && v2.t.shellCut && v2.t.shellCut.length) {
    const seen = new Set<string>();
    const out: PerimeterTile[] = [];
    for (const p of v2.t.shellCut) {
      const x = p % 50;
      const y = Math.floor(p / 50);
      const k = key(x, y);
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ x: x, y: y });
      }
    }
    return out;
  }
  const plan = room.memory.basePlan;
  if (plan && plan.perimeter && plan.perimeter.length) {
    // ramp openings get a rampart too: own creeps walk through own ramparts, so
    // an open ramp only ever helps an attacker. Including them here makes the
    // erector build them and the tower shell upkeep maintain them.
    const seen = new Set<string>();
    const out: PerimeterTile[] = [];
    const ramps = (plan.ramps || []) as PerimeterTile[];
    for (const t of (plan.perimeter as PerimeterTile[]).concat(ramps)) {
      const k = key(t.x, t.y);
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ x: t.x, y: t.y });
      }
    }
    return out;
  }
  // Legacy: construction.rampartLocations as [x,y][]
  const legacy = room.memory.construction && room.memory.construction.rampartLocations;
  if (legacy && legacy.length) {
    return legacy.map((p: any) =>
      Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y },
    );
  }
  return [];
}

/**
 * PER-ROOM, PER-TICK MEMO on the heap (the Room object is rebuilt every tick,
 * so the tick stamp is belt-and-braces against a cached Room reference).
 *
 * This sits on the DEFENCE path, which is the one path in the bot that runs
 * per hostile per tower per tick. Un-memoised it was: perimeterKeySet unpacks
 * the whole shellCut and allocates a fresh Set on EVERY call, isPerimeterPos
 * does that per query, and findPerimeterRamparts called getPerimeterTiles
 * INSIDE a filter predicate — i.e. |ramparts| x |perimeter| unpacks, ~50x50
 * on a walled RCL8 room, for one boolean.
 *
 * Callers treat both fields as READ-ONLY. getPerimeterTiles itself still hands
 * out a fresh array per call so the existing (mutating-safe) contract holds.
 */
type PerimeterMemo = { tick: number; tiles: PerimeterTile[]; keys: Set<string> };

function perimeterMemo(room: Room): PerimeterMemo {
  const holder = room as any;
  const cached = holder.__perimeterMemo as PerimeterMemo | undefined;
  if (cached && cached.tick === Game.time) return cached;
  const tiles = getPerimeterTiles(room);
  const keys = new Set<string>();
  for (const t of tiles) keys.add(key(t.x, t.y));
  const memo: PerimeterMemo = { tick: Game.time, tiles: tiles, keys: keys };
  holder.__perimeterMemo = memo;
  return memo;
}

export function perimeterKeySet(room: Room): Set<string> {
  return perimeterMemo(room).keys;
}

export function isPerimeterPos(room: Room, x: number, y: number): boolean {
  return perimeterMemo(room).keys.has(key(x, y));
}

/** Ramparts that sit on the planned perimeter (or near it if partial build). */
export function findPerimeterRamparts(room: Room): StructureRampart[] {
  const memo = perimeterMemo(room);
  const set = memo.keys;
  const all = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_RAMPART,
  }) as StructureRampart[];

  if (set.size > 0) {
    const onCut = all.filter((r) => set.has(key(r.pos.x, r.pos.y)));
    if (onCut.length > 0) return onCut;
    // near perimeter (build progress / slight offset) — tiles hoisted OUT of
    // the predicate; it used to re-read the plan once per rampart.
    const tiles = memo.tiles;
    return all.filter((r) => {
      for (const t of tiles) {
        if (r.pos.getRangeTo(t.x, t.y) <= 1) return true;
      }
      return false;
    });
  }

  // No plan: last-resort legacy band around storage (being phased out)
  const storage = room.storage;
  if (!storage) return [];
  return all.filter((r) => {
    const d = r.pos.getRangeTo(storage);
    return d >= 8 && d <= 13;
  });
}

export function findDamagedPerimeterRamparts(
  room: Room,
  minHits: number,
): StructureRampart[] {
  return findPerimeterRamparts(room)
    .filter((r) => r.hits < minHits)
    .sort((a, b) => a.hits - b.hits);
}

/** RCL at which a room may start erecting its defence shell. Must match the
 *  rampart gate in BasePlan.placeFromBasePlan and utils/PlanV2 wantsAtRcl. */
export const SHELL_MIN_RCL = 4;

/**
 * Sync plan perimeter → construction.rampartLocations for older erect roles.
 *
 * CONTRACT: construction.rampartLocations = perimeter tiles that are STILL
 * MISSING A RAMPART. Empty means "the shell is finished" — Guard.ts:43 only
 * promotes Guard → RampartDefender on an empty list, and rooms.spawning only
 * spawns RampartErectors on a non-empty one. This legacy writer publishes ALL
 * perimeter tiles (it has no built/not-built view), which is a conservative
 * over-approximation of the contract and never converges to empty on its own.
 *
 * planV2 rooms are therefore OFF LIMITS: PlanV2.syncPlanV2Memory writes the
 * real "not yet ramparted" list every SYNC_EVERY ticks, and one call from here
 * (e.g. `getBasePlan(room, true)` from the console) re-inflated it to the full
 * ring — leaving the room reading "shell unfinished" for up to 100 ticks, with
 * no RampartDefenders and RampartErectors spawning for tiles already walled.
 */
export function syncPerimeterToConstructionMemory(room: Room): void {
  if ((room.memory as any).planV2) return;
  const tiles = getPerimeterTiles(room);
  if (!tiles.length) return;
  if (!room.memory.construction) room.memory.construction = {};
  // walls only for erect roles (ramps are openings — still walkable, optional light rampart later)
  //
  // rampartLocations is the RampartErector spawn trigger (rooms.spawning:
  // "rampartLocations && rampartLocations.length > 0") AND the list that role
  // turns into construction sites. Publishing it below SHELL_MIN_RCL makes a
  // pre-storage room spend its whole builder budget on a wall it cannot
  // maintain, so keep it empty until the room can actually hold the shell.
  const rcl = room.controller ? room.controller.level : 0;
  room.memory.construction.rampartLocations =
    rcl >= SHELL_MIN_RCL ? tiles.map((t) => [t.x, t.y]) : [];
  room.memory.defence = room.memory.defence || {};
  room.memory.defence.perimeter = tiles;
  room.memory.defence.perimeterCount = tiles.length;
  if (room.memory.basePlan && room.memory.basePlan.ramps) {
    room.memory.defence.ramps = room.memory.basePlan.ramps;
  }
}

/** True if pos is on a planned wall tile (not a ramp opening). */
export function isWallPerimeter(room: Room, x: number, y: number): boolean {
  return isPerimeterPos(room, x, y);
}

/** Cheapest stand position for RD: nearest perimeter rampart to hostile (or hub). */
export function nearestPerimeterTile(
  room: Room,
  to: { x: number; y: number },
): PerimeterTile | null {
  const tiles = getPerimeterTiles(room);
  if (!tiles.length) return null;
  let best: PerimeterTile | null = null;
  let bestD = 999;
  for (const t of tiles) {
    const d = Math.max(Math.abs(t.x - to.x), Math.abs(t.y - to.y));
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}
