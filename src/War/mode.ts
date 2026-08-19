/**
 * WAR / MODE — per-room war-footing assignment (doctrine §3).
 *
 * Computed every tick, applied only when Memory.war.throttle is true.
 * Default is look-don't-touch: warModes() shows what would happen.
 *
 *   FRONT     — room.memory.danger (something is in the living room)
 *   SUPPORT   — adjacent to a FRONT room, or a SKELETON that would downgrade
 *   SKELETON  — everyone else, only while Memory.war.footing is set
 *   NORMAL    — everyone else, when we are not on a war footing
 *
 * Escalate immediately. De-escalate only after MODE_DWELL ticks so spawn
 * queues do not thrash.
 */

import { ownedRooms } from "./reach";
import { roomDistance } from "./geo";

export const MODE_NORMAL = "NORMAL";
export const MODE_SUPPORT = "SUPPORT";
export const MODE_SKELETON = "SKELETON";
export const MODE_FRONT = "FRONT";

export type RoomMode = "NORMAL" | "SUPPORT" | "SKELETON" | "FRONT";

const MODE_DWELL = 500;
/** Escalate out of SKELETON before the downgrade timer gets this low. */
const DOWNGRADE_FLOOR = 10000;

const RANK: { [m: string]: number } = {
  NORMAL: 0,
  SKELETON: 0,
  SUPPORT: 1,
  FRONT: 2,
};

let modeTick = -1;
let modes: { [room: string]: RoomMode } = Object.create(null);

function warMem(): any {
  const M = Memory as any;
  if (!M.war) M.war = {};
  return M.war;
}

function wouldDowngrade(room: Room): boolean {
  const c = room.controller;
  if (!c || !c.my) return false;
  const left = c.ticksToDowngrade || 0;
  return left > 0 && left < DOWNGRADE_FLOOR;
}

function suggestedFor(name: string, front: { [n: string]: boolean }, footing: boolean): RoomMode {
  if (front[name]) return MODE_FRONT;
  for (const other in front) {
    if (roomDistance(name, other) === 1) return MODE_SUPPORT;
  }
  const room = Game.rooms[name];
  if (room && wouldDowngrade(room)) return MODE_SUPPORT;
  return footing ? MODE_SKELETON : MODE_NORMAL;
}

function settle(name: string, want: RoomMode, now: number, prev: { [n: string]: { m: RoomMode; t: number } }): RoomMode {
  const last = prev[name];
  if (!last) return want;
  if (last.m === want) return want;
  if ((RANK[want] || 0) > (RANK[last.m] || 0)) return want;
  if (now - last.t < MODE_DWELL) return last.m;
  return want;
}

/** Recompute modes. Cheap. Safe to call more than once per tick. */
export function refreshModes(): { [room: string]: RoomMode } {
  if (modeTick === Game.time) return modes;

  const mem = warMem();
  const footing = !!mem.footing;
  const owned = ownedRooms();
  const front: { [n: string]: boolean } = Object.create(null);
  for (let i = 0; i < owned.length; i++) {
    const r = Game.rooms[owned[i]];
    if (r && r.memory && r.memory.danger) front[owned[i]] = true;
  }

  if (!mem.mode) mem.mode = {};
  const prev = mem.mode;
  const now = Game.time;
  const next: { [room: string]: RoomMode } = Object.create(null);
  const stored: { [n: string]: { m: RoomMode; t: number } } = {};

  for (let i = 0; i < owned.length; i++) {
    const name = owned[i];
    const want = suggestedFor(name, front, footing);
    const got = settle(name, want, now, prev);
    next[name] = got;
    stored[name] = { m: got, t: prev[name] && prev[name].m === got ? prev[name].t : now };
  }

  mem.mode = stored;
  modes = next;
  modeTick = Game.time;
  return modes;
}

export function getRoomMode(roomName: string): RoomMode {
  refreshModes();
  return modes[roomName] || MODE_NORMAL;
}

export function throttleOn(): boolean {
  const mem = (Memory as any).war;
  return !!(mem && mem.throttle);
}

/** True when this room should skip non-essential work. */
export function isSkeleton(roomName: string): boolean {
  return throttleOn() && getRoomMode(roomName) === MODE_SKELETON;
}

export function modeTable(): string {
  const map = refreshModes();
  const mem = warMem();
  const names: string[] = [];
  for (const n in map) names.push(n);
  names.sort();
  const rows = [
    `footing=${mem.footing ? "ON" : "off"}  throttle=${mem.throttle ? "ON (gates live)" : "off (display only)"}`,
    `  ${"room".padEnd(8)} mode`,
  ];
  for (let i = 0; i < names.length; i++) {
    rows.push(`  ${names[i].padEnd(8)} ${map[names[i]]}`);
  }
  if (!names.length) rows.push("  (no owned rooms)");
  return rows.join("\n");
}
