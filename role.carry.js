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
        if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
            const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && (object.structureType == STRUCTURE_ROAD || object.structureType == STRUCTURE_CONTAINER)});
            const containersToRepair = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.structureType == STRUCTURE_CONTAINER});
            let buildingsToBuild = creep.room.find(FIND_CONSTRUCTION_SITES);

            if(containersToRepair.length > 0) {
                let closestContainerToRepair = creep.pos.findClosestByRange(containersToRepair);
                if(creep.pos.getRangeTo(closestContainerToRepair) < 4) {
                    if(creep.pos.isNearTo(closestContainerToRepair)) {
                        creep.repair(closestContainerToRepair);
                        return;
                    }
                    else {
                        creep.moveTo(closestContainerToRepair);
                        return;
                    }
                }
            }

            if(buildingsToRepair.length > 0) {
                let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
                if(creep.pos.isNearTo(closestBuildingToRepair)) {
                    creep.repair(closestBuildingToRepair);
            }

            if(buildingsToBuild.length > 0) {
                let closestBuildingtoBuild = creep.pos.findClosestByRange(buildingsToBuild);
				if(creep.build(closestBuildingtoBuild) == ERR_NOT_IN_RANGE) {
					creep.moveTo(closestBuildingtoBuild, {visualizePathStyle: {stroke: '#000'}});
				}
                return;
            }
            return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
            }
        }

        // let targets = creep.room.find(FIND_STRUCTURES, {
        //     filter: (structure) => {
        //         return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER) &&
        //             structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        //     }
        // });

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

        // if(targets.length > 0) {
        //     let closestTarget = creep.pos.findClosestByRange(targets);
        //     if(creep.pos.isNearTo(closestTarget)) {
        //         creep.transfer(closestTarget, RESOURCE_ENERGY);
        //     }
        //     else {
        //         creep.moveTo(closestTarget, {visualizePathStyle: {stroke: '#ffffff'}});
        //     }
        // }

        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                creep.transfer(storage, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }


    }

    else {
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
            return creep.moveToRoom(creep.memory.targetRoom);
        }
        let Containers = creep.room.find(FIND_STRUCTURES, {filter: (i) => i.structureType == STRUCTURE_CONTAINER && i.store[RESOURCE_ENERGY] > 0});
        let dropped_resources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (i) => i.amount > creep.store.getFreeCapacity() && creep.pos.getRangeTo(i) < 4});

        if(dropped_resources.length > 0) {
            let closestDroppedEnergy = creep.pos.findClosestByRange(dropped_resources);
            if(creep.pickup(closestDroppedEnergy) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestDroppedEnergy, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }

        else if(Containers.length > 0) {
            Containers.sort((a, b) => b.store[RESOURCE_ENERGY]-a.store[RESOURCE_ENERGY]);
            if(creep.withdraw(Containers[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(Containers[0]);
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

module.exports = roleCarry;


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