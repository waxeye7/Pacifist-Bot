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
    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
    }


    if(creep.memory.full) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
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

        let result = creep.Sweep();

        if(result == "picked up") {
            let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
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

        if(result == "nothing to sweep") {
            creep.suicide();
        }

    }



}

const roleSweeper = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSweeper;
