const run = function (creep:Creep) {
    if(creep.room.memory.danger) {
        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
            let rampartToMan = creep.room.memory.rampartToMan;

            let rampart:any = Game.getObjectById(rampartToMan);

            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.attack(closestEnemyCreep);
            }

            if(rampart) {
                if(creep.pos && creep.pos != rampart.pos) {
                    creep.moveTo(rampart);
                    return;
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
