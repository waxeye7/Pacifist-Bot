var roleRepair = {
    
    /** @param {Creep} creep **/
    run: function(creep) {

        const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {
            filter: object => object.hits < object.hitsMax && object.hits < 5000000
        });

        var storage = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_STORAGE);
            }
        });

	    if(creep.store[RESOURCE_ENERGY] == 0) {
            if(creep.withdraw(storage[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(storage[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            else if(creep.withdraw(storage[0], RESOURCE_ENERGY) == 0) {
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
                creep.moveTo(storage[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }

    }
};

module.exports = roleRepair;