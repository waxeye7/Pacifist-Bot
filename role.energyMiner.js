/**
 * A little description of this function 
 * @param {Creep} creep
 **/
const run = function (creep) {
    if(creep.room.controller.level < 6 || creep.memory.targetRoom != creep.memory.homeRoom) {
        creep.harvestEnergy();
        return;
    }
    else {
        if(creep.ticksToLive == 1499) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            creep.memory.targetLink = closestLink.id;
            creep.memory.closestLink = null;
        }
        
    
        if(creep.store.getFreeCapacity() == 0) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {
                if(creep.pos.isNearTo(closestLink)) {
                    creep.transfer(closestLink, RESOURCE_ENERGY);
                }
            }
        }
    
        creep.harvestEnergy()
        // if(creep.harvestEnergy() == -1) { 
        //     let containers = creep
    
        // }
    
        if(creep.store[RESOURCE_ENERGY] > 0 && creep.memory.homeRoom == creep.memory.targetRoom) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            targetLink = Game.getObjectById(creep.memory.targetLink);
            if(targetLink == null) {
                console.log("ALERT: stupid bug idk why. Link store is null.", creep.memory.targetRoom, creep.memory.homeRoom);
                return;
            }
            if(closestLink.store[RESOURCE_ENERGY] == 800 && targetLink.store[RESOURCE_ENERGY] == 0) {
                closestLink.transferEnergy(targetLink);
            }
        }
    }
}
const roleEnergyMiner = {
    run,
    //run: run,
    //function2,
    //function3
};



module.exports = roleEnergyMiner;