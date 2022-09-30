// rollup -cw --environment DEST:main


import { ErrorMapper } from "utils/ErrorMapper";

import rooms from "./rooms";

import "./creepFunctions";
import "./roomFunctions";
import "./roomPositionFunctions";


import roleMineralMiner from "./role.mineralMiner";
import roleEnergyMiner from "./role.energyMiner";
import roleCarry from "./role.carry";
import roleEnergyManager from "./role.energyManager";
import roleDismantler from "./role.Dismantler";
import roleRemoteRepair from "./role.remoteRepair";
import roleBuilder from "./role.builder";
import roleUpgrader from "./role.upgrader";
import roleRepair from "./role.repair";
import roleFiller from "./role.filler";
import roleDefender from "./role.defender";
import roleAttacker from "./role.attacker";
import roleRangedAttacker from "./role.RangedAttacker";
import roleDrainTower from "./role.DrainTower";
import roleHealer from "./role.healer";
import roleBuildContainer from "./role.buildcontainer";
import roleClaimer from "./role.claimer";
import roleRemoteDismantler from "./role.remoteDismantler";
import roleScout from "./role.scout";



// import * as creepFunctions from "./creepFunctions";


declare global {
  /*
    Example types, expand on these or remove them and add your own.
    Note: Values, properties defined here do no fully *exist* by this type definiton alone.
          You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */
  interface Memory {
    tasks:any;
    uuid: number;
    log: any;
  }
  interface RoomMemory {
    has_hostile_structures:boolean;
    has_hostile_creeps:boolean;
    has_attacker:boolean;
    danger: boolean;
    name:string;
  }
  interface CreepMemory {
    name:string;
    role: string;
    room: object;
    working: boolean;
  }

  // Syntax for adding proprties to `global` (ex "global.log")
  namespace NodeJS {
    interface Global {
      ROLES: any;
    }
  }
}


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
