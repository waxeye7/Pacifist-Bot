var roleRepair = {
    
    /** @param {Creep} creep **/
    run: function(creep) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage != undefined) { 
            const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {
                filter: object => object.hits < object.hitsMax && object.hits < 3000000 && object.structureType !== STRUCTURE_ROAD
            });

            const buildingsToRepair2 = creep.room.find(FIND_STRUCTURES, {
                filter: object => object.hits < object.hitsMax && object.hits < 20000000 && object.structureType !== STRUCTURE_ROAD
            });

            if(creep.store[RESOURCE_ENERGY] == 0) {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, RESOURCE_ENERGY);
                }
                else {
                    creep.moveTo(storage);
                }
                return;
            }
    
            if(buildingsToRepair.length > 0) {
                let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
                if(creep.pos.isNearTo(closestBuildingToRepair)) {
                    creep.repair(closestBuildingToRepair);
                }
                else {
                    creep.moveTo(closestBuildingToRepair);
                }

                if(creep.repair(closestBuildingToRepair) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                    creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
            else if(buildingsToRepair2.length > 0) {
                let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair2);
                if(creep.pos.isNearTo(closestBuildingToRepair)) {
                    creep.repair(closestBuildingToRepair);
                }
                else {
                    creep.moveTo(closestBuildingToRepair);
                }

                if(creep.repair(closestBuildingToRepair) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
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
                    filter: object => object.hits < object.hitsMax && object.hits < 1000000
                });
                if(buildingsToRepair.length > 0) {
                    if(creep.pos.isNearTo(buildingsToRepair[0])) {
                        creep.repair(buildingsToRepair[0]);
                    }
                    else {
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