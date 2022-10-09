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

        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);


        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            let isMelee = false;
            for(let part of closestEnemyCreep.body)
            if(part.type == ATTACK) {
                isMelee = true;
            }

            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.rangedAttack(closestEnemyCreep);
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }

            if(creep.rangedAttack(closestEnemyCreep) == 0 && isMelee) {
                if(creep.memory.homeRoom) {
                    return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
                }
                else {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }
            return;
        }

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


        else {
            if(Memory.tasks.wipeRooms.killCreeps.length > 0) {
                creep.memory.targetRoom = Memory.tasks.wipeRooms.killCreeps[0];
            }
        }
    }


    if(Game.time % 17 == 0 && creep.roadCheck()) {
        let roadlessLocation = creep.roadlessLocation(creep.pos);
        creep.moveTo(roadlessLocation);
    }

}

const roleRangedAttacker = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRangedAttacker;
