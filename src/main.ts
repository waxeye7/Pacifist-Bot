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

export const loop = ErrorMapper.wrapLoop(() => {
  // Silent by default — Memory.verbose = true to re-enable console spam
  installLogger();
  installRemoteStatsCommand();

  const startTotal = Game.cpu.getUsed();
  // ensureBench (via getOpts) boots A/B on version bump
  const opts = getOpts();

  memHack.run();
  runDropRooms();

  MemoryManager();
  if (opts.roomCache) {
    RoomCache.tick();
  }

  const policy = getCpuPolicy();
  global._cpuPolicy = policy;

  phase("rooms", () => rooms());

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

  // Planner replay overlay — no-op unless Memory.planAnim.active
  phase("planAnimator", () => runPlanAnimator());
  phase("planV2Adoption", () => runPlanV2Adoption());
  phase("mapViz", () => runMapViz());
  phase("autoExpand", () => runAutoExpand());

  phase("tempBadRooms", () => decrementTempBadRooms());

  phase("remoteStats", () => sampleRemoteStats());

  const tickCpu = Game.cpu.getUsed() - startTotal;
  recordTick(tickCpu);

  let tickTotal = tickCpu.toFixed(2);
  console.log(tickTotal + "ms", "on this tick", Memory.bench && Memory.bench.profile);

  phase("CPUmanager", () => CPUmanager(tickTotal));
  global.buildRemoteRoads = function (roomName) {
    Build_Remote_Roads(Game.rooms[roomName]);
  };
});
