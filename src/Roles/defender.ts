const run = function (creep) {
    if(creep.room.memory.danger) {
        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
            let rampartToMan = creep.room.memory.rampartToMan;

            let rampart:any = Game.getObjectById(rampartToMan);

            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.rangedMassAttack();
                if(Game.time % 10 == 0) {
                    creep.say("🏳️", true);
                }
            }

            else if(creep.rangedAttack(closestEnemyCreep) == 0) {
                if(Game.time % 10 == 0) {
                    creep.say("🏳️", true);
                }
            }


            if(rampart) {
                if(creep.pos && creep.pos != rampart.pos) { //and range to hostile is less than x
                    creep.moveTo(rampart);
                    return;
                }
            }

        }
    }

    else {
        creep.memory.role = "RangedAttacker";
    }
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
