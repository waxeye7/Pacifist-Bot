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

    if(!creep.memory.full && creep.ticksToLive > 1480 && creep.room.memory.Structures && creep.room.memory.Structures.storage) {
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
        if(creep.hits < creep.hitsMax / 1.5) {
            Memory.delayConvoy[creep.memory.homeRoom] = 8000;
        }
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(creep.room.name == creep.memory.targetRoom && (creep.room.memory.Structures && creep.room.memory.Structures.storage || creep.room.storage)) {
        let storage:any = Game.getObjectById(creep.room.memory.Structures.storage) || creep.room.storage;
        if(creep.memory.full && storage && storage.store.getFreeCapacity() > 100 && creep.store.getUsedCapacity() > 0) {
            if(creep.pos.isNearTo(storage)) {
                if(creep.transfer(storage, RESOURCE_ENERGY) === 0) {
                    creep.memory.homeRoom = creep.memory.targetRoom;
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
        }
        else {
            creep.recycle();
        }
    }
    else if(!creep.room.memory.Structures || !creep.room.memory.Structures.storage) {
        let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
        if(spawn) {
            if(creep.pos.isNearTo(spawn)) {
                spawn.recycle(creep);
            }
            else {
                creep.MoveCostMatrixRoadPrio(spawn, 1);
            }
        }
        else {
            creep.suicide();
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
