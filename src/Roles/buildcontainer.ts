const run = function (creep):CreepMoveReturnCode | -2 | -5 | -7 | void {
    ;
    creep.memory.moving = false;

    if(creep.room.name != creep.memory.targetRoom) {

        creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);

        // return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
    }

    else {
        let targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
        let closestTarget = creep.pos.findClosestByRange(targets);
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();


        if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.source = false;
            creep.memory.building = false;
        }
        if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
            creep.memory.building = true;
            creep.MoveCostMatrixRoadPrio(closestTarget, 3);
        }
        if(creep.memory.building) {
            if(targets.length > 0) {
                if(creep.build(closestTarget) == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(closestTarget, 3);
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
                        creep.MoveCostMatrixRoadPrio(closestTarget, 3);
                    }
                }
            }
        }
        else {


            let source:any = Game.getObjectById(creep.memory.source);
            if(source && source.energy == 0) {
                creep.memory.source = false;
            }


            if(storage && storage.store[RESOURCE_ENERGY] != 0) {
                let result = creep.withdrawStorage(storage)
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
