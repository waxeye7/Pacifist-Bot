var roleWorker = {

    /** @param {Creep} creep **/
    run: function(creep) {

        let source = Game.getObjectById(creep.memory.source) || creep.findSource();

        if(creep.store.getFreeCapacity() > 0 && creep.pos.isNearTo(source) || creep.store[RESOURCE_ENERGY] == 0) {
            creep.harvestEnergy();
            return;
        }

        let targets = creep.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER  || structure.structureType == STRUCTURE_CONTAINER) &&structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;}});

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

        if(targets.length > 0 && storage == undefined) {
            let target = creep.pos.findClosestByRange(targets);
            if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
            }
            else if (creep.transfer(target, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                creep.moveTo(source);
            }
            return;
        }

        else if (storage) {
            if(creep.transfer(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffffff'}});
            }
            else if (creep.transfer(storage, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                creep.moveTo(source);
            }
            return;
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
                return;
			}
            else {
                return;
            }
        }

        let dropped_resources = creep.room.find(FIND_DROPPED_RESOURCES);

        if(dropped_resources.length > 0) {
            if(creep.store[RESOURCE_ENERGY] == 0 && !creep.pos.isNearTo(source)) {
                let closestDroppedEnergy = creep.pos.findClosestByRange(dropped_resources);
                if(creep.pickup(closestDroppedEnergy) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestDroppedEnergy, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
                else if(creep.pickup(closestDroppedEnergy == 0)) {
                    creep.moveTo(source);
                }
                return;
            }
        }
	}
};

module.exports = roleWorker;