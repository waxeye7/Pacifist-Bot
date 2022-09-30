/**
 * A little description of this function
 * @param {Creep} creep
 **/

 function findLocked(creep) {
	let buildingsToBuild = creep.room.find(FIND_MY_CONSTRUCTION_SITES);

    if(buildingsToBuild.length > 0) {
		creep.say("🎯", true);
        return buildingsToBuild[0].id;
    }
	else {
		creep.memory.role = "repair";
	}
}

 const run = function (creep) {

	// const start = Game.cpu.getUsed()

	let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.building = false;
    }
    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
        creep.memory.building = true;
    }

    if(creep.memory.building) {
        if(creep.memory.locked && creep.memory.locked != false) {
            let buildTarget = Game.getObjectById(creep.memory.locked);
            if(buildTarget == undefined) {
                creep.memory.locked = false;
            }
        }

        if(!creep.memory.locked) {
            creep.memory.locked = findLocked(creep);
        }


        if(creep.memory.locked && creep.memory.locked != false) {
            let buildTarget = Game.getObjectById(creep.memory.locked);
            if(creep.build(buildTarget) == ERR_NOT_IN_RANGE) {
                creep.moveTo(buildTarget, {reusePath:20});
            }
            else {
				if(creep.store.getFreeCapacity() == 0) {
					if(creep.roadCheck()) {
						let roadlessLocation = creep.roadlessLocation(buildTarget);
						creep.moveTo(roadlessLocation);
					}
				}
            }
        }
    }

    else if(!creep.memory.building && storage) {
		let result = creep.withdrawStorage(storage);
		if(result == 0) {
			if(!creep.memory.locked) {
				creep.memory.locked = findLocked(creep);
			}
			if(creep.memory.locked) {
				let buildTarget = Game.getObjectById(creep.memory.locked);
				creep.moveTo(buildTarget, {reusePath:20});
			}
		}
    }

    else {
        let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
		if(result == 0) {
			if(!creep.memory.locked) {
				creep.memory.locked = findLocked(creep);
			}
			if(creep.memory.locked) {
				let buildTarget = Game.getObjectById(creep.memory.locked);
				creep.moveTo(buildTarget, {reusePath:20});
			}
		}
    }
    // console.log('Builder Ran in', Game.cpu.getUsed() - start, 'ms');

	// if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
	// 	creep.memory.building = false;
	// 	if(storage == undefined) {
	// 		let source = Game.getObjectById(creep.memory.source) || creep.findSource();
	// 		creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
	// 	}
	// 	else {
	// 		creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
	// 	}
	// }

	// if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
	// 	creep.memory.building = true;
	// 	let closestTarget = creep.pos.findClosestByRange(targets);
	// 	creep.moveTo(closestTarget);
	// }

	// if(creep.memory.building) {
	// 	if(targets.length > 0) {
	// 		let closestTarget = creep.pos.findClosestByRange(targets);
	// 		if(creep.build(closestTarget) == ERR_NOT_IN_RANGE) {
	// 			creep.moveTo(closestTarget, {visualizePathStyle: {stroke: '#000'}});
	// 		}
	// 	}
	// 	else {
	// 		const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 24900});

	// 		if(buildingsToRepair.length > 0) {
	// 			let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
	// 			if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
	// 				creep.moveTo(closestBuildingToRepair);
	// 			}
	// 			return;
	// 		}

	// 		const buildingsToRepair2 = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 1500000});

	// 		if(buildingsToRepair2.length > 0) {
	// 			let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair2);
	// 			if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
	// 				creep.moveTo(closestBuildingToRepair);
	// 			}
	// 			return;
	// 		}
	// 	}
	// }
	// else {
	// 	if(storage == undefined) {
	// 		creep.acquireEnergyWithContainersAndOrDroppedEnergy();
	// 	}
	// 	else {
	// 		if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
	// 			creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
	// 		}
	// 	}
	// }
	// console.log('Builder Ran in', Game.cpu.getUsed() - start, 'ms')
}


const roleBuilder = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleBuilder;
