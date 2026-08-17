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
