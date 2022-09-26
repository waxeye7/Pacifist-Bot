function findLockedRepair(creep) {
    let buildingsToRepair = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_WALL});

    if(buildingsToRepair.length > 0) {
        let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
        creep.say("🎯", true);
        creep.memory.locked_repair = closestBuildingToRepair.id;
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
    if(!creep.memory.working && creep.store.getFreeCapacity() == 0) {
        creep.memory.working = true;
    }
    if(creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.working = false;
    }

    if(creep.room.name != creep.memory.homeRoom && Memory.tasks.wipeRooms.killCreeps.includes(creep.room.name) && creep.room.memory.has_hostile_creeps) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
    }


    if(creep.memory.working) {

        if(creep.memory.locked_repair) {
            let repairTarget = Game.getObjectById(creep.memory.locked_repair);
            if(!repairTarget || repairTarget.hits == repairTarget.hitsMax) {
                creep.memory.locked_repair = null;
            }
        }
        if(creep.memory.locked_build) {
            let buildTarget = Game.getObjectById(creep.memory.locked_build);
            if(!buildTarget) {
                creep.memory.locked_build = null;
            }
        }

        if(!creep.memory.locked_repair) {
            findLockedRepair(creep);
            let target = Game.getObjectById(creep.memory.locked_repair);
            if(creep.repair(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {reusePath:25});
                return;
            }
        }
        else {
            let target = Game.getObjectById(creep.memory.locked_repair);
            if(creep.repair(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {reusePath:25});
                return;
            }
            if(creep.store.getFreeCapacity() == 0) {
                if(creep.roadCheck()) {
                    let roadlessLocation = creep.roadlessLocation(target);
                    creep.moveTo(roadlessLocation);
                }
            }
        }

        if(!creep.memory.locked_build && !creep.memory.locked_repair) {
            findLockedBuild(creep);
            let target = Game.getObjectById(creep.memory.locked_build);
            if(creep.build(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {reusePath:25});
                return;
            }
        }
        else if(creep.memory.locked_build && !creep.memory.locked_repair) {
            let target = Game.getObjectById(creep.memory.locked_build);
            if(creep.build(target) == ERR_NOT_IN_RANGE) {
                creep.moveTo(target, {reusePath:25});
                return;
            }
            if(creep.store.getFreeCapacity() == 0) {
                if(creep.roadCheck()) {
                    let roadlessLocation = creep.roadlessLocation(target);
                    creep.moveTo(roadlessLocation);
                }
            }
        }


    }

    else {
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
            return creep.moveToRoom(creep.memory.targetRoom);
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

module.exports = roleRemoteRepair;