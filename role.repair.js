/**
 * A little description of this function 
 * @param {Creep} creep
 **/

function findLocked(creep) {
    let buildingsToRepair300mil;

    if(creep.room.controller.level > 4) {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD});
    }
    else {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_WALL});
    }

    if(buildingsToRepair300mil.length > 0) {
        buildingsToRepair300mil.sort((a,b) => a.hits - b.hits);
        return buildingsToRepair300mil[0];
    }
}

 const run = function (creep) {
    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    if(creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.repairing = false;
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }

    if(creep.memory.repairing) {
        if(creep.memory.locked && creep.memory.locked != false) {
            let repairTarget = Game.getObjectById(creep.memory.locked.id);
            if(repairTarget.hits == repairTarget.hitsMax) {
                creep.memory.locked = false;
            }
        }

        if(!creep.memory.locked) {
            creep.memory.locked = findLocked(creep);
        }


        if(creep.memory.locked && creep.memory.locked != false) {
            let repairTarget = Game.getObjectById(creep.memory.locked.id);
            if(creep.repair(repairTarget) == ERR_NOT_IN_RANGE) {
                creep.moveTo(repairTarget, {reusePath:20});
            }
        }

    }

    else if(!creep.memory.repairing && storage) {
        if(creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, RESOURCE_ENERGY);
        }
        else {
            creep.moveTo(storage, {reusePath:20});
        }
    }

    else {
        creep.acquireEnergyWithContainersAndOrDroppedEnergy();
    }

}

const roleRepair = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleRepair;




        // const buildingsToRepair1mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 1000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair3mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 3000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair10mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 10000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair30mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 30000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 300000000 && object.structureType !== STRUCTURE_ROAD});