var roleDefender = {
    
    /** @param {Creep} creep **/
    run: function(creep) {

        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
            let rampartToMan = creep.room.memory.rampartToMan.id;
            
            let rampart = Game.getObjectById(rampartToMan);

            if(creep.rangedAttack(closestEnemyCreep) == 0) {
                creep.say("die meanie!")
                // return;
            }

            if(creep.pos != rampart.pos) { //and range to hostile is less than x
                creep.moveTo(rampart);
                return;
            }

        }
    }
};

module.exports = roleDefender;