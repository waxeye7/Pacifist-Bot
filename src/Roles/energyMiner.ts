import { remoteIsHot } from "Rooms/rooms.remotes";

/**
 * A little description of this function
 * @param {Creep} creep
 **/


/**
 * Does this room's link network actually END at storage?
 *
 * The miner's link path only makes sense if something drains the far end.
 * "3 or more links exist" does not establish that: a HYBRID room (legacy
 * structures + a v2 plan) can own its full link quota with the hub link parked
 * three tiles from storage, where no creep hands it over. The miner then fills
 * the source link to 800, the source link has nowhere to forward to, and the
 * miner - which only ever unloads into that link - sits at the source FULL and
 * stops harvesting. Live E11S2: 1600 energy frozen in two full links, storage
 * 0, extensions 0, controller progress pinned at 34742.
 *
 * Range 2 to storage is the same bar sourceLinkHaulWorks() in
 * Rooms/rooms.spawning.ts uses to decide whether links have really replaced
 * hauling; a link that far out still has a tile adjacent to both itself and
 * storage, so a creep can move the energy across. Below that bar the room mines
 * into its container like an RCL5 room and the carriers do the hauling, which
 * is slower than links but is not zero.
 *
 * Cached per room for 500 ticks - link layouts change on the timescale of
 * construction, and this is called by every miner every tick.
 */
function linkNetworkDelivers(room):boolean {
    if(!room.storage) return false;
    if(room.memory.linkHaulWorks !== undefined && Game.time - (room.memory.linkHaulWorksAt || 0) < 500) {
        return room.memory.linkHaulWorks;
    }
    const links = room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_LINK});
    const works = links.length >= 3
        && _.some(links, (l:any) => l.pos.inRangeTo(room.storage.pos, 2));
    room.memory.linkHaulWorks = works;
    room.memory.linkHaulWorksAt = Game.time;
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
    const has = room.find(FIND_MY_CREEPS, {filter: (c:any) => c.memory &&
        (c.memory.role === "upgrader" || c.memory.role === "ControllerLinkFiller")}).length > 0;
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

    let ctrlLink:any = Game.getObjectById(S.controllerLink);
    if(!ctrlLink || ctrlLink.structureType !== STRUCTURE_LINK) {
        const ctrlLinks = room.find(FIND_MY_STRUCTURES, {filter: (s:any) =>
            s.structureType == STRUCTURE_LINK &&
            s.id !== S.StorageLink &&
            s.pos.getRangeTo(room.controller) <= 3});
        if(!ctrlLinks.length) return;
        ctrlLink = room.controller.pos.findClosestByRange(ctrlLinks);
        S.controllerLink = ctrlLink.id;
    }

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
        const hub:any = Game.getObjectById(S.StorageLink);
        if(!hub || hub.id === ctrlLink.id || hub.structureType !== STRUCTURE_LINK) return;
        if(hub.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) return;
        ctrlLink.transferEnergy(hub);
        return;
    }

    // Same bar as the original rung: top it up while it is at or below half.
    if(ctrlLink.store[RESOURCE_ENERGY] > 400) return;

    // Source links only — the storage link keeps its own job, exactly as before.
    const donors = room.find(FIND_MY_STRUCTURES, {filter: (s:any) =>
        s.structureType == STRUCTURE_LINK &&
        s.id !== ctrlLink.id &&
        s.id !== S.StorageLink &&
        s.cooldown == 0 &&
        s.store[RESOURCE_ENERGY] >= 400});
    if(!donors.length) return;
    donors.sort((a:any, b:any) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
    donors[0].transferEnergy(ctrlLink);
}

/** Spawn / extension / tower / container in range 1 with room for energy. */
function adjacentEnergySink(creep: any): any {
    const spawnish = creep.pos.findInRange(FIND_MY_STRUCTURES, 1, {filter: (s: any) =>
        (s.structureType == STRUCTURE_SPAWN ||
            s.structureType == STRUCTURE_EXTENSION ||
            s.structureType == STRUCTURE_TOWER) &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
    if(spawnish.length) return spawnish[0];
    const boxes = creep.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s: any) =>
        s.structureType == STRUCTURE_CONTAINER &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
    return boxes.length ? boxes[0] : null;
}

function transferAdjacentSink(creep: any): boolean {
    const sink = adjacentEnergySink(creep);
    if(!sink) return false;
    return creep.transfer(sink, RESOURCE_ENERGY) == 0;
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
        const hasHauler = _.some(Game.creeps, (c: any) =>
            (c.memory.role == 'carry' || c.memory.role == 'FakeFiller' || c.memory.role == 'sweeper') &&
            (c.memory.homeRoom == room.name || c.room.name == room.name) &&
            !c.spawning);
        if(!hasHauler) {
            const sink = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s: any) =>
                (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
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
    if(creep.fleeHomeIfInDanger() == "timeOut") {
        return;
    }

    if(Game.cpu.bucket < 1000) return;

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
    if(creep.memory.targetRoom && creep.memory.homeRoom &&
       creep.memory.targetRoom != creep.memory.homeRoom &&
       remoteIsHot(creep.memory.homeRoom, creep.memory.targetRoom)) {
        if(creep.room.name !== creep.memory.homeRoom) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
        }
        return creep.recycle();
    }

    if(creep.room.controller && creep.room.controller.level < 6 || creep.memory.targetRoom != creep.memory.homeRoom || creep.getActiveBodyparts(CARRY) == 0 || !linkNetworkDelivers(creep.room)) {
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
            if(creep.memory.harvested) {
                let containerNearby = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_CONTAINER && creep.pos.getRangeTo(building) <= 2});
                let source:any = Game.getObjectById(creep.memory.source);
                if(!creep.memory.allGood) {
                    let lookForStructures = creep.pos.lookFor(LOOK_STRUCTURES);
                    if(lookForStructures.length > 0) {
                        for(let building of lookForStructures) {
                            if(building.structureType == STRUCTURE_CONTAINER) {
                                creep.memory.allGood = true;
                            }
                        }
                    }
                }

                if(!creep.memory.allGood && containerNearby.length > 0 && !containerNearby[0].pos.isEqualTo(creep) && containerNearby[0].pos.lookFor(LOOK_CREEPS).length == 0 && source && creep.pos.getRangeTo(source) <= 2) {
                    creep.MoveCostMatrixRoadPrio(containerNearby[0], 0)
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
            if(creep.memory.boosted) {
                creep.memory.potential = creep.getActiveBodyparts(WORK) * 6;
            }
            else {
                creep.memory.potential = creep.getActiveBodyparts(WORK) * 2;
            }
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
                    let mystructures = creep.room.find(FIND_MY_STRUCTURES);
                    let buildings = creep.pos.findInRange(mystructures, 1)
                    for(let building of buildings) {
                        if(building.structureType == STRUCTURE_EXTENSION) {
                            creep.memory.NearbyExtensions.push(building.id);
                        }
                    }
                }
            }

            if(creep.memory.NearbyExtensions && creep.memory.NearbyExtensions.length > 0) {
                for(let extensionID of creep.memory.NearbyExtensions) {
                    let extension:any = Game.getObjectById(extensionID);
                    if(extension && extension.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        creep.transfer(extension, RESOURCE_ENERGY);
                        return;
                    }
                }
            }

            if(creep.room.controller.level >= 7 && !creep.memory.myRampart && !creep.memory.checkedForRampartToRepair) {
                let myRamparts = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART});
                let rampartsInRangeOne = creep.pos.findInRange(myRamparts, 1);

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
                let constructionSitesNearCreep = creep.pos.findInRange(creep.room.find(FIND_MY_CONSTRUCTION_SITES), 1);
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




            let closestLink = Game.getObjectById(creep.memory.sourceLink) || source.pos.findClosestByRange(creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_LINK && creep.pos.getRangeTo(s) < 5}));
            if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {
                if(creep.pos.isNearTo(closestLink)) {
                    creep.transfer(closestLink, RESOURCE_ENERGY);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(closestLink, 1);
                }
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
                let rampartsInRange3 = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(creep) <= 2});
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
                if(!found && storage && closestLink.pos.getRangeTo(storage) > 7) {
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
             */
            let closestLinkToController:any = Game.getObjectById(creep.room.memory.Structures.controllerLink);
            if((!closestLinkToController || closestLinkToController.structureType !== STRUCTURE_LINK) && creep.room.controller) {
                const ctrlLinks = creep.room.find(FIND_MY_STRUCTURES, {filter: (s:any) =>
                    s.structureType == STRUCTURE_LINK &&
                    s.id !== creep.room.memory.Structures.StorageLink &&
                    s.pos.getRangeTo(creep.room.controller) <= 3});
                if(ctrlLinks.length > 0) {
                    closestLinkToController = creep.room.controller.pos.findClosestByRange(ctrlLinks);
                    creep.room.memory.Structures.controllerLink = closestLinkToController.id;
                }
                else {
                    closestLinkToController = null;
                }
            }
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
                if(!creep.room.memory.planV2) {
                    console.log("ALERT: stupid bug idk why. Link store is null.", creep.memory.targetRoom);
                }
                return;
            }

            // Feeding the controller link is only worth doing if something in
            // the room will ever take the energy back out of it. With no
            // upgrader this rung is what fills a controller link to 800 and
            // leaves it there — see forwardToControllerLink() above for the
            // measurements. Same test both places, so the two never disagree.
            if(roomFeedsController(creep.room) && closestLink && closestLink.store[RESOURCE_ENERGY] >= 400 && closestLinkToController && closestLinkToController.store[RESOURCE_ENERGY] <= 400) {
                closestLink.transferEnergy(closestLinkToController);
            }

            else if(closestLink && closestLink.store[RESOURCE_ENERGY] >= 200 && extraLink && extraLink.store[RESOURCE_ENERGY] <= 200) {
                closestLink.transferEnergy(extraLink);
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
            else if(closestLink && targetLink && closestLink.id !== targetLink.id && closestLink.store[RESOURCE_ENERGY] >= 400) {
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
