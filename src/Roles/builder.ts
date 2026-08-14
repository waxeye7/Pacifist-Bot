/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { isSanctionedRampart } from "utils/PlanV2";

 function findLocked(creep) {
	let buildingsToBuild = creep.room.find(FIND_MY_CONSTRUCTION_SITES);

	// ------------------------------------------------------------------
	// SPAWN FIRST — absolute, and ahead of every other rule in this function.
	//
	// A room with no spawn standing cannot make a creep, so nothing else in it
	// is worth a build tick. The ordering below used to put EXTENSION second
	// (before container, before the closest-site fallback), so in a spawnless
	// room a builder would finish the extensions and leave the spawn site
	// sitting — which is exactly what happened in E15S6.
	//
	// This also guards the RCL2 branch just below, which dereferences
	// `spawn[0].pos` with no length check and throws outright in a spawnless
	// RCL2 room (a fresh claim whose colonisation builder upgraded it to 2
	// before the spawn was built — the normal case, not a corner one).
	// ------------------------------------------------------------------
	const mySpawns = creep.room.find(FIND_MY_SPAWNS);
	if(buildingsToBuild.length > 0 && mySpawns.length == 0) {
		const spawnSites = buildingsToBuild.filter(function(building) {return building.structureType == STRUCTURE_SPAWN;});
		if(spawnSites.length > 0) {
			creep.memory.suicide = false;
			creep.say("🏗️", true);
			spawnSites.sort((a,b) => b.progress - a.progress);
			return spawnSites[0].id;
		}
	}

	if(buildingsToBuild.length > 0) {
		let buildings;
		if(creep.room.controller.level == 2 && mySpawns.length > 0) {
			let spawn = mySpawns;
			buildings = buildingsToBuild.filter(function(building) {return building.structureType == STRUCTURE_LINK || building.structureType == STRUCTURE_STORAGE || building.pos.x == spawn[0].pos.x && building.pos.y == spawn[0].pos.y -2;});
		}
		else {
			buildings = buildingsToBuild.filter(function(building) {return building.structureType == STRUCTURE_LINK || building.structureType == STRUCTURE_STORAGE;});
		}

		if(buildings.length > 0) {
			creep.memory.suicide = false;
			creep.say("🎯", true);
			buildings.sort((a,b) => b.progressTotal - a.progressTotal);
			return buildings[0].id;
		}
	}

	// RCL3: controller depot before leftover extensions. The parked 4W
	// only pays once this container exists; the next five extensions
	// raise cap 550→800 but the 4W is already 500e. Same range-4 /
	// not-source-adjacent test as upgrader.ts and carry.ts.
	if(buildingsToBuild.length > 0 && creep.room.controller && creep.room.controller.level == 3) {
		const ctrl = creep.room.controller;
		const sources = creep.room.find(FIND_SOURCES);
		const depotSites = buildingsToBuild.filter(function(building) {
			return building.structureType == STRUCTURE_CONTAINER &&
				building.pos.getRangeTo(ctrl) <= 4 &&
				building.pos.findInRange(sources, 1).length == 0;
		});
		if(depotSites.length > 0) {
			creep.memory.suicide = false;
			creep.say("🎯", true);
			depotSites.sort((a,b) => b.progress - a.progress);
			return depotSites[0].id;
		}
	}

	// Tower before leftover extensions. RCL2 has no tower sites (all 5
	// extensions still go first). RCL3: depot is already above; 550e is
	// enough for the parked 4W, so the next five 3k extensions wait.
	if(buildingsToBuild.length > 0) {
		let towers = buildingsToBuild.filter(function(building) {return building.structureType == STRUCTURE_TOWER;});
		if(towers.length > 0) {
			creep.memory.suicide = false;
			creep.say("🎯", true);
			towers.sort((a,b) => b.progress - a.progress);
			return towers[0].id;
		}
	}

	if(buildingsToBuild.length > 0) {
		let buildings = buildingsToBuild.filter(function(building) {return building.structureType == STRUCTURE_EXTENSION;});
		if(buildings.length > 0) {
			creep.memory.suicide = false;
			creep.say("🎯", true);
			buildings.sort((a,b) => b.progressTotal - a.progressTotal);
			return buildings[0].id;
		}
	}

	if(buildingsToBuild.length > 0) {
		let buildings = buildingsToBuild.filter(function(building) {return building.structureType == STRUCTURE_CONTAINER;});
		if(buildings.length > 0) {
			creep.memory.suicide = false;
			creep.say("🎯", true);
			buildings.sort((a,b) => b.progressTotal - a.progressTotal);
			return buildings[0].id;
		}
	}

    if(buildingsToBuild.length > 0) {
		// RCL3 leftover is arterial roads. 1:1 haulers already walk plains
		// at 1 tick/tile; do not spend the 135k climb paving.
		if(creep.room.controller && creep.room.controller.level == 3) {
			let nonRoad = 0;
			for(let i = 0; i < buildingsToBuild.length; i++) {
				if(buildingsToBuild[i].structureType !== STRUCTURE_ROAD) { nonRoad++; break; }
			}
			if(nonRoad == 0) {
				creep.memory.suicide = true;
				return;
			}
		}
		creep.memory.suicide = false;
		creep.say("🎯", true);
		let closestBuildingToBuild = creep.pos.findClosestByRange(buildingsToBuild);
		return closestBuildingToBuild.id;
    }
	creep.memory.suicide = true;
}

 const run = function (creep) {
	creep.memory.moving = false;

	if(creep.evacuate()) {
		return;
	}


	if(creep.holdForFlee()) {
		return;
	}

	// const start = Game.cpu.getUsed()

	let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

	if(storage && creep.pos.isNearTo(storage) && creep.getActiveBodyparts(WORK) * 5 >= creep.store[RESOURCE_ENERGY]) {
		// withdrawStorage owns the floor/cap. A bare withdraw drained
		// the filler cushion on a thin bank.
		creep.withdrawStorage(storage);
	}

    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.building = false;
    }
    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
        creep.memory.building = true;
    }

    if(creep.memory.building) {
        if(creep.memory.locked) {
            let buildTarget = Game.getObjectById(creep.memory.locked);
            if(!buildTarget) {
                creep.memory.locked = false;
            }
        }

        if(!creep.memory.locked) {
            creep.memory.locked = findLocked(creep);
        }



        if(creep.memory.locked) {
            let buildTarget = Game.getObjectById(creep.memory.locked);
            if(buildTarget && creep.build(buildTarget) == ERR_NOT_IN_RANGE) {
				creep.MoveCostMatrixRoadPrio(buildTarget, 3);
            }
        }
    }

    else if(!creep.memory.building && storage) {
		let result = creep.withdrawStorage(storage);
		if(result == 0) {
			if(!creep.memory.locked) {
				creep.memory.locked = findLocked(creep);
			}
			if(creep.memory.locked) {
				let buildTarget = Game.getObjectById(creep.memory.locked);
				creep.MoveCostMatrixRoadPrio(buildTarget, 3);
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
				let buildTarget = Game.getObjectById(creep.memory.locked);
				creep.MoveCostMatrixRoadPrio(buildTarget, 3);
			}
		}
    }
	if(creep.memory.suicide && creep.store[RESOURCE_ENERGY] == 0 && storage && storage.store[RESOURCE_ENERGY] >= 300) {
		creep.memory.suicide = false;
	}
	// if(creep.ticksToLive <= 30 && !creep.memory.building || storage && storage.store[RESOURCE_ENERGY] < 300 && Game.time % 21 == 0 && creep.store[RESOURCE_ENERGY] == 0) {
	// 	creep.memory.suicide = true;
	// }
	if(creep.memory.suicide == true) {
		// Idle builders aim towers at a sanctioned weak rampart — peacetime
		// only. During danger this stole every tower and never recycled;
		// combat repair belongs to rooms.defence.
		if(!creep.room.memory.danger) {
			let myRamparts = creep.room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_RAMPART && s.hits < 10000 && isSanctionedRampart(creep.room, s.pos)});
			if(myRamparts.length) {
				myRamparts.sort((a,b) => a.hits - b.hits);
				creep.room.roomTowersRepairTarget(myRamparts[0]);
				return;
			}
		}
		creep.recycle();
		return;
	}

 }

const roleBuilder = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleBuilder;
