function findLockedRepair(creep) {
    if(!creep.memory.allowed_repairs) {
        creep.memory.allowed_repairs = [];
        let roadsInRoom = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_ROAD});

        _.forEach(roadsInRoom, function(road) {
            if(_.includes(creep.room.memory.keepTheseRoads, road.id, 0)) {
                creep.memory.allowed_repairs.push(road.id);
            }
        });

        let nonRoadsInRoom = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType != STRUCTURE_ROAD && building.structureType !== STRUCTURE_WALL && building.structureType !== STRUCTURE_CONTROLLER});
        _.forEach(nonRoadsInRoom, function(building) {
            // if(building.pos.lookFor(LOOK_CREEPS).length != 0) {
            creep.memory.allowed_repairs.push(building.id)
            // }
        });
    }

    if(creep.memory.allowed_repairs.length > 0) {
        let buildingsToRepair = [];
        _.forEach(creep.memory.allowed_repairs, function(building) {
            buildingsToRepair.push(Game.getObjectById(building));
        });
        if(buildingsToRepair.length > 0) {
            let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair)
            if(closestBuildingToRepair && closestBuildingToRepair != null) {
                creep.memory.locked_repair = closestBuildingToRepair.id;
                creep.say("🎯", true);
            }
        }
        return;
    }
    else {
        creep.memory.locked_repair = null;
        return;
    }
}

function findLockedBuild(creep) {
	let buildingsToBuild = creep.room.find(FIND_MY_CONSTRUCTION_SITES);

    if(buildingsToBuild.length > 0) {
		creep.say("🎯", true);
        creep.memory.locked_build = buildingsToBuild[0].id;
        return;
    }
    else {
        creep.memory.locked_build = null;
        return;
    }
}



/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    if(creep.memory.suicide == true) {
        creep.recycle();
        return;
    }


    let fleeStatus = creep.fleeHomeIfInDanger();
    if(fleeStatus == true) {
        return;
    }
    else if(fleeStatus == "in position") {
        creep.memory.suicide = true;
        return;
    }

    if(!creep.memory.working && creep.store.getFreeCapacity() == 0) {
        creep.memory.working = true;
    }
    if(creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.working = false;
    }

    if(creep.memory.working) {
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
                    creep.moveTo(target, {reusePath:25});
                    return;
                }
                if(creep.roadCheck()) {
                    let roadlessLocation = creep.roadlessLocation(target);
                    creep.moveTo(roadlessLocation);
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
                    creep.moveTo(target, {reusePath:25});
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
            if(creep.store.getFreeCapacity() == 0) {
                if(creep.roadCheck()) {
                    let roadlessLocation = creep.roadlessLocation(target);
                    creep.moveTo(roadlessLocation);
                    return;
                }
            }
        }

        if(!creep.memory.locked_build && !creep.memory.locked_repair) {
            findLockedBuild(creep);
            let target = Game.getObjectById(creep.memory.locked_build);
            if(target) {
                if(creep.build(target) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {reusePath:25});
                    return;
                }
            }
        }
        else {
            let target = Game.getObjectById(creep.memory.locked_build);
            if(creep.build(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {reusePath:25});
                return;
            }
            if(creep.store.getFreeCapacity() == 0) {
                if(creep.roadCheck()) {
                    let roadlessLocation = creep.roadlessLocation(target);
                    creep.moveTo(roadlessLocation);
                    return;
                }
            }
        }

        if(!creep.memory.locked_repair && !creep.memory.locked_build && creep.room.name == creep.memory.targetRoom && creep.memory.allowed_repairs.length == 0) {
            creep.memory.suicide = true;
        }
    }

    else {
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
            return creep.moveToRoom(creep.memory.targetRoom, 25, 25, true);
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
