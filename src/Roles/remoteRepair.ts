function findLockedRepair(creep) {
    if(!creep.memory.allowed_repairs) {
        creep.memory.allowed_repairs = [];

        let roadsInRoom = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_ROAD});
        _.forEach(roadsInRoom, function(road) {
            if(_.includes(creep.room.memory.keepTheseRoads, road.id, 0)) {
                creep.memory.allowed_repairs.push(road.id);
            }
        });
        let sources = creep.room.find(FIND_SOURCES);
        let nonRoadsInRoom = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType != STRUCTURE_ROAD && building.structureType !== STRUCTURE_WALL && building.structureType !== STRUCTURE_CONTROLLER && building.structureType !== STRUCTURE_RAMPART});
        _.forEach(nonRoadsInRoom, function(building) {
            // if(building.pos.lookFor(LOOK_CREEPS).length != 0) {
            if(building.structureType == STRUCTURE_CONTAINER) {
                if(sources.length > 0) {
                    let isNearToSource = creep.pos.isNearTo(creep.pos.findClosestByRange(sources));
                    if(isNearToSource) {
                        creep.memory.allowed_repairs.push(building.id)
                    }
                }
            }
            else {
                creep.memory.allowed_repairs.push(building.id)
            }
            // }
        });
    }

    if(creep.memory.allowed_repairs.length > 0) {
        let buildingsToRepair = [];
        _.forEach(creep.memory.allowed_repairs, function(building) {
            let buildingObj = Game.getObjectById(building);
            if(buildingObj) {
                buildingsToRepair.push(buildingObj);
            }
        });
        if(buildingsToRepair.length > 0) {
            let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair)
            if(closestBuildingToRepair && closestBuildingToRepair !== null) {
                creep.memory.locked_repair = closestBuildingToRepair.id;
                creep.say("🎯", true);
            }
        }
        else {
            creep.memory.locked_repair = null;
            creep.say("❌ REPAIR", true);
        }
    }
    else {
        creep.memory.locked_repair = null;
        creep.say("❌ REPAIR", true);
    }
}

function findLockedBuild(creep) {
	let buildingsToBuild = creep.room.find(FIND_MY_CONSTRUCTION_SITES);

    if(buildingsToBuild.length > 0) {
		creep.say("🎯", true);
        let closestBuildingToBuild = creep.pos.findClosestByRange(buildingsToBuild);
        creep.memory.locked_build = closestBuildingToBuild.id;
    }
    else {
        creep.memory.locked_build = null;
        creep.say("❌ BUILD", true);
    }
}



/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.suicide == true) {

        if(Game.time % 7 == 0 && creep.room.name != creep.memory.homeRoom && creep.room.find(FIND_CONSTRUCTION_SITES).length > 0) {
            creep.memory.targetRoom = creep.room.name;
            creep.memory.suicide = false;
            return;
        }

        creep.recycle();
        return;
    }
    if(creep.fleeHomeIfInDanger() == "timeOut") {
        return;
    }


    if(!creep.memory.working && creep.store.getFreeCapacity() == 0) {
        creep.memory.working = true;
    }
    if(creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.working = false;
    }

    if(creep.memory.working) {

        if(!creep.memory.myTargetRoomServiced && creep.room.name !== creep.memory.targetRoom) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        }

        if(creep.memory.locked_build) {
            let buildTarget:any = Game.getObjectById(creep.memory.locked_build);
            if(!buildTarget) {
                creep.memory.locked_build = null;
            }
        }
        if(creep.memory.locked_repair) {
            let repairTarget:any = Game.getObjectById(creep.memory.locked_repair);
            if(!repairTarget || repairTarget.hits == repairTarget.hitsMax) {
                creep.memory.locked_repair = null;
            }
        }


        if(!creep.memory.locked_repair) {
            findLockedRepair(creep);
            let target:any = Game.getObjectById(creep.memory.locked_repair);
            if(target && target.hits < target.hitsMax) {
                if(creep.repair(target) == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(target, 3)
                    return;
                }
            }
            else if(target && target.hits == target.hitsMax) {
                let index = creep.memory.allowed_repairs.indexOf(target.id);
                creep.memory.allowed_repairs.splice(index,1);
                creep.memory.locked_repair = null;
            }
        }
        else if(creep.memory.locked_repair) {
            let target:any = Game.getObjectById(creep.memory.locked_repair);
            if(target && target.hits < target.hitsMax) {
                if(creep.repair(target) == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(target, 3)
                    return;
                }
                else if(creep.repair(target) == 0) {
                    return;
                }
            }
            else if(target && target.hits == target.hitsMax) {
                let index = creep.memory.allowed_repairs.indexOf(target.id);
                creep.memory.allowed_repairs.splice(index,1);
                creep.memory.locked_repair = null;
            }
        }

        if(!creep.memory.locked_build && !creep.memory.locked_repair) {
            findLockedBuild(creep);
            let target = Game.getObjectById(creep.memory.locked_build);
            if(target) {
                if(creep.build(target) == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(target, 3);
                    return;
                }
            }
        }
        else if(creep.memory.locked_build) {
            let target = Game.getObjectById(creep.memory.locked_build);
            if(target && creep.build(target) == ERR_NOT_IN_RANGE) {
                creep.MoveCostMatrixRoadPrio(target, 3)
                return;
            }
        }


        if(!creep.memory.locked_repair && !creep.memory.locked_build && creep.room.name == creep.memory.targetRoom && creep.memory.allowed_repairs.length == 0) {
            creep.memory.myTargetRoomServiced = true;
        }

        if(!creep.memory.locked_repair && !creep.memory.locked_build && creep.room.name == creep.memory.homeRoom && creep.memory.allowed_repairs.length == 0) {
            creep.memory.suicide = true;
        }

        if(creep.memory.myTargetRoomServiced && !creep.memory.locked_repair && !creep.memory.locked_build && creep.memory.allowed_repairs.length == 0) {
            // if(creep.room.name !== creep.memory.homeRoom && creep.room.name !== creep.memory.targetRoom) {

            // }
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom)
        }
    }

    else {
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {

            // idea to make them build up a room they're not in
            // if(Game.time % 7 == 0 && creep.room.name != creep.memory.homeRoom && creep.room.find(FIND_CONSTRUCTION_SITES).length > 0) {
            //     creep.memory.targetRoom = creep.room.name;
            // }


            return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom)
        }
        creep.acquireEnergyWithContainersAndOrDroppedEnergy();
    }
}

const roleRemoteRepair = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRemoteRepair;
