/**
 * The controller depot — the structure an upgrader draws from while it works.
 *
 * `room.memory.Structures.controllerLink` is the key every container/link
 * branch in this role reads, and it is written in exactly two places:
 * creepFunctions.findFillerTarget's `role == "ControllerLinkFiller"` block
 * (creepFunctions.ts:171) and its `role == "filler"` block (:342). Below RCL5
 * neither creep exists — ControllerLinkFiller is gated to RCL>=5 plus a real
 * link (rooms.spawning.ts:1805) and filler is a storage-room role — so in an
 * RCL2-4 room the key is never set, `Game.getObjectById(undefined)` is null,
 * and every controller-container path here was dead code.
 *
 * What the upgrader did instead was fall through to
 * `acquireEnergyWithContainersAndOrDroppedEnergy()`, which takes the CLOSEST
 * worthwhile floor pile in the room — i.e. the drops around the sources.
 * Measured live in E2S7 (RCL3): controller at (17,34), a FULL 2,000-energy
 * controller container at (14,35) three tiles away, and six 4W/1C/1M upgraders
 * shuttling to the source pile at (17,26) instead — eight tiles each way at
 * fatigue 5 per plain step. They were empty most of their lives and the room
 * made ~6 progress/tick against a 24/tick ceiling.
 *
 * So resolve the depot from the room rather than trusting the memory key:
 * the closest link within 4 of the controller at RCL7+, otherwise the closest
 * container within 4 that is not a source container, the bin or the storage.
 * The room key still wins when something did set it.
 */
function controllerDepot(creep: any): any {
	const room = creep.room;
	const ctrl = room.controller;
	if (!ctrl) return null;
	if (!room.memory.Structures) room.memory.Structures = {};

	const fromRoom: any = Game.getObjectById(room.memory.Structures.controllerLink);
	if (fromRoom) return fromRoom;

	const mem: any = creep.memory.controllerLink;
	if (mem && mem.id && Game.time - (mem.t || 0) < 100) {
		const cached: any = Game.getObjectById(mem.id);
		if (cached) return cached;
	}

	const S: any = room.memory.Structures;
	const sources = room.find(FIND_SOURCES);
	const candidates = room.find(FIND_STRUCTURES, {
		filter: (s: any) =>
			(s.structureType == STRUCTURE_CONTAINER || (s.structureType == STRUCTURE_LINK && s.my)) &&
			s.id !== S.bin &&
			s.id !== S.storage &&
			s.pos.getRangeTo(ctrl) <= 4 &&
			s.pos.findInRange(sources, 1).length == 0,
	});
	if (!candidates.length) {
		delete creep.memory.controllerLink;
		return null;
	}

	const depot: any = ctrl.pos.findClosestByRange(candidates);
	if (!mem || mem.id !== depot.id) creep.memory.controllerLink = { id: depot.id, t: Game.time };
	else mem.t = Game.time;
	return depot;
}

/**
 * A tile that is adjacent to the depot AND inside upgrade range of the
 * controller, so the creep can withdraw and upgrade in the same tick without
 * ever moving again. Without this the creep only gets "range 1 of the depot",
 * which can be range 4 from the controller, and it oscillates a tile forever.
 *
 * The choice is cached in creep memory alongside the depot id and other
 * upgraders' claims are skipped, so the roster spreads over the available
 * tiles instead of fighting for the best one. Creeps that find no free tile
 * get null and keep the old shuttle behaviour.
 */
function depotPark(creep: any, depot: any): any {
	const room = creep.room;
	const ctrl = room.controller;
	const mem: any = creep.memory.controllerLink;
	if (mem && mem.id == depot.id && mem.x !== undefined) {
		return { pos: new RoomPosition(mem.x, mem.y, room.name), id: "ctrlpark:" + mem.x + "," + mem.y };
	}

	const taken: any = {};
	for (const other of room.find(FIND_MY_CREEPS)) {
		if (other.id == creep.id) continue;
		const m: any = other.memory.controllerLink;
		if (m && m.x !== undefined) taken[m.x + "," + m.y] = true;
	}

	const terrain = room.getTerrain();
	let best: RoomPosition = null;
	let bestScore = 9999;
	for (let dx = -1; dx <= 1; dx++) {
		for (let dy = -1; dy <= 1; dy++) {
			if (dx == 0 && dy == 0) continue;
			const x = depot.pos.x + dx;
			const y = depot.pos.y + dy;
			if (x < 1 || x > 48 || y < 1 || y > 48) continue;
			if (terrain.get(x, y) == TERRAIN_MASK_WALL) continue;
			if (taken[x + "," + y]) continue;
			const pos = new RoomPosition(x, y, room.name);
			const ctrlRange = pos.getRangeTo(ctrl);
			if (ctrlRange > 3) continue;
			let blocked = false;
			for (const s of pos.lookFor(LOOK_STRUCTURES)) {
				if ((OBSTACLE_OBJECT_TYPES as any[]).indexOf(s.structureType) >= 0) {
					blocked = true;
					break;
				}
			}
			if (blocked) continue;
			const score = ctrlRange * 10 + creep.pos.getRangeTo(pos);
			if (score < bestScore) {
				bestScore = score;
				best = pos;
			}
		}
	}

	if (!best) {
		creep.memory.controllerLink = { id: depot.id, t: Game.time };
		return null;
	}
	creep.memory.controllerLink = { id: depot.id, x: best.x, y: best.y, t: Game.time };
	return { pos: best, id: "ctrlpark:" + best.x + "," + best.y };
}

/**
 * Does this room have a creep whose ACTUAL job is building?
 *
 * Used to bound the RCL2 build-help above to the bootstrap window. Cached per
 * tick per room because every upgrader in the room asks the same question.
 */
let _builderTick = -1;
let _builderCache: any = {};
function roomHasNoBuilder(room: any): boolean {
	if(_builderTick !== Game.time) {
		_builderTick = Game.time;
		_builderCache = {};
	}
	if(_builderCache[room.name] !== undefined) return _builderCache[room.name];
	let found = false;
	for(const c of room.find(FIND_MY_CREEPS)) {
		if(c.memory.role == "builder") { found = true; break; }
	}
	_builderCache[room.name] = !found;
	return !found;
}

const run = function (creep) {
	creep.memory.moving = false;
	if(creep.evacuate()) {
		return;
	}
	// const start = Game.cpu.getUsed()
	let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

	// ------------------------------------------------------------------
	// Help with construction WITHOUT rewriting memory.role.
	//
	// These two branches used to do `creep.memory.role = "builder"`, which is a
	// PERMANENT, one-way rewrite — and rooms.spawning.ts sizes the roster off
	// memory.role (the `case "upgrader"` arm of the census switch,
	// rooms.spawning.ts:481). So every converted creep silently vanished from
	// `upgraders` and reappeared in `builders`.
	//
	// The RCL2 branch fired on the creep's FIRST tick: a fresh creep has
	// ticksToLive == CREEP_LIFE_TIME == 1500 and 1500 % 100 == 0, and the v2
	// base planner keeps construction sites open permanently, so 100% of RCL2
	// upgraders converted before doing any work. `upgraders` therefore read 0
	// forever, the RCL2 gate (`upgraders < spawnrules[2].upgrade_creep.amount
	// + pressure.burn`, rooms.spawning.ts:1238) never closed, and the room
	// spawned upgraders without limit — while `builders` read 21 and blocked
	// the REAL builder rung (rooms.spawning.ts:1233) from ever running.
	//
	// Measured on the VPS test server, W1N1 @ tick 55531: 30 creeps, 21 named
	// Upgrader-*, _.countBy(memory.role) = {builder:21, upgrader:0} against a
	// target of 4. RCL2 for ~6,400 ticks with controller.progress == 89, spawn
	// / extensions / container all at 0 energy, and every one of those 21
	// creeps standing still with an empty store.
	//
	// Delegating for the tick keeps the intent and keeps the census honest.
	// At RCL2 the help is limited to the bootstrap window — while the room has
	// no real builder yet — so that once the builder rung delivers, upgraders
	// go back to upgrading and the room can actually climb to RCL3.
	// ------------------------------------------------------------------
	const skeletonCrewNoBank = creep.room.controller && creep.room.controller.level == 4 &&
		!storage && creep.room.find(FIND_MY_CREEPS).length < 9;
	const rcl2Bootstrap = creep.room.controller.level == 2 && roomHasNoBuilder(creep.room);
	if((skeletonCrewNoBank || rcl2Bootstrap) && creep.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
		const builder: any = (global as any).ROLES && (global as any).ROLES.builder;
		if(builder) {
			builder.run(creep);
			return;
		}
	}

	// if(creep.fatigue > 0) {
	// 	console.log('hi')
	// 	creep.room.createConstructionSite(creep.pos, STRUCTURE_ROAD);
	// }

	let controllerLink:any = controllerDepot(creep);
	// Only worth parking against a depot that actually has something in it;
	// an empty one must not pin the creep away from the fallback path. A creep
	// already standing on its park tile takes whatever dribbles in (it costs
	// nothing to wait); one that would have to walk needs a real load waiting.
	const depotEnergy = controllerLink ? controllerLink.store[RESOURCE_ENERGY] : 0;
	const depotStocked = depotEnergy > 0 &&
		(creep.pos.isNearTo(controllerLink) || depotEnergy >= Math.min(50, creep.store.getCapacity(RESOURCE_ENERGY)));
	const park:any = depotStocked ? depotPark(creep, controllerLink) : null;

	if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
		creep.memory.upgrading = false;
		creep.MoveCostMatrixRoadPrio(park || controllerLink, park ? 0 : 1);
	}
	if(!creep.memory.upgrading && creep.store[RESOURCE_ENERGY] > 0) {
		creep.memory.upgrading = true;
	}

	if(creep.memory.upgrading) {
		const outOfRange = creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE;
		if(park) {
			// Head for the park tile whenever we are off it — upgrading and
			// moving are not exclusive, so closing that gap is free.
			if(outOfRange || !creep.pos.isNearTo(controllerLink)) {
				creep.MoveCostMatrixRoadPrio(park, 0);
			}
		}
		else if(outOfRange && creep.room.memory.Structures.controllerLink && creep.pos.getRangeTo(creep.room.controller) == 4) {
			creep.roomCallbackRoadPrioUpgraderInPosition(creep.room.controller, 3);
		}
		else if(outOfRange) {
			creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
		}

		if(controllerLink && creep.pos.isNearTo(controllerLink) && creep.store[RESOURCE_ENERGY] <= creep.getActiveBodyparts(WORK)) {
			creep.withdraw(controllerLink, RESOURCE_ENERGY);
		}

	}
	else {
		if(depotStocked) {
			if(creep.pos.isNearTo(controllerLink)) {
				creep.withdraw(controllerLink, RESOURCE_ENERGY);
				if(!park && creep.ticksToLive % 23 == 0) {
					let lookForRoadsOnCreepPos = creep.pos.lookFor(LOOK_STRUCTURES);
					if(lookForRoadsOnCreepPos.length > 0) {
						for(let building of lookForRoadsOnCreepPos) {
							if(building.structureType == STRUCTURE_ROAD) {
								creep.MoveCostMatrixRoadPrio(creep.room.controller, 2);
							}
						}
					}
				}

			}
			else {
				creep.MoveCostMatrixRoadPrio(park || controllerLink, park ? 0 : 1);
			}
		}
		else if(creep.room.controller.level < 7) {

			if(storage == undefined) {
				let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
				if(result == 0) {
					creep.MoveCostMatrixRoadPrio(creep.room.controller, 3)
				}
			}
			else {
				let result = creep.withdrawStorage(storage);
				if(result == 0) {
					creep.MoveCostMatrixRoadPrio(creep.room.controller, 3)
				}
			}

		}

	}






	if(controllerLink && creep.ticksToLive == 1) {
		creep.transfer(controllerLink, RESOURCE_ENERGY);
	}








	// console.log('Upgrader Ran in', Game.cpu.getUsed() - start, 'ms')


	if(!controllerLink && creep.ticksToLive <= 50 && !creep.memory.upgrading) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
		return;
	}



}




const roleUpgrader = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleUpgrader;
