const run = function (creep:Creep) {

    creep.memory.moving = false;

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    if(creep.room.memory.danger) {

        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            if(!creep.memory.myRampartToMan || creep.ticksToLive % 5 == 0) {
                let roomRampartTarget:any = Game.getObjectById(creep.room.memory.rampartToMan);

                let rangeFromCreepToCreep;
                let rangeFromRampartToCreep;
                if(roomRampartTarget) {
                    let closestEnemyCreepToRoomRampart = roomRampartTarget.pos.findClosestByRange(enemyCreeps);
                    if(closestEnemyCreepToRoomRampart) {
                        rangeFromRampartToCreep = roomRampartTarget.pos.getRangeTo(closestEnemyCreepToRoomRampart);
                        rangeFromCreepToCreep = creep.pos.getRangeTo(closestEnemyCreep);
                    }
                }
                if(rangeFromCreepToCreep && rangeFromRampartToCreep) {
                    if(rangeFromCreepToCreep > rangeFromRampartToCreep) {
                        creep.memory.myRampartToMan = creep.room.memory.rampartToMan;
                    }

                }
                else {
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
                        creep.rangedAttack(closestEnemyCreep);
                        creep.room.roomTowersAttackEnemy(closestEnemyCreep);
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
                    creep.moveToSafePositionToRepairRampart(rampart, 0);
                }
            }
        }
    }
}

const roleRangedRampartDefender = {
    run,
};
export default roleRangedRampartDefender;
