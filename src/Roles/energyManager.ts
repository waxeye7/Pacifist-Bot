import roomDefence from "Rooms/rooms.defence";

/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {

    if(Game.time % 50 == 0 && creep.room.energyAvailable <= 300) {
        creep.memory.role = "filler";
    }

    let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();

    if(closestLink && closestLink.store[RESOURCE_ENERGY] > 0) {
        if(creep.store.getFreeCapacity() > 0) {
            if(creep.pos.isNearTo(closestLink)) {
                creep.withdraw(closestLink, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(closestLink);
            }
        }
        else if(creep.store.getFreeCapacity() == 0) {
            let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

            if(creep.pos.isNearTo(storage)) {
                creep.transfer(storage, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(storage);
            }
        }
    }
    if(creep.roadCheck()) {
        creep.moveAwayIfNeedTo();
    }
}


const roleEnergyManager = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleEnergyManager;
