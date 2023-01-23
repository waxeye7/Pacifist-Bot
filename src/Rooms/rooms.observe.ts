function observe(room) {
// if(Game.time % 10 == 0) {

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
            if(Game.rooms[adj] && room.name !== adj && Game.rooms[adj].controller && !Game.rooms[adj].controller.my) {
                let buildings = Game.rooms[adj].find(FIND_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_INVADER_CORE && s.pos.x >= 1 && s.pos.x <= 48 && s.pos.y >= 1 && s.pos.y <= 48});
                let openControllerPositions;

                if(Game.rooms[adj].controller.level == 0) {
                    openControllerPositions = Game.rooms[adj].controller.pos.getOpenPositionsIgnoreCreepsCheckStructs();

                    if(openControllerPositions && openControllerPositions.length > 0 && buildings.length > 0 && !Game.rooms[adj].controller.reservation) {


                        if(Memory.CanClaimRemote) {
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


// }
}

export default observe;
