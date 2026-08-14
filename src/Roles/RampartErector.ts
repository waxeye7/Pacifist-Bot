/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { interiorMove } from "utils/Interior";

 const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(creep.holdForFlee()) {
        return;
    }

    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
        // keep the repair lock through the refill trip while the rampart is still
        // fragile — dropping it here abandoned 1-hit newborns to decay away
        let fresh:any = creep.memory.locked_repair ? Game.getObjectById(creep.memory.locked_repair) : null;
        if(fresh && fresh.hits < 30000) {
            // still fragile: keep locked_repair AND locked so the refilled creep
            // resumes exactly where it left off
        }
        else {
            if(!fresh && creep.memory.locked_repair && creep.memory.locked) {
                // the newborn died while we refilled: put its tile back on the list
                const pos:any = creep.memory.locked;
                const list = creep.room.memory.construction && creep.room.memory.construction.rampartLocations;
                if(list && pos.roomName == creep.room.name) {
                    list.push([pos.x, pos.y]);
                }
            }
            creep.memory.locked_repair = false;
            creep.memory.locked = false;
        }
    }
    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(!creep.memory.full) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        // Spawned at RCL4 with no storage; findStorage then only looks for
        // STRUCTURE_STORAGE, so this was isNearTo(null) every tick.
        if(!storage) {
            const S = creep.room.memory.Structures || {};
            storage = Game.getObjectById(S.bin) || Game.getObjectById(S.storage);
        }
        if(!storage) {
            const boxes = creep.room.find(FIND_STRUCTURES, {filter: (s:any) =>
                s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0});
            if(boxes.length) storage = creep.pos.findClosestByRange(boxes);
        }
        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, RESOURCE_ENERGY);
            }
            else {
                if (!interiorMove(creep, storage, 1)) creep.MoveCostMatrixRoadPrio(storage, 1)
            }
        }
    }
    if(creep.memory.full) {
        if(creep.memory.locked_repair) {
            let target:any = Game.getObjectById(creep.memory.locked_repair);
            if(target && target.hits < 500000) {
                if(creep.repair(target) == ERR_NOT_IN_RANGE) {
                    if (!interiorMove(creep, target, 3)) creep.MoveCostMatrixRoadPrio(target, 3)
                }
                return;
            }
            else {
                creep.memory.locked_repair = false;
                creep.memory.locked = false;
            }
        }

        if(!creep.memory.locked) {
            // the creep's own copy is only a spawn-time snapshot — the list it
            // actually pops from is the room's, which may be missing entirely
            // (planV2 rooms before the first sync) or already emptied by a
            // sibling erector
            const roomRampartLocations =
                creep.room.memory.construction && creep.room.memory.construction.rampartLocations;
            if(creep.memory.rampartLocations && creep.memory.rampartLocations.length > 0 &&
               roomRampartLocations && roomRampartLocations.length > 0) {
                // Use-time only accepts 2..47. Popping 0..49 locked a border
                // tile, the next tick discarded it, and the coord was gone.
                // Skip those; only suicide once the list is empty. On a failed
                // createConstructionSite, do not keep the lock — push the coord
                // back if the room is at the site cap.
                while(roomRampartLocations.length > 0 && !creep.memory.locked) {
                    let nextTarget = roomRampartLocations.pop();
                    if(!(nextTarget && nextTarget.length >= 2 && typeof nextTarget[0] === 'number' && typeof nextTarget[1] === 'number' && nextTarget[0] >= 2 && nextTarget[0] <= 47 && nextTarget[1] >= 2 && nextTarget[1] <= 47)) {
                        continue;
                    }
                    let position = new RoomPosition(nextTarget[0], nextTarget[1], creep.room.name);
                    let result = position.createConstructionSite(STRUCTURE_RAMPART);
                    if(result == 0 || position.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) {
                        creep.memory.locked = position;
                    }
                    else if(result == ERR_FULL) {
                        roomRampartLocations.push(nextTarget);
                        break;
                    }
                }
                if(creep.memory.locked) {
                    return;
                }
                if(roomRampartLocations.length == 0) {
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
                        if (!interiorMove(creep, target, 3)) creep.MoveCostMatrixRoadPrio(target, 3)
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
