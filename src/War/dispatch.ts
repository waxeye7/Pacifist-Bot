/**
 * WAR / DISPATCH — issue the kit pickKit chose, via the existing primitives.
 *
 * Does not spawn bodies itself. SGD / SD / SQR / SQM / SCCK / Memory.e.mosquito
 * already exist. This is the missing "which kit, which home, are we already
 * doing this" layer. Observe's combat tree is retired.
 *
 * Caps (shard 3): 2 issues/tick, 1 expensive kit empire-wide, 6 Guards, 3 CCK,
 * 2 mosquito rows. Cheap kits fire immediately; quads wait for the bucket
 * through commandsToExecute when we cannot afford them this tick.
 */

import { getIntel, patchIntel, STALE_TICKS } from "./intel";
import { targets, scoreRoom, scoutQueue } from "./score";
import { pickKit, Kit, KitKind, GUARD_PREY, GUARD_RAID } from "./kit";
import { countLive, expensiveInFlight, homeHasSquad, guardOnPlayerRoom, ROLES, cckInFlight } from "./flight";
import { ownedRooms } from "./reach";
import { roomDistance } from "./geo";
import { logAlways } from "utils/Logger";

const ISSUE_PER_TICK = 2;
const MAX_GUARDS = 6;
const MAX_CCK = 3;
const MAX_MOSQUITO = 2;
const MAX_WAR_SCOUTS = 2;

let lastIssued: string[] = [];
let lastTick = -1;

function queue(cmd: any): void {
  if (!Memory.commandsToExecute) Memory.commandsToExecute = [];
  Memory.commandsToExecute.push(cmd);
}

function queueCck(home: string, target: string, delay: number): void {
  if (cckInFlight(target)) return;
  const rec = getIntel(target);
  if (rec && (rec.tw || 0) > 0 && rec.te !== 0) return;
  queue({ delay: delay, bucketNeeded: 3000, formation: "CCK", homeRoom: home, targetRoom: target });
}

/** Drop already-queued CCKs aimed at rooms whose towers still have energy. */
function dropHotTowerCcks(): void {
  const cmds = Memory.commandsToExecute;
  if (!cmds || !cmds.length) return;
  const next = [];
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (c && c.formation === "CCK" && c.targetRoom) {
      const rec = getIntel(c.targetRoom);
      if (rec && (rec.tw || 0) > 0 && rec.te !== 0) continue;
    }
    next.push(c);
  }
  Memory.commandsToExecute = next;
}

function issue(k: Kit): boolean {
  const g = global as any;
  let ok = false;

  switch (k.kind) {
    case "guard-prey":
      if (countLive(ROLES.GUARD) >= MAX_GUARDS) return false;
      ok = g.SGD(k.home, k.target, GUARD_PREY) === "Success!";
      if (ok && k.followCck) queueCck(k.home, k.target, 200);
      break;
    case "guard-raid":
      if (countLive(ROLES.GUARD) >= MAX_GUARDS) return false;
      ok = g.SGD(k.home, k.target, GUARD_RAID) === "Success!";
      if (ok && k.followCck) queueCck(k.home, k.target, 1000);
      break;
    case "duo":
      ok = !!g.SD(k.home, k.target, false);
      if (ok && k.followCck) queueCck(k.home, k.target, 200);
      break;
    case "ranged-quad":
      if (expensiveInFlight() || homeHasSquad(k.home)) return false;
      if (Game.cpu.bucket >= 7000) ok = !!g.SQR(k.home, k.target, false);
      else {
        queue({ delay: 1, bucketNeeded: 7000, formation: "RangedQuad", homeRoom: k.home, targetRoom: k.target, Boosted: false });
        ok = true;
      }
      if (ok && k.followCck) queueCck(k.home, k.target, 500);
      break;
    case "ranged-quad-boost":
      if (expensiveInFlight() || homeHasSquad(k.home)) return false;
      if (Game.cpu.bucket >= 8000) ok = !!g.SQR(k.home, k.target, true);
      else {
        queue({ delay: 1, bucketNeeded: 8000, formation: "RangedQuad", homeRoom: k.home, targetRoom: k.target, Boosted: true });
        ok = true;
      }
      if (ok && k.followCck) queueCck(k.home, k.target, 500);
      break;
    case "melee-quad-boost":
      if (expensiveInFlight() || homeHasSquad(k.home)) return false;
      if (Game.cpu.bucket >= 8000) ok = !!g.SQM(k.home, k.target, true);
      else {
        queue({ delay: 1, bucketNeeded: 8000, formation: "MeleeQuad", homeRoom: k.home, targetRoom: k.target, Boosted: true });
        ok = true;
      }
      if (ok && k.followCck) queueCck(k.home, k.target, 500);
      break;
    case "cck": {
      const rec = getIntel(k.target);
      if (rec && (rec.tw || 0) > 0 && rec.te !== 0) return false;
      if (countLive(ROLES.CCK) >= MAX_CCK) return false;
      if (Game.cpu.bucket >= 3000) ok = g.SCCK(k.home, k.target) === "Success!";
      else {
        queueCck(k.home, k.target, 1);
        ok = true;
      }
      break;
    }
    case "mosquito": {
      if (!Memory.e) Memory.e = { mosquito: [] };
      let live = 0;
      for (let i = 0; i < Memory.e.mosquito.length; i++) {
        if (Memory.e.mosquito[i] && Memory.e.mosquito[i].ts > 0) live++;
      }
      if (live >= MAX_MOSQUITO) return false;
      Memory.e.mosquito.push({ n: k.target, ts: 2 });
      ok = true;
      break;
    }
    default:
      return false;
  }

  if (ok) {
    patchIntel(k.target, { atk: Game.time });
    noteDiary(k);
    logAlways("[war] dispatch", k.kind, k.target, "from", k.home, "-", k.why);
  }
  return ok;
}

const DIARY_CAP = 40;

function noteDiary(k: Kit): void {
  const mem = (Memory as any).war;
  if (!mem) return;
  if (!mem.diary) mem.diary = [];
  if (!mem.stats) mem.stats = { n: 0, started: Game.time };
  mem.stats.n = (mem.stats.n || 0) + 1;
  mem.stats[k.kind] = (mem.stats[k.kind] || 0) + 1;
  mem.diary.push({ t: Game.time, k: k.kind, r: k.target, h: k.home, w: k.why });
  if (mem.diary.length > DIARY_CAP) mem.diary.splice(0, mem.diary.length - DIARY_CAP);
}

export function diaryTable(): string {
  const mem = (Memory as any).war;
  if (!mem || !mem.diary || !mem.diary.length) {
    const n = mem && mem.stats && mem.stats.n ? mem.stats.n : 0;
    return `war diary: empty (lifetime issued=${n})`;
  }
  const stats = mem.stats || {};
  const bits: string[] = [];
  for (const key in stats) {
    if (key === "started" || key === "n") continue;
    bits.push(key + "=" + stats[key]);
  }
  const rows = [
    `war diary: ${mem.diary.length} recent / ${stats.n || 0} lifetime  since=${stats.started || "?"}`,
    bits.length ? "  " + bits.join(" ") : "",
  ];
  for (let i = mem.diary.length - 1; i >= 0; i--) {
    const e = mem.diary[i];
    rows.push(`  t=${e.t}  ${String(e.k).padEnd(18)} ${e.r} <- ${e.h}  ${e.w}`);
  }
  return rows.filter(Boolean).join("\n");
}

function warScoutCount(): { live: number; aimed: { [room: string]: boolean } } {
  const aimed: { [room: string]: boolean } = Object.create(null);
  let live = 0;
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (!c || !c.memory || !c.memory.warScout) continue;
    live++;
    if (c.memory.targetRoom) aimed[c.memory.targetRoom] = true;
  }
  const owned = ownedRooms();
  for (let i = 0; i < owned.length; i++) {
    const list = Game.rooms[owned[i]] && Game.rooms[owned[i]].memory.spawn_list;
    if (!list) continue;
    for (let j = 0; j + 2 < list.length; j += 3) {
      const mem = list[j + 2] && (list[j + 2] as any).memory;
      if (!mem || !mem.warScout) continue;
      live++;
      if (mem.targetRoom) aimed[mem.targetRoom] = true;
    }
  }
  return { live, aimed };
}

function pickScoutHome(target: string): string {
  const owned = ownedRooms();
  let best = "";
  let bestD = Infinity;
  for (let i = 0; i < owned.length; i++) {
    const room = Game.rooms[owned[i]];
    if (!room || !room.controller || !room.controller.my) continue;
    if (room.memory && room.memory.danger) continue;
    if (room.energyAvailable < 50) continue;
    if (!room.find(FIND_MY_SPAWNS).length) continue;
    const d = roomDistance(owned[i], target);
    if (d > 5 || d >= bestD) continue;
    best = owned[i];
    bestD = d;
  }
  return best;
}

function sendWarScout(): boolean {
  const { live, aimed } = warScoutCount();
  if (live >= MAX_WAR_SCOUTS) return false;
  const q = scoutQueue(1000);
  let target = "";
  for (let i = 0; i < q.length; i++) {
    if (!aimed[q[i]]) {
      target = q[i];
      break;
    }
  }
  if (!target) return false;
  const home = pickScoutHome(target);
  if (!home) return false;
  const room = Game.rooms[home];
  if (!room.memory.spawn_list) room.memory.spawn_list = [];
  const newName = "Scout-war-" + Math.floor(Math.random() * Game.time) + "-" + home + "-" + target;
  room.memory.spawn_list.push([MOVE], newName, {
    memory: { role: "scout", homeRoom: home, targetRoom: target, warScout: true },
  });
  const mem = (Memory as any).war;
  if (mem) {
    if (!mem.diary) mem.diary = [];
    if (!mem.stats) mem.stats = { n: 0, started: Game.time };
    mem.stats.n = (mem.stats.n || 0) + 1;
    mem.stats.scout = (mem.stats.scout || 0) + 1;
    mem.diary.push({ t: Game.time, k: "scout", r: target, h: home, w: "unseen" });
    if (mem.diary.length > DIARY_CAP) mem.diary.splice(0, mem.diary.length - DIARY_CAP);
  }
  logAlways("[war] scout", target, "from", home);
  return true;
}

export function runDispatch(): void {
  const mem = (Memory as any).war;
  if (mem && mem.dispatch === false) return;

  dropHotTowerCcks();

  const list = targets();
  let issued = 0;
  lastIssued = [];
  lastTick = Game.time;

  for (let i = 0; i < list.length && issued < ISSUE_PER_TICK; i++) {
    const s = list[i];
    const rec = getIntel(s.room);
    if (!rec) continue;
    if (Game.time - rec.t > STALE_TICKS && !Game.rooms[s.room]) continue;
    const k = pickKit(s.room, rec, s);
    if (k.kind === "none") continue;
    // Don't open a core hunt while a Guard is still in a player room.
    if (rec.inv && !rec.o && (k.kind === "guard-prey" || k.kind === "guard-raid") && guardOnPlayerRoom()) {
      continue;
    }
    if (issue(k)) {
      lastIssued.push(k.kind + " " + k.target);
      issued++;
    }
  }

  // No observers until RCL8. Without these 50-energy lookouts the intel DB
  // only ever sees our own rooms and dispatch stays at 0 forever.
  if (sendWarScout()) {
    lastIssued.push("scout");
  }
}

export function explainKit(roomName: string): string {
  const rec = getIntel(roomName);
  if (!rec) return roomName + ": no intel";
  const s = scoreRoom(roomName);
  const k = pickKit(roomName, rec, s);
  return [
    roomName + "  kit=" + k.kind + (k.home ? " from " + k.home : ""),
    "  why  = " + (k.why || s && s.why || "-"),
    "  followCck=" + k.followCck + "  boosted=" + k.boosted,
  ].join("\n");
}

export function dispatchLog(): string {
  if (lastTick < 0) return "dispatch: (not run yet)";
  return "dispatch@" + lastTick + ": " + (lastIssued.length ? lastIssued.join(", ") : "(nothing this pass)");
}

export function kitName(k: KitKind): string {
  return k;
}
