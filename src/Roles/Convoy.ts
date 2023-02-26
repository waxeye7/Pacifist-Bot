/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;

    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store.getUsedCapacity() == 0) {
        creep.memory.full = false;
    }

    if(!creep.memory.full && creep.ticksToLive > 1480) {
        let storage = Game.getObjectById(creep.room.memory.Structures.storage);
        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                if(creep.withdraw(storage, RESOURCE_ENERGY) == 0) {
                    creep.memory.full = true;
                }
            }
            else {
                creep.MoveCostMatrixSwampPrio(storage, 1);
            }
        }
        return;
    }

    if(creep.memory.full && creep.room.name !== creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(creep.room.name == creep.memory.targetRoom) {
        let storage = Game.getObjectById(creep.room.memory.Structures.storage);
        if(creep.memory.full && storage) {
            if(creep.pos.isNearTo(storage)) {
                creep.transfer(storage, RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
        }
        else {
            creep.recycle();
        }
    }
}


const roleConvoy = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleConvoy;
