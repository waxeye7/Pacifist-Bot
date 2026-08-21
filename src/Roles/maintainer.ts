/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { interiorMove, filterOutposts, dangerNow, interiorReady, rampartIsBuried } from "utils/Interior";
import { isSanctionedRampart } from "utils/PlanV2";

/**
 * Stable 0..mod-1 offset from a creep name. Copied from Roles/energyMiner —
 * a bare `Game.time % N` fires for the whole roster on the same tick, which
 * turns a saving into a periodic spike; hashing the name spreads the re-scans
 * evenly across the N ticks instead.
 */
function nameOffset(name: string, mod: number): number {
    let h = 0;
    for(let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return h % mod;
}

/**
 * How often ONE maintainer re-walks the whole keepTheseRoads id list.
 *
 * The walk is a Game.getObjectById per id, and the list is 58-120 ids in a
 * developed room — so a maintainer paid 58-120 lookups EVERY tick to answer
 * "which road is worth walking to", against a road that decays at 100 hits per
 * 1000 ticks and a repair threshold of 500 hits below max. Nothing in that list
 * can become worth repairing inside ten ticks that was not already close to it,
 * and the creep spends most of those ten ticks walking to whatever it picked.
 * Measured shard3 (limit 20, avg 20.6): repair + maintainer 2.81 CPU over 9
 * creeps.
 */
const ROAD_WALK_EVERY = 10;

const run = function (creep) {
    ;
    creep.memory.moving = false;

    if(creep.holdForFlee()) {
        return;
    }

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }
    if(creep.evacuate()) {
		return;
	}
    if(creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
        creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.repairing = false;
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }

    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
    if(!storage) {
        const S = creep.room.memory.Structures || {};
        storage = Game.getObjectById(S.bin) || Game.getObjectById(S.storage);
    }
    if(!storage) {
        const boxes = creep.room.find(FIND_STRUCTURES, {filter: (s:any) =>
            s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0});
        if(boxes.length) storage = creep.pos.findClosestByRange(boxes);
    }


    if(creep.memory.repairing) {
        let buildingsToRepair = [];
        let roadIds = creep.room.memory.keepTheseRoads || [];
        // Resolved ONCE and reused by the walk gate, the hub clip and the
        // outpost defer below; it used to be asked twice per tick per creep.
        const danger = dangerNow(creep.room);

        // THE FULL LIST IS WALKED EVERY ROAD_WALK_EVERY TICKS, NOT EVERY TICK.
        //
        // Between walks the creep carries ONE id — the road it was closest to
        // when it last looked — and validates it with a single getObjectById.
        // While that road is alive and still damaged it is the whole road half
        // of the target list, which is what the creep was walking to anyway.
        // The moment it dies (decayed away, replanned) or reaches full hp (we
        // just finished repairing it) the walk is forced immediately, so the
        // throttle can never leave a maintainer idle in front of a broken road.
        //
        // ...and NEVER under danger. The clip below drops everything further
        // than 10 from the hub, so a single cached target that happens to sit
        // outside that ring would empty the list — and an empty list in a room
        // this module has no interior geometry for sets suicide. Raids are rare
        // and are not where the 17.55 CPU is; walk the whole list then.
        //
        // The offset is hashed off the creep NAME so a room's maintainers do
        // not all re-walk on the same tick — see nameOffset above.
        let walkRoads = danger || (Game.time + nameOffset(creep.name, ROAD_WALK_EVERY)) % ROAD_WALK_EVERY == 0;
        if(!walkRoads) {
            let held:any = creep.memory._roadTarget ? Game.getObjectById(creep.memory._roadTarget) : null;
            if(held && held.hits <= held.hitsMax - 500) {
                buildingsToRepair.push(held);
            }
            else {
                delete creep.memory._roadTarget;
                walkRoads = true;
            }
        }
        if(walkRoads) {
            // keepTheseRoads never drops dead ids; prune as we walk or
            // maintainers keep scanning ghosts forever
            let liveRoadIds = [];
            let closestRoad:any = null;
            let closestRange = Infinity;
            for(let i = 0; i < roadIds.length; i++) {
                let road:any = Game.getObjectById(roadIds[i]);
                if(!road) continue;
                liveRoadIds.push(roadIds[i]);
                if(road.hits <= road.hitsMax - 500) {
                    buildingsToRepair.push(road);
                    let range = creep.pos.getRangeTo(road);
                    if(range < closestRange) {
                        closestRange = range;
                        closestRoad = road;
                    }
                }
            }
            if(liveRoadIds.length !== roadIds.length) {
                creep.room.memory.keepTheseRoads = liveRoadIds;
            }
            // what the mover below would have picked out of the road half, kept
            // so the next nine ticks need one lookup instead of a hundred
            if(closestRoad) {
                creep.memory._roadTarget = closestRoad.id;
            }
            else {
                delete creep.memory._roadTarget;
            }
        }

        let containers;
        if(creep.room.controller.level <= 6) {
            containers = creep.room.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_CONTAINER});
        }
        else {
            containers = creep.room.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_CONTAINER && s.id == creep.room.memory.Structures.bin});
        }

        if(containers.length > 0) {
            for(let container of containers) {
                if(container.hits <= container.hitsMax - 500) {
                    buildingsToRepair.push(container);
                }
            }
        }

        // Only ramparts the room's plan / perimeter actually sanctions. Without
        // this the list is "every rampart under 500k", which in a plan-v2 room
        // means the abandoned off-plan ramparts of the old square stamp get
        // nursed forever and can never decay away. See PlanV2
        // sanctionedRampartKeys.
        //
        // Sanctioned is not sufficient: a sanctioned rampart the enclosure
        // trades left BURIED (depth >= 4 behind the final wall, out of ranged
        // reach from every standable exterior tile) is upkeep on a tile nothing
        // can shoot. See utils/Interior rampartIsBuried.
        if(!creep.memory.rampartsToRepair) {
            let rampartsInRoom = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.hits < 500000 && (!creep.room.storage || creep.room.storage.pos.getRangeTo(s) >= 9) && isSanctionedRampart(creep.room, s.pos) && !rampartIsBuried(creep.room, s.pos)});
            let idsOfRamparts = [];
            for(let rampart of rampartsInRoom) {
                idsOfRamparts.push(rampart.id);
            }
            creep.memory.rampartsToRepair = idsOfRamparts;
        }

        let rampartsIDS = creep.memory.rampartsToRepair;
        if(rampartsIDS.length > 0) {
            for(let rampart of rampartsIDS) {
                let rampObj:any = Game.getObjectById(rampart);
                // re-checked at use, not just at build: the list is cached in
                // creep memory for the creep's whole life, so a creep that
                // locked its list before the room adopted a plan must not keep
                // feeding off-plan ramparts for another 1500 ticks
                if(rampObj && rampObj.hits <= 50000 && isSanctionedRampart(creep.room, rampObj.pos) && !rampartIsBuried(creep.room, rampObj.pos)) {
                    buildingsToRepair.push(rampObj);
                }
            }
        }

        // Clip to the hub only while hostiles are actually here. danger_timer
        // decays for many ticks after the raid; sit-tight is keyed off
        // dangerNow, so a trailing clip emptied the list and they suicided
        // instead of going back to outpost roads.
        if(danger && storage) {
            buildingsToRepair = buildingsToRepair.filter(function(b) {return storage.pos.getRangeTo(b) <= 10;});
        }

        // Outpost work is DEFERRED, not abandoned: the maintainer's whole
        // target list is roads and containers, most of which are the source /
        // controller / mineral lines OUTSIDE the min-cut shell. While the room
        // is under attack those are dropped, and — critically — an empty list
        // for that reason must NOT set suicide, or every siege would recycle
        // the room's maintainers and leave the roads to decay afterwards.
        const outposted = interiorReady(creep.room) && danger;
        if (outposted) buildingsToRepair = filterOutposts(creep.room, buildingsToRepair);

        if(buildingsToRepair.length > 0) {
            let closeByBuildings = creep.pos.findInRange(buildingsToRepair, 3);
            if(closeByBuildings.length > 0) {
                creep.repair(closeByBuildings[closeByBuildings.length - 1])
                if(closeByBuildings[closeByBuildings.length - 1].hits !== closeByBuildings[closeByBuildings.length - 1].hitsMax) {
                    const t = closeByBuildings[closeByBuildings.length - 1];
                    if (!interiorMove(creep, t, 1)) creep.MoveCostMatrixRoadPrio(t, 1)
                }
                else {
                    if (!interiorMove(creep, closeByBuildings[0], 0)) creep.MoveCostMatrixRoadPrio(closeByBuildings[0], 0)
                }
            }
            else {
                const t = creep.pos.findClosestByRange(buildingsToRepair);
                if (!interiorMove(creep, t, 3)) creep.MoveCostMatrixRoadPrio(t, 3)
            }
        }
        else if (outposted) {
            // nothing left inside the wall to fix — sit tight behind it
            if (storage && !creep.pos.isNearTo(storage)) {
                if (!interiorMove(creep, storage, 1)) creep.MoveCostMatrixRoadPrio(storage, 1)
            }
        }
        else {
            creep.memory.suicide = true;
        }

    }
    else if(storage) {
        if(creep.pos.isNearTo(storage)) {
            // withdrawStorage owns the floor/cap. A bare withdraw emptied
            // the bank reserved for fillers.
            creep.withdrawStorage(storage);
        }
        else {
            if (!interiorMove(creep, storage, 1)) creep.MoveCostMatrixRoadPrio(storage, 1)
        }
    }


}

const roleMaintainer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleMaintainer;
