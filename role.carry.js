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
            return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
        }

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

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
        let dropped_resources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (i) => i.amount > creep.store.getFreeCapacity() && creep.pos.getRangeTo(i) < 4 && i.resourceType == RESOURCE_ENERGY});
        let dropped_resources_last_chance = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (i) => i.resourceType == RESOURCE_ENERGY});

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
        else if(dropped_resources_last_chance.length > 0) {
            let closestDroppedEnergy = creep.pos.findClosestByRange(dropped_resources_last_chance);
            if(creep.pickup(closestDroppedEnergy) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestDroppedEnergy, {visualizePathStyle: {stroke: '#ffaa00'}});
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