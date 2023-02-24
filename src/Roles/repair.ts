/**
 * A little description of this function
 * @param {Creep} creep
 **/
function findLocked(creep, storage) {

    // if(creep.room.memory.danger) {
    //     let target:any = Game.getObjectById(creep.memory.locked);
    //     if(creep.room.memory.rampartToMan && !target || creep.room.memory.rampartToMan && target && target.hits < 1000000) {
    //         let rampart:any = Game.getObjectById(creep.room.memory.rampartToMan);
    //         let RampartsNearRampartToMan = rampart.pos.findInRange(FIND_MY_STRUCTURES, {filter: (building) => {return (building.structureType == STRUCTURE_RAMPART);}}, 5);
    //         if(RampartsNearRampartToMan.length > 0) {
    //             RampartsNearRampartToMan.sort((a,b) => a.hits - b.hits);
    //             creep.memory.locked = RampartsNearRampartToMan[0].id;
    //             return RampartsNearRampartToMan[0].id;
    //         }
    //     }
    // }

    let nukes = creep.room.find(FIND_NUKES);
    let nukeBOOL = false;
    if(nukes.length > 0) {
        nukeBOOL = true;
    }

    let buildingsToRepair300mil;

    if(creep.room.controller.level >= 6) {
        if(creep.room.memory.danger) {
            buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER && storage && building.pos.getRangeTo(storage) <= 10});
        }
        else {
            buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER && (building.structureType !== STRUCTURE_WALL || building.structureType == STRUCTURE_WALL && building.hits <= 1050000)});
        }
    }
    else if(creep.room.controller.level > 2) {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits + 1000 < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER});
    }
    else {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits + 1000 < building.hitsMax && building.hits < 300000000});
    }


    if(nukeBOOL) {
        if(creep.room.controller.level >= 6) {

            let important_structures = creep.room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_STORAGE || s.structureType == STRUCTURE_TERMINAL || s.structureType == STRUCTURE_FACTORY || s.structureType == STRUCTURE_LAB});

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
                if(data[1] <= 600000) {
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
        creep.memory.locked = false;
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }

    if(creep.memory.repairing) {
        let repairTarget:any = Game.getObjectById(creep.memory.locked);
//  && creep.pos.getRangeTo(creep.pos.findClosestByRange(creep.room.find(FIND_HOSTILE_CREEPS))) <= 5

        // flee to away to realign repair range 3 away so cant be hit by ranged attackers

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

                // let lookForExistingStructures = creep.pos.lookFor(LOOK_STRUCTURES);
                // if(lookForExistingStructures.length > 0 && lookForExistingStructures[0].hits < lookForExistingStructures[0].hitsMax) {
                //     creep.repair(lookForExistingStructures[0]);
                // }

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

    else if(!creep.memory.repairing && storage) {
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

    else {
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

	if(creep.ticksToLive <= 74 && (!creep.memory.repairing || _.keys(creep.store).length == 0)) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}
    // console.log('Repair Ran in', Game.cpu.getUsed() - start, 'ms')
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
