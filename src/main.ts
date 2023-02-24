import "./utils/Commands";
import { ErrorMapper } from "./utils/ErrorMapper";
import { memHack } from "utils/MemHack";
import global from "./utils/Global";

import CPUmanager from "Managers/CPUmanager";
import PowerCreepManager from "Managers/PowerCreepManager";
import MemoryManager from "Managers/MemoryManager";
import RunAllCreepsManager from "Managers/RunAllCreepsManager";
import ExecuteCommandsInNTicks from "Managers/ExecuteCommandsInNTicks";

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
import roleCreepKiller from "Roles/creepKiller";
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
import roleSquadCreepB from "Roles/Squad/SquadCreepB";
import roleSquadCreepY from "Roles/Squad/SquadCreepY";
import roleSquadCreepZ from "Roles/Squad/SquadCreepZ";
import roleSign from "Roles/Sign";
import rolePriest from "Roles/Priest";
import roleGuard from "Roles/Guard";
import rolePowerMelee from "Roles/PowerMelee";
import rolePowerHeal from "Roles/PowerHeal";
import roleEfficient from "Roles/PowerCreeps/efficient";
import roleSneakyControllerUpgrader from "Roles/SneakyControllerUpgrader";
import roleSolomon from "Roles/Solomon";

global.ROLES = {
  Solomon: roleSolomon,
  RRD: roleRangedRampartDefender,
  PowerMelee: rolePowerMelee,
  PowerHeal: rolePowerHeal,
  MineralMiner: roleMineralMiner,
  EnergyMiner : roleEnergyMiner,
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
  Sign: roleSign,
  Priest: rolePriest,
  Guard: roleGuard,
  efficient: roleEfficient,
  SneakyControllerUpgrader: roleSneakyControllerUpgrader,
  Convoy: roleConvoy,
}

export const loop = ErrorMapper.wrapLoop(() => {

  const startTotal = Game.cpu.getUsed();

  memHack.run()

  MemoryManager();

  rooms();

  PowerCreepManager();

  RunAllCreepsManager();

  ExecuteCommandsInNTicks();

  let tickTotal = (Game.cpu.getUsed() - startTotal).toFixed(2);
  console.log(tickTotal + "ms", "on this tick");

  CPUmanager(tickTotal);

});
