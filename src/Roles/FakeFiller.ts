/**
 * A little description of this function
 * @param {Creep} creep
 **/

function findLocked(creep) {

    if(creep.room.energyAvailable == creep.room.energyCapacityAvailable) {
        creep.memory.locked = creep.room.memory.Structures.storage;
        return;
    }
    else {
        let possibleDropOffLocations = [];

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage) {
            possibleDropOffLocations.push(storage);
        }

        let spawnAndExtensions = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION) && building.store.getFreeCapacity() > 0});
        if(spawnAndExtensions.length > 0) {
            possibleDropOffLocations.push(creep.pos.findClosestByRange(spawnAndExtensions));
        }

        if(possibleDropOffLocations.length > 0) {
            let lock = creep.pos.findClosestByRange(possibleDropOffLocations);
            creep.memory.locked = lock.id;
            return lock
        }
    }

}



const run = function (creep) {

    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
        creep.memory.role = "carry"
        creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        return;
    }



    let lock = Game.getObjectById(creep.memory.locked) || findLocked(creep);
    if(lock) {

        if(lock.store.getFreeCapacity() == 0) {
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




}

const roleFakeFiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleFakeFiller;