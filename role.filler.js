var roleFiller = {
    
    /** @param {Creep} creep **/
    run: function(creep) {
        var targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER) &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

	    if(creep.store[RESOURCE_ENERGY] == 0) {
            if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            else if(creep.withdraw(storage, RESOURCE_ENERGY) == 0) {
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
                creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }

        else if (targets.length == 0 && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
    }
};

module.exports = roleFiller;