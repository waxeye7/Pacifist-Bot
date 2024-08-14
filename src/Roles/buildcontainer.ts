const run = function (creep):CreepMoveReturnCode | -2 | -5 | -7 | void {

    creep.memory.moving = false;

    if(creep.room.name != creep.memory.targetRoom && !creep.memory.fill) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(creep.room.name !== creep.memory.targetRoom && creep.memory.fill) {
        if(creep.store.getFreeCapacity() !== 0) {
            let storage = creep.room.storage;
            if(storage) {
                let result = creep.withdraw(storage, RESOURCE_ENERGY);
                if(result == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(storage,1);
                }
                else if(result === 0) {
                    creep.memory.fill = false;
                }
            }
            else {
                creep.memory.fill = false;
            }
        }
    }

    if(creep.memory.fleeing) {
        // find hostiles with attack or ranged attack
        let hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        let meleeHostiles = hostiles.filter(c => c.getActiveBodyparts(ATTACK) > 0 );
        let rangedHostiles = hostiles.filter(c => c.getActiveBodyparts(RANGED_ATTACK) > 0 );
        if(rangedHostiles.length) {
            let closestRangedHostile = creep.pos.findClosestByRange(rangedHostiles);
            if(creep.pos.getRangeTo(closestRangedHostile) <= 5) {
                return;
            }
        }
        else if(meleeHostiles.length) {
            let closestMeleeHostile = creep.pos.findClosestByRange(meleeHostiles);
            if(creep.pos.getRangeTo(closestMeleeHostile) <= 3) {
                return;
            }
        }
    }
    else if(!creep.memory.danger) {
        creep.memory.fleeing = false;
    }

    let targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    let closestTarget = creep.pos.findClosestByRange(targets);
    if(closestTarget && closestTarget.structureType === STRUCTURE_SPAWN && creep.pos.isEqualTo(closestTarget.pos)) {
        creep.move(TOP);creep.move(BOTTOM);creep.move(LEFT);creep.move(RIGHT);
    }
    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();


    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.source = false;
        creep.memory.building = false;
    }
    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
        creep.memory.building = true;
    }
    if(creep.memory.building) {
        if(creep.room.controller && creep.room.controller.level !== 8) {
            if(creep.pos.getRangeTo(creep.room.controller) <= 3) {
                creep.upgradeController(creep.room.controller);
            }
            if(!creep.room.controller.upgradeBlocked && (creep.room.controller.level == 1 || creep.room.controller.level == 2 && creep.room.controller.ticksToDowngrade < 6000 || creep.room.controller.level == 3 && creep.room.controller.ticksToDowngrade < 9000 || creep.room.controller.level == 4 && creep.room.controller.ticksToDowngrade < 15000 || creep.room.controller.level == 5 && creep.room.controller.ticksToDowngrade < 16000 || creep.room.controller.level == 6 && creep.room.controller.ticksToDowngrade < 25000 || creep.room.controller.level == 7 && creep.room.controller.ticksToDowngrade < 34000 || creep.room.controller.level == 8 && creep.room.controller.ticksToDowngrade < 43000)) {
                creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
                return;
            }

        }
        // if(creep.room.controller && (creep.room.controller.level == 1 || creep.room.controller.level == 2 && creep.room.controller.ticksToDowngrade < 9000 || creep.room.controller.level == 3 && creep.room.controller.ticksToDowngrade < 18000 || creep.room.controller.level == 4 && creep.room.controller.ticksToDowngrade < 27000 || creep.room.controller.level == 5 && creep.room.controller.ticksToDowngrade < 36000 || creep.room.controller.level == 6 && creep.room.controller.ticksToDowngrade < 45000 || creep.room.controller.level == 7 && creep.room.controller.ticksToDowngrade < 54000 || creep.room.controller.level == 8 && creep.room.controller.ticksToDowngrade < 63000)) {
        //     if(creep.pos.getRangeTo(creep.room.controller) <= 3) {
        //         creep.upgradeController(creep.room.controller);
        //     }
        //     if(creep.room.controller.level == 1 || creep.room.controller.level == 2 && creep.room.controller.ticksToDowngrade < 6000 || creep.room.controller.level == 3 && creep.room.controller.ticksToDowngrade < 9000 || creep.room.controller.level == 4 && creep.room.controller.ticksToDowngrade < 15000 || creep.room.controller.level == 5 && creep.room.controller.ticksToDowngrade < 16000 || creep.room.controller.level == 6 && creep.room.controller.ticksToDowngrade < 25000 || creep.room.controller.level == 7 && creep.room.controller.ticksToDowngrade < 34000 || creep.room.controller.level == 8 && creep.room.controller.ticksToDowngrade < 43000) {
        //         creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
        //         return;
        //     }

        // }

        let mySpawns = creep.room.find(FIND_MY_SPAWNS)
        if(Game.time % 25 == 0 && Memory.target_colonise && creep.room.find(FIND_MY_CONSTRUCTION_SITES).length == 0 && mySpawns.length == 0 && creep.room.name === Memory.target_colonise.room) {
            let location = new RoomPosition(Memory.target_colonise.spawn_pos.x, Memory.target_colonise.spawn_pos.y, creep.room.name);
            location.createConstructionSite(STRUCTURE_SPAWN);
        }

        if(mySpawns.length == 1) {
            if(mySpawns[0].store.getFreeCapacity() !== 0) {
                if(creep.pos.isNearTo(mySpawns[0])) {
                    creep.transfer(mySpawns[0], RESOURCE_ENERGY);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(mySpawns[0], 1);
                }
            }

            let location = new RoomPosition(Memory.target_colonise.spawn_pos.x, Memory.target_colonise.spawn_pos.y, creep.room.name);
            let lookForBuildings = location.lookFor(LOOK_STRUCTURES);
            if(lookForBuildings.length > 0) {
                for(let building of lookForBuildings) {
                    if(building.structureType == STRUCTURE_RAMPART && (building.hits < building.hitsMax - 5000 && building.hits < 1500000)) {
                        creep.repair(building)
                        return;
                    }
                }
            }
            location.createConstructionSite(STRUCTURE_RAMPART);
        }

        if(targets.length > 0) {
            if(creep.build(closestTarget) == ERR_NOT_IN_RANGE) {
                creep.MoveCostMatrixRoadPrio(closestTarget, 3);
            }
            return
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
                return;
            }
        }
    }
    if(!creep.memory.building) {
        if(creep.room.storage) {
            if(creep.room.storage.store[RESOURCE_ENERGY] >= creep.store.getFreeCapacity()) {
                if(creep.withdraw(creep.room.storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(creep.room.storage, 1);
                }
                return;
            }
        }
        let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: r => r.resourceType == RESOURCE_ENERGY && (r.amount >= 300 && creep.pos.getRangeTo(r) <= 20 || r.amount >= 50 && creep.pos.getRangeTo(r) < 3)});
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
            let result = creep.harvestEnergy();
            if(result == -6 || result == -11)  {
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
