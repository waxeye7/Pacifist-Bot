var roleRepair = {
    
    /** @param {Creep} creep **/
    run: function(creep) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

        if(storage != undefined) { 
            const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {
                filter: object => object.hits < object.hitsMax && object.hits < 5000000
            });
            if(creep.store[RESOURCE_ENERGY] == 0) {
                if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
                else if(creep.withdraw(storage, RESOURCE_ENERGY) == 0) {
                    let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
                    creep.moveTo(closestBuildingToRepair, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
    
            if(buildingsToRepair.length > 0) {
                let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
                if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestBuildingToRepair);
                }
                else if(creep.repair(closestBuildingToRepair) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                    creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
        }
        else {
            if (creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
                creep.memory.working = false;
            }
            if (!creep.memory.working && creep.store.getFreeCapacity() == 0) {
                creep.memory.working = true;
            }

            if(creep.memory.working) {

                const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {
                    filter: object => object.hits < object.hitsMax && object.hits < 5000000
                });
                if(buildingsToRepair.length) {
                    if(creep.repair(buildingsToRepair[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(buildingsToRepair[0]);
                    }
                }
            }
            else {
                creep.harvestEnergy();

            }
        }
    }
};

module.exports = roleRepair;