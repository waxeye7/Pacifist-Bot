import { interiorMove } from "utils/Interior";
import { finishBoostOrGiveUp } from "Roles/RampartDefender";

const run = function (creep:Creep) {

    creep.memory.moving = false;

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0 && creep.room.memory.danger) {
        if(!finishBoostOrGiveUp(creep)) {
            return;
        }
    }


    if(creep.evacuate()) {
		return;
	}

    if(creep.room.memory.danger) {

        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            // Defence assigns a unique tile. The storage===11 OR-clause
            // adopted every tick at the common shell band and defeated
            // hysteresis; copying the shared room tile stacked every RRD
            // on one seat. Fall back only when our id is missing or dead.
            if(!creep.memory.myRampartToMan || !Game.getObjectById(creep.memory.myRampartToMan)) {
                if(creep.room.memory.rampartToMan) {
                    creep.memory.myRampartToMan = creep.room.memory.rampartToMan;
                }
            }


            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.rangedMassAttack();
                creep.room.roomTowersAttackEnemy(closestEnemyCreep);

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
            }

            else if(creep.pos.getRangeTo(closestEnemyCreep) <= 3) {
                let enemyCreepsInRange = enemyCreeps.filter(function(eC) {return creep.pos.getRangeTo(eC) <= 3;});

                if(enemyCreepsInRange.length > 1) {
                    enemyCreepsInRange.sort((a,b) => a.hits - b.hits);
                    if(enemyCreepsInRange[0].hits < enemyCreepsInRange[0].hitsMax) {
                        // The sort picks the weakest in range, but the shot went to
                        // the closest — the wounded creep got healed back up while we
                        // spread damage. Fire on the weakest so it actually drops.
                        creep.rangedAttack(enemyCreepsInRange[0]);
                        creep.room.roomTowersAttackEnemy(enemyCreepsInRange[0]);
                    }
                    else {
                        // could add more random targetting and random hitting from towers to get some creeps low hits to blast them down but this will do for now.
                        // add more complexity as needed.
                        let randomTarget = enemyCreepsInRange[Math.floor(Math.random() * enemyCreepsInRange.length)];
                        creep.rangedAttack(randomTarget);
                        creep.room.roomTowersAttackEnemy(randomTarget);
                    }
                }
                else {
                    creep.rangedAttack(closestEnemyCreep);
                }
            }

            let rampart:any = Game.getObjectById(creep.memory.myRampartToMan);

            if(rampart) {
                if(!creep.pos.isEqualTo(rampart)) {
                    // The RRD cost matrix paints a 255 ring at range 11-13
                    // from storage, which is exactly where min-cut shells
                    // sit. interiorMove reaches the seat; the old mover is
                    // only the fail-open fallback.
                    if (!interiorMove(creep, rampart, 0)) {
                        creep.moveToSafePositionToRepairRampart(rampart, 0);
                    }
                }
            }
        }
    }
    else {
        if(creep.memory.myRampartToMan) {
            delete creep.memory.myRampartToMan;
        }
        if(creep.ticksToLive < 50) {
            if(creep.memory.targetRoom) {
                creep.memory.homeRoom = creep.memory.targetRoom;
            }
            creep.recycle();
        }
    }
}

const roleRangedRampartDefender = {
    run,
};
export default roleRangedRampartDefender;
