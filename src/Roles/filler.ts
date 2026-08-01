/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { isUndeliverable, isUnreachableId, blacklistFillTarget } from "utils/Reachability";

/**
 * The room's real, un-reserved fill need, nearest first.
 *
 * creep.findFillerTarget() hands out RESERVATIONS (room.memory.reserveFill) and
 * only ever releases one again on a successful transfer. A loaded filler asks
 * it for a target up to TWICE per tick - once for the structure it is filling
 * and once for the look-ahead it walks to next - so with a few fillers alive the
 * reserve list covers every extension in the room within a handful of ticks.
 * From then on findFillerTarget() returns FALSE for every filler at once and
 * they all sit on full stores doing nothing until the 40-tick reset below wipes
 * the list. Live E14S9: 4 fillers, 34k banked in storage, room energy
 * 119/1300, extensions climbing +1 a tick off spawn regeneration alone.
 *
 * This function ignores reservations entirely and is the delivery guarantee:
 * while anything in the room still wants energy, a carrying filler has
 * somewhere to go. Priority is the one the room actually needs - spawn and
 * extensions first (they are what blocks spawning), then any tower below half.
 */
function fillNeed(creep, excludeId?) {
    // isUndeliverable(): an extension with no walkable approach is hungry
    // FOREVER, which makes it permanently the nearest hungry structure to a
    // filler standing in the hub. Without this filter the whole fill layer
    // parks on it — E11S2 lost two loaded fillers to extension@18,36 and E9S2
    // lost two carriers to extension@20,39, both walled in by extensions the
    // current plan does not want. See utils/Reachability.
    let targets = creep.room.find(FIND_MY_STRUCTURES, {filter: (s) =>
        (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION)
        && s.id !== excludeId
        && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        && !isUndeliverable(creep.room, s.id)});
    if(targets.length == 0) {
        targets = creep.room.find(FIND_MY_STRUCTURES, {filter: (s) =>
            s.structureType == STRUCTURE_TOWER
            && s.id !== excludeId
            && s.store[RESOURCE_ENERGY] < s.store.getCapacity(RESOURCE_ENERGY) / 2
            && !isUndeliverable(creep.room, s.id)});
    }
    if(targets.length == 0) {
        // Last resort: this function is the room's DELIVERY GUARANTEE, so it
        // may never answer "nowhere to go" just because the heuristic
        // blacklist got greedy. Retry with only the exact, physical filter -
        // a structure with no walkable approach is still off the table, but
        // everything else is back on it.
        targets = creep.room.find(FIND_MY_STRUCTURES, {filter: (s) =>
            (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION
             || s.structureType == STRUCTURE_TOWER)
            && s.id !== excludeId
            && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            && !isUnreachableId(creep.room, s.id)});
    }
    if(targets.length == 0) {
        return null;
    }
    return creep.pos.findClosestByRange(targets);
}

/**
 * Move one step towards a fill target, and GUARANTEE the step happens.
 *
 * creep.MoveCostMatrixRoadPrio() drives PathFinder with a road-priority cost
 * matrix at maxRooms 1 / maxOps 1000. When that search comes back EMPTY it
 * still stores the empty path and calls move(undefined), so the creep silently
 * stays where it is - and because the stored path is empty it re-runs the same
 * failing search every tick forever. Live E14S9 after the reservation fix: two
 * LOADED fillers parked at range 2 from half-empty extensions, fatigue 0,
 * memory.path = [], for 130+ ticks, while the room ran on 42 of 1300 energy.
 *
 * So: if the creep has not left its tile for three ticks running, drop the
 * cached path and hand the step to the engine's own moveTo, which has no such
 * failure mode. Normal traffic jams resolve inside those three ticks and never
 * reach the fallback.
 */
/**
 * How long a filler may chase ONE target without ever getting adjacent to it
 * before the room writes that target off. This is the catch-all behind the
 * reachability flood fill: it also covers targets that are technically
 * reachable but effectively not (a permanent traffic wedge, a creep parked in
 * the only approach tile, a door that only opens when someone dies).
 */
const APPROACH_GIVE_UP = 50;

function advanceTo(creep, target, swampPrio = false) {
    if(creep.pos.isNearTo(target)) {
        delete creep.memory.stuckAt;
        delete creep.memory.stuckFor;
        delete creep.memory.tryT;
        delete creep.memory.tryFor;
        delete creep.memory.tryD;
        return;
    }

    // Failed-approach ledger. Counts ticks spent making NO PROGRESS towards
    // one target - the counter resets both when the creep arrives (above) and
    // whenever it gets closer than it has ever been to this target, so a long
    // walk across the base, a detour and an ordinary hub queue all keep it at
    // zero. Only a creep that is genuinely not converging trips it, and then
    // the target goes on the room-wide TTL blacklist so the other fillers stop
    // walking into the same wall too.
    //
    // The progress term matters: without it the first live run wrote off
    // spawn@20,40 in E11S2 and extension@45,36 in E17S4 purely because those
    // fillers were queued behind other fillers for 30 ticks.
    if(target && target.id) {
        let range = creep.pos.getRangeTo(target);
        if(creep.memory.tryT === target.id) {
            if(range < (creep.memory.tryD === undefined ? 999 : creep.memory.tryD)) {
                creep.memory.tryD = range;
                creep.memory.tryFor = 0;
            }
            else {
                creep.memory.tryFor = (creep.memory.tryFor || 0) + 1;
            }
        }
        else {
            creep.memory.tryT = target.id;
            creep.memory.tryD = range;
            creep.memory.tryFor = 0;
        }
        if(creep.memory.tryFor >= APPROACH_GIVE_UP) {
            // blacklistFillTarget() refuses the room's backbone (spawn,
            // storage, terminal), so only report what it actually took - the
            // first live run logged fillers "giving up" on their own spawn
            // while the blacklist had correctly ignored the request.
            if(blacklistFillTarget(creep.room, target.id)) {
                console.log("filler", creep.name, "gave up on", target.structureType, target.pos.x + "," + target.pos.y, "in", creep.room.name, "- blacklisted");
            }
            delete creep.memory.tryT;
            delete creep.memory.tryFor;
            delete creep.memory.tryD;
            creep.memory.t = false;
            creep.memory.path = false;
            delete creep.memory.MoveTargetId;
            return;
        }
    }

    if(creep.fatigue > 0) {
        return;
    }

    let here = creep.pos.x + "," + creep.pos.y;
    if(creep.memory.stuckAt === here) {
        creep.memory.stuckFor = (creep.memory.stuckFor || 0) + 1;
    }
    else {
        creep.memory.stuckAt = here;
        creep.memory.stuckFor = 0;
    }

    // Wedged, not merely jammed. Two loaded fillers fit in the pocket a v2 hub
    // leaves around its storage and then block each other's only exit, so BOTH
    // pathfinders answer "no path" and neither ever yields: live E14S9 had a
    // pair standing two tiles from a half-empty extension with stuckFor past
    // 400, holding 345 energy between them, until they died of old age. Shove
    // whatever is in the way and take its tile.
    if(creep.memory.stuckFor >= 8) {
        // only a wedge the shove below did NOT clear is worth a line; a hub as
        // busy as E14S9 produces a few dozen one-tick jams every 100 ticks
        if(creep.memory.stuckFor >= 50 && creep.memory.stuckFor % 50 == 8) {
            console.log("filler", creep.name, "wedged at", creep.pos.x + "," + creep.pos.y, "for", creep.memory.stuckFor, "ticks in", creep.room.name);
        }
        // Step onto a NEIGHBOURING tile by hand. Aiming straight at the target
        // is useless here - inside a hub the tile between the filler and the
        // extension it wants is usually another extension - so walk the 8
        // neighbours and drop the ones terrain or an obstacle structure rules
        // out. Live E14S9 has a filler parked on 23,25, whose only four exits
        // are diagonal road tiles (storage, spawn, tower and an extension take
        // the other four) and all four were held by other hub traffic.
        //
        // Free tiles win. If every exit is held by a creep the pick ROTATES on
        // the stuck counter: SwapPositionWithCreep only shoves a neighbour that
        // has not already moved this tick, so retrying the same neighbour every
        // tick is a guaranteed livelock while cycling through them is not.
        let terrain = creep.room.getTerrain();
        let free = [];
        let occupied = [];
        for(let dx = -1; dx <= 1; dx++) {
            for(let dy = -1; dy <= 1; dy++) {
                if(dx == 0 && dy == 0) continue;
                let x = creep.pos.x + dx;
                let y = creep.pos.y + dy;
                if(x < 1 || x > 48 || y < 1 || y > 48) continue;
                if(terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                let blocked = false;
                for(let structure of creep.room.lookForAt(LOOK_STRUCTURES, x, y)) {
                    if(OBSTACLE_OBJECT_TYPES.indexOf(structure.structureType) !== -1) {
                        blocked = true;
                        break;
                    }
                }
                if(blocked) continue;
                let step:any = {pos: new RoomPosition(x, y, creep.room.name), range: target.pos.getRangeTo(x, y)};
                if(creep.room.lookForAt(LOOK_CREEPS, x, y).length > 0) {
                    occupied.push(step);
                }
                else {
                    free.push(step);
                }
            }
        }
        free.sort((a:any, b:any) => a.range - b.range);
        occupied.sort((a:any, b:any) => a.range - b.range);

        let step:any = null;
        if(free.length > 0) {
            step = free[0];
        }
        else if(occupied.length > 0) {
            step = occupied[creep.memory.stuckFor % occupied.length];
        }
        if(step) {
            let direction = creep.pos.getDirectionTo(step.pos);
            creep.SwapPositionWithCreep(direction);
            creep.move(direction);
            creep.memory.moving = true;
        }
        return;
    }

    if(creep.memory.stuckFor >= 3) {
        creep.memory.path = false;
        delete creep.memory.MoveTargetId;
        creep.moveTo(target, {range: 1, reusePath: 3});
        creep.memory.moving = true;
        return;
    }

    if(swampPrio) {
        creep.MoveCostMatrixSwampPrio(target, 1);
    }
    else {
        creep.MoveCostMatrixRoadPrio(target, 1);
    }
}

const run = function (creep) {
    creep.memory.moving = false;
    if(creep.ticksToLive == 1499 || Game.time % 40 == 0 || !creep.room.memory.reserveFill) {
        creep.room.memory.reserveFill = [];
    }
    if(creep.evacuate()) {
		return;
	}
    if(creep.ticksToLive == 22 && creep.memory.storage && creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "filler")}}).length == 1) {
        let newName = 'filler-'+ Math.floor(Math.random() * Game.time) + "-" + creep.room.name;
        if(creep.room.controller.level <= 3 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,MOVE], newName, {memory: {role: 'filler'}});
        }
        else if(creep.room.controller.level >= 4 && creep.room.controller.level <= 6 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'filler'}});
        }
        else if(creep.room.controller.level == 7 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE], newName, {memory: {role: 'filler'}});
        }
        else if(creep.room.controller.level == 8 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'filler'}});
        }
        console.log("added filler to spawn queue", creep.room.name)
    }
	if(creep.ticksToLive <= 14 && !creep.memory.full) {
		creep.memory.suicide = true;
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

    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full) {
        if(creep.room.controller && (creep.room.controller.level <= 6 && creep.store[RESOURCE_ENERGY] < 50 || creep.room.controller.level == 7 && creep.store[RESOURCE_ENERGY] < 100 || creep.room.controller.level == 8 && creep.store[RESOURCE_ENERGY] < 200)) {
            creep.memory.full = false;
            creep.memory.t = false;
        }
    }



    if(!creep.memory.full) {
        // native getter is authoritative — the Structures cache can go stale
        // when a storage is newly built (planV2 rooms), and a filler that
        // loses its storage falls into the cross-map scavenge path while the
        // spawn starves (E11S5: 774k banked, spawn at 92)
        let storage = creep.room.storage || (creep.room.memory.Structures && Game.getObjectById(creep.room.memory.Structures.storage)) || creep.room.findStorage();
        let bin;
        if(creep.room.memory.Structures) {
            bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);
        }

        // Salvage free floor energy — but the hub outranks it. A range-10 leash
        // is still wide enough to reach a source pile from the hub itself
        // (E17S4: storage 41,34 -> miner drop 33,42 is range 8), and once
        // acquireEnergy...() locks that pile the filler walks the base for it
        // every trip: the room sat at RCL5 with 26k banked and 64 in the spawn.
        // While the bin/storage can supply us, the only loot worth an intent is
        // loot we are already standing next to — that costs no movement, and
        // acquireEnergy...() takes adjacent salvage before it locks anything.
        const hubSupplies =
            (bin && bin.store[RESOURCE_ENERGY] >= MaxStorage) ||
            (storage && storage.store[RESOURCE_ENERGY] > 0);
        const lootRange = hubSupplies ? 1 : 10;
        const freeLoot =
            creep.pos.findInRange(FIND_DROPPED_RESOURCES, lootRange, {
                filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= MaxStorage,
            }).length +
            creep.pos.findInRange(FIND_TOMBSTONES, lootRange, {
                filter: (t) => t.store[RESOURCE_ENERGY] >= MaxStorage,
            }).length +
            creep.pos.findInRange(FIND_RUINS, lootRange, {
                filter: (r) => r.store[RESOURCE_ENERGY] >= MaxStorage,
            }).length;
        if (freeLoot > 0 && !creep.room.memory.danger) {
            creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        } else if(bin && bin.store[RESOURCE_ENERGY] >= MaxStorage) {
            if(creep.pos.isNearTo(bin)) {
                let result = creep.withdraw(bin, RESOURCE_ENERGY);
                if(result == 0) {
                    creep.memory.full = true;
                }
            }
            else {
                advanceTo(creep, bin, true);
            }
        }
        else if(storage && storage.store[RESOURCE_ENERGY] > 0) {
            let result = creep.withdrawStorage(storage);
            if(result == 0) {
                creep.memory.full = true;
            }
        }
        else if(!creep.room.memory.danger) {
            creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        }
    }

    if(creep.memory.full) {
        let storage;
        if(creep.room.memory.Structures) {
            storage = Game.getObjectById(creep.room.memory.Structures.storage) || creep.room.findStorage();
        }


        // creep.memory.t is STICKY — it is only re-asked when the object is
        // gone or full, so a target that turned out to be undeliverable would
        // otherwise be held until the creep dies of old age. Drop it here.
        let target: any = Game.getObjectById(creep.memory.t);
        if(target && isUndeliverable(creep.room, creep.memory.t)) {
            creep.memory.t = false;
            creep.memory.path = false;
            delete creep.memory.MoveTargetId;
            delete creep.memory.tryT;
            delete creep.memory.tryFor;
            delete creep.memory.tryD;
            target = null;
        }
        if(!target) {
            target = creep.findFillerTarget();
        }
        if(target && target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
            target = creep.findFillerTarget();
        }
        // findFillerTarget() returns false as soon as everything it would pick
        // is already reserved by another filler (or by this one, a tick ago) -
        // and the old code then simply did nothing for the rest of the tick.
        // A filler holding energy is never allowed to idle while the room is
        // hungry, so fall back to the reservation-free scan.
        if(!target) {
            target = fillNeed(creep);
            if(target) {
                creep.memory.t = target.id;
            }
        }
        if(target) {
            if(creep.pos.isNearTo(target)) {
                let result = creep.transfer(target, RESOURCE_ENERGY);
                if(result == 0) {
                    let indexOfTargetId = creep.room.memory.reserveFill.indexOf(target.id);
                    if(indexOfTargetId !== -1) {
                        creep.room.memory.reserveFill.splice(indexOfTargetId, 1);
                    }
                }
                if(creep.store[RESOURCE_ENERGY] > target.store.getFreeCapacity(RESOURCE_ENERGY)) {
                    // look-ahead for the leftover in the store. Deliberately
                    // fillNeed() and not findFillerTarget(): the look-ahead used
                    // to burn a SECOND reservation every tick on top of the one
                    // above, which is what let a handful of fillers reserve the
                    // whole extension network and then starve it.
                    let newTarget = fillNeed(creep, target.id) || creep.findFillerTarget();
                    if(newTarget) {
                        creep.memory.t = newTarget.id;
                        advanceTo(creep, newTarget);
                    }
                }
                else {
                    creep.memory.full = false;
                    creep.memory.t = false;
                    if(storage) {
                        creep.MoveCostMatrixRoadPrio(storage, 1);
                    }
                }
            }
            else {
                if(creep.room.memory.danger) {
                    creep.moveToSafePositionToRepairRampart(target, 1);
                }else {
                    advanceTo(creep, target);
                }
            }
        }

    }
}

const roleFiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleFiller;
