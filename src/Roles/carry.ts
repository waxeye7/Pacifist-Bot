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

    let towers2 = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] >= 0)});
    if(towers2.length > 0) {
        let closestTower = creep.pos.findClosestByRange(towers2);
        creep.memory.locked = closestTower.id;
        return closestTower;
    }
}



/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    if(creep.memory.suicide == true) {
        creep.recycle();
        return;
    }


    let fleeStatus = creep.fleeHomeIfInDanger();
    if(fleeStatus == true) {
        return;
    }
    else if(fleeStatus == "in position") {
        creep.memory.suicide = true;
        return;
    }


    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
    }

    if(creep.memory.full) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

        if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
            if(creep.memory.storage) {
                return creep.moveToRoom(creep.memory.homeRoom, storage.pos.x, storage.pos.y, false, 5, 2);
            }
            else {
                return creep.moveToRoom(creep.memory.homeRoom);
            }
        }


        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                if(creep.transfer(storage, RESOURCE_ENERGY) == 0) {
                    creep.memory.full = false;
                }
            }
            else {
                creep.moveTo(storage, {reusePath: 20, ignoreCreeps:true, visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
            if(!creep.memory.locked) {
                let target = findLocked(creep);
            }

            if(creep.memory.locked) {
                let target = Game.getObjectById(creep.memory.locked);

                if(creep.pos.isNearTo(target)) {
                    creep.transfer(target, RESOURCE_ENERGY);
                    if(creep.store[RESOURCE_ENERGY] == 0) {
                        creep.memory.full = false;
                    }
                    else {
                        findLocked(creep);
                        let target = Game.getObjectById(creep.memory.locked);
                        if(!creep.pos.isNearTo(target)) {
                            creep.moveTo(target, {reusePath:20});
                        }
                    }
                }
                else {
                    creep.moveTo(target, {reusePath:20});
                }
            }
        }
    }

    else {
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
                let travelTarget:any = Game.getObjectById(creep.memory.sourceId);
                if(travelTarget == null) {
                    return creep.moveToRoom(creep.memory.targetRoom, 25, 25, true, 1, 15);
                }

                // let lookForExistingStructures = creep.pos.lookFor(LOOK_STRUCTURES);
                // if(lookForExistingStructures.length == 0 && creep.room.name != creep.memory.homeRoom && creep.room.name != creep.memory.targetRoom) {
                //     creep.pos.createConstructionSite(STRUCTURE_ROAD);
                // }
                return creep.moveToRoom(creep.memory.targetRoom, travelTarget.pos.x, travelTarget.pos.y, true, 1, 2);
        }
        let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        if(result == 0 && creep.store.getFreeCapacity() == 0) {
            let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
            if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
                if(creep.memory.storage) {
                    return creep.moveToRoom(creep.memory.homeRoom, storage.pos.x, storage.pos.y, false, 5, 2);
                }
                else {
                    return creep.moveToRoom(creep.memory.homeRoom);
                }
            }

            if(storage) {
                if(creep.pos.isNearTo(storage)) {
                    if(creep.transfer(storage, RESOURCE_ENERGY) == 0) {
                        creep.memory.full = false;
                    }
                }
                else {
                    creep.moveTo(storage, {reusePath: 20, ignoreCreeps:true, visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
            else {
                if(!creep.memory.locked) {
                    let target = findLocked(creep);
                }

                if(creep.memory.locked) {
                    let target = Game.getObjectById(creep.memory.locked);

                    if(creep.pos.isNearTo(target)) {
                        creep.transfer(target, RESOURCE_ENERGY);
                        if(creep.store[RESOURCE_ENERGY] == 0) {
                            creep.memory.full = false;
                        }
                        else {
                            findLocked(creep);
                            let target = Game.getObjectById(creep.memory.locked);
                            if(!creep.pos.isNearTo(target)) {
                                creep.moveTo(target, {reusePath:20});
                            }
                        }
                    }
                    else {
                        creep.moveTo(target, {reusePath:20});
                    }
                }
            }
        }
    }

	if(creep.ticksToLive <= 30 && !creep.memory.full) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
	}


 }


const roleCarry = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleCarry;
