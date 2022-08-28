/**
 * A little description of this function 
 * @param {Creep} creep
 **/
const run = function (creep) {
    if(creep.memory.filling && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.filling = false;
    }
    if(!creep.memory.filling && creep.store.getFreeCapacity() == 0) {
        creep.memory.filling = true;
    }
    if(creep.memory.filling) {
        let targets = creep.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER  || structure.structureType == STRUCTURE_CONTAINER) &&structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;}});
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();


        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                creep.transfer(storage, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(storage);
            }
        }

        else if(targets.length > 0 && storage == undefined) {
            let target = creep.pos.findClosestByRange(targets);
            if(creep.pos.isNearTo(target)) {
                creep.transfer(target, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(target);
            }
        }

        else if (targets.length == 0 && storage == undefined) {
            const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax});
            if(buildingsToRepair.length > 0) {
                let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
                if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestBuildingToRepair);
                }
                else if(creep.repair(closestBuildingToRepair == 0) && creep.store[RESOURCE_ENERGY] == 0) {
                    creep.moveTo(source);
                }
            }
        }


    }
    else {
        let dropped_resources = creep.room.find(FIND_DROPPED_RESOURCES);
        let source = Game.getObjectById(creep.memory.source) || creep.findSource();

        if(!creep.pos.isNearTo(source) && dropped_resources.length > 0) {

            let closestDroppedEnergy = creep.pos.findClosestByRange(dropped_resources);
            if(creep.pickup(closestDroppedEnergy) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestDroppedEnergy, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
        else {
            creep.harvestEnergy();
        }
    }
}

const roleWorker = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleWorker;