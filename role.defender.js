var roleDefender = {
    
    /** @param {Creep} creep **/
    run: function(creep) {

        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
            let rampartToMan = creep.room.memory.rampartToMan;
            
            let rampart = Game.getObjectById(rampartToMan);

            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.rangedMassAttack();
                creep.say("die meanie!", true);
            }

            else if(creep.rangedAttack(closestEnemyCreep) == 0) {
                creep.say("die meanie!", true);
                // return;
            }


            if(rampart) {
                if(creep.pos && creep.pos != rampart.pos) { //and range to hostile is less than x
                    creep.moveTo(rampart);
                    return;
                }
            }

        }
        // else {
        //     creep.memory.role = "RangedAttacker";
        //     creep.memory.targetRoom = "E12S39";
        // }
    }
};

module.exports = roleDefender;