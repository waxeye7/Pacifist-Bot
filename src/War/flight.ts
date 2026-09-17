import { getIntel } from "./intel";

/**
 * WAR / FLIGHT — is something already committed to this room?
 *
 * Per-kit, not "any command on this target". A queued CCK must not block a
 * Guard, and observeWaveInFlight's spawn_list walk (list[i].memory) is wrong
 * for the flat [body, name, opts] queue.
 */

const GUARD = ["Guard"];
const DUO = ["ram", "signifer"];
const QUAD = ["SquadCreepA", "SquadCreepB", "SquadCreepY", "SquadCreepZ"];
const CCK = ["CCK"];
const SOLOMON = ["Solomon"];
const MOSQUITO = ["mosquito"];
const EXPENSIVE = QUAD.concat(SOLOMON).concat(["FreedomFighter"]);

/**
 * What a creep/queue entry aims at. Squad creeps carry NO targetRoom — SQR /
 * SQM / SQD stamp `targetPosition` (a RoomPosition) on SquadCreepA only, so a
 * marching quad used to be invisible to every per-target in-flight check for
 * its whole ~1500-tick walk. The leader's targetPosition.roomName answers for
 * the whole squad.
 */
function aimsAt(memory: any, target: string): boolean {
  if (!memory) return false;
  if (memory.targetRoom === target) return true;
  const tp = memory.targetPosition;
  return !!(tp && tp.roomName === target);
}

function liveOn(target: string, roles: string[]): number {
  let n = 0;
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (!c || !c.memory || !aimsAt(c.memory, target)) continue;
    const role = c.memory.role;
    if (role && roles.indexOf(role) >= 0) n++;
    else if (role && role.indexOf("SquadCreep") === 0 && roles === QUAD) n++;
  }
  return n;
}

function queuedOn(target: string, roles: string[]): number {
  let n = 0;
  for (const rName in Game.rooms) {
    const r = Game.rooms[rName];
    if (!r || !r.controller || !r.controller.my || !r.memory.spawn_list) continue;
    const list = r.memory.spawn_list;
    for (let i = 0; i + 2 < list.length; i += 3) {
      const mem = list[i + 2] && (list[i + 2] as any).memory;
      if (!aimsAt(mem, target)) continue;
      if (mem.role && roles.indexOf(mem.role) >= 0) n++;
    }
  }
  return n;
}

/** Empire-wide count of a role sitting in spawn queues (liveOn's queue half). */
export function countQueued(roles: string[]): number {
  let n = 0;
  for (const rName in Game.rooms) {
    const r = Game.rooms[rName];
    if (!r || !r.controller || !r.controller.my || !r.memory.spawn_list) continue;
    const list = r.memory.spawn_list;
    for (let i = 0; i + 2 < list.length; i += 3) {
      const mem = list[i + 2] && (list[i + 2] as any).memory;
      if (mem && mem.role && roles.indexOf(mem.role) >= 0) n++;
    }
  }
  return n;
}

function commandsOn(target: string, formation?: string): number {
  const cmds = Memory.commandsToExecute;
  if (!cmds) return 0;
  let n = 0;
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (!c || c.targetRoom !== target) continue;
    if (!formation || c.formation === formation) n++;
  }
  return n;
}

export function guardsOn(target: string): number {
  return liveOn(target, GUARD) + queuedOn(target, GUARD);
}

export function guardInFlight(target: string): boolean {
  return guardsOn(target) > 0;
}

/** Any live/queued Guard whose target is a player-owned room. */
export function guardOnPlayerRoom(): boolean {
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (!c || !c.memory || c.memory.role !== "Guard" || !c.memory.targetRoom) continue;
    const rec = getIntel(c.memory.targetRoom);
    if (rec && rec.o) return true;
  }
  for (const rName in Game.rooms) {
    const r = Game.rooms[rName];
    if (!r || !r.controller || !r.controller.my || !r.memory.spawn_list) continue;
    const list = r.memory.spawn_list;
    for (let i = 0; i + 2 < list.length; i += 3) {
      const mem = list[i + 2] && (list[i + 2] as any).memory;
      if (!mem || mem.role !== "Guard" || !mem.targetRoom) continue;
      const rec = getIntel(mem.targetRoom);
      if (rec && rec.o) return true;
    }
  }
  return false;
}

export function duoInFlight(target: string): boolean {
  return liveOn(target, DUO) + queuedOn(target, DUO) + commandsOn(target, "Duo") + commandsOn(target, "ToughDuo") > 0;
}

export function quadInFlight(target: string): boolean {
  return (
    liveOn(target, QUAD) +
      queuedOn(target, QUAD) +
      commandsOn(target, "RangedQuad") +
      commandsOn(target, "MeleeQuad") +
      commandsOn(target, "DismantleQuad") >
    0
  );
}

export function cckInFlight(target: string): boolean {
  return liveOn(target, CCK) + queuedOn(target, CCK) + commandsOn(target, "CCK") > 0;
}

export function mosquitoInFlight(target: string): boolean {
  if (liveOn(target, MOSQUITO) + queuedOn(target, MOSQUITO) > 0) return true;
  const rows = Memory.e && Memory.e.mosquito;
  if (rows) {
    for (let i = 0; i < rows.length; i++) if (rows[i] && rows[i].n === target && rows[i].ts > 0) return true;
  }
  return false;
}

export function solomonInFlight(target: string): boolean {
  return liveOn(target, SOLOMON) + queuedOn(target, SOLOMON) + commandsOn(target, "Singleton") > 0;
}

function roleIsExpensive(role: string | undefined): boolean {
  if (!role) return false;
  return EXPENSIVE.indexOf(role) >= 0 || role.indexOf("SquadCreep") === 0;
}

/** Live, queued, or commanded expensive kit anywhere. */
export function expensiveInFlight(): boolean {
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (c && roleIsExpensive(c.memory && c.memory.role)) return true;
  }
  for (const rName in Game.rooms) {
    const r = Game.rooms[rName];
    if (!r || !r.controller || !r.controller.my || !r.memory.spawn_list) continue;
    const list = r.memory.spawn_list;
    for (let i = 0; i + 2 < list.length; i += 3) {
      const mem = list[i + 2] && (list[i + 2] as any).memory;
      if (mem && roleIsExpensive(mem.role)) return true;
    }
  }
  const cmds = Memory.commandsToExecute;
  if (cmds) {
    for (let i = 0; i < cmds.length; i++) {
      const f = cmds[i] && cmds[i].formation;
      if (f === "RangedQuad" || f === "MeleeQuad" || f === "DismantleQuad" || f === "Singleton" || f === "CCKparty") {
        return true;
      }
    }
  }
  return false;
}

/** SQR only looks at LIVE squad creeps in the home. Queued ones are invisible to it. */
export function homeHasSquad(home: string): boolean {
  const room = Game.rooms[home];
  if (!room) return false;
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (!c || !c.memory) continue;
    if (c.memory.homeRoom === home && roleIsExpensive(c.memory.role)) return true;
    if (c.room.name === home && c.memory.role && c.memory.role.indexOf("SquadCreep") === 0) return true;
  }
  const list = room.memory && room.memory.spawn_list;
  if (list) {
    for (let i = 0; i + 2 < list.length; i += 3) {
      const mem = list[i + 2] && (list[i + 2] as any).memory;
      if (mem && roleIsExpensive(mem.role)) return true;
    }
  }
  return false;
}

export function countLive(roles: string[]): number {
  let n = 0;
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    const role = c && c.memory && c.memory.role;
    if (role && roles.indexOf(role) >= 0) n++;
    else if (role && role.indexOf("SquadCreep") === 0 && roles === QUAD) n++;
  }
  return n;
}

export const ROLES = { GUARD, DUO, QUAD, CCK, SOLOMON, MOSQUITO };
