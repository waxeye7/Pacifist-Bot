/**
 * WAR / REINFORCE — consume DistressSignals.reinforce_me.
 *
 * rooms.defence.ts raises the flag; nothing used to read it. A neighbour
 * sends one Guard via the existing SGD primitive (same body observe uses
 * for "hostiles, no towers"). We do not invent a new combat dispatcher —
 * rooms.observe.ts already decides quad vs duo vs Guard for offence.
 *
 * This is home-defence only. A RangedQuad into our own living room is the
 * wrong tool; SGD's Guard even promotes to RampartDefender on arrival.
 */

import { ownedRooms } from "./reach";
import { roomDistance } from "./geo";
import { logAlways } from "utils/Logger";

const HELP_RANGE = 5;
const HELP_COOLDOWN = 200;
const GUARD_COST = 650;
/** Same 5A/5M body rooms.observe uses for leftover-creep cleanup. */
const GUARD_BODY: BodyPartConstant[] = [
  MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE,
];

function alreadyHelping(target: string): boolean {
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (!c || !c.memory) continue;
    if (c.memory.role === "Guard" && c.memory.targetRoom === target) return true;
  }
  const owned = ownedRooms();
  for (let i = 0; i < owned.length; i++) {
    const room = Game.rooms[owned[i]];
    const list = room && room.memory && room.memory.spawn_list;
    if (!list) continue;
    for (let j = 0; j + 2 < list.length; j += 3) {
      const mem = list[j + 2] && (list[j + 2] as any).memory;
      if (mem && mem.role === "Guard" && mem.targetRoom === target) return true;
    }
  }
  const cmds = Memory.commandsToExecute;
  if (cmds) {
    for (let i = 0; i < cmds.length; i++) {
      if (cmds[i] && cmds[i].targetRoom === target) return true;
    }
  }
  return false;
}

function pickHelper(target: string): Room | null {
  const owned = ownedRooms();
  let best: Room | null = null;
  let bestD = Infinity;
  for (let i = 0; i < owned.length; i++) {
    if (owned[i] === target) continue;
    const room = Game.rooms[owned[i]];
    if (!room || !room.controller || !room.controller.my) continue;
    if (room.memory && room.memory.danger) continue;
    if (room.energyAvailable < GUARD_COST) continue;
    if (!room.find(FIND_MY_SPAWNS).length) continue;
    const d = roomDistance(owned[i], target);
    if (d > HELP_RANGE || d >= bestD) continue;
    best = room;
    bestD = d;
  }
  return best;
}

export function runReinforce(): void {
  const sig = Memory.DistressSignals as any;
  if (!sig || !sig.reinforce_me) return;

  const target = sig.reinforce_me;
  const dest = Game.rooms[target];
  if (!dest || !dest.controller || !dest.controller.my || !dest.memory.danger) return;

  if (typeof sig.sent === "number" && Game.time - sig.sent < HELP_COOLDOWN) return;
  if (alreadyHelping(target)) return;

  const helper = pickHelper(target);
  if (!helper) return;
  if (!helper.memory.spawn_list) helper.memory.spawn_list = [];

  const result = global.SGD(helper.name, target, GUARD_BODY);
  if (result !== "Success!") return;
  sig.sent = Game.time;
  logAlways("[war] reinforce", target, "from", helper.name, "via SGD");
}

export function reinforceStatus(): string {
  const sig = Memory.DistressSignals as any;
  if (!sig || !sig.reinforce_me) return "distress: (none)";
  const age = typeof sig.sent === "number" ? Game.time - sig.sent : -1;
  return `distress: ${sig.reinforce_me}  lastSent=${age < 0 ? "never" : age + "t ago"}  helping=${alreadyHelping(sig.reinforce_me)}`;
}
