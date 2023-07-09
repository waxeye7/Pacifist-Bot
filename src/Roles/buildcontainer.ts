const run = function (creep):CreepMoveReturnCode | -2 | -5 | -7 | void {
    ;

    creep.memory.moving = false;

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    let targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    let closestTarget = creep.pos.findClosestByRange(targets);
    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();


    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.source = false;
        creep.memory.building = false;
    }
    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
        creep.memory.building = true;
    }
    if(creep.memory.building) {
        if(creep.room.controller && (creep.room.controller.level == 1 || creep.room.controller.level == 2 && creep.room.controller.ticksToDowngrade < 9000 || creep.room.controller.level == 3 && creep.room.controller.ticksToDowngrade < 18000 || creep.room.controller.level == 4 && creep.room.controller.ticksToDowngrade < 27000 || creep.room.controller.level == 5 && creep.room.controller.ticksToDowngrade < 36000 || creep.room.controller.level == 6 && creep.room.controller.ticksToDowngrade < 45000 || creep.room.controller.level == 7 && creep.room.controller.ticksToDowngrade < 54000 || creep.room.controller.level == 8 && creep.room.controller.ticksToDowngrade < 63000)) {
            if(creep.pos.getRangeTo(creep.room.controller) <= 3) {
                creep.upgradeController(creep.room.controller);
            }
            else {
                creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
            }
        }
        else if(targets.length > 0) {
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
        let mySpawns = creep.room.find(FIND_MY_SPAWNS)
        if(Game.time % 25 == 0 && creep.room.find(FIND_MY_CONSTRUCTION_SITES).length == 0 && mySpawns.length == 0) {
            let location = new RoomPosition(Memory.target_colonise.spawn_pos.x, Memory.target_colonise.spawn_pos.y, creep.room.name);
            location.createConstructionSite(STRUCTURE_SPAWN);
        }

        if(mySpawns.length == 1) {
            if(creep.pos.isNearTo(mySpawns[0])) {
                creep.transfer(mySpawns[0], RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixRoadPrio(mySpawns[0], 1);
            }
            let location = new RoomPosition(Memory.target_colonise.spawn_pos.x, Memory.target_colonise.spawn_pos.y, creep.room.name);
            let lookForBuildings = location.lookFor(LOOK_STRUCTURES);
            if(lookForBuildings.length > 0) {
                for(let building of lookForBuildings) {
                    if(building.structureType == STRUCTURE_RAMPART) {
                        creep.repair(building)
                    }
                }
            }
            location.createConstructionSite(STRUCTURE_RAMPART);
        }
    }
    if(!creep.memory.building) {
        let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: r => r.resourceType == RESOURCE_ENERGY && r.amount > 300});
        if(droppedResources.length > 0) {
            droppedResources.sort((a,b) => b.amount - a.amount);
            if(creep.pos.isNearTo(droppedResources[0])) {
                creep.pickup(droppedResources[0]);
            }
            else {
                creep.MoveCostMatrixRoadPrio(droppedResources[0], 1);
            }
            return;
        }
        let tombstones = creep.room.find(FIND_TOMBSTONES, {filter: t => t.store[RESOURCE_ENERGY] > 20});
        if(tombstones.length > 0) {
            tombstones.sort((a,b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
            if(creep.pos.isNearTo(tombstones[0])) {
                creep.withdraw(tombstones[0],RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixRoadPrio(tombstones[0], 1);
            }
            return;
        }
        let ruins = creep.room.find(FIND_RUINS, {filter: r => r.store[RESOURCE_ENERGY] > 0});
        if(ruins.length > 0) {
            let closestRuin = creep.pos.findClosestByRange(ruins);
            if(creep.pos.isNearTo(closestRuin)) {
                creep.withdraw(closestRuin,RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestRuin, 1);
            }
            return;
        }

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

const roleBuildContainer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleBuildContainer;
