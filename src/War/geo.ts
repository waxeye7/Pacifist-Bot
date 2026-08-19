/**
 * WAR / GEO — room-name arithmetic and room classification.
 *
 * Nothing in this bot could previously answer "what rooms are within 5 of my
 * rooms" without calling Game.map.getRoomLinearDistance in a loop, and nothing
 * could answer "is that a source-keeper room" at all. Both are prerequisites
 * for the aggression doctrine's reach set (docs/AGGRESSION-DOCTRINE.md §1).
 *
 * Pure functions, no game state, no imports — safe to pull in from anywhere.
 * Every result that can be cached IS cached on the heap: room names are
 * immutable, so a parse only ever has to happen once per global.
 */

/** World coordinates. Origin is the W0N0/E0S0 corner; +x is East, +y is South. */
export interface RoomCoord {
  wx: number;
  wy: number;
}

export const ROOM_NORMAL = 0;
export const ROOM_HIGHWAY = 1;
export const ROOM_KEEPER = 2;
export const ROOM_CENTER = 3;

export type RoomKind = 0 | 1 | 2 | 3;

// Object.create(null), NOT {} — a room name is arbitrary text and a bare object
// literal answers `cache["toString"]` with a Function. That leaked through the
// `hit !== undefined` guard and made roomDistance return NaN instead of the
// Infinity its contract promises, which is worse than a wrong number: a NaN
// comparator makes Array.sort ordering arbitrary, so one junk name in memory
// could scramble the whole target list.
const coordCache: { [roomName: string]: RoomCoord | null } = Object.create(null);
const kindCache: { [roomName: string]: RoomKind } = Object.create(null);

const NAME_RE = /^([WE])(\d+)([NS])(\d+)$/;

/**
 * Parse a room name into world coordinates. Returns null for anything that is
 * not a real room name ("sim", garbage from memory, undefined).
 *
 * E<n> -> wx = n        W<n> -> wx = -n - 1
 * S<n> -> wy = n        N<n> -> wy = -n - 1
 *
 * The -1 is because there is no zero column: W0 and E0 are adjacent rooms.
 */
export function roomNameToCoord(roomName: string): RoomCoord | null {
  if (!roomName) return null;
  const hit = coordCache[roomName];
  if (hit !== undefined) return hit;

  const m = NAME_RE.exec(roomName);
  if (!m) {
    coordCache[roomName] = null;
    return null;
  }
  const x = parseInt(m[2], 10);
  const y = parseInt(m[4], 10);
  const coord: RoomCoord = {
    wx: m[1] === "E" ? x : -x - 1,
    wy: m[3] === "S" ? y : -y - 1,
  };
  coordCache[roomName] = coord;
  return coord;
}

/** Inverse of roomNameToCoord. */
export function coordToRoomName(wx: number, wy: number): string {
  const h = wx >= 0 ? "E" + wx : "W" + (-wx - 1);
  const v = wy >= 0 ? "S" + wy : "N" + (-wy - 1);
  return h + v;
}

/**
 * Chebyshev distance in rooms — the same metric as
 * Game.map.getRoomLinearDistance(a, b, false), but pure and cached, so it can
 * be called thousands of times in a scoring pass without touching the API.
 *
 * Returns Infinity if either name is unparseable, so an unknown room can never
 * accidentally sort to the front of a target list.
 */
export function roomDistance(a: string, b: string): number {
  if (a === b) return 0;
  const ca = roomNameToCoord(a);
  const cb = roomNameToCoord(b);
  if (!ca || !cb) return Infinity;
  const dx = ca.wx - cb.wx;
  const dy = ca.wy - cb.wy;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  return ax > ay ? ax : ay;
}

/**
 * Classify a room from its name alone — no vision required, which is the whole
 * point: the reach set is built before anything has been scouted.
 *
 * Sector layout repeats every 10 rooms. Using the digits AS WRITTEN in the name
 * (not world coords) is correct here — that is how the server lays out sectors.
 *   - either digit == 0            -> highway (no controller, no sources)
 *   - both digits in 4..6, == 5,5  -> sector centre (portals / power bank room)
 *   - both digits in 4..6          -> source keeper room
 *   - otherwise                    -> normal, claimable room
 */
export function roomKind(roomName: string): RoomKind {
  const hit = kindCache[roomName];
  if (hit !== undefined) return hit;

  const m = NAME_RE.exec(roomName);
  if (!m) {
    kindCache[roomName] = ROOM_NORMAL;
    return ROOM_NORMAL;
  }
  const x = parseInt(m[2], 10) % 10;
  const y = parseInt(m[4], 10) % 10;

  let kind: RoomKind;
  if (x === 0 || y === 0) kind = ROOM_HIGHWAY;
  else if (x === 5 && y === 5) kind = ROOM_CENTER;
  else if (x >= 4 && x <= 6 && y >= 4 && y <= 6) kind = ROOM_KEEPER;
  else kind = ROOM_NORMAL;

  kindCache[roomName] = kind;
  return kind;
}

export function isHighway(roomName: string): boolean {
  return roomKind(roomName) === ROOM_HIGHWAY;
}

/** Source-keeper room: permanent hostile NPCs, never a tier-1..4 target. */
export function isKeeperRoom(roomName: string): boolean {
  return roomKind(roomName) === ROOM_KEEPER;
}

/** A room we could theoretically claim and hold: has a controller, no keepers. */
export function isClaimable(roomName: string): boolean {
  return roomKind(roomName) === ROOM_NORMAL;
}

/**
 * Every room name within Chebyshev `range` of `center`, INCLUDING center.
 * Pure name generation — these rooms may not exist or may be inaccessible;
 * callers filter with Game.map.getRoomStatus when that matters.
 */
export function roomsInRange(center: string, range: number): string[] {
  const c = roomNameToCoord(center);
  if (!c) return [];
  const out: string[] = [];
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      out.push(coordToRoomName(c.wx + dx, c.wy + dy));
    }
  }
  return out;
}

/**
 * The union of roomsInRange(o, range) over every origin, each mapped to its
 * distance to the CLOSEST origin. That closest-distance is the doctrine's
 * priority key: closest rooms are always worked first (§1).
 *
 * Returns a plain object so it can be cached/serialised directly.
 */
export function reachMap(origins: string[], range: number): { [roomName: string]: number } {
  const out: { [roomName: string]: number } = {};
  for (let i = 0; i < origins.length; i++) {
    const c = roomNameToCoord(origins[i]);
    if (!c) continue;
    for (let dx = -range; dx <= range; dx++) {
      const ax = dx < 0 ? -dx : dx;
      for (let dy = -range; dy <= range; dy++) {
        const ay = dy < 0 ? -dy : dy;
        const d = ax > ay ? ax : ay;
        const name = coordToRoomName(c.wx + dx, c.wy + dy);
        const prev = out[name];
        if (prev === undefined || d < prev) out[name] = d;
      }
    }
  }
  return out;
}

/**
 * Room status, cached for the life of the global. getRoomStatus is not free and
 * a room's status effectively never changes on a running shard (novice/respawn
 * zones expire on a timescale of days, and a global lives minutes).
 */
const statusCache: { [roomName: string]: string } = Object.create(null);
export function roomStatus(roomName: string): string {
  const hit = statusCache[roomName];
  if (hit !== undefined) return hit;
  let s = "normal";
  try {
    const res = Game.map.getRoomStatus(roomName);
    s = (res && res.status) || "normal";
  } catch (e) {
    // Unparseable / nonexistent room name — treat as closed so it is never
    // targeted.
    s = "closed";
  }
  statusCache[roomName] = s;
  return s;
}

/** Can we actually send creeps here? Novice/respawn walls make a room untouchable. */
export function isEnterable(roomName: string): boolean {
  return roomStatus(roomName) === "normal";
}
