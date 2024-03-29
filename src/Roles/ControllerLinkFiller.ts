
/**
 * A little description of this function
 * @param {Creep} creep
 **/

const run = function (creep) {
    creep.memory.moving = false;
    if(creep.ticksToLive == 1499) {
        creep.room.memory.reserveFill = [];
    }
    if(creep.evacuate()) {
		return;
	}
	if(creep.ticksToLive <= 14 && !creep.memory.full) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}
    if(!creep.memory.MaxStorage) {
        let carryPartsAmount = 0
        for(let part of creep.body) {
            if(part.type == CARRY) {
                carryPartsAmount += 1;
            }
        }
        creep.memory.MaxStorage = carryPartsAmount * 50;
    }

    let MaxStorage = creep.memory.MaxStorage;

    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full) {
        if(creep.room.controller && (creep.room.controller.level <= 6 && creep.store[RESOURCE_ENERGY] < 50 || creep.room.controller.level == 7 && creep.store[RESOURCE_ENERGY] < 100 || creep.room.controller.level == 8 && creep.store[RESOURCE_ENERGY] < 200)) {
            creep.memory.full = false;
            creep.memory.t = false;
        }
    }



    if(!creep.memory.full) {
        let bin;
        let storage;
        if(creep.room.memory.Structures) {
            bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);
            storage = Game.getObjectById(creep.room.memory.Structures.storage) || creep.room.findStorage();
        }
        if(bin && bin.store[RESOURCE_ENERGY] >= MaxStorage) {
            if(creep.pos.isNearTo(bin)) {
                let result = creep.withdraw(bin, RESOURCE_ENERGY);
                if(result == 0) {
                    creep.memory.full = true;
                }
            }
            else {
                creep.MoveCostMatrixSwampPrio(bin, 1);
            }
        }
        else if(storage && storage.store[RESOURCE_ENERGY] > 0) {
            let result = creep.withdrawStorage(storage);
            if(result == 0) {
                creep.memory.full = true;
            }
        }
        else if(!creep.room.memory.danger) {
            creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        }
    }

    if(creep.memory.full) {
        let storage;
        if(creep.room.memory.Structures) {
            storage = Game.getObjectById(creep.room.memory.Structures.storage) || creep.room.findStorage();
        }


        let target = Game.getObjectById(creep.memory.t) || creep.findFillerTarget();
        if(target) {
            if(target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
                target = creep.findFillerTarget();
            }
            if(target) {
                if(creep.pos.isNearTo(target)) {
                    let result = creep.transfer(target, RESOURCE_ENERGY);
                    if(result == 0) {
                        let indexOfTargetId = creep.room.memory.reserveFill.indexOf(target.id);
                        if(indexOfTargetId !== -1) {
                            creep.room.memory.reserveFill = creep.room.memory.reserveFill.splice(indexOfTargetId, 1);
                        }
                    }
                    if(creep.store[RESOURCE_ENERGY] > target.store.getFreeCapacity(RESOURCE_ENERGY)) {
                        let newTarget = creep.findFillerTarget();
                        if(newTarget && creep.pos.getRangeTo(newTarget) > 1) {
                            creep.MoveCostMatrixRoadPrio(newTarget, 1);
                        }
                    }
                    else {
                        creep.memory.full = false;
                        if(storage) {
                            creep.MoveCostMatrixRoadPrio(storage, 1);
                        }
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(target, 1)
                }
            }
        }

    }
}

const roleControllerLinkFiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleControllerLinkFiller;
