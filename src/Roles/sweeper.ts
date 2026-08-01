// An extension with no walkable approach is hungry forever, so it is always
// the closest hungry structure — and this picker locks onto it for the
// creep's whole life. See utils/Reachability.
import { isUndeliverable } from "utils/Reachability";

/*
 * Where a sweeper may put what it picked up.
 *
 * The old list was terminal -> towers -> spawn/extensions/towers -> towers, and
 * nothing else. In a room whose extensions are permanently full and which has no
 * terminal (every RCL<6 room in the fleet) that list is EMPTY, so the creep
 * locked up holding a partial load and never moved again. Measured over one
 * window: Sweeper-20011-E3S3 1,342 ticks with its store never changing once;
 * Sweeper-95387-E18S3 1,034 ticks at maxStore 0 and 95% same tile;
 * Sweeper-95759-E2S7 1,498 ticks, 10 distinct tiles, 2 store changes, ending
 * holding 57 energy — all while ~41,000 energy sat on the ground fleet-wide and
 * this is the role whose entire job is to collect it.
 *
 * Containers and storage are the sinks that always exist. Order is by value:
 * anything that keeps the energy usable beats anything that just parks it.
 */
function findLocked(creep) {
    creep.memory.locked = false;

    // 1) real storage — never full in practice
    const storage = creep.room.storage;
    if (storage && storage.my && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        creep.memory.locked = storage.id;
        return storage;
    }

    // 2) terminal below its working level
    let terminal = creep.room.terminal;
    if (terminal && terminal.store[RESOURCE_ENERGY] < 10000) {
        creep.memory.locked = terminal.id;
        return terminal;
    }

    // 3) hungry towers first when the room is otherwise fed
    if(creep.room.energyCapacityAvailable /1.5 < creep.room.energyAvailable) {
        let towers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] < 200)});
        if(towers.length > 0) {
            let closestTower = creep.pos.findClosestByRange(towers);
            creep.memory.locked = closestTower.id;
            return closestTower;
        }
    }

    // 4) spawn / extensions / towers with room
    let spawnAndExtensions = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_TOWER) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && !isUndeliverable(creep.room, building.id)});
    if(spawnAndExtensions.length > 0) {
        let closestDropOffLocation = creep.pos.findClosestByRange(spawnAndExtensions);
        creep.memory.locked = closestDropOffLocation.id;
        return closestDropOffLocation;
    }

    // 5) the hub container / bin — the sink an RCL<4 room actually has
    const structures = creep.room.memory.Structures || {};
    for (const key of ["bin", "storage", "container", "controllerLink"]) {
        const s: any = structures[key] ? Game.getObjectById(structures[key]) : null;
        if (s && s.store && s.structureType == STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            creep.memory.locked = s.id;
            return s;
        }
    }

    // 6) ANY container with room, closest first. This is what makes the fleet's
    //    floor energy recoverable at all below RCL4.
    const containers = creep.room.find(FIND_STRUCTURES, {filter: (b: any) =>
        b.structureType == STRUCTURE_CONTAINER && b.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
    if (containers.length > 0) {
        const closest = creep.pos.findClosestByRange(containers);
        creep.memory.locked = closest.id;
        return closest;
    }

    // 7) last resort: a tower, even a full-ish one
    let towers2 = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0)});
    if(towers2.length > 0) {
        let closestTower = creep.pos.findClosestByRange(towers2);
        creep.memory.locked = closestTower.id;
        return closestTower;
    }
    return null;
}

/**
 * Hand the load to a neighbour that can use it.
 *
 * When the whole room is genuinely full there is no structure to fill, and the
 * measured failure mode is the sweeper standing there holding it until it dies.
 * A filler/carrier/upgrader/builder standing next to it is a real sink.
 */
function giveToNeighbour(creep): boolean {
    const takers = creep.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c: any) =>
        c.id !== creep.id &&
        c.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        (c.memory.role == "upgrader" || c.memory.role == "builder" ||
         c.memory.role == "filler" || c.memory.role == "carry" ||
         c.memory.role == "repair" || c.memory.role == "maintainer")});
    if (!takers.length) return false;
    return creep.transfer(takers[0], RESOURCE_ENERGY) === OK;
}



/**
 * A little description of this function
 * @param {Creep} creep
 **/

 const run = function (creep) {
    creep.memory.moving = false;
	if(creep.evacuate()) {
		return;
	}
    if(creep.memory.suicide == true) {
        creep.recycle();
        return;
    }
    if(!creep.memory.MaxStorage) {
        let carryPartsAmount = 0
        for(let part of creep.body) {
            if(part.type == CARRY) {
                carryPartsAmount += 1;
            }
        }
        creep.memory.MaxStorage = carryPartsAmount * 50;
    }
    let MaxStorage = creep.memory.MaxStorage;




    if(creep.memory.full && creep.store.getFreeCapacity() == MaxStorage) {
        creep.memory.full = false;
        creep.memory.lockedDropped = false;
    }
    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }


    // ---- progress watchdog -------------------------------------------------
    // The measured failure is not "picked the wrong sink", it is "stopped
    // moving energy at all and never noticed". Track the store; if nothing has
    // changed for a while, throw away both locks and re-decide from scratch.
    const carried = creep.store.getUsedCapacity();
    if(creep.memory._swE !== carried) {
        creep.memory._swE = carried;
        creep.memory._swT = Game.time;
    }
    else if(Game.time - (creep.memory._swT || Game.time) > 30) {
        creep.memory._swT = Game.time;
        creep.memory.locked = false;
        creep.memory.lockedDropped = false;
        creep.memory.path = false;
        delete creep.memory._move;
        delete creep.memory.MoveTargetId;
    }

    if(creep.memory.full) {
        // A FULL container is not a drop-off. creep.findStorage() returns the
        // hub CONTAINER below RCL4 and caches its id in memory.storage, so a
        // sweeper that arrived once while it was full stood next to it
        // transferring nothing for the rest of its life.
        let storage: any = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage && (!storage.store || storage.store.getFreeCapacity(RESOURCE_ENERGY) <= 0)) {
            storage = null;
        }
        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                for(let resourceType in creep.store) {
                    creep.transfer(storage, resourceType);
                }
                if(creep.store.getUsedCapacity() == 0) {
                    creep.memory.full = false;
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
        }
        else {
            let target: any = creep.memory.locked ? Game.getObjectById(creep.memory.locked) : null;
            // re-pick when the lock died, was never set, or filled up
            if(!target || !target.store || target.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) {
                target = findLocked(creep);
            }

            if(target) {
                if(creep.pos.isNearTo(target)) {
                    creep.transfer(target, RESOURCE_ENERGY);
                    if(creep.store[RESOURCE_ENERGY] == 0) {
                        creep.memory.full = false;
                    }
                    else {
                        const next: any = findLocked(creep);
                        if(next && !creep.pos.isNearTo(next)) {
                            creep.MoveCostMatrixIgnoreRoads(next, 1);
                        }
                    }
                }
                else {
                    creep.MoveCostMatrixIgnoreRoads(target, 1);
                }
            }
            else if(giveToNeighbour(creep)) {
                if(creep.store[RESOURCE_ENERGY] == 0) creep.memory.full = false;
            }
            else {
                // Every sink in the room is full — that is finding #1, and the
                // upgrader gates are what fix it. Energy inside a creep does not
                // decay, so HOLDING is the right call here; what is not right is
                // holding it somewhere useless. Wait next to the hub so the load
                // lands the instant a slot opens.
                const hubId = (creep.room.memory.Structures || {}).bin ||
                    (creep.room.memory.Structures || {}).storage;
                const hub: any = hubId ? Game.getObjectById(hubId) : null;
                if(hub && !creep.pos.inRangeTo(hub, 2)) {
                    creep.MoveCostMatrixRoadPrio(hub, 2);
                }
            }
        }
    }

    else {

        let result = creep.Sweep();

        // The dump path used to be duplicated here, in a form that dereferenced
        // Game.getObjectById(locked) without a null check and treated a FULL
        // container as a valid drop-off. One tick of delay costs nothing and the
        // block above is the only copy that has to be right.
        if(result == "picked up" && creep.store.getFreeCapacity() == 0) {
            creep.memory.full = true;
            creep.memory.locked = false;
        }
        // Nothing left to collect: deliver what we are holding FIRST. Recycling
        // with a full store throws that energy away.
        else if(result == "nothing to sweep" && creep.ticksToLive <= 1400) {
            if(creep.store.getUsedCapacity() > 0) {
                creep.memory.full = true;
            }
            else {
                creep.memory.suicide = true;
            }
        }
        else if(creep.store.getFreeCapacity() == 0) {
            creep.memory.full = true;
        }
        else {
            creep.memory.full = false;
        }

    }
    creep.memory.moving = false;


}

const roleSweeper = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSweeper;
