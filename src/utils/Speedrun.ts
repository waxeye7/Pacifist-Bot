/**
 * Low-RCL speedrun instrumentation + policy.
 * Scores are in GAME TICKS (not wall-clock).
 *
 * Global Memory.speedrun is the primary/first-room compat view.
 * Each owned room also records on room.memory.speedrun (startTick, rclTimes, lastRcl)
 * so race.mjs / HTTP memory reads can harvest without the singleton.
 *
 * Console:
 *   speedrunStatus()
 *   resetSpeedrun()  — clears global + all owned room clocks
 *   resetSpeedrun("E5S1")  — clears that room + rebinds the global primary
 *   enableSpeedrun() / disableSpeedrun()
 *   disableRemotes() / enableRemotes()  — campaign remotes-off A/B
 */

import { logAlways } from "utils/Logger";
import { getFeatures } from "utils/Features";

export interface SpeedrunState {
  /** Game.time when we started tracking (spawn / reset / first RCL1 track) */
  startTick: number;
  /** First Game.time when controller reached this level (1..8) */
  rclTimes: { [level: number]: number };
  lastRcl: number;
  roomName?: string;
  /**
   * Explicit remotes-off guardrail. Default unset/false: RCL3+ remotes
   * still open as today. True: manageRemotes closes every remote every tick
   * and spawn will not queue remote miners/carriers/reservists.
   */
  disableRemotes?: boolean;
}

/** Clock fields on room.memory.speedrun (reuses the existing policy object). */
export interface RoomSpeedrunClock {
  startTick?: number;
  rclTimes?: { [level: number]: number };
  lastRcl?: number;
}

function ensure(): SpeedrunState {
  if (!Memory.speedrun) {
    Memory.speedrun = {
      startTick: Game.time,
      rclTimes: {},
      lastRcl: 0,
    };
  }
  if (!Memory.speedrun.rclTimes) Memory.speedrun.rclTimes = {};
  return Memory.speedrun as SpeedrunState;
}

function ensureRoomClock(room: Room): RoomSpeedrunClock {
  if (!room.memory.speedrun) room.memory.speedrun = {};
  const rs = room.memory.speedrun;
  if (!rs.rclTimes) rs.rclTimes = {};
  if (rs.lastRcl == null) rs.lastRcl = 0;

  // One-shot seed from the global primary so a mid-run upgrade keeps history.
  const g = Memory.speedrun;
  if (
    g &&
    g.roomName === room.name &&
    Object.keys(rs.rclTimes).length === 0 &&
    g.rclTimes &&
    Object.keys(g.rclTimes).length > 0
  ) {
    rs.rclTimes = { ...g.rclTimes };
    if (rs.startTick == null && g.startTick) rs.startTick = g.startTick;
    if (!rs.lastRcl && g.lastRcl) rs.lastRcl = g.lastRcl;
  }
  return rs;
}

function hasMySpawn(room: Room): boolean {
  return room.find(FIND_MY_SPAWNS).length > 0;
}

/** Record first-seen RCL / startTick onto a clock. Returns true if a new RCL was stamped. */
function applyTrack(s: RoomSpeedrunClock, room: Room): boolean {
  const level = room.controller!.level;
  if (!s.rclTimes) s.rclTimes = {};

  if (s.startTick == null) {
    if (level === 1 || hasMySpawn(room)) s.startTick = Game.time;
  }

  let stamped = false;
  if (level >= 1 && s.rclTimes[level] == null) {
    if (s.startTick == null) s.startTick = Game.time;
    s.rclTimes[level] = Game.time;
    stamped = true;
  }

  // RCL1 + no prior RCL: lock start if still unset / in the future
  if (level === 1 && (s.lastRcl || 0) === 0 && Object.keys(s.rclTimes).length <= 1) {
    if (s.rclTimes[1] == null) s.rclTimes[1] = Game.time;
    if (!s.startTick || s.startTick > Game.time) s.startTick = Game.time;
  }

  s.lastRcl = level;
  return stamped;
}

/** Call once per owned room each tick (cheap). Updates that room always; global only if primary. */
export function trackRoomRcl(room: Room): void {
  if (!room.controller || !room.controller.my) return;

  const rs = ensureRoomClock(room);
  const stampedRoom = applyTrack(rs, room);

  const g = ensure();
  if (!g.roomName) g.roomName = room.name;
  const isPrimary = g.roomName === room.name;
  let stampedGlobal = false;
  if (isPrimary) stampedGlobal = applyTrack(g, room);

  if (stampedRoom || stampedGlobal) {
    const level = room.controller.level;
    const clock = isPrimary ? g : rs;
    const start = clock.startTick || Game.time;
    logAlways(
      `[speedrun] RCL${level} @ tick ${Game.time} (+${Game.time - start} from start) room=${room.name}`,
    );
  }
}

function resetRoomClockByName(roomName: string): void {
  const live = Game.rooms[roomName];
  const mem = live ? live.memory : Memory.rooms && Memory.rooms[roomName];
  if (!mem) return;
  if (!mem.speedrun) mem.speedrun = {};
  mem.speedrun.startTick = Game.time;
  mem.speedrun.rclTimes = {};
  mem.speedrun.lastRcl = 0;
}

/** Campaign remotes-off A/B. Unset/false keeps current RCL3+ remotes. */
export function remotesDisabled(): boolean {
  return !!(Memory.speedrun && Memory.speedrun.disableRemotes);
}

function closeOwnedRemotes(): void {
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (!room.controller || !room.controller.my || !room.memory.resources) continue;
    for (const rn of Object.keys(room.memory.resources)) {
      if (rn !== room.name && room.memory.resources[rn]) {
        room.memory.resources[rn].active = false;
      }
    }
  }
}

export function disableRemotes(): string {
  const s = ensure();
  s.disableRemotes = true;
  closeOwnedRemotes();
  const msg = "disableRemotes ON — remotes closed every tick, remote spawn blocked";
  logAlways(msg);
  return msg;
}

export function enableRemotes(): string {
  const s = ensure();
  s.disableRemotes = false;
  const msg = "disableRemotes OFF — RCL3+ remotes allowed (current default)";
  logAlways(msg);
  return msg;
}

export function resetSpeedrun(roomName?: string): string {
  const keepOff = remotesDisabled();
  Memory.speedrun = {
    startTick: Game.time,
    rclTimes: {},
    lastRcl: 0,
    roomName: roomName || undefined,
  };
  if (keepOff) Memory.speedrun.disableRemotes = true;
  if (roomName) {
    resetRoomClockByName(roomName);
  } else {
    for (const name in Game.rooms) {
      const room = Game.rooms[name];
      if (room.controller && room.controller.my) resetRoomClockByName(name);
    }
  }
  const msg =
    `speedrun reset at tick ${Game.time}` + (roomName ? ` room=${roomName}` : " (all owned)");
  logAlways(msg);
  return msg;
}

function formatClock(label: string, s: RoomSpeedrunClock): string[] {
  const start = s.startTick;
  const times = s.rclTimes || {};
  const lines: string[] = [];
  const elapsed = start != null ? Game.time - start : 0;
  lines.push(
    `${label} startTick=${start ?? "?"} elapsed=${start != null ? elapsed : "?"} ticks lastRcl=${s.lastRcl ?? "?"}`,
  );
  for (let lvl = 1; lvl <= 8; lvl++) {
    const t = times[lvl];
    if (t == null) {
      lines.push(`  RCL${lvl}: —`);
    } else {
      const fromStart = start != null ? t - start : 0;
      const fromPrev = lvl > 1 && times[lvl - 1] != null ? t - times[lvl - 1] : fromStart;
      lines.push(`  RCL${lvl}: tick ${t}  (+${fromStart} total, +${fromPrev} from RCL${lvl - 1})`);
    }
  }
  return lines;
}

export function speedrunStatus(): string {
  const g = ensure();
  const f = getFeatures();
  const lines: string[] = [];
  lines.push(
    `speedrun=${f.speedrun} disablePower=${f.disablePower} disableRemotes=${remotesDisabled()} now=${Game.time}`,
  );

  const owned: Room[] = [];
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (room.controller && room.controller.my) owned.push(room);
  }
  owned.sort((a, b) => a.name.localeCompare(b.name));

  if (owned.length === 0) {
    lines.push(...formatClock(`primary ${g.roomName || "?"}`, g));
  } else {
    for (const room of owned) {
      const rs = room.memory.speedrun;
      const isPrimary = g.roomName === room.name;
      const clock: RoomSpeedrunClock =
        rs && (rs.startTick != null || (rs.rclTimes && Object.keys(rs.rclTimes).length > 0))
          ? rs
          : isPrimary
            ? g
            : { startTick: rs?.startTick, rclTimes: (rs && rs.rclTimes) || {}, lastRcl: rs?.lastRcl };
      const tag = isPrimary ? " (primary)" : "";
      lines.push(...formatClock(`${room.name}${tag}`, clock));
    }
  }

  const text = lines.join("\n");
  logAlways(text);
  return text;
}

/**
 * Speedrun spawn policy for RCL 1–4:
 * - maximize upgrade throughput
 * - no remotes, no combat noise (enforced elsewhere too)
 * Returns true if the normal spawn planner should be SKIPPED this tick (we handled spawn_list).
 */
export function applySpeedrunSpawnHints(room: Room): void {
  if (!room.controller || !room.controller.my) return;
  const rcl = room.controller.level;

  // Close remotes before spawn (hints run first). RCL1–2 always; any RCL
  // when Memory.speedrun.disableRemotes is set. manageRemotes also closes
  // every tick on that flag so already-open remotes cannot stay active.
  if ((rcl <= 2 || remotesDisabled()) && room.memory.resources) {
    for (const rn of Object.keys(room.memory.resources)) {
      if (rn !== room.name && room.memory.resources[rn]) {
        room.memory.resources[rn].active = false;
      }
    }
  }

  if (rcl >= 5) return; // hand back to full bot later

  // mark mode on room for other systems
  if (!room.memory.speedrun) room.memory.speedrun = {};
  room.memory.speedrun.active = true;
  room.memory.speedrun.rcl = rcl;
}
