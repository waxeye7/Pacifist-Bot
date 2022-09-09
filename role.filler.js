var roleFiller = {
    
    /** @param {Creep} creep **/
    run: function(creep) {

        // store in memory and lock target!

        let lowEnergyTowers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_TOWER) &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) >= 200 && 
                    structure.store.getFreeCapacity(RESOURCE_ENERGY < 900);
            }
        });

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

        let targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;}});

	    if(creep.store[RESOURCE_ENERGY] == 0) {
            let result = creep.withdrawStorage(storage);
            if(targets.length > 0 && result == 0) {
                creep.moveTo(targets[0]);
            }
            return;
        }

        if(lowEnergyTowers.length > 0) {
            let closestTarget = creep.pos.findClosestByRange(lowEnergyTowers);
            if(creep.transfer(closestTarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
            }
            else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] > 0) {
                creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
            }
            else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return;
        }

        let terminal = creep.room.terminal;

        if (terminal && terminal.store[RESOURCE_ENERGY] < 10000) {
            if(creep.pos.isNearTo(terminal)) {
                creep.transfer(terminal, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(terminal, {reusePath:10});
            }
            return;
        }


        if(targets.length > 0) {
            let closestTarget = creep.pos.findClosestByRange(targets);
            if(creep.transfer(closestTarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
            }
            else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] > 0) {
                creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
            }
            else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return;
        }

        let towers = creep.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_TOWER) }});
        if(towers.length > 0) {
            if(creep.pos.isNearTo(towers[0])) {
                creep.transfer(towers[0], RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(towers[0], {reusePath:10});
            }
            return;
        }

        if (targets.length == 0 && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return;
        }
    }
};

module.exports = roleFiller;