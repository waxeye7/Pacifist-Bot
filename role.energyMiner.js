/**
 * A little description of this function 
 * @param {Creep} creep
 **/
 const run = function (creep) {
    if(creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.working = false;
    }
    if(!creep.memory.working && creep.store.getFreeCapacity() == 0) {
        creep.memory.working = true;
    }
    if(creep.memory.working) {
        if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
            return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
        }

        let storage = creep.room.storage;
        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                creep.transfer(storage, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(storage);
            }
        }

    }
    else {
        creep.harvestEnergy();
    }
}

const roleEnergyMiner = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleEnergyMiner;