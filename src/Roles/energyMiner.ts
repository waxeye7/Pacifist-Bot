import { remoteIsHot, remoteRecalled } from "Rooms/rooms.remotes";
import { isSanctionedRampart } from "utils/PlanV2";
import { cachedDerived, cachedMyCreeps, cachedMyStructures, cachedSites, cachedStructures } from "utils/RoomCache";

/**
 * Stable 0..mod-1 offset from a creep name.
 *
 * Any `Game.time % N` throttle fires for the WHOLE roster on the same tick,
 * which turns a saving into a periodic spike. Hashing the name spreads the
 * re-scans evenly across the N ticks instead. Recomputed rather than cached:
 * a name is ~20 chars, and a heap map keyed by creep name would grow without
 * bound over a long global.
 */
function nameOffset(name: string, mod: number): number {
    let h = 0;
    for(let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return h % mod;
}

/**
 * The room's controller LINK, or null — memoised per room per tick.
 *
 * Both callers below (forwardToControllerLink, and the deposit rung in run())
 * resolved this the same way and both had the same hole: when the room has NO
 * link within 3 of the controller the derivation writes nothing back, so
 * `Game.getObjectById(S.controllerLink)` kept answering null and the room-wide
 * FIND_MY_STRUCTURES re-ran EVERY tick, PER MINER, for as long as the room
 * stayed at RCL5/6 without a controller link. Same story below RCL7 where
 * creepFunctions parks a CONTAINER under the key.
 *
 * A per-tick memo is sound because structures cannot appear or move mid-tick;
 * the object's `store` is still read live by the callers. Keyed on the CURRENT
 * value of Structures.controllerLink, exactly as creepFunctions'
 * _discoverControllerDepot is, so a mid-tick rewrite of the key still forces
 * the rescan it always forced — an unset key is "0" for every caller, which is
 * precisely the room where the sharing matters.
 */
function resolveControllerLink(room: any): any {
    const S: any = room.memory.Structures || {};
    return cachedDerived(room, "emCtrlLink:" + (S.controllerLink || "0"), () => {
        let link: any = Game.getObjectById(S.controllerLink);
        if(!link || link.structureType !== STRUCTURE_LINK) {
            link = null;
            if(room.controller) {
                const ctrlLinks = _.filter(cachedMyStructures(room), (s: any) =>
                    s.structureType == STRUCTURE_LINK &&
                    s.id !== S.StorageLink &&
                    s.pos.getRangeTo(room.controller) <= 3);
                if(ctrlLinks.length) {
                    link = room.controller.pos.findClosestByRange(ctrlLinks);
                    S.controllerLink = link.id;
                }
            }
        }
        return link;
    });
}

/**
 * A little description of this function
 * @param {Creep} creep
 **/


/**
 * Same predicate as sourceLinkHaulWorks() in rooms.spawning.ts: a link
 * within 2 of THIS source and a hub within 2 of storage. "3+ links exist"
 * is the wrong bar — a 1-source RCL6 room maxes at source+hub, carriers
 * already stop, and the miner stayed on drop-mine with nobody hauling.
 *
 * Cached per source for 50 ticks. Spawn cuts carriers the tick both
 * ends exist; a 500-tick stale `false` left drop-mining with no haulers
 * at the RCL6 hub cutover.
 */
function linkNetworkDelivers(room, sourceId?):boolean {
    if(!room.storage) return false;
    const srcKey = sourceId || "*";
    if(!room.memory.linkHaulBySource) room.memory.linkHaulBySource = {};
    const rec = room.memory.linkHaulBySource[srcKey];
    if(rec && Game.time - (rec.t || 0) < 50) {
        return rec.v;
    }
    const links = _.filter(cachedMyStructures(room), (s: any) => s.structureType == STRUCTURE_LINK);
    const hub = _.some(links, (l:any) => l.pos.inRangeTo(room.storage.pos, 2));
    let works = false;
    if(hub) {
        const source:any = sourceId ? Game.getObjectById(sourceId) : null;
        works = source
            ? _.some(links, (l:any) => l.pos.inRangeTo(source.pos, 2))
            : links.length >= 2;
    }
    room.memory.linkHaulBySource[srcKey] = {v: works, t: Game.time};
    return works;
}

/**
 * Is this room actually running its controller depot?
 *
 * An upgrader is the only role that meaningfully DRAINS the controller link
 * (repair.ts drinks from it opportunistically when it already happens to be
 * standing next to it, and has the whole bank as an alternative). A
 * ControllerLinkFiller counts too, in the other direction: that creep exists
 * for no other purpose than to feed the link, so while one is alive the room
 * has decided upgrading is on and nothing here should fight it.
 *
 * Every producer AND the drain-back path key off this same answer, so they can
 * never end up pushing energy past each other. Cached on the Room object,
 * which the engine rebuilds every tick.
 */
export function roomFeedsController(room:any):boolean {
    if(room._pacFeedsCtrl !== undefined) return room._pacFeedsCtrl;
    const has = _.some(cachedMyCreeps(room), (c:any) => c.memory &&
        (c.memory.role === "upgrader" || c.memory.role === "ControllerLinkFiller"));
    room._pacFeedsCtrl = has;
    return has;
}

/**
 * Push a loaded link into the controller link.
 *
 * This exists as a separate pass because link forwarding is a STRUCTURE action,
 * not a creep action, and the in-room miner's main body is full of early
 * `return`s — feeding an adjacent extension (energyMiner.ts:218), repairing its
 * rampart (:267, :275) — that sit BEFORE the link-routing block. Every one of
 * them is reachable in the exact state where routing matters most.
 *
 * Live W2N1 (RCL6): the source link at (16,16) was pinned at 800, the
 * controller link at (9,9) at 0, and the controller made no progress. The miner
 * could not unload into its already-full source link, so it fell into the
 * `getFreeCapacity() < potential` branch and returned into a starving extension
 * every single tick — so the very code that would have drained the source link
 * never ran. That is the deadlock this file's own header comment describes,
 * reached through the extension rung instead of a missing hub link.
 *
 * It also repairs `Structures.controllerLink` when that key is pointing at a
 * CONTAINER, which is what creepFunctions writes below RCL7 even in a room that
 * has had a real controller link since RCL5. The room cannot self-heal the key
 * otherwise: the only other writer is a ControllerLinkFiller, and that creep
 * cannot be spawned in a room whose storage is empty.
 *
 * DRIVEN FROM Rooms/rooms.ts, ONCE PER OWNED ROOM PER TICK — deliberately not
 * from a creep. The first attempt hung it off the in-room miner and still did
 * nothing, because by then W2N1 had no in-room miner left at all: its only
 * surviving EnergyMiners were remotes (targetRoom W3N1), and a room starved
 * badly enough to lose its miner is exactly the room that cannot afford to
 * leave 800 energy stranded in a link. Moving energy between links is a
 * structure action and needs no creep to be alive.
 */
export function forwardToControllerLink(room:any):void {
    if(!room.controller || !room.memory.Structures) return;
    const S:any = room.memory.Structures;

    const ctrlLink:any = resolveControllerLink(room);
    if(!ctrlLink) return;

    /* ---- the return path -------------------------------------------------
     *
     * This function only ever pushed energy INTO the controller link, and
     * nothing anywhere pushed it back out, so a room with no upgrader filled
     * the link to 800 and left it there. Measured across both live servers,
     * every single owned room: local E1S4 492, E2S1 469, E2S7 656, E2S8 457,
     * E3S3 800, E4S6 529, E4S7 461, E7S2 465 — all eight RCL8 and all eight
     * with zero upgraders (the RCL8 rung deliberately holds off until
     * ticksToDowngrade < 125000), each figure unchanged across ~490 ticks of
     * sampling. Worse on the VPS: W2N1 and W3N1 are RCL6 with storage at ZERO
     * and 800 sitting in a controller link nobody can reach — more than a
     * third of a spawn's capacity, in the two rooms least able to spare it.
     *
     * An upgrader is the only role that meaningfully drains this link, so when
     * there is none, hand the energy back to the hub link where the
     * EnergyManager will bank it, and stop topping the link up in the
     * meantime. The two directions are mutually exclusive by construction —
     * one runs only with an upgrader, the other only without — so they cannot
     * ping-pong.
     */
    if(!roomFeedsController(room)) {
        const held = ctrlLink.store[RESOURCE_ENERGY];
        if(held <= 0 || ctrlLink.cooldown > 0) return;
        // The hub link is the only sink: it is the one link a creep
        // (EnergyManager) empties into the storage every tick. `hub === ctrl`
        // happens in rooms whose two keys collided (live VPS W1N2) — sending a
        // link to itself is ERR_INVALID_TARGET, so skip it rather than log it
        // every tick.
        const hub:any = Game.getObjectById(S.StorageLink) || room.findStorageLink();
        if(!hub || hub.id === ctrlLink.id || hub.structureType !== STRUCTURE_LINK) return;
        const hubFree = hub.store.getFreeCapacity(RESOURCE_ENERGY);
        if(hubFree <= 0) return;
        // transferEnergy with no amount is all-or-nothing and ERR_FULL moves nothing.
        const drain = Math.min(held, hubFree);
        if(drain > 0) ctrlLink.transferEnergy(hub, drain);
        return;
    }

    // Same bar as the original rung: top it up while it is at or below half.
    if(ctrlLink.store[RESOURCE_ENERGY] > 400) return;

    // Source links only — the storage link keeps its own job, exactly as before.
    const donors = _.filter(cachedMyStructures(room), (s:any) =>
        s.structureType == STRUCTURE_LINK &&
        s.id !== ctrlLink.id &&
        s.id !== S.StorageLink &&
        s.cooldown == 0 &&
        s.store[RESOURCE_ENERGY] >= 400);
    if(!donors.length) return;
    donors.sort((a:any, b:any) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
    const topUp = Math.min(donors[0].store[RESOURCE_ENERGY], ctrlLink.store.getFreeCapacity(RESOURCE_ENERGY));
    if(topUp > 0) donors[0].transferEnergy(ctrlLink, topUp);
}

/**
 * Spawn / extension / tower / container in range 1 with room for energy.
 *
 * `pos.findInRange(FIND_*, ...)` is a full room-wide find under the hood, and
 * this runs on every dump — i.e. roughly every third tick for every CARRY
 * miner. Walk the per-tick shared structure lists instead and test the cheap
 * structureType first; the iteration order is the same find order, so the
 * "first match wins" tie-break is unchanged.
 */
function adjacentEnergySink(creep: any): any {
    const pos = creep.pos;
    for(const s of cachedMyStructures(creep.room) as any[]) {
        if((s.structureType == STRUCTURE_SPAWN ||
            s.structureType == STRUCTURE_EXTENSION ||
            s.structureType == STRUCTURE_TOWER) &&
           pos.inRangeTo(s, 1) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return s;
    }
    for(const s of cachedStructures(creep.room) as any[]) {
        if(s.structureType == STRUCTURE_CONTAINER &&
           pos.inRangeTo(s, 1) && (s as any).store.getFreeCapacity(RESOURCE_ENERGY) > 0) return s;
    }
    return null;
}

function transferAdjacentSink(creep: any): boolean {
    const sink = adjacentEnergySink(creep);
    if(!sink) return false;
    return creep.transfer(sink, RESOURCE_ENERGY) == 0;
}

/**
 * Does this room have anything that will pick a dropped pile up? Whole-empire
 * `Game.creeps` scan, so memoised per room per tick — every dumping miner in
 * the room asks the identical question and the answer cannot move mid-tick.
 */
function roomHasHauler(room: any): boolean {
    return cachedDerived(room, "emHasHauler", () => _.some(Game.creeps, (c: any) =>
        (c.memory.role == 'carry' || c.memory.role == 'FakeFiller' || c.memory.role == 'sweeper') &&
        (c.memory.homeRoom == room.name || c.room.name == room.name) &&
        !c.spawning));
}

/**
 * Empty a full CARRY miner. Adjacent sink first (harvest-to-spawn when the
 * source sits on the hub). If no hauler exists yet and the spawn is within 8,
 * walk the load in. Otherwise drop for the hauler — do not sit ERR_FULL.
 */
function dumpMinerEnergy(creep: any): void {
    if(transferAdjacentSink(creep)) return;

    const room = creep.room;
    const home = !creep.memory.targetRoom || creep.memory.targetRoom == room.name;
    if(home && room.controller && room.controller.level <= 2 &&
        room.energyAvailable < room.energyCapacityAvailable) {
        const hasHauler = roomHasHauler(room);
        if(!hasHauler) {
            const sink = creep.pos.findClosestByRange(_.filter(cachedMyStructures(room), (s: any) =>
                (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
            if(sink && creep.pos.getRangeTo(sink) <= 8) {
                if(creep.pos.isNearTo(sink)) {
                    creep.transfer(sink, RESOURCE_ENERGY);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(sink, 1);
                }
                return;
            }
        }
    }

    creep.drop(RESOURCE_ENERGY);
}

const run = function (creep) {
    creep.memory.moving = false;
	if(creep.evacuate()) {
		return;
	}
    // timeOut is only a hard abort while still IN the flagged remote.
    // After the exit the helper still returns "timeOut" for 25t with no
    // work move — a miner sat in the corridor / just inside home.
    if(creep.room.name === creep.memory.targetRoom && creep.fleeHomeIfInDanger() == "timeOut") {
        return;
    }

    if(Game.cpu.bucket < 1000) return;

    if(creep.holdForFlee()) {
        return;
    }
    // if(creep.fleeHomeIfInDanger() == true) {
    //     return;
    // }

    // if(creep.pos.x > 0 && creep.pos.y > 0 && creep.pos.y < 49 && creep.pos.x < 49) {
    //     return;
    // }
    // else {
    //     creep.moveTo(25,25)
    // }

    // A miner with NO CARRY part must take the simple harvest-and-drop path.
    //
    // The link path below is written entirely in terms of
    // `creep.store.getFreeCapacity()`, which is 0 for a body with no CARRY - so
    // both of its gates invert: "am I full, go deliver" (< potential) is true
    // every tick and "may I harvest" (>= potential) is false every tick. The
    // creep walks to the hub link and stands there for its whole life without
    // ever calling harvest once.
    //
    // Miners lose their CARRY parts routinely: the RCL6 550-energy rung queues
    // [WORK x5, MOVE], and every shrink rung sheds CARRY before WORK. On live
    // E11S2 (RCL6, 3 links) that produced 3 "miners" parked on the hub link at
    // (18,39)/(18,41) with an empty container, empty storage and controller
    // progress frozen at 34742 - a room that looked fully staffed and had zero
    // income. Dropping the energy at the source is worth strictly more than
    // standing next to a link that will never be handed anything.
    //
    // Tested with getActiveBodyparts, NOT store.getCapacity(): a creep with no
    // CARRY answers `null` there on this engine, and `null == 0` is false, so a
    // capacity test silently does nothing.
    // Remote gone hot: a static 4W/2M miner cannot fight or outrun anything, so
    // walk it home and recycle the body rather than donate it to the attacker.
    //
    // Remote CLOSED (remoteRecalled) takes the identical exit. manageRemotes
    // stops the haul fleet the moment it flips `active = false`, and until this
    // branch existed nothing told the miner: a CARRY-less [W,W,M,W,W,M] went on
    // dropping 8 e/t onto the floor of a room no carrier would visit again, for
    // up to a full 1500-tick life. Recycling refunds part of the body and frees
    // the seat instead. Deliberately the SAME movement path as the hot case —
    // moveToRoomAvoidEnemyRooms + recycle at home, no second routine.
    if(creep.memory.targetRoom && creep.memory.homeRoom &&
       creep.memory.targetRoom != creep.memory.homeRoom &&
       (remoteIsHot(creep.memory.homeRoom, creep.memory.targetRoom) ||
        remoteRecalled(creep))) {
        if(creep.room.name !== creep.memory.homeRoom) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
        }
        return creep.recycle();
    }

    if(creep.room.controller && creep.room.controller.level < 6 || creep.memory.targetRoom != creep.memory.homeRoom || creep.getActiveBodyparts(CARRY) == 0 || !linkNetworkDelivers(creep.room, creep.memory.sourceId)) {
        // if(creep.roadCheck()) {
        //     creep.moveAwayIfNeedTo();
        // }

        if(creep.room.name === creep.memory.targetRoom && creep.ticksToLive === 700) {
            const storages = creep.room.find(FIND_STRUCTURES, {filter: s => !s.my && s.structureType === STRUCTURE_STORAGE&& s.store[RESOURCE_ENERGY] > 0});
            if(storages.length > 0) {
                global.SG(creep.memory.homeRoom, creep.memory.targetRoom)
            }
            if(!storages.length && creep.room.controller.my) {
                let ruinsWithEnergy = creep.room.find(FIND_RUINS, {filter: r => r.store[RESOURCE_ENERGY] > 0});
                if(ruinsWithEnergy.length > 0) {
                    global.SG(creep.memory.homeRoom, creep.memory.targetRoom)
                }
            }
        }

        if(!creep.memory.checkAmIOnRampart) {
            creep.memory.checkAmIOnRampart = true;
        }

        // A CARRY miner does not drop-mine. Harvest fills the store and then
        // ERR_FULL stops the source. Dump before harvesting when full so the
        // first-100-ticks [W,C,M] (and any later carry miner on this path)
        // keeps the source working.
        if(creep.getActiveBodyparts(CARRY) > 0 && creep.store.getFreeCapacity() == 0) {
            dumpMinerEnergy(creep);
        }
        else {
            let result = creep.harvestEnergy();
            if(result == 0) {
                creep.memory.harvested = true;
            }
            else if(creep.getActiveBodyparts(CARRY) > 0 && creep.store[RESOURCE_ENERGY] > 0) {
                transferAdjacentSink(creep);
            }
            /* ---- step onto the source container ---------------------------
             *
             * `allGood` means "I am standing on a container" and is never
             * cleared, so once it is set nothing in this block can change any
             * decision. It used to sit BELOW the container find, which made a
             * room-wide FIND_STRUCTURES with a per-structure getRangeTo the
             * single most expensive thing a seated drop-miner did — every
             * tick, for the whole 1500-tick life, in the one state where the
             * answer is already known. Gate the whole block on it.
             *
             * While the creep is genuinely NOT on a container (bootstrap, or a
             * box that has not been built yet) the search still has to run, so
             * throttle it to one scan per 5 ticks with a name-hash offset —
             * without the offset the entire miner roster would fire on the
             * same tick and trade a saving for a spike. The conditions are the
             * originals, reordered cheapest-first; the outcome is identical.
             */
            if(creep.memory.harvested && !creep.memory.allGood) {
                let lookForStructures = creep.pos.lookFor(LOOK_STRUCTURES);
                for(let building of lookForStructures) {
                    if(building.structureType == STRUCTURE_CONTAINER) {
                        creep.memory.allGood = true;
                        break;
                    }
                }

                if(!creep.memory.allGood && (Game.time + nameOffset(creep.name, 5)) % 5 == 0) {
                    let source:any = Game.getObjectById(creep.memory.source);
                    if(source && creep.pos.getRangeTo(source) <= 2) {
                        let containerNearby = _.filter(cachedStructures(creep.room), (building: any) =>
                            building.structureType == STRUCTURE_CONTAINER && creep.pos.getRangeTo(building) <= 2);
                        if(containerNearby.length > 0 && !containerNearby[0].pos.isEqualTo(creep) &&
                           containerNearby[0].pos.lookFor(LOOK_CREEPS).length == 0) {
                            creep.MoveCostMatrixRoadPrio(containerNearby[0], 0)
                        }
                    }
                }
            }
        }
    }
    else {

        if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
            let result = creep.Boost();
            if(!result) {
                return;
            }
            else if (result) {
                creep.memory.boosted = true;
            }
        }



        if(!creep.memory.potential) {
            // Dump iff free < potential, harvest iff >=. A boosted shrink to
            // 1 CARRY has capacity 50 < WORK*6, so empty already looks "full"
            // and harvest is unreachable for the whole life.
            let potential = creep.memory.boosted
                ? creep.getActiveBodyparts(WORK) * 6
                : creep.getActiveBodyparts(WORK) * 2;
            const cap = creep.store.getCapacity();
            if(cap > 0) potential = Math.min(potential, cap);
            creep.memory.potential = potential;
        }

        // NOTE: forwardToControllerLink() is driven from Rooms/rooms.ts, not
        // from here. Tying it to a creep is what broke it — see the comment on
        // the function: W2N1 lost its last IN-ROOM miner (only remote miners,
        // whose targetRoom != homeRoom, were left), so a miner-driven pass
        // would still never have run in the room that needed it.


        if(creep.ticksToLive <= 2) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            if(creep.pos.isNearTo(closestLink)) {
                creep.transfer(closestLink, RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestLink, 1);
            }
        }


        if(creep.store.getFreeCapacity() < creep.memory.potential) {
            let source:any = Game.getObjectById(creep.memory.sourceId);
            if(creep.pos.isNearTo(source)) {
                if(!creep.memory.NearbyExtensions) {
                    creep.memory.NearbyExtensions = [];
                    let mystructures = cachedMyStructures(creep.room);
                    let buildings = creep.pos.findInRange(mystructures, 1)
                    for(let building of buildings) {
                        if(building.structureType == STRUCTURE_EXTENSION) {
                            creep.memory.NearbyExtensions.push(building.id);
                        }
                    }
                }
            }

            if(creep.memory.NearbyExtensions && creep.memory.NearbyExtensions.length > 0) {
                for(let i = creep.memory.NearbyExtensions.length - 1; i >= 0; i--) {
                    let extensionID = creep.memory.NearbyExtensions[i];
                    let extension:any = Game.getObjectById(extensionID);
                    if(!extension) {
                        creep.memory.NearbyExtensions.splice(i, 1);
                        continue;
                    }
                    if(extension.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        let r = creep.transfer(extension, RESOURCE_ENERGY);
                        if(r == 0) return;
                        // Cached while adjacent to the source; a later walk
                        // to the link leaves these out of range. Returning
                        // on the failed transfer skipped link deposit forever.
                        if(r == ERR_NOT_IN_RANGE) {
                            creep.memory.NearbyExtensions.splice(i, 1);
                        }
                    }
                }
            }

            if(creep.room.controller.level >= 7 && !creep.memory.myRampart && !creep.memory.checkedForRampartToRepair) {
                let myRamparts = _.filter(cachedMyStructures(creep.room), (s: any) => s.structureType == STRUCTURE_RAMPART);
                let rampartsInRangeOne: any[] = creep.pos.findInRange(myRamparts, 1);

                if(rampartsInRangeOne.length > 0) {
                    rampartsInRangeOne.sort((a,b) => a.hits - b.hits);
                }

                let found = false;
                for(let building of rampartsInRangeOne) {
                    if(found) {
                        break;
                    }
                    if(building.structureType == STRUCTURE_RAMPART && building.hits < 50050000) {
                        let buildingsHereLookFor = building.pos.lookFor(LOOK_STRUCTURES);
                        for(let buildingHere of buildingsHereLookFor) {
                            if(buildingHere.structureType == STRUCTURE_LINK) {
                                creep.memory.myRampart = building.id;
                                found = true;
                                break;
                            }
                        }
                        let creepsHere = building.pos.lookFor(LOOK_CREEPS);
                        for(let c of creepsHere) {
                            if(c.my && c.memory.role == "EnergyMiner") {
                                creep.memory.myRampart = building.id;
                                found = true;
                                break;
                            }
                        }

                    }
                }
                creep.memory.checkedForRampartToRepair = true;
            }


            if(creep.ticksToLive > 275 && creep.memory.myRampart && source && source.ticksToRegeneration * 10.5 > source.energy) {
                let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);
                let rampart:any = Game.getObjectById(creep.memory.myRampart);
                if(storage && storage.store[RESOURCE_ENERGY] >= 300000) {

                    if(rampart && rampart.hits < 100050000) {
                        creep.repair(rampart);
                        return;
                    }
                    else {
                        creep.memory.myRampart = false;
                    }
                }
                else if(storage && storage.store[RESOURCE_ENERGY] > 90000 && rampart && rampart.hits < 50050000) {
                    creep.repair(rampart);
                    return;
                }
                else {
                    creep.memory.myRampart = false;
                }
            }


            if(!creep.memory.checkedForSites) {
                let siteIDs = []
                let constructionSitesNearCreep = creep.pos.findInRange(cachedSites(creep.room), 1);
                if(constructionSitesNearCreep.length > 0) {
                    for(let site of constructionSitesNearCreep) {
                        siteIDs.push(site.id);
                    }
                }
                if(siteIDs.length > 0) {
                    creep.memory.constructionSites = siteIDs;
                }
                creep.memory.checkedForSites = true;
            }
            if(creep.memory.constructionSites && creep.memory.constructionSites.length > 0) {
                let site:any = Game.getObjectById(creep.memory.constructionSites[creep.memory.constructionSites.length - 1]);
                if(site) {
                    creep.build(site);
                }
                else {
                    creep.memory.constructionSites.pop()
                }
            }




            let closestLink:any = Game.getObjectById(creep.memory.sourceLink);
            // memory.sourceLink was never written, so this was a room-wide FIND
            // every tick and could lock a hub/controller link within 5 of the creep.
            //
            // A NEGATIVE answer is stored as `false`, and getObjectById(false)
            // is null — so the "no link near this source" case re-ran the same
            // room-wide find every tick anyway, for the whole life. Retry that
            // one on a 25-tick timer (links are not built often, and the miner
            // falls through to dumpMinerEnergy meanwhile, exactly as before);
            // a positive answer still resolves straight off the cached id.
            const linkStale = !closestLink || closestLink.structureType !== STRUCTURE_LINK ||
               !source || source.pos.getRangeTo(closestLink) >= 5;
            const negThrottled = creep.memory.sourceLink === false &&
                Game.time - (creep.memory.sourceLinkT || 0) < 25;
            if(linkStale && !negThrottled) {
                closestLink = source
                    ? source.pos.findClosestByRange(_.filter(cachedMyStructures(creep.room), (s:any) => s.structureType == STRUCTURE_LINK && source.pos.getRangeTo(s) < 5))
                    : null;
                creep.memory.sourceLink = closestLink ? closestLink.id : false;
                creep.memory.sourceLinkT = Game.time;
            }
            else if(linkStale) {
                closestLink = null;
            }
            if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {
                if(creep.pos.isNearTo(closestLink)) {
                    creep.transfer(closestLink, RESOURCE_ENERGY);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(closestLink, 1);
                }
            }
            else {
                // Room-wide haul can be true because a sibling source is
                // linked. This source then has nowhere to unload and harvest
                // stalls at ERR_FULL — dump to container / tile instead.
                dumpMinerEnergy(creep);
            }
        }

        let storedSource:any = Game.getObjectById(creep.memory.sourceId)
        if(!creep.memory.checkAmIOnRampart && creep.pos.isNearTo(storedSource) && creep.memory.homeRoom == creep.memory.targetRoom) {
            let lookForRampart = creep.pos.lookFor(LOOK_STRUCTURES);
            if(lookForRampart.length > 0) {
                for(let building of lookForRampart) {
                    if(building.structureType == STRUCTURE_RAMPART) {
                        creep.memory.checkAmIOnRampart = true;
                        break;
                    }
                }
            }
            if(!creep.memory.checkAmIOnRampart) {
                let rampartsInRange3 = _.filter(cachedMyStructures(creep.room), (s: any) => s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(creep) <= 2);
                if(rampartsInRange3.length == 0) {
                    creep.memory.checkAmIOnRampart = true;
                }
                else {
                    let rampart = creep.pos.findClosestByRange(rampartsInRange3);
                    if(rampart) {
                        creep.memory.checkAmIOnRampart = true;
                        creep.MoveCostMatrixRoadPrio(rampart, 0);
                    }
                }
            }
        }

        if(creep.store.getFreeCapacity() >= creep.memory.potential) {
            let result = creep.harvestEnergy();
        }



        if(creep.store[RESOURCE_ENERGY] > 0 && creep.memory.homeRoom == creep.memory.targetRoom) {

            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();

            if(closestLink && closestLink.pos.isNearTo(creep) && !creep.memory.checkedForRampart) {
                let lookForBuildingsHere = closestLink.pos.lookFor(LOOK_STRUCTURES);
                let found = false;
                for(let building of lookForBuildingsHere) {
                    if(building.structureType == STRUCTURE_RAMPART) {
                        found = true;
                    }
                }
                let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);
                if(!found && storage && closestLink.pos.getRangeTo(storage) > 7 &&
                    isSanctionedRampart(creep.room, closestLink.pos)) {
                    closestLink.pos.createConstructionSite(STRUCTURE_RAMPART);
                }
                creep.memory.checkedForRampart = true;
            }

            let targetLink:any = Game.getObjectById(creep.room.memory.Structures.StorageLink) || creep.room.findStorageLink();

            /*
             * Structures.controllerLink is NOT guaranteed to be a link.
             *
             * creepFunctions writes a CONTAINER under that key below RCL7, so in
             * an RCL5/6 room with a real controller link this resolved to the
             * container and `transferEnergy` below silently had no valid target
             * — the link half of the network simply never ran.
             *
             * Live W2N1 (RCL6): key = the container at (10,9), source link
             * (16,16) sat on a full 800 while the controller link at (9,9) sat
             * at 0 and the controller made no progress. The room could not even
             * self-heal the key, because the only writer is a
             * ControllerLinkFiller and that creep cannot be spawned in a room
             * whose storage is empty (rooms.spawning.ts `feedable`).
             *
             * So resolve a LINK here, from the room, and repair the key when the
             * cache is pointing at something that is not one.
             *
             * Shared with forwardToControllerLink() and memoised per room per
             * tick — identical derivation, and the room with NO controller link
             * (which writes nothing back, so the find repeated forever) is the
             * one that used to pay for it on every miner on every tick.
             */
            const closestLinkToController:any = resolveControllerLink(creep.room);
            let extraLink = null;
            if(creep.room.memory.Structures.extraLinks && creep.room.memory.Structures.extraLinks.length > 0) {
                for(let linkID of creep.room.memory.Structures.extraLinks) {
                    let link:any = Game.getObjectById(linkID);
                    if(link && link.store[RESOURCE_ENERGY] < 200) {
                        extraLink =  link;
                        break;
                    }
                }

            }


            if(targetLink == null || closestLink == null) {
                if(!targetLink) {
                    creep.room.memory.Structures.StorageLink = undefined;
                    // Legacy self-heal: drop a hub link at the legacy offset.
                    // NEVER for planV2 rooms — that tile is not the plan's hub
                    // link, so this would build an off-plan link (and burn a
                    // link slot) plus spam the console every tick.
                    if(creep.room.storage && !creep.room.memory.planV2 && creep.room.storage.pos.x >= 2) {
                        new RoomPosition(creep.room.storage.pos.x-2,creep.room.storage.pos.y,creep.room.name).createConstructionSite(STRUCTURE_LINK);
                    }
                }
                if(!creep.room.memory.planV2 && Game.time % 100 == 0) {
                    console.log("ALERT: stupid bug idk why. Link store is null.", creep.memory.targetRoom);
                }
                return;
            }

            // Feeding the controller link is only worth doing if something in
            // the room will ever take the energy back out of it. With no
            // upgrader this rung is what fills a controller link to 800 and
            // leaves it there — see forwardToControllerLink() above for the
            // measurements. Same test both places, so the two never disagree.
            //
            // transferEnergy with no amount is all-or-nothing (ERR_FULL moves
            // nothing). Controller/extra used to sit in front of the hub send
            // in an if/else, so a failed controller send never drained to storage.
            let forwarded = false;
            if(roomFeedsController(creep.room) && closestLink && closestLink.store[RESOURCE_ENERGY] >= 400 && closestLinkToController && closestLinkToController.store[RESOURCE_ENERGY] <= 400) {
                const send = Math.min(closestLink.store[RESOURCE_ENERGY], closestLinkToController.store.getFreeCapacity(RESOURCE_ENERGY));
                if(send > 0 && closestLink.transferEnergy(closestLinkToController, send) == 0) {
                    forwarded = true;
                }
            }

            if(!forwarded && closestLink && closestLink.store[RESOURCE_ENERGY] >= 200 && extraLink && extraLink.store[RESOURCE_ENERGY] <= 200) {
                const send = Math.min(closestLink.store[RESOURCE_ENERGY], extraLink.store.getFreeCapacity(RESOURCE_ENERGY));
                if(send > 0 && closestLink.transferEnergy(extraLink, send) == 0) {
                    forwarded = true;
                }
            }

            /*
             * The source -> hub rung used to demand the source link hold
             * EXACTLY 800 and the hub link hold EXACTLY 0. Both halves are
             * traps. A single unit left in the hub link — an EnergyManager that
             * died, or is halfway through a lab errand — blocked every source
             * link in the room from unloading, and paired with the `<= 400`
             * bar on the controller rung above it, a room sitting at ctrl 500 /
             * hub 50 had no legal link transfer at all while its source links
             * pinned at 800 and its miners had nowhere to put their energy.
             *
             * Send what actually fits instead. `transferEnergy` with no amount
             * means "all of it" and answers ERR_FULL if the target cannot take
             * all of it, which is the other half of why the old test had to be
             * so strict; naming the amount removes the need.
             */
            if(!forwarded && closestLink && targetLink && closestLink.id !== targetLink.id && closestLink.store[RESOURCE_ENERGY] >= 400) {
                const room = targetLink.store.getFreeCapacity(RESOURCE_ENERGY);
                const send = Math.min(closestLink.store[RESOURCE_ENERGY], room);
                if(send >= 100) {
                    closestLink.transferEnergy(targetLink, send);
                }
            }
        }
    }
}
const roleEnergyMiner = {
    run,

    //function2,
    //function3
};


export default roleEnergyMiner;
