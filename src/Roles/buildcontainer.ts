const run = function (creep):CreepMoveReturnCode | -2 | -5 | -7 | void {

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
    }

    else {
        let targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
        let closestTarget = creep.pos.findClosestByRange(targets);
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();


        if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
        }
        if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
            creep.memory.building = true;
            creep.moveTo(closestTarget);
        }
        if(creep.memory.building) {
            if(targets.length > 0) {
                if(creep.build(closestTarget) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestTarget, {visualizePathStyle: {stroke: '#000'}});
                }
            }
            else {
                const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {
                    filter: object => object.hits < object.hitsMax && object.structureType != STRUCTURE_WALL
                });

                buildingsToRepair.sort((a,b) => a.hits - b.hits);
                if(buildingsToRepair.length > 0) {
                    let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
                    if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(closestBuildingToRepair);
                    }
                }
            }
        }
        else {
            if(storage) {
                if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
            else {
                if(creep.harvestEnergy() == -6 || creep.harvestEnergy() == -11)  {
                    creep.acquireEnergyWithContainersAndOrDroppedEnergy();
                }
            }
        }
    }
}

const roleBuildContainer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleBuildContainer;
