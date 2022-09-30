/**
 * A little description of this function
 * @param {Creep} creep
 **/

function findLocked(creep) {
    let buildingsToRepair300mil;

    if(creep.room.controller.level > 2) {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD});
    }
    else {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000});
    }

    if(buildingsToRepair300mil.length > 0) {
        buildingsToRepair300mil.sort((a,b) => a.hits - b.hits);
        creep.say("🎯", true);
        return buildingsToRepair300mil[0].id;
    }
    else {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000});
        if(buildingsToRepair300mil.length > 0) {
            buildingsToRepair300mil.sort((a,b) => a.hits - b.hits);
            creep.say("🎯", true);
            return buildingsToRepair300mil[0].id;
        }
    }
}

 const run = function (creep) {
    if(creep.memory.homeRoom && creep.memory.homeRoom != creep.room.name) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
    }
    // const start = Game.cpu.getUsed()

    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    if(creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.repairing = false;
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }

    if(creep.memory.repairing) {
        if(creep.memory.locked && creep.memory.locked != false) {
            let repairTarget:any = Game.getObjectById(creep.memory.locked);
            if(!repairTarget) {
                creep.memory.locked = false;
            }
            if(repairTarget.hits == repairTarget.hitsMax) {
                creep.memory.locked = false;
            }
        }

        if(!creep.memory.locked) {
            creep.memory.locked = findLocked(creep);
        }


        if(creep.memory.locked && creep.memory.locked != false) {
            let repairTarget = Game.getObjectById(creep.memory.locked);
            if(creep.repair(repairTarget) == ERR_NOT_IN_RANGE) {
                creep.moveTo(repairTarget, {reusePath:20});
            }
            else {
                if(creep.store.getFreeCapacity() == 0) {
                    if(creep.roadCheck()) {
                        let roadlessLocation = creep.roadlessLocation(repairTarget);
                        creep.moveTo(roadlessLocation);
                    }
                }
            }
        }

    }

    else if(!creep.memory.repairing && storage) {
        let result = creep.withdrawStorage(storage);
		if(result == 0) {
			if(!creep.memory.locked) {
				creep.memory.locked = findLocked(creep);
			}
			if(creep.memory.locked) {
				let repairTarget = Game.getObjectById(creep.memory.locked);
				creep.moveTo(repairTarget, {reusePath:20});
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
				let repairTarget = Game.getObjectById(creep.memory.locked);
				creep.moveTo(repairTarget, {reusePath:20});
			}
		}
    }
    // console.log('Repair Ran in', Game.cpu.getUsed() - start, 'ms')
}

const roleRepair = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRepair;




        // const buildingsToRepair1mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 1000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair3mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 3000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair10mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 10000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair30mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 30000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 300000000 && object.structureType !== STRUCTURE_ROAD});
