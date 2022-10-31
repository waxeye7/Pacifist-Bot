const run = function (creep) {
    if(creep.room.memory.danger) {
        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
            let rampartToMan = creep.room.memory.rampartToMan;

            let rampart:any = Game.getObjectById(rampartToMan);

            if(creep.body.length <= 3 || creep.body.length % 3 == 0) {
                let rampartDefenders = creep.room.find(FIND_MY_CREEPS, {filter: creep => creep.memory.role == "RampartDefender"});
                if(rampartDefenders.length >= 0) {
                    if(creep.pos.findInRange(enemyCreeps, 2).length > 1 && Game.time % 20 >10 && Game.time % 20 <=20) {
                        creep.rangedMassAttack();
                    }
                    else if(creep.pos.findInRange(enemyCreeps, 1).length > 0 && Game.time % 20 <10 && Game.time % 20 > 0) {
                        creep.rangedAttack(closestEnemyCreep);
                    }
                    else {
                        creep.rangedAttack(closestEnemyCreep);
                    }
                    if(rampart) {
                        if(creep.pos.lookFor(LOOK_STRUCTURES).length == 0 || creep.pos.lookFor(LOOK_STRUCTURES).length == 1 && creep.pos.lookFor(LOOK_STRUCTURES)[0].structureType == STRUCTURE_ROAD) {
                            creep.moveTo(rampart);
                        }
                        else {
                            let structuresHere = creep.pos.lookFor(LOOK_STRUCTURES);
                            if(structuresHere.length == 0 || (structuresHere.length == 1 && structuresHere[0].structureType == STRUCTURE_ROAD) || (structuresHere.length == 1 && structuresHere[0].structureType == STRUCTURE_CONTAINER) || (rampart && creep.pos.isNearTo(rampart) && Game.time % 6 == 0)) {
                                creep.moveTo(rampart);
                            }
                        }
                    }
                }
                else {
                    if(Game.time % 100 == 0) {
                        creep.memory.suicide = true;
                    }
                    if(creep.memory.suicide) {
                        creep.recycle();
                    }
                }
                return;
            }

            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.rangedMassAttack();
                if(rampart && creep.pos.isNearTo(rampart) || Game.time % 5 ==0) {
                    creep.moveTo(creep.room.terminal);
                }
                return;
            }
            else if(creep.room.memory.attack_target) {
                let target = creep.room.memory.attack_target
                if(target && creep.rangedAttack(target) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target);
                    return;
                }
                else {
                    creep.rangedAttack(closestEnemyCreep)
                }
            }

            if(rampart) {
                if(creep.pos.lookFor(LOOK_STRUCTURES).length == 0 || creep.pos.lookFor(LOOK_STRUCTURES).length == 1 && creep.pos.lookFor(LOOK_STRUCTURES)[0].structureType == STRUCTURE_ROAD) {
                    creep.moveTo(rampart);
                    return;
                }
                else if(creep.pos && creep.pos != rampart.pos && rampart.pos.lookFor(LOOK_CREEPS).length == 1 && enemyCreeps.length == 2 && creep.pos.getRangeTo(closestEnemyCreep) < rampart.pos.getRangeTo(closestEnemyCreep)) {
                    creep.moveTo(closestEnemyCreep);
                }
                else {
                    creep.moveTo(creep.room.terminal);
                }
            }

        }
    }

    else {
        if(creep.memory.suicide == true) {
            creep.recycle();
        }
        if(Game.time % 100 == 0) {
            creep.memory.suicide = true;
        }
    }
    // else {
    //     creep.memory.role = "RangedAttacker";
    // }
    // else {
    //     creep.memory.role = "RangedAttacker";
    //     creep.memory.targetRoom = "E12S39";
    // }
}

const roleDefender = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleDefender;
