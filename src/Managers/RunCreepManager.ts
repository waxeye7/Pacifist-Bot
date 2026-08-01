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
 * Roles that alternate between two tiles ON PURPOSE — a rampart manner
 * tracking a hostile that paces outside the wall looks exactly like a
 * livelock, and shoving it off its rampart is far worse than the oscillation.
 * The fill layer, which is where the real livelocks are, is untouched by this.
 */
const OSC_EXEMPT_ROLES: { [role: string]: boolean } = {
  RampartDefender: true,
  RampartErector: true,
  rampartUpgrader: true,
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
function isOscillating(trail: number[]): boolean {
  if (!trail || trail.length < OSC_WINDOW) return false;
  const w = trail.slice(trail.length - OSC_WINDOW);
  const a = w[0];
  const b = w[1];
  if (a === b) return false;
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== (i % 2 === 0 ? a : b)) return false;
  }
  return true;
}

/** the id this creep is currently walking to, whatever the role calls it */
function currentTargetId(creep: any): string | undefined {
  const m = creep.memory;
  return m.t || m.locked || m.MoveTargetId || undefined;
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
function randomSidestep(creep: any): void {
  const terrain = creep.room.getTerrain();
  const free: number[] = [];
  const occupied: number[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const x = creep.pos.x + dx;
      const y = creep.pos.y + dy;
      if (x < 1 || x > 48 || y < 1 || y > 48) continue;
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
      let blocked = false;
      for (const s of creep.room.lookForAt(LOOK_STRUCTURES, x, y)) {
        if ((OBSTACLE_OBJECT_TYPES as any).indexOf(s.structureType) !== -1) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const dir = creep.pos.getDirectionTo(new RoomPosition(x, y, creep.room.name));
      if (creep.room.lookForAt(LOOK_CREEPS, x, y).length > 0) occupied.push(dir);
      else free.push(dir);
    }
  }
  const options = free.length ? free : occupied;
  if (!options.length) return;
  const dir = options[Math.floor(Math.random() * options.length)] as DirectionConstant;
  if (!free.length) creep.SwapPositionWithCreep(dir);
  creep.move(dir);
  creep.memory.moving = true;
}

/**
 * Pre-run: keep the position history, drop targets that are known bad, and
 * decide whether this creep needs a forced sidestep after its role has run.
 */
function preRun(creep: any): boolean {
  const m = creep.memory;

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

  if (m._phr !== creep.room.name || Game.time - (m._phT || 0) > OSC_TRAIL_STALE) {
    m._phr = creep.room.name;
    m._ph = [];
  }
  const ph: number[] = m._ph || (m._ph = []);
  const here = packPos(creep);
  if (!ph.length || ph[ph.length - 1] !== here) {
    ph.push(here);
    m._phT = Game.time;
    if (ph.length > OSC_WINDOW) ph.splice(0, ph.length - OSC_WINDOW);
  }

  if (OSC_EXEMPT_ROLES[m.role]) return false;
  if (creep.room.memory && creep.room.memory.danger) return false;
  // Exit band. Creeps shuffling on x/y 0-1 or 48-49 are being handed back and
  // forth by the room-transition code, which is a different subsystem with a
  // different fix; dropping their (usually cross-room) target is pure harm.
  const p = creep.pos;
  if (p.x <= 1 || p.x >= 48 || p.y <= 1 || p.y >= 48) return false;
  if (Game.time - (m._oscT || 0) < OSC_COOLDOWN) return false;
  if (!isOscillating(ph)) return false;

  const targetId = currentTargetId(creep);
  const target: any = targetId ? Game.getObjectById(targetId) : null;
  // A target in ANOTHER room says nothing about this creep's local shuffle,
  // and getRangeTo() across rooms is a huge number that would misclassify it
  // as "far from target, blame the target". Let the travel layer own it.
  if (target && target.pos && target.pos.roomName !== creep.room.name) return false;
  // A creep already next to what it wants AND not trying to travel is
  // working, not livelocked — shuttling beside a container is legitimate.
  if (target && target.pos && creep.pos.isNearTo(target) && !m.moving) return false;

  m._oscT = Game.time;
  m._ph = [];

  const contention =
    !target || !target.pos || creep.pos.getRangeTo(target) <= OSC_CONTENTION_RANGE;
  if (targetId && !contention && blacklistFillTarget(creep.room, targetId)) {
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
  return true;
}

function RunCreepManager(name) {
    try {
        let creep = Game.creeps[name];
        if(!creep) {
            delete Memory.creeps[name];
            return;
        }

        if(creep.memory.role == undefined) {
            console.log("i am undefined", name)
            creep.suicide();
            return;
        }

        if (!global.ROLES[creep.memory.role]) {
            console.log(`Unknown role: ${creep.memory.role} for creep ${name}`);
            return;
        }

        let sidestep = false;
        if (!creep.spawning) {
            sidestep = preRun(creep);
        }

        let creepUsed = Game.cpu.getUsed();
        global.ROLES[creep.memory.role].run(creep);
        if(global.profiler) {
          console.log(creep.memory.role, "used", (Game.cpu.getUsed() - creepUsed).toFixed(2))
        }

        // AFTER the role: the last move() of a tick is the one the engine
        // executes, so this overrides whatever failing step the role queued
        // and guarantees the two-tile cycle is broken.
        if (sidestep && Game.creeps[name] && !creep.fatigue) {
            randomSidestep(creep);
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
