var roleBuilder = {

    /** @param {Creep} creep **/
    run: function(creep) {

		let targets = creep.room.find(FIND_CONSTRUCTION_SITES);
		let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

		if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
			creep.memory.building = false;
			if(storage == undefined) {
				let source = Game.getObjectById(creep.memory.source) || creep.findSource();
				creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
			}
			else {
				creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
			}
		}

		if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
			creep.memory.building = true;
			let closestTarget = creep.pos.findClosestByRange(targets);
			creep.moveTo(closestTarget);
		}

		if(creep.memory.building) {
			if(targets.length > 0) {
				let closestTarget = creep.pos.findClosestByRange(targets);
				if(creep.build(closestTarget) == ERR_NOT_IN_RANGE) {
					creep.moveTo(closestTarget, {visualizePathStyle: {stroke: '#000'}});
				}
			}
			else {
				const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 24900});
				
				if(buildingsToRepair.length > 0) {
					let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
					if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
						creep.moveTo(closestBuildingToRepair);
					}
					return;
				}

				const buildingsToRepair2 = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 1500000});

				if(buildingsToRepair2.length > 0) {
					let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair2);
					if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
						creep.moveTo(closestBuildingToRepair);
					}
					return;
				}
			}
		}
		else {
			if(storage == undefined) {
				creep.harvestEnergy();
			}
			else {
				if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
					creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
				}
			}
		}
	}
};

module.exports = roleBuilder;