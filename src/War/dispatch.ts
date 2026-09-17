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
import { countLive, countQueued, expensiveInFlight, homeHasSquad, guardOnPlayerRoom, ROLES, cckInFlight } from "./flight";
import { ownedRooms, travelHops, withinTravelBudget, MAX_TRAVEL_HOPS } from "./reach";
import { roomDistance } from "./geo";
import { logAlways } from "utils/Logger";
import { lowCpuShard, billedAvg } from "utils/CpuPolicy";

const ISSUE_PER_TICK = 2;
const MAX_GUARDS = 6;

/**
 * WAR BUDGETED FROM THE WRONG METER.
 *
 * This read hundredTickAvg, which is end-of-loop getUsed(). Memory is
 * serialised after main() returns and the server bills us for it, so avg100
 * understates the real cost by the post-loop write — 1.32-1.42 CPU on this
 * bot, 7% of a 20 limit.
 *
 * Both readers below spend on that difference. guardCap turns `limit - avg`
 * into a Guard count, and a Guard alone in a foreign room is 0.3-0.8 CPU, the
 * most expensive creep the bot runs. warEconomyBlocked refuses offence at
 * `avg >= limit - 1`. Live shard3 2026-09-11: avg100 read 18.4-19.0 while the
 * billed figure was 20.2-20.5 against a 20 limit. So the honest answer was
 * "no headroom at all, and already over the limit", and both gates instead
 * read 1-1.6 CPU spare and let a Guard out.
 *
 * Same error AutoExpand made when it armed an eighth room. CpuPolicy.billedAvg
 * is now the single place that answers this.
 */
/** The billed average, named for what it is. See the note above. */
function warCpuAvg(): number {
  return billedAvg();
}

/** Kits issued per pass: one on a 20-CPU shard. */
function issuePerTick(): number {
  return lowCpuShard() ? 1 : ISSUE_PER_TICK;
}

/**
 * Live Guards the empire may hold, from CPU headroom. A Guard in a foreign
 * room is 0.3-0.8 CPU (alone in its room: no shared matrix, no shared finds).
 * Pure so the test can pin the rungs.
 */
export function guardCapFor(limit: number, avg: number, lowCpu: boolean): number {
  if (!lowCpu) return MAX_GUARDS;
  const headroom = avg > 0 ? limit - avg : limit;
  if (headroom >= 3) return 4;
  if (headroom >= 2) return 2;
  if (headroom >= 1) return 1;
  return 0;
}
function guardCap(): number {
  return guardCapFor(Game.cpu.limit || 20, warCpuAvg(), lowCpuShard());
}
const MAX_CCK = 3;
const MAX_MOSQUITO = 2;
const MAX_WAR_SCOUTS = 2;

/* -------------------------------------------------------------------------
 * TWO LOOKOUTS ON A PERMANENT TREADMILL, FOR A WAR LAYER SCORING ZERO TARGETS.
 *
 * sendWarScout asks scoutQueue(1000) for rooms whose intel is older than a
 * thousand ticks, and the reach set is ~189 rooms. Keeping all of them under
 * 1,000 ticks old needs one scout ARRIVING every five ticks; one scout takes
 * hundreds of ticks to cross the map. So the queue is never empty, there is no
 * state in which the fleet is "caught up", and the cap is therefore the
 * behaviour: two scouts alive, always, forever.
 *
 * Live shard3 2026-09-11: Memory.war.stats read scout 2,339 of 3,081 lifetime
 * issues since tick 82,293,998 — one scout every 258 ticks for 604,700 ticks,
 * ~117,000 energy — while `warTargets` scored 0, footing was off and no room
 * was in danger. The diary shows the same handful of rooms recycling
 * (E34N57 at t=82,898,223 and again at t=82,898,523) because a 1,000-tick bar
 * re-queues the CLOSEST rooms long before a scout can reach the far ones.
 *
 * Two changes, both only at peace:
 *
 *   AGE  — 1,000 is a wartime number. At peace the bar goes to
 *          WAR_SCOUT_AGE_PEACE, which does not drain the queue either but
 *          stops the near rooms from crowding out the rest, so the same
 *          number of trips covers more of the map.
 *   CAP  — on a CPU-capped shard, one lookout instead of two. Creeps are
 *          billed per intent and headcount IS the bill here; the second
 *          scout buys a marginally fresher copy of intel nothing is acting
 *          on.
 *
 * NOT a bucket gate, for the reason DISPATCH_EVERY spells out below: a war
 * machine that goes blind when the bucket dips is the failure this file's
 * header warns about. At war both numbers snap straight back.
 * ------------------------------------------------------------------------- */
const WAR_SCOUT_AGE_WAR = 1000;
const WAR_SCOUT_AGE_PEACE = 6000;

/** True when nothing is being fought: no scored target, no distress, no danger. */
export function warAtPeace(targetCount: number): boolean {
  if (targetCount > 0) return false;
  const M: any = Memory as any;
  if (M.DistressSignals && Object.keys(M.DistressSignals).length > 0) return false;
  const owned = ownedRooms();
  for (let i = 0; i < owned.length; i++) {
    const r = Game.rooms[owned[i]];
    if (r && r.memory && (r.memory as any).danger) return false;
  }
  return true;
}

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

const COOLDOWN: { [kind: string]: number } = {
  "guard-prey": 80,
  "guard-raid": 80,
  duo: 120,
  "ranged-quad": 200,
  "ranged-quad-boost": 200,
  "melee-quad-boost": 200,
  cck: 150,
  mosquito: 200,
};
/*
 * Issue ledger — Memory.war.issued[kind:target] = {t, n}. This was a heap
 * map, so every global reset forgot every cooldown; and a kit whose body was
 * evicted from a broke room's queue (dropNonRecoverySpend) read as "nothing
 * in flight" and was re-issued on the very next pass. Live diary: guard-prey
 * to E37N55 every 10 ticks, 21 entries running. Persist it, and back off:
 * the n-th issue of the same kit at the same room waits base * 2^(n-1), up
 * to COOLDOWN_MAX. A run is forgotten after ISSUE_FORGET quiet ticks.
 */
const COOLDOWN_MAX = 2000;
const ISSUE_FORGET = 5000;
const ISSUED_CAP = 40;

function issuedStore(): { [key: string]: { t: number; n: number } } {
  const mem: any = (Memory as any).war;
  if (!mem) return {};
  if (!mem.issued) mem.issued = {};
  return mem.issued;
}

/** Pure: how long the n-th issue (1-based) of a kit must wait. */
export function cooldownFor(kind: string, n: number): number {
  const base = COOLDOWN[kind] || 50;
  return Math.min(COOLDOWN_MAX, base * Math.pow(2, Math.max(0, n - 1)));
}

function onCooldown(k: Kit): boolean {
  const key = k.kind + ":" + k.target;
  const rec = issuedStore()[key];
  if (!rec) return false;
  if (Game.time - rec.t > ISSUE_FORGET) {
    delete issuedStore()[key];
    return false;
  }
  return Game.time - rec.t < cooldownFor(k.kind, rec.n);
}

function noteIssued(k: Kit): void {
  const s = issuedStore();
  const key = k.kind + ":" + k.target;
  const rec = s[key];
  const n = rec && Game.time - rec.t <= ISSUE_FORGET ? rec.n + 1 : 1;
  s[key] = { t: Game.time, n };
  const keys = Object.keys(s);
  if (keys.length > ISSUED_CAP) {
    keys.sort((a, b) => s[a].t - s[b].t);
    for (let i = 0; i < keys.length - ISSUED_CAP; i++) delete s[keys[i]];
  }
}

function issue(k: Kit): boolean {
  if (onCooldown(k)) return false;
  /*
   * CAN ANYTHING WE BUY ACTUALLY GET THERE? getReach() — and therefore every
   * score and every kit above — is straight-line room distance. The walk is
   * not. See reach.travelHops for the live E38N55 errand this closes: a target
   * two rooms from the empire, fourteen hops of real route, and a body bought
   * to die around hop eight. Mosquitoes are Memory-side ops with no creep to
   * strand, so they are exempt.
   */
  if (k.kind !== "mosquito" && k.home && !withinTravelBudget(k.home, k.target)) {
    return false;
  }
  const g = global as any;
  let ok = false;

  switch (k.kind) {
    case "guard-prey":
      // Live + QUEUED: a guard sitting in a 1500-tick spawn_list counts toward
      // the cap, or back-to-back passes enqueue guards past it.
      if (countLive(ROLES.GUARD) + countQueued(ROLES.GUARD) >= guardCap()) return false;
      ok = g.SGD(k.home, k.target, GUARD_PREY) === "Success!";
      if (ok && k.followCck) queueCck(k.home, k.target, 200);
      break;
    case "guard-raid":
      if (countLive(ROLES.GUARD) + countQueued(ROLES.GUARD) >= guardCap()) return false;
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
      // Memory.e can exist without .mosquito (hand-edited or partial memory) —
      // the old `Memory.e.mosquito.length` threw on exactly that shape.
      const me: any = (Memory as any).e || ((Memory as any).e = {});
      const rows: any[] = me.mosquito || (me.mosquito = []);
      let live = 0;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i] && rows[i].ts > 0) live++;
      }
      if (live >= MAX_MOSQUITO) return false;
      rows.push({ n: k.target, ts: 2 });
      ok = true;
      break;
    }
    default:
      return false;
  }

  if (ok) {
    noteIssued(k);
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

function sendWarScout(peace: boolean): boolean {
  if ((Memory as any)._spawnEmergency || (Memory as any).spawnRescue) return false;
  const { live, aimed } = warScoutCount();
  const cap = peace && lowCpuShard() ? 1 : MAX_WAR_SCOUTS;
  if (live >= cap) return false;
  const q = scoutQueue(peace ? WAR_SCOUT_AGE_PEACE : WAR_SCOUT_AGE_WAR);
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

/**
 * How often a full dispatch pass runs.
 *
 * This used to run every tick, and measured 1.27 CPU of a 20 CPU shard3 budget
 * — 6% of the whole tick — to re-derive a decision that changes on the
 * timescale of a siege. Nothing it reads moves fast enough to justify that:
 * `targets()` is itself cached for RESCORE_EVERY ticks, intel is ingested at 2
 * rooms/tick, and `sendWarScout` walks the entire ~175-room reach set to find
 * one 50-energy lookout.
 *
 * The cost of being 10 ticks late to an offensive is nil — every kit it can
 * issue takes hundreds of ticks to spawn and cross the map. The cost of
 * spending 6% of the budget on it is that the CPU governor closes the remotes,
 * which is real money.
 *
 * Deliberately NOT a bucket gate: a war machine that goes blind exactly when
 * the bucket dips is the failure mode War/war.ts's header warns about. This is
 * a fixed cadence, so it degrades to "slightly less reactive" and never to
 * "off". Defence does not come through here — that is rooms.defence and
 * War/reinforce, both of which still run every tick.
 */
const DISPATCH_EVERY = 10;

/**
 * EMPIRE gate: why offence may not start right now — "" when it may.
 *
 * This used to also demand that EVERY owned RCL4+ room hold >= 20k in
 * storage. One fresh RCL4 room with no storage read as bank 0 and switched
 * the whole doctrine off; live shard3 sat behind "E37N59 bank 12191 < 20000"
 * with six other rooms able to pay for a Guard. The bank test is now per
 * HOME (kit.canFund + warMinBank): a broke room simply is not picked.
 *
 * What stays empire-wide is what is genuinely empire-wide: a spawn rescue,
 * the bucket, and — on a 20-CPU shard — the average. A war creep in a
 * foreign room is the most expensive creep the bot runs, and an average
 * already at the limit cannot pay for one. Exported for tests.
 */
export function warEconomyBlocked(): string {
  const M: any = Memory as any;
  if (M.spawnRescue || M._spawnEmergency) return "spawn rescue in flight";
  const lowCpu = lowCpuShard();
  const bucketBar = lowCpu ? 3000 : 5000;
  if (Game.cpu.bucket < bucketBar) return "bucket " + Game.cpu.bucket + " < " + bucketBar;
  if (lowCpu) {
    const limit = Game.cpu.limit || 20;
    const avg = warCpuAvg();
    if (avg > 0 && avg >= limit - 1) return "cpu avg " + avg.toFixed(1) + " >= " + (limit - 1);
  }
  return "";
}

let lastEcoLog = 0;

export function runDispatch(): void {
  const mem = (Memory as any).war;
  if (mem && mem.dispatch === false) return;
  // Stagger off 0: tick 0 already carries the heaviest scheduled work in the bot.
  if (Game.time % DISPATCH_EVERY !== 3) return;
  const ecoBlocked = warEconomyBlocked();
  if (ecoBlocked) {
    if (Game.time - lastEcoLog >= 1000) {
      lastEcoLog = Game.time;
      console.log("[war] offence holds — " + ecoBlocked + " (Memory.war.minBank to tune)");
    }
    return;
  }

  dropHotTowerCcks();

  const list = targets();
  let issued = 0;
  lastIssued = [];
  lastTick = Game.time;

  const perTick = issuePerTick();
  for (let i = 0; i < list.length && issued < perTick; i++) {
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
  if (sendWarScout(warAtPeace(list.length))) {
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
    "  hops = " + (k.home ? travelHops(k.home, roomName) : "-") + " / " + MAX_TRAVEL_HOPS,
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
