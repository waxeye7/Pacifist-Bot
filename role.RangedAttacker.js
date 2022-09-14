/**
 * A little description of this function 
 * @param {Creep} creep
 **/
// const run = function (creep) {
//     creep.harvestEnergy();
// }

const run = function (creep) {
    if(creep.notifyWhenAttacked == true) {
        creep.notifyWhenAttacked(false);
    }
    if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
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
        
        return creep.moveToRoom(creep.memory.targetRoom);
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
        let Structures;
        let Structures2;

        if(creep.room.controller && creep.room.controller.my) {
            Structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
                filter: object => object.structureType != STRUCTURE_CONTROLLER && object.structureType != STRUCTURE_ROAD && object.structureType != STRUCTURE_WALL && object.structureType != STRUCTURE_CONTAINER &&  !object.my
            });
        }
        else {
            Structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
                filter: object => object.structureType != STRUCTURE_CONTROLLER});
            // Structures2 = creep.room.find(FIND_STRUCTURES, {
            //     filter: object => object.structureType != STRUCTURE_CONTROLLER && object.structureType != STRUCTURE_WALL && object.structureType != STRUCTURE_ROAD && !object.my
            // });
        }


        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.rangedAttack(closestEnemyCreep);
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }

            if(creep.rangedAttack(closestEnemyCreep) == 0) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
            return;
        }

        if(Structures.length > 0) {
            let closestStructure = creep.pos.findClosestByRange(Structures);
            if(creep.pos.isNearTo(closestStructure)) {
                creep.rangedAttack(closestStructure);
                
            }
            else{
                creep.moveTo(closestStructure);
            }
        }

        // if(Structures2.length > 0) {
        //     let closestStructure = creep.pos.findClosestByRange(Structures2);
        //     if(creep.pos.isNearTo(closestStructure)) {
        //         creep.attack(closestStructure);
                
        //     }
        //     else{
        //         creep.moveTo(closestStructure);
        //     }
        // }


        
        else {
            creep.memory.targetRoom = creep.memory.targetRoom2;
            if(creep.memory.targetRoom == creep.memory.targetRoom2) {
                delete creep.memory.targetRoom2
            }
            else if(creep.memory.targetRoom == undefined) {
                delete creep.memory.targetRoom
                creep.suicide();
            }
        }
    }
}

const roleRangedAttacker = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleRangedAttacker;