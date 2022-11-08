/**
 * A little description of this function
 * @param {Creep} creep
 **/
function findLocked(creep) {

    if(creep.room.memory.danger) {
        let target:any = Game.getObjectById(creep.memory.locked);
        if(creep.room.memory.rampartToMan && !target || creep.room.memory.rampartToMan && target && target.hits < 1000000) {
            let rampart:any = Game.getObjectById(creep.room.memory.rampartToMan);
            let RampartsNearRampartToMan = rampart.pos.findInRange(FIND_MY_STRUCTURES, {filter: (building) => {return (building.structureType == STRUCTURE_RAMPART);}}, 5);
            if(RampartsNearRampartToMan.length > 0) {
                RampartsNearRampartToMan.sort((a,b) => a.hits - b.hits);
                creep.memory.locked = RampartsNearRampartToMan[0].id;
                return RampartsNearRampartToMan[0].id;
            }
        }
    }

    let buildingsToRepair300mil;

    if(creep.room.controller.level >= 6) {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER});
    }
    else if(creep.room.controller.level > 2) {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits + 1000 < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER});
    }
    else {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits + 1000 < building.hitsMax && building.hits < 300000000});
    }

    if(buildingsToRepair300mil.length > 0) {
        buildingsToRepair300mil.sort((a,b) => a.hits - b.hits);
        creep.say("🎯", true);
        creep.memory.locked = buildingsToRepair300mil[0].id;
        return buildingsToRepair300mil[0].id;
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
    creep.Speak();
    // console.log(_.keys(creep.store).length)
    if(creep.memory.homeRoom && creep.memory.homeRoom != creep.room.name) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
    }

    if(creep.room.controller && creep.room.controller.level >= 6 && creep.room.memory.danger && creep.room.memory.labs && Object.keys(creep.room.memory.labs).length >= 4 &&
        creep.ticksToLive >= 1480 && creep.body[creep.body.length-3].boost == undefined) {
        let outputLab:any = Game.getObjectById(creep.room.memory.labs.outputLab);
        let boostLab;
        if(creep.room.memory.labs.boostLab) {
            boostLab = Game.getObjectById(creep.room.memory.labs.boostLab);
        }
        if(outputLab && outputLab.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] >= 30) {
            if(creep.pos.isNearTo(outputLab)) {
                outputLab.boostCreep(creep);
            }
            else {
                creep.moveTo(outputLab);
            }
            return;
        }
        else if(boostLab && boostLab.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] >= 30) {
            if(creep.pos.isNearTo(boostLab)) {
                boostLab.boostCreep(creep);
            }
            else {
                creep.moveTo(boostLab);
            }
            return;
        }
    }

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
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }

    if(creep.memory.repairing) {
        let repairTarget:any = Game.getObjectById(creep.memory.locked);
//  && creep.pos.getRangeTo(creep.pos.findClosestByRange(creep.room.find(FIND_HOSTILE_CREEPS))) <= 5
        if(repairTarget && creep.room.memory.danger && creep.pos.getRangeTo(repairTarget) < 3) {
            let fleeOutOfFire = PathFinder.search(
                creep.pos, {pos:repairTarget.pos, range:3}, {flee: true})

                let pos = fleeOutOfFire.path[0];
                creep.move(creep.pos.getDirectionTo(pos));
                creep.repair(repairTarget)
                return;
            }

        if(repairTarget && creep.room.memory.danger && creep.pos.getRangeTo(repairTarget) <= 5) {
            let rampartsInRoom = creep.room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_RAMPART);}});
            let rampartsInTwoOrLessRange = creep.pos.findInRange(rampartsInRoom, 2);

            if(rampartsInTwoOrLessRange.length) {
                let fleeOutOfFire = PathFinder.search(
                    creep.pos, {pos:rampartsInTwoOrLessRange[0].pos, range:3}, {flee: true, roomCallback: function(roomName){

                        let costs = new PathFinder.CostMatrix;
                        repairTarget.pos.x
                        costs.set(rampartsInTwoOrLessRange[0].pos.x, rampartsInTwoOrLessRange[0].pos.y, 3);
                        costs.set(rampartsInTwoOrLessRange[0].pos.x-1, rampartsInTwoOrLessRange[0].pos.y, 3);
                        costs.set(rampartsInTwoOrLessRange[0].pos.x+1, rampartsInTwoOrLessRange[0].pos.y, 3);
                        costs.set(rampartsInTwoOrLessRange[0].pos.x, rampartsInTwoOrLessRange[0].pos.y-1, 3);
                        costs.set(rampartsInTwoOrLessRange[0].pos.x, rampartsInTwoOrLessRange[0].pos.y+1, 3);
                        costs.set(rampartsInTwoOrLessRange[0].pos.x-1, rampartsInTwoOrLessRange[0].pos.y-1, 3);
                        costs.set(rampartsInTwoOrLessRange[0].pos.x-1, rampartsInTwoOrLessRange[0].pos.y+1, 3);
                        costs.set(rampartsInTwoOrLessRange[0].pos.x+1, rampartsInTwoOrLessRange[0].pos.y-1, 3);

                        costs.set(repairTarget.pos.x, repairTarget.pos.y, 3);
                        costs.set(repairTarget.pos.x-1, repairTarget.pos.y, 3);
                        costs.set(repairTarget.pos.x+1, repairTarget.pos.y, 3);
                        costs.set(repairTarget.pos.x, repairTarget.pos.y-1, 3);
                        costs.set(repairTarget.pos.x, repairTarget.pos.y+1, 3);
                        costs.set(repairTarget.pos.x-1, repairTarget.pos.y-1, 3);
                        costs.set(repairTarget.pos.x-1, repairTarget.pos.y+1, 3);
                        costs.set(repairTarget.pos.x+1, repairTarget.pos.y-1, 3);


                        if(storage) {
                            if(storage.pos.x > creep.pos.x) {
                                costs.set(creep.pos.x+1, creep.pos.y, 3);
                                costs.set(creep.pos.x+1, creep.pos.y+1, 2);
                                costs.set(creep.pos.x+1, creep.pos.y-1, 2);
                            }
                            else if(storage.pos.x < creep.pos.x) {
                                costs.set(creep.pos.x-1, creep.pos.y, 3);
                                costs.set(creep.pos.x-1, creep.pos.y+1, 2);
                                costs.set(creep.pos.x-1, creep.pos.y-1, 2);
                            }

                            if(storage.pos.y > creep.pos.y) {
                                costs.set(creep.pos.x, creep.pos.y+1, 3);
                                costs.set(creep.pos.x-1, creep.pos.y+1, 2);
                                costs.set(creep.pos.x+1, creep.pos.y+1, 2);
                            }
                            else if(storage.pos.y < creep.pos.y) {
                                costs.set(creep.pos.x, creep.pos.y-1, 3);
                                costs.set(creep.pos.x-1, creep.pos.y-1, 2);
                                costs.set(creep.pos.x+1, creep.pos.y-1, 2);
                            }

                            if(storage.pos.x > creep.pos.x && storage.pos.y > creep.pos.y) {
                                costs.set(creep.pos.x+1, creep.pos.y+1, 3);
                            }
                            else if(storage.pos.x < creep.pos.x && storage.pos.y > creep.pos.y) {
                                costs.set(creep.pos.x-1, creep.pos.y+1, 3);
                            }
                            else if(storage.pos.x > creep.pos.x && storage.pos.y < creep.pos.y) {
                                costs.set(creep.pos.x+1, creep.pos.y-1, 3);
                            }
                            else if(storage.pos.x < creep.pos.x && storage.pos.y < creep.pos.y) {
                                costs.set(creep.pos.x-1, creep.pos.y-1, 3);
                            }
                        }
                        return costs;
                    }});

                    let pos = fleeOutOfFire.path[0];
                    creep.move(creep.pos.getDirectionTo(pos));
                    creep.repair(repairTarget)
                    return;
            }
        }

        // flee to away to realign repair range 3 away so cant be hit by ranged attackers

        if(!repairTarget) {
            creep.memory.locked = findLocked(creep);
        }
        else if(repairTarget && repairTarget.hits == repairTarget.hitsMax) {
            creep.memory.locked = findLocked(creep);
        }

        if(!creep.memory.locked || creep.room.memory.danger && creep.memory.locked && creep.ticksToLive % 100 == 0) {
            let rampart = creep.room.memory.rampart;
            let HostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
            if(rampart && HostileCreeps.length > 0 && rampart.pos.getRangeTo(rampart.pos.findClosestByRange(HostileCreeps)) <= 2) {
                creep.memory.locked = findLocked(creep);
            }
        }


        if(creep.memory.locked) {
            if(Game.time % 75 == 0 && creep.room.memory.danger) {
                creep.memory.locked = findLocked(creep);
            }
            let repairTarget = Game.getObjectById(creep.memory.locked);
            let result = creep.repair(repairTarget)
            if(result == ERR_NOT_IN_RANGE) {
                creep.moveTo(repairTarget, {reusePath:5});

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
				creep.memory.locked = findLocked(creep);
			}
			if(creep.memory.locked) {
				let repairTarget = Game.getObjectById(creep.memory.locked);
				creep.moveTo(repairTarget, {reusePath:5});
			}
		}
    }

    else {
        let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
		if(result == 0) {
			if(!creep.memory.locked) {
				creep.memory.locked = findLocked(creep);
			}
			if(creep.memory.locked) {
				let repairTarget = Game.getObjectById(creep.memory.locked);
				creep.moveTo(repairTarget, {reusePath:5});
			}
		}
    }

	if(creep.ticksToLive <= 84 && (!creep.memory.repairing || _.keys(creep.store).length) == 0) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
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
