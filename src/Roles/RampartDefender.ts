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



            if(!creep.memory.myRampartToMan || (creep.ticksToLive % 3 == 0 && enemyCreeps.length == 1 || creep.ticksToLive % 20 == 0 && enemyCreeps.length > 1)) {

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
                            if(Game.time % 10 == 1) {
                                creep.say("God", true);
                            }
                            if(Game.time % 10 == 2) {
                                creep.say("Save", true);
                            }
                            if(Game.time % 10 == 3) {
                                creep.say("Us", true);
                            }
                            if(Game.time % 10 == 4) {
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
                    creep.moveToSafePositionToRepairRampart(rampart, 0);
                }

            }
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
