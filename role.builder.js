var roleBuilder = {

    /** @param {Creep} creep **/
    run: function(creep) {
		// let sources = creep.room.find(FIND_SOURCES);
		let storage = Game.getObjectById('62fe48352c2e6ae2d069e635');
		let targets = creep.room.find(FIND_CONSTRUCTION_SITES);
		let closestTarget = creep.pos.findClosestByRange(targets);

	    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
            creep.say('get energy');
			creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
	    }
	    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
	        creep.memory.building = true;
	        creep.say('🚧 build');
			creep.moveTo(closestTarget);
	    }

	    if(creep.memory.building) {
            if(targets.length > 0) {
                if(creep.build(closestTarget) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestTarget, {visualizePathStyle: {stroke: '#000'}});
                }
            }
			else {
				const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {
					filter: object => object.hits < object.hitsMax && object.structureType != STRUCTURE_WALL
				});
				
				buildingsToRepair.sort((a,b) => a.hits - b.hits);
				
				if(buildingsToRepair.length > 0) {
					let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
					if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
						creep.moveTo(closestBuildingToRepair);
					}
				}
			}
	    }
	    else {
            if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
	    }
	}
};

module.exports = roleBuilder;