/**
 * A little description of this function 
 * @param {Creep} creep
 **/
// const run = function (creep) {
//     creep.harvestEnergy();
// }

const run = function (creep) {
    if(creep.room.name != creep.memory.targetRoom) {
        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
        // let road = Game.getObjectById("630c5701d149a23ed600dd3d");
        // if(road){
        //     if(creep.attack(road) == ERR_NOT_IN_RANGE) {
        //         creep.moveTo(road);
        //     }
        //     return;
        // }
        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            if(creep.rangedAttack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
            if(creep.rangedAttack(closestEnemyCreep) == 0) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
        }
        
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
    }
    else {
        // let road = Game.getObjectById("630c5701d149a23ed600dd3d");
        // if(road){
        //     if(creep.attack(road) == ERR_NOT_IN_RANGE) {
        //         creep.moveTo(road);
        //     }
        //     return;
        // }
        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        let Structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
            filter: object => object.structureType != STRUCTURE_CONTROLLER && object.structureType != STRUCTURE_ROAD && object.structureType != STRUCTURE_WALL
        });

        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            if(creep.rangedAttack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
            if(creep.rangedAttack(closestEnemyCreep) == 0) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
        }

        else if(Structures.length > 0) {
            let closestStructure = creep.pos.findClosestByRange(Structures);
            if(creep.pos.isNearTo(closestStructure)) {
                creep.rangedAttack(closestStructure)
            }
            else{
                creep.moveTo(closestStructure);
            }
        }
        
        // else {
        //     creep.memory.targetRoom = creep.memory.targetRoom2;
        //     if(creep.memory.targetRoom == creep.memory.targetRoom2) {
        //         delete creep.memory.targetRoom2
        //     }
        //     else if(creep.memory.targetRoom == undefined) {
        //         delete creep.memory.targetRoom
        //         creep.suicide();
        //     }
        // }
    }
}

const roleRangedAttacker = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleRangedAttacker;