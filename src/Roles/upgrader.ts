const run = function (creep) {
	creep.memory.moving = false;

	// const start = Game.cpu.getUsed()
	let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    if(creep.room.controller && creep.room.controller.level == 4 && !storage && creep.room.find(FIND_MY_CREEPS).length < 9) {
        creep.memory.role = "builder";
        creep.memory.locked = false;
    }

	// if(creep.fatigue > 0) {
	// 	console.log('hi')
	// 	creep.room.createConstructionSite(creep.pos, STRUCTURE_ROAD);
	// }

	let controllerLink:any = Game.getObjectById(creep.room.memory.Structures.controllerLink);

	if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
		creep.memory.upgrading = false;
		creep.MoveCostMatrixRoadPrio(controllerLink, 1);
	}
	if(!creep.memory.upgrading && creep.store[RESOURCE_ENERGY] > 0) {
		creep.memory.upgrading = true;
	}

	if(creep.memory.upgrading) {
		if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE && creep.room.memory.Structures.controllerLink && creep.pos.getRangeTo(creep.room.controller == 4)) {
			creep.roomCallbackRoadPrioUpgraderInPosition(creep.room.controller, 3);
		}
		else if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
			creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
		}

		if(controllerLink && creep.pos.isNearTo(controllerLink) && creep.store[RESOURCE_ENERGY] <= creep.getActiveBodyparts(WORK) && creep.pos.isNearTo(controllerLink)) {
			creep.withdraw(controllerLink, RESOURCE_ENERGY);
		}

	}
	else {
		if(controllerLink && controllerLink.store[RESOURCE_ENERGY] > 0) {
			if(creep.pos.isNearTo(controllerLink)) {
				creep.withdraw(controllerLink, RESOURCE_ENERGY);
			}
			else {
				creep.MoveCostMatrixRoadPrio(controllerLink, 1);
			}
		}
		else {

			if(storage == undefined) {
				let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
				if(result == 0) {
					creep.MoveCostMatrixRoadPrio(creep.room.controller, 3)
				}
			}
			else {
				let result = creep.withdrawStorage(storage);
				if(result == 0) {
					creep.MoveCostMatrixRoadPrio(creep.room.controller, 3)
				}
			}

		}

	}






	if(controllerLink && creep.ticksToLive == 1) {
		creep.transfer(controllerLink, RESOURCE_ENERGY);
	}









	// console.log('Upgrader Ran in', Game.cpu.getUsed() - start, 'ms')


	if(!controllerLink && creep.ticksToLive <= 50 && !creep.memory.upgrading) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
		return;
	}



}




const roleUpgrader = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleUpgrader;
