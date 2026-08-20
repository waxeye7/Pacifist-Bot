// An extension with no walkable approach is hungry forever, so it is always
// the closest hungry structure — and this picker locks onto it for the
// creep's whole life. See utils/Reachability.
import { isUndeliverable } from "utils/Reachability";
import { remoteIsHot, remoteRecalled } from "Rooms/rooms.remotes";
import { stompForeignSite } from "utils/ForeignSites";

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

    // A nearly-dry tower comes before the extension network, unconditionally.
    //
    // This used to be gated on `energyCapacityAvailable / 1.5 < energyAvailable`
    // — i.e. only top a tower up once the room is already about two-thirds
    // full — which is exactly backwards: the room that most needs a working
    // tower is the poor one, and a poor room never clears that gate, so its
    // towers stay on zero indefinitely. Live shard3 E37N59 ran at RCL6 with
    // both towers on 4 and 0 of 1000 against 922 of 2150 available.
    //
    // The cost of removing the gate is bounded and one-off: a tower below 200
    // takes at most 200 energy and then stops asking. See TOWER_FLOOR in
    // Roles/filler.ts, which is the same rule on the other fill path.
    let towers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] < 200)});
    if(towers.length > 0) {
        let closestTower = creep.pos.findClosestByRange(towers);
        creep.memory.locked = closestTower.id;
        return closestTower;
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

/**
 * Store is a start-of-tick snapshot. A withdraw/drop/transfer this tick does
 * not change creep.store until the next tick, but move is a different intent
 * and always lands. After collect → walk dest; after deliver → walk source.
 */
function walkToDropoff(creep) {
    if (creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
    }
    const storage: any = Game.getObjectById(creep.memory.storage) || creep.findStorage();
    if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        if (!creep.pos.isNearTo(storage)) creep.MoveCostMatrixRoadPrio(storage, 1);
        return;
    }
    const spawn: any = Game.getObjectById(creep.memory.spawn) || creep.findSpawn();
    if (spawn && !creep.pos.isNearTo(spawn)) creep.MoveCostMatrixRoadPrio(spawn, 1);
}

function walkToSource(creep) {
    if (creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }
    const pile: any = creep.memory.pickup && Game.getObjectById(creep.memory.pickup.id);
    if (pile && !creep.pos.isNearTo(pile)) {
        creep.MoveCostMatrixSwampPrio(pile, 1);
        return;
    }
    const src: any = creep.memory.sourceId && Game.getObjectById(creep.memory.sourceId);
    if (src && !creep.pos.isNearTo(src)) creep.MoveCostMatrixSwampPrio(src, 1);
}

function deliverIfNear(creep): boolean {
    const storage: any = Game.getObjectById(creep.memory.storage) || creep.findStorage();
    if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && creep.pos.isNearTo(storage)) {
        return creep.transfer(storage, RESOURCE_ENERGY) === OK;
    }
    if (!lockStillOpen(creep)) findLocked(creep);
    if (creep.memory.locked) {
        const t: any = Game.getObjectById(creep.memory.locked);
        if (t && creep.pos.isNearTo(t) && t.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return creep.transfer(t, RESOURCE_ENERGY) === OK;
        }
    }
    // No drop fallback here. Dropping at the spawn's feet feeds the same
    // fleet's own collect pass — see parkFull below for the measured loop.
    return false;
}

/**
 * Nothing in the room can take this load: no storage, no bin, no lock, no
 * depot. The old fallback DROPPED it at the spawn, where the fleet's collect
 * pass picked it straight back up — live E35N58 (2026-08-20) had three
 * carriers trading one pile between two adjacent tiles forever while the
 * spawn read 300/300 in every snapshot: drop 0.2 + pickup 0.2 + move 0.2 CPU
 * per creep per cycle, plus pile decay, for zero delivered energy.
 *
 * A full carrier IS storage — it loses nothing by waiting. Park it: step off
 * the road once so traffic flows, then ZERO intents and zero finds until a
 * sink opens (baseIsFed flips / a lock revives / the depot wants a top-up —
 * all checked upstream every tick at memoised cost).
 */
function parkFull(creep: any): void {
    const packed = creep.pos.x + creep.pos.y * 50;
    if (creep.memory._pk === packed) return; // settled
    let onRoad = false;
    for (const s of creep.pos.lookFor(LOOK_STRUCTURES) as any[]) {
        if (s.structureType === STRUCTURE_ROAD) { onRoad = true; break; }
    }
    if (!onRoad) { creep.memory._pk = packed; return; }
    const terrain = creep.room.getTerrain();
    const dirs = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
    const dx = [0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [-1, -1, 0, 1, 1, 1, 0, -1];
    for (let i = 0; i < 8; i++) {
        const x = creep.pos.x + dx[i];
        const y = creep.pos.y + dy[i];
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        if (terrain.get(x, y) & TERRAIN_MASK_WALL) continue;
        if (creep.room.lookForAt(LOOK_CREEPS, x, y).length) continue;
        if (creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length) continue;
        let free = true;
        for (const s of creep.room.lookForAt(LOOK_STRUCTURES, x, y) as any[]) {
            if (s.structureType === STRUCTURE_RAMPART && s.my) continue;
            free = false;
            break;
        }
        if (!free) continue;
        creep.move(dirs[i]);
        return;
    }
    // boxed in — hold the road tile; still strictly better than the drop loop
    creep.memory._pk = packed;
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

/**
 * Is every tower at or above the depot floor? One answer per room per tick.
 *
 * Split out of baseIsFed() because depotSink()'s RCL3 arm asks the SAME
 * question again a few lines later, and baseIsFed() cannot answer it from its
 * cache: when the extensions are hungry it short-circuits to false without
 * ever looking at a tower. So on the RCL3 climb — the state this whole depot
 * path exists for — every loaded carrier in the room paid a second
 * FIND_MY_STRUCTURES walk every tick for an answer the room already had.
 */
let _towerTick = -1;
let _towerCache: {[roomName: string]: boolean} = {};
function towersFed(room: any): boolean {
    if(_towerTick !== Game.time) {
        _towerTick = Game.time;
        _towerCache = {};
    }
    if(_towerCache[room.name] === undefined) {
        _towerCache[room.name] = room.find(FIND_MY_STRUCTURES, {filter: (b: any) =>
            b.structureType == STRUCTURE_TOWER &&
            b.store[RESOURCE_ENERGY] < DEPOT_TOWER_FLOOR}).length == 0;
    }
    return _towerCache[room.name];
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
        fed = towersFed(room);
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
        if(!towersFed(room)) return null;
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
    if (!creep.store.getUsedCapacity() && stompForeignSite(creep)) return;
    // timeOut is only a hard abort while still IN the flagged remote.
    // After the exit the helper still returns "timeOut" for 25t with no
    // work move — a full hauler sat just inside home instead of unloading.
    if(creep.room.name === creep.memory.targetRoom && creep.fleeHomeIfInDanger() == "timeOut") {
        return;
    }

    if(creep.holdForFlee()) {
        return;
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

    // Neighbor-spawned rescue: load at the healthy room, then walk to the
    // wrecked one. Without this the carry walks home empty (homeRoom is dest).
    if (creep.memory.emergencyFeed && !creep.memory.full) {
        const dest = creep.memory.emergencyFeed;
        const donor = creep.memory.homeRoom;
        if (creep.room.name === dest && donor && donor !== dest) {
            // Dumped. Walk back to the donor for another load — homeRoom
            // used to be dest, so they acquired energy in the wreck forever.
            return creep.moveToRoomAvoidEnemyRooms(donor);
        }
        if (creep.room.name !== dest) {
            const stor = creep.room.storage;
            if (stor && stor.store[RESOURCE_ENERGY] > 0 && creep.store.getFreeCapacity() > 0) {
                if (creep.withdraw(stor, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(stor);
                    return;
                }
            }
            if (creep.store[RESOURCE_ENERGY] > 0) creep.memory.full = true;
            return creep.moveToRoomAvoidEnemyRooms(dest);
        }
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
                if(creep.transfer(depot, RESOURCE_ENERGY) == 0) {
                    creep.memory.full = false;
                    walkToSource(creep);
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(depot, 1);
            }
            return;
        }

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage) {
            if (deliverIfNear(creep)) {
                creep.memory.full = false;
                walkToSource(creep);
                return;
            }
            creep.MoveCostMatrixRoadPrio(storage, 1);
            creep.memory.role = "FakeFiller";
            return;
        }
        else {
            let spawn:any = Game.getObjectById(creep.memory.spawn) || creep.findSpawn();
            // `storage` is the one resolved just above and is FALSY here — that
            // is the only way this branch is reached. It used to be resolved a
            // second time into a shadowing local, which is a second full
            // Creep.findStorage() every tick: two FIND_MY_STRUCTURES walks, a
            // lookFor and Room.findStorageContainer()'s eight-tile ring, all to
            // re-derive the same `undefined`. The shadow is gone; every reader
            // below sees the identical value it saw before.
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
                    if(creep.transfer(storage, RESOURCE_ENERGY) == 0) {
                        creep.memory.full = false;
                        walkToSource(creep);
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1)
                }
            }
            else if(bin && bin.store.getFreeCapacity() != 0) {
                if(creep.pos.isNearTo(bin)) {
                    if(creep.transfer(bin, RESOURCE_ENERGY) == 0) {
                        creep.memory.full = false;
                        walkToSource(creep);
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(bin, 1)
                }
            }
            else {
                // No storage and no bin — young room. Deliver to whatever
                // findLocked opens; when NOTHING can take the load, PARK
                // (see parkFull — the old fallback dropped at the spawn and
                // the fleet re-collected its own drop forever).
                if(!lockStillOpen(creep)) {
                    // When the base reads fed there is nothing for findLocked's
                    // three room.finds to find — skip the scan and hold.
                    let target = baseIsFed(creep.room) ? null : findLocked(creep);

                    if(!target) {
                        parkFull(creep);
                        return;
                    }
                }

                if(creep.memory.locked) {
                    let target = Game.getObjectById(creep.memory.locked);

                    if(!target) {
                        parkFull(creep);
                        return;
                    }

                    delete creep.memory._pk;
                    if(creep.pos.isNearTo(target)) {
                        if (creep.transfer(target, RESOURCE_ENERGY) === OK) {
                            creep.memory.full = false;
                            walkToSource(creep);
                        }
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(target, 1)
                    }
                }
                else {
                    parkFull(creep);
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
            if (home && home.controller && home.controller.my && home.controller.level < 3) {
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
        //
        // A CLOSED remote (remoteRecalled) does NOT get the same treatment, and
        // sharing this branch with it was a bug. The re-home above is permanent:
        // the remote name is gone from targetRoom, so remoteRecalled can never
        // un-latch the creep when manageRemotes re-opens the entry (which it does
        // routinely — cap juggling, score churn, a bucket dip), and `sourceId` is
        // gone too, so the body stops counting in liveCarriersForSource and the
        // room spawns a REPLACEMENT for a carrier that is still alive. One
        // transient close permanently doubles the haul fleet.
        //
        // A recall therefore mutates nothing at all: walk home, work home-side,
        // and pick the remote straight back up when the flag lifts. Same exit as
        // the miner takes (Roles/energyMiner), minus the recycle — a carrier is
        // useful at home, a static 4W miner is not.
        //
        // Note where this sits — inside `if(!creep.memory.full)` — so a loaded
        // carrier finishes the delivery it is already carrying first.
        const remoteTrip = !!(
            creep.memory.targetRoom &&
            creep.memory.homeRoom &&
            creep.memory.targetRoom !== creep.memory.homeRoom
        );
        let recalledHome = false;
        // HOT gets the same non-destructive treatment the recall got: walk
        // home, work home-side, resume when the flag lifts. The old branch
        // deleted sourceId/pathLength — the body dropped out of
        // liveCarriersForSource, the room spawned a REPLACEMENT for a carrier
        // still alive, and one MOVE-only scout keeping the remote hot
        // (rooms.remotes re-arm) doubled the haul fleet permanently.
        if (remoteTrip && remoteIsHot(creep.memory.homeRoom, creep.memory.targetRoom)) {
            if (creep.room.name !== creep.memory.homeRoom) {
                return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
            }
            recalledHome = true;
        }
        else if (remoteTrip && remoteRecalled(creep)) {
            if (creep.room.name !== creep.memory.homeRoom) {
                return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
            }
            recalledHome = true;
        }
        // ...and the walk-out has to know about the recall too, or the two
        // fight: the recall says go home, this says go to the remote, and the
        // carrier oscillates on the exit tile.
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name && !recalledHome) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        }
        const startedFree = creep.store.getFreeCapacity();
        const startedEnergy = creep.store[RESOURCE_ENERGY] || 0;
        // CARRY intents see start-of-tick store. Drop/transfer the energy we
        // already hold, withdraw/pickup into free space, then move. All three
        // land in one tick when the creep is in range.
        let delivered = false;
        if (startedEnergy > 0 && deliverIfNear(creep)) {
            creep.memory.full = false;
            delivered = true;
        }
        let result: any = OK;
        if (startedFree > 0) {
            result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        }
        if (result == 0) {
            delete creep.memory.dry;
            /*
             * `amt` is a lock-time FORECAST (up to 25t stale), and adjacent
             * salvage issues its intent without touching the lock at all — so
             * "took >= 50" sent 1500-capacity remote carriers home with 150,
             * or with 3 when a crumb pickup read another pile's stale amt.
             * Reconcile the claim against what actually stands on the locked
             * target, and only a genuine top-off ends the collect leg early.
             */
            const p: any = creep.memory.pickup;
            const onLocked: any = p && p.id ? Game.getObjectById(p.id) : null;
            const standing = !onLocked ? 0
                : typeof onLocked.amount === "number" ? onLocked.amount
                : (onLocked.store && onLocked.store[RESOURCE_ENERGY]) || 0;
            const took = Math.min((p && p.amt) || 0, standing);
            if (startedFree <= took) creep.memory.full = true;
            // Stepping toward home on EVERY collect is the border oscillation
            // the film caught — only a full body starts the trip back.
            if (creep.memory.full) walkToDropoff(creep);
        } else if (result === "idle" && startedFree > 0 && startedEnergy > 0) {
            /*
             * Collect-dry room while holding a partial load. Brief dips (the
             * pile regrowing under a drop-miner) are worth waiting out next to
             * the source; a real drought takes the partial home — that is the
             * "rooms starve themselves" half of 37dffc94, kept, but time-based
             * instead of crumb-triggered.
             */
            creep.memory.dry = (creep.memory.dry || 0) + 1;
            if (creep.memory.dry >= 15) {
                delete creep.memory.dry;
                creep.memory.full = true;
                walkToDropoff(creep);
            }
        } else if (delivered) {
            walkToSource(creep);
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
