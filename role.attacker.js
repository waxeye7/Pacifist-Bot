var roleAttacker = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if(creep.room.name == "E12S39") {
            let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

            if(enemyCreeps.length > 0) {
                let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

                if(creep.attack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
                if(creep.attack(closestEnemyCreep) == 0) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            else {
                creep.moveTo(47,0);
            }
        }
        else if(creep.room.name == "E12S38") {
            let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

            if(enemyCreeps.length > 0) {
                let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

                if(creep.attack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
                if(creep.attack(closestEnemyCreep) == 0) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            else {
                creep.moveTo(21,0);
            }
        }
        else if(creep.room.name == "E12S37") {

            // const Walls = creep.room.find(FIND_STRUCTURES, {
            //     filter: object => object.structureType == STRUCTURE_WALL
            // });

            // if(Walls.length > 0) {
            //     let closestWall = creep.pos.findClosestByRange(Walls);
            //     if(creep.attack(closestWall) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(closestWall);
            //         return;
            //     }
            //     if(creep.attack(closestWall) == 0) {
            //         return;
            //     }
            // }


            // let thisWall = Game.getObjectById('62fb56e4d46b30709b2bece1');
            // if(thisWall) {
            //     if(creep.attack(thisWall) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(thisWall);
            //         return;
            //     }
            //     if(creep.attack(thisWall) == 0) {
            //         return;
            //     }
            // }

            // let thisTower = Game.getObjectById('62faf18692e42b518cf56395');
            // if(thisTower) {
            //     if(creep.attack(thisTower) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(thisTower);
            //         return;
            //     }
            //     if(creep.attack(thisTower) == 0) {
            //         return;
            //     }
            // }

            let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

            if(enemyCreeps.length > 0) {
                let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

                if(creep.attack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
                if(creep.attack(closestEnemyCreep) == 0) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            let Structures = creep.room.find(FIND_STRUCTURES, {
                filter: object => object.structureType != STRUCTURE_WALL && object.structureType != STRUCTURE_CONTROLLER
            });
            // let Structures = creep.room.find(FIND_STRUCTURES);
            if(Structures.length > 0) {
                let closestStructure = creep.pos.findClosestByRange(Structures);
                if(creep.attack(closestStructure) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestStructure);
                    return;
                }
                if(creep.attack(closestStructure) == 0) {
                    return;
                }
            }
            // else {
            //     let thisController = Game.getObjectById('5bbcada69099fc012e63793a');
            //     if(creep.attackController(thisController) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(thisController);
            //         return;
            //     }
            //     if(creep.attackController(thisController) == 0) {
            //         return;
            //     }
            // }
            creep.moveTo(49,26);
        }
        else if(creep.room.name == "E13S37") {
            let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

            if(enemyCreeps.length > 0) {
                let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

                if(creep.attack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
                if(creep.attack(closestEnemyCreep) == 0) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            else {
                creep.moveTo(11,0);
            }
        }


        else if(creep.room.name == "E13S36") {
            let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

            if(enemyCreeps.length > 0) {
                let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

                if(creep.attack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
                if(creep.attack(closestEnemyCreep) == 0) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            else {
                creep.moveTo(29,0);
            }
        }

        else if(creep.room.name == "E13S35") {
            let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

            if(enemyCreeps.length > 0) {
                let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

                if(creep.attack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
                if(creep.attack(closestEnemyCreep) == 0) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            else {
                creep.moveTo(49,27);
            }
        }
        

        else if(creep.room.name == "E14S35") {
            let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
            let Structures = creep.room.find(FIND_STRUCTURES, {
                filter: object => object.structureType != STRUCTURE_WALL && object.structureType != STRUCTURE_CONTROLLER
            });

            if(enemyCreeps.length > 0) {
                let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

                if(creep.attack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
                if(creep.attack(closestEnemyCreep) == 0) {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            if(Structures.length > 0) {
                let closestStructure = creep.pos.findClosestByRange(Structures);
                if(creep.attack(closestStructure) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestStructure);
                    return;
                }
                if(creep.attack(closestStructure) == 0) {
                    return;
                }
            }
            else {
                creep.moveTo(25,20);
            }
        }
	}
};

module.exports = roleAttacker;