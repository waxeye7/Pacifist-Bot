import {
    findDamagedPerimeterRamparts,
    findPerimeterRamparts,
    perimeterKeySet,
    SHELL_MIN_RCL,
} from "utils/Perimeter";

/**
 * Ramparts that sit EXACTLY on a planned perimeter tile.
 *
 * Deliberately strict, unlike findPerimeterRamparts, which falls back to
 * "within range 1 of the cut" and then to "a band around storage". Shell
 * upkeep must never adopt an off-plan rampart: a room that replans (or that
 * gets a v2 plan adopted over a legacy layout) is left with ramparts on the
 * OLD shell, and the whole point is to let those decay away instead of
 * spending tower energy holding a wall that no longer encloses anything.
 */
function planShellRamparts(room: any): any[] {
    const set = perimeterKeySet(room);
    if (!set.size) return [];
    return room.find(FIND_MY_STRUCTURES, {
        filter: (s: any) =>
            s.structureType == STRUCTURE_RAMPART && set.has(`${s.pos.x},${s.pos.y}`)
    });
}

function isShellDefender(c: any): boolean {
    return c.memory && (c.memory.role == "RampartDefender" || c.memory.role == "RRD");
}

function clearCivilianFleeing(room: any) {
    const creeps = room.find(FIND_MY_CREEPS);
    for (const c of creeps) {
        if (c.memory && c.memory.fleeing) c.memory.fleeing = false;
    }
}

/**
 * One unique shell tile per live RD/RRD. A single room.rampartToMan made
 * every extra defender path onto the same seat (peer-255, then walker-veto
 * held the volley). Occupancy is a SECOND pass so last-tick's occupant
 * cannot pin in_position before this tick's seats are chosen.
 */
function assignDefenderTiles(room: any, MyRamparts: any[], HostileCreeps: any[], myCreeps: any[]): any[] {
    const defenders = myCreeps.filter((c: any) => isShellDefender(c) && !c.spawning);
    const mannable: any[] = [];
    for (const rampart of MyRamparts) {
        const occupant = rampart.pos.lookFor(LOOK_CREEPS)[0];
        // Friendly-only skip used to assign a tile a hostile already stands on.
        if (occupant && !occupant.my) continue;
        mannable.push(rampart);
    }
    const mannableIds: any = {};
    for (const r of mannable) mannableIds[r.id] = true;
    const taken: any = {};
    const assigned: any[] = [];

    // Already-on-shell first so a parked defender keeps its legal seat
    // before a walker claims it.
    defenders.sort((a: any, b: any) => {
        const aOn = a.pos.lookFor(LOOK_STRUCTURES).some((s: any) => s.structureType == STRUCTURE_RAMPART) ? 0 : 1;
        const bOn = b.pos.lookFor(LOOK_STRUCTURES).some((s: any) => s.structureType == STRUCTURE_RAMPART) ? 0 : 1;
        if (aOn !== bOn) return aOn - bOn;
        const ah = a.pos.findClosestByRange(HostileCreeps);
        const bh = b.pos.findClosestByRange(HostileCreeps);
        return (ah ? a.pos.getRangeTo(ah) : 99) - (bh ? b.pos.getRangeTo(bh) : 99);
    });

    for (const d of defenders) {
        const hostile = d.pos.findClosestByRange(HostileCreeps);
        if (!hostile) continue;

        const current: any = d.memory.myRampartToMan && Game.getObjectById(d.memory.myRampartToMan);
        const currentOk = current && mannableIds[current.id] && !taken[current.id];
        const currentRange = currentOk ? current.pos.getRangeTo(hostile) : 99;
        const standing = currentOk && d.pos.isEqualTo(current);

        // Nearest free shell tile within 3 of this hostile.
        let best: any = currentRange <= 3 ? current : null;
        let bestH = currentRange <= 3 ? currentRange : 99;
        let bestD = best ? d.pos.getRangeTo(best) : 99;
        for (const r of mannable) {
            if (taken[r.id]) continue;
            const rh = r.pos.getRangeTo(hostile);
            if (rh > 3) continue;
            const rd = d.pos.getRangeTo(r);
            if (rh < bestH || (rh === bestH && rd < bestD)) {
                best = r;
                bestH = rh;
                bestD = rd;
            }
        }
        if (!best) {
            bestH = 99;
            bestD = 99;
            for (const r of mannable) {
                if (taken[r.id]) continue;
                const rh = r.pos.getRangeTo(hostile);
                const rd = d.pos.getRangeTo(r);
                if (rh < bestH || (rh === bestH && rd < bestD)) {
                    best = r;
                    bestH = rh;
                    bestD = rd;
                }
            }
        }

        // Fire-hold: a defender already on a legal 3-band tile does not hop.
        // Walkers adopt the closer seat (small slides, no %20 gate).
        if (standing && currentRange <= 3 && currentRange <= bestH) {
            d.memory.myRampartToMan = current.id;
            taken[current.id] = true;
            assigned.push(d);
            continue;
        }
        if (best) {
            d.memory.myRampartToMan = best.id;
            taken[best.id] = true;
            assigned.push(d);
        }
    }

    // Towers / leftover readers still want one primary (closest assigned,
    // else closest mannable). Keep the melee-stick so the volley does not
    // retarget mid-swing.
    let primary: any = null;
    let primaryRange = 99;
    for (const d of assigned) {
        const r: any = Game.getObjectById(d.memory.myRampartToMan);
        if (!r) continue;
        const h = r.pos.findClosestByRange(HostileCreeps);
        if (!h) continue;
        const rng = r.pos.getRangeTo(h);
        if (rng < primaryRange) {
            primaryRange = rng;
            primary = r;
        }
    }
    if (!primary) {
        for (const r of mannable) {
            const h = r.pos.findClosestByRange(HostileCreeps);
            if (!h) continue;
            const rng = r.pos.getRangeTo(h);
            if (rng < primaryRange) {
                primaryRange = rng;
                primary = r;
            }
        }
    }
    if (primary) {
        const prev: any = room.memory.rampartToMan && Game.getObjectById(room.memory.rampartToMan);
        if (!(prev && prev.pos.findInRange(HostileCreeps, 1).length > 0)) {
            room.memory.rampartToMan = primary.id;
        }
    }
    return assigned;
}

function updateInPosition(room: any, assigned: any[]) {
    // Only assigned defenders veto the volley. An extra RD with no seat
    // (4th body, all tiles taken) used to keep in_position false forever.
    if (!assigned.length) {
        room.memory.in_position = false;
        return;
    }
    let ready = true;
    for (const d of assigned) {
        const tile: any = Game.getObjectById(d.memory.myRampartToMan);
        const onRampart = d.pos.lookFor(LOOK_STRUCTURES).some((s: any) => s.structureType == STRUCTURE_RAMPART);
        if (!onRampart || (tile && d.pos.getRangeTo(tile) > 2)) {
            ready = false;
            break;
        }
    }
    room.memory.in_position = ready;
}

function roomDefence(room) {
    if(!room.memory.defence) {
        room.memory.defence = {
            towerShotsInRow:0
        }
    }
    // if(room.name == "E42N59") {
    //     room.controller.activateSafeMode();
    // }
    if(Game.time % 250 == 0) {
        let nukes = room.find(FIND_NUKES);
        if(nukes.length > 0) {
            room.memory.defence.nuke = true;
        }
        else {
            room.memory.defence.nuke = false;
            room.memory.defence.evacuate = false;
        }
    }
    if(room.memory.danger_timer == 0) {
        room.memory.defence.towerShotsInRow = 0;
    }

    // No duration-only trigger. The >=11000 arm was dead (rooms.ts wraps the
    // timer at >10000), and making it reachable meant a long-range CAMP that
    // never damaged the shell burned a safemode every timer wrap. Real
    // breaches are covered by the damaged-rampart arm below; a camp that
    // breaks nothing gets no safemode - matching the battle-tested live
    // behavior from before the dead arm was "fixed".
    // Spawn conjunct no-op'd the tick the last spawn died — the one tick
    // safemode is supposed to fire. Failed activate still reset the timer,
    // which reopened remotes and blocked CPU.reduce for the rest of the raid.
    if(room.memory.danger && room.memory.danger_timer >= 50 && Game.time % 5 === 0 && hasDamagedRamparts(room.name)) {
        let enemyCreepsInRoom = room.find(FIND_HOSTILE_CREEPS);
        if(enemyCreepsInRoom.length >= 2) {
            for(let eCreep of enemyCreepsInRoom) {
                if(eCreep.owner.username !== "Invader") {
                    if(room.controller.activateSafeMode() === OK) {
                        room.memory.danger_timer = 1;
                    }
                }
            }
        }
    }

    let spawn = <StructureSpawn> Game.getObjectById(room.memory.Structures.spawn);
    if(Game.cpu.bucket > 300 && spawn && room.memory.danger && room.memory.danger_timer > 500 && spawn.effects && spawn.effects.length && spawn.effects[0].effect === PWR_DISRUPT_SPAWN && room.storage) {
        let towerIDS = room.memory.Structures.towers;
        let towers = [];
        for(let towerID of towerIDS) {
            let tower = <StructureTower> Game.getObjectById(towerID);
            if(tower && tower.store[RESOURCE_ENERGY] >= 10) {
                towers.push(tower);
            }
        }
        // Perimeter ramparts (min-cut / plan) — not fixed range band from storage
        const damagedStructures = findDamagedPerimeterRamparts(room, 2500000);
        let rampartToRepair = damagedStructures[0];
        if (!rampartToRepair) {
            // no perimeter yet: skip specialized repair
        } else {
            for(let tower of towers) {
                // findDamagedPerimeterRamparts already filtered hits < 2500000,
                // so `||` made every tower repair regardless of range or energy.
                // No range clause: legacy perimeters sit 8-13 from storage, so
                // range<=8 excluded the outer shell exactly during a disrupt.
                // The 800 floor alone protects the defensive salvo reserve.
                if(rampartToRepair.hits < 2500000 && tower.store[RESOURCE_ENERGY] >= 800) {
                    tower.repair(rampartToRepair);
                }
            }
        }
    }

    function hasDamagedRamparts(roomName) {
        const room = Game.rooms[roomName];
        if (!room) {
          return false;
        }
        // Peacetime tower cap is 5k / 150k. A flat 750k floor made every
        // RCL4-5 shell look "breached" and burned safemode on a camp that
        // never damaged anything.
        const rcl = room.controller && room.controller.level || 0;
        const minimumHits = rcl < 4 ? 5000 : rcl <= 5 ? 150000 : 750000;
        return findDamagedPerimeterRamparts(room, minimumHits).length > 0;
      }


    let maxRepairTower;
    if(room.controller.level < 4) {
        maxRepairTower = 5000;
    }
    else {
        maxRepairTower = 150000
    }

    // --- Peacetime shell upkeep ---------------------------------------------
    //
    // Nothing kept the perimeter alive at low RCL. The only tower path that
    // repairs ramparts (above) is behind `danger && danger_timer > 500 &&
    // spawn.effects[0] === PWR_DISRUPT_SPAWN && room.storage`, i.e. an enemy
    // power creep disrupting the spawn — it never fires in a young room. So the
    // shell was built and then decayed at RAMPART_DECAY (300 hits / 100 ticks)
    // with only maintainer.ts occasionally dumping a creep's whole carry into
    // whichever single rampart happened to be lowest.
    //
    // Fix: from SHELL_MIN_RCL, one tower per tick tops up the weakest PLANNED
    // shell tile. A tower repair is 800 hits for 10 energy at range <= 5, so a
    // single tower covers ~2600 hits/tick of decay headroom — far more than a
    // shell of any size sheds. Strictly on-plan (see planShellRamparts): ramparts
    // left over from an old layout are abandoned and allowed to decay.
    if (!room.memory.danger &&
        room.controller.level >= SHELL_MIN_RCL &&
        Game.time % 3 == 0 &&
        room.memory.Structures.towers && room.memory.Structures.towers.length) {

        const shell = planShellRamparts(room);
        if (shell.length) {
            let weakest = shell[0];
            for (const r of shell) {
                if (r.hits < weakest.hits) weakest = r;
            }
            // don't chase a wall that is already at the level cap for this RCL
            const target = Math.min(weakest.hitsMax, maxRepairTower);
            if (weakest.hits < target) {
                for (const towerID of room.memory.Structures.towers) {
                    const tower: any = Game.getObjectById(towerID);
                    // leave a full salvo (10 shots) in the tower for defence
                    if (tower && tower.store[RESOURCE_ENERGY] >= 200) {
                        tower.repair(weakest);
                        break;
                    }
                }
            }
        }
    }

    if(Game.time % 100 == 0) {
        room.memory.Structures.towers = [];

        let towers = room.find(FIND_MY_STRUCTURES, { filter: {structureType: STRUCTURE_TOWER}});
        if(towers.length) {
            _.forEach(towers, function(tower) {
                room.memory.Structures.towers.push(tower.id);
            });
        }
    }


    if(room.memory.Structures.towers && room.memory.Structures.towers.length > 0) {
        let towerCount = -1;
        // let currentTickModTowers = Game.time % room.memory.Structures.towers.length;

        _.forEach(room.memory.Structures.towers, function(towerID) {
            let tower:any = Game.getObjectById(towerID);
            if(tower) {
                towerCount = towerCount + 1;

                let isDanger = room.memory.danger;

                if(isDanger) {
                    let rampartDefenders = room.find(FIND_MY_CREEPS, {filter: creep => creep.memory.role == "RampartDefender" || creep.memory.role == "RRD"});
                    let rampartDefendersLength = rampartDefenders.length;
                    if(rampartDefendersLength <= 2) {
                        let rampartToMan = room.memory.rampartToMan;
                        let rampart:any = Game.getObjectById(rampartToMan);
                        if(rampart) {
                            if(rampart && rampartDefenders[0] && ((rampartDefenders[0].pos.getRangeTo(rampart) == 2 || rampartDefenders[0].pos.getRangeTo(rampart) == 1) && (rampartDefenders[0].pos.lookFor(LOOK_STRUCTURES).length == 0) || rampartDefenders[0].pos.lookFor(LOOK_STRUCTURES).length == 1 && rampartDefenders[0].pos.lookFor(LOOK_STRUCTURES)[0].structureType== STRUCTURE_ROAD)) {
                                if(rampartDefenders[0].pos.getRangeTo(rampart) < 6) {
                                    tower.heal(rampartDefenders[0]);
                                    return;
                                }
                            }
                        }
                    }

                    let damagedCreeps = _.filter(Game.creeps, (damagedCreep) => damagedCreep.hits+300 < damagedCreep.hitsMax && damagedCreep.room.name == room.name && damagedCreep.memory.role !== "attacker");
                    if(damagedCreeps.length > 0) {
                        tower.heal(damagedCreeps[0]);
                        return;
                    }
                }

                // Per-tower reserve. Requiring EVERY live tower >400 left a
                // solo tower at 400 dark and a newborn/empty id silenced the
                // whole battery.
                if(isDanger && tower && tower.store[RESOURCE_ENERGY] > 200 && Game.cpu.bucket > 250) {


                    let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
                    // Count RRD too: fire-hold treated a ranged-only shell as
                    // empty and volleyed before they were on the assigned tile.
                    let rampartDefenders = room.find(FIND_MY_CREEPS, {filter: creep => creep.memory.role == "RampartDefender" || creep.memory.role == "RRD"});
                    let rampartDefendersLength = rampartDefenders.length;
                    let rampartID = room.memory.rampartToMan
                    let rampart:any = Game.getObjectById(rampartID);
                    let closestHostile = tower.pos.findClosestByRange(HostileCreeps);
                    if(closestHostile && HostileCreeps.length > 1 && rampartDefendersLength >= 1 && room.memory.in_position || closestHostile && HostileCreeps.length == 1 || rampartDefendersLength == 0 && closestHostile) {
                        room.memory.defence.towerShotsInRow += 1;
                        let attackTarget = room.memory.attack_target;
                        let target = Game.getObjectById(attackTarget);
                        // attack_target is never written; getRangeTo(null) first
                        // made this arm dead. Guard target like the sibling below.
                        if(target && rampart && rampart.pos.getRangeTo(target) < 2 && (Game.time % 17 == 0 || Game.time % 17 == 1 || Game.time % 17 == 2 || Game.time % 17 == 3 || Game.time % 17 == 4
                            || Game.time % 17 == 5 || Game.time % 17 == 6 || Game.time % 17 == 7 || Game.time % 17 == 8)) {
                            tower.attack(target);
                            return;
                        }
                        else if(Game.time % 150 >= 0 && Game.time % 150 < 30) {
                            if(room.memory.defence.towerShotsInRow % 800 >= 0 && room.memory.defence.towerShotsInRow % 800 < 60) {
                                if(closestHostile.ticksToLive > 50) {
                                    // Return WITH the shot (one intent per tower, the
                                    // %12 heal would overwrite it) - but ONLY with the
                                    // shot: outside the fire window the tower is free
                                    // to heal, so no bare return.
                                    tower.attack(closestHostile);
                                    return;
                                }
                            }
                        }
                        else if(HostileCreeps.length > 1 && target && rampart && rampart.pos.getRangeTo(target) < 2 ){
                            if(room.memory.defence.towerShotsInRow % 800 >= 0 && room.memory.defence.towerShotsInRow % 800 < 60) {
                                if(closestHostile.ticksToLive > 50) {
                                    tower.attack(closestHostile);
                                    return;
                                }
                            }
                        }
                        else if(HostileCreeps.length == 1){
                            if(room.memory.defence.towerShotsInRow % 800 >= 0 && room.memory.defence.towerShotsInRow % 800 < 60) {
                                if(closestHostile.ticksToLive > 50) {
                                    tower.attack(closestHostile);
                                    return;
                                }
                            }
                        }
                        else {
                            if(room.memory.defence.towerShotsInRow % 800 >= 0 && room.memory.defence.towerShotsInRow % 800 < 60) {
                                if(closestHostile.ticksToLive > 50) {
                                    tower.attack(closestHostile);
                                    return;
                                }
                            }
                        }
                    }
                }

                if(Game.time % 12 == 0) {
                    let damagedCreeps = _.filter(Game.creeps, (damagedCreep) => damagedCreep.hits < damagedCreep.hitsMax && damagedCreep.room.name == room.name && !damagedCreep.memory.suicide && damagedCreep.memory.role !== "attacker");
                    if(damagedCreeps.length > 0) {
                        tower.heal(damagedCreeps[0]);
                        return;
                    }
                    if(room.controller.level == 8) {
                        let damagedPowerCreeps = _.filter(Game.powerCreeps, (damagedPowerCreep) => damagedPowerCreep.hits < damagedPowerCreep.hitsMax && damagedPowerCreep.room.name == room.name);
                        if(damagedPowerCreeps.length > 0) {
                            tower.heal(damagedPowerCreeps[0]);
                            return;
                        }
                    }
                }
            }


       });
    }


    // Hostile scan every tick. The %5 gate left a 4-tick first-contact
    // window; towers already fire on last-tick danger, so a late latch
    // costs another salvo.
    {
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        let storage:any = Game.getObjectById(room.memory.Structures.storage);
        if(HostileCreeps.length > 0) {
            room.memory.danger = true;

            let hostilePowerCreeps = room.find(FIND_HOSTILE_POWER_CREEPS);
            if (hostilePowerCreeps.length) {
                for (let hostilePowerCreep of hostilePowerCreeps) {
                    if (hostilePowerCreep.pos.lookFor(LOOK_STRUCTURES).length === 0) {
                        if (room.memory.Structures.towers && room.memory.Structures.towers.length > 0) {
                            room.roomTowersAttackEnemy(hostilePowerCreep);
                        }
                        // Do not return: a PC on bare ground used to abort the
                        // rest of roomDefence, so rampartToMan was never set.
                        break;
                    }
                }
            }


            // Man-able shell = planned perimeter (min-cut), not "range <= 10 from storage"
            let MyRamparts: any[] = findPerimeterRamparts(room);
            if (!MyRamparts.length) {
                MyRamparts = room.find(FIND_MY_STRUCTURES, {
                    filter: (structure) => structure.structureType == STRUCTURE_RAMPART,
                });
            }
            let myCreeps = room.find(FIND_MY_CREEPS);

            if(room.controller.level <= 5) {
                // Any RA hostile used to own the whole civilian loop, so the
                // melee arm never ran and the ranged else-clause CLEARED
                // fleeing next to a melee. Each civilian uses its nearest
                // armed hostile of either type.
                const armedHostiles = HostileCreeps.filter(function(c) {
                    return c.getActiveBodyparts(RANGED_ATTACK) > 0 || c.getActiveBodyparts(ATTACK) > 0;
                });
                if(armedHostiles.length > 0 && !room.controller.safeMode) {
                    for(let creep of myCreeps) {
                        if(creep.memory.role === "RampartDefender" || creep.memory.role === "RRD" || creep.memory.role === "ram") {
                            continue;
                        }
                        let closestHostileToCreep = creep.pos.findClosestByRange(armedHostiles);
                        if(!closestHostileToCreep) {
                            creep.memory.fleeing = false;
                            continue;
                        }
                        let creepOnRampart = false;
                        let structsOnCreep = creep.pos.lookFor(LOOK_STRUCTURES);
                        for(let structOnCreep of structsOnCreep) {
                            if(structOnCreep.structureType == STRUCTURE_RAMPART) {
                                creepOnRampart = true;
                                break;
                            }
                        }
                        const range = creep.pos.getRangeTo(closestHostileToCreep);
                        const isRanged = closestHostileToCreep.getActiveBodyparts(RANGED_ATTACK) > 0;
                        if(isRanged && room.controller.level <= 3 && range <= 5 && !creepOnRampart) {
                            creep.drop(RESOURCE_ENERGY);
                            creep.fleeFromRanged(closestHostileToCreep);
                            creep.memory.fleeing = true;
                        }
                        else if(isRanged && range <= 3 && !creepOnRampart) {
                            creep.fleeFromRanged(closestHostileToCreep);
                            creep.memory.fleeing = true;
                        }
                        else if(!isRanged && range <= 3 && !creepOnRampart && !PathFinder.search(creep.pos, {pos:closestHostileToCreep.pos, range:1},
                            {
                                maxOps: 150,
                                maxRooms: 1,
                                roomCallback: (roomName) => pathAroundMyRampartsAndStructuresAndTerrain(roomName)
                            }).incomplete) {
                            creep.drop(RESOURCE_ENERGY);
                            creep.fleeFromMelee(closestHostileToCreep);
                            creep.memory.fleeing = true;
                        }
                        else {
                            creep.memory.fleeing = false;
                        }
                    }
                }
                else {
                    clearCivilianFleeing(room);
                }
            }




            if(HostileCreeps.length > 1 && room.memory.danger && myCreeps.length > 1) {
                if(!Memory.DistressSignals) {
                    Memory.DistressSignals = {};
                }
                if(!Memory.DistressSignals.reinforce_me) {
                    Memory.DistressSignals.reinforce_me = room.name;
                }
            }



            const assignedDefenders = assignDefenderTiles(room, MyRamparts, HostileCreeps, myCreeps);
            updateInPosition(room, assignedDefenders);
        }
        else {
            room.memory.danger = false;
            room.memory.rampartToMan = false;
            // Melee flee never cleared, and a leftover flag freezes any
            // role that early-returns on memory.fleeing after the raid.
            clearCivilianFleeing(room);

            /*
             * RELEASE THE DISTRESS LATCH.
             *
             * `reinforce_me` is raised above (HostileCreeps.length > 1 && danger)
             * and this — the only clear — was commented out, so it was a
             * write-once flag: whichever room called for help first kept calling
             * forever. Live W1N1 held `Memory.DistressSignals.reinforce_me =
             * "W1N1"` with `danger:false`, `danger_timer:0`, no hostiles in the
             * room and ramparts at 4.2-7.5M hits.
             *
             * This branch is the no-hostiles branch, and we have just written
             * danger = false, so the signal has nothing left to describe. Drop it
             * and let the next real raid raise it again.
             */
            if(Memory.DistressSignals && Memory.DistressSignals.reinforce_me == room.name) {
                delete Memory.DistressSignals.reinforce_me;
            }
        }
        if(HostileCreeps.length > 0) {
            room.memory.blown_fuse = true;
        }
        else {
            room.memory.blown_fuse = false;
        }

    }
    if(room.controller.safeMode) {
        room.memory.danger = false;
        room.memory.blown_fuse = false;
        room.memory.danger_timer = 0;
        room.memory.rampartToMan = false;
        // Safemode lasts ~20k ticks; a leftover fleeing flag would park
        // civilians for the whole duration.
        clearCivilianFleeing(room);

    }
}
export default roomDefence;
// module.exports = roomDefence



const pathAroundMyRampartsAndStructuresAndTerrain = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 1;
            }
            else if(tile == 0){
                weight = 1;
            }
            costs.set(x, y, weight);
        }
    }

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {

        if(struct.structureType == STRUCTURE_CONTAINER || struct.structureType == STRUCTURE_ROAD) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });
    return costs;

}

