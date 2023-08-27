const run = function (creep:any) {

    creep.memory.moving = false;

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0 && creep.room.memory.danger) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    if(creep.memory.again && !creep.memory.ttgh) {
        creep.memory.ttgh = 1500 - creep.ticksToLive;
    }
    if(creep.memory.again && creep.memory.ttgh && creep.ticksToLive === creep.memory.ttgh + 145) {
        global.SMDP(creep.memory.homeRoom, creep.memory.targetRoom);
    }

    if(creep.room.storage ) {
        if(creep.room.memory.danger && creep.pos.getRangeTo(creep.room.storage) > 12) {
            creep.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(creep.room.storage, 10)
        }
        else if(creep.room.memory.danger && creep.pos.getRangeTo(creep.room.storage) > 10) {
            creep.MoveCostMatrixRoadPrio(creep.room.storage, 10);
        }
        else if(!creep.room.memory.danger && creep.pos.getRangeTo(creep.room.storage) > 8) {
            creep.MoveCostMatrixRoadPrio(creep.room.storage, 8);
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



            if(!creep.memory.myRampartToMan || (creep.ticksToLive % 3 == 0 && enemyCreeps.length == 1 || creep.ticksToLive % 20 == 0 && enemyCreeps.length > 1)) {

                let roomRampartTarget:any = Game.getObjectById(creep.room.memory.rampartToMan);

                let rangeFromCreepToCreep;
                let rangeFromRampartToCreep;
                let storage = creep.room.storage;
                if(roomRampartTarget) {
                    let closestEnemyCreepToRoomRampart = roomRampartTarget.pos.findClosestByRange(enemyCreeps);
                    if(closestEnemyCreepToRoomRampart) {
                        rangeFromRampartToCreep = roomRampartTarget.pos.getRangeTo(closestEnemyCreepToRoomRampart);
                        rangeFromCreepToCreep = creep.pos.getRangeTo(closestEnemyCreep);
                    }
                }
                if(rangeFromCreepToCreep && rangeFromRampartToCreep) {
                    if (rangeFromCreepToCreep > rangeFromRampartToCreep && storage && (closestEnemyCreep.pos.getRangeTo(storage) === 11 || rangeFromCreepToCreep > 4)) {
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
                    creep.moveToSafePositionToRepairRampart(rampart, 0);
                }

            }
        }
    }
    else if(!creep.room.memory.danger && creep.ticksToLive < 50) {
        creep.recycle();
    }
}

const roleRampartDefender = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRampartDefender;
