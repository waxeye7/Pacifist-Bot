/**
 * WAR / REACH — "what is inside our zone of control".
 *
 * Doctrine (docs/AGGRESSION-DOCTRINE.md §1): everything within 5 rooms of an
 * owned room is a target, closest first; everything within 10 rooms of a room
 * with a Nuker is a nuke candidate. This module is the single place that
 * answers "is X in reach, and how far".
 *
 * CPU: the whole reach map is heap-only and rebuilt on global reset or when the
 * owned-room set changes. A 5-room empire at range 5 is ~600 name generations,
 * well under a CPU, and it happens once per global — not once per tick. It is
 * deliberately NOT persisted to Memory: ~300 entries of serialise cost every
 * tick to avoid a sub-CPU recompute every few thousand ticks is a bad trade on
 * shard 3.
 */

import { reachMap, roomDistance, isEnterable, roomKind, ROOM_NORMAL, ROOM_KEEPER } from "./geo";

/** Engagement radius — doctrine §1. Everything inside this is an enemy. */
export const ENGAGE_RANGE = 5;
/** Nuke candidacy radius from a Nuker's room — the game's hard nuke range. */
export const NUKE_RANGE = 10;

export interface ReachState {
  /** roomName -> distance to the CLOSEST owned room. Includes owned rooms at 0. */
  dist: { [roomName: string]: number };
  /** Sorted owned room names the map was built from. */
  origins: string[];
  /** Game.time the map was built. */
  built: number;
}

let cached: ReachState | null = null;
let cachedKey = "";

/** Owned room names, recomputed each tick (Game.rooms is already in memory). */
let ownedTick = -1;
let ownedNames: string[] = [];

/**
 * Every room we own a controller in. This is the canonical expression — the
 * codebase re-derives it inline in dozens of places with slightly different
 * filters; war code uses this one.
 */
export function ownedRooms(): string[] {
  if (ownedTick === Game.time) return ownedNames;
  ownedTick = Game.time;
  const out: string[] = [];
  for (const name in Game.rooms) {
    const r = Game.rooms[name];
    if (r && r.controller && r.controller.my) out.push(name);
  }
  out.sort();
  ownedNames = out;
  return out;
}

/**
 * Our own username, cached for the life of the global.
 *
 * Needed because intel records store the owner of EVERY room we see, including
 * ours. Without this, a room we lose keeps `o = <us>` until something re-scouts
 * it, and the scorer — which has no other way to recognise us — happily ranks
 * our own former colony as a target.
 */
let myName: string | null = null;
export function myUsername(): string {
  if (myName) return myName;
  for (const name in Game.rooms) {
    const r = Game.rooms[name];
    if (r && r.controller && r.controller.my && r.controller.owner) {
      myName = r.controller.owner.username;
      return myName;
    }
  }
  for (const name in Game.spawns) {
    const s = Game.spawns[name];
    if (s && s.owner) {
      myName = s.owner.username;
      return myName;
    }
  }
  return "";
}

/** Owned rooms that actually have a built Nuker, for tier-5 candidacy. */
export function nukerRooms(): string[] {
  const out: string[] = [];
  const owned = ownedRooms();
  for (let i = 0; i < owned.length; i++) {
    const room = Game.rooms[owned[i]];
    if (!room) continue;
    const nukers = room.find(FIND_MY_STRUCTURES, {
      filter: (s: AnyStructure) => s.structureType === STRUCTURE_NUKER,
    });
    if (nukers.length) out.push(owned[i]);
  }
  return out;
}

/**
 * The reach map, rebuilt only when the owned-room set changes.
 *
 * Claiming a room instantly promotes a fresh ring of targets around it, which
 * is exactly the doctrine's intent (§2 tier 6) — so the invalidation key is the
 * owned set itself, not a timer.
 */
export function getReach(): ReachState {
  const origins = ownedRooms();
  const key = origins.join(",");
  if (cached && cachedKey === key) return cached;

  cached = {
    dist: reachMap(origins, ENGAGE_RANGE),
    origins: origins.slice(),
    built: Game.time,
  };
  cachedKey = key;
  return cached;
}

/** Distance to the closest owned room, or Infinity if outside engagement range. */
export function distanceToEmpire(roomName: string): number {
  const d = getReach().dist[roomName];
  return d === undefined ? Infinity : d;
}

/** Is this room inside the engagement radius? Owned rooms count (distance 0). */
export function inReach(roomName: string): boolean {
  return getReach().dist[roomName] !== undefined;
}

/**
 * Rooms we are willing to send ground forces to, closest first.
 *
 * Excludes:
 *  - our own rooms (distance 0)
 *  - source-keeper and centre rooms (permanent NPC garrison; not a tier 1-4 target)
 *  - highways (nothing to own or deny there — convoy raiding is a separate concern)
 *  - novice/respawn-walled rooms we physically cannot enter
 */
export function groundTargets(): string[] {
  const reach = getReach();
  const out: string[] = [];
  for (const name in reach.dist) {
    const d = reach.dist[name];
    if (d === 0) continue;
    if (roomKind(name) !== ROOM_NORMAL) continue;
    if (!isEnterable(name)) continue;
    out.push(name);
  }
  // closest first — doctrine §1, non-negotiable ordering
  out.sort((a, b) => reach.dist[a] - reach.dist[b] || (a < b ? -1 : 1));
  return out;
}

/**
 * Rooms within NUKE_RANGE of at least one room that has a Nuker, with the
 * launching room recorded. Doctrine §1: if it is in range, it is a candidate,
 * and repeat launches on the same target are explicitly allowed.
 *
 * Returns target -> the closest owned Nuker room that can hit it.
 */
export function nukeCandidates(): { [target: string]: string } {
  const silos = nukerRooms();
  const out: { [target: string]: string } = {};
  if (!silos.length) return out;

  // Every room WE own is inside reachMap(silos, 10). Excluding only the silo
  // itself is not enough — without this, warNukes() cheerfully lists our own
  // colonies as candidates, and this function is the direct input to tier 5.
  const mine: { [name: string]: boolean } = {};
  const owned = ownedRooms();
  for (let i = 0; i < owned.length; i++) mine[owned[i]] = true;

  const seen = reachMap(silos, NUKE_RANGE);
  for (const name in seen) {
    if (mine[name]) continue;
    if (roomKind(name) === ROOM_KEEPER) continue;
    if (!isEnterable(name)) continue;
    // find which silo is actually in range (reachMap gives min distance only)
    let best = "";
    let bestD = Infinity;
    for (let i = 0; i < silos.length; i++) {
      if (silos[i] === name) continue;
      const d = roomDistance(silos[i], name);
      if (d <= NUKE_RANGE && d < bestD) {
        bestD = d;
        best = silos[i];
      }
    }
    if (best) out[name] = best;
  }
  return out;
}

/** Debug: one-line summary of the current reach state. */
/**
 * ── HOW FAR IS IT REALLY ───────────────────────────────────────────────────
 *
 * getReach() is Chebyshev room-coordinate distance and nothing else — see
 * geo.reachMap, which is three nested loops over dx/dy. It answers "how far is
 * that on the map", which is the right question for doctrine ("everything
 * within 5 rooms is a target") and the wrong one for "can a creep get there".
 *
 * Live shard3 2026-09-11: dispatch sent Guard-19391524-E36N57-E38N55 at a
 * target TWO rooms from an owned room. The route the creep actually got back
 * was fourteen hops — E36N58, E36N59, E36N60, E37N60, E38N60, E39N60, E40N60,
 * E40N59, E40N58, E40N57, E40N56, E40N55, E39N55, E38N55 — because the two
 * short ways out of E36N57 are E37N56 (in Memory.AvoidRooms since tick
 * 82,872,574) and E36N56/E36N55, which are Source Keeper rooms. The creep
 * router prices an SK room or an avoided room at 24 against 4 for a normal one
 * and 2 for a highway, so ten extra rooms of highway genuinely IS the cheaper
 * ROUTE — it is just three times the TICKS, and ticks are what a 1,500-tick
 * body actually spends.
 *
 * So measure the trip the creep will really be given, with the same weights,
 * and refuse the errand rather than buying a body to die in transit. This does
 * not touch the router's preferences: a creep already sent still walks the safe
 * way round. It only stops us paying for trips that end in a tombstone.
 *
 * findRoute is not free, so results are memoised on the heap for ROUTE_TTL
 * ticks. Dispatch issues at most one or two kits per pass and passes are
 * DISPATCH_EVERY ticks apart, so this is a handful of calls per thousand ticks.
 */
/** Rooms of walking we will buy a body for. Beyond this the errand is a death. */
export const MAX_TRAVEL_HOPS = 7;
const ROUTE_TTL = 1500;
const routeCache: { [key: string]: { n: number; t: number } } = Object.create(null);

/** The creep router's own weights — kept in step with moveToRoomAvoidEnemyRooms. */
function hopCost(roomName: string, targetRoom: string): number {
  if (!isEnterable(roomName)) return Infinity;
  const M: any = Memory as any;
  if (roomName !== targetRoom &&
      ((M.AvoidRooms && M.AvoidRooms.indexOf(roomName) >= 0) ||
       (M.AvoidRoomsTemp && M.AvoidRoomsTemp[roomName]))) {
    return 24;
  }
  const kind = roomKind(roomName);
  if (kind === ROOM_KEEPER) return 24;
  if (kind !== ROOM_NORMAL) return 2;
  return 4;
}

/**
 * Hops the creep router will actually hand a creep walking home -> target.
 * -1 when there is no route at all.
 */
export function travelHops(home: string, target: string): number {
  if (!home || !target) return -1;
  if (home === target) return 0;
  const key = home + ">" + target;
  const hit = routeCache[key];
  if (hit && Game.time - hit.t < ROUTE_TTL) return hit.n;
  let n = -1;
  try {
    const route: any = Game.map.findRoute(home, target, {
      routeCallback: (roomName: string) => hopCost(roomName, target),
    });
    if (route !== ERR_NO_PATH && route.length !== undefined) n = route.length;
  } catch (e) {
    n = -1;
  }
  routeCache[key] = { n: n, t: Game.time };
  return n;
}

/** Is this errand walkable inside one creep lifetime? */
export function withinTravelBudget(home: string, target: string): boolean {
  const n = travelHops(home, target);
  if (n < 0) return false;
  return n <= MAX_TRAVEL_HOPS;
}

export function reachSummary(): string {
  const reach = getReach();
  const ground = groundTargets();
  let n = 0;
  for (const _k in reach.dist) n++;
  return [
    `owned=${reach.origins.length}[${reach.origins.join(" ")}]`,
    `reach=${n}`,
    `ground=${ground.length}`,
    `silos=${nukerRooms().length}`,
    `built=${reach.built}`,
  ].join(" | ");
}
