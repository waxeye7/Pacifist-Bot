/**
 * A little description of this function 
 * @param {Creep} creep
 **/
 const run = function (creep) {

    if(!creep.memory.deposit) {
        let found_deposit = creep.room.find(FIND_MINERALS);
        creep.memory.deposit = found_deposit[0];
    }
    let deposit = Game.getObjectById(creep.memory.deposit.id);

    if(!creep.memory.mining && creep.store[deposit.mineralType] == 0) {   
        creep.memory.mining = true;
    }
    else if(creep.memory.mining && creep.store.getFreeCapacity() == 0) {
        creep.memory.mining = false;
    }

    if(creep.memory.mining) {
        if(creep.pos.isNearTo(deposit)) {
            creep.harvest(deposit);
        }
        else {
            creep.moveTo(deposit);
        }
    }
    else {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                creep.transfer(storage, deposit.mineralType);
            }
            else {
                creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }

    }
}

const roleMineralMiner = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleMineralMiner;