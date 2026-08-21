/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { interiorMove, filterOutposts, outpostDeferred, rampartIsBuried } from "utils/Interior";
import { isSanctionedRampart } from "utils/PlanV2";
import { stompForeignSite } from "utils/ForeignSites";

const STEP_DX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
const STEP_DY = [0, -1, -1, 0, 1, 1, 1, 0, -1];

function stepIfWalkable(creep, dir) {
    const x = creep.pos.x + STEP_DX[dir];
    const y = creep.pos.y + STEP_DY[dir];
    if(x < 1 || x > 48 || y < 1 || y > 48) return false;
    if(creep.room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return false;
    const structs = creep.room.lookForAt(LOOK_STRUCTURES, x, y);
    for(let i = 0; i < structs.length; i++) {
        if(OBSTACLE_OBJECT_TYPES.indexOf(structs[i].structureType) !== -1) return false;
    }
    creep.move(dir);
    return true;
}

const WALL_HITS_CAP = 50050000;
const NUKE_SAFE_REMAINDER = 175000;

function nukeRemainder(rampart, nukes) {
    let hits = rampart.hits;
    for(let i = 0; i < nukes.length; i++) {
        const nuke = nukes[i];
        if(nuke.pos.x == rampart.pos.x && nuke.pos.y == rampart.pos.y) hits -= 10000000;
        else if(nuke.pos.getRangeTo(rampart) <= 2) hits -= 5000000;
    }
    return hits;
}

function findLocked(creep, storage) {
    let nukes = creep.room.find(FIND_NUKES);
    let nukeBOOL = false;
    if(nukes.length > 0) {
        nukeBOOL = true;
    }
    else if(creep.room.memory.NukeRepair) {
        // Latch lived past the last land: findLocked only wrote false
        // inside nukes.length > 0, so spawning kept 4 repairers forever.
        creep.room.memory.NukeRepair = false;
    }

    let buildingsToRepair300mil;

    if(creep.room.controller.level >= 6) {
        // if(creep.room.memory.danger) {
        //     buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER && storage && building.pos.getRangeTo(storage) <= 10 && building.pos.getRangeTo(storage) > 6});
        // }
        // else {
            // ...and never a BURIED rampart. Sanctioned is not enough: the
            // plan's cover pass emits rampart bubbles priced against a
            // PROVISIONAL wall, and the enclosure trades then pull some of them
            // inside the final wall. A rampart at depth >= 4 is beyond ranged
            // reach from every standable exterior tile, so repairing it buys
            // nothing (utils/Interior rampartIsBuried; fail-open false).
            if(creep.room.name === "E41N58") {
                buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER && storage && (building.pos.getRangeTo(storage) > 15 || building.pos.getRangeTo(storage) < 10) && (building.structureType !== STRUCTURE_RAMPART || isSanctionedRampart(creep.room, building.pos) && !rampartIsBuried(creep.room, building.pos)) && (building.structureType !== STRUCTURE_WALL || building.structureType == STRUCTURE_WALL && building.hits <= WALL_HITS_CAP && !creep.room.memory.danger)});
            }
            else {
                buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER && storage && (building.structureType !== STRUCTURE_RAMPART || isSanctionedRampart(creep.room, building.pos) && !rampartIsBuried(creep.room, building.pos)) && (building.structureType !== STRUCTURE_WALL || building.structureType == STRUCTURE_WALL && building.hits <= WALL_HITS_CAP && !creep.room.memory.danger)});
            }

        // }
    }
    else if(creep.room.controller.level > 2) {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits + 1000 < building.hitsMax && building.hits < 300000000 && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER});
    }
    else {
        buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits + 1000 < building.hitsMax && building.hits < 300000000});
    }


    if(nukeBOOL) {
        if(creep.room.controller.level >= 6) {

            let important_structures = creep.room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_STORAGE || s.structureType == STRUCTURE_TERMINAL || s.structureType == STRUCTURE_FACTORY || s.structureType == STRUCTURE_LAB || s.structureType === STRUCTURE_NUKER || s.structureType === STRUCTURE_POWER_SPAWN});

            for(let nuke of nukes) {
                for(let s of important_structures) {
                    if(nuke.pos.getRangeTo(s) <= 2) {
                        s.pos.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }
            }

            let ramparts_on_important_structures = []

            for(let structure of important_structures) {
                let lookForStructs = structure.pos.lookFor(LOOK_STRUCTURES);
                for(let buildingOnHere of lookForStructs) {
                    if(buildingOnHere.structureType == STRUCTURE_RAMPART) {
                        ramparts_on_important_structures.push(buildingOnHere);
                    }
                }
            }

            let important_structures_data = []
            for(let important_rampart of ramparts_on_important_structures) {
                important_structures_data.push([important_rampart, important_rampart.hits])
            }

            for(let nuke of nukes) {
                for(let building_data of important_structures_data) {
                    if(nuke.pos.x == building_data[0].pos.x && nuke.pos.y == building_data[0].pos.y) {
                        building_data[1] -= 10000000;
                    }
                    else if(nuke.pos.getRangeTo(building_data[0]) <= 2) {
                        building_data[1] -= 5000000;
                    }
                }
            }

            // First-match in FIND order piled every repairer on one spawn
            // rampart while a storage/terminal tile went to 0.
            let worst = null;
            let worstRemainder = Infinity;
            for(let data of important_structures_data) {
                if(data[1] < NUKE_SAFE_REMAINDER && data[1] < worstRemainder) {
                    worst = data;
                    worstRemainder = data[1];
                }
            }
            if(worst) {
                creep.say("🎯", true);
                creep.memory.locked = worst[0].id;
                creep.room.memory.NukeRepair = true;
                return worst[0].id;
            }


        }

        creep.room.memory.NukeRepair = false;

    }


    // Outpost repair is DEFERRED entirely while the room is under attack:
    // anything the min-cut shell does not enclose (remote road spurs, source
    // containers past the wall, the mineral line) is not worth walking a
    // repairer out of the ramparts for. Peacetime is unaffected.
    buildingsToRepair300mil = filterOutposts(creep.room, buildingsToRepair300mil);

    if(buildingsToRepair300mil.length > 0) {
        if(creep.room.controller && creep.room.controller.level <= 3) {
            let closestToRepair = creep.pos.findClosestByRange(buildingsToRepair300mil);
            creep.say("🎯", true);
            creep.memory.locked = closestToRepair.id;
            return closestToRepair.id;
        }
        else {
            buildingsToRepair300mil.sort((a,b) => a.hits - b.hits);
            creep.say("🎯", true);
            creep.memory.locked = buildingsToRepair300mil[0].id;
            return buildingsToRepair300mil[0].id;
        }

    }
    else {
        // Desperation fallback: literally anything damaged. Still not a buried
        // rampart — "nothing else needs repairing" is the exact state in which
        // an RCL8 room used to discover its 13M-hit interior bubble and keep
        // feeding it (hits < hitsMax is true up to 300M).
        buildingsToRepair300mil = filterOutposts(
            creep.room,
            creep.room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < 300000000 && (building.structureType !== STRUCTURE_RAMPART || !rampartIsBuried(creep.room, building.pos))}),
        );
        if(buildingsToRepair300mil.length > 0) {
            buildingsToRepair300mil.sort((a,b) => a.hits - b.hits);
            creep.say("🎯", true);
            creep.memory.locked = buildingsToRepair300mil[0].id;
            return buildingsToRepair300mil[0].id;
        }
    }
}

 const run = function (creep) {
    creep.memory.moving = false;

    if(creep.room.memory.NukeRepair && creep.room.find(FIND_NUKES).length == 0) {
        creep.room.memory.NukeRepair = false;
    }
    if(Game.cpu.bucket < 100 && !creep.memory.boosted)return;
    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    if(creep.evacuate()) {
		return;
	}
    if (!creep.store.getUsedCapacity() && stompForeignSite(creep)) return;

    if(creep.holdForFlee()) {
        return;
    }

    // console.log(_.keys(creep.store).length)
    if(creep.memory.homeRoom && creep.memory.homeRoom != creep.room.name) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
    }

    // if(creep.room.controller && creep.room.controller.level >= 6 && creep.room.memory.danger && creep.room.memory.labs && Object.keys(creep.room.memory.labs).length >= 4 &&
    //     creep.ticksToLive >= 1480 && creep.body[creep.body.length-3].boost == undefined) {
    //     let outputLab:any = Game.getObjectById(creep.room.memory.labs.outputLab);
    //     let boostLab;
    //     if(creep.room.memory.labs.boostLab) {
    //         boostLab = Game.getObjectById(creep.room.memory.labs.boostLab);
    //     }
    //     if(outputLab && outputLab.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] >= 30) {
    //         if(creep.pos.isNearTo(outputLab)) {
    //             outputLab.boostCreep(creep);
    //         }
    //         else {
    //             creep.moveTo(outputLab);
    //         }
    //         return;
    //     }
    //     else if(boostLab && boostLab.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] >= 30) {
    //         if(creep.pos.isNearTo(boostLab)) {
    //             boostLab.boostCreep(creep);
    //         }
    //         else {
    //             creep.moveTo(boostLab);
    //         }
    //         return;
    //     }
    // }

    // if(creep.memory.targetRoom) {

    // }
    // const start = Game.cpu.getUsed()

    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    // ------------------------------------------------------------------
    // Help with construction WITHOUT rewriting memory.role.
    //
    // This branch used to do `creep.memory.role = "builder"`, which is a
    // PERMANENT, one-way rewrite — the same bug the upgrader carried (see
    // Roles/upgrader.ts, commit "upgraders no longer convert to builders on
    // their first tick"). rooms.spawning.ts sizes the roster off memory.role:
    // the `case "repair"` arm of the census switch (rooms.spawning.ts:492) is
    // the ONLY thing that counts repairers, so every converted creep left
    // `repairers` and joined `builders` for the rest of its life.
    //
    // The condition is a standing state, not an event: an RCL4 room that lost
    // its bank keeps satisfying it, so the room converts each repairer the
    // tick it spawns, reads `repairers == 0` forever, queues another, and
    // inflates `builders` — which then blocks the real builder rung. Nothing
    // ever converts back, because the test is re-run against a role that no
    // longer routes here.
    //
    // Delegating for the tick keeps the intent (a skeleton crew with no bank
    // needs hands on the sites, not on decay) and keeps the census honest.
    //
    // `locked` is shared with the builder role but means a different thing
    // there — a construction SITE, not a damaged structure — and builder only
    // drops a lock whose object has vanished, so a repair target handed across
    // survives as a lock the builder can never build. It is therefore cleared
    // on each TRANSITION (both directions) and left alone in between, so each
    // role still gets to keep a lock while it is the one driving.
    // ------------------------------------------------------------------
    // "no bank" = no real STRUCTURE_STORAGE: findStorage() now returns the
    // 2k hub container at RCL4 while the storage is a site, and that is
    // exactly the room this delegation was written for.
    const skeletonCrewNoBank = creep.room.controller && creep.room.controller.level == 4 &&
        (!storage || storage.structureType !== STRUCTURE_STORAGE) && creep.room.find(FIND_MY_CREEPS).length < 8;
    const helpBuild = skeletonCrewNoBank && creep.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0;
    const mem: any = creep.memory;
    if(helpBuild !== !!mem.helpBuild) {
        mem.helpBuild = helpBuild;
        creep.memory.locked = false;
    }
    if(helpBuild) {
        const builder: any = (global as any).ROLES && (global as any).ROLES.builder;
        if(builder) {
            builder.run(creep);
            return;
        }
    }


    if(creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.repairing = false;
    }
    // Adjacent-to-storage top-up never hits energy==0, so a peacetime
    // wall lock used to ride through a raid until TTL%250 at the bank.
    if((creep.room.memory.danger || (creep.room.memory.defence && creep.room.memory.defence.nuke)) && Game.time % 7 === 0) {
        creep.memory.locked = false;
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }


    if(creep.ticksToLive <= 88 && (!creep.memory.repairing || _.keys(creep.store).length == 0)) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide) {
		creep.recycle();
        return;
	}

    if(creep.memory.repairing) {
        let repairTarget:any = Game.getObjectById(creep.memory.locked);

        if(!repairTarget) {
            creep.memory.locked = findLocked(creep, storage);
        }
        else if(repairTarget.hits == repairTarget.hitsMax) {
            creep.memory.locked = findLocked(creep, storage);
        }
        else if(repairTarget.structureType == STRUCTURE_WALL && repairTarget.hits > WALL_HITS_CAP) {
            creep.memory.locked = findLocked(creep, storage);
        }
        // a rampart locked before the shell closed around it (replan, adopt)
        // is now buried and pure upkeep — drop the lock, same as an off-plan one
        else if(repairTarget.structureType == STRUCTURE_RAMPART && rampartIsBuried(creep.room, repairTarget.pos)) {
            creep.memory.locked = findLocked(creep, storage);
        }
        else if(repairTarget.structureType == STRUCTURE_RAMPART) {
            const liveNukes = creep.room.find(FIND_NUKES);
            if(liveNukes.length > 0 && nukeRemainder(repairTarget, liveNukes) >= NUKE_SAFE_REMAINDER) {
                creep.memory.locked = findLocked(creep, storage);
            }
        }
        if(creep.memory.locked && creep.ticksToLive % 250 == 0) {
            creep.memory.locked = findLocked(creep, storage);
        }

        // room.memory.rampart is never written (the live key is rampartToMan).
        // Re-calling findLocked here after it already returned nothing is a
        // no-op even if a rampart object existed, so the siege re-lock is gone.


        if(creep.memory.locked) {
            let repairTarget = Game.getObjectById(creep.memory.locked);
            // a target locked before the siege started may now be an outpost
            if(outpostDeferred(creep.room, repairTarget)) {
                creep.memory.locked = false;
                repairTarget = null;
            }
            let result = repairTarget ? creep.repair(repairTarget) : ERR_INVALID_TARGET;
            if(result == ERR_NOT_IN_RANGE) {
                if (!interiorMove(creep, repairTarget, 3)) {
                    if(creep.memory.boosted) {
                        creep.MoveCostMatrixIgnoreRoads(repairTarget, 3)
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(repairTarget, 3)
                    }
                }
                creep.memory.moving = false;
            }
            // else {
                // if(creep.store.getFreeCapacity() <= 50) {
                //     if(creep.roadCheck()) {
                //         let roadlessLocation = creep.roadlessLocation(repairTarget);
                //         creep.moveTo(roadlessLocation);
                //     }
                // }
                // if(creep.store.getFreeCapacity() < 100 && creep.store.getFreeCapacity() > 50 && creep.roadCheck()) {
                //     creep.moveAwayIfNeedTo();
                // }
            // }
        }

    }

    if(!creep.memory.repairing && (!creep.room.memory.danger || creep.room.controller && creep.room.controller.level <= 6) && creep.room.memory.Structures && creep.room.memory.Structures.towers) {
        let towers = [];
        for(let towerID of creep.room.memory.Structures.towers) {
            let tower:any = Game.getObjectById(towerID);
            if(tower && (tower.store[RESOURCE_ENERGY] > 900 || creep.room.controller && creep.room.controller.level >= 7) && tower.store[RESOURCE_ENERGY] >= creep.store.getFreeCapacity() / 2 && creep.pos.getRangeTo(tower) <= 6) {
                towers.push(tower);
            }
        }

        if(creep.room.memory.Structures.extraLinks) {
            for(let linkID of creep.room.memory.Structures.extraLinks) {
                let link = <StructureLink> Game.getObjectById(linkID);
                if(link && link.store[RESOURCE_ENERGY] > 0 && creep.pos.getRangeTo(link) <= 6) {
                    towers.push(link)
                }
            }
        }

        if(towers.length > 0) {
            let closestTower = creep.pos.findClosestByRange(towers);
            if(creep.pos.isNearTo(closestTower)) {
                if(creep.withdraw(closestTower, RESOURCE_ENERGY) === 0) {
                    creep.memory.repairing = true;
                }
            }
            else {
                if(creep.memory.boosted) {
                    creep.MoveCostMatrixIgnoreRoads(closestTower, 1)
                }
                else {
                    creep.MoveCostMatrixRoadPrio(closestTower, 1)
                }
            }
            if(storage && creep.pos.getRangeTo(storage) > creep.pos.getRangeTo(closestTower)) {
                return;
            }
        }
    }

    if(!creep.memory.repairing && creep.room.memory.Structures && creep.room.memory.Structures.controllerLink) {
        let controllerLink = <StructureLink> Game.getObjectById(creep.room.memory.Structures.controllerLink);
        if(controllerLink && controllerLink.store[RESOURCE_ENERGY] >= creep.store.getFreeCapacity() /2 && creep.pos.getRangeTo(controllerLink) <= 4) {
            if(creep.pos.isNearTo(controllerLink)) {
                if(creep.withdraw(controllerLink, RESOURCE_ENERGY) === 0) {
                    creep.memory.repairing = true;
                }
            }
            else {
                if(creep.memory.boosted) {
                    creep.MoveCostMatrixIgnoreRoads(controllerLink, 1)
                }
                else {
                    creep.MoveCostMatrixRoadPrio(controllerLink, 1)

                }
            }

        }
    }

    if(!creep.memory.repairing && storage) {
        let result = creep.withdrawStorage(storage);
		if(result == 0) {
			if(!creep.memory.locked) {
				creep.memory.locked = findLocked(creep, storage);
			}
			if(creep.memory.locked) {
				let repairTarget = Game.getObjectById(creep.memory.locked);
                if (!interiorMove(creep, repairTarget, 3)) {
                    if(creep.memory.boosted) {
                        creep.MoveCostMatrixIgnoreRoads(repairTarget, 3)
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(repairTarget, 3)
                    }
                }
			}
		}
    }

    else if(!creep.memory.repairing) {
        let result = creep.acquireEnergyWithContainersAndOrDroppedEnergy();
		if(result == 0) {
			if(!creep.memory.locked) {
				creep.memory.locked = findLocked(creep, storage);
			}
			if(creep.memory.locked) {
				let repairTarget = Game.getObjectById(creep.memory.locked);
                if (!interiorMove(creep, repairTarget, 3)) {
                    if(creep.memory.boosted) {
                        creep.MoveCostMatrixIgnoreRoads(repairTarget, 3)
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(repairTarget, 3)
                    }
                }
			}
		}
    }

    if(storage && creep.pos.isNearTo(storage) && creep.getActiveBodyparts(WORK) >= creep.store[RESOURCE_ENERGY])  {
        if(creep.ticksToLive > 3) {
            // withdrawStorage owns the floor/cap. A second bare withdraw
            // last-won and emptied the bank the first call had reserved.
            creep.withdrawStorage(storage);
        }
        if(creep.getActiveBodyparts(WORK) == 45 && creep.pos.x == storage.pos.x && creep.pos.y == storage.pos.y + 1) {
            // move() returns OK when the intent is accepted, not when the tile
            // is free, so the later directions never ran. Walkability first.
            if(stepIfWalkable(creep, RIGHT) || stepIfWalkable(creep, TOP_RIGHT) || stepIfWalkable(creep, TOP_LEFT)) {
                return;
            }
        }
        else if(creep.getActiveBodyparts(WORK) == 45 && creep.pos.x == storage.pos.x - 1 && creep.pos.y == storage.pos.y + 1) {
            if(stepIfWalkable(creep, TOP)) {
                return;
            }
        }
    }
}

const roleRepair = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRepair;




        // const buildingsToRepair1mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 1000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair3mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 3000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair10mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 10000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair30mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 30000000 && object.structureType !== STRUCTURE_ROAD});
        // const buildingsToRepair300mil = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && object.hits < 300000000 && object.structureType !== STRUCTURE_ROAD});
