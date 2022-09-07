var roleFiller = {
    
    /** @param {Creep} creep **/
    run: function(creep) {

		// if(creep.fatigue > 0) {
		// 	console.log('hi')
		// 	creep.room.createConstructionSite(creep.pos, STRUCTURE_ROAD);
		// }

        let lowEnergyTowers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_TOWER) &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) >= 200;
            }
        });

        let targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        let terminal = creep.room.terminal;

	    if(creep.store[RESOURCE_ENERGY] == 0) {
            if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
            }
            else if(creep.withdraw(storage, RESOURCE_ENERGY) == 0) {
                let closestTarget = creep.pos.findClosestByRange(targets);
                creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
            }
        }

        else if(lowEnergyTowers.length > 0) {
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
        }

        else if (terminal && terminal.store[RESOURCE_ENERGY] < 10000) {
            if(creep.pos.isNearTo(terminal)) {
                creep.transfer(terminal, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(terminal, {reusePath:10});
            }
        }
        

        else if(targets.length > 0) {
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
        }

        else if (targets.length == 0 && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
    }
};

module.exports = roleFiller;