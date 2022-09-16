/**
 * A little description of this function 
 * @param {Creep} creep
 **/
const run = function (creep) {

    if(creep.room.controller.level < 6 || creep.memory.targetRoom != creep.memory.homeRoom) {
        creep.harvestEnergy();
        return;
    }

    if(creep.ticksToLive == 1499) {
        let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
        creep.memory.targetLink = closestLink.id;
        creep.memory.closestLink = undefined;
    }


    if(creep.store.getFreeCapacity() == 0) {
        let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();

        if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {
            if(creep.pos.isNearTo(closestLink)) {
                creep.transfer(closestLink, RESOURCE_ENERGY);
            }
        }
    }

    creep.harvestEnergy();


    let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
    if(closestLink.store[RESOURCE_ENERGY] == 800) {
        targetLink = Game.getObjectById(creep.memory.targetLink);
        closestLink.transferEnergy(targetLink);
    }

}
const roleEnergyMiner = {
    run,
    //run: run,
    //function2,
    //function3
};



module.exports = roleEnergyMiner;