const run = function (creep:Creep) {

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

            if(!creep.memory.myRampartToMan || creep.ticksToLive % 80 == 0) {
                creep.memory.myRampartToMan = creep.room.memory.rampartToMan;
            }
            let rampartToMan = creep.memory.myRampartToMan;

            let rampart:any = Game.getObjectById(rampartToMan);

            if(creep.pos.isNearTo(closestEnemyCreep)) {
                // return if under rampart and attacking - otherwise creep can keep moving
                let LookStructures = creep.pos.lookFor(LOOK_STRUCTURES);
                if(LookStructures.length > 0) {
                    for(let building of LookStructures) {
                        if(building.structureType == STRUCTURE_RAMPART) {
                            creep.attack(closestEnemyCreep);
                            creep.room.memory.attack_target = closestEnemyCreep.id;

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

                            if(rampart && creep.pos.isNearTo(rampart) && !creep.pos.isEqualTo(rampart) && Game.time % 10 == 1) {

                                creep.moveTo(rampart);

                            }
                            if(creep.attack(closestEnemyCreep) == 0) {
                                return;
                            }
                        }
                    }
                }
            }


            if(rampart) {

                // if(creep.pos.getRangeTo(rampart) <= 12 && creep.pos.getRangeTo(rampart) > 4) {
                //     creep.moveTo(16,41, {reusePath: 0});
                //     return;
                // }

                let lookForStructuresHere = creep.pos.lookFor(LOOK_STRUCTURES);
                if(lookForStructuresHere.length == 0 ||
                    lookForStructuresHere.length == 1 && lookForStructuresHere[0].structureType == STRUCTURE_ROAD ||
                    lookForStructuresHere.length == 2 && lookForStructuresHere[0].structureType == STRUCTURE_ROAD && lookForStructuresHere[1].structureType == STRUCTURE_CONTAINER ||
                    lookForStructuresHere.length == 2 && lookForStructuresHere[1].structureType == STRUCTURE_ROAD && lookForStructuresHere[0].structureType == STRUCTURE_CONTAINER) {
                    if(creep.pos.getRangeTo(rampart) > 3) {
                        creep.MoveCostMatrixRoadPrio(rampart, 0);
                    }
                    else {
                        creep.moveTo(rampart);
                    }
                    creep.attack(closestEnemyCreep);
                    return;
                }

                // if(creep.pos.getRangeTo(creep.room.terminal) > rampart.pos.getRangeTo(creep.room.terminal)) {
                //     creep.moveTo(rampart);
                // }

                // if(creep.pos && creep.pos != rampart.pos && creep.pos.getRangeTo(closestEnemyCreep) >= creep.pos.getRangeTo(rampart)) {
                //     creep.moveTo(rampart);
                // }
                // else if(creep.pos && creep.pos != rampart.pos && creep.pos.getRangeTo(closestEnemyCreep) < creep.pos.getRangeTo(rampart)) {
                //     let LookStructures = creep.pos.lookFor(LOOK_STRUCTURES);
                //     if(LookStructures.length > 0) {
                //         for(let building of LookStructures) {
                //             if(building.structureType == STRUCTURE_RAMPART && creep.pos.getRangeTo(closestEnemyCreep) <= 1) {
                //                 return;
                //             }
                //         }
                //     }
                //     // if()
                //     creep.moveTo(closestEnemyCreep);
                // }

                // && rampart.pos.lookFor(LOOK_CREEPS).length == 1
                else if(creep.pos && creep.pos != rampart.pos && enemyCreeps.length <= 1 && creep.pos.getRangeTo(closestEnemyCreep) <= 2 && creep.hits == 5000) {
                    creep.moveTo(closestEnemyCreep);
                    creep.attack(closestEnemyCreep);
                    return;
                }
                else {
                    if(lookForStructuresHere.length == 0 ||
                        (lookForStructuresHere.length == 1 && lookForStructuresHere[0].structureType == STRUCTURE_ROAD) ||
                         lookForStructuresHere.length == 2 && lookForStructuresHere[1].structureType == STRUCTURE_ROAD && lookForStructuresHere[0].structureType == STRUCTURE_CONTAINER ||
                          lookForStructuresHere.length == 2 && lookForStructuresHere[0].structureType == STRUCTURE_ROAD && lookForStructuresHere[1].structureType == STRUCTURE_CONTAINER ||
                          (rampart && creep.pos.isNearTo(rampart) && Game.time % 5 == 0) || (rampart && creep.pos.getRangeTo(rampart) == 2 && Game.time % 21 == 0)) {
                        if(creep.pos.isNearTo(rampart)){
                            creep.moveTo(rampart);
                        }
                        else {
                            creep.MoveCostMatrixRoadPrio(creep.room.terminal, 1)
                        }
                    }
                    creep.attack(closestEnemyCreep);
                    // else if(creep.pos.getRangeTo(rampart) == 2) {
                    //     if(creep.room.terminal) {
                    //         creep.moveTo(creep.room.terminal);
                    //     }
                    // }
                }
            }
        }
    }
    // else if(creep.body.length > 40 && creep.body[24].boost != undefined) {
    //     let boostLabID = creep.room.memory.labs[0]
    //     let boostLab:any = Game.getObjectById(boostLabID);
    //     if(boostLab) {
    //         creep.moveTo(boostLab)
    //     }
    // }
    // else if(Game.time % 500 == 0) {
    //     creep.memory.suicide = true;
    //     creep.room.memory.in_position = false;
    // }

    // if(creep.memory.suicide == true) {
    //     creep.recycle();
    //      return;
    // }
}

const roleRampartDefender = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRampartDefender;
