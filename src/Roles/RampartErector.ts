/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
        creep.memory.locked_repair = false;
        creep.memory.locked = false;
    }
    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(!creep.memory.full) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, RESOURCE_ENERGY);
        }
        else {
            creep.MoveCostMatrixRoadPrio(storage, 1)
        }
    }
    if(creep.memory.full) {
        if(creep.memory.locked_repair) {
            let target:any = Game.getObjectById(creep.memory.locked_repair);
            if(target && target.hits < 500000) {
                if(creep.repair(target) == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(target, 3)
                }
                return;
            }
            else {
                creep.memory.locked_repair = false;
                creep.memory.locked = false;
            }
        }

        if(!creep.memory.locked) {
            if(creep.memory.rampartLocations.length > 0) {
                let nextTarget = creep.room.memory.construction.rampartLocations.pop();
                if(nextTarget && nextTarget.length >= 2 && typeof nextTarget[0] === 'number' && typeof nextTarget[1] === 'number' && nextTarget[0] >= 0 && nextTarget[0] <= 49 && nextTarget[1] >= 0 && nextTarget[1] <= 49) {
                    let position = new RoomPosition(nextTarget[0], nextTarget[1], creep.room.name)
                    position.createConstructionSite(STRUCTURE_RAMPART);
                    creep.memory.locked = position;
                    return;
                }
                else {
                    creep.memory.suicide = true;
                }
            }
            else {
                creep.memory.suicide = true;
            }
        }
        if(creep.memory.locked) {
            let position = creep.memory.locked
            if(position && position.x <= 47 && position.y <= 47 && position.x >= 2 && position.y >= 2) {
                let position2 = new RoomPosition(position.x, position.y, position.roomName)
                let lookForConstructionSites = position2.lookFor(LOOK_CONSTRUCTION_SITES);
                if(lookForConstructionSites.length > 0) {
                    let target = lookForConstructionSites[0];
                    if(creep.pos.getRangeTo(target) <= 3) {
                        creep.build(target)
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(target, 3)
                    }
                }
                else if(lookForConstructionSites.length == 0) {
                    let lookForBuildings = position2.lookFor(LOOK_STRUCTURES);
                    if(lookForBuildings.length > 0) {
                        for(let building of lookForBuildings) {
                            if(building.structureType == STRUCTURE_RAMPART) {
                                creep.memory.locked_repair = building.id;
                                creep.repair(building);
                            }
                        }
                    }
                    else {
                        creep.memory.locked = false;
                    }
                }
                else {
                    creep.memory.locked = false;
                }
            }
            else {
                creep.memory.locked = false;
            }
        }
    }


}

const roleRampartErector = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRampartErector;
