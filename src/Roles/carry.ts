// An extension with no walkable approach is hungry forever, so it is always
// the closest hungry structure — and this picker locks onto it for the
// creep's whole life. See utils/Reachability.
import { isUndeliverable } from "utils/Reachability";
import { remoteIsHot } from "Rooms/rooms.remotes";

/** Drop a lock that is gone, full, or undeliverable — same as FakeFiller. */
function lockStillOpen(creep) {
    if(!creep.memory.locked) return false;
    if(isUndeliverable(creep.room, creep.memory.locked)) {
        creep.memory.locked = false;
        return false;
    }
    const t: any = Game.getObjectById(creep.memory.locked);
    if(!t || !t.store || t.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
        creep.memory.locked = false;
        return false;
    }
    return true;
}

function findLocked(creep) {
    let terminal = creep.room.terminal;
    if (terminal && terminal.store[RESOURCE_ENERGY] < 10000) {
        creep.memory.locked = terminal.id;
        return terminal;
    }

    if(creep.room.energyCapacityAvailable /1.5 < creep.room.energyAvailable) {
        let towers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] < 200)});
        if(towers.length > 0) {
            let closestTower = creep.pos.findClosestByRange(towers);
            creep.memory.locked = closestTower.id;
            return closestTower;
        }
    }

    let spawnAndExtensions = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_TOWER) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && !isUndeliverable(creep.room, building.id)});
    if(spawnAndExtensions.length > 0) {
        let closestDropOffLocation = creep.pos.findClosestByRange(spawnAndExtensions);
        creep.memory.locked = closestDropOffLocation.id;
        return closestDropOffLocation;
    }

    let towers2 = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] >= 0 && building.store.getFreeCapacity() > 0)});
    if(towers2.length > 0) {
        let closestTower = creep.pos.findClosestByRange(towers2);
        creep.memory.locked = closestTower.id;
        return closestTower;
    }
    creep.memory.locked = false;
    return false;
}



/* ---------------------------------------------------------------------------
 * The controller depot below RCL5.
 *
 * Nothing refilled it. A carrier delivers to spawn/extensions/towers/storage and
 * then parks its load; the two roles that DO know about the controller container
 * are both out of reach down here - `filler` is a storage-room role and
 * ControllerLinkFiller is throttled to one creep in a 12-of-70-tick window and
 * additionally requires an upgrader to already exist (rooms.spawning.ts:1824),
 * which is a deadlock in exactly the rooms this matters for. Measured live:
 * E1S4 (RCL3) depot at (23,28) holding 0 with 12,797 energy rotting on the room
 * floor and six upgraders shuttling to the source piles instead; E13S5 (RCL2)
 * depot at (22,29) holding 0; E19S7 (RCL4) depot at (34,40) holding 80.
 *
 * So the carriers own it: once the spawn, the extensions and the towers are fed,
 * the SURPLUS goes to the controller container instead of into a parked store.
 * No new creep - the same haulers, one rung earlier than "park it in storage".
 * ------------------------------------------------------------------------- */
/** don't start a trip for less than this much free space in the depot */
const DEPOT_MIN_FREE = 200;
/** a tower under this is fed before the controller is */
const DEPOT_TOWER_FLOOR = 500;
/** re-resolve the depot at most this often per creep */
const DEPOT_TTL = 100;

/**
 * The controller container, resolved the same way upgrader.ts/controllerDepot
 * does it (range 4, never a source container, never the bin or the storage) so
 * both ends of the line agree on which structure is "the depot".
 *
 * Publishing the id to room.memory.Structures.controllerLink is deliberate: it
 * is the key the whole codebase already uses for this structure below RCL7, and
 * Room.findContainers() skips it - without that, carriers would happily withdraw
 * from the depot they just filled.
 */
function controllerDepot(creep: any): any {
    const room = creep.room;
    const ctrl = room.controller;
    if(!ctrl || !ctrl.my) return null;
    if(!room.memory.Structures) room.memory.Structures = {};
    const S: any = room.memory.Structures;

    const known: any = Game.getObjectById(S.controllerLink);
    if(known) {
        // a LINK is the ControllerLinkFiller's job, not a hauler's
        return known.structureType == STRUCTURE_CONTAINER ? known : null;
    }

    const mem: any = creep.memory._depot;
    if(mem && Game.time - (mem.t || 0) < DEPOT_TTL) {
        return mem.id ? Game.getObjectById(mem.id) : null;
    }

    const sources = room.find(FIND_SOURCES);
    const candidates = room.find(FIND_STRUCTURES, {filter: (s: any) =>
        s.structureType == STRUCTURE_CONTAINER &&
        s.id !== S.bin &&
        s.id !== S.storage &&
        s.pos.getRangeTo(ctrl) <= 4 &&
        s.pos.findInRange(sources, 1).length == 0});
    const depot: any = candidates.length ? ctrl.pos.findClosestByRange(candidates) : null;
    creep.memory._depot = {id: depot ? depot.id : false, t: Game.time};
    if(depot) {
        S.controllerLink = depot.id;
    }
    return depot;
}

/** is every higher-priority sink in the room already fed? one answer per tick. */
let _fedTick = -1;
let _fedCache: {[roomName: string]: boolean} = {};
function baseIsFed(room: any): boolean {
    if(_fedTick !== Game.time) {
        _fedTick = Game.time;
        _fedCache = {};
    }
    if(_fedCache[room.name] !== undefined) return _fedCache[room.name];
    let fed = true;
    // Spawn and extensions first. energyAvailable == capacity is the cheap test;
    // it is NOT sufficient on its own because an extension with no walkable
    // approach is hungry forever (see utils/Reachability), which would park the
    // room's whole surplus behind a structure nobody can reach.
    if(room.energyAvailable < room.energyCapacityAvailable) {
        fed = room.find(FIND_MY_STRUCTURES, {filter: (b: any) =>
            (b.structureType == STRUCTURE_SPAWN || b.structureType == STRUCTURE_EXTENSION) &&
            b.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
            !isUndeliverable(room, b.id)}).length == 0;
    }
    // Then the towers.
    if(fed) {
        fed = room.find(FIND_MY_STRUCTURES, {filter: (b: any) =>
            b.structureType == STRUCTURE_TOWER &&
            b.store[RESOURCE_ENERGY] < DEPOT_TOWER_FLOOR}).length == 0;
    }
    _fedCache[room.name] = fed;
    return fed;
}

/** the depot, but only when delivering there would not starve anything. */
function depotSink(creep: any): any {
    const room = creep.room;
    const ctrl = room.controller;
    // RCL5+ has links, an EnergyManager and real fillers for this.
    if(!ctrl || !ctrl.my || ctrl.level < 2 || ctrl.level >= 5) return null;
    if(creep.memory.homeRoom && creep.memory.homeRoom !== room.name) return null;
    if(room.memory.danger) return null;
    // cheapest test first: no depot / no room in it -> no finds at all
    const depot = controllerDepot(creep);
    if(!depot) return null;
    const near = creep.pos.isNearTo(depot);
    if(depot.store.getFreeCapacity(RESOURCE_ENERGY) < (near ? 50 : DEPOT_MIN_FREE)) return null;
    if(!baseIsFed(room)) {
        // RCL3 parked 4W only pay if the depot has energy. Leftover
        // extensions keep baseIsFed false for the rest of the 135k climb.
        // Hold a 550e spawn floor so a 5W miner still hatches; the rest
        // goes up. RCL2 has no depot; RCL4 keeps the old full-fed rule.
        if(ctrl.level !== 3) return null;
        if(room.energyAvailable < Math.min(550, room.energyCapacityAvailable)) return null;
        if(room.find(FIND_MY_STRUCTURES, {filter: (b: any) =>
            b.structureType == STRUCTURE_TOWER &&
            b.store[RESOURCE_ENERGY] < DEPOT_TOWER_FLOOR}).length > 0) return null;
    }
    return depot;
}

/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    creep.memory.moving = false;



    if(creep.memory.suicide == true) {
        creep.recycle();
        return;
    }
    // timeOut is only a hard abort while still IN the flagged remote.
    // After the exit the helper still returns "timeOut" for 25t with no
    // work move — a full hauler sat just inside home instead of unloading.
    if(creep.room.name === creep.memory.targetRoom && creep.fleeHomeIfInDanger() == "timeOut") {
        return;
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

    // let fleeStatus = creep.fleeHomeIfInDanger();
    // if(fleeStatus == true) {
    //     return;
    // }
    // else if(fleeStatus == "in position") {
    //     creep.memory.suicide = true;
    //     return;
    // }

    // && creep.room.name != creep.memory.homeRoom add maybe to make creep only switch if in room idkidk
    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
    }

    // Exact equality is a one-tick window and is skipped by earlier returns;
    // the hauler then fills at the remote and dies on the way home. Recycle
    // once remaining life no longer covers the round trip.
    if(!creep.memory.full && creep.memory.pathLength && creep.ticksToLive + 3 <= creep.memory.pathLength * 2) {
        creep.memory.suicide = true;
    }

    if(creep.memory.full) {

        if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
        }

        // Surplus goes to the controller BEFORE the load is parked in storage
        // (or dropped at the spawn) - see controllerDepot above. Everything with
        // a higher claim on the energy has already been checked by depotSink().
        const depot = depotSink(creep);
        if(depot) {
            if(creep.pos.isNearTo(depot)) {
                if(creep.transfer(depot, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                    creep.memory.full = false;
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(depot, 1);
            }
            return;
        }

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage) {
            creep.MoveCostMatrixRoadPrio(storage, 1);
            creep.memory.role = "FakeFiller";
            return;
        }
        else {
            let spawn:any = Game.getObjectById(creep.memory.spawn) || creep.findSpawn();
            let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
            let bin;
            if(storage && creep.room.memory.Structures) {
                bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);
            }

            if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
                if(Game.getObjectById(creep.memory.storage)) {
                    return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom, storage.pos.x, storage.pos.y, false, 5, 2);
                }
                else {
                    return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
                }
            }


            if(storage && storage.store.getFreeCapacity() !== 0) {
                if(creep.pos.isNearTo(storage)) {
                    if(creep.transfer(storage, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                        creep.memory.full = false;
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1)
                }
            }
            else if(bin && bin.store.getFreeCapacity() != 0) {
                if(creep.pos.isNearTo(bin)) {
                    if(creep.transfer(bin, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                        creep.memory.full = false;
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(bin, 1)
                }
            }
            else {
                if(!lockStillOpen(creep)) {
                    let target = findLocked(creep);

                    if(!target) {
                        if(spawn) {
                            if(creep.pos.isNearTo(spawn) && creep.room.controller.level > 1) {
                                creep.drop(RESOURCE_ENERGY);
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(spawn, 1)
                            }
                            return;
                        }
                    }
                }

                if(creep.memory.locked) {
                    let target = Game.getObjectById(creep.memory.locked);

                    if(!target) {
                        if(spawn) {
                            if(creep.pos.isNearTo(spawn)) {
                                creep.drop(RESOURCE_ENERGY);
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(spawn, 1)
                            }
                            return;
                        }
                    }

                    if(creep.pos.isNearTo(target)) {
                        creep.transfer(target, RESOURCE_ENERGY);
                        if(creep.store[RESOURCE_ENERGY] == 0) {
                            creep.memory.full = false;
                        }
                        else {
                            findLocked(creep);
                            let target = Game.getObjectById(creep.memory.locked);
                            if(!creep.pos.isNearTo(target)) {
                                creep.MoveCostMatrixRoadPrio(target, 1)
                            }
                        }
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(target, 1)
                    }
                }
            }
        }


    }

    if(!creep.memory.full) {
        // Early RCL: don't leave home for remotes (causes exit traffic jams)
        if (
            creep.memory.targetRoom &&
            creep.memory.homeRoom &&
            creep.memory.targetRoom !== creep.memory.homeRoom
        ) {
            const home = Game.rooms[creep.memory.homeRoom];
            if (home && home.controller && home.controller.my && home.controller.level < 4) {
                creep.memory.targetRoom = creep.memory.homeRoom;
                delete creep.memory.exit;
                delete creep.memory.route;
                // liveCarriersForSource still counts this body by sourceId;
                // pathLength stays the remote 2L recycle clock.
                delete creep.memory.sourceId;
                delete creep.memory.pathLength;
            }
        }
        // Remote abandoned for threat reasons -> reassign to home instead of
        // walking back into it. The spawner already refuses to make new carriers
        // for a hot remote; without this the ones already alive keep commuting
        // into the room that is killing them.
        if (
            creep.memory.targetRoom &&
            creep.memory.homeRoom &&
            creep.memory.targetRoom !== creep.memory.homeRoom &&
            remoteIsHot(creep.memory.homeRoom, creep.memory.targetRoom)
        ) {
            creep.memory.targetRoom = creep.memory.homeRoom;
            delete creep.memory.exit;
            delete creep.memory.route;
            delete creep.memory.sourceId;
            delete creep.memory.pathLength;
        }
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        }
        let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        if(result == 0 && creep.store.getFreeCapacity() == 0) {
            let spawn:any = Game.getObjectById(creep.memory.spawn) || creep.findSpawn();
            let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
            if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
                if(creep.memory.storage) {
                    return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
                    // return creep.moveToRoom(creep.memory.homeRoom, storage.pos.x, storage.pos.y, false, 5, 2);
                }
                else {
                    return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
                }
            }

            if(storage) {
                if(creep.pos.isNearTo(storage)) {
                    if(creep.transfer(storage, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                        creep.memory.full = false;
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1)
                }
            }
            else {
                if(!lockStillOpen(creep)) {
                    let target = findLocked(creep);

                    if(!target) {
                        if(spawn) {
                            if(creep.pos.isNearTo(spawn)) {
                                creep.drop(RESOURCE_ENERGY);
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(spawn, 1)
                            }
                            return;
                        }
                    }
                }

                if(creep.memory.locked) {
                    let target = Game.getObjectById(creep.memory.locked);

                    if(!target) {
                        if(spawn) {
                            if(creep.pos.isNearTo(spawn)) {
                                creep.drop(RESOURCE_ENERGY);
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(spawn, 1)
                            }
                            return;
                        }
                    }

                    if(creep.pos.isNearTo(target)) {
                        creep.transfer(target, RESOURCE_ENERGY);
                        if(creep.store[RESOURCE_ENERGY] == 0) {
                            creep.memory.full = false;
                        }
                        else {
                            findLocked(creep);
                            let target = Game.getObjectById(creep.memory.locked);
                            if(!creep.pos.isNearTo(target)) {
                                creep.MoveCostMatrixRoadPrio(target, 1)
                            }
                        }
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(target, 1)
                    }
                }
            }
        }
    }

	if(creep.ticksToLive <= 30 && !creep.memory.full && creep.memory.targetRoom === creep.room.name) {
		creep.memory.suicide = true;
	}
    // The braceless else-if swallowed the suicide check as its body, so a carry
    // flagged for suicide anywhere else in the tick never reached recycle().
    else if(creep.ticksToLive <= 75 && !creep.memory.full && creep.memory.targetRoom !== creep.room.name) {
		creep.memory.suicide = true;
	}

	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}


 }


const roleCarry = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleCarry;
