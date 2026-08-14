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

    // TTL>1480 only covers the first ~20 ticks, then this returned without
    // filling and an empty convoy sat at home forever. After a successful
    // drop homeRoom is retargeted to the destination — skip fill there so
    // we do not withdraw the energy we just delivered.
    if(!creep.memory.full && creep.room.name == creep.memory.homeRoom && creep.memory.homeRoom !== creep.memory.targetRoom) {
        let storage = (creep.room.memory.Structures && Game.getObjectById(creep.room.memory.Structures.storage)) || creep.room.storage;
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
        else {
            creep.recycle();
        }
        return;
    }

    if(creep.memory.full && creep.room.name !== creep.memory.targetRoom) {
        if(creep.hits < creep.hitsMax / 1.5) {
            Memory.delayConvoy[creep.memory.homeRoom] = 8000;
        }
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(creep.room.name == creep.memory.targetRoom) {
        if(creep.memory.full && creep.store.getUsedCapacity() > 0) {
            let storage:any = (creep.room.memory.Structures && Game.getObjectById(creep.room.memory.Structures.storage)) || creep.room.storage;
            if(storage && storage.store.getFreeCapacity() > 100) {
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
                // recycle() walks home while still full, then the travel arm
                // walks back — pinball. Dump into any local sink, or drop;
                // only recycle once TTL is too short to keep hauling.
                let sinks = creep.room.find(FIND_STRUCTURES, {filter: s =>
                    (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION ||
                     s.structureType == STRUCTURE_CONTAINER || s.structureType == STRUCTURE_TOWER) &&
                    s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
                let sink = creep.pos.findClosestByRange(sinks);
                if(sink) {
                    if(creep.pos.isNearTo(sink)) {
                        if(creep.transfer(sink, RESOURCE_ENERGY) === 0) {
                            creep.memory.homeRoom = creep.memory.targetRoom;
                        }
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(sink, 1);
                    }
                }
                else {
                    creep.drop(RESOURCE_ENERGY);
                    if(creep.ticksToLive < 150) {
                        creep.recycle();
                    }
                }
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
