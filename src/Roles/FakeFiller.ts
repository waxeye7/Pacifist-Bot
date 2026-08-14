/**
 * A little description of this function
 * @param {Creep} creep
 **/

import { isUndeliverable } from "utils/Reachability";

function findLocked(creep) {

    if(creep.room.energyAvailable == creep.room.energyCapacityAvailable && creep.room.memory.Structures) {
        creep.memory.locked = creep.room.memory.Structures.storage;
        return;
    }
    else {
        let possibleDropOffLocations = [];

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage && storage.store.getFreeCapacity() !== 0) {
            possibleDropOffLocations.push(storage);
        }

        // an extension with no walkable approach is hungry forever and is
        // therefore always the closest hungry thing — see utils/Reachability.
        // Live E9S2: Carrier-81022 and Carrier-727835 both locked onto
        // extension@20,39 (walled in by four off-plan extensions) and spent
        // their whole lives swapping places with each other two tiles away.
        let spawnAndExtensions = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION) && building.store.getFreeCapacity(RESOURCE_ENERGY) !== 0 && !isUndeliverable(creep.room, building.id)});
        if(spawnAndExtensions.length > 0) {
            possibleDropOffLocations.push(creep.pos.findClosestByRange(spawnAndExtensions));
        }

        if(possibleDropOffLocations.length > 0) {
            let lock = creep.pos.findClosestByRange(possibleDropOffLocations);
            if(lock) {
                creep.memory.locked = lock.id;
                return lock
            }
        }
    }

}



const run = function (creep) {
    creep.memory.moving = false;

    if(creep.holdForFlee()) {
        return;
    }

    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
        creep.memory.role = "carry"
        creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        return;
    }



    // creep.memory.locked is sticky for the creep's whole life, so it has to
    // be re-validated against the undeliverable list every tick.
    if(creep.memory.locked && isUndeliverable(creep.room, creep.memory.locked)) {
        creep.memory.locked = false;
        creep.memory.path = false;
        delete creep.memory.MoveTargetId;
    }
    let lock:any = Game.getObjectById(creep.memory.locked) || findLocked(creep);
    if(lock) {
        if(lock.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
            lock = findLocked(creep);
        }

        if(lock) {
            if(creep.pos.isNearTo(lock)) {
                creep.transfer(lock, RESOURCE_ENERGY)

            }
            else {
                creep.MoveCostMatrixRoadPrio(lock, 1);
            }
        }

    }
    else {
        if(creep.room.memory.Structures && creep.room.memory.Structures.storage) {
            let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);
            if(storage && storage.store.getFreeCapacity() == 0)  {
                if(creep.pos.isNearTo(storage)) {
                    creep.drop(RESOURCE_ENERGY);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1)
                }
            }
        }
    }




}

const roleFakeFiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleFakeFiller;
