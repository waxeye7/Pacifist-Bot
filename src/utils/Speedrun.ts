/**
 * Low-RCL speedrun instrumentation + policy.
 * Scores are in GAME TICKS (not wall-clock). Memory.speedrun.rclTimes[level] = first Game.time at that RCL.
 *
 * Console:
 *   speedrunStatus()
 *   resetSpeedrun()  — clears timers (use after local room reset)
 *   enableSpeedrun() / disableSpeedrun()
 */

import { logAlways } from "utils/Logger";
import { getFeatures } from "utils/Features";

export interface SpeedrunState {
  /** Game.time when we started tracking (spawn / reset) */
  startTick: number;
  /** First Game.time when controller reached this level (1..8) */
  rclTimes: { [level: number]: number };
  /** Last seen RCL for this room (per-room tracking in room memory also) */
  lastRcl: number;
  roomName?: string;
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

/** Call once per owned room each tick (cheap). */
export function trackRoomRcl(room: Room): void {
  if (!room.controller || !room.controller.my) return;
  const s = ensure();
  const level = room.controller.level;

  if (!s.roomName) s.roomName = room.name;
  // track primary room only if set; else first owned room wins
  if (s.roomName && s.roomName !== room.name) return;

  if (!s.startTick) s.startTick = Game.time;

  // record first time we see each RCL
  if (level >= 1 && s.rclTimes[level] == null) {
    s.rclTimes[level] = Game.time;
    const fromStart = Game.time - s.startTick;
    logAlways(
      `[speedrun] RCL${level} @ tick ${Game.time} (+${fromStart} from start) room=${room.name}`,
    );
  }

  // if we just got a spawn at RCL1 with no start, lock start
  if (level === 1 && s.lastRcl === 0 && Object.keys(s.rclTimes).length <= 1) {
    if (s.rclTimes[1] == null) s.rclTimes[1] = Game.time;
    if (!s.startTick || s.startTick > Game.time) s.startTick = Game.time;
  }

  s.lastRcl = level;
}

export function resetSpeedrun(roomName?: string): string {
  Memory.speedrun = {
    startTick: Game.time,
    rclTimes: {},
    lastRcl: 0,
    roomName: roomName || undefined,
  };
  const msg = `speedrun reset at tick ${Game.time}` + (roomName ? ` room=${roomName}` : "");
  logAlways(msg);
  return msg;
}

export function speedrunStatus(): string {
  const s = ensure();
  const f = getFeatures();
  const lines: string[] = [];
  lines.push(`speedrun=${f.speedrun} disablePower=${f.disablePower}`);
  lines.push(`room=${s.roomName || "?"} startTick=${s.startTick} now=${Game.time}`);
  lines.push(`elapsed=${Game.time - (s.startTick || Game.time)} ticks`);

  for (let lvl = 1; lvl <= 8; lvl++) {
    const t = s.rclTimes[lvl];
    if (t == null) {
      lines.push(`  RCL${lvl}: —`);
    } else {
      const fromStart = t - s.startTick;
      const fromPrev = lvl > 1 && s.rclTimes[lvl - 1] != null ? t - s.rclTimes[lvl - 1] : fromStart;
      lines.push(`  RCL${lvl}: tick ${t}  (+${fromStart} total, +${fromPrev} from RCL${lvl - 1})`);
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
  if (rcl >= 5) return; // hand back to full bot later

  // mark mode on room for other systems
  if (!room.memory.speedrun) room.memory.speedrun = {};
  room.memory.speedrun.active = true;
  room.memory.speedrun.rcl = rcl;

  // Ensure remotes off while speedrunning early RCL — RCL1-2 only.
  // From RCL3 the commune can afford a reserver + remote miners, and the
  // owner wants remotes running there; forcing `active = false` for the
  // whole RCL1-4 window (the old behaviour) fought manageRemotes() every
  // tick and was one of the reasons no remote ever opened.
  if (rcl <= 2 && room.memory.resources) {
    for (const rn of Object.keys(room.memory.resources)) {
      if (rn !== room.name && room.memory.resources[rn]) {
        room.memory.resources[rn].active = false;
      }
    }
  }
}
