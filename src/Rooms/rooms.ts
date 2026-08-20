import roomDefence from "./rooms.defence";
import spawning from "./rooms.spawning";
import construction, { Remote_Roads_Tick, Situational_Building } from "./rooms.construction";
import market from "./rooms.market";
import labs from "./rooms.labs";
import observe from "./rooms.observe";
import data from "./rooms.data";
import remotes, { manageRemotes, scanRemoteThreats, roomTickOffset } from "./rooms.remotes";
import powerSpawning from "./rooms.powerSpawning";
import supportOtherRooms from "./rooms.supportOtherRooms";
import { getCpuPolicy } from "utils/CpuPolicy";
import { powerDisabled, speedrunEnabled } from "utils/Features";
import { applySpeedrunSpawnHints, skipHighRclRoom } from "utils/Speedrun";
import { placeFromPlanV2 } from "utils/PlanV2";
import { refreshUnreachable, pruneBadFill } from "utils/Reachability";
import { forwardToControllerLink } from "../Roles/energyMiner";
import { logAlways } from "utils/Logger";
import { isSkeleton } from "War/mode";
import { wipeForeignSites } from "utils/ForeignSites";

/*
 * PER-ROOM FAULT ISOLATION.
 *
 * ErrorMapper.wrapLoop in main.ts is the only try/catch above this file, so a
 * throw anywhere in the room pass (spawning / defence / market / labs /
 * construction / observe / ...) used to abort the WHOLE tick before the creeps
 * ever ran - one bad room froze the empire. Every room iteration now runs
 * inside guarded(): the room that threw is skipped, the rest of the tick
 * continues, and the error is logged (never swallowed silently).
 *
 * Heap-level (not Memory) throttle: at most one line per room per 100 ticks,
 * so a room that throws every tick cannot flood the console.
 */
const lastRoomErrorTick = new Map<string, number>();

function guarded(room: any, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    const name = typeof room === "string" ? room : (room && room.name) || "unknown";
    const last = lastRoomErrorTick.get(name);
    if (last === undefined || Game.time - last >= 100) {
      lastRoomErrorTick.set(name, Game.time);
      logAlways("[rooms] ERROR in", name, "-", (e && e.stack) || e);
    }
  }
}

function rooms() {
  /* */

  const start = Game.cpu.getUsed();
  // _.forEach(Memory.rooms, function(RoomMemory) {

  // });

  let myRooms = [];

  let roomsIController = 0;

  // Body of the per-visible-room pass. Hoisted out of the _.forEach purely so
  // it can be handed to guarded() below - contents unchanged.
  const eachVisibleRoom = function (room: any) {
    // if(!room.controller) {
    //     delete room.memory;
    // }
    // if(room.controller.level == 0) {
    //     delete room.memory;
    // }

    if (room && room.controller && room.controller.my) {
      if (skipHighRclRoom(room)) return;
      if (Game.time % 100 == 0) {
        let spawnAmount = room.find(FIND_MY_SPAWNS).length;
        if (room.controller.level >= 6 && spawnAmount == 0) {
          if (!Memory.keepAfloat.includes(room.name)) {
            Memory.keepAfloat.push(room.name);
          }
        } else if (room.controller.level >= 6 && spawnAmount > 0) {
          if (Memory.keepAfloat.includes(room.name)) {
            Memory.keepAfloat = Memory.keepAfloat.filter(r => r !== room.name);
          }
        }
      }

      if (room.controller.safeMode && room.controller.safeMode > 100 && Game.time % 100 === 0) {
        let hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        if (!hostileCreeps.length) {
          room.memory.danger = false;
          room.memory.danger_timer = 0;
        }
      }

      if (room.memory.danger) {
        console.log(room.name, room.memory.danger_timer);
        room.memory.danger_timer++;
        if (room.memory.danger_timer > 10000) {
          room.memory.danger_timer = 0;
        }
      } else if (!room.memory.danger && room.memory.danger_timer !== 0) {
        console.log(room.name, room.memory.danger_timer);
        if (room.memory.danger_timer > 5) {
          room.memory.danger_timer -= 5;
        } else {
          room.memory.danger_timer = 0;
        }
      }

      roomsIController += 1;
      myRooms.push(room.name);
    }

    if (Game.time % 400 == 0) {
      let progress = 0;
      let level = 1;
      let current = false;
      if (Game.time % 25000 === 0) {
        _.forEach(Game.rooms, function (anyroom: any) {
          if (
            anyroom &&
            anyroom.controller &&
            anyroom.controller.my &&
            anyroom.controller.level < 8 &&
            anyroom.controller.level >= 6
          ) {
            if (anyroom.controller.level > level) {
              current = anyroom.name;
              level = anyroom.controller.level;
              progress = anyroom.controller.progress;
            } else if (anyroom.controller.level == level) {
              if (anyroom.controller.progress > progress) {
                current = anyroom.name;
                level = anyroom.controller.level;
                progress = anyroom.controller.progress;
              }
            }
          }
        });
      }

      if (current) Memory.targetRampRoom.room = current;

      // .my is load-bearing here: this % 400 block runs for EVERY visible
      // room (the owned-room branch only opens further down), so an OBSERVED
      // foreign RCL6 room could capture the ramp target - and because the
      // urgent-latch release requires targetRampRoom.room to equal an OWNED
      // room's name, a foreign name could never be released.
      if (room.controller && room.controller.my && room.controller.level == 6 && room.controller.progress < 10000) {
        Memory.targetRampRoom.room = room.name;
      }
      if (room.memory.Structures) {
        let storage: any = Game.getObjectById(room.memory.Structures.storage);
        if (room.controller && room.controller.my && room.controller.level >= 6 && room.terminal && storage && storage.store[RESOURCE_ENERGY] < 75000) {
          Memory.targetRampRoom.room = room.name;
        }
      }
    }

    if (room && room.controller && room.controller.my) {
      if (!isSkeleton(room.name)) supportOtherRooms(room);

      if (!room.memory.Structures) {
        room.memory.Structures = {};
      }

      // Structures.storage can hold the pre-storage CONTAINER id forever:
      // the container keeps existing after the real storage is built, so
      // every `getObjectById(cache) || findStorage()` caller short-circuits
      // on it (bit fillers, spawn gates, and links). Re-point when stale.
      if (room.storage && room.memory.Structures.storage !== room.storage.id) {
        room.memory.Structures.storage = room.storage.id;
        delete room.memory.Structures.bin; // re-derive next to the real storage
      }

      if (!room.memory.reserveFill) {
        room.memory.reserveFill = [];
      }

      // Keep the controller link fed. Room-level on purpose: this is a
      // structure action, and the rooms that strand energy in a link are the
      // ones that have already lost the creep that used to drive it.
      // See Roles/energyMiner.ts forwardToControllerLink().
      if (room.controller.level >= 5) {
        forwardToControllerLink(room);
      }

      if (room.controller.level >= 5 && room.memory.Structures.container) {
        delete room.memory.Structures.container;
      }

      if (room.memory.danger && room.memory.danger_timer > 125 && Game.time % 25 == 0) {
        let remoteRooms = Object.keys(room.memory.resources);
        if (remoteRooms.length > 1) {
          remoteRooms = remoteRooms.filter(function (remoteRoom) {
            return remoteRoom !== room.name;
          });
          if (remoteRooms.length > 1) {
            for (let remoteRoom of remoteRooms) {
              room.memory.resources[remoteRoom].active = false;
            }
          }
        }
      }

      if (Game.time % 1000 === 0) {
        if (Memory.AvoidRooms) {
          if (Memory.AvoidRooms.includes(room.name)) {
            Memory.AvoidRooms = Memory.AvoidRooms.filter(function (roomname) {
              return roomname !== room.name;
            });
          }
        } else {
          Memory.AvoidRooms = [];
        }
      }

      if (Game.time % 84 == 0 && room.controller.level > 1 && room.controller.level !== 8) {
        console.log(
          room.name,
          "has",
          Math.floor((room.controller.progress / room.controller.progressTotal) * 100) + "%",
          "and is level",
          room.controller.level
        );
      }

      // Squatter cleanup for a freshly claimed room. This used to hang off the
      // GLOBAL `Game.time % 25000`, so a room claimed one tick after that
      // modulus landed kept the previous owner's walls for another 25000 ticks
      // (~21h) - the one window where they hurt most. Now it is claim-relative:
      // once as soon as we see the room at RCL1, then at most every 25000 ticks.
      if (room.controller.level == 1 && !room.controller.safeMode) {
        const lastSweep = room.memory.squatterSweepTick;
        if (!room.memory.squatterSweepDone || lastSweep === undefined || Game.time - lastSweep >= 25000) {
          room.memory.squatterSweepDone = true;
          room.memory.squatterSweepTick = Game.time;
          let walls = room.find(FIND_STRUCTURES, {
            filter: building =>
              building.structureType == STRUCTURE_WALL ||
              (!building.my &&
                building.structureType != STRUCTURE_ROAD &&
                building.structureType != STRUCTURE_CONTAINER)
          });
          for (let wall of walls) {
            wall.destroy();
          }
        }
      }

      if (room.memory.danger && room.memory.danger_timer > 100) {
        if (room.memory.danger_timer > 350) {
          Memory.CPU.reduce = true;
        }
        let storage: any = Game.getObjectById(room.memory.Structures.storage);
        if (storage && storage.store[RESOURCE_ENERGY] < 175000) {
          Memory.targetRampRoom.room = room.name;
          if (storage.store[RESOURCE_ENERGY] < 80000) {
            Memory.targetRampRoom.urgent = true;
          } else if (Game.time % 400 == 0) {
            Memory.targetRampRoom.urgent = false;
          }
        }
      } else {
        if (Game.time % 1000 == 0) {
          Memory.CPU.reduce = false;
        }

        /*
         * RELEASE THE RAMPART-EMERGENCY LATCH.
         *
         * `urgent` is raised at the top of this block, and its ONLY reset
         * (`Game.time % 400 == 0`) lived INSIDE `danger && danger_timer > 100`
         * and `storage < 175000` — i.e. the reset was only reachable while the
         * room was still under attack. The moment the raid ended the branch
         * stopped running and the flag stayed true forever.
         *
         * Live cost on W1N1 (RCL7, no hostiles, danger:false, danger_timer:0):
         * `Memory.targetRampRoom = {room:"W1N1", urgent:true}` kept the room
         * pinned as the empire's rampart target with an extra filler and the
         * SpecialRepair rung primed, while two 36-WORK repairers burned ~72
         * energy/tick into ramparts already at 4.2-7.5M hits — storage fell
         * 35 454 -> 19 826 in 444 ticks and the upgrader starved.
         *
         * We are in the no-danger branch for this room, so if this room is the
         * one that raised the flag, the emergency is over: drop `urgent` once
         * the ramparts are back above a sane floor. Below that floor the room
         * still needs the reinforcement budget even in peacetime, so the flag
         * is left alone and only the shooting-war rungs (which all require
         * `room.memory.danger`) stay closed.
         */
        // throttled: while the ramparts really are thin this check would
        // otherwise run a room-wide find() every tick, forever.
        if (Game.time % 25 == 0 && Memory.targetRampRoom && Memory.targetRampRoom.urgent && Memory.targetRampRoom.room == room.name) {
          const RAMPART_PEACETIME_FLOOR = room.controller.level >= 8 ? 10000000 : 3000000;
          const weakRamparts = room.find(FIND_MY_STRUCTURES, {
            filter: (s: any) => s.structureType == STRUCTURE_RAMPART && s.hits < RAMPART_PEACETIME_FLOOR
          });
          if (weakRamparts.length == 0) {
            Memory.targetRampRoom.urgent = false;
            console.log("[ramp-latch]", room.name, "no danger and all ramparts >=",
              RAMPART_PEACETIME_FLOOR, "- releasing targetRampRoom.urgent");
          }
        }
      }

      if (
        room.memory.danger &&
        (room.controller.level == 2 || room.controller.level == 3) &&
        (!room.memory.Structures.towers || room.memory.Structures.towers.length == 0)
      ) {
        room.controller.activateSafeMode();
      }

      if (!Memory.AvoidRooms) {
        Memory.AvoidRooms = [];
      }

      if (!Memory.AvoidRoomsTemp) {
        Memory.AvoidRoomsTemp = {};
      }

      if (!Memory.billtong_rooms) {
        Memory.billtong_rooms = [];
      }

      if (!powerDisabled()) {
        powerSpawning(room);
      }
      if (speedrunEnabled()) {
        applySpeedrunSpawnHints(room);
      }
      spawning(room);
      if (room.controller && room.controller.my) wipeForeignSites(room);
      // Orphan migrate flag after a stripped plan keeps siting the old bunker.
      if ((room.memory as any).planMigration && !room.memory.planV2) {
        delete (room.memory as any).planMigration;
      }

      if (Game.time % 500 === 0 && room.memory.ram_coming) {
        delete room.memory.ram_coming;
      }

      // const defenceTime = Game.cpu.getUsed()

      roomDefence(room);
      // console.log('Room Defence Ran in', Game.cpu.getUsed() - defenceTime, 'ms')

      if (room.controller.level == 8 && (!Memory.CPU.reduce || Game.cpu.bucket >= 8000) && !isSkeleton(room.name)) {
        observe(room);
      }
      data(room);

      if (room.terminal && room.controller.level >= 6 && !isSkeleton(room.name)) {
        // Staggered per room so every terminal room does not scan Game.market
        // on the same tick (same idiom as manageRemotes). Labs stays on the
        // plain %10: its internal refresh cadences (%120 / %500 / %21000 in
        // rooms.labs.ts) sit on absolute Game.time, and a %120 tick only
        // lands on a staggered %10 gate when the room's offset is itself a
        // multiple of 10 - for every other room they would simply never run.
        if ((Game.time + roomTickOffset(room.name)) % 10 === 0) {
          const start = Game.cpu.getUsed();
          market(room);
          console.log("Market Ran in", Game.cpu.getUsed() - start, "ms");
        }
        if (Game.time % 10 === 0) {
          labs(room);
        }
      }

      if (Game.time % 10 == 0 || Game.time < 10) {
        // const start = Game.cpu.getUsed()
        identifySources(room);
        // console.log('Identify Sources Ran in', Game.cpu.getUsed() - start, 'ms')
      }

      if (Game.time % 3012 == 0 && Game.cpu.bucket > 3500 && !room.memory.danger) {
        _.forEach(Game.rooms, function (everyRoom) {
          guarded(everyRoom, function () {
            if (
              everyRoom &&
              everyRoom.memory &&
              !everyRoom.memory.danger &&
              // OWNED rooms only. For a REMOTE this list is RemoteRepair's
              // entire repair enrollment; wiping it made the repairer arrive,
              // find nothing repairable, latch serviced and recycle — while
              // the rung kept re-spawning it for the still-decaying roads.
              everyRoom.controller && everyRoom.controller.my &&
              everyRoom.find(FIND_MY_CONSTRUCTION_SITES).length == 0
            ) {
              everyRoom.memory.keepTheseRoads = [];
            }
          });
        });
      }
      let bucket = Game.cpu.bucket;

      // v2-planned rooms: keep the 4 site slots recycling. placeFromPlanV2 is
      // cheap (one FIND_STRUCTURES + one FIND_MY_CONSTRUCTION_SITES, no
      // PathFinder), so it does not need the 100/1000-tick construction
      // cadence — at RCL4+ that cadence meant ~4 structures per 1000 ticks.
      // construction() still calls it too; the function is idempotent.
      if (room.memory.planV2 && Game.time % 15 === 0 && !isSkeleton(room.name)) {
        placeFromPlanV2(room);
      }

      // Which structures can a creep actually stand next to? Self-throttling
      // (one flood fill per ~50 ticks) and it MUST run before the fill target
      // pickers, which is why it sits in the room loop and not in a role.
      refreshUnreachable(room);
      if (Game.time % 100 === 0) {
        pruneBadFill(room);
      }

      // Low RCL: build more often so extensions/containers aren't stuck waiting 1000 ticks.
      // High RCL keeps the old expensive cadence.
      const constructionInterval = room.controller.level < 4 ? 100 : 1000;
      if (
        !isSkeleton(room.name) &&
        ((Game.time % constructionInterval == 0 && bucket > 3500) ||
          room.memory.data.DOB == 2 ||
          room.memory.data.DOBug == 2)
      ) {
        const start = Game.cpu.getUsed();
        construction(room);
        if (Memory.verbose) console.log("BASE Construction Ran in", Game.cpu.getUsed() - start, "ms");
      }

      // Which neighbours this commune remotes. Cheap, self-throttling
      // (per-room stagger inside), owns room.memory.resources[*].active.
      if (!isSkeleton(room.name)) manageRemotes(room);

      // Threat sweep runs far more often than manageRemotes' 25-tick cadence:
      // "leave fast" is only fast if we notice fast.
      if (Game.time % 5 === 0) {
        scanRemoteThreats(room);
      }

      // Remote roads + per-source pathLength. Every tick, but per-REMOTE
      // cadence and vision-triggered inside: `Game.time % 500` here meant the
      // pass only did anything if a creep happened to be standing in the
      // remote on that one tick, so remotes stayed unscored and unpaved
      // forever. Remote_Roads_Tick is a for-in over room.memory.resources with
      // early continues (no find, no PathFinder) when nothing is due, and does
      // at most one remote's PathFinder work per room per tick.
      if (bucket > 5000 && room.controller.level >= 4 && getCpuPolicy().allowRemotes) {
        Remote_Roads_Tick(room);
      }
      Situational_Building(room);
    }

    // const establishMemoryTime = Game.cpu.getUsed()
    establishMemory(room);
    // console.log('Establish Memory Ran in', Game.cpu.getUsed() - establishMemoryTime, 'ms');

    // let list = Memory.tasks.wipeRooms.destroyStructures
    // console.log(JSON.stringify(list.length))

    if (Game.time % 25000 == 0) {
      _.forEach(Game.constructionSites, function (site) {
        // Spawn sites wait for CBs; 0-creep is the bootstrap, not stale remotes.
        if (site.structureType == STRUCTURE_SPAWN) return;
        if (site.room == undefined || site.room.find(FIND_MY_CREEPS).length == 0) {
          site.remove();
          console.log("site removed for being unbuilt for ages");
        }
      });
    }
    // let constructionSites = room.find(FIND_CONSTRUCTION_SITES);
    // console.log(constructionSites.length)
    // for (var site of constructionSites) {
    //     if (site.structureType == STRUCTURE_ROAD) {
    //         if(site.remove() == 0) {
    //             console.log("it's working")
    //         }
    //     }
    // }
  };

  _.forEach(Game.rooms, function (room: any) {
    guarded(room, function () {
      eachVisibleRoom(room);
    });
  });

  if (Game.time % 300 == 0) {
    if (Game.gcl.level > roomsIController) {
      Memory.CanClaimRemote = Game.gcl.level - roomsIController;
    } else {
      Memory.CanClaimRemote = 0;
    }
  }

  if (Game.time % 10000 == 0) {
    _.forEach(Memory.rooms, function (memoryRoom, roomName) {
      if (!Game.rooms[roomName] || (Game.rooms[roomName].controller && Game.rooms[roomName].controller.level == 0)) {
        delete Memory.rooms[roomName];
      }
    });
  }
  // let uselessMemory = false;
  // if(!visibleRoom.controller || (visibleRoom.controller && visibleRoom.controller.level == 0)) {
  //     delete Memory.rooms[visibleRoom.name];
  // }

  if (Game.time % 500 == 1) {
    const policy = getCpuPolicy();

    // NOTE: opening remotes now lives in manageRemotes() (rooms.remotes.ts),
    // which runs per-room every 25 ticks instead of flipping one flag on one
    // randomly-picked commune every 500 ticks. What stays here is the CPU
    // panic valve: when the bot is over budget, shut every remote down.
    // A pinned bucket means we are under budget regardless of the averages
    // (see CpuPolicy.allowRemotes) - the valve is for a DRAINING bucket, and
    // closing every remote in the empire while it sits at 10000 is what
    // oscillated E37N59's fleet on and off every 500 ticks.
    // Trust CpuPolicy.allowRemotes only. The old `fiveHundredTickAvg > limit-2`
    // closed remotes at avg 18.5 / limit 20 / bucket 7400 — the same
    // double-counted margin that latched remotes off in CpuPolicy before
    // the monotone fix. Closing remotes drops income, not CPU.
    if (!policy.allowRemotes) {
      for (let roomName of myRooms) {
        let room = Game.rooms[roomName];
        guarded(room || roomName, function () {
          if (!room || !room.memory.resources) return;
          let remoteRooms = Object.keys(room.memory.resources);
          if (remoteRooms.length > 1) {
            remoteRooms = remoteRooms.filter(function (remoteRoom) {
              return remoteRoom !== roomName;
            });
            // Close every remote this commune owns. (The old loop re-read
            // `.active` immediately after setting it to false and broke out on
            // the result, so `found` could never be true - both the flag and
            // the outer break were dead code.)
            if (remoteRooms.length > 1) {
              for (let remoteRoom of remoteRooms) {
                room.memory.resources[remoteRoom].active = false;
              }
            }
          }
        });
      }
    }
  }

  console.log("Rooms Ran in", Game.cpu.getUsed() - start, "ms");
}

/*
 * How many of OUR attacker / RangedAttacker creeps are standing in each room.
 *
 * establishMemory() ran this whole Game.creeps scan once per NON-OWNED visible
 * room (every 3 ticks): with scouts/observers up that is dozens of full creep
 * sweeps for an answer that is identical for every room. Computed once per
 * tick now and memoised on the heap against Game.time; rooms with no attackers
 * are simply absent from the map (callers use `|| 0`, which matches the old
 * "counter stayed at 0" branch exactly).
 */
let attackerScanTick = -1;
let attackerScanResult: { [roomName: string]: number } = {};

function attackersByRoom(): { [roomName: string]: number } {
  if (attackerScanTick === Game.time) return attackerScanResult;
  attackerScanTick = Game.time;
  attackerScanResult = {};
  _.forEach(Game.creeps, function (creep) {
    if (creep.memory.role == "attacker" || creep.memory.role === "RangedAttacker") {
      const where = creep.room.name;
      attackerScanResult[where] = (attackerScanResult[where] || 0) + 1;
    }
  });
  return attackerScanResult;
}

function establishMemory(room) {
  if (Game.time % 3 == 0 || Game.time < 10) {
    if (!Memory.tasks) {
      Memory.tasks = {};
    }

    if (!Memory.tasks.wipeRooms) {
      Memory.tasks.wipeRooms = {};
    }

    if (!Memory.tasks.wipeRooms.destroyStructures) {
      Memory.tasks.wipeRooms.destroyStructures = [];
    }

    if (!Memory.tasks.wipeRooms.killCreeps) {
      Memory.tasks.wipeRooms.killCreeps = [];
    }

    // console.log(JSON.stringify(Memory.tasks))

    let HostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
    let HostileCreeps: Array<Creep> = room.find(FIND_HOSTILE_CREEPS);
    let isArmed = false;

    // check if has attacking parts.
    if (HostileCreeps.length > 0) {
      HostileCreeps.forEach(Hostile => {
        for (let part of Hostile.body)
          if (part.type == ATTACK || part.type == RANGED_ATTACK) {
            isArmed = true;
            break;
          }
      });
    }

    if ((room.controller && !room.controller.my) || !room.controller) {
      if (!room.memory.roomData) {
        room.memory.roomData = {};
      }

      if (HostileStructures.length > 0) {
        if (!Memory.tasks.wipeRooms.destroyStructures.includes(room.name)) {
          Memory.tasks.wipeRooms.destroyStructures.push(room.name);
        }
        room.memory.roomData.has_hostile_structures = true;
      } else {
        Memory.tasks.wipeRooms.destroyStructures = Memory.tasks.wipeRooms.destroyStructures.filter(
          element => element != room.name
        );
        room.memory.roomData.has_hostile_structures = false;
      }

      if (HostileCreeps.length > 0 && isArmed) {
        if (!Memory.tasks.wipeRooms.killCreeps.includes(room.name)) {
          Memory.tasks.wipeRooms.killCreeps.push(room.name);
        }
        // calculate total attack parts, ranged attack parts, and heal parts
        let attackParts = 0;
        let rangedAttackParts = 0;
        let healParts = 0;

        HostileCreeps.forEach(Hostile => {
          for (let part of Hostile.body) {
            let boostMultiplier = 1;
            let toughMultiplier = 0;

            if (part.boost) {
              switch (part.boost) {
                case "XUH2O": // T3 boost for ATTACK
                case "XKHO2": // T3 boost for RANGED_ATTACK
                case "XLHO2": // T3 boost for HEAL
                  boostMultiplier = 4;
                  break;
                case "UH2O": // T2 boost for ATTACK
                case "KHO2": // T2 boost for RANGED_ATTACK
                case "LHO2": // T2 boost for HEAL
                  boostMultiplier = 3;
                  break;
                case "UH": // T1 boost for ATTACK
                case "KO": // T1 boost for RANGED_ATTACK
                case "LO": // T1 boost for HEAL
                  boostMultiplier = 2;
                  break;
                case "XGHO2": // T3 boost for TOUGH
                  toughMultiplier = 24;
                  break;
                case "GHO2": // T2 boost for TOUGH
                  toughMultiplier = 11;
                  break;
                case "GO": // T1 boost for TOUGH
                  toughMultiplier = 5; //4.2 ish
                  break;
              }
            }

            if (part.type == ATTACK) {
              attackParts += boostMultiplier;
            } else if (part.type == RANGED_ATTACK) {
              rangedAttackParts += boostMultiplier;
            } else if (part.type == HEAL) {
              healParts += boostMultiplier;
            } else if (part.type == TOUGH) {
              // Boosted TOUGH absorbs OUR damage - like enemy healing, it
              // raises how much RANGED_ATTACK we need. It was being added to
              // rangedAttackParts, i.e. counted as enemy OFFENSE, which
              // inflated our heal requirement instead and blew the defender
              // body past 50 parts.
              healParts += toughMultiplier;
            }
          }
        });

        room.memory.roomData.has_hostile_creeps = true;
        // Freshness stamp: this flag is only ever written WITH vision, so on a
        // blind remote it survives arbitrarily long after the hostiles left.
        // fleeHomeIfInDanger honors it only while recent — the spawning side
        // (rooms.spawning ~:5473) already refuses stale reads the same way.
        room.memory.roomData.hostile_t = Game.time;
        room.memory.roomData.hostile_body_type = {
          attack: attackParts,
          ranged_attack: rangedAttackParts,
          heal: healParts
        };

        room.memory.roomData.has_only_invader = true;
        for (let Hostile of HostileCreeps) {
          if (Hostile.getActiveBodyparts(ATTACK) > 0 || Hostile.getActiveBodyparts(RANGED_ATTACK) > 0) {
            room.memory.roomData.has_only_invader = false;
          }
        }
      } else if (HostileCreeps.length > 0) {
        room.memory.roomData.has_safe_creeps = true;
        room.memory.roomData.has_hostile_creeps = false;
        room.memory.roomData.has_only_invader = false;
      } else {
        Memory.tasks.wipeRooms.killCreeps = Memory.tasks.wipeRooms.killCreeps.filter(element => element != room.name);
        room.memory.roomData.has_hostile_creeps = false;
        delete room.memory.roomData.hostile_body_type;
        room.memory.roomData.has_safe_creeps = false;
        room.memory.roomData.has_only_invader = false;
      }

      const attackersInRoom: number = attackersByRoom()[room.name] || 0;
      if (attackersInRoom == 0) {
        room.memory.roomData.has_attacker = false;
      } else {
        room.memory.roomData.has_attacker = true;
      }
    }

    if (Game.rooms[room.name] == undefined) {
      Memory.tasks.wipeRooms.killCreeps = Memory.tasks.wipeRooms.killCreeps.filter(element => element != room.name);
      room.memory.roomData.has_hostile_creeps = false;

      Memory.tasks.wipeRooms.destroyStructures = Memory.tasks.wipeRooms.destroyStructures.filter(
        element => element != room.name
      );
      room.memory.has_hostile_structures = false;
    }
  }
}

function identifySources(room) {
  if (!room.memory.resources) {
    room.memory.resources = {};
  }

  if (!room.memory.resources[room.name]) {
    let sources = room.find(FIND_SOURCES);

    _.forEach(sources, function (source) {
      let data = _.get(room.memory, ["resources", room.name, "energy", source.id]);
      if (data === undefined) {
        _.set(room.memory, ["resources", room.name, "energy", source.id], {});
      }
    });
  }
  remotes(room);
}

export default rooms;
// module.exports = rooms;
