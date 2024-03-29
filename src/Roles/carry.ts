function findLocked(creep) {
    let terminal = creep.room.terminal;
    if (terminal && terminal.store[RESOURCE_ENERGY] < 10000) {
        creep.memory.locked = terminal.id;
        return terminal;
    }

    if(creep.room.energyCapacityAvailable /1.5 < creep.room.energyAvailable) {
        let towers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] < 200)});
        if(towers.length > 0) {
            let closestTower = creep.pos.findClosestByRange(towers);
            creep.memory.locked = closestTower.id;
            return closestTower;
        }
    }

    let spawnAndExtensions = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_TOWER) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
    if(spawnAndExtensions.length > 0) {
        let closestDropOffLocation = creep.pos.findClosestByRange(spawnAndExtensions);
        creep.memory.locked = closestDropOffLocation.id;
        return closestDropOffLocation;
    }

    let towers2 = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] >= 0 && building.store.getFreeCapacity() > 0)});
    if(towers2.length > 0) {
        let closestTower = creep.pos.findClosestByRange(towers2);
        creep.memory.locked = closestTower.id;
        return closestTower;
    }
    creep.memory.locked = false;
    return false;
}



/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    creep.memory.moving = false;



    if(creep.memory.suicide == true) {
        creep.recycle();
        return;
    }
    if(creep.fleeHomeIfInDanger() == "timeOut") {
        return;
    }

    if(creep.memory.fleeing) {
        // find hostiles with attack or ranged attack
        let hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        let meleeHostiles = hostiles.filter(c => c.getActiveBodyparts(ATTACK) > 0 );
        let rangedHostiles = hostiles.filter(c => c.getActiveBodyparts(RANGED_ATTACK) > 0 );
        if(rangedHostiles.length) {
            let closestRangedHostile = creep.pos.findClosestByRange(rangedHostiles);
            if(creep.pos.getRangeTo(closestRangedHostile) <= 5) {
                return;
            }
        }
        else if(meleeHostiles.length) {
            let closestMeleeHostile = creep.pos.findClosestByRange(meleeHostiles);
            if(creep.pos.getRangeTo(closestMeleeHostile) <= 3) {
                return;
            }
        }
    }
    else if(!creep.memory.danger) {
        creep.memory.fleeing = false;
    }

    // let fleeStatus = creep.fleeHomeIfInDanger();
    // if(fleeStatus == true) {
    //     return;
    // }
    // else if(fleeStatus == "in position") {
    //     creep.memory.suicide = true;
    //     return;
    // }

    // && creep.room.name != creep.memory.homeRoom add maybe to make creep only switch if in room idkidk
    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
    }

    if(!creep.memory.full && creep.memory.pathLength && creep.ticksToLive + 3 == creep.memory.pathLength * 2) {
        creep.memory.suicide = true;
    }

    if(creep.memory.full) {

        if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
        }

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage) {
            creep.MoveCostMatrixRoadPrio(storage, 1);
            creep.memory.role = "FakeFiller";
            return;
        }
        else {
            let spawn:any = Game.getObjectById(creep.memory.spawn) || creep.findSpawn();
            let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
            let bin;
            if(storage && creep.room.memory.Structures) {
                bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);
            }

            if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
                if(Game.getObjectById(creep.memory.storage)) {
                    return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom, storage.pos.x, storage.pos.y, false, 5, 2);
                }
                else {
                    return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
                }
            }


            if(storage && storage.store.getFreeCapacity() !== 0) {
                if(creep.pos.isNearTo(storage)) {
                    if(creep.transfer(storage, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                        creep.memory.full = false;
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1)
                }
            }
            else if(bin && bin.store.getFreeCapacity() != 0) {
                if(creep.pos.isNearTo(bin)) {
                    if(creep.transfer(bin, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                        creep.memory.full = false;
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(bin, 1)
                }
            }
            else {
                if(!creep.memory.locked) {
                    let target = findLocked(creep);

                    if(!target) {
                        if(spawn) {
                            if(creep.pos.isNearTo(spawn) && creep.room.controller.level > 1) {
                                creep.drop(RESOURCE_ENERGY);
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(spawn, 1)
                            }
                            return;
                        }
                    }
                }

                if(creep.memory.locked) {
                    let target = Game.getObjectById(creep.memory.locked);

                    if(!target) {
                        if(spawn) {
                            if(creep.pos.isNearTo(spawn)) {
                                creep.drop(RESOURCE_ENERGY);
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(spawn, 1)
                            }
                            return;
                        }
                    }

                    if(creep.pos.isNearTo(target)) {
                        creep.transfer(target, RESOURCE_ENERGY);
                        if(creep.store[RESOURCE_ENERGY] == 0) {
                            creep.memory.full = false;
                        }
                        else {
                            findLocked(creep);
                            let target = Game.getObjectById(creep.memory.locked);
                            if(!creep.pos.isNearTo(target)) {
                                creep.MoveCostMatrixRoadPrio(target, 1)
                            }
                        }
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(target, 1)
                    }
                }
            }
        }


    }

    if(!creep.memory.full) {
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        }
        let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        if(result == 0 && creep.store.getFreeCapacity() == 0) {
            let spawn:any = Game.getObjectById(creep.memory.spawn) || creep.findSpawn();
            let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
            if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
                if(creep.memory.storage) {
                    return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
                    // return creep.moveToRoom(creep.memory.homeRoom, storage.pos.x, storage.pos.y, false, 5, 2);
                }
                else {
                    return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
                }
            }

            if(storage) {
                if(creep.pos.isNearTo(storage)) {
                    if(creep.transfer(storage, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                        creep.memory.full = false;
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1)
                }
            }
            else {
                if(!creep.memory.locked) {
                    let target = findLocked(creep);

                    if(!target) {
                        if(spawn) {
                            if(creep.pos.isNearTo(spawn)) {
                                creep.drop(RESOURCE_ENERGY);
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(spawn, 1)
                            }
                            return;
                        }
                    }
                }

                if(creep.memory.locked) {
                    let target = Game.getObjectById(creep.memory.locked);

                    if(!target) {
                        if(spawn) {
                            if(creep.pos.isNearTo(spawn)) {
                                creep.drop(RESOURCE_ENERGY);
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(spawn, 1)
                            }
                            return;
                        }
                    }

                    if(creep.pos.isNearTo(target)) {
                        creep.transfer(target, RESOURCE_ENERGY);
                        if(creep.store[RESOURCE_ENERGY] == 0) {
                            creep.memory.full = false;
                        }
                        else {
                            findLocked(creep);
                            let target = Game.getObjectById(creep.memory.locked);
                            if(!creep.pos.isNearTo(target)) {
                                creep.MoveCostMatrixRoadPrio(target, 1)
                            }
                        }
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(target, 1)
                    }
                }
            }
        }
    }

	if(creep.ticksToLive <= 30 && !creep.memory.full && creep.memory.targetRoom === creep.room.name) {
		creep.memory.suicide = true;
	}
    else if(creep.ticksToLive <= 75 && !creep.memory.full && creep.memory.targetRoom !== creep.room.name)
	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}


 }


const roleCarry = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleCarry;
