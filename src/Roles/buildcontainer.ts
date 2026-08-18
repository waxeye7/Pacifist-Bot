import { isSanctionedRampart, plannedSpawnTile, planPending } from "utils/PlanV2";

/**
 * Memory.target_colonise.spawn_pos, or null if it is not a usable tile IN THIS
 * ROOM. Two things it will not let through that the old inline checks did:
 *
 *  - x/y of 0 or 49. Those are the exit band, where createConstructionSite
 *    returns ERR_INVALID_TARGET forever; rooms.construction.ts:420-421 has
 *    always used 1..48 and this did not.
 *  - a position in a room this creep merely happens to be standing in. The
 *    rampart clause below used to build at spawn_pos in WHATEVER room the creep
 *    was in, which for a colonisation builder crossing three rooms is not the
 *    colony at all.
 *
 * Returns null rather than `return`ing out of the role: a malformed spawn_pos
 * used to abort the whole tick at the top of the rampart clause, so the build
 * and harvest paths below it never ran.
 */
/**
 * Pull energy from the room a rescue builder happens to be standing in.
 *
 * LOOSE energy first, and from ANY room. Dropped piles, tombstones and ruins
 * are not anybody's reserve — they decay to nothing whether we take them or
 * not, so the "leave the last hatchery alone" rule has no claim on them.
 *
 * That distinction was missing and it deadlocked the live rescue. E37N58 was
 * the only room with a spawn, so this function refused to look at it at all —
 * while 9,560 energy sat DROPPED on its floor, spilled when its storage was
 * destroyed. E37N59's spawn site needed 3,300 more, its own room was at zero,
 * and the builders were commuting to empty remote rooms hunting for energy that
 * was lying one room away the whole time. The site advanced at 0.5/tick.
 *
 * STORED energy keeps the original rule: a room with a spawn needs its
 * extensions to hatch the next creep, and draining them to build somewhere else
 * is how a rescue eats the thing performing it.
 */
function tapRoomEnergy(creep: Creep): boolean {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;

    const loose: any[] = (creep.room.find(FIND_DROPPED_RESOURCES, {
        filter: (d: Resource) => d.resourceType === RESOURCE_ENERGY && d.amount >= 25,
    }) as any[])
        .concat(creep.room.find(FIND_TOMBSTONES, {
            filter: (t: Tombstone) => (t.store[RESOURCE_ENERGY] || 0) >= 25,
        }) as any[])
        .concat(creep.room.find(FIND_RUINS, {
            filter: (r: Ruin) => (r.store[RESOURCE_ENERGY] || 0) >= 25,
        }) as any[]);
    if (loose.length) {
        const near = creep.pos.findClosestByRange(loose);
        if (near) {
            const got = near.amount !== undefined
                ? creep.pickup(near)
                : creep.withdraw(near, RESOURCE_ENERGY);
            if (got === ERR_NOT_IN_RANGE) creep.MoveCostMatrixRoadPrio(near, 1);
            return true;
        }
    }

    // Stored energy: only where it is not the last hatchery's.
    if (creep.room.find(FIND_MY_SPAWNS).length) return false;
    const piles = creep.room.find(FIND_STRUCTURES, {filter: (s: AnyStructure) => {
        const st = s.structureType;
        if (st !== STRUCTURE_EXTENSION && st !== STRUCTURE_CONTAINER &&
            st !== STRUCTURE_LINK && st !== STRUCTURE_TOWER) return false;
        const store = (s as AnyStoreStructure).store;
        return !!store && (store[RESOURCE_ENERGY] || 0) > 0;
    }});
    if (!piles.length) return false;
    const near = creep.pos.findInRange(piles, 1)[0];
    if (near) {
        creep.withdraw(near, RESOURCE_ENERGY);
        return true;
    }
    const closest = creep.pos.findClosestByRange(piles);
    if (closest) {
        creep.MoveCostMatrixRoadPrio(closest, 1);
        return true;
    }
    return false;
}

/** Carry-only rescue haulers: dump on the spawn tile or into a WORK creep. */
function dumpAtSpawnSite(creep: Creep, site: ConstructionSite): boolean {
    if (creep.getActiveBodyparts(WORK) > 0) return false;
    if ((creep.store[RESOURCE_ENERGY] || 0) === 0) return false;
    if (!creep.pos.inRangeTo(site, 1)) {
        creep.MoveCostMatrixRoadPrio(site, 1);
        return true;
    }
    const mates = site.pos.findInRange(FIND_MY_CREEPS, 1).filter((m) =>
        m.id !== creep.id && m.getActiveBodyparts(WORK) > 0 && m.store.getFreeCapacity() > 0);
    if (mates.length) {
        creep.transfer(mates[0], RESOURCE_ENERGY);
        return true;
    }
    creep.drop(RESOURCE_ENERGY);
    return true;
}

function coloniseSpawnPos(room: Room): RoomPosition | null {
    const target = Memory.target_colonise;
    if(!target || !target.spawn_pos || room.name !== target.room) return null;
    const x = target.spawn_pos.x;
    const y = target.spawn_pos.y;
    if(typeof x !== 'number' || typeof y !== 'number') return null;
    if(x < 1 || x > 48 || y < 1 || y > 48) return null;
    return new RoomPosition(x, y, room.name);
}

const run = function (creep):CreepMoveReturnCode | -2 | -5 | -7 | void {

    creep.memory.moving = false;

    if(creep.room.name != creep.memory.targetRoom && !creep.memory.fill) {
        // Grab idle energy in spawnless rooms we walk through (E37N59 1850
        // sitting in extensions while CBs hiked past empty).
        if (creep.store.getFreeCapacity() > 0 && tapRoomEnergy(creep)) {
            if (creep.store.getFreeCapacity() === 0) creep.memory.building = true;
            return;
        }
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(creep.room.name !== creep.memory.targetRoom && creep.memory.fill) {
        if(creep.store.getFreeCapacity() !== 0) {
            let storage = creep.room.storage;
            if(storage && (storage.store[RESOURCE_ENERGY] || 0) > 0) {
                let result = creep.withdraw(storage, RESOURCE_ENERGY);
                if(result == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(storage,1);
                    return;
                }
                else if(result === 0) {
                    creep.memory.fill = false;
                }
                else if(result == ERR_NOT_ENOUGH_RESOURCES) {
                    creep.memory.fill = false;
                }
            }
            else if (tapRoomEnergy(creep)) {
                if (creep.store.getFreeCapacity() === 0) creep.memory.fill = false;
                return;
            }
            else {
                creep.memory.fill = false;
            }
            if(creep.memory.fill) return;
        }
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(creep.holdForFlee()) {
        return;
    }

    let targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);

    // ------------------------------------------------------------------
    // SPAWN FIRST. This creep exists for exactly one reason: to stand the new
    // colony's spawn up. Until that spawn is FINISHED the room cannot make a
    // creep, so nothing else in it is worth a single build tick.
    //
    // findClosestByRange over every site is what broke E15S6: the room sat at
    // RCL2 with the spawn site at 1135/15000 while four extension sites (and
    // one COMPLETED extension) surrounded it, and this creep simply built
    // whichever happened to be nearest. Filter, do not sort — a spawn site
    // must not merely outrank the extensions, it must be the only candidate.
    // ------------------------------------------------------------------
    const roomHasSpawn = creep.room.find(FIND_MY_SPAWNS).length > 0;
    let buildTheSpawnFirst = false;
    if(!roomHasSpawn) {
        const spawnSites = targets.filter(s => s.structureType === STRUCTURE_SPAWN);
        if(spawnSites.length) {
            targets = spawnSites;
            buildTheSpawnFirst = true;
        }
    }

    let closestTarget = creep.pos.findClosestByRange(targets);
    if(closestTarget && closestTarget.structureType === STRUCTURE_SPAWN && creep.pos.isEqualTo(closestTarget.pos)) {
        // One move intent per tick — the last call wins — so pick a single
        // walkable in-bounds tile instead of overwriting TOP/BOTTOM/LEFT with RIGHT.
        const terrain = creep.room.getTerrain();
        const steps = [[0, -1, TOP], [0, 1, BOTTOM], [-1, 0, LEFT], [1, 0, RIGHT]];
        for(let i = 0; i < steps.length; i++) {
            const x = creep.pos.x + steps[i][0];
            const y = creep.pos.y + steps[i][1];
            if(x < 1 || x > 48 || y < 1 || y > 48) continue;
            if(terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            let blocked = false;
            const structs = creep.room.lookForAt(LOOK_STRUCTURES, x, y);
            for(let j = 0; j < structs.length; j++) {
                if(OBSTACLE_OBJECT_TYPES.indexOf(structs[j].structureType) !== -1) {
                    blocked = true;
                    break;
                }
            }
            if(blocked) continue;
            creep.move(steps[i][2]);
            break;
        }
    }
    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();


    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.source = false;
        creep.memory.building = false;
    }
    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
        creep.memory.building = true;
    }
    // Spawn rescue: do not wait for a full tank. Live E39N58 sat at 730/15k
    // with three CBs in-room holding 36–98 because building only flipped at
    // getFreeCapacity()==0.
    if(!creep.memory.building && creep.store[RESOURCE_ENERGY] > 0 && buildTheSpawnFirst) {
        creep.memory.building = true;
    }
    if(buildTheSpawnFirst && closestTarget && dumpAtSpawnSite(creep, closestTarget)) {
        return;
    }

    if(creep.memory.building) {
        if(creep.room.controller && creep.room.controller.level !== 8) {
            // ----------------------------------------------------------
            // DOWNGRADE RESCUE — outranks spawn-first.
            //
            // buildTheSpawnFirst suppresses BOTH upgrade clauses below, and
            // that is right until the room is about to stop being ours. Live
            // E39N58: RCL1, no spawn, spawn site at 14,320/15,000 (680 short),
            // ticksToDowngrade ~2,700 and falling, three ContainerBuilders
            // inbound — and not one of them would have touched the controller.
            // The room reverts to unowned, the site and the 14,320 energy in it
            // go with it, and the whole colonisation is lost 680 energy from
            // the finish line.
            //
            // One upgradeController tick restores CONTROLLER_DOWNGRADE_RESTORE
            // = 100 ticks, so this is cheap: WORK energy for ~31 ticks buys the
            // timer back from 5,000 to 8,000. The hysteresis matters — a single
            // threshold would re-trip every 100 ticks and walk the creep back
            // and forth between the controller and the spawn site forever.
            // Latch on below CB_RESCUE_DOWNGRADE, release at CB_RESCUE_RELEASE,
            // one round trip.
            //
            // Only for a controller we own (a CB sent to a remote to build
            // containers must not start upgrading someone else's room) and only
            // while carrying energy, which this block already guarantees
            // (building is cleared at :117 the moment the store empties) — so
            // the 0-energy pickup path at the bottom of the role is untouched.
            // ----------------------------------------------------------
            const CB_RESCUE_DOWNGRADE = 5000;
            const CB_RESCUE_RELEASE = 8000;
            let downgradeRescue = false;
            if(creep.room.controller.my && !creep.room.controller.upgradeBlocked) {
                const dg = creep.room.controller.ticksToDowngrade;
                downgradeRescue = creep.memory.dgRescue ? dg < CB_RESCUE_RELEASE : dg < CB_RESCUE_DOWNGRADE;
            }
            if(downgradeRescue !== !!creep.memory.dgRescue) {
                if(downgradeRescue) creep.memory.dgRescue = true;
                else delete creep.memory.dgRescue;
            }
            if(downgradeRescue) {
                // upgrade OR close the gap — never both, they are the same
                // WORK action and the build walk below would drag us off.
                if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
                }
                return;
            }

            // opportunistic upgrade on the way past — but not while the spawn
            // site is what we are here for: build() and upgradeController()
            // compete for the same WORK action and the same carried energy.
            if(!buildTheSpawnFirst && creep.pos.getRangeTo(creep.room.controller) <= 3) {
                creep.upgradeController(creep.room.controller);
            }
            // ----------------------------------------------------------
            // The RCL1 clause below is UNCONDITIONAL — `level == 1` with no
            // downgrade test — so in a fresh claim this creep walked to the
            // controller and `return`ed every single tick, and never once
            // touched the spawn site it was sent to build. The room therefore
            // reached RCL2 with no spawn, which is what unlocked the five
            // extensions that then out-competed the spawn for site slots and
            // build ticks (see utils/PlanV2 spawnFirstLockdown).
            //
            // While a spawn site is standing unbuilt in a spawnless room, the
            // spawn wins. Nothing is lost by waiting: RCL1 downgrades after
            // CONTROLLER_DOWNGRADE[1] = 20000 ticks, and the spawn is 15000
            // build energy — this creep will have finished it and the room
            // will be upgrading itself long before that matters.
            // ----------------------------------------------------------
            if(!buildTheSpawnFirst && !creep.room.controller.upgradeBlocked && (creep.room.controller.level == 1 || creep.room.controller.level == 2 && creep.room.controller.ticksToDowngrade < 6000 || creep.room.controller.level == 3 && creep.room.controller.ticksToDowngrade < 9000 || creep.room.controller.level == 4 && creep.room.controller.ticksToDowngrade < 15000 || creep.room.controller.level == 5 && creep.room.controller.ticksToDowngrade < 16000 || creep.room.controller.level == 6 && creep.room.controller.ticksToDowngrade < 25000 || creep.room.controller.level == 7 && creep.room.controller.ticksToDowngrade < 34000 || creep.room.controller.level == 8 && creep.room.controller.ticksToDowngrade < 43000)) {
                creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
                return;
            }

        }
        // if(creep.room.controller && (creep.room.controller.level == 1 || creep.room.controller.level == 2 && creep.room.controller.ticksToDowngrade < 9000 || creep.room.controller.level == 3 && creep.room.controller.ticksToDowngrade < 18000 || creep.room.controller.level == 4 && creep.room.controller.ticksToDowngrade < 27000 || creep.room.controller.level == 5 && creep.room.controller.ticksToDowngrade < 36000 || creep.room.controller.level == 6 && creep.room.controller.ticksToDowngrade < 45000 || creep.room.controller.level == 7 && creep.room.controller.ticksToDowngrade < 54000 || creep.room.controller.level == 8 && creep.room.controller.ticksToDowngrade < 63000)) {
        //     if(creep.pos.getRangeTo(creep.room.controller) <= 3) {
        //         creep.upgradeController(creep.room.controller);
        //     }
        //     if(creep.room.controller.level == 1 || creep.room.controller.level == 2 && creep.room.controller.ticksToDowngrade < 6000 || creep.room.controller.level == 3 && creep.room.controller.ticksToDowngrade < 9000 || creep.room.controller.level == 4 && creep.room.controller.ticksToDowngrade < 15000 || creep.room.controller.level == 5 && creep.room.controller.ticksToDowngrade < 16000 || creep.room.controller.level == 6 && creep.room.controller.ticksToDowngrade < 25000 || creep.room.controller.level == 7 && creep.room.controller.ticksToDowngrade < 34000 || creep.room.controller.level == 8 && creep.room.controller.ticksToDowngrade < 43000) {
        //         creep.MoveCostMatrixRoadPrio(creep.room.controller, 3);
        //         return;
        //     }

        // }

        let mySpawns = creep.room.find(FIND_MY_SPAWNS)
        // ------------------------------------------------------------------
        // THE OFF-PLAN SPAWN IS A RACE, AND ONLY ONE SIDE OF IT KNOWS.
        //
        // Memory.target_colonise.spawn_pos is picked by the expansion scout;
        // room.memory.planV2.t.spawn is picked by the offline planner. This
        // clause used to consult only the first, on a Game.time % 25 tick, and
        // whichever landed first won — because placeFromPlanV2 skips a type the
        // moment `existing >= cap`, and one built spawn is the RCL1-6 cap. Lose
        // the race and the plan NEVER sites its own spawn, and migrateSpawns
        // keeps the off-plan one until RCL7.
        //
        // So: the plan wins whenever it has an opinion, and while it is still
        // being read out of the segment (two ticks) nobody places anything.
        // AutoExpand adopts on claim, so for a planned room this branch is now
        // dead code — it stays for the rooms colonised ahead of a plan, which
        // is the case it was written for.
        // ------------------------------------------------------------------
        const spawnPos = coloniseSpawnPos(creep.room);
        const planOwnsTheSpawn = planPending(creep.room) || plannedSpawnTile(creep.room) !== null;
        if(Game.time % 25 == 0 && spawnPos && !planOwnsTheSpawn && creep.room.find(FIND_MY_CONSTRUCTION_SITES).length == 0 && mySpawns.length == 0) {
            spawnPos.createConstructionSite(STRUCTURE_SPAWN);
        }

        if(mySpawns.length == 1) {
            // argless getFreeCapacity() is null on a spawn (always !== 0),
            // and the fill move was overwritten by the build walk below
            if(mySpawns[0].store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                if(creep.pos.isNearTo(mySpawns[0])) {
                    creep.transfer(mySpawns[0], RESOURCE_ENERGY);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(mySpawns[0], 1);
                }
                return;
            }

            // ------------------------------------------------------------------
            // THE SPAWN RAMPART. One rampart, over the new colony's spawn, so the
            // one structure the room cannot survive losing is not naked.
            //
            // It used to be sited with NO RCL GATE, EVERY TICK (not on the %25
            // cadence the spawn siting uses), in whatever room the creep was
            // standing in, and with no check that the shell wants a rampart
            // there at all. Ramparts are RCL4+, so at RCL1-3 that was a
            // guaranteed-failing createConstructionSite every tick; and a
            // rampart the min-cut shell does not want is one this creep would
            // then nurse forever out of the colony's own energy, which is the
            // exact tax utils/PlanV2 sanctionedRampartKeys exists to stop.
            //
            // isSanctionedRampart returns TRUE for a room with no plan and no
            // perimeter, so the fresh-claim case this was written for still
            // gets its rampart — it is only the planned rooms that now say no.
            // ------------------------------------------------------------------
            if(spawnPos && creep.room.controller && creep.room.controller.level >= 4 &&
               isSanctionedRampart(creep.room, spawnPos)) {
                let lookForBuildings = spawnPos.lookFor(LOOK_STRUCTURES);
                let standing = false;
                for(let building of lookForBuildings) {
                    if(building.structureType != STRUCTURE_RAMPART) continue;
                    standing = true;
                    if(building.hits < building.hitsMax - 5000 && building.hits < 1500000) {
                        creep.repair(building)
                        return;
                    }
                }
                if(!standing && Game.time % 25 == 0) {
                    spawnPos.createConstructionSite(STRUCTURE_RAMPART);
                }
            }
        }

        if(targets.length > 0) {
            if(creep.build(closestTarget) == ERR_NOT_IN_RANGE) {
                creep.MoveCostMatrixRoadPrio(closestTarget, 3);
            }
            return
        }
        else {
            const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {
                filter: object => object.hits < object.hitsMax && object.structureType != STRUCTURE_WALL
            });

            buildingsToRepair.sort((a,b) => a.hits - b.hits);
            if(buildingsToRepair.length > 0) {
                let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
                if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(closestBuildingToRepair, 3);
                }
                return;
            }
        }
    }
    if(!creep.memory.building) {
        if (tapRoomEnergy(creep)) return;
        if(creep.room.storage) {
            if(creep.room.storage.store[RESOURCE_ENERGY] >= creep.store.getFreeCapacity()) {
                if(creep.withdraw(creep.room.storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixRoadPrio(creep.room.storage, 1);
                }
                return;
            }
        }
        let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: r => r.resourceType == RESOURCE_ENERGY && (r.amount >= 300 && creep.pos.getRangeTo(r) <= 20 || r.amount >= 50 && creep.pos.getRangeTo(r) < 3)});
        if(droppedResources.length > 0) {
            droppedResources.sort((a,b) => b.amount - a.amount);
            if(creep.pos.isNearTo(droppedResources[0])) {
                creep.pickup(droppedResources[0]);
            }
            else {
                creep.MoveCostMatrixRoadPrio(droppedResources[0], 1);
            }
            return;
        }
        let tombstones = creep.room.find(FIND_TOMBSTONES, {filter: t => t.store[RESOURCE_ENERGY] > 20});
        if(tombstones.length > 0) {
            tombstones.sort((a,b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
            if(creep.pos.isNearTo(tombstones[0])) {
                creep.withdraw(tombstones[0],RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixRoadPrio(tombstones[0], 1);
            }
            return;
        }
        let ruins = creep.room.find(FIND_RUINS, {filter: r => r.store[RESOURCE_ENERGY] > 0});
        if(ruins.length > 0) {
            let closestRuin = creep.pos.findClosestByRange(ruins);
            if(creep.pos.isNearTo(closestRuin)) {
                creep.withdraw(closestRuin,RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestRuin, 1);
            }
            return;
        }

        let source:any = Game.getObjectById(creep.memory.source);
        if(source && source.energy == 0) {
            creep.memory.source = false;
        }


        if(storage && storage.store[RESOURCE_ENERGY] != 0) {
            let result = creep.withdrawStorage(storage)
        }
        else {
            let result = creep.harvestEnergy();
            if(result == -6 || result == -11)  {
                creep.acquireEnergyWithContainersAndOrDroppedEnergy();
            }
        }
    }
}

const roleBuildContainer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleBuildContainer;
