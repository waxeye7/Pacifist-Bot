/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    console.log(creep.room.name);
    let targetRoom = creep.memory.targetRoom;
    if(creep.room.name !== targetRoom && creep.memory.locked_away == 0) {
        if(creep.memory.locked_away == 0) {
            creep.memory.in_danger = false;
            creep.memory.exit = false;
            return creep.moveToRoomAvoidEnemyRooms(targetRoom);
        }
        else if(creep.memory.locked_away > 0) {
            creep.memory.locked_away -= 1;
            if(this.pos.x == 49) {
                if(this.move(LEFT) !== 0) {
                    if(this.move(TOP_LEFT) !== 0) {
                        if(this.move(BOTTOM_LEFT) !== 0) {
                            if(this.move(TOP) !== 0) {
                                this.move(BOTTOM);
                            }
                        }
                    }
                }

            }
            else if(this.pos.x == 0) {
                if(this.move(RIGHT) !== 0) {
                    if(this.move(TOP_RIGHT) !== 0) {
                        if(this.move(BOTTOM_RIGHT) !== 0) {
                            if(this.move(TOP) !== 0) {
                                this.move(BOTTOM);
                            }
                        }
                    }
                }
            }
            else if(this.pos.y == 49) {
                if(this.move(TOP) !== 0) {
                    if(this.move(TOP_LEFT) !== 0) {
                        if(this.move(TOP_RIGHT) !== 0) {
                            if(this.move(LEFT) !== 0) {
                                this.move(RIGHT);
                            }
                        }
                    }
                }
            }
            else if(this.pos.y == 0) {
                if(this.move(BOTTOM) !== 0) {
                    if(this.move(BOTTOM_LEFT) !== 0) {
                        if(this.move(BOTTOM_RIGHT) !== 0) {
                            if(this.move(LEFT) !== 0) {
                                this.move(RIGHT);
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

        if(creep.memory.full && creep.store[RESOURCE_ENERGY] <= 1) {
            creep.memory.source = false;
            creep.memory.full = false;
        }
        if(!creep.memory.fuil && creep.store.getFreeCapacity() <= 1) {
            creep.memory.full = true;
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
                else {
                    creep.MoveCostMatrixRoadPrio(controller, 3);
                }
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
