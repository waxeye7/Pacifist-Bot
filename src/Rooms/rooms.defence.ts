import {
    findDamagedPerimeterRamparts,
    findPerimeterRamparts,
    perimeterKeySet,
    SHELL_MIN_RCL,
} from "utils/Perimeter";
import { logVerbose } from "utils/Logger";

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

/* -------------------------------------------------------------------------
 * HOW HARD IS THIS ROOM ALLOWED TO CHASE ITS RAMPARTS?
 *
 * There was no such number. The RCL6 repair rung in rooms.spawning asked for
 * `hits < 3,050,000` and the RCL7 one for `< 4,050,000`, both against a rampart
 * hitsMax that is 20,000,000 from RCL5 up — so on live E37N59 (RCL6, storage
 * 43k, 1.7 e/t into the controller) the 77 planned ramparts represented roughly
 * 235,000,000 hits of latent demand, i.e. 235,000,000 energy. The moment the
 * bank crossed the rung's 150,000 floor it would have consumed every joule the
 * room earns, forever, and the controller would never move again.
 *
 * A shell is insurance, and the premium has to be proportional to what it is
 * insuring. Below RCL7 the room has no terminal economy and no boosted
 * defenders; the thing it actually needs is enough hits that a tower-supported
 * defence survives long enough to safe-mode, which is ~100k, not 3M. RCL7 is
 * where the room starts being a target worth a real siege. RCL8 keeps the
 * numbers the existing rungs were written around.
 *
 * Everything that decides "is this rampart low enough to spend on" routes
 * through here: the repair-creep rungs in rooms.spawning, and the peacetime
 * tower shell top-up below.
 * ------------------------------------------------------------------------- */
export function rampartHitsTargetForRcl(rcl: number): number {
    if (rcl < 4) return 5000;
    if (rcl <= 6) return 100000;
    if (rcl === 7) return 300000;
    return 15255000;
}

export function rampartHitsTarget(room: any): number {
    const rcl = (room && room.controller && room.controller.level) || 0;
    return rampartHitsTargetForRcl(rcl);
}

/**
 * Safe-mode breach bar: 75% of what the shell was BUILT to, not the new
 * RCL's repair target. After RCL6→7 a complete 100k shell is an undamaged
 * camp against a 225k (new) bar; RCL7→8 is 300k vs 750k.
 */
export function safeModeBreachHits(rcl: number, builtHits: number): number {
    const current = rampartHitsTargetForRcl(rcl);
    const previous = rampartHitsTargetForRcl(Math.max(0, rcl - 1));
    const builtTo = builtHits > 0 ? Math.min(current, builtHits) : previous;
    const absolute = rcl < 4 ? 5000 : rcl <= 5 ? 150000 : 750000;
    return Math.min(absolute, Math.floor(builtTo * 0.75));
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

// --- Tower fire policy ---------------------------------------------------
//
// THE DRAIN. A squad parks far from the towers - out where TOWER_FALLOFF has
// cut a shot to 150-300 - with enough HEAL to undo every hit. Each shot costs
// us 10 energy and buys nothing; when the battery runs dry the real attack
// walks in. The old code answered this with an "unpredictable" firing rota:
// `towerShotsInRow % 800 < 60` behind a `Game.time % 150 < 30` window, plus two
// arms keyed on room.memory.attack_target. Nothing in src/ ever writes
// attack_target, so those arms were dead; the surviving arms had byte-identical
// bodies, so the %150 window was a no-op; what actually shipped was "fire for
// 60 ticks, sit dark for 740" regardless of what the hostiles were doing.
//
// Randomness was never the answer - arithmetic is. Take the shot only when it
// is worth its energy:
//   (a) our damage on the best target beats the heal that can reach it,
//   (b) an armed hostile is inside 10 of a tower (near-max damage zone),
//   (c) something of ours is losing hits (never be dismantled in silence),
//   (d) the target is an NPC Invader (no drain plan, always shoot), or
//   (e) we are in safe mode (the shots are free).
// Otherwise HOLD: stay full, heal our own creeps, hold the shell.

const HEAL_BOOSTS: { [boost: string]: number } = { LO: 2, LHO2: 3, XLHO2: 4 };
const TOUGH_BOOSTS: { [boost: string]: number } = { GO: 0.7, GHO2: 0.5, XGHO2: 0.3 };

/** hits of everything worth watching, per room, as of last tick (heap only) */
const lastWatchedHits: { [roomName: string]: { tick: number; hits: { [id: string]: number } } } = {};

/** Sum of what every listed tower would do to one tile this tick. */
function towerDamageAt(towers: any[], pos: RoomPosition): number {
    let damage = 0;
    for (const tower of towers) {
        const range = tower.pos.getRangeTo(pos);
        const ramp = (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
        damage += TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF * Math.min(Math.max(ramp, 0), 1));
    }
    return damage;
}

/**
 * What a hostile body can do. Destroyed parts (hits 0) are skipped, same as the
 * engine's getActiveBodyparts.
 *
 * toughMul is a blanket multiplier taken from the strongest boosted TOUGH part.
 * That is pessimistic - the reduction really stops once the tough parts are
 * chewed off - but "hold fire?" is a question you want to be wrong about in the
 * cautious direction, and it keeps us off boosted tanks we cannot actually kill.
 */
function hostileProfile(hostile: any) {
    let heal = 0;
    let armed = false;
    let worker = false;
    let toughMul = 1;
    for (const part of hostile.body) {
        if (part.hits <= 0) continue;
        if (part.type == HEAL) {
            heal += HEAL_POWER * (part.boost && HEAL_BOOSTS[part.boost] || 1);
        }
        else if (part.type == ATTACK || part.type == RANGED_ATTACK) {
            armed = true;
        }
        else if (part.type == WORK) {
            worker = true;
        }
        else if (part.type == TOUGH && part.boost) {
            toughMul = Math.min(toughMul, TOUGH_BOOSTS[part.boost] || 1);
        }
    }
    return { heal: heal, armed: armed, worker: worker, toughMul: toughMul };
}

/**
 * Is anything of ours actually being hurt?
 *
 * Only objects within 4 of an ATTACK/RANGED/WORK hostile are watched, so
 * rampart decay in a quiet corner cannot fake an attack and a heal-only drainer
 * parked next to a road cannot bait us into firing. Roads are skipped outright:
 * they are scattered everywhere (including outside the shell) and losing one is
 * not worth a drained battery.
 */
function ownedStuffIsBeingHurt(room: any, threats: any[]): boolean {
    const prev = lastWatchedHits[room.name];
    const fresh = prev && prev.tick === Game.time - 1;
    const hits: { [id: string]: number } = {};
    let hurt = false;
    for (const threat of threats) {
        const pos = threat.creep.pos;
        const nearby: any[] = pos.findInRange(FIND_STRUCTURES, 4, {
            filter: (s: any) => s.my !== false && s.structureType != STRUCTURE_ROAD
        }).concat(pos.findInRange(FIND_MY_CREEPS, 4));
        for (const thing of nearby) {
            if (thing.hits === undefined) continue; // controller, portals, ...
            hits[thing.id] = thing.hits;
            // Adjacent + armed is a hit landing next tick even if none has yet.
            if (pos.getRangeTo(thing) <= 1) hurt = true;
            if (fresh && prev.hits[thing.id] !== undefined && thing.hits < prev.hits[thing.id]) hurt = true;
        }
    }
    lastWatchedHits[room.name] = { tick: Game.time, hits: hits };
    return hurt;
}

/**
 * The whole decision, once per room per tick. See the policy note above.
 * Returns { fire, target, why } (+ count/urgent for the callers' gating).
 */
function towerFirePlan(room: any, towers: any[], hostiles: any[]): any {
    const plan: any = { fire: false, target: null, why: "nothing to shoot", count: hostiles.length, urgent: false };
    if (!towers.length || !hostiles.length) return plan;

    const marks: any[] = [];
    let groupHeal = 0;
    for (const hostile of hostiles) {
        const profile = hostileProfile(hostile);
        let nearestTower = 99;
        for (const tower of towers) {
            const range = tower.pos.getRangeTo(hostile);
            if (range < nearestTower) nearestTower = range;
        }
        groupHeal += profile.heal;
        marks.push({
            creep: hostile,
            heal: profile.heal,
            armed: profile.armed,
            worker: profile.worker,
            damage: towerDamageAt(towers, hostile.pos) * profile.toughMul,
            nearestTower: nearestTower,
            healOnIt: 0,
            score: 0
        });
    }

    // Heal that can actually reach a target: heal is range 1, rangedHeal is 3,
    // and a healer at 4 is one step from either. A medic parked on the far side
    // of the room saves nobody, so it does not count against this target.
    for (const mark of marks) {
        for (const other of marks) {
            if (other.heal > 0 && mark.creep.pos.getRangeTo(other.creep) <= 4) mark.healOnIt += other.heal;
        }
    }

    // Best target = the most damage that actually sticks, ties to the weakest
    // creep. Healers are ordinary candidates, so "shoot the medic that is
    // keeping the squad alive" falls out of the scoring whenever the medic is
    // the softer kill - no special case needed.
    let best: any = null;
    let bestInvader: any = null;
    for (const mark of marks) {
        mark.score = mark.damage - mark.healOnIt;
        if (!best || mark.score > best.score + 1 ||
            (mark.score > best.score - 1 && mark.creep.hits < best.creep.hits)) {
            best = mark;
        }
        const npc = mark.creep.owner && mark.creep.owner.username === "Invader";
        if (npc && (!bestInvader || mark.score > bestInvader.score)) bestInvader = mark;
    }

    const threats = marks.filter((m: any) => m.armed || m.worker);
    let closeThreat = false;
    for (const threat of threats) {
        if (threat.nearestTower <= 10) closeThreat = true;
    }
    plan.urgent = ownedStuffIsBeingHurt(room, threats);
    plan.target = best.creep;

    const sums = `dmg ${Math.round(best.damage)} vs heal ${Math.round(best.healOnIt)}/${Math.round(groupHeal)}`;
    if (room.controller && room.controller.safeMode) {
        plan.fire = true;
        plan.why = `safe mode, shots are free (${sums})`;
    }
    else if (plan.urgent) {
        plan.fire = true;
        plan.why = `our stuff is taking hits (${sums})`;
    }
    else if (best.damage > best.healOnIt) {
        plan.fire = true;
        plan.why = `killable: ${sums}`;
    }
    else if (closeThreat) {
        plan.fire = true;
        plan.why = `armed hostile inside 10 of a tower (${sums})`;
    }
    else if (bestInvader) {
        plan.fire = true;
        plan.target = bestInvader.creep;
        plan.why = `NPC invader (${sums})`;
    }
    else {
        plan.why = `hold, they out-heal us: ${sums}`;
    }
    return plan;
}

/** One plan per room per tick - every tower in the battery reads the same answer. */
function towerPlanFor(room: any): any {
    if (room._towerPlan && room._towerPlan.tick === Game.time) return room._towerPlan;
    const towers: any[] = [];
    for (const towerID of room.memory.Structures.towers || []) {
        const tower: any = Game.getObjectById(towerID);
        if (tower && tower.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST) towers.push(tower);
    }
    // No ally list exists anywhere in src/ - every hostile creep is a hostile.
    const plan = towerFirePlan(room, towers, room.find(FIND_HOSTILE_CREEPS));
    plan.tick = Game.time;
    room._towerPlan = plan;
    if (Game.time % 50 == 0) {
        logVerbose(`towers ${room.name}: ${plan.fire ? "FIRE" : "HOLD"} - ${plan.why}`);
    }
    return plan;
}

function roomDefence(room) {
    if(!room.memory.defence) {
        room.memory.defence = {};
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
    // towerShotsInRow drove the old fire rota and nothing else in src/ reads it.
    // Swept out of Memory once per peacetime room instead of left to rot.
    if(room.memory.danger_timer == 0 && room.memory.defence.towerShotsInRow !== undefined) {
        delete room.memory.defence.towerShotsInRow;
    }

    // Hostile scan first. Towers and the %3 shell-repair used to read
    // last-tick danger / in_position / rampartToMan, so a 2+ wave got
    // three free ticks (no danger, then fire-hold, then another fire-hold)
    // before the first volley. Power-creep last-intent stays after the
    // tower loop so it still overwrites a volley/repair the same way.
    {
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        if(HostileCreeps.length > 0) {
            room.memory.danger = true;

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
        // civilians for the whole duration. Cleared here so the tower loop
        // and %3 shell-repair still see peacetime, same as when this ran
        // after the (old) post-loop scan.
        clearCivilianFleeing(room);

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
        //
        // "Breached" has to be measured against what the shell is BUILT to, not
        // the new RCL's repair target. Peak hits persist so a hole-punch still
        // compares to the pre-raid height; first look uses the strongest tile.
        const rcl = room.controller && room.controller.level || 0;
        const ramps = findPerimeterRamparts(room);
        let strongest = 0;
        for (const r of ramps) {
            if (r.hits > strongest) strongest = r.hits;
        }
        const mem: any = room.memory;
        if (mem) {
            if (strongest > (mem.shellPeakHits || 0)) mem.shellPeakHits = strongest;
        }
        const built = (mem && mem.shellPeakHits) || strongest;
        const minimumHits = safeModeBreachHits(rcl, built);
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
            // don't chase a wall that is already at the level cap for this RCL,
            // and never past the per-RCL shell target — a tower shot is 10
            // energy for 800 hits, so an unbounded goal is an unbounded drain
            // out of the same store the fillers pull from. RCL6 drops 150k->100k
            // (rampartHitsTarget); RCL7/8 are unchanged, maxRepairTower binds.
            const target = Math.min(weakest.hitsMax, maxRepairTower, rampartHitsTarget(room));
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

                // Safe mode forces memory.danger false further up, but safe-mode
                // shots are free, so the battery still gets a plan.
                const plan: any = (isDanger || room.controller.safeMode) ? towerPlanFor(room) : null;
                const firing = !!(plan && plan.fire && plan.target);

                // Heal used to pre-empt the shot for EVERY tower: one creep down
                // 300 hits and the whole battery healed instead of shooting, which
                // is most of any real siege. When the plan says fire, tower 0 keeps
                // the medic job and the rest shoot; a solo tower shoots.
                const healSlot = !firing || (towerCount === 0 && room.memory.Structures.towers.length > 1);

                if(isDanger && healSlot) {
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
                if(firing && tower.store[RESOURCE_ENERGY] > 200) {
                    // Volley sync: with a shell manned and more than one hostile,
                    // hold until the defenders are seated so towers and RDs land
                    // together. Count RRD too - a ranged-only shell used to read as
                    // empty and the volley went off before anyone was on their tile.
                    // Bypassed when something of ours is already losing hits: no
                    // room gets dismantled while the battery waits for a formation.
                    let rampartDefenders = room.find(FIND_MY_CREEPS, {filter: creep => creep.memory.role == "RampartDefender" || creep.memory.role == "RRD"});
                    if(plan.urgent || rampartDefenders.length == 0 || plan.count == 1 || room.memory.in_position) {
                        // Return WITH the shot: one intent per tower, and the %12
                        // heal below would otherwise overwrite it.
                        tower.attack(plan.target);
                        return;
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


    // Power-creep last-intent: stays after the tower loop so a PC on
    // bare ground still overwrites a volley/repair, same as when this
    // lived at the bottom of the (old) post-loop scan.
    {
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        if(HostileCreeps.length > 0) {
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
        }
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

