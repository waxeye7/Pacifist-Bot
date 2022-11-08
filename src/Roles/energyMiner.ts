/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.Speak();
    // if(creep.fleeHomeIfInDanger() == true) {
    //     return;
    // }

    // if(creep.pos.x > 0 && creep.pos.y > 0 && creep.pos.y < 49 && creep.pos.x < 49) {
    //     return;
    // }
    // else {
    //     creep.moveTo(25,25)
    // }

    if(creep.room.controller && creep.room.controller.level < 6 || creep.memory.targetRoom != creep.memory.homeRoom || creep.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK}).length < 3) {
        if(creep.roadCheck()) {
            creep.moveAwayIfNeedTo();
        }
        let result = creep.harvestEnergy();
        if(result == 0) {
            let containerNearby = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_CONTAINER && creep.pos.getRangeTo(building) <= 1 });
            if(containerNearby.length && containerNearby[0].pos != creep.pos) {
                creep.moveTo(containerNearby[0])
            }
        }

        // if(creep.roadCheck()) {
        //     creep.moveAwayIfNeedTo();
        // }
        // could add if not on container, move to container nearby but cbf rn
        return;
    }
    else {
        if(creep.ticksToLive == 1499) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            creep.memory.targetLink = closestLink.id;
            creep.memory.closestLink = null;
        }

        if(creep.ticksToLive <= 3) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            if(creep.pos.isNearTo(closestLink)) {
                creep.transfer(closestLink, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(closestLink);
            }
        }


        if(creep.store.getFreeCapacity() <= 30) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {
                if(creep.pos.isNearTo(closestLink)) {
                    creep.transfer(closestLink, RESOURCE_ENERGY);
                }
                else {
                    creep.moveTo(closestLink);
                }
            }
        }

        if(creep.store.getFreeCapacity() > 20) {
            let result = creep.harvestEnergy();
        }

        // if(result == 0) {
        if(creep.roadCheck()) {
            creep.moveAwayIfNeedTo();
        }
        // }
        // if(creep.harvestEnergy() == -1) {
        //     let containers = creep

        // }



        if(creep.store[RESOURCE_ENERGY] > 0 && creep.memory.homeRoom == creep.memory.targetRoom) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            let targetLink:any = Game.getObjectById(creep.memory.targetLink);
            if(targetLink == null || closestLink == null) {
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

    //function2,
    //function3
};

export default roleEnergyMiner;
