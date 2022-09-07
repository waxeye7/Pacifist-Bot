var roleUpgrader = {

    /** @param {Creep} creep **/
    run: function(creep) {

		let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();


		// if(creep.fatigue > 0) {
		// 	console.log('hi')
		// 	creep.room.createConstructionSite(creep.pos, STRUCTURE_ROAD);
		// }

        if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.upgrading = false;
			if(storage == undefined) {
				let source = Game.getObjectById(creep.memory.source) || creep.findSource();
				creep.moveTo(source, {reusePath:20, visualizePathStyle: {stroke: '#ffaa00'}});
			}
			else {
				creep.moveTo(storage, {reusePath:20, visualizePathStyle: {stroke: '#ffaa00'}});
			}
	    }


	    if(!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
	        creep.memory.upgrading = true;
	    }

	    if(creep.memory.upgrading) {
            if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
			if(storage == undefined) {
				creep.acquireEnergyWithContainersAndOrDroppedEnergy();
			}
			else {
				if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
					creep.moveTo(storage, {reusePath:20, visualizePathStyle: {stroke: '#ffaa00'}});
				}
			}
        }
	}
};

module.exports = roleUpgrader;