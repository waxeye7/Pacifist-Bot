const run = function (creep) {
	// const start = Game.cpu.getUsed()

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
			creep.moveTo(storage, {reusePath:20, ignoreRoads:true, visualizePathStyle: {stroke: '#ffaa00'}});
		}
	}


	if(!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
		creep.memory.upgrading = true;
	}

	if(creep.memory.upgrading) {
		if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
			creep.moveTo(creep.room.controller, {reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
		}
		else {
			if(creep.store.getFreeCapacity() == 0) {
				if(creep.roadCheck()) {
					let roadlessLocation = creep.roadlessLocation(creep.room.controller);
					creep.moveTo(roadlessLocation);
				}
			}
		}
	}
	else {
		if(storage == undefined) {
			let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
			if(result == 0) {
				creep.moveTo(creep.room.controller, {reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
			}
		}
		else {
			let result = creep.withdrawStorage(storage);
			if(result == 0) {
				creep.moveTo(creep.room.controller, {reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
			}
		}
	}
	// console.log('Upgrader Ran in', Game.cpu.getUsed() - start, 'ms')
}

const roleUpgrader = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleUpgrader;
