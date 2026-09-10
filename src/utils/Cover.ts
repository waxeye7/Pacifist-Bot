/**
 * Cover — "there is a rampart RIGHT THERE, stand on it."
 *
 * WHY THIS EXISTS
 * ---------------
 * A rampart defends your creeps and structures on the same tile: a hostile
 * cannot enter it and cannot damage what is standing on it. The bot builds a
 * min-cut shell out of exactly those tiles, and then leaves its softest, most
 * expensive economy creep standing next to it in the open.
 *
 * The upgrader is the worst case and the one that was actually reported. It
 * parks for its whole life on a tile chosen by depotPark(), which scores on
 * range-to-controller and range-to-depot and knows nothing about ramparts.
 * Live shard3 2026-09-10, with the controller within range 3 of a ramparted
 * shell tile in FIVE of seven rooms:
 *
 *   E38N56  ctrl(43,10)  ramparts (43,11) (42,11) (42,10) (42,9) ...
 *           Upgrader-35399288 parked at (42,13), on bare ground
 *   E39N58  ctrl(19,38)  rampart (18,37) is RANGE 1 from the controller
 *   E36N57 / E35N59 / E35N58   same shape
 *
 * A 24-part upgrader is ~2,500 energy and several hundred ticks of spawn
 * time. Losing it to an invader while an untouchable tile sat one step away
 * is pure waste, and the room pays twice: once for the body and again for the
 * upgrade throughput that stops while the room re-spawns it.
 *
 * THE RULES
 * ---------
 *  1. PEACETIME CHANGES NOTHING. Ramparts on the shell are gates as often as
 *     not, and a creep parked on a gate for its whole life is a chokepoint
 *     every other creep in the base pays for. So this only ever runs while
 *     dangerNow() is true.
 *  2. COVER AT YOUR POST FIRST. A rampart within `range` of the anchor lets
 *     the creep keep doing its job — upgradeController reaches 3, so an
 *     upgrader in cover is still an upgrader. This is the whole point: the
 *     safe answer must not also be the idle answer, or it gets reverted.
 *  3. ONLY ABANDON THE POST UNDER ACTUAL THREAT. room.memory.danger latches
 *     and lags both ways, so "danger" alone must not send a creep across the
 *     base to hide. A cover tile out of anchor range is taken only when an
 *     ARMED hostile is within COVER_PANIC_RANGE of the creep itself.
 *  4. ONE CREEP PER TILE. Two upgraders that both pick the same rampart spend
 *     the raid shoving each other in the open. Claims are per-tick and
 *     module-local: creeps run sequentially inside a tick, so a claim written
 *     by the creep that ran first is visible to every creep after it.
 *  5. A DEFENCE SEAT IS NOT COVER. rooms.defence hands each RampartDefender
 *     one shell tile and only refuses ramparts a HOSTILE stands on, so an
 *     upgrader in cover is a tile it will still be ordered onto. The defender
 *     is the reason the rampart is worth standing on; it wins the tile.
 *  6. FAIL OPEN. No ramparts, none free, none in range => return false and the
 *     caller moves exactly as it did before this file existed.
 *
 * The return contract is interiorMove()'s: TRUE means "I own this creep's
 * movement this tick, do not call your own mover". The caller still issues its
 * work intent — movement and work are different intent classes.
 */
import { dangerNow } from "utils/Interior";
import { cachedDerived, cachedHostileCreeps, cachedMyCreeps, cachedMyStructures, cachedStructures } from "utils/RoomCache";

/**
 * How close an armed hostile must be before a creep gives up its post for a
 * rampart it cannot work from. RANGED_ATTACK reaches 3 and an invader moves
 * 1-2 tiles a tick, so 8 is roughly "it can be on me within three ticks".
 */
const COVER_PANIC_RANGE = 8;

/** rule 3: out-of-post cover always loses to in-post cover, at any distance */
const OUT_OF_POST_PENALTY = 1000;

const packOf = (x: number, y: number) => x + y * 50;
const cheb = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/**
 * Every tile in the room that is a rampart of mine a creep can stand on.
 *
 * Built at most once per room per tick, and only ever on a tick where
 * something is shooting at us — takeCover() returns before touching this in
 * peacetime, so the room pays nothing for it the other 99% of the time.
 *
 * The obstacle test walks cachedStructures ONCE rather than asking
 * pos.lookFor(LOOK_STRUCTURES) per rampart: a finished shell is 60+ ramparts
 * and that would be 60 looks a tick during exactly the ticks CPU is most
 * contended.
 */
function coverTiles(room: any): number[] {
  return cachedDerived(room, "coverTiles", () => {
    const blocked: { [p: number]: boolean } = {};
    for (const s of cachedStructures(room) as any[]) {
      if ((OBSTACLE_OBJECT_TYPES as any[]).indexOf(s.structureType) >= 0) {
        blocked[packOf(s.pos.x, s.pos.y)] = true;
      }
    }
    const terrain = room.getTerrain();
    const out: number[] = [];
    for (const s of cachedMyStructures(room) as any[]) {
      if (s.structureType !== STRUCTURE_RAMPART) continue;
      const p = packOf(s.pos.x, s.pos.y);
      if (blocked[p]) continue;
      if (terrain.get(s.pos.x, s.pos.y) === TERRAIN_MASK_WALL) continue;
      out.push(p);
    }
    return out;
  });
}

/** where my creeps stood at the top of this tick, packed */
function standing(room: any): { [p: number]: string } {
  return cachedDerived(room, "coverStanding", () => {
    const o: { [p: number]: string } = {};
    for (const c of cachedMyCreeps(room)) o[packOf(c.pos.x, c.pos.y)] = c.name;
    return o;
  });
}

/**
 * Shell tiles a defender has already been ordered onto this tick.
 *
 * rooms.defence.assignDefenderTiles() hands every live RampartDefender /
 * RangedRampartDefender one unique shell tile, and it only skips a rampart
 * whose occupant is NOT mine — so an upgrader sitting in cover is a tile the
 * defender will still be sent to, and the two spend the raid shoving each
 * other on the wall line. The room pass runs before the creep pass
 * (Memory.CPU.phases: rooms, then creeps), so by the time any creep asks this
 * question the seats for this tick are already written.
 *
 * A defence seat outranks cover absolutely. The defender is the reason the
 * rampart is worth standing on.
 */
function defenceSeats(room: any): { [p: number]: boolean } {
  return cachedDerived(room, "coverDefenceSeats", () => {
    const o: { [p: number]: boolean } = {};
    for (const c of cachedMyCreeps(room)) {
      const id = (c.memory as any).myRampartToMan;
      if (!id) continue;
      const r: any = Game.getObjectById(id);
      if (r && (r as any).pos) o[packOf((r as any).pos.x, (r as any).pos.y)] = true;
    }
    return o;
  });
}

let claimTick = -1;
let claimed: { [roomName: string]: { [p: number]: string } } = {};

function claim(room: any, p: number, name: string): void {
  if (claimTick !== Game.time) {
    claimTick = Game.time;
    claimed = {};
  }
  (claimed[room.name] || (claimed[room.name] = {}))[p] = name;
}

function taken(room: any, p: number, creep: any): boolean {
  if (claimTick === Game.time) {
    const c = claimed[room.name] && claimed[room.name][p];
    if (c && c !== creep.name) return true;
  }
  if (defenceSeats(room)[p]) return true;
  const s = standing(room)[p];
  return !!s && s !== creep.name;
}

/** an armed hostile close enough that standing in the open is a real risk */
function underThreat(creep: any): boolean {
  for (const h of cachedHostileCreeps(creep.room) as any[]) {
    if (h.getActiveBodyparts(ATTACK) === 0 && h.getActiveBodyparts(RANGED_ATTACK) === 0) continue;
    if (creep.pos.getRangeTo(h) <= COVER_PANIC_RANGE) return true;
  }
  return false;
}

/**
 * Put `creep` on a rampart while the room is under attack, preferring one it
 * can still work from (within `range` of `anchor`).
 *
 * Returns true when this owns the creep's movement for the tick, INCLUDING the
 * case where the creep already stands in cover and must not be moved at all.
 */
export function takeCover(creep: any, anchor: any, range: number): boolean {
  const room = creep.room;
  if (!room || !dangerNow(room)) return false;

  const tiles = coverTiles(room);
  if (!tiles.length) return false;

  const here = packOf(creep.pos.x, creep.pos.y);
  if (tiles.indexOf(here) >= 0 && !defenceSeats(room)[here]) {
    // Already untouchable. Hold the tile so nobody else walks at it, and tell
    // the caller not to move: anywhere else is strictly worse.
    claim(room, here, creep.name);
    return true;
  }

  const aim = anchor && (anchor.pos || anchor);
  const inPostOk = !!aim && typeof aim.x === "number";
  // Rule 3: only ask the hostile question when it can change the answer.
  let panic: boolean | null = null;

  let best = -1;
  let bestScore = 1e9;
  for (const p of tiles) {
    const x = p % 50;
    const y = (p - x) / 50;
    const walk = cheb(x, y, creep.pos.x, creep.pos.y);
    let score = walk;
    if (!inPostOk || cheb(x, y, aim.x, aim.y) > range) {
      if (panic === null) panic = underThreat(creep);
      if (!panic) continue;
      score = OUT_OF_POST_PENALTY + walk;
    }
    // the occupancy test is the expensive one, so it runs last
    if (score >= bestScore) continue;
    if (taken(room, p, creep)) continue;
    bestScore = score;
    best = p;
  }

  if (best < 0) return false;
  claim(room, best, creep.name);
  const pos = new RoomPosition(best % 50, Math.floor(best / 50), room.name);
  creep.MoveCostMatrixRoadPrio({ pos: pos, id: "cover:" + room.name + ":" + best }, 0);
  return true;
}
