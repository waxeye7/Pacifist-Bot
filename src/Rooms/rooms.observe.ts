function observe(room) {
    let interval = 64;
    let twoTimesInterval = interval*2
    let observer:any = Game.getObjectById(room.memory.Structures.observer) || room.findObserver();
    if(observer && (Game.time % interval == 0 || Game.time % interval == 1) && Game.cpu.bucket > 8000) {
        if(!room.memory.observe) {
            room.memory.observe = {};
        }

        if(!room.memory.observe.RoomsToSee) {
            let RoomsToSee = [];


            if(room.name.length == 6) {
                let EastOrWest = room.name[0];
                let NorthOrSouth = room.name[3];

                let homeRoomNameX = parseInt(room.name[1] + room.name[2]);
                let homeRoomNameY = parseInt(room.name[4] + room.name[5]);
                for(let i = homeRoomNameX-5; i<=homeRoomNameX+5; i++) {
                    for(let o = homeRoomNameY-5; o<=homeRoomNameY+5; o++) {
                        if(i % 10 !== 0 && o % 10 !== 0) {
                            if(i % 10 >= 4 && i % 10 <= 6 && o % 10 >= 4 && o % 10 <= 6) {
                                // do nothing
                            }
                            else {
                                let firstString = i.toString();
                                let secondString = o.toString();
                                let roomName = EastOrWest + firstString + NorthOrSouth + secondString;
                                if(room.name !== roomName) {
                                    RoomsToSee.push(roomName);
                                }
                            }
                        }
                    }
                }
            }
            else if(room.name.length !== 6) {
                let EastOrWest = room.name[0];
                let NorthOrSouth;
                let homeRoomNameX;
                let homeRoomNameY;
                if(!isNaN(room.name[2])) {
                    NorthOrSouth = room.name[3];
                    homeRoomNameX = parseInt(room.name[1] + room.name[2]);
                    homeRoomNameY = parseInt(room.name[4]);
                }
                else {
                    NorthOrSouth = room.name[2];
                    homeRoomNameX = parseInt(room.name[1]);
                    if(room.name.length == 4) {
                        homeRoomNameY = parseInt(room.name[3]);
                    }
                    else if(room.name.length == 5) {
                        homeRoomNameY = parseInt(room.name[3] + room.name[4]);
                    }
                }
                for(let i = homeRoomNameX-4; i<=homeRoomNameX+4; i++) {
                    let EorW;
                    let x;
                    let switchX = false;
                    if(i < 0) {
                        switchX = true;
                    }

                    if(switchX) {
                        x = Math.abs(i);
                        x -= 1;
                        if(EastOrWest == "E") {
                            EorW = "W"
                        }
                        else {
                            EorW = "E";
                        }
                    }
                    else {
                        x = i;
                        EorW = EastOrWest;
                    }
                    for(let o = homeRoomNameY-4; o<=homeRoomNameY+4; o++) {
                        let NorS;
                        let y;
                        let switchY = false;
                        if(o < 0) {
                            switchY = true;
                        }

                        if(switchY) {
                            y = Math.abs(o);
                            y -= 1;
                            if(NorthOrSouth == "N") {
                                NorS = "S"
                            }
                            else {
                                NorS = "N";
                            }
                        }
                        else {
                            y = o;
                            NorS = NorthOrSouth;
                        }
                        if(x % 10 !== 0 && y % 10 !== 0) {
                            if(x % 10 >= 4 && x % 10 <= 6 && y % 10 >= 4 && y % 10 <= 6) {
                                // do nothing
                            }
                            else {

                                let firstString = x.toString();
                                let secondString = y.toString();
                                let roomName = EorW + firstString + NorS + secondString;
                                if(room.name !== roomName) {
                                    RoomsToSee.push(roomName);
                                }
                            }
                        }
                    }
                }
            }

            room.memory.observe.RoomsToSee = RoomsToSee;
        }

        let RoomsToSee = room.memory.observe.RoomsToSee

        if(RoomsToSee.length > 0 && Game.time % interval == 0) {
            if(!room.memory.observe.lastObserved || room.memory.observe.lastObserved >= RoomsToSee.length) {
                room.memory.observe.lastObserved = 0
            }


            let chosenRoom = RoomsToSee[room.memory.observe.lastObserved]
            observer.observeRoom(chosenRoom);


            console.log("seeing", chosenRoom)


            room.memory.observe.lastObserved += 1;
            room.memory.observe.lastRoomObserved = chosenRoom;

        }

        if(Game.time % interval == 1) {
            let adj = room.memory.observe.lastRoomObserved;
            if(areRoomsNormalToThisRoom(room.name, adj)) {
                if (
                  Game.rooms[adj] &&
                  room.name !== adj &&
                  Game.rooms[adj].controller &&
                  (!Game.rooms[adj].controller.owner || Game.rooms[adj].controller.owner) &&
                  !Game.rooms[adj].controller.my &&
                  Game.rooms[adj].controller.owner?.username !== "An1via" &&
                  Game.rooms[adj].controller.owner?.username !== "Cornered_Hamster" &&
                  Game.rooms[adj].controller.owner?.username !== "nanachi" &&
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

                    // remove this room name from avoidrooms
                    if (!Memory.AvoidRooms) {
                      Memory.AvoidRooms = [];
                    }
                    Memory.AvoidRooms = Memory.AvoidRooms.filter(room => room !== adj);


                    if (
                      openControllerPositions &&
                      openControllerPositions.length > 0 &&
                      buildings.length > 0 &&
                      !Game.rooms[adj].controller.reservation
                    ) {
                      if (Memory.CanClaimRemote >= 1) {
                        let canReachController = true;

                        let nameOfRoomsWithExits = Object.values(Game.map.describeExits(adj));
                        for (let roomName of nameOfRoomsWithExits) {
                          const exitDirection: any = Game.map.findExit(room.name, roomName);
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
                                    if (!room) return;
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
                    } else if (openControllerPositions && openControllerPositions.length == 0) {
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
                  } else if (Game.rooms[adj].controller.level == 2 && !Game.rooms[adj].controller.safeMode) {
                    let hostileSpawns = Game.rooms[adj].find(FIND_HOSTILE_SPAWNS);
                    let hostileCreeps = Game.rooms[adj].find(FIND_HOSTILE_CREEPS);
                    if (hostileSpawns.length > 0 && hostileCreeps.length > 0) {
                      global.SGD(room.name, adj, [
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
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
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
                        MOVE
                      ]);
                      Memory.commandsToExecute.push({
                        delay: 1000,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });

                      Memory.commandsToExecute.push({
                        delay: 5000,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    } else if (hostileSpawns.length > 0 && hostileCreeps.length == 0) {
                      global.SGD(room.name, adj, [
                        MOVE,
                        MOVE,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        MOVE,
                        MOVE,
                        MOVE
                      ]);
                      Memory.commandsToExecute.push({
                        delay: 1000,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    } else if (hostileCreeps.length && !hostileSpawns.length) {
                      global.SGD(room.name, adj, [
                        MOVE,
                        MOVE,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        MOVE,
                        MOVE,
                        MOVE
                      ]);
                      Memory.commandsToExecute.push({
                        delay: 50,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    }
                  } else if (
                    (Game.rooms[adj].controller.level == 3 || Game.rooms[adj].controller.level == 4) &&
                    !Game.rooms[adj].controller.safeMode
                  ) {
                    let controllerFreePositions = Game.rooms[adj].controller.pos.getOpenPositionsIgnoreCreeps().length;
                    let hostileSpawns = Game.rooms[adj].find(FIND_HOSTILE_SPAWNS);
                    let hostileCreeps = Game.rooms[adj].find(FIND_HOSTILE_CREEPS);
                    let hostileTowers = Game.rooms[adj].find(FIND_HOSTILE_STRUCTURES, {
                      filter: s => s.structureType == STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > 9
                    });
                    if (hostileSpawns.length > 0 && hostileTowers.length > 0) {
                      // if(controllerFreePositions > 1 && room.storage && room.storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] > 2000 && room.storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] > 3000 && room.storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] > 1000 && room.storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] > 2000) {
                      //     global.spawn_hunting_party(room.name, adj, controllerFreePositions)
                      // }
                      // else {
                      Memory.commandsToExecute.push({
                        delay: 1,
                        bucketNeeded: 7000,
                        formation: "RangedQuad",
                        homeRoom: room.name,
                        Boosted: false,
                        targetRoom: adj
                      });
                      Memory.commandsToExecute.push({
                        delay: 500,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                      // }
                    } else if (hostileSpawns.length > 0 && hostileCreeps.length > 0 && hostileTowers.length == 0) {
                      global.SGD(room.name, adj, [
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
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
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
                        MOVE
                      ]);
                      Memory.commandsToExecute.push({
                        delay: 1000,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    } else if (hostileSpawns.length > 0 && hostileCreeps.length == 0 && hostileTowers.length == 0) {
                      global.SGD(room.name, adj, [
                        MOVE,
                        MOVE,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        MOVE,
                        MOVE,
                        MOVE
                      ]);
                      Memory.commandsToExecute.push({
                        delay: 1000,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    } else if (hostileCreeps.length && !hostileSpawns.length && !hostileTowers.length) {
                      let armedHostileCreeps = hostileCreeps.filter(
                        c => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0
                      );
                      if (!armedHostileCreeps) {
                        global.SGD(room.name, adj, [
                          MOVE,
                          MOVE,
                          ATTACK,
                          ATTACK,
                          ATTACK,
                          ATTACK,
                          ATTACK,
                          MOVE,
                          MOVE,
                          MOVE
                        ]);
                      } else {
                        global.SD(room.name, adj, false);
                      }

                      Memory.commandsToExecute.push({
                        delay: 200,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    }
                  } else if (Game.rooms[adj].controller.level == 5 && !Game.rooms[adj].controller.safeMode) {
                    let hostileSpawns = Game.rooms[adj].find(FIND_HOSTILE_SPAWNS);
                    let hostileCreeps = Game.rooms[adj].find(FIND_HOSTILE_CREEPS);
                    let hostileTowers = Game.rooms[adj].find(FIND_HOSTILE_STRUCTURES, {
                      filter: s => s.structureType == STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > 9
                    });
                    if (hostileSpawns.length > 0 && hostileTowers.length > 0) {
                      global.SD(room.name, adj, true);
                      Memory.commandsToExecute.push({
                        delay: 1000,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    } else if (hostileSpawns.length > 0 && hostileCreeps.length > 0 && hostileTowers.length == 0) {
                      global.SGD(room.name, adj, [
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
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
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
                        MOVE
                      ]);
                      Memory.commandsToExecute.push({
                        delay: 1000,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    } else if (hostileSpawns.length > 0 && hostileCreeps.length == 0) {
                      global.SGD(room.name, adj, [
                        MOVE,
                        MOVE,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        MOVE,
                        MOVE,
                        MOVE
                      ]);
                      Memory.commandsToExecute.push({
                        delay: 1000,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    } else if (
                      Game.rooms[adj].controller.level == 5 &&
                      hostileCreeps.length &&
                      !hostileSpawns.length &&
                      !hostileTowers.length
                    ) {
                      let armedHostileCreeps = hostileCreeps.filter(
                        c => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0
                      );
                      if (!armedHostileCreeps) {
                        global.SGD(room.name, adj, [
                          MOVE,
                          MOVE,
                          ATTACK,
                          ATTACK,
                          ATTACK,
                          ATTACK,
                          ATTACK,
                          MOVE,
                          MOVE,
                          MOVE
                        ]);
                      } else {
                        global.SD(room.name, adj, false);
                      }

                      Memory.commandsToExecute.push({
                        delay: 200,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    }
                  }
                  //   !Game.rooms[adj].find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType === STRUCTURE_LAB}).length
                  else if (
                    (Game.rooms[adj].controller.level == 6 || Game.rooms[adj].controller.level == 7 || Game.rooms[adj].controller.level == 8) &&
                    !Game.rooms[adj].controller.safeMode
                  ) {
                    let hostileSpawns = Game.rooms[adj].find(FIND_HOSTILE_SPAWNS);
                    let hostileCreeps = Game.rooms[adj].find(FIND_HOSTILE_CREEPS);
                    let hostileTowers = Game.rooms[adj].find(FIND_HOSTILE_STRUCTURES, {
                      filter: s => s.structureType == STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > 9
                    });
                    if (hostileSpawns.length > 0 && hostileTowers.length > 0) {
                      if (Game.cpu.bucket >= 8000) {
                        global.SDB(room.name, adj, true);
                      } else if (Game.cpu.bucket >= 5000) {
                        //   global.SQR(room.name, adj, true);
                        global.SDB(room.name, adj, true);
                      }
                    } else if (hostileSpawns.length > 0 && hostileCreeps.length > 0 && hostileTowers.length === 0) {
                      global.SGD(room.name, adj, [
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
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
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
                        MOVE
                      ]);
                      Memory.commandsToExecute.push({
                        delay: 1000,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    } else if (hostileSpawns.length > 0 && hostileCreeps.length == 0) {
                      global.SGD(room.name, adj, [
                        MOVE,
                        MOVE,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        ATTACK,
                        MOVE,
                        MOVE,
                        MOVE
                      ]);
                      Memory.commandsToExecute.push({
                        delay: 1000,
                        bucketNeeded: 8000,
                        formation: "CCK",
                        homeRoom: room.name,
                        targetRoom: adj
                      });
                    }
                  }
                }
                else {
                  // filter out adj room name in Memory.AvoidRooms so Memory.AvoidRooms is up to date

                  if(!Memory.AvoidRooms) {
                    Memory.AvoidRooms = [];
                  }

                  Memory.AvoidRooms = Memory.AvoidRooms.filter(room => room !== adj);


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

            let highWayRoomsToObserve = [];

            if(room.name.length == 6) {
                let EastOrWest = room.name[0];
                let NorthOrSouth = room.name[3];
                let homeRoomNameX = parseInt(room.name[1] + room.name[2]);
                let homeRoomNameY = parseInt(room.name[4] + room.name[5]);
                for(let i = homeRoomNameX-4; i<=homeRoomNameX+4; i++) {
                    for(let o = homeRoomNameY-4; o<=homeRoomNameY+4; o++) {
                        if(i % 10 == 0 || o % 10 == 0) {
                            let firstString = i.toString();
                            let secondString = o.toString();
                            highWayRoomsToObserve.push(EastOrWest + firstString + NorthOrSouth + secondString);
                        }
                    }
                }
                room.memory.observe.listOfRoomsForPower = highWayRoomsToObserve;
            }
            else if(room.name.length !== 6) {
                let EastOrWest = room.name[0];
                let NorthOrSouth;
                let homeRoomNameX;
                let homeRoomNameY;
                if(!isNaN(room.name[2])) {
                    NorthOrSouth = room.name[3];
                    homeRoomNameX = parseInt(room.name[1] + room.name[2]);
                    homeRoomNameY = parseInt(room.name[4]);
                }
                else {
                    NorthOrSouth = room.name[2];
                    homeRoomNameX = parseInt(room.name[1]);
                    if(room.name.length == 4) {
                        homeRoomNameY = parseInt(room.name[3]);
                    }
                    else if(room.name.length == 5) {
                        homeRoomNameY = parseInt(room.name[3] + room.name[4]);
                    }
                }
                for(let i = homeRoomNameX-4; i<=homeRoomNameX+4; i++) {
                    let EorW;
                    let x;
                    let switchX = false;
                    if(i < 0) {
                        switchX = true;
                    }
                    if(switchX) {
                        x = Math.abs(i);
                        x -= 1;
                        if(EastOrWest == "E") {
                            EorW = "W"
                        }
                        else {
                            EorW = "E";
                        }
                    }
                    else {
                        x = i;
                        EorW = EastOrWest;
                    }
                    for(let o = homeRoomNameY-4; o<=homeRoomNameY+4; o++) {
                        let NorS;
                        let y;
                        let switchY = false;
                        if(o < 0) {
                            switchY = true;
                        }

                        if(switchY) {
                            y = Math.abs(o);
                            y -= 1;
                            if(NorthOrSouth == "N") {
                                NorS = "S"
                            }
                            else {
                                NorS = "N";
                            }
                        }
                        else {
                            y = o;
                            NorS = NorthOrSouth;
                        }
                        if(x % 10 == 0 || y % 10 == 0) {

                            let firstString = x.toString();
                            let secondString = y.toString();
                            let roomName = EorW + firstString + NorS + secondString;
                            if(Game.map.getRoomStatus(roomName).status == "normal" && room.name !== roomName) {
                                highWayRoomsToObserve.push(roomName);
                            }
                        }
                    }
                }
                room.memory.observe.listOfRoomsForPower = highWayRoomsToObserve;
            }
        }

        if(room.memory.observe.listOfRoomsForPower) {

            let RoomsToSee = room.memory.observe.listOfRoomsForPower

            if(RoomsToSee.length > 0 && Game.time % twoTimesInterval == 2) {
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

                if(areRoomsNormalToThisRoom(room.name, adj)) {
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
