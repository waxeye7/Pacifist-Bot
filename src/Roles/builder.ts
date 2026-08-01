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
		creep.memory.suicide = false;
		creep.say("🎯", true);
		let closestBuildingToBuild = creep.pos.findClosestByRange(buildingsToBuild);
		// buildingsToBuild.sort((a,b) => b.progressTotal - a.progressTotal);
        // return buildingsToBuild[0].id;
		return closestBuildingToBuild.id;
		// if building is link or storage build first.
    }
	creep.memory.suicide = true;
}

 const run = function (creep) {
	creep.memory.moving = false;

	if(creep.evacuate()) {
		return;
	}


	if(creep.memory.fleeing) {
		// find hostiles with attack or ranged attack
		let hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
		let meleeHostiles = hostiles.filter(c => c.getActiveBodyparts(ATTACK) > 0 );
		let rangedHostiles = hostiles.filter(c => c.getActiveBodyparts(RANGED_ATTACK) > 0 );
		if(rangedHostiles.length) {
				let closestRangedHostile = creep.pos.findClosestByRange(rangedHostiles);
				if(creep.pos.getRangeTo(closestRangedHostile) <= 8) {
						return;
				}
		}
		else if(meleeHostiles.length) {
				let closestMeleeHostile = creep.pos.findClosestByRange(meleeHostiles);
				if(creep.pos.getRangeTo(closestMeleeHostile) <= 6) {
						return;
				}
		}
}
else if(!creep.memory.danger) {
		creep.memory.fleeing = false;
}

	// const start = Game.cpu.getUsed()

	let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

	if(storage && creep.pos.isNearTo(storage) && creep.getActiveBodyparts(WORK) * 5 >= creep.store[RESOURCE_ENERGY]) {
		creep.withdraw(storage, RESOURCE_ENERGY);
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
		// idle builders point the towers at a weak rampart instead of recycling —
		// but ONLY at a rampart the plan/perimeter sanctions. Unfiltered, this
		// aimed tower energy at abandoned off-plan stamp ramparts, which is the
		// most expensive way there is to defeat decay. See PlanV2
		// sanctionedRampartKeys.
		let myRamparts = creep.room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_RAMPART && (s.hits < 450000 && creep.room.memory.danger || s.hits < 10000) && isSanctionedRampart(creep.room, s.pos)});
		if(myRamparts.length) {
			myRamparts.sort((a,b) => a.hits - b.hits);
			creep.room.roomTowersRepairTarget(myRamparts[0]);
			return;
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
