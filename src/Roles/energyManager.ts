import roomDefence from "Rooms/rooms.defence";

/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {

    if(Game.time % 50 == 0 && creep.room.energyAvailable <= 300) {
        for(let resourceType in creep.carry) {
            creep.drop(resourceType);
        }
        creep.memory.role = "filler";
    }

    let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();

    if(closestLink && closestLink.store[RESOURCE_ENERGY] > 0 && creep.store.getFreeCapacity() != 0 && creep.store[RESOURCE_ENERGY] == 0) {
        if(creep.pos.isNearTo(closestLink)) {
            creep.withdraw(closestLink, RESOURCE_ENERGY);
            return;
        }
        else {
            creep.moveTo(closestLink);
            return;
        }
    }

    if(creep.store[RESOURCE_ENERGY] > 0) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

        if(creep.pos.isNearTo(storage)) {
            for(let resourceType in creep.carry) {
                creep.transfer(storage, resourceType);
            }
            return;
        }
        else {
            creep.moveTo(storage, {ignoreRoads:true});
            return;
        }
    }

    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
    let terminal = creep.room.terminal;
    let Mineral:any = Game.getObjectById(creep.room.memory.mineral)
    let MineralType = Mineral.mineralType;
    if(storage.store[MineralType] > 10000 && terminal.store.getFreeCapacity() > 200 && creep.store[RESOURCE_ENERGY] == 0 && creep.store[MineralType] == 0) {
        if(creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, MineralType);
            if(!creep.pos.isNearTo(terminal)) {
                creep.moveTo(terminal);
            }
        }
        else {
            creep.moveTo(storage, {ignoreRoads:true});
        }
    }
    else if(terminal.store.getFreeCapacity() > 200 && creep.store.getFreeCapacity() == 0) {
        if(creep.pos.isNearTo(terminal)) {
            creep.transfer(terminal, MineralType);
            if(!creep.pos.isNearTo(storage)) {
                creep.moveTo(storage, {ignoreRoads:true});
            }
        }
        else {
            creep.moveTo(terminal);
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
