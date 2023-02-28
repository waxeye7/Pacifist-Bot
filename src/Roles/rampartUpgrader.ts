/**
 * A little description of this function
 * @param {Creep} creep
 **/

 const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.homeRoom && creep.memory.homeRoom != creep.room.name) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
    }

    if(creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.repairing = false;
        creep.memory.locked = false;
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }
    if(!creep.memory.repairing) {
        creep.harvestEnergy();
    }
    if(creep.memory.repairing) {
        if(!creep.memory.locked) {
            let rampartsInRoom = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART});
            if(rampartsInRoom.length > 0) {
                rampartsInRoom.sort((a,b) => a.hits - b.hits);
                creep.memory.locked = rampartsInRoom[0].id
            }
        }
        if(creep.memory.locked) {
            let target = Game.getObjectById(creep.memory.locked);
            if(target) {
                if(creep.pos.getRangeTo(target) <= 3) {
                    creep.repair(target);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(target, 3);
                }
            }
            else {
                creep.memory.locked = false;
            }

        }

    }

}

const roleRampartUpgrader = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRampartUpgrader;
