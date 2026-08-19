/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { isSanctionedRampart } from "utils/PlanV2";

/**
 * Weakest sanctioned rampart under 10k, one answer per room per tick.
 *
 * An idle builder runs this EVERY tick (it is the peacetime tower-aiming
 * branch below, and `suicide` stays set for as long as the room has no
 * sites), and every idle builder in the room used to run it independently.
 * Two things changed, neither of them the answer:
 *
 *  - one scan per room per tick instead of one per builder — nothing a creep
 *    does can create or heal a rampart mid-tick, so the sort order is fixed
 *    for the whole tick;
 *  - isSanctionedRampart() is asked about the candidates in ascending-hits
 *    order and the walk stops at the first one that passes, instead of being
 *    asked about every weak rampart in the room up front. Same winner: the
 *    old code filtered by sanctioned-ness and then sorted by hits, which
 *    picks exactly the lowest-hits sanctioned rampart.
 */
let _rampartTick = -1;
let _rampart: {[roomName: string]: any} = {};
function weakestSanctionedRampart(room): any {
	if(_rampartTick !== Game.time) {
		_rampartTick = Game.time;
		_rampart = {};
	}
	if(_rampart[room.name] !== undefined) return _rampart[room.name];

	let weak = room.find(FIND_MY_STRUCTURES, {filter: (s) =>
		s.structureType == STRUCTURE_RAMPART && s.hits < 10000});
	weak.sort((a,b) => a.hits - b.hits);
	let pick = null;
	for(let r of weak) {
		if(isSanctionedRampart(room, r.pos)) {
			pick = r;
			break;
		}
	}
	_rampart[room.name] = pick;
	return pick;
}


/**
 * Re-validate the cached extension/spawn tap against the EXACT predicate the
 * search uses, so the cache can never hand back something the search would
 * not have picked: gone, moved to another room, or drained below the floor
 * all drop it and force a fresh search in the same tick.
 */
function tapStillGood(creep): any {
	const id = creep.memory._tap;
	if(!id) return null;
	const t: any = Game.getObjectById(id);
	if(!t || !t.pos || t.pos.roomName !== creep.room.name || !t.store) {
		creep.memory._tap = false;
		return null;
	}
	const ok = (t.structureType == STRUCTURE_EXTENSION && t.store[RESOURCE_ENERGY] >= 50) ||
		(t.structureType == STRUCTURE_SPAWN && t.store[RESOURCE_ENERGY] >= 300);
	if(!ok) {
		creep.memory._tap = false;
		return null;
	}
	return t;
}

 function findLocked(creep) {
	let buildingsToBuild = creep.room.find(FIND_MY_CONSTRUCTION_SITES);

	// Nothing to build: every rung below is gated on `buildingsToBuild.length
	// > 0` and the only thing that survives all of them is the suicide flag at
	// the bottom, so take it here and skip the FIND_MY_SPAWNS. An idle builder
	// re-enters this function every tick it is alive (memory.locked stays
	// unset), so this is the path it actually runs.
	if(buildingsToBuild.length == 0) {
		creep.memory.suicide = true;
		return;
	}

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
			// E37N57: spawn.y-2 is the hub container. Preferring it before
			// slam-5 left 5 ext at 0/3k. Skip the hub tile until 5 ext stand.
			const extHave = creep.room.find(FIND_MY_STRUCTURES, {
				filter: (s:any) => s.structureType == STRUCTURE_EXTENSION,
			}).length;
			const slam5 = extHave >= 5 || creep.room.energyCapacityAvailable >= 550;
			buildings = buildingsToBuild.filter(function(building) {
				return building.structureType == STRUCTURE_LINK
					|| building.structureType == STRUCTURE_STORAGE
					|| (slam5 && building.pos.x == spawn[0].pos.x && building.pos.y == spawn[0].pos.y -2);
			});
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

	// After slam-5, pave the haul line before leftover source boxes.
	// Loaded shuttles are 2 t/tile on dirt, 1 on road.
	if(buildingsToBuild.length > 0 && creep.room.controller &&
		creep.room.controller.level === 3 && creep.room.energyCapacityAvailable >= 550) {
		const roads = buildingsToBuild.filter(function(building) {return building.structureType == STRUCTURE_ROAD;});
		if(roads.length > 0) {
			creep.memory.suicide = false;
			creep.say("🛤️", true);
			const closest = creep.pos.findClosestByRange(roads);
			return (closest || roads[0]).id;
		}
	}

	// THE PAVER SHARE. Extension/container sites almost always exist in a
	// growing room, so the closest-site fallback at the bottom — the only
	// path that ever picked a road — never ran: the road drip's two sites
	// sat at 0/300 for days ("roads aren't being built. anywhere."). One
	// builder in three works ROADS first; the other two keep the eco order.
	// A road is 300 energy that immediately halves loaded-hauler tick cost,
	// so the paver pays for itself faster than the extension it deferred.
	if(buildingsToBuild.length > 0 && (creep.name.charCodeAt(creep.name.length - 1) % 3) === 0) {
		const roadSites = buildingsToBuild.filter(function(building) {return building.structureType == STRUCTURE_ROAD;});
		if(roadSites.length > 0) {
			creep.memory.suicide = false;
			creep.say("🛤️", true);
			const closest = creep.pos.findClosestByRange(roadSites);
			return (closest || roadSites[0]).id;
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

	let storage: any = Game.getObjectById(creep.memory.storage);
	// W3N3: memory.storage was a live id in another room (or a
	// Structures.storage ghost). getObjectById is global — they
	// path out and never tap the hub at spawn.y-2.
	if(storage && storage.pos && storage.pos.roomName !== creep.room.name) {
		storage = null;
		delete creep.memory.storage;
	}
	if(!storage) storage = creep.findStorage();

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
            let buildTarget: any = Game.getObjectById(creep.memory.locked);
            if(!buildTarget) {
                creep.memory.locked = false;
            } else if (buildTarget.structureType === STRUCTURE_CONTAINER
                && creep.room.controller && creep.room.controller.level <= 2
                && creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
                    filter: (s:any) => s.structureType === STRUCTURE_EXTENSION,
                }).length) {
                // E37N57: locked hub while 5 ext sat 0/3k. Slam-5 first.
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
		} else if(storage.structureType !== STRUCTURE_STORAGE &&
				(storage.store[RESOURCE_ENERGY] || 0) <
				((creep.room.controller && creep.room.controller.level >= 8) ? 150000
					: (creep.room.controller && creep.room.controller.level >= 7) ? 80000
					: (creep.room.controller && creep.room.controller.level >= 6) ? 30000
					: 500) &&
				creep.room.energyAvailable >= Math.min(550, creep.room.energyCapacityAvailable || 550) &&
				creep.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
			// Bank below the withdraw floor + sites: tap ext (spawn only
			// if it still holds a miner). RCL2 cap is 300–500 so a hard
			// 550 never fired — W3N3 builders sat 0e next to a full net.
			//
			// The pick is held in creep memory for the walk instead of being
			// re-derived every tick. Re-searching bought nothing: the search
			// is closest-to-me and walking towards the winner only shortens
			// that distance, so the same structure came back tick after tick
			// while a full FIND_MY_STRUCTURES scan was paid for it. The cache
			// is re-validated against the SAME predicate every tick (still
			// alive, still in this room, still holding enough) and dropped
			// the moment it fails, so it can never hand back a drained or
			// dead tap.
			let tap: any = tapStillGood(creep);
			if(!tap) {
				tap = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s:any) =>
					(s.structureType == STRUCTURE_EXTENSION && s.store[RESOURCE_ENERGY] >= 50) ||
					(s.structureType == STRUCTURE_SPAWN && s.store[RESOURCE_ENERGY] >= 300)});
				creep.memory._tap = tap ? tap.id : false;
			}
			if(tap && creep.withdraw(tap, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
				creep.MoveCostMatrixRoadPrio(tap, 1);
			}
		} else {
            // Real storage exists but is below the withdraw floor. Do not
            // drain the extension net the fillers are trying to fill
            // (E36N57: storage 104, 8 sites, builders emptying 450/450).
            creep.acquireEnergyWithContainersAndOrDroppedEnergy();
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
		// A surplus builder REPAIRS the weak rampart itself — it is a WORK
		// creep standing right there. Creep repair is 100 hits per energy;
		// a tower shot is 10 energy for 800 hits at range <=5 falling to 200
		// at range 20, i.e. 20-80 hits per energy, and every shot is another
		// 10 energy the fillers ferry back into the tower. Aiming the whole
		// battery from here (the old roomTowersRepairTarget call) is why
		// "towers repair everywhere": M towers x 10 energy per tick against
		// scattered personal ramparts, out of the same store that pays for
		// creeps. Towers keep exactly one repair duty now — the bounded
		// weakest-shell-tile top-up in rooms.defence (decay floor).
		if(!creep.room.memory.danger && creep.store[RESOURCE_ENERGY] > 0) {
			const weakest = weakestSanctionedRampart(creep.room);
			if(weakest) {
				if(creep.pos.inRangeTo(weakest, 3)) creep.repair(weakest);
				else creep.MoveCostMatrixRoadPrio(weakest, 3);
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
