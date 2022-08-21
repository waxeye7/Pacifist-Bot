var roleWorker = {

    /** @param {Creep} creep **/
    run: function(creep) {
        let sources = creep.room.find(FIND_SOURCES);
        let dropped_resources = creep.room.find(FIND_DROPPED_RESOURCES);
        if(dropped_resources.length > 0) {
            if(creep.store[RESOURCE_ENERGY] == 0 && !creep.pos.inRangeTo(sources[1], 1)) {
                let closestDroppedEnergy = creep.pos.findClosestByRange(dropped_resources);
                if(creep.pickup(closestDroppedEnergy) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestDroppedEnergy, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
                return;
            }
        }
        // let sources = [creep.room.find(FIND_TOMBSTONES), creep.room.find(FIND_DROPPED_RESOURCES), creep.room.find(RESOURCE_ENERGY)];
	    if((creep.store.getFreeCapacity() > 0 && creep.pos.inRangeTo(sources[1], 1)) && sources[1].energy != 0 || creep.store[RESOURCE_ENERGY] == 0 && sources[1].energy != 0) {
            if(creep.harvest(sources[1]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }

	    else if((creep.store.getFreeCapacity() > 0 && creep.pos.inRangeTo(sources[0], 1)) && sources[0].energy != 0 || creep.store[RESOURCE_ENERGY] == 0 && sources[0].energy != 0) {
            if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }

        else {
            var targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER  || structure.structureType == STRUCTURE_CONTAINER) &&
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
            });
            var storage = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_STORAGE) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
        });
            if(targets.length > 0) {
                let target = creep.pos.findClosestByRange(targets);
                if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                }
                else if (creep.transfer(target, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                    if (sources[1].energy != 0) {
                        creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                    else {
                        creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}}); 
                    }
                }
            }
            else if (targets.length == 0 && storage.length > 0) {
                let target = creep.pos.findClosestByRange(storage);
                if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                }
                else if (creep.transfer(target, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                    if (sources[1].energy != 0) {
                        creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                    else {
                        creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}}); 
                    }
                }
            }

            else if (targets.length == 0 && creep.store.getFreeCapacity() <= 199) {
                const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {
					filter: object => object.hits < object.hitsMax && object.structureType != STRUCTURE_WALL
				});
				if(buildingsToRepair.length > 0) {
                    let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
					if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
						creep.moveTo(closestBuildingToRepair);
					}
				}
            }
            // else {
            //     creep.moveTo(34,34);
            // }
        }
	}
};

module.exports = roleWorker;