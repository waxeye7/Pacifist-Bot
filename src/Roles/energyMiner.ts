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

        let result = creep.harvestEnergy();
        if(result == 0) {
            creep.memory.harvested = true;
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
            let closestLinkToController:any = Game.getObjectById(creep.room.memory.Structures.controllerLink);
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

            if(closestLink && closestLink.store[RESOURCE_ENERGY] >= 400 && closestLinkToController && closestLinkToController.store[RESOURCE_ENERGY] <= 400) {
                closestLink.transferEnergy(closestLinkToController);
            }

            else if(closestLink && closestLink.store[RESOURCE_ENERGY] >= 200 && extraLink && extraLink.store[RESOURCE_ENERGY] <= 200) {
                closestLink.transferEnergy(extraLink);
            }

            else if(closestLink && closestLink.store[RESOURCE_ENERGY] == 800 && targetLink && targetLink.store[RESOURCE_ENERGY] == 0) {
                closestLink.transferEnergy(targetLink);
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
