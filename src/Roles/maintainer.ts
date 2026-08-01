/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { interiorMove, filterOutposts, dangerNow, interiorReady } from "utils/Interior";

const run = function (creep) {
    ;
    creep.memory.moving = false;

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


    if(creep.memory.repairing) {
        let buildingsToRepair = [];
        (creep.room.memory.keepTheseRoads || []).forEach(function(roadID) {
            let road:any = Game.getObjectById(roadID);
            if(road && road.hits <= road.hitsMax - 500) {
                buildingsToRepair.push(road);
            }
        });
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

        if(!creep.memory.rampartsToRepair) {
            let rampartsInRoom = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.hits < 500000 && (!creep.room.storage || creep.room.storage.pos.getRangeTo(s) >= 9)});
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
                if(rampObj && rampObj.hits <= 50000) {
                    buildingsToRepair.push(rampObj);
                }
            }
        }

        if(creep.room.memory.danger_timer > 0 && storage) {
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
    else {
        if(creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, RESOURCE_ENERGY);
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
