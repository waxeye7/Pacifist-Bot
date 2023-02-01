function observe(room) {

    let interval = 64;
    let observer:any = Game.getObjectById(room.memory.Structures.observer) || room.findObserver();
    if(observer && Game.time % interval <= 1) {
        if(!room.memory.observe) {
            room.memory.observe = {};
        }

        if(!room.memory.observe.RoomsToSee) {
            let RoomsToSee = [];

            let EastOrWest = room.name[0];
            let NorthOrSouth = room.name[3];
            if(room.name.length == 6) {
                let homeRoomNameX = parseInt(room.name[1] + room.name[2]);
                let homeRoomNameY = parseInt(room.name[4] + room.name[5]);
                for(let i = homeRoomNameX-3; i<=homeRoomNameX+3; i++) {
                    for(let o = homeRoomNameY-3; o<=homeRoomNameY+3; o++) {
                        if(i % 10 !== 0 && o % 10 !== 0) {
                            if(i % 10 >= 4 && i % 10 <= 6 && o % 10 >= 4 && o % 10 <= 6) {
                                // do nothing
                            }
                            else {
                                let firstString = i.toString();
                                let secondString = o.toString();
                                let roomName = EastOrWest + firstString + NorthOrSouth + secondString;
                                if(Game.map.getRoomStatus(roomName).status == "normal" && room.name !== roomName) {
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
            if(Game.rooms[adj] && room.name !== adj && Game.rooms[adj].controller && !Game.rooms[adj].controller.my && Game.map.getRoomStatus(adj).status == "normal") {
                let buildings = Game.rooms[adj].find(FIND_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_INVADER_CORE && s.pos.x >= 1 && s.pos.x <= 48 && s.pos.y >= 1 && s.pos.y <= 48});
                let openControllerPositions;

                if(Game.rooms[adj].controller.level == 0) {
                    openControllerPositions = Game.rooms[adj].controller.pos.getOpenPositionsIgnoreCreepsCheckStructs();

                    if(openControllerPositions && openControllerPositions.length > 0 && buildings.length > 0 && !Game.rooms[adj].controller.reservation) {


                        if(Memory.CanClaimRemote >= 1) {
                            let found = false;

                            for(let creepName in Game.creeps) {
                                if(creepName.startsWith("WallClearer")) {
                                    if(Game.creeps[creepName].memory.role == "WallClearer" && Game.creeps[creepName].memory.homeRoom == room.name) {
                                        found = true;
                                        break;
                                    }
                                }
                            }

                            if(!found) {
                                let newName = 'WallClearer-' + room.name + "-" + adj;
                                room.memory.spawn_list.push([CLAIM,MOVE], newName, {memory: {role: 'WallClearer', homeRoom: room.name, targetRoom:adj}});
                                console.log('Adding wall-clearer to Spawn List: ' + newName);
                            }
                        }
                    }
                    else if(openControllerPositions && openControllerPositions.length == 0) {

                        let found = false;

                        for(let creepName in Game.creeps) {
                            if(creepName.startsWith("DismantleControllerWalls")) {
                                if(Game.creeps[creepName].memory.role == "DismantleControllerWalls" && Game.creeps[creepName].memory.homeRoom == room.name) {
                                    found = true;
                                    break;
                                }
                            }
                        }

                        if(!found) {
                            let newName = 'DismantleControllerWalls-' + room.name + "-" + adj;
                            room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'DismantleControllerWalls', homeRoom: room.name, targetRoom:adj}});
                            console.log('Adding DismantleControllerWalls to Spawn List: ' + newName);
                        }

                    }
                }
                else if((Game.rooms[adj].controller.level == 1 || Game.rooms[adj].controller.level == 2) && !Game.rooms[adj].controller.safeMode) {
                    let hostileSpawns = Game.rooms[adj].find(FIND_HOSTILE_SPAWNS);
                    let hostileCreeps = Game.rooms[adj].find(FIND_HOSTILE_CREEPS);
                    if(hostileSpawns.length > 0 && hostileCreeps.length > 0) {

                        global.SGD(room.name, adj,
                        [
                            MOVE,MOVE,MOVE,MOVE,MOVE,
                            MOVE,MOVE,MOVE,MOVE,MOVE,
                            MOVE,MOVE,
                            ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                            ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                            ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                            ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                            ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                            MOVE,MOVE,MOVE,MOVE,MOVE,
                            MOVE,MOVE,MOVE,MOVE,MOVE,
                            MOVE,MOVE,MOVE
                        ]
                        );

                    }
                    else if(hostileSpawns.length > 0 && hostileCreeps.length == 0) {

                        global.SGD(room.name, adj,
                            [
                                MOVE,MOVE,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                MOVE,MOVE,MOVE
                            ]
                            );

                    }
                }

                else if((Game.rooms[adj].controller.level == 3 || Game.rooms[adj].controller.level == 4) && !Game.rooms[adj].controller.safeMode) {
                    let hostileSpawns = Game.rooms[adj].find(FIND_HOSTILE_SPAWNS);
                    let hostileCreeps = Game.rooms[adj].find(FIND_HOSTILE_CREEPS);
                    let hostileTowers = Game.rooms[adj].find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType == STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > 9});
                    if(hostileSpawns.length > 0 && hostileTowers.length > 0) {

                        global.SQR(room.name, adj)

                    }
                    else if(hostileSpawns.length > 0 && hostileCreeps.length > 0 && hostileTowers.length == 0) {

                        global.SGD(room.name, adj,
                            [
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE
                            ]
                            );

                    }
                    else if(hostileSpawns.length > 0 && hostileCreeps.length == 0 && hostileTowers.length == 0) {

                        global.SGD(room.name, adj,
                            [
                                MOVE,MOVE,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                MOVE,MOVE,MOVE
                            ]
                            );

                    }

                }
                else if((Game.rooms[adj].controller.level == 5 || Game.rooms[adj].controller.level == 6) && !Game.rooms[adj].controller.safeMode) {
                    let hostileSpawns = Game.rooms[adj].find(FIND_HOSTILE_SPAWNS);
                    let hostileCreeps = Game.rooms[adj].find(FIND_HOSTILE_CREEPS);
                    let hostileTowers = Game.rooms[adj].find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType == STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > 9});
                    if(hostileSpawns.length > 0 && hostileTowers.length > 0) {

                        global.SD(room.name, adj, true)

                    }
                    else if(hostileSpawns.length > 0 && hostileCreeps.length > 0 && hostileTowers.length == 0) {

                        global.SGD(room.name, adj,
                            [
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE
                            ]
                            );

                    }
                    else if(hostileSpawns.length > 0 && hostileCreeps.length == 0) {

                        global.SGD(room.name, adj,
                            [
                                MOVE,MOVE,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                MOVE,MOVE,MOVE
                            ]
                            );

                    }

                }
            }
        }

    }

    // find power banks
    if(observer && (Game.time % interval == 31 || Game.time % interval == 32) && Game.cpu.bucket >= 9000) {

        if(!room.memory.observe.listOfRoomsForPower) {

            if(!room.memory.observe.lastRoomObservedForPowerIndex) {
                room.memory.observe.lastRoomObservedForPowerIndex = 0;
            }

            let highWayRoomsToObserve = [];

            let EastOrWest = room.name[0];
            let NorthOrSouth = room.name[3];

            if(room.name.length == 6) {
                let homeRoomNameX = parseInt(room.name[1] + room.name[2]);
                let homeRoomNameY = parseInt(room.name[4] + room.name[5]);
                for(let i = homeRoomNameX-3; i<=homeRoomNameX+3; i++) {
                    for(let o = homeRoomNameY-3; o<=homeRoomNameY+3; o++) {
                        if(i % 10 == 0 || o % 10 == 0) {
                            let firstString = i.toString();
                            let secondString = o.toString();
                            highWayRoomsToObserve.push(EastOrWest + firstString + NorthOrSouth + secondString);
                        }
                    }
                }
                room.memory.observe.listOfRoomsForPower = highWayRoomsToObserve;
            }
        }

        if(room.memory.observe.listOfRoomsForPower) {

            let RoomsToSee = room.memory.observe.listOfRoomsForPower

            if(RoomsToSee.length > 0 && Game.time % interval == 31) {
                if(!room.memory.observe.lastRoomObservedForPowerIndex || room.memory.observe.lastRoomObservedForPowerIndex >= RoomsToSee.length) {
                    room.memory.observe.lastRoomObservedForPowerIndex = 0
                }


                let chosenRoom = RoomsToSee[room.memory.observe.lastRoomObservedForPowerIndex]
                observer.observeRoom(chosenRoom);


                console.log("seeing FOR POWER", chosenRoom)


                room.memory.observe.lastRoomObservedForPowerIndex += 1;
                room.memory.observe.lastRoomObservedForPower = chosenRoom;

            }

            if(Game.time % interval == 32) {
                let adj = room.memory.observe.lastRoomObservedForPower;
                let seenRoom = Game.rooms[adj];

                let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

                if(seenRoom && storage && storage.store[RESOURCE_ENERGY] > 310000) {

                    let walls = seenRoom.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_WALL});
                    if(walls.length == 0) {

                        let powerBanks = seenRoom.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_POWER_BANK && (s.ticksToDecay > 1700 || s.ticksToDecay > 1000 && s.hits < 700000)});

                        let deposits = room.find(FIND_DEPOSITS);

                        if(powerBanks.length > 0) {

                            global.SPK(room.name, adj);

                        }

                        if(deposits.length > 0 && storage.store[RESOURCE_ENERGY] > 320000) {

                            global.SDM(room.name, adj);

                        }

                    }





                }

            }


        }

    }

}

export default observe;
