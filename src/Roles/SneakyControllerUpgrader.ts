/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.full && creep.store[RESOURCE_ENERGY] <= 1) {
        creep.memory.source = false;
        creep.memory.full = false;
    }
    if(!creep.memory.full && creep.store.getFreeCapacity() <= 1) {
        creep.memory.full = true;
    }

    console.log(creep.room.name);
    let targetRoom = creep.memory.targetRoom;
    if(creep.room.name !== targetRoom) {
        if(creep.memory.locked_away == 0) {
            if(!creep.memory.full && creep.room.name === creep.memory.homeRoom) {
                let storage = creep.room.storage;
                if(storage) {
                    let result = creep.withdraw(storage, RESOURCE_ENERGY);
                    if(result == ERR_NOT_IN_RANGE) {
                        creep.MoveCostMatrixRoadPrio(storage.pos,1);
                        return;
                    }
                    else if(result === 0) {
                        creep.memory.full = true;
                    }
                }
            }
            creep.memory.in_danger = false;
            creep.memory.exit = false;
            return creep.moveToRoomAvoidEnemyRooms(targetRoom);
        }
        else if(creep.memory.locked_away > 0) {
            creep.memory.locked_away -= 1;
            if(creep.pos.x == 49) {
                if(creep.move(LEFT) !== 0) {
                    if(creep.move(TOP_LEFT) !== 0) {
                        if(creep.move(BOTTOM_LEFT) !== 0) {
                            if(creep.move(TOP) !== 0) {
                                creep.move(BOTTOM);
                            }
                        }
                    }
                }

            }
            else if(creep.pos.x == 0) {
                if(creep.move(RIGHT) !== 0) {
                    if(creep.move(TOP_RIGHT) !== 0) {
                        if(creep.move(BOTTOM_RIGHT) !== 0) {
                            if(creep.move(TOP) !== 0) {
                                creep.move(BOTTOM);
                            }
                        }
                    }
                }
            }
            else if(creep.pos.y == 49) {
                if(creep.move(TOP) !== 0) {
                    if(creep.move(TOP_LEFT) !== 0) {
                        if(creep.move(TOP_RIGHT) !== 0) {
                            if(creep.move(LEFT) !== 0) {
                                creep.move(RIGHT);
                            }
                        }
                    }
                }
            }
            else if(creep.pos.y == 0) {
                if(creep.move(BOTTOM) !== 0) {
                    if(creep.move(BOTTOM_LEFT) !== 0) {
                        if(creep.move(BOTTOM_RIGHT) !== 0) {
                            if(creep.move(LEFT) !== 0) {
                                creep.move(RIGHT);
                            }
                        }
                    }
                }
            }
            return;
        }
    }
    if(creep.room.name == targetRoom) {
        if(!creep.memory.in_danger && Game.time % 10 == 0) {
            let HostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
            if(HostileCreeps.length > 0) {
                HostileCreeps = HostileCreeps.filter(function(c) {return c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0;});
                if(HostileCreeps.length > 0) {

                    let roomsAvailable = Object.keys(Game.map.describeExits(creep.room.name));
                    let badGuy = HostileCreeps[0];

                    if(badGuy.pos.x <= 25 && badGuy.pos.y <= 25) {
                        if(roomsAvailable.includes("5")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[5];
                        }
                        else if(roomsAvailable.includes("3")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[3];
                        }
                        else if(roomsAvailable.includes("1")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[1];
                        }
                        else if(roomsAvailable.includes("7")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[7];
                        }
                    }
                    else if(badGuy.pos.x > 25 && badGuy.pos.y > 25) {
                        if(roomsAvailable.includes("7")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[7];
                        }
                        else if(roomsAvailable.includes("1")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[1];
                        }
                        else if(roomsAvailable.includes("3")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[3];
                        }
                        else if(roomsAvailable.includes("5")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[5];
                        }
                    }
                    else if(badGuy.pos.x <= 25 && badGuy.pos.y > 25) {
                        if(roomsAvailable.includes("1")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[1];
                        }
                        else if(roomsAvailable.includes("3")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[3];
                        }
                        else if(roomsAvailable.includes("5")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[5];
                        }
                        else if(roomsAvailable.includes("7")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[7];
                        }
                    }
                    else if(badGuy.pos.x > 25 && badGuy.pos.y <= 25) {
                        if(roomsAvailable.includes("7")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[7];
                        }
                        else if(roomsAvailable.includes("5")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[5];
                        }
                        else if(roomsAvailable.includes("1")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[1];
                        }
                        else if(roomsAvailable.includes("3")) {
                            creep.memory.exit = Game.map.describeExits(creep.room.name)[3];
                        }
                    }

                    creep.memory.in_danger = true;
                    creep.memory.locked_away = 100;
                    creep.drop(RESOURCE_ENERGY);

                }
            }
        }
        if(creep.memory.in_danger) {
            creep.moveToRoomAvoidEnemyRooms(creep.memory.exit);
            return;
        }




        let controller = creep.room.controller;
        if(controller) {

            if(!creep.memory.source) {
                let sources = creep.room.find(FIND_SOURCES);
                if(sources.length > 0) {
                    let closestSourceToController = controller.pos.findClosestByRange(sources);
                    creep.memory.source = closestSourceToController.id;
                }
            }

            if(!creep.memory.full) {
                creep.harvestEnergy();
                if(creep.pos.getRangeTo(controller) <= 3) {
                    creep.upgradeController(controller);
                    return;
                }
            }

            if(creep.memory.full) {
                if(creep.pos.getRangeTo(controller) <= 3) {
                    creep.upgradeController(controller);
                }
                creep.MoveCostMatrixRoadPrio(controller, 1);
            }

        }
    }
}


const roleSneakyControllerUpgrader = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSneakyControllerUpgrader;
