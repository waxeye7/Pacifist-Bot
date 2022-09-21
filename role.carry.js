/**
 * A little description of this function 
 * @param {Creep} creep
 **/
 const run = function (creep) {
    // const start = Game.cpu.getUsed()
    // if(creep.fatigue > 0) {
    //     console.log('hi')
    //     creep.room.createConstructionSite(creep.pos, STRUCTURE_ROAD);
    // }

    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
    }

    if(creep.room.name != creep.memory.homeRoom && Memory.tasks.wipeRooms.killCreeps.includes(creep.room.name) && creep.room.memory.has_hostile_creeps) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
    }

    if(creep.memory.full) {
        if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
            return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
        }

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                if(creep.transfer(storage, RESOURCE_ENERGY) == 0) {
                    creep.memory.full = false;
                }
            }
            else {
                creep.moveTo(storage, {reusePath: 20, visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
            if(!creep.memory.locked) {
                let spawnAndExtensionsAndTowers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_TOWER) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
                let closestDropOffLocation = creep.pos.findClosestByRange(spawnAndExtensionsAndTowers);
                creep.memory.locked = closestDropOffLocation.id;
            }

            if(creep.memory.locked) {
                let closestDropOffLocation = Game.getObjectById(creep.memory.locked);

                if(creep.pos.isNearTo(closestDropOffLocation)) {
                    creep.transfer(closestDropOffLocation, RESOURCE_ENERGY);

                    if(closestDropOffLocation.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
                        creep.memory.locked = false;
                    }
                    if(creep.store[RESOURCE_ENERGY] == 0) {
                        creep.memory.full = false;
                    }
                    
                }
                else {
                    creep.moveTo(closestDropOffLocation, {reusePath:20});
                }
            }
            
        }


    }

    else {
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
            return creep.moveToRoom(creep.memory.targetRoom);
        }
        let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        if(result == 0) {
            if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
                return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
            }
        
            let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
            if(storage) {
                if(creep.pos.isNearTo(storage)) {
                    if(creep.transfer(storage, RESOURCE_ENERGY) == 0) {
                        creep.memory.full = false;
                    }
                }
                else {
                    creep.moveTo(storage, {reusePath: 20, visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
            else {
                if(creep.memory.locked) {
                    let spawnAndExtensionsAndTowers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_TOWER) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
                    let closestDropOffLocation = creep.pos.findClosestByRange(spawnAndExtensionsAndTowers);
                    creep.memory.locked = closestDropOffLocation.id;
                }
    
                if(creep.memory.locked) {
                    let closestDropOffLocation = Game.getObjectById(creep.memory.locked);
    
                    if(creep.pos.isNearTo(closestDropOffLocation)) {
                        creep.transfer(closestDropOffLocation, RESOURCE_ENERGY);
    
                        if(closestDropOffLocation.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
                            creep.memory.locked = false;
                        }
                        if(creep.store[RESOURCE_ENERGY] == 0) {
                            creep.memory.full = false;
                        }
                        
                    }
                    else {
                        creep.moveTo(closestDropOffLocation, {reusePath:20});
                    }
                }
            }
        }
    }
    if(creep.memory.targetRoom.controller) {
        console.log(creep.memory.targetRoom.controller.level)
    }
 }
    // console.log('Carry Ran in', Game.cpu.getUsed() - start, 'ms')


const roleCarry = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleCarry;



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