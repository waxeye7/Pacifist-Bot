/**
 * A little description of this function
 * @param {Creep} creep
 **/

 function findLocked(creep) {
    let spawnAndExtensions = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
    if(spawnAndExtensions.length > 0) {
        let closestDropOffLocation = creep.pos.findClosestByRange(spawnAndExtensions);
        creep.memory.locked = closestDropOffLocation.id;
        return closestDropOffLocation;
    }

    let towers2 = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0)});
    if(towers2.length > 0) {
        let closestTower = creep.pos.findClosestByRange(towers2);
        creep.memory.locked = closestTower.id;
        return closestTower;
    }

    if(creep.room.energyCapacityAvailable /1.5 < creep.room.energyAvailable) {
        let towers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] < 200)});
        if(towers.length > 0) {
            let closestTower = creep.pos.findClosestByRange(towers);
            creep.memory.locked = closestTower.id;
            return closestTower;
        }
    }

    let terminal = creep.room.terminal;
    if (terminal && terminal.store[RESOURCE_ENERGY] < 25000) {
        creep.memory.locked = terminal.id;
        return terminal;
    }

}


 const run = function (creep) {
    // const start = Game.cpu.getUsed()
    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] < 50) {
        creep.memory.full = false;
        creep.memory.locked = false;
    }
    if(creep.memory.full) {
        let target;
        target = Game.getObjectById(creep.memory.locked);
        if(target && target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
            creep.memory.locked = false;
        }

        if(!creep.memory.locked) {
            target = findLocked(creep);
        }

        if(creep.memory.locked) {
            target = Game.getObjectById(creep.memory.locked) || findLocked(creep);

            if(target.store.getFreeCapacity() == 0) {
                findLocked(creep);
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
                        creep.moveTo(target, {reusePath:20});
                    }
                }
            }
            else {
                creep.moveTo(target, {reusePath:20});
            }
        }
        else {
            creep.moveAwayIfNeedTo()
        }
    }


    if(!creep.memory.full || creep.store[RESOURCE_ENERGY] == 0) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage.store[RESOURCE_ENERGY] == 0 && !creep.room.memory.danger) {
            creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        }
        else {
            let result = creep.withdrawStorage(storage);
            if(result == 0) {
                findLocked(creep);
                let target = Game.getObjectById(creep.memory.locked);
                creep.moveTo(target, {reusePath:20});
            }
            else {
                creep.moveTo(storage);
            }
        }
    }

    // if(creep.store[RESOURCE_ENERGY] == 0) {
    //     creep.memory.full = false;
    // }

    // if(target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
    //     creep.memory.locked = false;
    // }


    // let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
    // let result = creep.withdrawStorage(storage);
    // if(result == 0) {
    //     let spawnAndExtensionsAndTowers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_TOWER) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
    //     if(spawnAndExtensionsAndTowers.length > 0) {
    //         let closestDropOffLocation = creep.pos.findClosestByRange(spawnAndExtensionsAndTowers);
    //         creep.memory.locked = closestDropOffLocation.id;
    //     }
    //     if(creep.memory.locked) {
    //         let target = Game.getObjectById(creep.memory.locked);

    //         if(creep.pos.isNearTo(target)) {
    //             creep.transfer(target, RESOURCE_ENERGY);

    //             if(creep.store[RESOURCE_ENERGY] == 0) {
    //                 creep.memory.full = false;
    //             }

    //             if(target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
    //                 creep.memory.locked = false;
    //             }

    //         }
    //         else {
    //             creep.moveTo(target, {reusePath:20});
    //         }
    //     }
    // }

    // let lowEnergyTowers = creep.room.find(FIND_STRUCTURES, {
    //     filter: (structure) => {
    //         return (structure.structureType == STRUCTURE_TOWER) &&
    //             structure.store.getFreeCapacity(RESOURCE_ENERGY) >= 200 &&
    //             structure.store.getFreeCapacity(RESOURCE_ENERGY < 900);
    //     }
    // });


    // let targets = creep.room.find(FIND_STRUCTURES, {
    //     filter: (structure) => {
    //         return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;}});

    // if(creep.store[RESOURCE_ENERGY] == 0) {
    //     let result = creep.withdrawStorage(storage);
    //     if(targets.length > 0 && result == 0) {
    //         creep.moveTo(targets[0]);
    //     }
    //     return;
    // }

    // if(lowEnergyTowers.length > 0) {
    //     let closestTarget = creep.pos.findClosestByRange(lowEnergyTowers);
    //     if(creep.transfer(closestTarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
    //         creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
    //     }
    //     else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] > 0) {
    //         creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
    //     }
    //     else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
    //         creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
    //     }
    //     return;
    // }

    // let terminal = creep.room.terminal;

    // if (terminal && terminal.store[RESOURCE_ENERGY] < 10000) {
    //     if(creep.pos.isNearTo(terminal)) {
    //         creep.transfer(terminal, RESOURCE_ENERGY);
    //     }
    //     else {
    //         creep.moveTo(terminal, {reusePath:10});
    //     }
    //     return;
    // }


    // if(targets.length > 0) {
    //     let closestTarget = creep.pos.findClosestByRange(targets);
    //     if(creep.transfer(closestTarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
    //         creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
    //     }
    //     else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] > 0) {
    //         creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
    //     }
    //     else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
    //         creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
    //     }
    //     return;
    // }

    // let towers = creep.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_TOWER && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) }});
    // if(towers.length > 0) {
    //     if(creep.pos.isNearTo(towers[0])) {
    //         creep.transfer(towers[0], RESOURCE_ENERGY);
    //     }
    //     else {
    //         creep.moveTo(towers[0], {reusePath:10});
    //     }
    //     return;
    // }

    // if (targets.length == 0 && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    //     if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
    //         creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
    //     }
    //     return;
    // }
    // console.log('Filler Ran in', Game.cpu.getUsed() - start, 'ms')
}

const roleFiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleFiller;

