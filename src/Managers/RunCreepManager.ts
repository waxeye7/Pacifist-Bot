import { logAlways } from "utils/Logger";
import { isUndeliverable, blacklistFillTarget } from "utils/Reachability";

/**
 * ---------------------------------------------------------------------------
 * Oscillation damping
 *
 * Every stuck detector in this bot ("am I on the same tile as last tick?") is
 * defeated by a creep that moves EVERY tick without going anywhere. That is
 * not hypothetical: SwapPositionWithCreep shoves any neighbour that has not
 * moved yet this tick, so two creeps that want each other's tile take turns
 * shoving each other and both change position every single tick. Their
 * stuckAt / pfStuckAt counters reset to 0 forever, the moveTo fallback (>=3)
 * and the hand-step (>=8) never fire, and the "wedged" console line is never
 * printed. Live evidence, 97 consecutive ticks:
 *
 *   E11S2  EmergencyFiller-584470 / Filler-2059270  20,37 <-> 19,38
 *          both loaded, both t = extension@18,36 (no walkable approach)
 *   E9S2   Carrier-81022 / Carrier-727835           17,37 <-> 18,37
 *          both loaded, both locked = extension@20,39 (no walkable approach)
 *
 * So detection has to look at a WINDOW of positions, not just the last one.
 * Six samples alternating between exactly two tiles is a livelock: no real
 * task in this bot walks A-B-A-B-A-B while failing to reach its target.
 *
 * On detection: blame the target (blacklist it room-wide with a TTL so the
 * other creeps in the loop stop chasing it too), wipe every movement cache,
 * and force a legal sidestep AFTER the role has run — the last move() of a
 * tick is the one the engine executes, so this breaks the cycle even if the
 * role re-issues the same failing step.
 * ---------------------------------------------------------------------------
 */
/** four full cycles — three produced too many hits on ordinary hub contention */
const OSC_WINDOW = 8;
/** do not re-fire for this many ticks after a damping step */
const OSC_COOLDOWN = 30;
/**
 * Within this range of its target a ping-ponging creep is losing a fight over
 * one approach tile, NOT chasing something it can never reach. The cure there
 * is a fresh path (and a shove), never writing the target off: the first live
 * run had maintainers "giving up" on their own storage and upgraders on their
 * own controller, which is nonsense. Only a creep oscillating far from its
 * target is making a claim about the target.
 */
const OSC_CONTENTION_RANGE = 2;
/**
 * A creep that has not changed tile in this many ticks is standing still, not
 * oscillating — throw the trail away so an old A-B-A-B pattern cannot fire
 * long after the fact. (stuckAt / pfStuckAt own the standing-still case.)
 */
const OSC_TRAIL_STALE = 20;

/**
 * ---------------------------------------------------------------------------
 * Wedged-in-place damping
 *
 * The oscillation damper above only sees creeps that MOVE without getting
 * anywhere. The opposite failure is just as common and completely invisible to
 * it: a creep that does not move at all while `memory.moving` is true. The
 * trail only records a sample when the tile CHANGES, so such a creep leaves a
 * one-entry trail forever and no detector in this file looks at it again.
 *
 * Live shard3 E37N59, ticks 82,284,073-82,284,101+ (250+ ticks, main room's
 * spawn starved to 0 upgraders, extensions stuck at 1150/1900):
 *
 *   builder @33,28  path[0] = 34,29  moving  pathRetry 1
 *   Filler  @34,29  path[0] = 33,28  moving  pathRetry 1   (head-on)
 *   filler  @35,30  path[0] = 34,29  moving  pathRetry 1   (queued behind)
 *
 * Two of them contend for 34,29 every tick, the engine picks one, the loser
 * cannot vacate, and SwapPositionWithCreep refuses to shove any of them
 * because all three are "moving" - i.e. all three are TRYING to move, which is
 * precisely the state a jammed creep is in. Nothing in the loop can break it.
 *
 * `_still` counts consecutive ticks spent trying to move without changing tile
 * and without fatigue to blame (`memory.moving` read in preRun is last tick's
 * value: every role clears it at the top of run()). At STUCK_STILL_TICKS the
 * creep repaths around the tile it could not enter and sidesteps after its
 * role has run; from 2 ticks on, SwapPositionWithCreep may shove it.
 * ---------------------------------------------------------------------------
 */
const STUCK_STILL_TICKS = 3;
/**
 * How long `memory._blockedBy` (the tile a creep could not step onto) keeps
 * steering repaths and sidesteps away from it. Mirrors the constant of the
 * same name in creepFunctions.ts, which is where the record is consumed by
 * MoveCostMatrixRoadPrio; neither file exports to the other.
 */
const BLOCKED_FRESH_FOR = 5;

/** preRun verdicts: which damper, if any, wants the post-role sidestep. */
const SIDESTEP_NONE = 0;
const SIDESTEP_OSC = 1;
const SIDESTEP_WEDGED = 2;

/**
 * Roles that alternate between two tiles ON PURPOSE — a rampart manner
 * tracking a hostile that paces outside the wall looks exactly like a
 * livelock, and shoving it off its rampart is far worse than the oscillation.
 * The fill layer, which is where the real livelocks are, is untouched by this.
 */
const OSC_EXEMPT_ROLES: { [role: string]: boolean } = {
  RampartDefender: true,
  RampartErector: true,
  RampartUpgrader: true,
  Guard: true,
  defender: true,
  healer: true,
  attacker: true,
  RangedAttacker: true,
  mosquito: true,
  ram: true,
  Escort: true,
  Priest: true,
  DrainTower: true,
  Dismantler: true,
};

const packPos = (creep: any): number => creep.pos.x + creep.pos.y * 50;

/**
 * True when the trail alternates between exactly two tiles.
 *
 * The trail is COMPRESSED — a position is only appended when it differs from
 * the previous one — because creep speed is not one tile per tick. A heavy
 * maintainer with fatigue moves every other tick, so its raw history reads
 * A,A,B,B,A,A and a strict-alternation test over raw samples misses it
 * entirely. That is exactly what happened on the first live run: E11S2's
 * Maintainer-1032589 / RampartErector-1687804 pair swapped 18,39 <-> 19,38 for
 * 114 ticks with the damper installed and never tripped it.
 */
function isStrictPingPong(trail: number[]): boolean {
  // Indexed off the tail rather than slice()d: this runs for every creep in
  // the fleet every tick, and the copy was the expensive half of it.
  const len = trail ? trail.length : 0;
  if (len < OSC_WINDOW) return false;
  const s = len - OSC_WINDOW;
  const a = trail[s];
  const b = trail[s + 1];
  if (a === b) return false;
  for (let i = 0; i < OSC_WINDOW; i++) {
    if (trail[s + i] !== (i % 2 === 0 ? a : b)) return false;
  }
  return true;
}

/**
 * Ping-pong detection that survives an INTERLOPER tile.
 *
 * isStrictPingPong() above requires the window to be A-B-A-B-A-B-A-B with no
 * exceptions, so a single third tile anywhere in the eight samples hides the
 * livelock completely. That is not a corner case — it is the common case. Read
 * straight out of the bot's own `_ph` buffers during the measurement window:
 *
 *   Carrier-51199-E1S4  [1133,1084,1135,1084,1135,1084,1135,1136]
 *   Carrier-44090-E2S8  [757,708,709,708,709,708,709,659]
 *   Carrier-98457-E1S4  [1031,1032,1031,1032,1031,1082,1083,1084]
 *
 * All three are two-tile shuffles bracketed by one or two stray tiles, and the
 * strict test rejects every one of them. 54% of creeps with a full history
 * buffer showed an A-B-A reversal; 36 of 67 creeps were doing it at once.
 *
 * So: take the two most-visited tiles in the window, allow up to two samples
 * that are neither, drop those, compress the consecutive duplicates that
 * removing them creates, and require what is left to be a real alternation. The
 * trail itself is already compressed on push (a position is only appended when
 * it differs from the previous one), so the compression here only has to undo
 * the joins made by dropping the interlopers.
 */
const OSC_MAX_INTERLOPERS = 2;
const OSC_MIN_ALTERNATION = 5;

/*
 * Allocation-free rewrite of the same test.
 *
 * This is on the per-creep-per-tick path for the whole fleet, and the original
 * spelling cost a slice(), a counts object, an Object.keys(), a map() that
 * boxed every distinct tile into an object and a sort() — five allocations per
 * creep per tick to rank eight small integers. The window is fixed at
 * OSC_WINDOW, so the top two tiles can be picked with two nested loops over at
 * most eight elements and nothing on the heap.
 *
 * Tie-break note, so this stays byte-identical to what it replaced:
 * Object.keys() hands back integer-like keys in ASCENDING numeric order and
 * Array#sort is stable, so equal counts used to resolve to the SMALLER packed
 * position. `n > bestN || (n === bestN && p < bestPos)` is that same ordering.
 */
function isOscillating(trail: number[]): boolean {
  const len = trail ? trail.length : 0;
  if (len < OSC_WINDOW) return false;
  const s = len - OSC_WINDOW;

  let aPos = -1;
  let aN = 0;
  let bPos = -1;
  let bN = 0;
  let distinct = 0;
  for (let i = s; i < len; i++) {
    const p = trail[i];
    let firstSeen = true;
    for (let j = s; j < i; j++) {
      if (trail[j] === p) {
        firstSeen = false;
        break;
      }
    }
    if (!firstSeen) continue;
    distinct++;
    let n = 0;
    for (let j = s; j < len; j++) {
      if (trail[j] === p) n++;
    }
    if (n > aN || (n === aN && p < aPos)) {
      bPos = aPos;
      bN = aN;
      aPos = p;
      aN = n;
    } else if (n > bN || (n === bN && p < bPos)) {
      bPos = p;
      bN = n;
    }
  }
  if (distinct < 2) return false;

  // both tiles have to be visited repeatedly, or this is just a walk
  if (aN < 3 || bN < 2) return false;
  if (OSC_WINDOW - (aN + bN) > OSC_MAX_INTERLOPERS) return false;

  let comp = 0;
  let last = -1;
  for (let i = s; i < len; i++) {
    const p = trail[i];
    if (p !== aPos && p !== bPos) continue;
    if (p === last) continue;
    last = p;
    comp++;
  }
  return comp >= OSC_MIN_ALTERNATION;
}

/** the id this creep is currently walking to, whatever the role calls it */
function currentTargetId(creep: any): string | undefined {
  const m = creep.memory;
  // signifer parks on memory.healtarget (the ram); without it the damper
  // treats the approach shuffle as a livelock and sidesteps off the duo
  return m.t || m.locked || m.MoveTargetId || m.healtarget || undefined;
}

/** wipe every movement cache this bot keeps, so next tick re-plans from zero */
function clearMovement(creep: any): void {
  creep.memory.path = false;
  delete creep.memory.MoveTargetId;
  delete creep.memory._move;
  delete creep.memory._trav;
  delete creep.memory.stuckAt;
  delete creep.memory.stuckFor;
  delete creep.memory.pfStuckAt;
  delete creep.memory.pfStuckFor;
  delete creep.memory.tryT;
  delete creep.memory.tryFor;
  delete creep.memory.tryD;
  // the retry bookkeeping of stepCachedPath belongs to the path we just threw
  // away; left behind it unshifts a step of the OLD path onto the new one
  delete creep.memory.pathStep;
  delete creep.memory.pathStepT;
  delete creep.memory.pathRetry;
}

/**
 * One legal step onto a random neighbouring tile, free tiles preferred.
 *
 * Occupied tiles are a fallback rather than a hard no: the livelock this
 * breaks is BY DEFINITION a hub so busy that both parties keep finding the
 * other in the way, so "only step somewhere empty" is exactly the rule that
 * would leave the two of them exactly where they are. Shoving is what the rest
 * of the movement layer does in this situation too (SwapPositionWithCreep).
 */
/** occupied-only shoves of the same partner this many times → blame the target */
const OSC_SHOVE_REPEATS = 3;

function randomSidestep(creep: any, wedged?: boolean): boolean {
  const terrain = creep.room.getTerrain();
  const free: { dir: number; road: boolean; swamp: boolean }[] = [];
  const occupied: { dir: number; id: string }[] = [];
  // the tile we already failed to enter is the one direction that is certainly
  // no help; _blockedBy is written by preRun / resyncCachedPath
  const b = creep.memory._blockedBy;
  const avoid =
    b &&
    b.t >= Game.time - BLOCKED_FRESH_FOR &&
    Math.abs(b.x - creep.pos.x) <= 1 &&
    Math.abs(b.y - creep.pos.y) <= 1
      ? creep.pos.getDirectionTo(new RoomPosition(b.x, b.y, creep.room.name))
      : 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const x = creep.pos.x + dx;
      const y = creep.pos.y + dy;
      if (x < 1 || x > 48 || y < 1 || y > 48) continue;
      const tile = terrain.get(x, y);
      if (tile === TERRAIN_MASK_WALL) continue;
      let blocked = false;
      let road = false;
      for (const s of creep.room.lookForAt(LOOK_STRUCTURES, x, y)) {
        if (s.structureType === STRUCTURE_ROAD) road = true;
        else if ((OBSTACLE_OBJECT_TYPES as any).indexOf(s.structureType) !== -1) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const dir = creep.pos.getDirectionTo(new RoomPosition(x, y, creep.room.name));
      const there = creep.room.lookForAt(LOOK_CREEPS, x, y);
      if (there.length > 0) occupied.push({ dir: dir, id: there[0].id });
      else free.push({ dir: dir, road: road, swamp: !road && tile === TERRAIN_MASK_SWAMP });
    }
  }
  if (free.length) {
    let pool = free;
    if (avoid) {
      const away = pool.filter((f) => f.dir !== avoid);
      if (away.length) pool = away;
    }
    if (wedged) {
      // a wedged creep is wedged ON the road with the rest of the queue behind
      // it; stepping onto the next road tile only moves the knot one tile
      // along. Bare swamp is not the escape either: 20 non-MOVE parts pay 200
      // fatigue for that one tile, which parks the creep for ~20 ticks.
      const offRoad = pool.filter((f) => !f.road && !f.swamp);
      if (offRoad.length) pool = offRoad;
    }
    const dir = pool[Math.floor(Math.random() * pool.length)].dir as DirectionConstant;
    delete creep.memory._oscP;
    delete creep.memory._oscRep;
    creep.move(dir);
    creep.memory.moving = true;
    return true;
  }
  if (!occupied.length) return false;
  // 2-tile pocket: shoving the same partner just continues the A-B swap.
  // Prefer a different neighbour; if there is none, count repeats so preRun
  // can blacklist the contended target after OSC_SHOVE_REPEATS.
  const last = creep.memory._oscP;
  const others = last ? occupied.filter((o) => o.id !== last) : occupied;
  const pickFrom = others.length ? others : occupied;
  const pick = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  if (pick.id === last) creep.memory._oscRep = (creep.memory._oscRep || 0) + 1;
  else creep.memory._oscRep = 1;
  creep.memory._oscP = pick.id;
  creep.SwapPositionWithCreep(pick.dir);
  creep.move(pick.dir);
  creep.memory.moving = true;
  return true;
}

/**
 * Pre-run: keep the position history, drop targets that are known bad, and
 * decide whether this creep needs a forced sidestep after its role has run.
 */
function preRun(creep: any): number {
  const m = creep.memory;

  // `danger` is written exactly once, at spawn time, for EnergyMiners only -
  // a snapshot of the HOME room's alarm - but it is read all over (the
  // flee-reset in energyMiner.ts, repair.ts, creepFunctions) as if it were
  // live. A miner spawned during a raid therefore stayed "in danger" for its
  // whole life: pinned in the expensive avoidHostiles mover and never able to
  // reset memory.fleeing. Refresh it from the home room each tick. Scoped to
  // creeps that already HAVE the field so the dormant danger branches in
  // roles that never set it stay dormant.
  if (m.danger !== undefined) {
    const home = Game.rooms[m.homeRoom];
    m.danger = !!(home && home.memory.danger);
  }

  // Sticky-target sanity. memory.locked and memory.t survive for the creep's
  // whole life in most roles (carry, sweeper, FakeFiller, filler), so a target
  // that became undeliverable AFTER it was picked is otherwise held forever.
  // One check here covers every role instead of every call site.
  if (m.locked && isUndeliverable(creep.room, m.locked)) {
    m.locked = false;
    clearMovement(creep);
  }
  if (m.t && isUndeliverable(creep.room, m.t)) {
    m.t = false;
    clearMovement(creep);
  }

  // Standing-still counter, kept BEFORE the trail is touched: the trail only
  // grows when the tile changes, and it is wiped when it goes stale, so it
  // cannot answer "how long have I been on this tile" by itself. Every role
  // clears memory.moving at the top of run(), so the value read here is last
  // tick's: true means the creep asked to move and is still here. Fatigue
  // resets the count - a heavy body resting between steps is not blocked.
  // Maintained for every creep (exempt roles included) because
  // SwapPositionWithCreep reads it on NEIGHBOURS to decide whether a "moving"
  // creep is actually blocked and may be shoved.
  const here = packPos(creep);
  const sameRoom = m._phr === creep.room.name;
  const prevPh: number[] = m._ph;
  const stillHere = sameRoom && !!prevPh && prevPh.length > 0 && prevPh[prevPh.length - 1] === here;
  if (stillHere && m.moving && creep.fatigue === 0) {
    m._still = (m._still || 0) + 1;
  } else if (m._still !== undefined) {
    delete m._still;
  }
  // _blockedBy is a bare {x,y,t} with no room on it, so a room change turns it
  // into a coordinate in the wrong room. Expiring it here as well as in
  // creepFunctions keeps the key from lingering on a creep whose mover never
  // reads it.
  if (m._blockedBy && (!sameRoom || m._blockedBy.t < Game.time - BLOCKED_FRESH_FOR)) {
    delete m._blockedBy;
  }

  if (!sameRoom || Game.time - (m._phT || 0) > OSC_TRAIL_STALE) {
    m._phr = creep.room.name;
    m._ph = [];
  }
  const ph: number[] = m._ph || (m._ph = []);
  if (!ph.length || ph[ph.length - 1] !== here) {
    ph.push(here);
    m._phT = Game.time;
    if (ph.length > OSC_WINDOW) ph.splice(0, ph.length - OSC_WINDOW);
  }

  if (OSC_EXEMPT_ROLES[m.role]) return SIDESTEP_NONE;
  if (creep.room.memory && creep.room.memory.danger) return SIDESTEP_NONE;
  /*
   * Exit band. Creeps shuffling on x/y 0-1 or 48-49 are being handed back and
   * forth by the room-transition code, so dropping their (usually cross-room)
   * target is pure harm — but excluding them from the damper ENTIRELY meant the
   * 13% of the fleet measured wedged on border tiles got no help at all from
   * either subsystem. moveToRoomAvoidEnemyRooms now steps such a creep off the
   * border itself (see stepOffExit); this is the backstop for the creeps that
   * are not in a room-travel state at all.
   *
   * Stricter window rather than no window: a border creep must be in a PURE
   * two-tile shuffle, and its target is never blamed.
   */
  const p = creep.pos;
  const onBorder = p.x <= 1 || p.x >= 48 || p.y <= 1 || p.y >= 48;
  if (Game.time - (m._oscT || 0) < OSC_COOLDOWN) return SIDESTEP_NONE;

  // Wedged in place: trying to move, unfatigued, and not one tile of progress
  // for STUCK_STILL_TICKS. No trail can show this (see the header) and no
  // other subsystem escalates it, which is how three creeps held one diagonal
  // road for 250 ticks. Remember the tile that could not be entered so the
  // repath the role is about to do routes AROUND it instead of reproducing the
  // same path, then wipe the movement cache and ask for a sidestep.
  if ((m._still || 0) >= STUCK_STILL_TICKS) {
    // Which tile could we not enter? stepCachedPath shifts a step off the path
    // as soon as the intent is ACCEPTED (move() returns OK for an intent the
    // engine later drops), so at pre-run time the blocked tile is last tick's
    // pathStep and path[0] is already the step after it. Fall back to path[0]
    // for the movers that do not keep a pathStep. Requiring one of the two —
    // adjacent, and not the tile we are standing on — is also what keeps the
    // handful of roles that never clear memory.moving (scout, WallClearer,
    // Sign, annoy) from being sidestepped off a job they are parked on: they
    // are not inside a mover, so they have no step pending.
    const aim =
      m.pathStepT === Game.time - 1 && m.pathStep
        ? m.pathStep
        : Array.isArray(m.path) && m.path.length
        ? m.path[0]
        : null;
    const pending =
      aim &&
      typeof aim.x === "number" &&
      typeof aim.y === "number" &&
      Math.abs(aim.x - p.x) <= 1 &&
      Math.abs(aim.y - p.y) <= 1 &&
      !(aim.x === p.x && aim.y === p.y);
    if (pending) {
      m._blockedBy = { x: aim.x, y: aim.y, t: Game.time };
      delete m._still;
      m._ph = [];
      clearMovement(creep);
      if (Game.time % 200 < 2) {
        logAlways(
          `wedge ${creep.room.name}: ${m.role} ${creep.name} stuck at ` +
            `${p.x},${p.y} behind ${aim.x},${aim.y} — repath + sidestep`,
        );
      }
      return SIDESTEP_WEDGED;
    }
  }

  if (onBorder) {
    if (!isStrictPingPong(ph)) return SIDESTEP_NONE;
    // _oscT is stamped only after the post-role sidestep actually issues —
    // a fatigued creep would otherwise burn the cooldown and keep swapping.
    m._ph = [];
    clearMovement(creep);
    return SIDESTEP_OSC;
  }
  if (!isOscillating(ph)) return SIDESTEP_NONE;

  // A strict A-B-A-B window is a special case of an oscillating one, so this
  // can only be true below the guard above — computing it before the guard
  // (as this used to) walked the trail a second time for every creep in the
  // fleet on every tick, and all but a handful of them are not oscillating.
  const strict = isStrictPingPong(ph);
  const targetId = currentTargetId(creep);
  const targetObj: any = targetId ? Game.getObjectById(targetId) : null;
  // Cross-room locked/t is not a local approach fight. Treating it as a
  // real target used to early-return (no sidestep for the whole trip);
  // treat as no-target so we still damp, and never blacklist the far object.
  const crossRoom = !!(targetObj && targetObj.pos && targetObj.pos.roomName !== creep.room.name);
  const target = crossRoom ? null : targetObj;
  // A creep already next to what it wants AND not trying to travel is
  // working, not livelocked — shuttling beside a container is legitimate.
  if (target && target.pos && creep.pos.isNearTo(target) && !m.moving) return SIDESTEP_NONE;

  m._ph = [];

  const contention =
    !target || !target.pos || creep.pos.getRangeTo(target) <= OSC_CONTENTION_RANGE;
  const shoveRepeats = m._oscRep || 0;
  // Only a PURE two-tile shuffle is evidence about the target. The
  // interloper-tolerant test also matches a creep that shuffled for a few ticks
  // and then walked on, and writing that room's storage/controller off on that
  // basis is far worse than the oscillation — such a creep gets the repath and
  // the sidestep, never the blacklist.
  if (targetId && !crossRoom && strict && (!contention || shoveRepeats >= OSC_SHOVE_REPEATS) && blacklistFillTarget(creep.room, targetId)) {
    // far from the target and going nowhere: the target is the problem.
    // blacklistFillTarget() vetoes the room backbone, and when it does there
    // is nothing to retarget to either — leave the creep its storage.
    const what =
      target && target.structureType
        ? `${target.structureType}@${target.pos.x},${target.pos.y}`
        : targetId;
    logAlways(
      `osc ${creep.room.name}: ${m.role} ${creep.name} ping-ponged at ` +
        `${creep.pos.x},${creep.pos.y} chasing ${what} — dropped, retargeting`,
    );
    if (m.t === targetId) m.t = false;
    if (m.locked === targetId) m.locked = false;
  } else if (Game.time % 200 < 2) {
    // contention is common and self-resolving; one line per 200 ticks is
    // enough to see a hub that is permanently jammed without flooding
    logAlways(
      `osc ${creep.room.name}: ${m.role} ${creep.name} contending at ` +
        `${creep.pos.x},${creep.pos.y} — repathing + sidestep`,
    );
  }
  clearMovement(creep);
  return SIDESTEP_OSC;
}

/**
 * Per-role CPU: sum of role.run() cost and creep count per tick, folded into
 * an EMA on the heap and flushed to Memory.CPU.roles every 20 ticks as
 * { role: { cpu: <avg per tick for all creeps of the role>, n: <avg count> } }.
 * The creeps phase is ~12 of the 20 CPU on shard3; this says which roles.
 */
const roleTickCpu: { [role: string]: number } = {};
const roleTickN: { [role: string]: number } = {};
const roleEma: { [role: string]: { cpu: number; n: number } } = {};
let roleTick = -1;
const ROLE_EMA_ALPHA = 0.05;
function noteRoleCpu(role: string, used: number): void {
    if (roleTick !== Game.time) {
        // fold the previous tick's sums into the EMA before starting a new tick
        for (const r in roleTickCpu) {
            const prev = roleEma[r];
            const cpu = roleTickCpu[r], n = roleTickN[r];
            roleEma[r] = prev
                ? { cpu: prev.cpu + ROLE_EMA_ALPHA * (cpu - prev.cpu), n: prev.n + ROLE_EMA_ALPHA * (n - prev.n) }
                : { cpu, n };
            roleTickCpu[r] = 0; roleTickN[r] = 0;
        }
        if (Game.time % 20 === 0 && Memory.CPU) {
            const out: any = {};
            for (const r in roleEma) out[r] = { cpu: Math.round(roleEma[r].cpu * 100) / 100, n: Math.round(roleEma[r].n * 10) / 10 };
            Memory.CPU.roles = out;
        }
        roleTick = Game.time;
    }
    roleTickCpu[role] = (roleTickCpu[role] || 0) + used;
    roleTickN[role] = (roleTickN[role] || 0) + 1;
}

function inferRoleFromName(name: string): string | undefined {
    const prefix = String(name || "").split("-")[0];
    if (!prefix) return undefined;
    if (global.ROLES[prefix]) return prefix;
    const lower = prefix.charAt(0).toLowerCase() + prefix.slice(1);
    if (global.ROLES[lower]) return lower;
    if (prefix === "Carrier") return "carry";
    return undefined;
}

function RunCreepManager(name) {
    try {
        let creep = Game.creeps[name];
        if(!creep) {
            delete Memory.creeps[name];
            return;
        }

        if(creep.memory.role == undefined) {
            // VPS spawnCreep can leave Memory.creeps[name] as {}. The old
            // ttl-grace-then-suicide loop wiped the empire. Restore from the
            // name prefix; if we cannot, skip the tick — never suicide.
            const inferred = inferRoleFromName(name);
            if (inferred && global.ROLES[inferred]) {
                creep.memory.role = inferred;
                logAlways("[memory] restored role " + inferred + " from name " + name + " @" + creep.room.name);
            } else {
                if ((creep.ticksToLive || 1500) % 100 === 0) {
                    logAlways("[memory] role-undefined skip " + name + " ttl=" + creep.ticksToLive + " @" + creep.room.name);
                }
                return;
            }
        }

        if (!global.ROLES[creep.memory.role]) {
            console.log(`Unknown role: ${creep.memory.role} for creep ${name}`);
            return;
        }

        let sidestep = SIDESTEP_NONE;
        if (!creep.spawning) {
            sidestep = preRun(creep);
        }

        let creepUsed = Game.cpu.getUsed();
        global.ROLES[creep.memory.role].run(creep);
        const roleUsed = Game.cpu.getUsed() - creepUsed;
        noteRoleCpu(creep.memory.role, roleUsed);
        if(global.profiler) {
          console.log(creep.memory.role, "used", roleUsed.toFixed(2))
        }

        // AFTER the role: the last move() of a tick is the one the engine
        // executes, so this overrides whatever failing step the role queued
        // and guarantees the two-tile cycle is broken.
        if (sidestep !== SIDESTEP_NONE && Game.creeps[name] && !creep.fatigue) {
            if (randomSidestep(creep, sidestep === SIDESTEP_WEDGED)) {
                creep.memory._oscT = Game.time;
            }
        }
    } catch (error: any) {
        // include the top stack frames — a bare message ("Invalid arguments in
        // RoomPosition constructor") is undiagnosable once the creep dies
        const stack = error && error.stack ? String(error.stack).split("\n").slice(0, 4).join(" | ") : String(error);
        const role = (Memory.creeps && Memory.creeps[name] && (Memory.creeps[name] as any).role) || "?";
        logAlways(`Error running creep ${name} (role ${role}): ${stack}`);
        // a poisoned movement cache (dest with a bad room name) re-throws every
        // tick until the creep dies — wipe it so the next tick starts clean
        if (/Invalid room name|Invalid arguments in RoomPosition/.test(String(error)) && Memory.creeps && Memory.creeps[name]) {
            delete (Memory.creeps[name] as any)._move;
            delete (Memory.creeps[name] as any)._trav;
        }
    }
}

export default RunCreepManager;
