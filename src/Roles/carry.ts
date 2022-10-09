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
    let did_you_move = creep.fleeHomeIfInDanger();
    if(did_you_move == "i moved") {
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
        if(result == 0) {
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

 }


const roleCarry = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleCarry;


        // let targets = creep.room.find(FIND_STRUCTURES, {
        //     filter: (structure) => {
        //         return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER) &&
        //             structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        //     }
        // });


        // if(targets.length > 0) {
        //     let closestTarget = creep.pos.findClosestByRange(targets);
        //     if(creep.pos.isNearTo(closestTarget)) {
        //         creep.transfer(closestTarget, RESOURCE_ENERGY);
        //     }
        //     else {
        //         creep.moveTo(closestTarget, {visualizePathStyle: {stroke: '#ffffff'}});
        //     }
        // }


// if(creep.room.name == "E12S39" && creep.store[RESOURCE_ENERGY] == 0) {
//     creep.moveTo(47,0);
// }
// else if(creep.room.name == "E12S39" && creep.store[RESOURCE_ENERGY] > 0) {
//     var targets = creep.room.find(FIND_STRUCTURES, {
//         filter: (structure) => {
//             return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER  || structure.structureType == STRUCTURE_CONTAINER) &&
//                 structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
//         }
//     });
//     let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

//     if(targets.length > 0) {
//         let target = creep.pos.findClosestByRange(targets);
//         if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
//             creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
//         }
//     }
//     else if (targets.length == 0 && storage) {
//         if(creep.transfer(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
//             creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffffff'}});
//         }
//         else if (creep.transfer(storage, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
//             creep.moveTo(47,0);
//         }
//     }
// }
// else if(creep.room.name == "E12S38" && creep.store.getFreeCapacity() > 0) {
//     // const Containers = creep.room.find(FIND_STRUCTURES, {
//     //     filter: object => object.structureType == STRUCTURE_CONTAINER
//     // });
//     // let closestContainer = creep.pos.findClosestByRange(Containers);

//     let dropped_resources = creep.room.find(FIND_DROPPED_RESOURCES);
//     if(dropped_resources.length > 0 && creep.store.getFreeCapacity() > 0) {
//         let closestDroppedEnergy = creep.pos.findClosestByRange(dropped_resources);
//         if(creep.pickup(closestDroppedEnergy) == ERR_NOT_IN_RANGE) {
//             creep.moveTo(closestDroppedEnergy, {visualizePathStyle: {stroke: '#ffaa00'}});
//         }
//         return;
//     }
//     else if (creep.store.getFreeCapacity() > 0) {
//         creep.moveTo(6,15);
//     }
//     else {
//         creep.moveTo(46,49);
//     }
// }
// else if(creep.room.name == "E12S38" && creep.store.getFreeCapacity() == 0) {
//     creep.moveTo(46,49);
// }
// }
// };
