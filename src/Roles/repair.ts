/**
 * A little description of this function
 * @param {Creep} creep
 **/
function findLocked(creep, storage) {
    let nukes = creep.room.find(FIND_NUKES);
    let nukeBOOL = false;
    if(nukes.length > 0) {
        nukeBOOL = true;
    }

    let buildingsToRepair300mil;

    if(creep.room.controller.level >= 6) {
        // if(creep.room.memory.danger) {
        //     buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER && storage && building.pos.getRangeTo(storage) <= 10 && building.pos.getRangeTo(storage) > 6});
        // }
        // else {
            buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER && storage && building.pos.getRangeTo(storage) > 6 && (building.structureType !== STRUCTURE_WALL || building.structureType == STRUCTURE_WALL && building.hits <= 50050000)});
        // }
    }
    else if(creep.room.controller.level > 2) {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits + 1000 < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER});
    }
    else {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits + 1000 < building.hitsMax && building.hits < 300000000});
    }


    if(nukeBOOL) {
        if(creep.room.controller.level >= 6) {

            let important_structures = creep.room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_STORAGE || s.structureType == STRUCTURE_TERMINAL || s.structureType == STRUCTURE_FACTORY || s.structureType == STRUCTURE_LAB || s.structureType === STRUCTURE_NUKER || s.structureType === STRUCTURE_POWER_SPAWN});

            for(let nuke of nukes) {
                for(let s of important_structures) {
                    if(nuke.pos.getRangeTo(s) <= 2) {
                        s.pos.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }
            }

            let ramparts_on_important_structures = []

            for(let structure of important_structures) {
                let lookForStructs = structure.pos.lookFor(LOOK_STRUCTURES);
                for(let buildingOnHere of lookForStructs) {
                    if(buildingOnHere.structureType == STRUCTURE_RAMPART) {
                        ramparts_on_important_structures.push(buildingOnHere);
                    }
                }
            }

            let important_structures_data = []
            for(let important_rampart of ramparts_on_important_structures) {
                important_structures_data.push([important_rampart, important_rampart.hits])
            }

            for(let nuke of nukes) {
                for(let building_data of important_structures_data) {
                    if(nuke.pos.x == building_data[0].pos.x && nuke.pos.y == building_data[0].pos.y) {
                        building_data[1] -= 10000000;
                    }
                    else if(nuke.pos.getRangeTo(building_data[0]) <= 2) {
                        building_data[1] -= 5000000;
                    }
                }
            }

            for(let data of important_structures_data) {
                if(data[1] < 175000) {
                    creep.say("🎯", true);
                    creep.memory.locked = data[0].id;
                    creep.room.memory.NukeRepair = true;
                    return data[0].id;
                }
            }


        }

        creep.room.memory.NukeRepair = false;

    }


    if(buildingsToRepair300mil.length > 0) {
        if(creep.room.controller && creep.room.controller.level <= 3) {
            let closestToRepair = creep.pos.findClosestByRange(buildingsToRepair300mil);
            creep.say("🎯", true);
            creep.memory.locked = closestToRepair.id;
            return closestToRepair.id;
        }
        else {
            buildingsToRepair300mil.sort((a,b) => a.hits - b.hits);
            creep.say("🎯", true);
            creep.memory.locked = buildingsToRepair300mil[0].id;
            return buildingsToRepair300mil[0].id;
        }

    }
    else {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000});
        if(buildingsToRepair300mil.length > 0) {
            buildingsToRepair300mil.sort((a,b) => a.hits - b.hits);
            creep.say("🎯", true);
            creep.memory.locked = buildingsToRepair300mil[0].id;
            return buildingsToRepair300mil[0].id;
        }
    }
}

 const run = function (creep) {
    creep.memory.moving = false;

    if(Game.cpu.bucket < 10)return;
    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    if(creep.evacuate()) {
		return;
	}
    // console.log(_.keys(creep.store).length)
    if(creep.memory.homeRoom && creep.memory.homeRoom != creep.room.name) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
    }

    // if(creep.room.controller && creep.room.controller.level >= 6 && creep.room.memory.danger && creep.room.memory.labs && Object.keys(creep.room.memory.labs).length >= 4 &&
    //     creep.ticksToLive >= 1480 && creep.body[creep.body.length-3].boost == undefined) {
    //     let outputLab:any = Game.getObjectById(creep.room.memory.labs.outputLab);
    //     let boostLab;
    //     if(creep.room.memory.labs.boostLab) {
    //         boostLab = Game.getObjectById(creep.room.memory.labs.boostLab);
    //     }
    //     if(outputLab && outputLab.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] >= 30) {
    //         if(creep.pos.isNearTo(outputLab)) {
    //             outputLab.boostCreep(creep);
    //         }
    //         else {
    //             creep.moveTo(outputLab);
    //         }
    //         return;
    //     }
    //     else if(boostLab && boostLab.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] >= 30) {
    //         if(creep.pos.isNearTo(boostLab)) {
    //             boostLab.boostCreep(creep);
    //         }
    //         else {
    //             creep.moveTo(boostLab);
    //         }
    //         return;
    //     }
    // }

    // if(creep.memory.targetRoom) {

    // }
    // const start = Game.cpu.getUsed()

    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    if(creep.room.controller.level == 4 && !storage && creep.room.find(FIND_MY_CREEPS).length < 8) {
        creep.memory.role = "builder";
        creep.memory.locked = false;
    }


    if(creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.repairing = false;
        if(creep.room.memory.danger || creep.room.memory.defence.nuke || Game.time % 17 === 0) {
            creep.memory.locked = false;
        }
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }


    if(creep.ticksToLive <= 74 && (!creep.memory.repairing || _.keys(creep.store).length == 0)) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide) {
		creep.recycle();
        return;
	}

    if(creep.memory.repairing) {
        let repairTarget:any = Game.getObjectById(creep.memory.locked);

        if(!repairTarget) {
            creep.memory.locked = findLocked(creep, storage);
        }
        else if(repairTarget && repairTarget.hits == repairTarget.hitsMax) {
            creep.memory.locked = findLocked(creep, storage);
        }

        if(!creep.memory.locked) {
            let rampart = creep.room.memory.rampart;
            let HostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
            if(rampart && HostileCreeps.length > 0 && rampart.pos.getRangeTo(rampart.pos.findClosestByRange(HostileCreeps)) <= 2) {
                creep.memory.locked = findLocked(creep, storage);
            }
        }


        if(creep.memory.locked) {
            let repairTarget = Game.getObjectById(creep.memory.locked);
            let result = creep.repair(repairTarget)
            if(result == ERR_NOT_IN_RANGE) {
                creep.MoveCostMatrixRoadPrio(repairTarget, 3)
                creep.memory.moving = false;
            }
            else {
                if(creep.store.getFreeCapacity() <= 50) {
                    if(creep.roadCheck()) {
                        let roadlessLocation = creep.roadlessLocation(repairTarget);
                        creep.moveTo(roadlessLocation);
                    }
                }
                if(creep.store.getFreeCapacity() < 100 && creep.store.getFreeCapacity() > 50 && creep.roadCheck()) {
                    creep.moveAwayIfNeedTo();
                }
            }
        }

    }

    if(!creep.memory.repairing && !creep.room.memory.danger && creep.room.memory.Structures && creep.room.memory.Structures.towers) {
        let towers = [];
        for(let towerID of creep.room.memory.Structures.towers) {
            let tower:any = Game.getObjectById(towerID);
            if(tower && tower.store[RESOURCE_ENERGY] >= creep.store.getFreeCapacity() && creep.pos.getRangeTo(tower) <= 6) {
                towers.push(tower);
            }
        }
        if(towers.length > 0) {
            let closestTower = creep.pos.findClosestByRange(towers);
            if(creep.pos.isNearTo(closestTower)) {
                creep.withdraw(closestTower, RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestTower, 1);
            }
            if(creep.pos.getRangeTo(storage) > creep.pos.getRangeTo(closestTower)) {
                return;
            }
        }
    }

    if(!creep.memory.repairing && creep.room.memory.Structures && creep.room.memory.Structures.controllerLink) {
        let controllerLink = <StructureLink> Game.getObjectById(creep.room.memory.Structures.controllerLink);
        if(controllerLink && controllerLink.store[RESOURCE_ENERGY] >= creep.store.getFreeCapacity() /2 && creep.pos.getRangeTo(controllerLink) <= 4) {
            if(creep.pos.isNearTo(controllerLink)) {
                if(creep.withdraw(controllerLink, RESOURCE_ENERGY) === 0) {
                    creep.memory.full = true;
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(controllerLink, 1);
            }
            if(creep.pos.getRangeTo(storage) > creep.pos.getRangeTo(controllerLink)) {
                return;
            }
        }
    }

    if(!creep.memory.repairing && storage) {
        let result = creep.withdrawStorage(storage);
		if(result == 0) {
			if(!creep.memory.locked) {
				creep.memory.locked = findLocked(creep, storage);
			}
			if(creep.memory.locked) {
				let repairTarget = Game.getObjectById(creep.memory.locked);
				creep.MoveCostMatrixRoadPrio(repairTarget, 3)
			}
		}
    }

    else if(!creep.memory.repairing) {
        let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
		if(result == 0) {
			if(!creep.memory.locked) {
				creep.memory.locked = findLocked(creep, storage);
			}
			if(creep.memory.locked) {
				let repairTarget = Game.getObjectById(creep.memory.locked);
				creep.MoveCostMatrixRoadPrio(repairTarget, 3)
			}
		}
    }

    if(creep.pos.isNearTo(storage) && creep.getActiveBodyparts(WORK) >= creep.store[RESOURCE_ENERGY])  {
        if(creep.ticksToLive > 3) {
            if(creep.ticksToLive % 250 == 0) {
                creep.memory.locked = false;
            }
            creep.withdraw(storage, RESOURCE_ENERGY);
        }
        if(creep.getActiveBodyparts(WORK) == 45 && creep.pos.x == storage.pos.x && creep.pos.y == storage.pos.y + 1) {
            if(creep.move(RIGHT) == 0) {
                return;
            }
            else if(creep.move(TOP_RIGHT) == 0) {
                return;
            }
            else if(creep.move(TOP_LEFT) == 0) {
                return;
            }
        }
        else if(creep.getActiveBodyparts(WORK) == 45 && creep.pos.x == storage.pos.x - 1 && creep.pos.y == storage.pos.y + 1) {
            if(creep.move(TOP) == 0) {
                return;
            }
        }
    }
}

const roleRepair = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRepair;




        // const buildingsToRepair1mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 1000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair3mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 3000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair10mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 10000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair30mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 30000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 300000000 && object.structureType !== STRUCTURE_ROAD});
