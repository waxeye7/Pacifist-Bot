const run = function (creep) {
	sayThings(creep);
	// const start = Game.cpu.getUsed()
	let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    if(creep.room.controller.level == 4 && !storage) {
        creep.memory.role = "builder";
        creep.memory.locked = false;
    }

	// if(creep.fatigue > 0) {
	// 	console.log('hi')
	// 	creep.room.createConstructionSite(creep.pos, STRUCTURE_ROAD);
	// }

	if(creep.room.controller.level >= 7 && storage.store[RESOURCE_ENERGY] > 30000) {
		if(!creep.memory.myLink) {
			let links = creep.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK});
			// if(!creep.room.memory.links) {
			// 	let linksIDS = [];
			// 	for(let linkid of links) {
			// 		linksIDS.push(linkid.id);
			// 	}
			// 	creep.room.memory.links = linksIDS;
			// }
			if(links.length > 0) {
				let myLink = creep.room.controller.pos.findClosestByRange(links);
				creep.memory.myLink = myLink.id;
			}
		}

		let theLink = Game.getObjectById(creep.memory.myLink) || storage;
		if(theLink && theLink.store[RESOURCE_ENERGY] == 0) {
			let links = creep.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK && building.store[RESOURCE_ENERGY] > 0});
			if(links.length > 0) {
				links.sort((a,b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
				links[0].transferEnergy(theLink);
			}
			else {
				creep.withdrawStorage();
			}
		}

		if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
			creep.memory.upgrading = false;
			creep.moveTo(theLink, {reusePath:6, visualizePathStyle: {stroke: '#ffaa00'}});
		}
		if(!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
			creep.memory.upgrading = true;
		}

		if(creep.memory.upgrading) {
			if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
				creep.moveTo(creep.room.controller, {reusePath:6, visualizePathStyle: {stroke: '#ffffff'}});
			}
			else {
				if(creep.store.getFreeCapacity() <= 50) {
					if(creep.roadCheck()) {
						let roadlessLocation = creep.roadlessLocation(creep.room.controller);
						creep.moveTo(roadlessLocation);
					}
				}
                if(creep.store.getFreeCapacity() < 100 && creep.store.getFreeCapacity() > 50 && creep.roadCheck()) {
                    creep.moveAwayIfNeedTo();
                }
			}
		}
		else {
			if(creep.pos.isNearTo(theLink)) {
				creep.withdraw(theLink, RESOURCE_ENERGY);
			}
			else {
				creep.moveTo(theLink, {reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
			}
		}




	}


	else {


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
				if(creep.store.getFreeCapacity() <= 50) {
					if(creep.roadCheck()) {
						let roadlessLocation = creep.roadlessLocation(creep.room.controller);
						creep.moveTo(roadlessLocation);
					}

				}
                if(creep.store.getFreeCapacity() < 100 && creep.store.getFreeCapacity() > 50 && creep.roadCheck()) {
                    creep.moveAwayIfNeedTo();
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


	}
	// console.log('Upgrader Ran in', Game.cpu.getUsed() - start, 'ms')


	if(creep.ticksToLive <= 50 && !creep.memory.upgrading) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
	}



}


function sayThings(creep:any) {
	if(creep.ticksToLive % 300 == 177) {
		creep.say("☮️", true);
	}
	else if(creep.ticksToLive % 300 == 176) {
		creep.say("I", true);
	}
	else if(creep.ticksToLive % 300 == 175) {
		creep.say("Could", true);
	}
	else if(creep.ticksToLive % 300 == 174) {
		creep.say("Use", true);
	}
	else if(creep.ticksToLive % 300 == 173) {
		creep.say("A", true);
	}
	else if(creep.ticksToLive % 300 == 172) {
		creep.say("Cigarette", true);
	}
	else if(creep.ticksToLive % 300 == 171) {
		creep.say("☮️", true);
	}

}


const roleUpgrader = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleUpgrader;
