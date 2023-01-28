// rollup -cw --environment DEST:main

import "./utils/Commands";
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
import roleMaintainer from "Roles/maintainer";
import roleFiller from "./Roles/filler";
import roleControllerLinkFiller from "Roles/ControllerLinkFiller";
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

import rolePowerMelee from "Roles/PowerHeal";
import rolePowerHeal from "Roles/PowerHeal";

global.ROLES = {
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
}



import { memHack } from "utils/MemHack";



export const loop = ErrorMapper.wrapLoop(() => {
  const startTotal = Game.cpu.getUsed();


  memHack.run()
//   console.log(Game.time % 100 + "/100");

  rooms();


  const start = Game.cpu.getUsed()

  let executeCreepScriptsLaterList = [];

  for(let name in Memory.creeps) {

    if(name.startsWith("SquadCreepA") || name.startsWith("SquadCreepB") || name.startsWith("SquadCreepY") || name.startsWith("SquadCreepZ")) {
      executeCreepScriptsLaterList.push(name);
    }

    else {
      let creep = Game.creeps[name];
      if(!creep) {
          delete Memory.creeps[name];
      }
      else {
          if(creep.memory.role == undefined) {
              console.log("i am undefined", name)
              creep.suicide();
          }
          global.ROLES[creep.memory.role].run(creep);
      }
    }
  }

  for(let name of executeCreepScriptsLaterList) {
    let creep = Game.creeps[name];
    if(!creep) {
        delete Memory.creeps[name];
    }
    else {
        if(creep.memory.role == undefined) {
            console.log("i am undefined", name)
            creep.suicide();
        }
        if(creep.memory.role == "SquadCreepA") {
          global.ROLES[creep.memory.role].run(creep);
        }
    }
  }
  for(let name of executeCreepScriptsLaterList) {
    let creep = Game.creeps[name];
    if(!creep) {
        delete Memory.creeps[name];
    }
    else {
        if(creep.memory.role == undefined) {
            console.log("i am undefined", name)
            creep.suicide();
        }
        if(creep.memory.role !== "SquadCreepA") {
          global.ROLES[creep.memory.role].run(creep);
        }
    }
  }

  console.log('Creeps Ran in', Game.cpu.getUsed() - start, 'ms');

  if(Game.time % 100 == 0) {
    if(!Memory.CPU) {
      Memory.CPU = {};
    }
    if(!Memory.CPU.reduce) {
      Memory.CPU.reduce = false;
    }
    let difference = Game.cpu.bucket - Memory.CPU.bucket
    console.log(" ");
    console.log("-------------------", difference + "ms of CPU difference in the last 100 ticks");
    console.log(" ");
    console.log("-------------------", "Averaging", (2000-difference)/100, "CPU per tick")
    Memory.CPU.bucket = Game.cpu.bucket;
  }

  if(Game.time % 100 == 0) {
      console.log(" ");
      console.log("-------------------",Game.cpu.bucket, 'unused cpu in my bucket');
      console.log(" ");
      // if(Game.cpu.bucket == 10000) {
      //     if(Game.cpu.generatePixel() == 0) {
      //         console.log('- generating pixel -');
      //         console.log('- generating pixel -');
      //         console.log('- generating pixel -');
      //         console.log('- generating pixel -');
      //         console.log('- generating pixel -');
      //     }
      // }
  }

  let tickTotal = (Game.cpu.getUsed() - startTotal).toFixed(2);
  console.log(tickTotal);

  if(!Memory.CPU) {
    Memory.CPU = {};
  }
  if(!Memory.CPU.hundredTickAvg) {
    Memory.CPU.hundredTickAvg = {};
    Memory.CPU.hundredTickAvg.data = [];
    Memory.CPU.hundredTickAvg.avg = 0;
  }
  if(!Memory.CPU.fiveHundredTickAvg) {
    Memory.CPU.fiveHundredTickAvg = {};
    Memory.CPU.fiveHundredTickAvg.data = [];
    Memory.CPU.fiveHundredTickAvg.avg = 0;
  }

  Memory.CPU.hundredTickAvg.data.push(tickTotal)

  if(Game.time % 100 == 0) {
    let total = 0;
    for(let num of Memory.CPU.hundredTickAvg.data) {
      total += Number(num);
    }
    let average = (total / 100).toFixed(2);

    Memory.CPU.hundredTickAvg.avg = average;
    console.log("hundred tick average is " + average)
    Memory.CPU.hundredTickAvg.data = [];


    Memory.CPU.fiveHundredTickAvg.data.push(average)
    if(Game.time % 500 == 0) {

      let total = 0;
      for(let num of Memory.CPU.fiveHundredTickAvg.data) {
        total += Number(num);
      }
      let average = (total / 5).toFixed(2);

      Memory.CPU.fiveHundredTickAvg.avg = average;
      console.log("five hundred tick average is " + average)
      Memory.CPU.fiveHundredTickAvg.data = [];

    }
  }

});
