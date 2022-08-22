var roleFiller = {
    
    /** @param {Creep} creep **/
    run: function(creep) {
        var targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER  || structure.structureType == STRUCTURE_CONTAINER) &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
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
                let closestTarget = creep.pos.findClosestByRange(targets);
                creep.moveTo(closestTarget, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }

        else if(targets.length > 0) {
            let closestTarget = creep.pos.findClosestByRange(targets);
            if(creep.transfer(closestTarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestTarget, {visualizePathStyle: {stroke: '#ffffff'}});
            }
            else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] > 0) {
                creep.moveTo(closestTarget, {visualizePathStyle: {stroke: '#ffffff'}});
            }
            else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                creep.moveTo(storage[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }

        else if (targets.length == 0 && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if(creep.withdraw(storage[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(storage[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
        // else {
        //     creep.moveTo(34,31);
        // }
    }
};

module.exports = roleFiller;