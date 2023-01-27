/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
    }
    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }


    if(!creep.memory.full) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, RESOURCE_ENERGY);
        }
        else {
            creep.MoveCostMatrixRoadPrio(storage, 1)
        }
    }
    if(creep.memory.full) {
        if(!creep.memory.locked) {
            let ramparts = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.hits <= 50000});
            if(ramparts.length > 0) {
                creep.memory.locked = creep.pos.findClosestByRange(ramparts).id;
            }
            else {
                creep.memory.suicide = true;
            }
        }
        if(creep.memory.locked) {
            let rampart:any = Game.getObjectById(creep.memory.locked);
            if(rampart && rampart.hits < 50000) {
                if(creep.pos.getRangeTo(rampart) > 3) {
                    creep.MoveCostMatrixRoadPrio(rampart, 3);
                }
                else {
                    creep.repair(rampart);
                }
            }
            else {
                creep.memory.locked = false;
            }
        }
    }


}

const roleRampartErector = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRampartErector;
