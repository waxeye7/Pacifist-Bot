/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {

    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    if(enemyCreeps.length > 0) {
        let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.attack(closestEnemyCreep);
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }

            if(creep.attack(closestEnemyCreep) == 0) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
            return;
        }

    else {
        creep.moveTo(13,46);
    }

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
    }
}


const roleAnnoy = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleAnnoy;
