
/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { pruneReserveFill } from "Roles/filler";

const run = function (creep) {
    creep.memory.moving = false;

    if(creep.holdForFlee()) {
        return;
    }
    if(creep.ticksToLive == 1499) {
        // Attributed list: drop dead/expired owners, never wipe live claims
        // (the old blanket `= []` dropped every filler's reservation on hatch).
        pruneReserveFill(creep.room);
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
            storage = Game.getObjectById(creep.room.memory.Structures.storage) || creep.room.findStorage();
            bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);
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
        if(!target) {
            /*
             * Nothing to fill. Measured: E11S8 (RCL4, no links in the room at
             * all) ran 4-5 ControllerLinkFillers at once, each parked holding a
             * full 800 energy at 12,31 / 16,31 / 17,30 / 17,31, during the exact
             * 2,725 ticks the room made zero controller progress. Hand the load
             * back to storage instead of sitting on it, and stop existing if
             * there is still nothing to do once it is delivered.
             */
            creep.memory._noSink = (creep.memory._noSink || 0) + 1;
            if(storage) {
                if(creep.pos.isNearTo(storage)) {
                    if(creep.transfer(storage, RESOURCE_ENERGY) == 0) {
                        creep.memory.full = false;
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1);
                }
            }
            if(creep.memory._noSink > 150) {
                creep.memory.suicide = true;
            }
            return;
        }
        creep.memory._noSink = 0;
        if(target) {
            if(target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
                target = creep.findFillerTarget();
                // findFillerTarget only writes memory.t when it FOUND something,
                // so a null here would otherwise leave the creep re-resolving the
                // same full target forever. Clear it and let the no-sink path
                // above take over next tick.
                if(!target) {
                    creep.memory.t = false;
                    return;
                }
            }
            if(target) {
                if(creep.pos.isNearTo(target)) {
                    // No manual reservation release here: reserveFill entries are
                    // {id, creep, t} objects now, so indexOf(target.id) never
                    // matched — and the release it guarded assigned the RESULT of
                    // splice() (the removed element) back over the whole list,
                    // i.e. it would have wiped every other creep's reservation the
                    // one time it fired. creepFunctions.liveReserveFill() drops
                    // entries by owner/TTL, which is the release path.
                    creep.transfer(target, RESOURCE_ENERGY);
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
