import { recordRoomIfStale } from "War/intel";
import { isAlly, scoutQueue } from "War/score";
import { logAlways } from "utils/Logger";
import {
    isEnterable,
    roomKind,
    roomNameToCoord,
    roomsInRange,
    ROOM_HIGHWAY,
    ROOM_NORMAL,
} from "War/geo";

/**
 * The intel sweep box: every NORMAL room within Chebyshev `radius` of home,
 * minus home itself. This replaces two hand-rolled E/W/N/S loops that parsed
 * room names by CHARACTER POSITION — for a name with a 3-digit coordinate
 * ("E127N58", which is a real room at the map's edge) the parse produced NaN
 * and the loop emitted NOTHING, so that room's observer silently idled
 * forever. War/geo's regex parse handles any coordinate size and its W-side
 * -1 offset makes the meridian wraparound ordinary arithmetic.
 *
 * The radius rule preserves the old quirk: rooms with two-digit coordinates
 * on both axes (what "name.length == 6" actually meant) swept ±5, everything
 * else swept ±4.
 */
export function intelSweepRooms(roomName: string): string[] {
    const c = roomNameToCoord(roomName);
    if (!c) return [];
    const x = c.wx >= 0 ? c.wx : -c.wx - 1;
    const y = c.wy >= 0 ? c.wy : -c.wy - 1;
    const radius = x >= 10 && y >= 10 ? 5 : 4;
    const out: string[] = [];
    for (const n of roomsInRange(roomName, radius)) {
        if (n === roomName || roomKind(n) !== ROOM_NORMAL) continue;
        out.push(n);
    }
    return out;
}

/**
 * The power/deposit sweep: every HIGHWAY room within 4 that is still
 * enterable. The old loops applied the getRoomStatus check on only one of
 * their two branches — a closed or novice highway room in the other branch
 * cost an observeRoom call that could never pay. Both paths skip it now.
 */
export function powerSweepRooms(roomName: string): string[] {
    const out: string[] = [];
    for (const n of roomsInRange(roomName, 4)) {
        if (n === roomName || roomKind(n) !== ROOM_HIGHWAY || !isEnterable(n)) continue;
        out.push(n);
    }
    return out;
}

/** Throttle for the intel-capture error line — at most one per 100 ticks. */
let lastIntelErrorTick = -1;

// Same-tick de-dupe so 8 observers do not all stare at the closest stale room.
let aimTick = -1;
let aimedThisTick: { [name: string]: boolean } = Object.create(null);

/** First stale/unseen room in this observer's existing box, or null. */
function pickScoutTarget(box: string[]): string | null {
    if (aimTick !== Game.time) {
        aimTick = Game.time;
        aimedThisTick = Object.create(null);
    }
    const inBox: { [n: string]: boolean } = Object.create(null);
    for (let i = 0; i < box.length; i++) inBox[box[i]] = true;
    const q = scoutQueue(1000);
    for (let i = 0; i < q.length; i++) {
        const n = q[i];
        if (!inBox[n] || aimedThisTick[n]) continue;
        aimedThisTick[n] = true;
        return n;
    }
    return null;
}

/** True when a claimer is already committed to `adj` (live or queued, any home). */
function claimTargetBusy(adj: string): boolean {
    if (Memory.target_colonise && Memory.target_colonise.room === adj) return true;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c || !c.memory || c.memory.targetRoom !== adj) continue;
        if (c.memory.role === "claimer" || c.memory.role === "Claimer") return true;
    }
    for (const rName in Game.rooms) {
        const r = Game.rooms[rName];
        if (!r.controller || !r.controller.my || !r.memory.spawn_list) continue;
        const list = r.memory.spawn_list;
        // flat [body, name, opts] triples - the memory lives on the opts slot
        for (let i = 0; i + 2 < list.length; i += 3) {
            const opts: any = list[i + 2];
            const mem = opts && opts.memory;
            if (mem && (mem.role === "claimer" || mem.role === "Claimer") && mem.targetRoom === adj) return true;
        }
    }
    return false;
}

function observe(room) {
    // One observeRoom per cycle over a ~100 room list, so the sweep takes
    // interval * RoomsToSee.length ticks. observeRoom itself is free and the
    // processing pass below is bucket-gated, so 8 is the default instead of 64.
    // Memory.observeEvery = 64 restores the old cadence.
    const configured = (Memory as any).observeEvery;
    let interval = typeof configured === "number" && configured >= 2 ? Math.floor(configured) : 8;
    // The power/deposit sweep keeps its own (much slower) cadence so that
    // speeding up the intel sweep doesn't multiply highway scanning too.
    let twoTimesInterval = 128;
    let observer:any = Game.getObjectById(room.memory.Structures.observer) || room.findObserver();
    if(observer && (Game.time % interval == 0 || Game.time % interval == 1) && Game.cpu.bucket > 8000) {
        if(!room.memory.observe) {
            room.memory.observe = {};
        }

        if(!room.memory.observe.RoomsToSee) {
            room.memory.observe.RoomsToSee = intelSweepRooms(room.name);
        }

        let RoomsToSee = room.memory.observe.RoomsToSee

        if(RoomsToSee.length > 0 && Game.time % interval == 0) {
            if(!room.memory.observe.lastObserved || room.memory.observe.lastObserved >= RoomsToSee.length) {
                room.memory.observe.lastObserved = 0
            }


            let chosenRoom = RoomsToSee[room.memory.observe.lastObserved]
            // Same box as the sweep — we do not expand what this observer
            // is allowed to look at. We only reorder: stale/unseen closest
            // first. When the scout queue is empty the old round-robin runs.
            try {
                const aimed = pickScoutTarget(RoomsToSee);
                if (aimed) chosenRoom = aimed;
            } catch (e) { /* never break the observer for intel */ }
            const observeResult = observer.observeRoom(chosenRoom);

            // Always advance the sweep, but only claim vision when the call took.
            // A failed observeRoom used to leave lastRoomObserved pointing at the
            // previous room, and the next tick processed that stale data as fresh.
            room.memory.observe.lastObserved += 1;

            if(observeResult === OK) {
                // 8x the cadence would be 8x this line, so it follows setVerbose now
                if(Memory.verbose) console.log("seeing", chosenRoom)
                room.memory.observe.lastRoomObserved = chosenRoom;
                room.memory.observe.lastRoomObservedTick = Game.time;
            }
            else {
                console.log("observeRoom failed for", chosenRoom, observeResult)
            }

        }

        if(Game.time % interval == 1) {
            let adj = room.memory.observe.lastRoomObserved;
            // Capture what the observer just painted, BEFORE any of the "should
            // we act on it" gates. This vision is free — it exists for exactly
            // this tick and was previously discarded whole.
            //
            // Deliberately above areRoomsNormalToThisRoom(): that guard is a
            // findRoute walk that fails if ANY room on the path home is
            // novice/respawn, which says nothing about whether the observed
            // room is worth remembering. Remembering is not attacking.
            //
            // recordRoomIfStale (not recordRoom) because this gate is on an
            // ABSOLUTE clock — every RCL8 room reaches it on the same tick, so
            // an unbudgeted call here means N fresh find(FIND_STRUCTURES)
            // sweeps land on one tick. The shared budget in War/intel caps it.
            // See docs/AGGRESSION-DOCTRINE.md 4.1.
            if (adj && Game.rooms[adj]) {
                try {
                    recordRoomIfStale(Game.rooms[adj]);
                } catch (e) {
                    // Intel must never break the observer — but it must not fail
                    // SILENTLY either, or a systematic throw burns CPU here every
                    // few ticks forever with an empty DB and no signal at all.
                    if (Game.time - lastIntelErrorTick >= 100) {
                        lastIntelErrorTick = Game.time;
                        logAlways("[intel] recordRoom failed for", adj, "-", (e && e.stack) || e);
                    }
                }
            }
            // only act on intel we actually asked for last tick
            if(adj && room.memory.observe.lastRoomObservedTick === Game.time - 1 && areRoomsNormalToThisRoom(room.name, adj)) {
                if (
                  Game.rooms[adj] &&
                  room.name !== adj &&
                  Game.rooms[adj].controller &&
                  !Game.rooms[adj].controller.my &&
                  !isAlly(Game.rooms[adj].controller.owner && Game.rooms[adj].controller.owner.username) &&
                  !isAlly(Game.rooms[adj].controller.reservation && Game.rooms[adj].controller.reservation.username) &&
                  Game.map.getRoomStatus(adj).status == "normal"
                ) {
                  let buildings = Game.rooms[adj].find(FIND_STRUCTURES, {
                    filter: s =>
                      s.structureType !== STRUCTURE_ROAD &&
                      s.structureType !== STRUCTURE_CONTAINER &&
                      s.structureType !== STRUCTURE_CONTROLLER &&
                      s.structureType !== STRUCTURE_INVADER_CORE &&
                      s.pos.x >= 1 &&
                      s.pos.x <= 48 &&
                      s.pos.y >= 1 &&
                      s.pos.y <= 48
                  });
                  let openControllerPositions;

                  if (Game.rooms[adj].controller.level == 0) {
                    openControllerPositions = Game.rooms[adj].controller.pos.getOpenPositionsIgnoreCreepsCheckStructs();

                    // RCL0 leftover towers must stay on AvoidRooms. The old
                    // drop here undid creepFunctions the next observe pass.
                    const rcl0Towered = Game.rooms[adj].find(FIND_HOSTILE_STRUCTURES, {
                      filter: (s: any) => s.structureType === STRUCTURE_TOWER,
                    }).length > 0;
                    if (!rcl0Towered) {
                      if (!Memory.AvoidRooms) {
                        Memory.AvoidRooms = [];
                      }
                      Memory.AvoidRooms = Memory.AvoidRooms.filter(room => room !== adj);
                    }


                    if (
                      openControllerPositions &&
                      openControllerPositions.length > 0 &&
                      buildings.length > 0 &&
                      !Game.rooms[adj].controller.reservation
                    ) {
                      if (Memory.CanClaimRemote >= 1 && !claimTargetBusy(adj) && Game.rooms[adj].find(FIND_SOURCES).length >= 2) {
                        let canReachController = true;

                        let nameOfRoomsWithExits = Object.values(Game.map.describeExits(adj));
                        for (let roomName of nameOfRoomsWithExits) {
                          // Exits were enumerated from adj; findExit(home, neighbor-of-adj)
                          // is non-adjacent → ERR_NO_PATH → canReachController stayed true
                          // and we spawned a WallClearer instead of the dismantler.
                          const exitDirection: any = Game.map.findExit(adj, roomName);
                          const exit: any = Game.rooms[adj].controller.pos.findClosestByRange(exitDirection);
                          if (exit) {
                            if (
                              PathFinder.search(
                                Game.rooms[adj].controller.pos,
                                { pos: exit, range: 0 },
                                {
                                  maxRooms: 1,
                                  maxCost: 600,
                                  swampCost: 1,
                                  roomCallback: function (roomName): any {
                                    let thisRoom = Game.rooms[roomName];
                                    if (!thisRoom) return;
                                    let costs = new PathFinder.CostMatrix();

                                    thisRoom.find(FIND_STRUCTURES).forEach(function (struct) {
                                      if (struct.structureType === STRUCTURE_ROAD) {
                                        // Favor roads over plain tiles
                                        costs.set(struct.pos.x, struct.pos.y, 1);
                                      } else if (
                                        struct.structureType !== STRUCTURE_CONTAINER &&
                                        (struct.structureType !== STRUCTURE_RAMPART || !struct.my)
                                      ) {
                                        // Can't walk through non-walkable buildings
                                        costs.set(struct.pos.x, struct.pos.y, 255);
                                      }
                                    });

                                    return costs;
                                  }
                                }
                              ).incomplete
                            ) {
                              canReachController = false;
                              break;
                            }
                          } else {
                            canReachController = true;
                          }
                        }

                        if (canReachController) {
                          let found = false;

                          for (let creepName in Game.creeps) {
                            if (creepName.startsWith("WallClearer")) {
                              if (
                                Game.creeps[creepName].memory.role == "WallClearer" &&
                                Game.creeps[creepName].memory.homeRoom == room.name
                              ) {
                                found = true;
                                break;
                              }
                            }
                          }

                          if (!found) {
                            let newName = "WallClearer-" + room.name + "-" + adj;
                            room.memory.spawn_list.push([CLAIM, MOVE], newName, {
                              memory: { role: "WallClearer", homeRoom: room.name, targetRoom: adj }
                            });
                            console.log("Adding wall-clearer to Spawn List: " + newName);
                          }
                        }
                        if (!canReachController) {
                          let found = false;

                          for (let creepName in Game.creeps) {
                            if (creepName.startsWith("DismantleControllerWalls")) {
                              if (
                                Game.creeps[creepName].memory.role == "DismantleControllerWalls" &&
                                Game.creeps[creepName].memory.homeRoom == room.name
                              ) {
                                found = true;
                                break;
                              }
                            }
                          }

                          if (!found) {
                            let newName = "DismantleControllerWalls-" + room.name + "-" + adj;
                            room.memory.spawn_list.push(
                              [
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK
                              ],
                              newName,
                              { memory: { role: "DismantleControllerWalls", homeRoom: room.name, targetRoom: adj } }
                            );
                            console.log("Adding DismantleControllerWalls to Spawn List: " + newName);
                          }
                        }
                      }
                    } else if (
                      // Same claim-eligibility gates as the open-tile arm;
                      // otherwise we spend ~4500e dismantling rooms we cannot claim.
                      openControllerPositions &&
                      openControllerPositions.length == 0 &&
                      !Game.rooms[adj].controller.reservation &&
                      Memory.CanClaimRemote >= 1 &&
                      !claimTargetBusy(adj) &&
                      Game.rooms[adj].find(FIND_SOURCES).length >= 2
                    ) {
                      let found = false;

                      for (let creepName in Game.creeps) {
                        if (creepName.startsWith("DismantleControllerWalls")) {
                          if (
                            Game.creeps[creepName].memory.role == "DismantleControllerWalls" &&
                            Game.creeps[creepName].memory.homeRoom == room.name
                          ) {
                            found = true;
                            break;
                          }
                        }
                      }

                      if (!found) {
                        let newName = "DismantleControllerWalls-" + room.name + "-" + adj;
                        room.memory.spawn_list.push(
                          [
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            MOVE,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK,
                            WORK
                          ],
                          newName,
                          { memory: { role: "DismantleControllerWalls", homeRoom: room.name, targetRoom: adj } }
                        );
                        console.log("Adding DismantleControllerWalls to Spawn List: " + newName);
                      }
                    }
                  } else {
                    // Offence used to live here: a 500-line RCL/tower/Math.random()
                    // tree that fired SGD/SD/SQR/SS the tick the observer painted.
                    // War/dispatch now owns that from intel (same primitives, no coin flip).
                    // This file still does claim/dismantle for unowned RCL0 rooms above.
                  }
                }
                else {
                  // Observe is %interval==0, this process tick is %interval==1. Without
                  // vision we used to drop adj from AvoidRooms, so towered
                  // rooms became walkable after a missed observe.
                  if (Game.rooms[adj]) {
                    const stillTowered = Game.rooms[adj].find(FIND_HOSTILE_STRUCTURES, {
                      filter: (s: any) => s.structureType === STRUCTURE_TOWER,
                    }).length > 0;
                    if (!stillTowered) {
                      if(!Memory.AvoidRooms) {
                        Memory.AvoidRooms = [];
                      }

                      Memory.AvoidRooms = Memory.AvoidRooms.filter(room => room !== adj);
                    }
                  }
                }
            }


        }

    }

    // find power banks
    if(observer && (Game.time % twoTimesInterval == 2 || Game.time % twoTimesInterval == 3) && Game.cpu.bucket > 7000) {

        if(!room.memory.observe)
            room.memory.observe = {};

        if(!room.memory.observe.listOfRoomsForPower) {

            if(!room.memory.observe.lastRoomObservedForPowerIndex) {
                room.memory.observe.lastRoomObservedForPowerIndex = 0;
            }

            room.memory.observe.listOfRoomsForPower = powerSweepRooms(room.name);
        }

        if(room.memory.observe.listOfRoomsForPower) {

            let RoomsToSee = room.memory.observe.listOfRoomsForPower

            // never fire two observeRoom intents in the same tick when a custom
            // Memory.observeEvery lines the two sweeps up
            if(RoomsToSee.length > 0 && Game.time % twoTimesInterval == 2 && Game.time % interval !== 0) {
                if(!room.memory.observe.lastRoomObservedForPowerIndex || room.memory.observe.lastRoomObservedForPowerIndex >= RoomsToSee.length) {
                    room.memory.observe.lastRoomObservedForPowerIndex = 0
                }


                let chosenRoom = RoomsToSee[room.memory.observe.lastRoomObservedForPowerIndex]
                observer.observeRoom(chosenRoom);


                console.log("seeing FOR POWER", chosenRoom)


                room.memory.observe.lastRoomObservedForPowerIndex += 1;
                room.memory.observe.lastRoomObservedForPower = chosenRoom;

            }

            if(Game.time % twoTimesInterval == 3) {
                let adj = room.memory.observe.lastRoomObservedForPower;

                // `adj` is undefined until the first power sweep fires — and
                // forever when listOfRoomsForPower came out EMPTY (a ±4 box
                // around a sector-centre room like E15N15 holds no highway).
                // findRoute(home, undefined) ran a whole-map BFS that could
                // never match, every 128 ticks, for the life of such a room.
                if(adj && areRoomsNormalToThisRoom(room.name, adj)) {
                    let seenRoom = Game.rooms[adj];

                    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

                    if(seenRoom && storage && storage.store[RESOURCE_ENERGY] > 225000) {

                        let walls = seenRoom.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_WALL});
                        if(walls.length == 0) {

                            // let powerBanks = seenRoom.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_POWER_BANK && (s.ticksToDecay > 1700 || s.ticksToDecay > 1000 && s.hits < 700000)});

                            let deposits = seenRoom.find(FIND_DEPOSITS);

                            // if(powerBanks.length > 0 && storage.store[RESOURCE_ENERGY] > 330000 && (powerBanks[0].hits < 2000000 && Game.cpu.bucket > 7000 || Game.cpu.bucket > 9000) &&
                            //  powerBanks[0].pos.getOpenPositionsIgnoreCreeps().length > 1 &&
                            //  storage.store[RESOURCE_ENERGY] > 350000) {

                            //     global.SPK(room.name, adj);

                            // }

                            if(deposits.length > 0 && storage.store[RESOURCE_ENERGY] > 225000 && Game.cpu.bucket >= 9750) {

                                // let hostiles = seenRoom.find(FIND_HOSTILE_CREEPS)
                                // if(hostiles.length > 0) {
                                //     let allow = true;
                                //     for(let eCreep of hostiles) {
                                //         if(eCreep.getActiveBodyparts(ATTACK) > 0) {
                                //             allow = false;
                                //             break;
                                //         }
                                //         else if(eCreep.getActiveBodyparts(RANGED_ATTACK) > 0) {
                                //             allow = false;
                                //             break;
                                //         }
                                //     }

                                //     if(allow) {
                                //         let newName = 'Deposit-Attacker-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                                //         room.memory.spawn_list.push([MOVE,ATTACK], newName, {memory: {role: 'attacker', targetRoom: seenRoom.name, homeRoom:room.name}});
                                //         console.log('Adding Deposit-Attacker to Spawn List: ' + newName);
                                //     }


                                // }
                                if(deposits[0].lastCooldown < 20) {
                                    global.SDM(room.name, adj);
                                }

                            }

                        }





                    }
                }





            }


        }

    }

}


function areRoomsNormalToThisRoom(homeRoom, targetRoom) {
    let route = Game.map.findRoute(homeRoom, targetRoom)
    if(route && route !== -2 && route.length > 0) {
        for(let partOfRoute of route) {
            if(Game.map.getRoomStatus(partOfRoute.room).status !== "normal") {
                return false;
            }
        }
    }
    else {
        return false;
    }

    return true;
}

export default observe;
