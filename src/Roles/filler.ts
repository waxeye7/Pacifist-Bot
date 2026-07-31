/**
 * A little description of this function
 * @param {Creep} creep
 **/

const run = function (creep) {
    creep.memory.moving = false;
    if(creep.ticksToLive == 1499 || Game.time % 40 == 0) {
        creep.room.memory.reserveFill = [];
    }
    if(creep.evacuate()) {
		return;
	}
    if(creep.ticksToLive == 22 && creep.memory.storage && creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "filler")}}).length == 1) {
        let newName = 'filler-'+ Math.floor(Math.random() * Game.time) + "-" + creep.room.name;
        if(creep.room.controller.level <= 3 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,MOVE], newName, {memory: {role: 'filler'}});
        }
        else if(creep.room.controller.level >= 4 && creep.room.controller.level <= 6 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'filler'}});
        }
        else if(creep.room.controller.level == 7 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE], newName, {memory: {role: 'filler'}});
        }
        else if(creep.room.controller.level == 8 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'filler'}});
        }
        console.log("added filler to spawn queue", creep.room.name)
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


    if(creep.memory.fleeing) {
        // find hostiles with attack or ranged attack
        let hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        let meleeHostiles = hostiles.filter(c => c.getActiveBodyparts(ATTACK) > 0 );
        let rangedHostiles = hostiles.filter(c => c.getActiveBodyparts(RANGED_ATTACK) > 0 );
        if(rangedHostiles.length) {
            let closestRangedHostile = creep.pos.findClosestByRange(rangedHostiles);
            if(creep.pos.getRangeTo(closestRangedHostile) <= 5) {
                return;
            }
        }
        else if(meleeHostiles.length) {
            let closestMeleeHostile = creep.pos.findClosestByRange(meleeHostiles);
            if(creep.pos.getRangeTo(closestMeleeHostile) <= 3) {
                return;
            }
        }
    }
    else if(!creep.memory.danger) {
        creep.memory.fleeing = false;
    }

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
        // native getter is authoritative — the Structures cache can go stale
        // when a storage is newly built (planV2 rooms), and a filler that
        // loses its storage falls into the cross-map scavenge path while the
        // spawn starves (E11S5: 774k banked, spawn at 92)
        let storage = creep.room.storage || (creep.room.memory.Structures && Game.getObjectById(creep.room.memory.Structures.storage)) || creep.room.findStorage();
        let bin;
        if(creep.room.memory.Structures) {
            bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);
        }

        // Salvage free floor energy first — but only NEARBY loot. A filler's
        // job is the spawn; it must never cross the map for a pile.
        const freeLoot =
            creep.pos.findInRange(FIND_DROPPED_RESOURCES, 10, {
                filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= MaxStorage,
            }).length +
            creep.pos.findInRange(FIND_TOMBSTONES, 10, {
                filter: (t) => t.store[RESOURCE_ENERGY] >= MaxStorage,
            }).length +
            creep.pos.findInRange(FIND_RUINS, 10, {
                filter: (r) => r.store[RESOURCE_ENERGY] >= MaxStorage,
            }).length;
        if (freeLoot > 0 && !creep.room.memory.danger) {
            creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        } else if(bin && bin.store[RESOURCE_ENERGY] >= MaxStorage) {
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
                            creep.room.memory.reserveFill.splice(indexOfTargetId, 1);
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
                    if(creep.room.memory.danger) {
                        creep.moveToSafePositionToRepairRampart(target, 1);
                    }else {
                        creep.MoveCostMatrixRoadPrio(target, 1)

                    }
                }
            }
        }

    }
}

const roleFiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleFiller;
