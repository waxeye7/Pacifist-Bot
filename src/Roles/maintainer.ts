/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { interiorMove, filterOutposts, dangerNow, interiorReady } from "utils/Interior";
import { isSanctionedRampart } from "utils/PlanV2";

const run = function (creep) {
    ;
    creep.memory.moving = false;

    // Honor defence's flee step (issued before creeps run; moving here would
    // overwrite it). Same gate as builder/carry.
    if(creep.memory.fleeing) {
        let hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        let meleeHostiles = hostiles.filter(c => c.getActiveBodyparts(ATTACK) > 0);
        let rangedHostiles = hostiles.filter(c => c.getActiveBodyparts(RANGED_ATTACK) > 0);
        if(rangedHostiles.length && creep.pos.getRangeTo(creep.pos.findClosestByRange(rangedHostiles)) <= 8) {
            return;
        }
        else if(meleeHostiles.length && creep.pos.getRangeTo(creep.pos.findClosestByRange(meleeHostiles)) <= 6) {
            return;
        }
    }
    else if(!creep.room.memory.danger) {
        creep.memory.fleeing = false;
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
        // keepTheseRoads never drops dead ids; prune as we walk or
        // maintainers keep scanning ghosts forever
        let roadIds = creep.room.memory.keepTheseRoads || [];
        let liveRoadIds = [];
        for(let i = 0; i < roadIds.length; i++) {
            let road:any = Game.getObjectById(roadIds[i]);
            if(!road) continue;
            liveRoadIds.push(roadIds[i]);
            if(road.hits <= road.hitsMax - 500) {
                buildingsToRepair.push(road);
            }
        }
        if(liveRoadIds.length !== roadIds.length) {
            creep.room.memory.keepTheseRoads = liveRoadIds;
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
        if(!creep.memory.rampartsToRepair) {
            let rampartsInRoom = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.hits < 500000 && (!creep.room.storage || creep.room.storage.pos.getRangeTo(s) >= 9) && isSanctionedRampart(creep.room, s.pos)});
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
                if(rampObj && rampObj.hits <= 50000 && isSanctionedRampart(creep.room, rampObj.pos)) {
                    buildingsToRepair.push(rampObj);
                }
            }
        }

        // Clip to the hub only while hostiles are actually here. danger_timer
        // decays for many ticks after the raid; sit-tight is keyed off
        // dangerNow, so a trailing clip emptied the list and they suicided
        // instead of going back to outpost roads.
        if(dangerNow(creep.room) && storage) {
            buildingsToRepair = buildingsToRepair.filter(function(b) {return storage.pos.getRangeTo(b) <= 10;});
        }

        // Outpost work is DEFERRED, not abandoned: the maintainer's whole
        // target list is roads and containers, most of which are the source /
        // controller / mineral lines OUTSIDE the min-cut shell. While the room
        // is under attack those are dropped, and — critically — an empty list
        // for that reason must NOT set suicide, or every siege would recycle
        // the room's maintainers and leave the roads to decay afterwards.
        const outposted = interiorReady(creep.room) && dangerNow(creep.room);
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
