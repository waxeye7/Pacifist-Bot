/**
 * Reachability — "can a creep actually stand next to this structure?"
 *
 * WHY THIS EXISTS
 * ---------------
 * The plan (utils/PlanV2) has been re-pushed many times while the rooms were
 * already built, so live rooms hold extensions from OLD plan versions. Those
 * off-plan extensions are placed by an older hub shape and routinely seal a
 * pocket shut: E9S2 has five extensions (17..20 / 39..40) whose every D8
 * neighbour is another extension or a terrain wall, E11S2 has extension@18,36
 * and E14S9 has extension@23,22 in the same state.
 *
 * A walled-in extension is permanently empty, so it permanently "needs
 * energy", and every fill target picker in this bot uses findClosestByRange —
 * which does not care that there is no path. So the walled-in extension is the
 * CLOSEST hungry structure to anything standing in the hub, and every filler,
 * FakeFiller and carrier in the room locks onto it and never delivers again.
 * That is the whole logistics layer wedged on one dead tile.
 *
 * This module answers the question once per room per REFRESH_EVERY ticks with
 * a single flood fill and caches the (tiny) list of dead structure ids.
 *
 * It also carries the generic per-room "this target did not work out" TTL
 * blacklist, which the oscillation damper in Managers/RunCreepManager writes
 * to. Between them, every target picker gets the same two questions answered:
 *   - is there physically no way to stand next to it?      (unreach)
 *   - did creeps demonstrably fail to deliver to it?       (badFill)
 */
import { logAlways } from "utils/Logger";

/** full recompute cadence when nothing changed */
const REFRESH_EVERY = 50;
/** hard floor between recomputes, so a room that builds every tick cannot
 *  spin the flood fill every tick either */
const MIN_REFRESH = 15;
/**
 * How long a demonstrably-undeliverable target stays blacklisted.
 *
 * This is the HEURISTIC half of the system ("nobody got there in N ticks",
 * "someone ping-ponged chasing it") and heuristics are wrong sometimes, so it
 * expires quickly and is capped. The flood fill above is the exact half and is
 * never subject to either.
 */
export const BAD_FILL_TTL = 150;
/** never write off more than this many targets in one room at once */
const MAX_BAD_FILL = 8;

/** structures a hauler can be asked to deliver to / withdraw from */
const SINK_TYPES: { [k: string]: boolean } = {
  [STRUCTURE_SPAWN]: true,
  [STRUCTURE_EXTENSION]: true,
  [STRUCTURE_TOWER]: true,
  [STRUCTURE_LAB]: true,
  [STRUCTURE_LINK]: true,
  [STRUCTURE_CONTAINER]: true,
  [STRUCTURE_STORAGE]: true,
  [STRUCTURE_TERMINAL]: true,
  [STRUCTURE_NUKER]: true,
  [STRUCTURE_POWER_SPAWN]: true,
  [STRUCTURE_FACTORY]: true,
};

const packOf = (x: number, y: number) => x + y * 50;

/**
 * Flood fill the room's walkable tiles from every place a creep can come from
 * (exits, spawns, storage) and record which sink structures have NO walkable
 * D8 neighbour in that flood.
 *
 * Self-throttling — safe to call every tick from the room loop.
 */
export function refreshUnreachable(room: Room): void {
  if (!room || !room.controller || !room.controller.my) return;

  const structures = room.find(FIND_STRUCTURES);
  const prev = room.memory.unreach;
  if (prev) {
    const age = Game.time - (prev.t || 0);
    if (age < MIN_REFRESH) return;
    // structure count is a cheap change detector: a destroy or a completed
    // build is exactly what can open or close a pocket
    if (age < REFRESH_EVERY && prev.n === structures.length) return;
  }

  const terrain = room.getTerrain();
  const blocked = new Uint8Array(2500);
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) blocked[packOf(x, y)] = 1;
    }
  }
  for (const s of structures) {
    // ramparts and roads are not obstacles; everything in OBSTACLE_OBJECT_TYPES is
    if ((OBSTACLE_OBJECT_TYPES as any).indexOf(s.structureType) === -1) continue;
    blocked[packOf(s.pos.x, s.pos.y)] = 1;
  }
  // Construction sites deliberately ignored: your own creeps walk over your
  // own sites, so a site never makes a tile unreachable.

  const seen = new Uint8Array(2500);
  const queue: number[] = [];
  const seed = (x: number, y: number) => {
    if (x < 0 || x > 49 || y < 0 || y > 49) return;
    const p = packOf(x, y);
    if (blocked[p] || seen[p]) return;
    seen[p] = 1;
    queue.push(p);
  };
  // every tile a creep can enter the base network from
  for (const e of room.find(FIND_EXIT)) seed(e.x, e.y);
  const anchors: RoomPosition[] = [];
  for (const s of structures) {
    if (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_STORAGE) {
      anchors.push(s.pos);
    }
  }
  for (const a of anchors) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) seed(a.x + dx, a.y + dy);
  }
  if (!queue.length) return; // sealed room / no visibility — say nothing

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
        if (blocked[np] || seen[np]) continue;
        seen[np] = 1;
        queue.push(np);
      }
    }
  }

  const ids: string[] = [];
  const tiles: number[] = [];
  for (const s of structures) {
    if (!SINK_TYPES[s.structureType]) continue;
    let ok = false;
    for (let dx = -1; dx <= 1 && !ok; dx++) {
      for (let dy = -1; dy <= 1 && !ok; dy++) {
        if (!dx && !dy) continue;
        const nx = s.pos.x + dx;
        const ny = s.pos.y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        if (seen[packOf(nx, ny)]) ok = true;
      }
    }
    if (!ok) {
      ids.push(s.id);
      tiles.push(packOf(s.pos.x, s.pos.y));
    }
  }

  const had = prev && prev.ids ? prev.ids.length : 0;
  room.memory.unreach = { t: Game.time, n: structures.length, ids: ids, p: tiles };
  if (ids.length && (ids.length !== had || Game.time % 500 < REFRESH_EVERY)) {
    logAlways(
      `reach ${room.name}: ${ids.length} structure(s) have no walkable approach — ` +
        tiles.map((p) => `${p % 50},${Math.floor(p / 50)}`).join(" "),
    );
  }
}

/** ids of structures with no walkable D8 approach (cached, may be empty). */
export function unreachableIds(room: Room): string[] {
  const u = room && room.memory && room.memory.unreach;
  return u && u.ids ? u.ids : [];
}

/** true when this tile holds a structure nothing can stand next to. */
export function isUnreachableTile(room: Room, x: number, y: number): boolean {
  const u = room && room.memory && room.memory.unreach;
  if (!u || !u.p) return false;
  return u.p.indexOf(packOf(x, y)) !== -1;
}

/**
 * Structures the HEURISTIC blacklist is allowed to touch: the ones a room has
 * many of, so writing one off costs nothing.
 *
 * The backbone — spawn, storage, terminal, factory, power spawn — is never
 * blacklisted. Both callers are guesses ("nobody got adjacent in N ticks",
 * "someone ping-ponged chasing it") and a busy hub produces false positives
 * for both: the first live run wrote off spawn@20,40 in E11S2 and spawn@10,36
 * in E9S2 purely because the fillers were queued, and the E11S2 storage was
 * next in line. A room with an unfillable spawn stops spawning and a room with
 * a blacklisted storage stops moving energy at all — neither is worth risking
 * on a guess. The flood fill above is exact and still marks those structures
 * when they are genuinely walled in; that path ignores this allowlist.
 */
const BLACKLISTABLE: { [k: string]: boolean } = {
  [STRUCTURE_EXTENSION]: true,
  [STRUCTURE_TOWER]: true,
  [STRUCTURE_LAB]: true,
  [STRUCTURE_LINK]: true,
  [STRUCTURE_CONTAINER]: true,
  [STRUCTURE_NUKER]: true,
};

/**
 * Mark a target as undeliverable for a while (oscillation damper, failed
 * approaches).
 */
export function blacklistFillTarget(room: Room, id: string, ttl: number = BAD_FILL_TTL): boolean {
  if (!room || !id) return false;
  const obj: any = Game.getObjectById(id);
  if (obj && obj.structureType && !BLACKLISTABLE[obj.structureType]) return false;
  const bad = room.memory.badFill || (room.memory.badFill = {});
  bad[id] = Game.time + ttl;
  // Bounded. A congested hub can produce a lot of "I did not converge in N
  // ticks" reports at once, and a room whose whole extension network is
  // written off cannot be filled at all — which is the bug, not the fix.
  const keys = Object.keys(bad);
  if (keys.length > MAX_BAD_FILL) {
    keys.sort((a, b) => bad[a] - bad[b]); // oldest expiry first
    for (let i = 0; i < keys.length - MAX_BAD_FILL; i++) delete bad[keys[i]];
  }
  return true;
}

/**
 * The EXACT half: no walkable D8 approach exists, full stop. Target pickers
 * use this as the floor they fall back to when the heuristic blacklist has
 * filtered out everything — a loaded filler must always have somewhere to go.
 */
export function isUnreachableId(room: Room, id: string): boolean {
  const u = room && room.memory && room.memory.unreach;
  return !!(u && u.ids && u.ids.length && u.ids.indexOf(id) !== -1);
}

/**
 * THE question every target picker should ask before locking onto something.
 * Cheap: one array indexOf over a list that is almost always empty, plus one
 * object lookup.
 */
export function isUndeliverable(room: Room, id: string): boolean {
  if (!room || !id) return false;
  const u = room.memory.unreach;
  if (u && u.ids && u.ids.length && u.ids.indexOf(id) !== -1) return true;
  const bad = room.memory.badFill;
  if (bad) {
    const until = bad[id];
    if (until) {
      if (Game.time < until) return true;
      delete bad[id];
    }
  }
  return false;
}

/** Filter helper for the room.find() filters that pick fill targets. */
export function deliverable(room: Room): (s: { id: string }) => boolean {
  const u = room.memory.unreach;
  const dead: string[] = u && u.ids ? u.ids : [];
  const bad = room.memory.badFill;
  if (!dead.length && !bad) return () => true;
  return (s: { id: string }) => {
    if (dead.length && dead.indexOf(s.id) !== -1) return false;
    if (bad) {
      const until = bad[s.id];
      if (until && Game.time < until) return false;
    }
    return true;
  };
}

/** drop expired blacklist entries — called from the room loop, not hot. */
export function pruneBadFill(room: Room): void {
  const bad = room && room.memory && room.memory.badFill;
  if (!bad) return;
  let live = 0;
  for (const id of Object.keys(bad)) {
    if (Game.time >= bad[id]) delete bad[id];
    else live++;
  }
  if (!live) delete room.memory.badFill;
}
