import { cachedDerived, cachedDropped, cachedMyCreeps, cachedRuins, cachedSites, cachedSources, cachedStructures, cachedTombstones } from "utils/RoomCache";
import { upgradeParkBand } from "Empire/funnel";
import { takeCover } from "utils/Cover";

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
 *
 * CPU: the candidate SET is a pure function of the room (structure positions,
 * the source positions and three room-memory keys), so it is derived once per
 * room per tick and shared by every upgrader in the room — see
 * depotCandidates(). Only the stocked/closest RANKING is per-creep, because
 * `minStock` depends on the creep's carry capacity and stores move mid-tick.
 *
 * Keyed on the current Structures.controllerLink (same convention as
 * creepFunctions' _discoverControllerDepot) so a mid-tick rewrite of that key
 * still re-derives; every upgrader in a room reads the same key, so the memo
 * is shared exactly when it needs to be.
 */
function depotCandidates(room: any, ctrl: any, S: any): any[] {
	return cachedDerived(room, "upgDepotCands:" + (S.controllerLink || "0"), () => {
		const sources = cachedSources(room);
		const candidates: any[] = _.filter(cachedStructures(room), (s: any) =>
			(s.structureType == STRUCTURE_CONTAINER || (s.structureType == STRUCTURE_LINK && s.my)) &&
			s.id !== S.bin &&
			s.id !== S.storage &&
			s.id !== S.StorageLink &&
			s.pos.getRangeTo(ctrl) <= 4 &&
			s.pos.findInRange(sources, 1).length == 0);

		// The room key is a HINT, not gospel. It used to be an unconditional early
		// return, and that is exactly how W2N1 (RCL6) sat 444+ ticks at zero
		// controller progress: creepFunctions' depot derivation only looks at
		// CONTAINERS below RCL7, so the key was pinned to the empty container at
		// (10,9) while the controller LINK at (9,9) — one tile closer to the
		// controller — held a full 800 energy that nobody would ever draw. Keep it
		// as a candidate and let the stocked-first ranking below decide.
		const fromRoom: any = Game.getObjectById(S.controllerLink);
		// The room key is only appended when the filter rejected it, so an
		// unfiltered push can adopt a source container and HOL the source.
		if (fromRoom && !_.some(candidates, (c: any) => c.id === fromRoom.id) &&
			(fromRoom.structureType == STRUCTURE_CONTAINER || (fromRoom.structureType == STRUCTURE_LINK && fromRoom.my)) &&
			fromRoom.id !== S.bin && fromRoom.id !== S.storage && fromRoom.id !== S.StorageLink &&
			fromRoom.pos.getRangeTo(ctrl) <= 4 &&
			fromRoom.pos.findInRange(sources, 1).length == 0) {
			candidates.push(fromRoom);
		}

		return candidates;
	});
}

function controllerDepot(creep: any): any {
	const room = creep.room;
	const ctrl = room.controller;
	if (!ctrl) return null;
	if (!room.memory.Structures) room.memory.Structures = {};

	const S: any = room.memory.Structures;
	// Walkers treat a depot as dry below 50; ranking on energy>0 let a
	// leftover of 1-49 hide a full farther link for the 100t cache.
	const minStock = Math.min(50, creep.store.getCapacity(RESOURCE_ENERGY) || 50);
	const mem: any = creep.memory.controllerLink;

	/* ---- steady state, no finds ------------------------------------------
	 * A parked upgrader asks this question every tick for its whole life and
	 * the answer is the same object every time, yet the cache check used to
	 * sit BELOW two room-wide finds (FIND_SOURCES plus FIND_STRUCTURES with a
	 * per-structure findInRange) — so the cache saved nothing at all and this
	 * function was essentially the entire cost of the role.
	 *
	 * Serve the cached depot without deriving anything when it is STOCKED,
	 * which is exactly the case the ranking below would answer the same way:
	 * a stocked candidate makes `stocked` non-empty and is a member of it, so
	 * pool == stocked contains it and the old cache test passed. A DRY cached
	 * depot still falls through, because then the answer depends on whether
	 * some other candidate is stocked.
	 *
	 * The id can only have been written from a validated candidate, but
	 * re-check the cheap invariants anyway so a cache can never hand back a
	 * dead or repurposed object.
	 */
	if (mem && mem.id && Game.time - (mem.t || 0) < 100) {
		const cached: any = Game.getObjectById(mem.id);
		if (cached && cached.store && cached.store[RESOURCE_ENERGY] >= minStock &&
			(cached.structureType == STRUCTURE_CONTAINER || (cached.structureType == STRUCTURE_LINK && cached.my)) &&
			cached.id !== S.bin && cached.id !== S.storage && cached.id !== S.StorageLink &&
			cached.pos.getRangeTo(ctrl) <= 4) {
			mem.t = Game.time;
			return cached;
		}
	}

	const candidates: any[] = depotCandidates(room, ctrl, S);

	if (!candidates.length) {
		delete creep.memory.controllerLink;
		return null;
	}

	// Prefer a depot that actually HAS energy. An empty container must never
	// out-rank a full link, otherwise the upgrader parks on a dry depot and
	// falls through to the storage path in a room whose storage is also dry.
	// Among equally-stocked candidates, closest to the controller wins.
	const stocked = _.filter(candidates, (c: any) => c.store && c.store[RESOURCE_ENERGY] >= minStock);
	const pool: any[] = stocked.length ? stocked : candidates;

	// Only fall back to the cached pick when it is still in the winning pool —
	// a cache hit must not resurrect the dry depot we just ruled out.
	if (mem && mem.id && Game.time - (mem.t || 0) < 100) {
		const cached: any = Game.getObjectById(mem.id);
		if (cached && _.some(pool, (c: any) => c.id === cached.id)) return cached;
	}

	const depot: any = ctrl.pos.findClosestByRange(pool);
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
 *
 * NEGATIVE answers are cached too. "No free tile" used to be written back as
 * `{id, t}` with no `x`, which is indistinguishable from "never looked" — so
 * every upgrader that lost the race for the last park tile re-ran the whole
 * scan (a room-wide FIND_MY_CREEPS plus up to 8 lookFor) EVERY tick for the
 * rest of its life, which is precisely the creep that has the least to gain
 * from asking again. Retry on a 25-tick timer instead; each creep stamps its
 * own clock, so the retries stay spread across ticks by construction.
 */
const PARK_RETRY = 25;
function depotPark(creep: any, depot: any): any {
	const room = creep.room;
	const ctrl = room.controller;
	const mem: any = creep.memory.controllerLink;
	if (mem && mem.id == depot.id && mem.x !== undefined) {
		return { pos: new RoomPosition(mem.x, mem.y, room.name), id: "ctrlpark:" + mem.x + "," + mem.y };
	}
	if (mem && mem.id == depot.id && mem.nopark && Game.time - mem.nopark < PARK_RETRY) {
		return null;
	}

	const taken: any = {};
	for (const other of cachedMyCreeps(room)) {
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
		creep.memory.controllerLink = { id: depot.id, t: Game.time, nopark: Game.time };
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
	for(const c of cachedMyCreeps(room)) {
		if(c.memory.role == "builder") { found = true; break; }
	}
	_builderCache[room.name] = !found;
	return !found;
}

/** How far from the controller an upgrader will walk for a refill. */
const UPGRADER_TREK_RANGE = 12;

/**
 * Is there anything worth walking to within UPGRADER_TREK_RANGE of the
 * controller? Containers / drops / tombstones / ruins holding at least 50
 * energy (the same floor the walkers use for "this depot is dry").
 *
 * Cached per room per tick: every upgrader in the room asks the identical
 * question, and the answer only changes on the tick boundary.
 */
let _nearTick = -1;
let _nearCache: any = {};
function energyNearController(room: any): boolean {
	if(_nearTick !== Game.time) {
		_nearTick = Game.time;
		_nearCache = {};
	}
	if(_nearCache[room.name] !== undefined) return _nearCache[room.name];
	const ctrl = room.controller;
	let found = false;
	if(ctrl) {
		const R = UPGRADER_TREK_RANGE;
		// Four `pos.findInRange(FIND_*, ...)` calls are four room-wide finds.
		// The tick memo above already collapses them to once per room, but the
		// shared RoomCache lists collapse them across every OTHER role too.
		const p = ctrl.pos;
		found =
			_.some(cachedStructures(room), (s: any) =>
				s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= 50 && p.inRangeTo(s, R)) ||
			_.some(cachedDropped(room), (r: any) =>
				r.resourceType == RESOURCE_ENERGY && r.amount >= 50 && p.inRangeTo(r, R)) ||
			_.some(cachedTombstones(room), (t: any) =>
				t.store[RESOURCE_ENERGY] >= 50 && p.inRangeTo(t, R)) ||
			_.some(cachedRuins(room), (r: any) =>
				r.store[RESOURCE_ENERGY] >= 50 && p.inRangeTo(r, R));
	}
	_nearCache[room.name] = found;
	return found;
}

const run = function (creep) {
	creep.memory.moving = false;

	if(creep.holdForFlee()) {
		return;
	}
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
	// "no bank" = no real STRUCTURE_STORAGE: findStorage() now returns the
	// 2k hub container at RCL4 while the storage is a site, and that is
	// exactly the room this delegation was written for.
	const skeletonCrewNoBank = creep.room.controller && creep.room.controller.level == 4 &&
		(!storage || storage.structureType !== STRUCTURE_STORAGE) && cachedMyCreeps(creep.room).length < 9;
	const rcl2Bootstrap = creep.room.controller && creep.room.controller.level == 2 && roomHasNoBuilder(creep.room);
	if((skeletonCrewNoBank || rcl2Bootstrap) && cachedSites(creep.room).length > 0) {
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
	/*
	 * SAFETY BEFORE THROUGHPUT. A rampart defends the creep standing on it, and
	 * in five of seven live rooms there is one within upgradeController's own
	 * range 3 of the controller — see utils/Cover. depotPark() scores tiles on
	 * range-to-controller and range-to-depot only, so the upgrader parks beside
	 * that tile rather than on it and an invader gets a free 2,500-energy kill.
	 *
	 * takeCover() is a no-op in peacetime, so the park geometry below is
	 * untouched on the ticks that matter for throughput. Under danger it owns
	 * movement, and the creep keeps upgrading from cover: upgradeController and
	 * move are different intent classes, and the depot top-up still works
	 * whenever the cover tile happens to be next to the depot.
	 */
	if(takeCover(creep, creep.room.controller, 3)) {
		if(creep.store[RESOURCE_ENERGY] > 0) {
			creep.upgradeController(creep.room.controller);
			creep.memory.upgrading = true;
		} else {
			creep.memory.upgrading = false;
		}
		if(creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && !creep.grabAdjacentPile() &&
			controllerLink && creep.pos.isNearTo(controllerLink)) {
			creep.withdraw(controllerLink, RESOURCE_ENERGY);
		}
		return;
	}

	// Only worth parking against a depot that actually has something in it;
	// an empty one must not pin the creep away from the fallback path. A creep
	// already standing on its park tile takes whatever dribbles in (it costs
	// nothing to wait); one that would have to walk needs a real load waiting.
	const depotEnergy = controllerLink ? controllerLink.store[RESOURCE_ENERGY] : 0;
	const depotStocked = depotEnergy > 0 &&
		(creep.pos.isNearTo(controllerLink) || depotEnergy >= Math.min(50, creep.store.getCapacity(RESOURCE_ENERGY)));
	const park:any = depotStocked ? depotPark(creep, controllerLink) : null;

	/*
	 * Take the pile before deciding where to walk for a load — see
	 * grabAdjacentPile(). `!upgrading` means the store is empty here: the flip
	 * below is the only thing that sets it, and it sets it whenever the store is
	 * not. So this can never interrupt work in progress.
	 */
	if(!creep.memory.upgrading && creep.grabAdjacentPile()) {
		return;
	}

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
		else if(outOfRange && creep.room.memory.Structures && creep.room.memory.Structures.controllerLink && creep.pos.getRangeTo(creep.room.controller) == 4) {
			// Structures is unseeded in a foreign room — a drifted upgrader read
			// .controllerLink off undefined here every tick.
			creep.roomCallbackRoadPrioUpgraderInPosition(creep.room.controller, 3);
		}
		else if(outOfRange) {
			creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
		}

		/*
		 * A decaying pile within reach outranks the depot on the top-up: same
		 * transfer-class intent, same tick, and the depot loses nothing by
		 * waiting while the pile loses ceil(amount/1000) every tick.
		 *
		 * This has to live HERE and not only on the fetch leg, because a parked
		 * upgrader against a stocked depot never goes empty — it tops up at
		 * `store <= WORK` and so `upgrading` never flips false. Live E36N57
		 * 2026-09-10: the upgrader cycled 126 -> 18 -> 126 out of the
		 * controller link with 371 energy rotting one tile away, for as long as
		 * the link kept up.
		 */
		if(creep.store[RESOURCE_ENERGY] <= creep.getActiveBodyparts(WORK) && !creep.grabAdjacentPile()) {
			if(controllerLink && creep.pos.isNearTo(controllerLink)) {
				creep.withdraw(controllerLink, RESOURCE_ENERGY);
			}
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
		// No level gate. This branch is only reached when the depot is DRY, and
		// the old `level < 7` meant an RCL7+ upgrader with an empty controller
		// link did nothing at all — no withdraw, no move, no upgrade — for its
		// entire 1,500-tick life. Live W1N1: two 24-WORK upgraders parked at
		// (43,23)/(43,24) beside an empty link, 120,671 energy in the storage
		// nine tiles away, controller progress flat. A room that reaches RCL7 is
		// the room MOST able to feed an upgrader from its bank; shuttling is
		// slower than a link but it is not zero, and the depot path above still
		// wins the moment anything lands in the link.
		else {

			if(storage == undefined) {
				// ------------------------------------------------------------
				// TREK CAP. acquireEnergyWithContainersAndOrDroppedEnergy() is
				// ROOM-WIDE and takes no range argument (creepFunctions:1581) —
				// its only distance preference is a range-12 first pass on
				// DROPS, and it falls straight through to any pile / container
				// anywhere in the room. So in a storage-less room, the tick the
				// controller depot hits 0 every upgrader leaves for the source
				// piles and comes back: E36N57 (RCL4, storage still a site at
				// 21,28) had five upgraders walking 27-31 tiles each way from
				// the depot at (38,27) to a pile at (9,6) / container (6,43),
				// averaging 0.69 e/t against the 12.5 e/t they do while parked.
				//
				// Condition to cap: the room HAS a controller depot — i.e.
				// controllerDepot() resolved a container or owned link within 4
				// of the controller that is not a source container / bin /
				// storage, which is the structure a filler or miner refills —
				// AND nothing holding >= 50 energy sits within 12 of the
				// controller. Then waiting beats walking: park in upgrade range
				// and take the next delivery.
				//
				// When the room has NO depot at all (the RCL1-3 bootstrap, and
				// any room whose depot has not been built yet) there is nothing
				// to wait FOR, so the old room-wide shuttle is left untouched.
				//
				// Downgrade danger overrides, same as the storage branch below:
				// if the depot has gone dead the room can still stall out, and
				// a slow shuttle beats losing an RCL. (At RCL2 CONTROLLER_DOWN-
				// GRADE is 10,000, so this also means the cap can never engage
				// there — the early game keeps its old behaviour outright.)
				// ------------------------------------------------------------
				if(controllerLink && creep.room.controller.ticksToDowngrade > 10000 && !energyNearController(creep.room)) {
					if(!creep.pos.inRangeTo(creep.room.controller, 3)) {
						creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
					}
				}
				else {
					let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
					if(result == 0) {
						creep.MoveCostMatrixRoadPrio(creep.room.controller, 3)
					}
				}
			}
			// Same bank floor as the ControllerLinkFiller (upgradeParkBand) —
			// and that shared floor is the point: these two creeps used to park
			// each other into a deadlock, because the CLF is what stocks the
			// depot this branch's alternative waits at. See upgradeParkBand.
			else if(storage.structureType === STRUCTURE_STORAGE
				&& creep.room.controller.ticksToDowngrade > 10000) {
				const band = upgradeParkBand(creep.room);
				if (creep.memory.bankParked
					? storage.store[RESOURCE_ENERGY] < band.resume
					: storage.store[RESOURCE_ENERGY] < band.floor) {
					creep.memory.bankParked = true;
					if(energyNearController(creep.room)) {
						creep.acquireEnergyWithContainersAndOrDroppedEnergy();
					}
					else if(!creep.pos.inRangeTo(creep.room.controller, 3)) {
						creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
					}
					else {
						// In range and waiting: same lane discipline as every
						// other idle branch — never squat a road while parked.
						creep.idlePark();
					}
				}
				else {
					if(creep.memory.bankParked) delete creep.memory.bankParked;
					let result = creep.withdrawStorage(storage);
					if(result == 0) {
						creep.MoveCostMatrixRoadPrio(creep.room.controller, 3)
					}
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
