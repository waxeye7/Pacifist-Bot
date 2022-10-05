// rollup -cw --environment DEST:main


import { ErrorMapper } from "./utils/ErrorMapper";

import global from "./utils/Global";

import rooms from "./Rooms/rooms";

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
import roleFiller from "./Roles/filler";
import roleDefender from "./Roles/defender";
import roleAttacker from "./Roles/attacker";
import roleRangedAttacker from "./Roles/RangedAttacker";
import roleDrainTower from "./Roles/DrainTower";
import roleHealer from "./Roles/healer";
import roleBuildContainer from "./Roles/buildcontainer";
import roleClaimer from "./Roles/claimer";
import roleRemoteDismantler from "./Roles/remoteDismantler";
import roleScout from "./Roles/scout";
import roleSweeper from "Roles/sweeper";

global.ROLES = {
  MineralMiner: roleMineralMiner,

  EnergyMiner : roleEnergyMiner,
  carry: roleCarry,

  EnergyManager: roleEnergyManager,

  Dismantler: roleDismantler,
  RemoteRepair: roleRemoteRepair,


  builder: roleBuilder,
  upgrader: roleUpgrader,
  repair: roleRepair,

  filler: roleFiller,
  defender: roleDefender,

  attacker: roleAttacker,
  RangedAttacker: roleRangedAttacker,

  DrainTower: roleDrainTower,
  healer: roleHealer,

  buildcontainer: roleBuildContainer,
  claimer: roleClaimer,

  RemoteDismantler: roleRemoteDismantler,
  scout: roleScout,

  sweeper: roleSweeper,
}


// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  console.log(Game.time % 100 + "/100");

  rooms();

  const start = Game.cpu.getUsed()
  for(let name in Memory.creeps) {
      let creep = Game.creeps[name];
      if(!creep) {
          delete Memory.creeps[name];
      }
      else {
          if(creep.memory.role == undefined) {
              console.log("i am undefined", name)
              creep.suicide();
              break;
          }
          global.ROLES[creep.memory.role].run(creep);
      }
  }
  console.log('Creeps Ran in', Game.cpu.getUsed() - start, 'ms');

  if(Game.time % 17 == 1 && Game.shard.name == "shard0" ||
     Game.time % 17 == 1 && Game.shard.name == "shard1" ||
     Game.time % 17 == 1 && Game.shard.name == "shard2" ||
     Game.time % 17 == 1 && Game.shard.name == "shard3") {
      console.log(" ");
      console.log("------------------------",Game.cpu.bucket, 'unused cpu in my bucket', "------------------------");
      console.log(" ");
      if(Game.cpu.bucket == 10000) {
          if(Game.cpu.generatePixel() == 0) {
              console.log('1');
              console.log('2');
              console.log('3');
              console.log('4');
              console.log('5');
              console.log('6');
              console.log('7');
              console.log('8');
              console.log('9');
              console.log('x');
              console.log('generating pixel');
              console.log('x');
              console.log('9');
              console.log('8');
              console.log('7');
              console.log('6');
              console.log('5');
              console.log('4');
              console.log('3');
              console.log('2');
              console.log('1');
          }
      }
  }
});
