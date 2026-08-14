import { interiorMove } from "utils/Interior";
import { consumeBoostOwner, labKeyForId, refundBoostOwner } from "Rooms/rooms.labs";

/**
 * Boost() is the sole owner of boostWait (Game.time stamp, 80-tick drop).
 * This helper only filters dead/wrong-mineral labs — refunding each drop —
 * then defers to Boost(). Empty labs stay so EM can fill them.
 * Returns false when the caller must keep waiting at the lab.
 */
export function finishBoostOrGiveUp(creep: any): boolean {
    if (!creep.memory.boostlabs || creep.memory.boostlabs.length == 0) return true;

    const kept: string[] = [];
    for (const id of creep.memory.boostlabs) {
        const lab: any = Game.getObjectById(id);
        let keep = false;
        if (lab) {
            if (!lab.mineralType || lab.mineralAmount < 30) {
                keep = true;
            } else {
                for (const part of creep.body) {
                    if (!part.boost && BOOSTS[part.type] && BOOSTS[part.type][lab.mineralType]) {
                        keep = true;
                        break;
                    }
                }
            }
        }
        if (keep) {
            kept.push(id);
        } else {
            const key = labKeyForId(creep.room, id);
            if (key) consumeBoostOwner(creep.room, key, creep.name);
        }
    }
    creep.memory.boostlabs = kept;
    if (creep.memory.boostlabs.length == 0) {
        refundBoostOwner(creep.room, creep.name);
        return true;
    }
    return !!creep.Boost();
}

const run = function (creep:any) {

    creep.memory.moving = false;

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0 && creep.room.memory.danger) {
        if(!finishBoostOrGiveUp(creep)) {
            return;
        }
    }

    if(creep.memory.again && !creep.memory.ttgh) {
        creep.memory.ttgh = 1500 - creep.ticksToLive;
    }
    if(creep.memory.again && creep.memory.ttgh && creep.ticksToLive === creep.memory.ttgh + 145) {
        global.SMDP(creep.memory.homeRoom, creep.memory.targetRoom);
    }

    // Stay near planned shell (hub), not magic range-from-storage square
    const hubPos =
        creep.room.memory.basePlan && creep.room.memory.basePlan.hub
            ? new RoomPosition(
                  creep.room.memory.basePlan.hub.x,
                  creep.room.memory.basePlan.hub.y,
                  creep.room.name,
              )
            : creep.room.storage
              ? creep.room.storage.pos
              : null;
    if (hubPos) {
        // Leash width follows the planned shell: a flat 14 is too tight for a
        // big min-cut ring (the defender would be dragged home off the very
        // rampart it is meant to man). PlanV2 writes basePlan.leash =
        // max(14, farthest shell tile from the hub + 2).
        const leash =
            (creep.room.memory.basePlan && creep.room.memory.basePlan.leash) || 14;
        const d = creep.pos.getRangeTo(hubPos);
        // interiorMove owns the move when the room has a usable shell: under
        // danger it refuses to path through the exterior, and a defender that
        // is ALREADY outside is walked to the nearest gate first rather than
        // dragged home along the outside of its own wall.
        if (creep.room.memory.danger && d > leash) {
            if (!interiorMove(creep, hubPos, 10)) {
                creep.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(hubPos, 10);
            }
        } else if (creep.room.memory.danger && d > leash - 2) {
            if (!interiorMove(creep, hubPos, 10)) creep.MoveCostMatrixRoadPrio(hubPos, 10);
        } else if (!creep.room.memory.danger && d > leash - 4) {
            if (!interiorMove(creep, hubPos, 8)) creep.MoveCostMatrixRoadPrio(hubPos, 8);
        }
    }


    if(creep.evacuate()) {
		return;
	}

    if(creep.room.memory.danger) {

        let enemyCreeps:Array<Creep> = creep.room.find(FIND_HOSTILE_CREEPS);
        // filter enemy creeps by creeps with ranged attack, work, or attack parts
        enemyCreeps = _.filter(enemyCreeps, (c) => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0 || c.getActiveBodyparts(WORK) > 0);
        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);



            // Defence writes a unique myRampartToMan per defender. Copying
            // the shared room tile here re-collapsed everyone onto one seat.
            // Fall back only when our id is missing or dead.
            if(!creep.memory.myRampartToMan || !Game.getObjectById(creep.memory.myRampartToMan)) {
                if(creep.room.memory.rampartToMan) {
                    creep.memory.myRampartToMan = creep.room.memory.rampartToMan;
                }
            }


            if(creep.pos.isNearTo(closestEnemyCreep)) {

                let LookStructures = creep.pos.lookFor(LOOK_STRUCTURES);
                if(LookStructures.length > 0) {
                    for(let building of LookStructures) {
                        if(building.structureType == STRUCTURE_RAMPART) {

                            let attackResult = creep.attack(closestEnemyCreep);
                            if(attackResult == 0) {
                                creep.room.roomTowersAttackEnemy(closestEnemyCreep);
                            }

                            if(Game.time % 10 == 0) {
                                creep.say("☮️", true);
                            }
                            else if(Game.time % 10 == 1) {
                                creep.say("God", true);
                            }
                            else if(Game.time % 10 == 2) {
                                creep.say("Save", true);
                            }
                            else if(Game.time % 10 == 3) {
                                creep.say("Us", true);
                            }
                            else if(Game.time % 10 == 4) {
                                creep.say("☮️", true);
                            }

                            if(attackResult == 0) {
                                return;
                            }
                        }
                    }
                }
            }

            let rampart:any = Game.getObjectById(creep.memory.myRampartToMan);

            if(rampart) {

                if(!creep.pos.isEqualTo(rampart)) {
                    if (!interiorMove(creep, rampart, 0)) {
                        creep.moveToSafePositionToRepairRampart(rampart, 0);
                    }
                }

            }
        }
    }
    else {
        // Stale seat survived peacetime and made the next raid start on
        // last fight's tile (often the wrong side of the shell).
        if(creep.memory.myRampartToMan) {
            delete creep.memory.myRampartToMan;
        }
        if(creep.ticksToLive < 50) {
            creep.recycle();
        }
    }
}

const roleRampartDefender = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRampartDefender;
