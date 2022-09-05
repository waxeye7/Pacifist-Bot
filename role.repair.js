/**
 * A little description of this function 
 * @param {Creep} creep
 **/

function findLocked(creep) {
    const buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD});
    const buildingsToRepair30mil = _.filter(buildingsToRepair300mil, (building) => building.hits < building.hitsMax && building.hits < 30000000);
    const buildingsToRepair10mil = _.filter(buildingsToRepair30mil, (building) => building.hits < building.hitsMax && building.hits < 10000000);
    const buildingsToRepair3mil = _.filter(buildingsToRepair10mil, (building) => building.hits < building.hitsMax && building.hits < 3000000);
    const buildingsToRepair1mil = _.filter(buildingsToRepair3mil, (building) => building.hits < building.hitsMax && building.hits < 1000000);

    if(buildingsToRepair1mil.length > 0) {
        buildingsToRepair1mil.sort((a,b) => a.hits - b.hits);
        return buildingsToRepair1mil[0];
    }
    else if(buildingsToRepair3mil.length > 0) {
        buildingsToRepair3mil.sort((a,b) => a.hits - b.hits);
        return buildingsToRepair3mil[0];
    }
    else if(buildingsToRepair10mil.length > 0) {
        buildingsToRepair10mil.sort((a,b) => a.hits - b.hits);
        return buildingsToRepair10mil[0];
    }
    else if(buildingsToRepair30mil.length > 0) {
        buildingsToRepair30mil.sort((a,b) => a.hits - b.hits);
        return buildingsToRepair30mil[0];
    }
    else if(buildingsToRepair300mil.length > 0) {
        buildingsToRepair300mil.sort((a,b) => a.hits - b.hits);
        return buildingsToRepair300mil[0];
    }
}



 const run = function (creep) {
    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    // if(creep.fatigue > 0) {
    //     console.log('hi')
    //     creep.room.createConstructionSite(creep.pos, STRUCTURE_ROAD);
    // }

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
                creep.moveTo(repairTarget);
            }
        }

    }

    else if(!creep.memory.repairing && storage) {
        if(creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, RESOURCE_ENERGY);
        }
        else {
            creep.moveTo(storage);
        }
        return;
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