import "./utils/Commands";
import { ErrorMapper } from "./utils/ErrorMapper";
import { memHack } from "utils/MemHack";
import global from "./utils/Global";
import { installLogger, logAlways } from "utils/Logger";
import { runDropRooms } from "utils/Commands";
import { RoomCache } from "utils/RoomCache";
import { getCpuPolicy } from "utils/CpuPolicy";
import { getOpts, recordTick } from "utils/Bench";
import { powerDisabled, getFeatures } from "utils/Features";
import { trackRoomRcl } from "utils/Speedrun";
import { runPlanAnimator } from "utils/PlanAnimator";
import { runPlanV2Adoption } from "utils/PlanV2";
import { runAutoExpand } from "Managers/AutoExpand";
import { runMapViz } from "utils/MapViz";
import { sampleRemoteStats, installRemoteStatsCommand } from "utils/RemoteStats";
import { runWar, installWarCommands } from "War/war";
import { installSegmentCommands } from "utils/Segments";
import { publishAllyNeed } from "utils/AllyNeedSegment";
import { refreshModes } from "War/mode";
import { runReinforce } from "War/reinforce";

// import TerrainDataExporter from "./utils/TerrainDataExporter";


import CPUmanager from "Managers/CPUmanager";
import PowerCreepManager from "Managers/PowerCreepManager";
import MemoryManager from "Managers/MemoryManager";
import RunAllCreepsManager from "Managers/RunAllCreepsManager";
import ExecuteCommandsInNTicks from "Managers/ExecuteCommandsInNTicks";
import decrementTempBadRooms from "Misc/decrementTempBadRooms";

import rooms from "./Rooms/rooms";

import "./Functions/powerCreepFunctions"
import "./Functions/creepFunctions";
import "./Functions/roomFunctions";
import "./Functions/roomPositionFunctions";

import roleMineralMiner from "./Roles/mineralMiner";
import roleEnergyMiner from "./Roles/energyMiner";
import roleCarry from "./Roles/carry";
import roleEnergyManager from "./Roles/energyManager";
import roleDismantler from "./Roles/Dismantler";
import roleRemoteRepair from "./Roles/remoteRepair";
import roleBuilder from "./Roles/builder";
import roleUpgrader from "./Roles/upgrader";
import roleRepair from "./Roles/repair";
import roleMaintainer from "Roles/maintainer";
import roleFiller from "./Roles/filler";
import roleFakeFiller from "Roles/FakeFiller";
import roleControllerLinkFiller from "Roles/ControllerLinkFiller";
import roleConvoy from "Roles/Convoy";
import roleDefender from "./Roles/defender";
import roleAttacker from "./Roles/attacker";
import roleRangedAttacker from "./Roles/RangedAttacker";
import roleDrainTower from "./Roles/DrainTower";
import roleHealer from "./Roles/healer";
import roleBuildContainer from "./Roles/buildcontainer";
import roleClaimer from "./Roles/claimer";
import roleRemoteDismantler from "./Roles/remoteDismantler";
import roleDismantleControllerWalls from "Roles/DismantleControllerWalls";
import roleScout from "./Roles/scout";
import roleSweeper from "Roles/sweeper";
import roleAnnoy from "Roles/annoy";
import roleCreepKiller from "Roles/CreepKiller";
import roleReserve from "Roles/reserve";
import roleRampartDefender from "Roles/RampartDefender";
import roleRangedRampartDefender from "Roles/RangedRampartDefender";
import roleRampartErector from "Roles/RampartErector";
import roleRam from "Roles/ram";
import roleSignifer from "Roles/signifer";
import roleBilltong from "./Roles/billtong"
import roleGoblin from "Roles/goblin";
import roleSpecialRepair from "Roles/SpecialRepair";
import roleSpecialCarry from "Roles/SpecialCarry";
import roleWallClearer from "Roles/WallClearer";
import roleSquadCreepA from "Roles/Squad/SquadCreepA";
import {roleSquadCreepB, roleSquadCreepY, roleSquadCreepZ} from "Roles/Squad/SquadFollower";
import {roleDuoCreepA, roleDuoCreepB} from "Roles/Squad/SquadDuo";
import roleSign from "Roles/Sign";
import rolePriest from "Roles/Priest";
import roleGuard from "Roles/Guard";
import rolePowerMelee from "Roles/PowerMelee";
import rolePowerHeal from "Roles/PowerHeal";
import roleEfficient from "Roles/PowerCreeps/efficient";
import roleSneakyControllerUpgrader from "Roles/SneakyControllerUpgrader";
import roleSolomon from "Roles/Solomon";
import roleRampartUpgrader from "Roles/rampartUpgrader";
import roleContinuousControllerKiller from "Roles/ContinuousControllerKiller";
import roleClearer from "Roles/clearer";
import roleSafeModer from "Roles/SafeModer";

import roleCCKparty from "Roles/Party/CCKparty";
import roleFreedomFighter from "Roles/Party/FreedomFighter";

import roleRoomLocker from "Roles/RoomLocker";
import roleEscort from "Roles/Escort";

import mosquito from "Roles/mosquito";

import mosquito_attack from "Misc/mosquito_attack";
import mosquito_manager from "Misc/mosquito_manager";
import { Build_Remote_Roads } from "Rooms/rooms.construction";

global.ROLES = {
  Solomon: roleSolomon,
  RRD: roleRangedRampartDefender,
  PowerMelee: rolePowerMelee,
  PowerHeal: rolePowerHeal,
  MineralMiner: roleMineralMiner,
  EnergyMiner: roleEnergyMiner,
  carry: roleCarry,
  reserve: roleReserve,
  EnergyManager: roleEnergyManager,
  Dismantler: roleDismantler,
  RemoteRepair: roleRemoteRepair,
  builder: roleBuilder,
  upgrader: roleUpgrader,
  repair: roleRepair,
  maintainer: roleMaintainer,
  filler: roleFiller,
  FakeFiller: roleFakeFiller,
  ControllerLinkFiller: roleControllerLinkFiller,
  defender: roleDefender,
  attacker: roleAttacker,
  RangedAttacker: roleRangedAttacker,
  DrainTower: roleDrainTower,
  healer: roleHealer,
  buildcontainer: roleBuildContainer,
  claimer: roleClaimer,
  RemoteDismantler: roleRemoteDismantler,
  DismantleControllerWalls: roleDismantleControllerWalls,
  scout: roleScout,
  sweeper: roleSweeper,
  annoy: roleAnnoy,
  CreepKiller: roleCreepKiller,
  RampartDefender: roleRampartDefender,
  RampartErector: roleRampartErector,
  signifer: roleSignifer,
  ram: roleRam,
  billtong: roleBilltong,
  goblin: roleGoblin,
  SpecialRepair: roleSpecialRepair,
  SpecialCarry: roleSpecialCarry,
  WallClearer: roleWallClearer,
  SquadCreepA: roleSquadCreepA,
  SquadCreepB: roleSquadCreepB,
  SquadCreepY: roleSquadCreepY,
  SquadCreepZ: roleSquadCreepZ,
  DuoCreepA: roleDuoCreepA,
  DuoCreepB: roleDuoCreepB,
  Sign: roleSign,
  Priest: rolePriest,
  Guard: roleGuard,
  efficient: roleEfficient,
  SneakyControllerUpgrader: roleSneakyControllerUpgrader,
  Convoy: roleConvoy,
  RampartUpgrader: roleRampartUpgrader,
  CCK: roleContinuousControllerKiller,
  clearer: roleClearer,
  SafeModer: roleSafeModer,
  CCKparty: roleCCKparty,
  FreedomFighter: roleFreedomFighter,
  RoomLocker: roleRoomLocker,
  Escort: roleEscort,
  mosquito: mosquito,
};

/*
 * TOP-LEVEL PHASE ISOLATION.
 *
 * ErrorMapper.wrapLoop is a net for the whole tick, which means it is also an
 * all-or-nothing one: a throw inside rooms() used to skip creeps, commands,
 * AutoExpand and the CPU manager for that tick. Each phase now gets its own
 * try/catch so one broken subsystem costs its own work and nothing else.
 * wrapLoop stays as the outer net; call order below is unchanged.
 *
 * Heap-level throttle: at most one line per phase per 100 ticks.
 */
const lastPhaseErrorTick = new Map<string, number>();

/**
 * Per-phase CPU, exponential moving average on the heap, flushed to
 * Memory.CPU.phases every 20 ticks so it can be read off the memory API.
 * ~0.01 CPU per phase per tick; the answer to "where do 17 of 20 CPU go" is
 * otherwise a guess.
 */
const phaseEma = new Map<string, number>();
const PHASE_EMA_ALPHA = 0.05;
function notePhaseCpu(name: string, used: number): void {
  const prev = phaseEma.get(name);
  phaseEma.set(name, prev === undefined ? used : prev + PHASE_EMA_ALPHA * (used - prev));
  if (Game.time % 20 === 0 && Memory.CPU) {
    if (!Memory.CPU.phases) Memory.CPU.phases = {};
    Memory.CPU.phases[name] = Math.round((phaseEma.get(name) || 0) * 100) / 100;
  }
}

function phase(name: string, fn: () => void): void {
  const before = Game.cpu.getUsed();
  try {
    fn();
    notePhaseCpu(name, Game.cpu.getUsed() - before);
  } catch (e) {
    notePhaseCpu(name, Game.cpu.getUsed() - before);
    const last = lastPhaseErrorTick.get(name);
    if (last === undefined || Game.time - last >= 100) {
      lastPhaseErrorTick.set(name, Game.time);
      logAlways("[main] ERROR in phase", name, "-", (e && e.stack) || e);
    }
  }
}

/**
 * ONE LINE, EVERY HEARTBEAT_EVERY TICKS, WHATEVER Memory.verbose SAYS.
 *
 * With the console gate actually working again (see utils/Logger — it had been
 * silently bypassed since tick 2 of every global) a healthy bot prints nothing
 * at all, which is indistinguishable from a dead one. This is the "still here,
 * here is the state of the empire" line: cheap, periodic, and it names the
 * rooms that are in trouble rather than making someone go and look.
 *
 * A room is called out when it is doing one of the things this bot has actually
 * been caught doing: sitting on a stalled spawn queue, holding a dry tower, or
 * running an empty bank at an RCL that should have one.
 */
const HEARTBEAT_EVERY = 100;
/**
 * Offset off 0. `Game.time % 100 === 0` is already the busiest tick in the
 * schedule — it is the low-RCL construction cadence, the pruneBadFill sweep and
 * several producer rungs — and a status line has no business adding to the one
 * spike everything else is measured against.
 */
const HEARTBEAT_OFFSET = 37;

function heartbeat(tickCpu: number): void {
  if (Game.time % HEARTBEAT_EVERY !== HEARTBEAT_OFFSET) return;
  try {
    const parts: string[] = [];
    const sick: string[] = [];
    let creeps = 0;
    for (const n in Game.creeps) creeps++;

    const names: string[] = [];
    for (const name in Game.rooms) {
      const room = Game.rooms[name];
      if (room.controller && room.controller.my) names.push(name);
    }
    names.sort();

    for (const name of names) {
      const room = Game.rooms[name];
      const mem: any = room.memory || {};
      const bank = (room.storage ? room.storage.store[RESOURCE_ENERGY] || 0 : 0)
        + (room.terminal ? room.terminal.store[RESOURCE_ENERGY] || 0 : 0);
      parts.push(`${name}:L${room.controller.level}`
        + ` e${room.energyAvailable}/${room.energyCapacityAvailable}`
        + (room.storage ? ` b${Math.round(bank / 1000)}k` : ""));

      const why: string[] = [];
      if ((mem.spawnStall || 0) > 40) why.push(`stall${mem.spawnStall}`);
      const towers: any[] = room.find(FIND_MY_STRUCTURES, {
        filter: (s: any) => s.structureType === STRUCTURE_TOWER,
      });
      for (const t of towers) {
        if ((t.store[RESOURCE_ENERGY] || 0) < 200) {
          why.push("dry-tower");
          break;
        }
      }
      if (room.controller.level >= 4 && room.storage && bank < 2000) why.push("no-bank");
      if (mem.danger) why.push("UNDER-ATTACK");
      if (room.controller.ticksToDowngrade < 5000) why.push(`downgrade${room.controller.ticksToDowngrade}`);
      if (why.length) sick.push(`${name}[${why.join(" ")}]`);
    }

    logAlways(`[hb] t${Game.time} cpu${tickCpu.toFixed(1)}/${Game.cpu.limit}`
      + ` bucket${Game.cpu.bucket} gcl${Game.gcl.level} creeps${creeps}`
      + ` | ${parts.join("  ")}`
      + (sick.length ? `\n[hb] NEEDS ATTENTION: ${sick.join("  ")}` : ""));
  } catch (e) {
    // A status line may never be the thing that takes a tick down.
    logAlways("[hb] failed:", e instanceof Error ? e.message : String(e));
  }
}

export const loop = ErrorMapper.wrapLoop(() => {
  // Silent by default — Memory.verbose = true to re-enable console spam
  installLogger();
  installRemoteStatsCommand();
  installWarCommands();
  installSegmentCommands();

  const startTotal = Game.cpu.getUsed();
  // ensureBench (via getOpts) boots A/B on version bump
  const opts = getOpts();

  memHack.run();
  runDropRooms();

  MemoryManager();
  publishAllyNeed();
  if (opts.roomCache) {
    RoomCache.tick();
  }

  const policy = getCpuPolicy();
  global._cpuPolicy = policy;

  // Modes from last tick's danger flags (refresh again after rooms).
  refreshModes();
  phase("rooms", () => rooms());
  // Defence just raised/cleared distress this tick — send help if anyone shouted.
  phase("reinforce", () => runReinforce());
  refreshModes();

  // Power creeps OFF by default — power mode exposes rooms to enemy PC attacks
  if (!powerDisabled()) {
    PowerCreepManager();
  }

  // RCL tick scoreboard (game ticks, not wall-clock)
  if (getFeatures().speedrun) {
    for (const name in Game.rooms) {
      const room = Game.rooms[name];
      if (room.controller && room.controller.my) trackRoomRcl(room);
    }
  }

  phase("creeps", () => RunAllCreepsManager());

  // Combat kits / ops only when budget allows (or baseline = always run for fair compare)
  if (!opts.expensiveGate || policy.allowExpensive) {
    phase("mosquito", () => {
      mosquito_attack();
      mosquito_manager();
    });
  }

  phase("commands", () => ExecuteCommandsInNTicks());

  /*
   * BUCKET FLOOR — the load-shedding half of CpuPolicy, which until now did not
   * exist.
   *
   * `policy.economyOnly` (bucket under 2000 on a low-CPU shard) has been
   * computed on every tick since CpuPolicy was written and READ BY NOTHING —
   * docs/AGGRESSION-HANDOFF.md §6 lists it as "a free field". So the only brake
   * the bot had was the remote gate at 5000, and between there and an empty
   * bucket nothing whatsoever was given up. A bucket that reaches zero is not a
   * slow bot, it is a bot the server starts skipping ticks for, and it gets
   * there while every optional subsystem is still running at full price.
   *
   * What is shed here is everything the empire can be blind to for a while:
   * planning overlays, expansion, map visuals, remote statistics, and offence.
   * What deliberately keeps running at any bucket level: rooms, creeps, spawn
   * commands, tempBadRooms, and — most importantly — `reinforce`, which is how
   * a room under attack gets help. A CPU crisis must never turn into a defence
   * outage, which is exactly what gating the wrong phase would cause.
   */
  const starved = policy.economyOnly;
  if (starved && Game.time % 100 === 0) {
    logAlways(`[cpu] bucket ${policy.bucket} — economyOnly: planning/expansion/war shed until it recovers`);
  }

  // Planner replay overlay — no-op unless Memory.planAnim.active
  if (!starved) {
    phase("planAnimator", () => runPlanAnimator());
    phase("planV2Adoption", () => runPlanV2Adoption());
    phase("mapViz", () => runMapViz());
    phase("autoExpand", () => runAutoExpand());
  }

  /*
   * WAR — intel ingest + target scoring. See docs/AGGRESSION-DOCTRINE.md.
   *
   * Currently OBSERVE-ONLY: it records, ranks and explains, but issues no
   * orders and changes no existing behaviour.
   *
   * Placed after the other segment users. That used to be load-bearing —
   * AutoExpand and MapViz each carried a private setActiveSegments that only
   * unioned against LAST tick's active set, so whoever ran last silently
   * cancelled the others' same-tick requests. Both now go through
   * utils/Segments' shared per-tick accumulator, so order no longer decides
   * who keeps their slot. Running late is still the right place: every other
   * phase has finished establishing vision, so war records the settled state
   * of the tick.
   *
   * Deliberately NOT gated on allowExpensive: a war machine that goes blind
   * exactly when the bucket dips is worse than useless. Its internal work is
   * self-limiting instead — 2 rooms/tick ingest, 50-tick scoring cache,
   * segment writes that are both interval- and bucket-gated, and a dispatch
   * pass that runs once every DISPATCH_EVERY ticks.
   *
   * It IS gated on the economyOnly floor, which is a different bar: that is not
   * "the bucket dipped", it is "the bucket is about to hit zero and the server
   * will start skipping our ticks". Intel going stale for a few hundred ticks
   * is survivable; the whole bot stalling is not. Defence does not come through
   * here (see reinforce, above) so nothing is left undefended by this.
   */
  if (!starved) {
    phase("war", () => runWar());
  }

  phase("tempBadRooms", () => decrementTempBadRooms());

  if (!starved) {
    phase("remoteStats", () => sampleRemoteStats());
  }

  const tickCpu = Game.cpu.getUsed() - startTotal;
  recordTick(tickCpu);

  let tickTotal = tickCpu.toFixed(2);
  console.log(tickTotal + "ms", "on this tick", Memory.bench && Memory.bench.profile);

  heartbeat(tickCpu);

  phase("CPUmanager", () => CPUmanager(tickTotal));
  global.buildRemoteRoads = function (roomName) {
    Build_Remote_Roads(Game.rooms[roomName]);
  };
});
